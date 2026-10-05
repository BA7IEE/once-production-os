import type {Actor,Clock,Config} from './model.ts';
import type {Tx} from './store.ts';
import type {Exposure,TalentAccessGrant} from './talent-maintenance-model.ts';
import {TalentMaintenance} from './talent-maintenance.ts';
import {requireExposureBasis} from './talent-exposure-basis.ts';
import {mediaExposure} from './talent-media-exposure.ts';
import {reviewedWorkExposure,workExposure} from './talent-work-cases.ts';
import {adoptedMediaFor} from './media-ownership.ts';
import {td2PersonFor} from './talent-v2-graph.ts';
import {sourceFor,requirePermission} from './policy.ts';
import {workFor} from './production-policy.ts';
import {v,uuid,revision} from './validation.ts';
import {cas,touch,workspaceRow} from './helpers.ts';
import {invariant,missing,AppError} from './errors.ts';
import {digest} from './json.ts';
const field=v.enum(['displayName','aliases','intro']);
const ref=v.object({id:uuid,expectedRevision:revision});
export const handoffExposureSchema=v.object({expectedRevision:revision,decision:v.enum(['ALLOW','REVOKE']),fields:v.array(v.object({field,expectedValueDigest:v.string(64,64)}),3),assets:v.array(ref,200),collections:v.array(ref,50),credits:v.array(ref,50),approvalBasis:v.string(2000,4)});
type Kind='person'|'mediaAsset'|'mediaCollection'|'workCredit';
async function eligible(tx:Tx,actor:Actor,g:TalentAccessGrant,kind:Kind,id:string,key:string,clock:Clock,config:Config){
 const m=new TalentMaintenance(clock,config);requirePermission(actor,'records.read');await td2PersonFor(tx,actor,g.personId);
 if(kind==='person'){const p=await td2PersonFor(tx,actor,g.personId);const e=(await m.exposure(tx,actor,p,[key]))[0];if(!e)missing();const source=await sourceFor(tx,actor,e.sourceId,clock);await requireExposureBasis(tx,source,clock,[key]);return e;}
 if(kind==='mediaAsset'){requirePermission(actor,'assets.read');const a=await workspaceRow(tx,'assets',id,actor.workspaceId);if(!a)missing();await adoptedMediaFor(tx,actor,a,clock);return mediaExposure(tx,g,kind,id,clock,config);}
 if(kind==='mediaCollection'){const c=await workspaceRow(tx,'mediaCollections',id,actor.workspaceId);if(!c||c.personId!==g.personId)missing();await sourceFor(tx,actor,c.sourceId,clock);if(c.personRoleId){const r=await workspaceRow(tx,'personRoles',c.personRoleId,actor.workspaceId);if(!r)missing();await sourceFor(tx,actor,r.sourceId,clock);}return mediaExposure(tx,g,kind,id,clock,config);}
 const c=await workspaceRow(tx,'workCredits',id,actor.workspaceId);if(!c||c.personId!==g.personId||!c.sourceId||!c.personRoleId)missing();await workFor(tx,actor,c.workId,clock);await sourceFor(tx,actor,c.sourceId,clock);const r=await workspaceRow(tx,'personRoles',c.personRoleId,actor.workspaceId);if(!r)missing();await sourceFor(tx,actor,r.sourceId,clock);return reviewedWorkExposure(tx,g,id,clock,config);
}
/** A controlled extension of the existing Grant manifest. No ownership transfer, Consent or new model. */
export async function approveHandoffExposure(tx:Tx,actor:Actor,id:string,input:unknown,clock:Clock,config:Config){
 const m=new TalentMaintenance(clock,config);m.human(actor,'talent.review');const d=handoffExposureSchema.parse(input),g=await workspaceRow(tx,'talentAccessGrants',id,actor.workspaceId);if(!g)missing();requirePermission(actor,'records.read');await td2PersonFor(tx,actor,g.personId);await m.grant(tx,actor.workspaceId,g.talentAccountId,g.id);cas(g,d.expectedRevision);
 const refs=[...d.fields.map(f=>({kind:'person' as const,id:g.personId,field:f.field,expectedValueDigest:f.expectedValueDigest})),...d.assets.map(r=>({...r,kind:'mediaAsset' as const,field:'COLLECTION_MAINTAIN'})),...d.collections.map(r=>({...r,kind:'mediaCollection' as const,field:'COLLECTION_MAINTAIN'})),...d.credits.map(r=>({...r,kind:'workCredit' as const,field:'OWN_WORK_CASE'}))];
 invariant(refs.length>0&&new Set(refs.map(r=>r.kind+':'+r.id+':'+r.field)).size===refs.length,'EXPOSURE_SELECTION_INVALID','请选择明确且不重复的开放内容',422);
 const additions:Exposure[]=[];for(const r of refs){
  if(r.kind==='person'){const p=await td2PersonFor(tx,actor,g.personId);invariant(digest(p[r.field as 'displayName'|'aliases'|'intro'])===r.expectedValueDigest,'EXPOSURE_REBASE_REQUIRED','基础资料已变化，请重新核对',409);}
  else {const row=await workspaceRow(tx,r.kind==='mediaAsset'?'assets':r.kind==='mediaCollection'?'mediaCollections':'workCredits',r.id,actor.workspaceId);if(!row)missing();cas(row,r.expectedRevision);}
  // Revoking stale permission references needs formal scope visibility, not a still-current Source.
  if(d.decision==='ALLOW')additions.push({...await eligible(tx,actor,g,r.kind,r.id,r.field,clock,config),approvedById:actor.membershipId,approvedAt:clock.now().toISOString(),approvalBasis:d.approvalBasis});
  else if(r.kind!=='person'){const row=await workspaceRow(tx,r.kind==='mediaAsset'?'assets':r.kind==='mediaCollection'?'mediaCollections':'workCredits',r.id,actor.workspaceId);let sourceId=row?.sourceId;if(r.kind==='mediaAsset'){const relation=(await tx.find('personMedia',{workspaceId:g.workspaceId,personId:g.personId,assetId:r.id}))[0];invariant(!!relation||row?.personId===g.personId,'NOT_FOUND','内容不可访问',404);sourceId=relation?.sourceId??sourceId;}if(!sourceId)missing();await sourceFor(tx,actor,String(sourceId),clock,false);if(r.kind==='mediaCollection'||r.kind==='workCredit')invariant(row?.personId===g.personId,'NOT_FOUND','内容不可访问',404);}
 }
 const next={...touch(g,clock),selfExposureManifest:[...g.selfExposureManifest.filter(e=>!refs.some(r=>r.kind===e.kind&&r.id===e.targetId&&r.field===e.field)),...additions]};await tx.replace('talentAccessGrants',next);return next;
}
export async function handoffOverview(tx:Tx,actor:Actor,personId:string,clock:Clock,config:Config){
 const m=new TalentMaintenance(clock,config);m.human(actor,'talent.review');requirePermission(actor,'records.read');const p=await td2PersonFor(tx,actor,personId),grants=[];
 for(const g of await tx.find('talentAccessGrants',{workspaceId:actor.workspaceId,personId})){const rows:Array<{kind:Kind;id:string;field:string;label:string;revision:number;valueDigest?:string;status:string;selectable:boolean}>=[];
  const append=async(kind:Kind,id:string,key:string,label:string,revision:number,valueDigest?:string)=>{try{await m.grant(tx,g.workspaceId,g.talentAccountId,g.id);const current=await eligible(tx,actor,g,kind,id,key,clock,config),old=g.selfExposureManifest.find(e=>e.kind===kind&&e.targetId===id&&e.field===current.field);let matches=old?.valueDigest===current.valueDigest&&old.sourceId===current.sourceId&&old.sourceRevision===current.sourceRevision;if(old?.consentId&&kind==='workCredit'){const consentCurrent=await workExposure(tx,g,id,clock,config,old.consentId);matches=old.valueDigest===consentCurrent.valueDigest&&old.sourceId===consentCurrent.sourceId&&old.sourceRevision===consentCurrent.sourceRevision;}rows.push({kind,id,field:key,label,revision,valueDigest,status:matches?'OPEN':old?'RECHECK_REQUIRED':'CLOSED',selectable:true});}catch(e){if(!(e instanceof AppError&&[403,404,409].includes(e.status)))throw e;rows.push({kind,id,field:key,label,revision,valueDigest,status:'UNAVAILABLE',selectable:false});}};
  for(const [key,label] of [['displayName','姓名'],['aliases','别名'],['intro','简介']] as const)await append('person',p.id,key,label,p.revision,digest(p[key]));
  for(const r of await tx.find('personMedia',{workspaceId:actor.workspaceId,personId:p.id,usageState:'ADOPTED'})){const a=await workspaceRow(tx,'assets',r.assetId,actor.workspaceId);if(!a||!r.sourceId)continue;try{await sourceFor(tx,actor,r.sourceId,clock,false);requirePermission(actor,'assets.read');}catch(e){if(e instanceof AppError&&[403,404].includes(e.status))continue;throw e;}await append('mediaAsset',a.id,'COLLECTION_MAINTAIN',a.fileName,a.revision);}
  for(const a of await tx.find('assets',{workspaceId:actor.workspaceId,personId:p.id})){if(rows.some(r=>r.kind==='mediaAsset'&&r.id===a.id)||!a.sourceId||a.usageState&&a.usageState!=='ADOPTED')continue;try{await sourceFor(tx,actor,a.sourceId,clock,false);requirePermission(actor,'assets.read');}catch(e){if(e instanceof AppError&&[403,404].includes(e.status))continue;throw e;}await append('mediaAsset',a.id,'COLLECTION_MAINTAIN',a.fileName,a.revision);}
  for(const c of await tx.find('mediaCollections',{workspaceId:actor.workspaceId,personId:p.id,status:'ACTIVE'})){try{await sourceFor(tx,actor,c.sourceId,clock,false);}catch(e){if(e instanceof AppError&&[403,404].includes(e.status))continue;throw e;}await append('mediaCollection',c.id,'COLLECTION_MAINTAIN',c.title+' · '+c.collectionTypeCode,c.revision);}
  for(const c of await tx.find('workCredits',{workspaceId:actor.workspaceId,personId:p.id})){const w=await workspaceRow(tx,'works',c.workId,actor.workspaceId);if(!w||!c.sourceId)continue;try{await sourceFor(tx,actor,w.sourceId,clock,false);await sourceFor(tx,actor,c.sourceId,clock,false);}catch(e){if(e instanceof AppError&&[403,404].includes(e.status))continue;throw e;}await append('workCredit',c.id,'OWN_WORK_CASE',w.title+' · '+c.roleCode,c.revision);}
  grants.push({id:g.id,revision:g.revision,relation:g.relation,state:g.state,rows});
 }
 return {personId:p.id,grants};
}
