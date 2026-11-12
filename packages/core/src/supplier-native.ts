import type {Clock,Config,Person,Source,TableMap} from './model.ts';
import type {TalentActor,CommandPrincipal} from './talent-auth-model.ts';
import type {TalentAccessGrant,Exposure} from './talent-maintenance-model.ts';
import type {Tx} from './store.ts';
import type {SupplierProfile} from './supplier-profile-schema.ts';
import {base,touch} from './helpers.ts';
import {digest} from './json.ts';
import {invariant,AppError} from './errors.ts';
import {sourceCurrent,deletionBlocked} from './policy.ts';
import {requireExposureBasis} from './talent-exposure-basis.ts';
import {TalentV2} from './talent-v2.ts';
const native={personCapabilities:['personRoleId','capabilityCode','levelCode'],personCredentials:['personRoleId','credentialTypeCode','credentialName','issuerName','issuedOn','expiresOn'],translatorLanguagePairs:['personRoleId','sourceLanguageCode','targetLanguageCode'],translatorServiceModes:['personRoleId','modeCode']} as const;
type NativeTable=keyof typeof native;
export class SupplierNative{
 readonly clock:Clock;readonly config:Config;constructor(clock:Clock,config:Config){this.clock=clock;this.config=config;}
 async validate(tx:Tx,actor:Pick<TalentActor,'workspaceId'>,p:SupplierProfile,previous?:SupplierProfile){
  const defs=await tx.find('capabilityDefinitions',{workspaceId:actor.workspaceId,status:'ACTIVE'});
  const capabilities=p.capabilityDetails??[];invariant(new Set(capabilities.map(c=>c.roleCode+':'+c.capabilityCode)).size===capabilities.length,'SUPPLIER_CAPABILITY_DUPLICATE','同一职业不能重复记录相同能力',422);
  for(const c of capabilities){const def=defs.find(d=>d.code===c.capabilityCode);invariant(def&&p.roleCodes.includes(c.roleCode)&&(!def.applicableRoleCodes.length||def.applicableRoleCodes.includes(c.roleCode)),'SUPPLIER_CAPABILITY_INVALID','能力未登记、停用或与职业不符',422);
   invariant(!c.levelCode||def.levelSchemeCode==='ABILITY_5','SUPPLIER_LEVEL_INVALID','该能力尚未定义等级，不能自行填写',422);
   invariant(!['FLUENT','NATIVE'].includes(c.levelCode??'')||previous?.capabilityDetails?.some(old=>old.roleCode===c.roleCode&&old.capabilityCode===c.capabilityCode&&old.levelCode===c.levelCode),'SUPPLIER_LEVEL_INVALID','新资料请使用专业能力的三级熟练度，历史语言式等级须人工核对',422);}
  for(const c of p.credentials??[]){invariant(!c.roleCode||p.roleCodes.includes(c.roleCode),'SUPPLIER_CREDENTIAL_ROLE','资格对应职业未选择',422);invariant(!c.issuedOn||!c.expiresOn||c.issuedOn<=c.expiresOn,'SUPPLIER_CREDENTIAL_DATE','资格有效期不能早于签发日期',422);}
  if(p.translation){invariant(p.roleCodes.includes('translator'),'SUPPLIER_TRANSLATOR_ROLE','请同时选择翻译职业',422);const languages=await tx.find('dictionary',{workspaceId:actor.workspaceId,namespace:'language',status:'ACTIVE'});
   invariant(new Set(p.translation.modeCodes).size===p.translation.modeCodes.length&&new Set(p.translation.pairs.map(r=>r.sourceLanguageCode+':'+r.targetLanguageCode)).size===p.translation.pairs.length,'SUPPLIER_TRANSLATION_DUPLICATE','翻译服务或语言方向不能重复',422);
   for(const pair of p.translation.pairs)invariant(pair.sourceLanguageCode!==pair.targetLanguageCode&&[pair.sourceLanguageCode,pair.targetLanguageCode].every(c=>languages.some(l=>l.code===c)),'SUPPLIER_TRANSLATION_LANGUAGE','请明确选择不同的原文语言和目标语言',422);}
 }
 async source(tx:Tx,workspaceId:string,id:string,revision:number){const s=await tx.get('sources',id);if(!s||s.workspaceId!==workspaceId||s.revision!==revision||!sourceCurrent(s,this.clock)||await deletionBlocked(tx,workspaceId,'SOURCE',id))return false;try{await requireExposureBasis(tx,s,this.clock);}catch(e){if(e instanceof AppError&&e.status===404)return false;throw e;}return true;}
 async exposed(tx:Tx,grant:TalentAccessGrant,table:NativeTable){const rows=await tx.find(table,{workspaceId:grant.workspaceId,personId:grant.personId}),visible:TableMap[NativeTable][]=[];
  for(const row of rows){if(table==='personCapabilities'&&'personRoleId' in row&&!row.personRoleId)continue;if('status' in row&&!['ACTIVE','UNVERIFIED','VERIFIED'].includes(row.status))continue;
   let complete=true;for(const field of native[table]){const value=(row as unknown as Record<string,unknown>)[field]??null,e=grant.selfExposureManifest.find(e=>e.kind===table&&e.targetId===row.id&&e.field===field&&e.valueDigest===digest(value));if(!e||!await this.source(tx,grant.workspaceId,e.sourceId,e.sourceRevision)){complete=false;break;}}
   if(complete)visible.push(row);
  }return visible;
 }
 async self(tx:Tx,grant:TalentAccessGrant,profile:SupplierProfile){
  const roleCode=async(id:string|null)=>id?(await tx.get('personRoles',id))?.roleCode??null:null;
  const caps=await this.exposed(tx,grant,'personCapabilities');if(caps.length){profile.capabilityDetails=[];for(const raw of caps){const r=raw as TableMap['personCapabilities'],role=await roleCode(r.personRoleId);if(role&&profile.roleCodes.includes(role))profile.capabilityDetails.push({roleCode:role,capabilityCode:r.capabilityCode,levelCode:r.levelCode});}}
  const credentials=await this.exposed(tx,grant,'personCredentials');if(credentials.length){profile.credentials=[];for(const raw of credentials){const r=raw as TableMap['personCredentials'],role=await roleCode(r.personRoleId);if(!r.personRoleId||role&&profile.roleCodes.includes(role))profile.credentials.push({roleCode:role,credentialTypeCode:r.credentialTypeCode,credentialName:r.credentialName??'专业资格',issuerName:r.issuerName,issuedOn:r.issuedOn,expiresOn:r.expiresOn});}}
  if(profile.roleCodes.includes('translator')){const pairs=await this.exposed(tx,grant,'translatorLanguagePairs'),modes=await this.exposed(tx,grant,'translatorServiceModes');if(pairs.length||modes.length)profile.translation={pairs:pairs.map(raw=>{const r=raw as TableMap['translatorLanguagePairs'];return {sourceLanguageCode:r.sourceLanguageCode,targetLanguageCode:r.targetLanguageCode};}),modeCodes:modes.map(raw=>(raw as TableMap['translatorServiceModes']).modeCode)};}
 }
 async apply(tx:Tx,actor:CommandPrincipal,person:Person,source:Source,profile:SupplierProfile,grant:TalentAccessGrant|null,expose:(kind:string,row:{id:string},field:string,value:unknown)=>void,roleIds?:Record<string,string>){
  const roles=await tx.find('personRoles',{workspaceId:actor.workspaceId,personId:person.id,status:'ACTIVE'}),role=(code:string|null)=>code?(roleIds?roleIds[code]??null:roles.find(r=>r.roleCode===code)?.id??null):null;
  const supplied:Partial<Record<NativeTable,unknown[]>>={};if(profile.capabilityDetails)supplied.personCapabilities=profile.capabilityDetails;if(profile.credentials)supplied.personCredentials=profile.credentials;if(profile.translation!==undefined){supplied.translatorLanguagePairs=profile.translation?.pairs??[];supplied.translatorServiceModes=profile.translation?.modeCodes??[];}
  for(const table of Object.keys(supplied) as NativeTable[]){
   if(grant)for(const old of await this.exposed(tx,grant,table)){if(table==='personCredentials'&&(old as TableMap['personCredentials']).status==='VERIFIED')continue;await tx.replace(table,{...touch(old,this.clock),status:table==='personCredentials'?'REVOKED':'INACTIVE'} as never);}
   for(const input of supplied[table]!){let values:Record<string,unknown>;
    if(table==='personCapabilities'){const c=input as NonNullable<SupplierProfile['capabilityDetails']>[number];values={personRoleId:role(c.roleCode),capabilityCode:c.capabilityCode,levelCode:c.levelCode,validFrom:null,validUntil:null,status:'ACTIVE'};}
    else if(table==='personCredentials'){const c=input as NonNullable<SupplierProfile['credentials']>[number];values={...c,personRoleId:role(c.roleCode),issuerOrganizationId:null,identifierCiphertext:null,maskedIdentifier:null,evidenceAssetId:null,status:'UNVERIFIED'};delete values.roleCode;}
    else if(table==='translatorLanguagePairs')values={...(input as object),personRoleId:role('translator'),status:'ACTIVE'};
    else values={modeCode:input,personRoleId:role('translator'),status:'ACTIVE'};
    const row={...base(actor.workspaceId,this.clock),personId:person.id,sourceId:source.id,...values};await tx.insert(table,row as never);
    await new TalentV2(this.clock,this.config).evidenceFor(tx,actor,table,row,[...native[table]],source.id,source.revision);
    for(const field of native[table])expose(table,row,field,row[field as keyof typeof row]??null);
   }
  }
 }
}
