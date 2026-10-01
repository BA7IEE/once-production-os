import type {Actor,Clock,Config} from './model.ts';
import type {TalentActor} from './talent-auth-model.ts';
import type {Exposure,TalentAccessGrant} from './talent-maintenance-model.ts';
import type {Tx} from './store.ts';
import {TalentMaintenance} from './talent-maintenance.ts';
import {workspaceRow,touch,cas} from './helpers.ts';
import {sourceCurrent,deletionBlocked,requirePermission,sourceFor} from './policy.ts';
import {periodCurrent,td2PersonFor} from './talent-v2-graph.ts';
import {adoptedMediaFor} from './media-ownership.ts';
import {mediaUsage} from './media-model.ts';
import {digest} from './json.ts';
import {missing,invariant} from './errors.ts';
import {v,uuid,revision} from './validation.ts';
export type MediaExposureKind='mediaAsset'|'mediaCollection';
const reference=v.object({id:uuid,expectedRevision:revision});
export const mediaExposureSchema=v.object({expectedRevision:revision,decision:v.enum(['ALLOW','REVOKE']),assets:v.array(reference,200),collections:v.array(reference,50),approvalBasis:v.string(2000,4)});
async function currentSource(tx:Tx,workspaceId:string,id:string,clock:Clock){const s=await workspaceRow(tx,'sources',id,workspaceId);if(!s||!sourceCurrent(s,clock)||await deletionBlocked(tx,workspaceId,'SOURCE',id))missing();return s;}
/** Explicit, version-bound exposure. Upload provenance is deliberately not an authorization input. */
export async function mediaExposure(tx:Tx,g:TalentAccessGrant,kind:MediaExposureKind,id:string,clock:Clock,config:Config):Promise<Exposure>{
 const m=new TalentMaintenance(clock,config);await m.grant(tx,g.workspaceId,g.talentAccountId,g.id);const p=await m.person(tx,g.workspaceId,g.personId);
 let sourceId:string,personRoleId:string|null,value:unknown;
 if(kind==='mediaAsset'){
  const a=await workspaceRow(tx,'assets',id,g.workspaceId);if(!a||a.state!=='READY'||mediaUsage(a)!=='ADOPTED'||await deletionBlocked(tx,g.workspaceId,'ASSET',id))missing();
  const r=(await tx.find('personMedia',{workspaceId:g.workspaceId,assetId:id}))[0];
  if(r?(r.usageState!=='ADOPTED'||r.personId!==p.id||!r.sourceId||r.retiredAt||r.purgedAt):(a.personId!==p.id||!a.sourceId))missing();
  sourceId=(r?.sourceId??a.sourceId)!;personRoleId=r?.personRoleId??null;value={asset:a,relation:r??null};
 }else{
  const c=await workspaceRow(tx,'mediaCollections',id,g.workspaceId);if(!c||c.personId!==p.id||c.status!=='ACTIVE')missing();
  sourceId=c.sourceId;personRoleId=c.personRoleId;value=c;
 }
 if(personRoleId){const r=await workspaceRow(tx,'personRoles',personRoleId,g.workspaceId);if(!r||r.personId!==p.id||r.status!=='ACTIVE'||!periodCurrent(r as unknown as Record<string,unknown>,clock))missing();await currentSource(tx,g.workspaceId,r.sourceId,clock);}
 const s=await currentSource(tx,g.workspaceId,sourceId,clock);
 return {kind,targetId:id,field:'COLLECTION_MAINTAIN',valueDigest:digest({grantId:g.id,talentAccountId:g.talentAccountId,personId:p.id,authorizationEpoch:g.authorizationEpoch,protectionEpoch:p.protectionEpoch,value}),sourceId:s.id,sourceRevision:s.revision};
}
export async function requireMediaExposure(tx:Tx,actor:TalentActor,personId:string,kind:MediaExposureKind,id:string,clock:Clock,config:Config){
 const g=(await tx.find('talentAccessGrants',{workspaceId:actor.workspaceId,talentAccountId:actor.talentAccountId,personId,state:'ACTIVE'}))[0];if(!g)missing();
 const expected=await mediaExposure(tx,g,kind,id,clock,config);
 if(!g.selfExposureManifest.some(e=>e.kind===kind&&e.targetId===id&&e.field===expected.field&&e.valueDigest===expected.valueDigest&&e.sourceId===expected.sourceId&&e.sourceRevision===expected.sourceRevision))missing();return g;
}
export async function approveMediaExposure(tx:Tx,actor:Actor,id:string,input:unknown,clock:Clock,config:Config){
 const m=new TalentMaintenance(clock,config);m.human(actor,'talent.review');const d=mediaExposureSchema.parse(input),g=await workspaceRow(tx,'talentAccessGrants',id,actor.workspaceId);if(!g)missing();
 await td2PersonFor(tx,actor,g.personId);await m.grant(tx,actor.workspaceId,g.talentAccountId,g.id);cas(g,d.expectedRevision);
 const refs=[...d.assets.map(r=>({...r,kind:'mediaAsset' as const})),...d.collections.map(r=>({...r,kind:'mediaCollection' as const}))];
 invariant(refs.length>0&&new Set(refs.map(r=>r.kind+':'+r.id)).size===refs.length,'EXPOSURE_SELECTION_INVALID','请选择明确且不重复的素材或集合',422);
 const additions:Exposure[]=[];
 for(const r of refs){
  const row=await workspaceRow(tx,r.kind==='mediaAsset'?'assets':'mediaCollections',r.id,actor.workspaceId);if(!row)missing();cas(row,r.expectedRevision);
  if(r.kind==='mediaAsset'){requirePermission(actor,'assets.read');await adoptedMediaFor(tx,actor,(await tx.get('assets',r.id))!,clock);}
  else {const c=(await tx.get('mediaCollections',r.id))!;if(c.personId!==g.personId)missing();await sourceFor(tx,actor,c.sourceId,clock,d.decision==='ALLOW');if(c.personRoleId){const role=await tx.get('personRoles',c.personRoleId);if(!role)missing();await sourceFor(tx,actor,role.sourceId,clock);}}
  if(d.decision==='ALLOW'){const e=await mediaExposure(tx,g,r.kind,r.id,clock,config);await sourceFor(tx,actor,e.sourceId,clock);additions.push({...e,approvedById:actor.membershipId,approvedAt:clock.now().toISOString(),approvalBasis:d.approvalBasis});}
 }
 const next={...touch(g,clock),selfExposureManifest:[...g.selfExposureManifest.filter(e=>!refs.some(r=>r.kind===e.kind&&r.id===e.targetId)),...additions]};await tx.replace('talentAccessGrants',next);return next;
}
