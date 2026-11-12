import type {Actor,Clock,Config,Source} from './model.ts';
import type {Tx} from './store.ts';
import type {InboxSubjectDraft,InboxMaterialPayload} from './supplier-inbox-model.ts';
import {Talent} from './talent.ts';
import {TalentV2} from './talent-v2.ts';
import {TALENT_SCHEMA_VERSION} from './talent-v2-model.ts';
import {Portfolio} from './portfolio.ts';
import {SupplierProfessional} from './supplier-professional.ts';
import {SupplierNative} from './supplier-native.ts';
import {validateSupplierProfile} from './supplier-profile-schema.ts';
import {td2PersonFor,loadTalentGraph,periodCurrent} from './talent-v2-graph.ts';
import type {FactRow} from './talent-v2-schema.ts';
import {cas,base,touch} from './helpers.ts';
import {invariant} from './errors.ts';
import {requirePermission,sourceFor} from './policy.ts';

/** Employee adoption composes existing domains. LINK adds facts and never rewrites the origin identity. */
export async function applyInboxSubject(tx:Tx,actor:Actor,source:Source,subject:InboxSubjectDraft,payload:InboxMaterialPayload,clock:Clock,config:Config){
 const profile=validateSupplierProfile(subject.profile,true),td2=new TalentV2(clock,config),talent=new Talent(clock,config),professional=new SupplierProfessional(clock,config);
 const asFact=(row:unknown)=>row as FactRow;
 const dictionary=await tx.find('dictionary',{workspaceId:actor.workspaceId,status:'ACTIVE'});
 for(const [namespace,codes] of [['role',profile.roleCodes],['city',profile.locationCodes],['language',profile.languageCodes]] as const)
  invariant(codes.every(code=>dictionary.some(d=>d.namespace===namespace&&d.code===code)),'INBOX_CODE_INVALID','职业、城市或语言包含未收录选项',422);
 let person=subject.decision==='LINK'?await td2PersonFor(tx,actor,subject.personId!):await td2.createPerson(tx,actor,{
  schemaVersion:TALENT_SCHEMA_VERSION,originSourceId:source.id,sourceRevision:source.revision,displayName:profile.displayName,aliases:profile.aliases,intro:profile.intro,createTalent:true,
 });
 if(subject.decision==='LINK')cas(person,subject.expectedPersonRevision!);
 const fresh=async()=>(await tx.get('people',person.id))!;
 const fact=async(table:Parameters<TalentV2['createFact']>[2],values:Record<string,unknown>)=>td2.createFact(tx,actor,table,person.id,{schemaVersion:TALENT_SCHEMA_VERSION,expectedPersonRevision:(await fresh()).revision,sourceId:source.id,sourceRevision:source.revision,values});
 for(const roleCode of profile.roleCodes){const roles=await tx.find('personRoles',{workspaceId:actor.workspaceId,personId:person.id,roleCode,status:'ACTIVE'});let available=false;for(const role of roles)if(periodCurrent(asFact(role),clock)&&await professional.roleAvailable(tx,actor.workspaceId,role))available=true;if(!available)await fact('personRoles',{roleCode,...(roles.length?{validFrom:clock.now().toISOString()}:{} )});}
 if(!(await tx.find('talentProfiles',{workspaceId:actor.workspaceId,personId:person.id,status:'ACTIVE'})).length){const origin=await sourceFor(tx,actor,person.sourceId,clock);await td2.enroll(tx,actor,person.id,{schemaVersion:TALENT_SCHEMA_VERSION,expectedRevision:(await fresh()).revision,sourceRevision:origin.revision});}
 const graph=await loadTalentGraph(tx,actor,clock,[person.id]);
 for(const code of profile.languageCodes)if(!graph.personRows('personLanguages',person.id).some(r=>r.languageCode===code&&graph.usable('personLanguages',asFact(r))))await fact('personLanguages',{languageCode:code});
 for(const code of profile.locationCodes)if(!graph.personRows('talentLocations',person.id).some(r=>r.locationCode===code&&graph.usable('talentLocations',asFact(r))))await fact('talentLocations',{locationCode:code,relationCode:'SERVICE'});
 if(profile.skillCodes.length){
  const definitions=await tx.find('capabilityDefinitions',{workspaceId:actor.workspaceId,status:'ACTIVE'});profile.capabilityDetails??=[];
  for(const code of profile.skillCodes)if(!profile.capabilityDetails.some(c=>c.capabilityCode===code)){
   const def=definitions.find(d=>d.code===code),roles=profile.roleCodes.filter(r=>def&&(!def.applicableRoleCodes.length||def.applicableRoleCodes.includes(r)));
   invariant(roles.length===1,'INBOX_CAPABILITY_ROLE_REQUIRED','通用技能可能属于多个职业，请先明确该能力的职业归属',422);profile.capabilityDetails.push({roleCode:roles[0]!,capabilityCode:code,levelCode:null});
  }
 }
 const native=new SupplierNative(clock,config);await native.validate(tx,actor,profile);
 if(profile.capabilityDetails)profile.capabilityDetails=profile.capabilityDetails.filter(c=>{
  const role=graph.personRows('personRoles',person.id).find(r=>r.roleCode===c.roleCode&&graph.usable('personRoles',asFact(r)));
  const old=graph.personRows('personCapabilities',person.id).find(r=>r.personRoleId===role?.id&&r.capabilityCode===c.capabilityCode&&graph.usable('personCapabilities',asFact(r)));
  invariant(!old||old.levelCode===c.levelCode,'INBOX_FIELD_CONFLICT','已有能力熟练度不同，请在人物详情逐项核对后更新',409);return !old;
 });
 const roleIds=Object.fromEntries(graph.personRows('personRoles',person.id).filter(r=>graph.usable('personRoles',asFact(r))).map(r=>[r.roleCode,r.id]));
 await native.apply(tx,actor,await fresh(),source,profile,null,()=>{},roleIds);
 const measurement=profile.measurements;
 if(Object.entries(measurement).some(([k,v])=>!['datePrecision','measuredOn'].includes(k)&&v!==null&&v!==undefined)){
  const values:Record<string,unknown>={status:'DRAFT',measuredOn:measurement.measuredOn??null,datePrecision:measurement.measuredOn?measurement.datePrecision??'EXACT_DAY':'UNKNOWN'};
  for(const key of ['heightCm','bustCm','waistCm','hipsCm','shoeSizeValue','shoeSizeSystem','clothingSizeValue','clothingSizeSystem'] as const)if(measurement[key]!==undefined)values[key]=measurement[key];
  await fact('measurementSets',values);
 }
 if(profile.professional?.answers.length){
  const current=await fresh();await professional.update(tx,actor,person.id,{expectedPersonRevision:current.revision,sourceId:source.id,sourceRevision:source.revision,professional:profile.professional,replace:subject.professionalReplace});
 }
 if(profile.contacts.length){
  requirePermission(actor,'sensitive.read');requirePermission(actor,'sensitive.write');
  const existing=await talent.contacts(tx,actor,person.id,{requestId:subject.id,ip:'inbox'} ) as {items:Array<{kind:string;value:string;sourceId:string}>};
  const contacts=[...new Map([...existing.items.map(c=>({kind:c.kind,value:c.value,sourceId:c.sourceId})),...profile.contacts.map(c=>({...c,sourceId:source.id}))].map(c=>[c.kind+':'+c.value+':'+c.sourceId,c])).values()];
  await talent.replaceContacts(tx,actor,person.id,{expectedRevision:(await fresh()).revision,contacts});
 }
 const portfolio=new Portfolio(clock,talent),workIds:string[]=[];
 for(const draft of subject.works){
  const role=(await tx.find('personRoles',{workspaceId:actor.workspaceId,personId:person.id,roleCode:draft.roleCode,status:'ACTIVE'})).find(r=>graph.usable('personRoles',asFact(r)));
  invariant(role&&profile.roleCodes.includes(draft.roleCode),'INBOX_WORK_ROLE','作品署名必须对应已核对的具体职业',422);
  for(const ref of draft.origins){const chunk=payload.chunks.find(c=>c.id===ref.chunkId);invariant(chunk?.proposal?.works.some(w=>w.key===ref.workKey),'INBOX_WORK_ORIGIN','作品引用的提取建议已不可用',409);}
  let work=await portfolio.create(tx,actor,{sourceId:source.id,title:draft.title,description:draft.description,brandDisplayName:draft.brandDisplayName,origin:'EXTERNAL',originNote:JSON.stringify({kind:'EMPLOYEE_ORGANIZED',subjectId:subject.id,dateText:draft.dateText,url:payload.url,origins:draft.origins})});
  await tx.insert('workCredits',{...base(actor.workspaceId,clock),workId:work.id,personId:person.id,personRoleId:role.id,sourceId:source.id,roleCode:role.roleCode,note:'员工核对原材料署名；不等于 ONCE 实际项目参与'});
  invariant(new Set(draft.assetIds).size===draft.assetIds.length,'INBOX_WORK_ASSET_DUPLICATE','作品素材不能重复',422);
  for(const assetId of draft.assetIds){const a=await tx.get('assets',assetId);invariant(a?.sourceId===source.id,'INBOX_WORK_ASSET_SOURCE','本次作品只选择本批有明确来源的材料',422);work=await portfolio.addAsset(tx,actor,work.id,{expectedRevision:work.revision,assetId});}
  if(draft.assetIds.length)work=await portfolio.update(tx,actor,work.id,{expectedRevision:work.revision,status:'ACTIVE'});workIds.push(work.id);
 }
 person=await fresh();await tx.replace('people',{...touch(person,clock),...(subject.decision==='CREATE'&&source.status==='CONFIRMED'?{status:'ACTIVE' as const}:{})});
 return {personId:person.id,workIds};
}
