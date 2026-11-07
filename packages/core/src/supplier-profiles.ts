import {SupplierNative} from './supplier-native.ts';
import {SUPPLIER_MEASUREMENT_KEYS,SUPPLIER_MEASUREMENT_VALUES} from './supplier-native-contract.ts';
import {encryptDraftPayload,decryptDraftPayload} from './private-draft-payload.ts';
import {SupplierProfessional} from './supplier-professional.ts';
import {catalogView,publishedCatalog,ensureBuiltinCatalog} from './supplier-field-catalog.ts';
import {documentActive} from './supplier-document-contract.ts';
import type {Clock,Config,Person,Source,TableMap} from './model.ts';
import type {TalentActor} from './talent-auth-model.ts';
import type {TalentSubmission,TalentAccessGrant,Exposure,TalentSubmissionItem} from './talent-maintenance-model.ts';
import type {Tx} from './store.ts';
import {TalentMaintenance} from './talent-maintenance.ts';
import {TalentV2} from './talent-v2.ts';
import {PROFILE_DEFAULTS,ROLE_DEFAULTS,ageRange} from './talent-demographics.ts';
import {base,touch,cas,workspaceRow} from './helpers.ts';
import {encryptContact,decryptContact} from './crypto.ts';
import {digest,parseStrictJson} from './json.ts';
import {invariant,missing,AppError} from './errors.ts';
import {checkSubmissionMedia,adoptSubmissionMedia,syncMediaRetention} from './media-adoption.ts';
import {validateWorkDraft,workPlanSchema,workExposure} from './talent-work-cases.ts';
import {applySupplierWork} from './supplier-work-cases.ts';
import {mediaExposure} from './talent-media-exposure.ts';
import {sourceCurrent,deletionBlocked} from './policy.ts';
import {requireExposureBasis} from './talent-exposure-basis.ts';
import {appendSourceHistory} from './source-history.ts';
import {MAINTENANCE_VERSION,CONSENT_VERSION,TEXT_FIELDS} from './talent-maintenance-schema.ts';
import {SUPPLIER_PROFILE_VERSION,SUPPLIER_CONSENT_VERSION,SUPPLIER_FIELD_SCOPE,
 SupplierProfileSchemas as S,validateSupplierProfile,emptySupplierProfile,type SupplierProfile} from './supplier-profile-schema.ts';
import {rowDefaults,TD2_FACTS,type FactTable} from './talent-v2-schema.ts';

const supportedFacts={personRoles:'roleCodes',talentLocations:'locationCodes',personLanguages:'languageCodes',personCapabilities:'skillCodes'} as const;
const codeFields={personRoles:'roleCode',talentLocations:'locationCode',personLanguages:'languageCode',personCapabilities:'capabilityCode'} as const;

/** The portal's profile command owns authorization. Stored facts still use the
 * existing personnel domain; encrypted drafts are never a parallel people table. */
export class SupplierProfiles {
 readonly maintenance:TalentMaintenance;
 readonly clock:Clock;readonly config:Config;
 constructor(clock:Clock,config:Config){this.clock=clock;this.config=config;this.maintenance=new TalentMaintenance(clock,config);}
 async schema(tx:Tx,actor:TalentActor){
  await this.maintenance.account(tx,actor.workspaceId,actor.talentAccountId);
  const dictionary=await tx.find('dictionary',{workspaceId:actor.workspaceId,status:'ACTIVE'});
  const capabilities=await tx.find('capabilityDefinitions',{workspaceId:actor.workspaceId,status:'ACTIVE'});
  return {schemaVersion:SUPPLIER_PROFILE_VERSION,consentTextVersion:SUPPLIER_CONSENT_VERSION,
   roles:dictionary.filter(d=>d.namespace==='role').map(d=>({code:d.code,label:d.labelZh})),
   locations:dictionary.filter(d=>d.namespace==='city').map(d=>({code:d.code,label:d.labelZh})),
   languages:dictionary.filter(d=>d.namespace==='language').map(d=>({code:d.code,label:d.labelZh})),
   skills:capabilities.map(c=>({code:c.code,label:c.labelZh,applicableRoleCodes:c.applicableRoleCodes,levelSchemeCode:c.levelSchemeCode})),fieldCatalog:catalogView(await publishedCatalog(tx,actor.workspaceId)),confirmation:'SELF_CONFIRMED_DIRECTLY'};
 }
 async access(tx:Tx,actor:TalentActor,id:string,write=false){
  const s=await this.maintenance.submissionAccess(tx,actor,id,write);
  invariant(s.schemaVersion===SUPPLIER_PROFILE_VERSION,'SUPPLIER_DRAFT_REQUIRED','请选择完整资料草稿',409);
  return s;
 }
 context(s:TalentSubmission){return `supplier-profile:${s.workspaceId}:${s.talentAccountId}:${s.id}`;}
 async item(tx:Tx,s:TalentSubmission){
  const rows=await tx.find('talentSubmissionItems',{workspaceId:s.workspaceId,submissionId:s.id,kind:'SUPPLIER_PROFILE'});
  invariant(rows.length===1&&!rows[0]!.values.erased,'SUPPLIER_DRAFT_UNAVAILABLE','资料草稿已不可用',409);return rows[0]!;
 }
 decode(s:TalentSubmission,item:TalentSubmissionItem){
  invariant(typeof item.values.ciphertext==='string','SUPPLIER_DRAFT_UNAVAILABLE','资料草稿已不可用',409);
  return validateSupplierProfile(parseStrictJson(decryptDraftPayload(item.values.ciphertext,this.config.contactKey,this.context(s))));
 }
 async read(tx:Tx,actor:TalentActor,id:string){
  const s=await this.access(tx,actor,id),item=await this.item(tx,s);
  const profile=this.decode(s,item);
  return {id:s.id,revision:s.revision,personId:s.personId,grantId:s.grantId,claimId:s.claimId,state:s.state,
   expiresAt:s.expiresAt,profile,fieldCatalog:catalogView(await publishedCatalog(tx,actor.workspaceId,profile.professional?.catalogVersion)),confirmationKind:s.confirmedByTalentId?'SELF':null,
   ...await this.materials(tx,s)};
 }
 async materials(tx:Tx,s:TalentSubmission){const dto=await this.maintenance.submissionDto(tx,s);return {media:dto.media,consent:dto.consent,items:dto.items.filter(i=>i.kind==='WORK')};}
 async list(tx:Tx,actor:TalentActor){
  await this.maintenance.account(tx,actor.workspaceId,actor.talentAccountId);
  const rows=await tx.find('talentSubmissions',{workspaceId:actor.workspaceId,talentAccountId:actor.talentAccountId,schemaVersion:SUPPLIER_PROFILE_VERSION});
  return {items:rows.filter(s=>Date.parse(s.expiresAt)>this.clock.now().getTime()).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,100)
   .map(s=>({id:s.id,revision:s.revision,state:s.state,personId:s.personId,updatedAt:s.updatedAt}))};
 }
 async validateCodes(tx:Tx,actor:TalentActor,p:SupplierProfile){
  const schema=await this.schema(tx,actor);
  for(const [field,options] of [['roleCodes',schema.roles],['locationCodes',schema.locations],['languageCodes',schema.languages],['skillCodes',schema.skills]] as const)
   invariant(p[field].every(code=>options.some(o=>o.code===code)),'SUPPLIER_CODE_INVALID','资料包含未收录或停用的选项',422);
 }
 async create(tx:Tx,actor:TalentActor,input:unknown){
  const d=S.create.parse(input),profile=validateSupplierProfile(d.profile);
  invariant(d.consentAccepted,'CONSENT_REQUIRED','请同意资料用于ONCE内部供应商库',422);
  await this.validateCodes(tx,actor,profile);
  const original=await this.maintenance.createDraft(tx,actor,{schemaVersion:MAINTENANCE_VERSION,claimId:d.claimId,grantId:d.grantId,
   consentTextVersion:CONSENT_VERSION,consentAccepted:true,items:[]});
  const s={...touch(original,this.clock),schemaVersion:SUPPLIER_PROFILE_VERSION};
  const consent=(await tx.get('talentConsents',s.consentId))!;
  await tx.replace('talentConsents',{...touch(consent,this.clock),textVersion:SUPPLIER_CONSENT_VERSION,fieldScope:[...SUPPLIER_FIELD_SCOPE]});
  await tx.replace('talentSubmissions',s);
  const person=s.personId?await this.maintenance.person(tx,s.workspaceId,s.personId):null;
  const previous=person&&s.grantId?(await this.profile(tx,actor,person.id)).profile:undefined;
  for(const key of ['capabilityDetails','credentials','translation'] as const)if(profile[key]===undefined&&previous?.[key]!==undefined)Object.assign(profile,{[key]:previous[key]});
  if(profile.roleCodes.includes('model')&&previous)for(const key of SUPPLIER_MEASUREMENT_KEYS)if(profile.measurements[key]===undefined&&previous.measurements[key]!==undefined)Object.assign(profile.measurements,{[key]:previous.measurements[key]});

  await new SupplierNative(this.clock,this.config).validate(tx,actor,profile,previous);
  if(profile.professional){await ensureBuiltinCatalog(tx,actor.workspaceId,this.clock);const grant=s.grantId?(await tx.get('talentAccessGrants',s.grantId))!:null;
   const professional=new SupplierProfessional(this.clock,this.config);profile.professional=await professional.validate(tx,actor.workspaceId,profile.roleCodes,profile.professional,person&&grant?await professional.self(tx,actor,person.id,grant):undefined);}
  await tx.insert('talentSubmissionItems',{...base(actor.workspaceId,this.clock),submissionId:s.id,clientItemKey:'supplier-profile',kind:'SUPPLIER_PROFILE',
   targetId:person?.id??null,values:{ciphertext:encryptDraftPayload(JSON.stringify(profile),this.config.contactKey,this.context(s))},
   baseline:person?{personRevision:person.revision,protectionEpoch:person.protectionEpoch}:{},dependencyGroup:'supplier-profile',dependsOn:[],state:'PENDING',appliedId:null});
  return s;
 }
 async save(tx:Tx,actor:TalentActor,id:string,input:unknown){
  const d=S.save.parse(input),s=await this.access(tx,actor,id,true);cas(s,d.expectedRevision);
  invariant(s.state==='DRAFT','SUPPLIER_DRAFT_CLOSED','请新建草稿修改已保存资料',409);
  const profile=validateSupplierProfile(d.profile);await this.validateCodes(tx,actor,profile);
  const item=await this.item(tx,s),previous=this.decode(s,item);
  if(!profile.professional&&previous.professional)profile.professional=previous.professional;
  for(const key of ['capabilityDetails','credentials','translation'] as const)if(profile[key]===undefined&&previous[key]!==undefined)Object.assign(profile,{[key]:previous[key]});
  if(profile.roleCodes.includes('model'))for(const key of SUPPLIER_MEASUREMENT_KEYS)if(profile.measurements[key]===undefined&&previous.measurements[key]!==undefined)Object.assign(profile.measurements,{[key]:previous.measurements[key]});
  await new SupplierNative(this.clock,this.config).validate(tx,actor,profile,previous);
  if(profile.professional)profile.professional=await new SupplierProfessional(this.clock,this.config).validate(tx,actor.workspaceId,profile.roleCodes,profile.professional,previous.professional);
  await tx.replace('talentSubmissionItems',{...touch(item,this.clock),values:{ciphertext:encryptDraftPayload(JSON.stringify(profile),this.config.contactKey,this.context(s))}});
  const next={...touch(s,this.clock),expiresAt:this.maintenance.until(this.maintenance.retention.draft)};await tx.replace('talentSubmissions',next);await syncMediaRetention(tx,next,this.clock);return next;
 }
 async sourceForSelf(tx:Tx,actor:TalentActor,id:string){
  const source=await workspaceRow(tx,'sources',id,actor.workspaceId);
  if(!source||!sourceCurrent(source,this.clock)||await deletionBlocked(tx,actor.workspaceId,'SOURCE',id))missing();
  try{await requireExposureBasis(tx,source,this.clock);}catch(e){if(e instanceof AppError&&e.status===404)return null;throw e;}return source;
 }
 async rebase(tx:Tx,actor:TalentActor,id:string,input:unknown){
  const d=S.rebase.parse(input),s=await this.access(tx,actor,id,true);cas(s,d.expectedRevision);
  invariant(s.state==='DRAFT'&&s.personId&&d.conflictsAcknowledged,'SUPPLIER_REBASE_REQUIRED','请先核对当前资料并明确选择保留内容',409);
  const person=await this.maintenance.person(tx,s.workspaceId,s.personId);cas(person,d.expectedPersonRevision);
  const profile=validateSupplierProfile(d.profile);await this.validateCodes(tx,actor,profile);
  const item=await this.item(tx,s);
  const previous=this.decode(s,item);if(!profile.professional&&previous.professional)profile.professional=previous.professional;
  for(const key of ['capabilityDetails','credentials','translation'] as const)if(profile[key]===undefined&&previous[key]!==undefined)Object.assign(profile,{[key]:previous[key]});
  if(profile.roleCodes.includes('model'))for(const key of SUPPLIER_MEASUREMENT_KEYS)if(profile.measurements[key]===undefined&&previous.measurements[key]!==undefined)Object.assign(profile.measurements,{[key]:previous.measurements[key]});
  await new SupplierNative(this.clock,this.config).validate(tx,actor,profile,previous);
  if(profile.professional)profile.professional=await new SupplierProfessional(this.clock,this.config).validate(tx,actor.workspaceId,profile.roleCodes,profile.professional,previous.professional);
  await tx.replace('talentSubmissionItems',{...touch(item,this.clock),values:{ciphertext:encryptDraftPayload(JSON.stringify(profile),this.config.contactKey,this.context(s))},
   baseline:{personRevision:person.revision,protectionEpoch:person.protectionEpoch}});
  const next={...touch(s,this.clock),expiresAt:this.maintenance.until(this.maintenance.retention.draft)};await tx.replace('talentSubmissions',next);await syncMediaRetention(tx,next,this.clock);return next;
 }
 async profile(tx:Tx,actor:TalentActor,personId:string){
  const g=(await tx.find('talentAccessGrants',{workspaceId:actor.workspaceId,talentAccountId:actor.talentAccountId,personId,state:'ACTIVE'}))[0];
  if(!g)missing();await this.maintenance.grant(tx,actor.workspaceId,actor.talentAccountId,g.id);
  const person=await this.maintenance.person(tx,actor.workspaceId,personId),profile=emptySupplierProfile();
  const basic=await this.maintenance.profile(tx,actor,personId);
  profile.displayName=typeof basic.fields.displayName==='string'?basic.fields.displayName:'';
  profile.aliases=Array.isArray(basic.fields.aliases)?basic.fields.aliases as string[]:[];
  profile.intro=typeof basic.fields.intro==='string'?basic.fields.intro:'';
  for(const e of g.selfExposureManifest){
   if(!Object.hasOwn(supportedFacts,e.kind))continue;
   const table=e.kind as keyof typeof supportedFacts,row=await tx.get(table,e.targetId);
   if(!row||row.personId!==personId||row.status!=='ACTIVE')continue;
   if(table==='personCapabilities'&&'personRoleId' in row&&row.personRoleId)continue;
   const field=codeFields[table],value=(row as unknown as Record<string,unknown>)[field];
   if(e.field!==field||e.valueDigest!==digest(value))continue;
   const source=await workspaceRow(tx,'sources',e.sourceId,actor.workspaceId);
   if(!source||source.revision!==e.sourceRevision||!sourceCurrent(source,this.clock)||await deletionBlocked(tx,actor.workspaceId,'SOURCE',source.id))continue;
   if(!await this.sourceForSelf(tx,actor,source.id))continue;
   if(typeof value==='string'&&!profile[supportedFacts[table]].includes(value))profile[supportedFacts[table]].push(value);
  }
  // Contacts are explicitly exposed as whole entries; their plaintext never enters
  // a grant manifest, command receipt or audit event.
  for(const e of g.selfExposureManifest.filter(e=>e.kind==='contact')){
   const c=await tx.get('contacts',e.targetId);if(!c||c.personId!==personId)continue;
   const source=await workspaceRow(tx,'sources',e.sourceId,actor.workspaceId);
   if(!source||source.revision!==e.sourceRevision||!sourceCurrent(source,this.clock)||await deletionBlocked(tx,actor.workspaceId,'SOURCE',source.id))continue;
   if(!await this.sourceForSelf(tx,actor,source.id))continue;
   const value=decryptContact(c.ciphertext,this.config.contactKey,`${actor.workspaceId}:${personId}:${c.id}`);
   if(e.valueDigest===digest({kind:c.kind,value}))profile.contacts.push({kind:c.kind,value});
  }
  const casting=(await tx.find('castingProfiles',{workspaceId:actor.workspaceId,personId})).find(c=>!c.supersededById);
  const measurement=casting?.currentMeasurementSetId?await tx.get('measurementSets',casting.currentMeasurementSetId):null;
  if(measurement)for(const e of g.selfExposureManifest.filter(e=>e.kind==='measurementSets'&&e.targetId===measurement.id)){
   if(!(SUPPLIER_MEASUREMENT_KEYS as readonly string[]).includes(e.field)||e.valueDigest!==digest((measurement as unknown as Record<string,unknown>)[e.field]??null))continue;
   const source=await workspaceRow(tx,'sources',e.sourceId,actor.workspaceId);
   if(source&&source.revision===e.sourceRevision&&sourceCurrent(source,this.clock)&&!await deletionBlocked(tx,actor.workspaceId,'SOURCE',source.id)){
    if(!await this.sourceForSelf(tx,actor,source.id))continue;Object.assign(profile.measurements,{[e.field]:(measurement as unknown as Record<string,unknown>)[e.field]??null});
   }
  }
  await new SupplierNative(this.clock,this.config).self(tx,g,profile);
  const professional=await new SupplierProfessional(this.clock,this.config).self(tx,actor,personId,g);if(professional)profile.professional={...professional,answers:professional.answers.filter(a=>!a.roleCode||profile.roleCodes.includes(a.roleCode))};
  return {personId,revision:person.revision,grantId:g.id,profile,fieldCatalog:catalogView(await publishedCatalog(tx,actor.workspaceId))};
 }
 async confirm(tx:Tx,actor:TalentActor,id:string,input:unknown){
  const d=S.confirm.parse(input),s=await this.access(tx,actor,id,true);cas(s,d.expectedRevision);
  invariant(d.accepted&&s.state==='DRAFT','SUPPLIER_CONFIRM_REQUIRED','请明确确认当前资料',409);
  const item=await this.item(tx,s),profile=validateSupplierProfile(this.decode(s,item),true);await this.validateCodes(tx,actor,profile);
  if(profile.professional)profile.professional=await new SupplierProfessional(this.clock,this.config).validate(tx,actor.workspaceId,profile.roleCodes,profile.professional,profile.professional);
  await new SupplierNative(this.clock,this.config).validate(tx,actor,profile,profile);
  const items=await tx.find('talentSubmissionItems',{workspaceId:actor.workspaceId,submissionId:s.id});
  invariant(items.every(i=>i.id===item.id||i.kind==='MEDIA'||i.kind==='WORK'||i.kind==='DOCUMENT_PARSE'&&!documentActive(i.state)),'SUPPLIER_MEDIA_CONFIRM_PENDING','请完成材料与作品核对，或停止未完成的整份解析后再确认',409);
  await checkSubmissionMedia(tx,s,this.clock,this.config);
  const works=items.filter(i=>i.kind==='WORK');
  for(const work of works){const plan=workPlanSchema.parse(work.values);invariant(plan.mode==='CREATE_EXTERNAL_WORK'&&!plan.targetWorkId,'SUPPLIER_NEW_WORK_REQUIRED','关联已有共同作品请由 ONCE 整理',409);await validateWorkDraft(tx,s,plan,this.clock,this.config,work.baseline);const roleCode=plan.declaredRoleCode??(await tx.get('personRoles',plan.personRoleId!))?.roleCode;invariant(roleCode&&profile.roleCodes.includes(roleCode),'WORK_ROLE_REQUIRED','请在基础资料中保留作品对应职业',422);}
  const consent=(await tx.get('talentConsents',s.consentId))!;
  invariant(consent.state==='ACTIVE'&&consent.textVersion===SUPPLIER_CONSENT_VERSION&&Date.parse(consent.validUntil)>this.clock.now().getTime(),
   'CONSENT_REQUIRED','本次资料使用同意已失效',409);
  let person:Person|null=s.personId?await this.maintenance.person(tx,s.workspaceId,s.personId):null;
  let grant:TalentAccessGrant|null=s.grantId?await this.maintenance.grant(tx,s.workspaceId,s.talentAccountId,s.grantId):null;
  const claim=person?null:await this.maintenance.ownClaim(tx,actor,s.claimId!,true);
  if(claim)invariant(claim.kind==='ENROLL'&&claim.relation==='SELF'&&claim.adultDeclared,
   'SELF_ENROLL_REQUIRED','本人首次建档需要有效加入邀请及本人声明',409);
  if(grant)invariant(grant.relation==='SELF','SELF_MAINTENANCE_REQUIRED','此入口用于本人维护资料',409);
  if(person){
   invariant(item.baseline.personRevision===person.revision&&item.baseline.protectionEpoch===person.protectionEpoch,
    'SUPPLIER_PROFILE_CONFLICT','ONCE或其他设备已更新资料，请核对当前资料后重新保存',409);
   for(const p of await tx.find('talentProfiles',{workspaceId:actor.workspaceId,personId:person.id})){
    const age=ageRange(p as unknown as Record<string,unknown>,this.clock.now().toISOString().slice(0,10));
    invariant(!age||age.min>=18,'GUARDIAN_REQUIRED','此档案需要监护授权',409);
   }
  }
  const invitation=claim?(await tx.get('talentInvitations',claim.invitationId))!:null;
  const maintainerId=person?.maintainerId??invitation!.maintainerId;
  const maintainer=await workspaceRow(tx,'memberships',maintainerId,actor.workspaceId);
  invariant(maintainer?.status==='ACTIVE','SUPPLIER_MAINTAINER_UNAVAILABLE','当前资料维护人不可用，请联系ONCE',409);
  if(invitation)await this.maintenance.recipient(tx,invitation,actor.talentAccountId);
  if(!person)invariant(!(await tx.find('talentAccessGrants',{workspaceId:actor.workspaceId,talentAccountId:actor.talentAccountId,relation:'SELF',state:'ACTIVE'})).length,
   'SELF_ALREADY_BOUND','本人档案已建立，请进入我的资料',409);
  const textFields=TEXT_FIELDS.filter(field=>!person||grant?.selfExposureManifest.some(e=>e.kind==='person'&&e.targetId===person!.id&&e.field===field)||(Array.isArray(profile[field])?profile[field].length>0:String(profile[field]).trim().length>0));
  const now=this.clock.now().toISOString();
  const source:Source={...base(actor.workspaceId,this.clock),scopeId:s.scopeId,maintainerId,title:'供应商本人确认资料',type:'TEXT',
   providerClaim:'本人账号提供并确认',textPayload:'',basisMode:'INTERNAL_USE',basisDescription:'本人确认用于ONCE内部供应商库；'+SUPPLIER_CONSENT_VERSION,
   validFrom:now,validUntil:consent.validUntil,internalUseUntil:consent.validUntil,status:'CONFIRMED',protectionEpoch:1,
   reviewedBy:null,reviewedAt:null,confirmedByTalentId:actor.talentAccountId,selfConfirmedAt:now};
  await tx.insert('sources',source);await appendSourceHistory(tx,actor,source,'CREATED',this.clock);
  if(!person){
   person={...base(actor.workspaceId,this.clock),sourceId:source.id,scopeId:s.scopeId,maintainerId,displayName:profile.displayName.trim(),aliases:profile.aliases,intro:profile.intro,
    roles:[],languageCodes:[],skillCodes:[],cityCode:null,heightCm:null,status:'ACTIVE',protectionEpoch:1};
   await tx.insert('people',person);
   await tx.insert('talentProfiles',{...base(actor.workspaceId,this.clock),personId:person.id,sourceId:source.id,...PROFILE_DEFAULTS,internalSummary:'',status:'ACTIVE'});
  }else{person={...touch(person,this.clock),...Object.fromEntries(textFields.map(field=>[field,field==='displayName'?profile.displayName.trim():profile[field]]))};await tx.replace('people',person);}
  await tx.replace('talentConsents',{...consent,personId:person.id});
  await tx.insert('sourceAttributions',{...base(actor.workspaceId,this.clock),sourceId:source.id,submissionId:s.id,talentAccountId:actor.talentAccountId,
   consentId:consent.id,reviewerId:null,confirmedByTalentId:actor.talentAccountId,materialDescription:JSON.stringify({kind:'SELF_CONFIRMED_PROFILE',submissionId:s.id,derivedWorks:items.filter(i=>i.kind==='WORK'&&i.baseline.originDocument).map(i=>({clientItemKey:i.clientItemKey,...i.baseline})),derivedImages:items.filter(i=>i.kind==='MEDIA'&&i.baseline.originDocument).map(i=>({assetId:i.targetId,...i.baseline})),documents:items.filter(i=>i.kind==='DOCUMENT_PARSE'&&i.baseline.selectedFields).map(i=>({assetId:i.targetId,...i.baseline}))})});
  await tx.insert('sourceUseBases',{...base(actor.workspaceId,this.clock),sourceId:source.id,consentId:consent.id,consentRevision:consent.revision,
   purpose:'INTERNAL_DIRECTORY',fieldScope:[...SUPPLIER_FIELD_SCOPE],state:'ACTIVE',validUntil:consent.validUntil});
  const evidence=new TalentV2(this.clock,this.config),manifest:Exposure[]=[];
  for(const e of grant?.selfExposureManifest??[]){if(e.kind==='personCapabilities'){const row=await tx.get('personCapabilities',e.targetId);if(row?.personRoleId)manifest.push(e);}else if(!['person','contact',...Object.keys(supportedFacts),'measurementSets'].includes(e.kind))manifest.push(e);}
  const nativeService=new SupplierNative(this.clock,this.config);
  if(grant)for(const [table,provided] of [['personCapabilities',profile.capabilityDetails!==undefined],['personCredentials',profile.credentials!==undefined],['translatorLanguagePairs',profile.translation!==undefined],['translatorServiceModes',profile.translation!==undefined]] as const)if(provided){const ids=new Set((await nativeService.exposed(tx,grant,table)).map(r=>r.id));for(let i=manifest.length-1;i>=0;i--)if(manifest[i]!.kind===table&&ids.has(manifest[i]!.targetId))manifest.splice(i,1);}
  await evidence.evidenceFor(tx,actor,'person',person as unknown as Record<string,unknown>,textFields,source.id,source.revision);
  const expose=(kind:string,row:{id:string},field:string,value:unknown)=>manifest.push({kind,targetId:row.id,field,valueDigest:digest(value),sourceId:source.id,sourceRevision:source.revision});
  for(const field of textFields)expose('person',person,field,person[field]);
  await this.applyFacts(tx,actor,person,source,profile,grant,expose);
  await new SupplierNative(this.clock,this.config).apply(tx,actor,person,source,profile,grant,expose);
  if(profile.professional){const professional=new SupplierProfessional(this.clock,this.config),additions=await professional.apply(tx,person,source,profile.professional,[],grant);
   for(let i=manifest.length-1;i>=0;i--){const e=manifest[i]!;if(e.kind!=='supplierField')continue;const root=await tx.get('supplierFacts',e.targetId);if(root?.status==='RETIRED')manifest.splice(i,1);}manifest.push(...additions);}
  const mediaItems=items.filter(i=>i.kind==='MEDIA');
  await adoptSubmissionMedia(tx,actor,s,person,source,mediaItems,this.clock,this.config);
  for(const media of mediaItems)await tx.replace('talentSubmissionItems',{...touch(media,this.clock),state:'APPLIED',appliedId:String(media.values.assetId)});
  if(!grant){
   invariant(claim&&invitation,'SELF_ENROLL_REQUIRED','加入上下文不可用',409);
   await tx.replace('talentClaims',{...touch(claim,this.clock),targetPersonId:person.id,state:'APPROVED',reserved:false,
    ownershipBasis:'已验证账号在通用邀请下首次确认本人资料',decidedById:null,confirmedByTalentId:actor.talentAccountId,decidedAt:now});
   grant={...base(actor.workspaceId,this.clock),talentAccountId:actor.talentAccountId,personId:person.id,claimId:claim.id,relation:'SELF',state:'ACTIVE',actions:['TEXT_MAINTAIN'],
    authorizationEpoch:1,selfExposureManifest:manifest,approvedById:null,confirmedByTalentId:actor.talentAccountId,approvalBasis:'本人首次确认直接入库',recoveryEpoch:this.config.recoveryEpoch};
   await tx.insert('talentAccessGrants',grant);
   const used=invitation.usedCount+1;
   await tx.replace('talentInvitations',{...touch(invitation,this.clock),usedCount:used,reservedCount:invitation.reservedCount-1,state:used===invitation.maxUses?'EXHAUSTED':'ACTIVE'});
  }else{grant={...touch(grant,this.clock),selfExposureManifest:manifest};await tx.replace('talentAccessGrants',grant);}
  for(const media of mediaItems)manifest.push(await mediaExposure(tx,grant,'mediaAsset',String(media.values.assetId),this.clock,this.config));
  grant={...touch(grant,this.clock),selfExposureManifest:manifest};await tx.replace('talentAccessGrants',grant);
  for(const work of works){const applied=await applySupplierWork(tx,actor,person,source,work,this.clock,this.config);
   manifest.push(await workExposure(tx,grant,applied.credit.id,this.clock,this.config,consent.id));
   await tx.replace('talentSubmissionItems',{...touch(work,this.clock),state:'APPLIED',appliedId:applied.work.id});}
  if(works.length)await tx.replace('talentAccessGrants',{...touch(grant,this.clock),selfExposureManifest:manifest});
  await tx.replace('talentSubmissionItems',{...touch(item,this.clock),state:'APPLIED',appliedId:person.id});
  const next={...touch(s,this.clock),personId:person.id,grantId:grant.id,state:'APPROVED',confirmedByTalentId:actor.talentAccountId,
   decidedById:null,decidedAt:now,payloadDigest:digest(profile),expiresAt:this.maintenance.until(this.maintenance.retention.decided)};
  await tx.replace('talentSubmissions',next);return next;
 }
 async applyFacts(tx:Tx,actor:TalentActor,person:Person,source:Source,profile:SupplierProfile,grant:TalentAccessGrant|null,
  expose:(kind:string,row:{id:string},field:string,value:unknown)=>void){
  const evidence=new TalentV2(this.clock,this.config);
  for(const table of Object.keys(supportedFacts) as Array<keyof typeof supportedFacts>){
   const field=codeFields[table],values=profile[supportedFacts[table]];
   const existing=await tx.find(table,{workspaceId:actor.workspaceId,personId:person.id});
   for(const row of existing){
    if(table==='personCapabilities'&&'personRoleId' in row&&row.personRoleId)continue;
    // Only retire facts explicitly exposed to this account. Hidden staff facts and
    // other sources remain intact; changing a role never deletes historical credits.
    const open=grant?.selfExposureManifest.some(e=>e.kind===table&&e.targetId===row.id&&e.field===field);
    if(open&&row.status==='ACTIVE'&&!values.includes(String((row as unknown as Record<string,unknown>)[field])))
     await tx.replace(table,{...touch(row,this.clock),status:'INACTIVE'} as never);
   }
   for(const value of values){
    let row=existing.find(r=>!(table==='personCapabilities'&&'personRoleId' in r&&r.personRoleId)&&r.status==='ACTIVE'&&(r as unknown as Record<string,unknown>)[field]===value);
    if(!row){
     const raw={...base(actor.workspaceId,this.clock),personId:person.id,sourceId:source.id,...rowDefaults(table),
      ...(table==='personRoles'?ROLE_DEFAULTS:{}),[field]:value,validFrom:null,validUntil:null,status:'ACTIVE',
      ...(table==='talentLocations'?{relationCode:'BASE'}:{})};
     row=raw as unknown as typeof existing[number];await tx.insert(table,row as never);
    }
    await evidence.evidenceFor(tx,actor,table,row as unknown as Record<string,unknown>,[field],source.id,source.revision);
    expose(table,row,field,value);
   }
  }
  for(const e of grant?.selfExposureManifest.filter(e=>e.kind==='contact')??[]){const c=await tx.get('contacts',e.targetId);if(c?.personId===person.id)await tx.remove('contacts',c.id);}
  for(const contact of profile.contacts){
   const row=base(actor.workspaceId,this.clock);
   await tx.insert('contacts',{...row,personId:person.id,sourceId:source.id,kind:contact.kind,
    ciphertext:encryptContact(contact.value,this.config.contactKey,`${actor.workspaceId}:${person.id}:${row.id}`),maskedValue:'••••'+contact.value.slice(-4)});
   expose('contact',row,'value',contact);
  }
  if(profile.roleCodes.includes('model')){
   let casting=(await tx.find('castingProfiles',{workspaceId:actor.workspaceId,personId:person.id})).find(c=>!c.supersededById);
   if(!casting){casting={...base(actor.workspaceId,this.clock),personId:person.id,sourceId:source.id,...rowDefaults('castingProfiles')} as unknown as TableMap['castingProfiles'];await tx.insert('castingProfiles',casting);}
   if(SUPPLIER_MEASUREMENT_VALUES.some(key=>profile.measurements[key]!=null)){
    const row={...base(actor.workspaceId,this.clock),personId:person.id,sourceId:source.id,...rowDefaults('measurementSets'),
     ...profile.measurements,measuredOn:profile.measurements.measuredOn??null,datePrecision:profile.measurements.measuredOn?profile.measurements.datePrecision??'EXACT_DAY':'UNKNOWN',reportedAt:this.clock.now().toISOString(),supersedesId:casting.currentMeasurementSetId,
     status:'CONFIRMED'} as unknown as TableMap['measurementSets'];
    await tx.insert('measurementSets',row);await tx.replace('castingProfiles',{...touch(casting,this.clock),currentMeasurementSetId:row.id});
    await evidence.evidenceFor(tx,actor,'measurementSets',row as unknown as Record<string,unknown>,Object.keys(profile.measurements),source.id,source.revision);
    for(const [field,value] of Object.entries(profile.measurements))expose('measurementSets',row,field,value);
   }else if(casting.currentMeasurementSetId&&grant?.selfExposureManifest.some(e=>e.kind==='measurementSets'&&e.targetId===casting!.currentMeasurementSetId))
    await tx.replace('castingProfiles',{...touch(casting,this.clock),currentMeasurementSetId:null});
  }
 }
}
