import type {Actor,Clock,Person,TableMap} from './model.ts';
import type {Tx} from './store.ts';
import type {DeletionRequest} from './deletion-model.ts';
import type {MergeHistoryErasure} from './merge-history-erasure-model.ts';
import type {talentSnapshot} from './talent-v2-integrity.ts';
import {base,touch} from './helpers.ts';
import {invariant} from './errors.ts';
import {requirePermission,scopeVisible,deletionBlocked} from './policy.ts';
type Snapshot=Awaited<ReturnType<typeof talentSnapshot>>;
export function personHistoryErasure(data:Snapshot,personId:string){
 const aliases=data.personAliases.filter(a=>a.canonicalPersonId===personId||a.oldPersonId===personId),oldIds=new Set(aliases.map(a=>String(a.oldPersonId)));
 const people=data.people.filter(p=>oldIds.has(p.id)),merges=data.personMerges.filter(m=>aliases.some(a=>a.mergeDecisionId===m.id));
 const events=data.mergeHistoryErasures.filter(e=>merges.some(m=>m.id===e.mergeDecisionId));
 const count=people.filter(p=>!events.some(e=>e.recordKind==='PERSON'&&e.recordId===p.id)).length+merges.filter(m=>!m.reasonErasedAt).length;
 const normalizedPeople=people.map(p=>{if(p.id!==personId)return p;const {revision,updatedAt,protectionEpoch,...stable}=p;return stable;});
 return {aliases,oldIds,people,merges,events,count,snapshot:{aliases,people:normalizedPeople,merges,events}};
}
export async function historyErasureBlocker(tx:Tx,actor:Actor,personId:string,history:ReturnType<typeof personHistoryErasure>,data:Snapshot){
 if(!history.aliases.length)return null;
 if(!actor.permissions.includes('data.merge'))return 'TD2_HISTORY_MERGE_PERMISSION_REQUIRED';
 const endpoints=data.people.filter(p=>history.oldIds.has(p.id)||history.aliases.some(a=>a.canonicalPersonId===p.id));
 for(const p of endpoints){
  if(!await scopeVisible(tx,actor,String(p.scopeId)))return 'TD2_HIDDEN_DEPENDENCY';
  const s=data.sources.find(s=>s.id===p.sourceId);if(!s||!await scopeVisible(tx,actor,String(s.scopeId)))return 'TD2_HIDDEN_DEPENDENCY';
  if(p.id!==personId&&await deletionBlocked(tx,actor.workspaceId,'PERSON',p.id)&&p.status!=='ERASED')return 'TD2_HISTORY_OWNER_BUSY';
 }
 if(history.people.length!==history.aliases.length||history.merges.length!==history.aliases.length)return 'TD2_HISTORY_LINEAGE_MISSING';
 return null;
}
/** Append immutable minimal lineage before removing any historical payload, all inside the graph transaction. */
export async function recordPersonHistoryErasure(tx:Tx,actor:Actor,request:DeletionRequest,data:Snapshot,clock:Clock){
 const history=personHistoryErasure(data,request.targetId);if(!history.aliases.length)return;
 requirePermission(actor,'data.merge');invariant(!await historyErasureBlocker(tx,actor,request.targetId,history,data),'TD2_HISTORY_SCOPE_CHANGED','合并历史或原身份当前不可清理',409);
 for(const alias of history.aliases){
  const old=(await tx.get('people',String(alias.oldPersonId)))!;
  const record=async(kind:MergeHistoryErasure['recordKind'],row:{id:string;revision:number;createdAt:string;updatedAt:string;sourceId:string;supersededById?:string|null;retiredCurrentMeasurementSetId?:string|null;status?:string})=>{
   const previous=(await tx.find('mergeHistoryErasures',{workspaceId:actor.workspaceId,recordKind:kind,recordId:row.id}))[0];if(previous)return previous;
   const event:MergeHistoryErasure={...base(actor.workspaceId,clock),mergeDecisionId:String(alias.mergeDecisionId),personId:old.id,sourceId:row.sourceId,recordKind:kind,recordId:row.id,recordRevision:row.revision,recordCreatedAt:row.createdAt,recordUpdatedAt:row.updatedAt,recordStatusBefore:kind==='PERSON'?row.status as 'ARCHIVED'|'ERASED':null,supersededById:row.supersededById??null,retiredMeasurementSetId:row.retiredCurrentMeasurementSetId??null,erasedAt:clock.now().toISOString(),requestId:request.id,actorId:actor.membershipId,originalWorkspaceId:null,originalRequestId:null,originalActorId:null};
   await tx.insert('mergeHistoryErasures',event);return event;
  };
  const personEvent=await record('PERSON',old);
  for(const table of ['talentProfiles','castingProfiles'] as const)for(const row of await tx.find(table,{workspaceId:actor.workspaceId,personId:old.id})){
   invariant(row.supersededById,'TD2_HISTORY_LINEAGE_MISSING','旧身份仍有未退休的主档案',409);
   const event=await record(table==='talentProfiles'?'TALENT_PROFILE':'CASTING_PROFILE',row);await tx.eraseRetiredProfile(table,row.id,event.id);
  }
  const merge=(await tx.get('personMerges',String(alias.mergeDecisionId)))!;
  if(!merge.reasonErasedAt){invariant(personEvent.requestId===request.id,'TD2_HISTORY_ERASURE_EVIDENCE_REQUIRED','原历史清理缺少说明处置证据',409);await tx.redactMergeReason(merge.id,personEvent.id,personEvent.erasedAt);}
  // Clear the archived identity in the same transaction as its explicit erasure record.
  if(old.status!=='ERASED')await tx.replace('people',{...touch(old,clock),displayName:'[ERASED]',aliases:[],roles:['erased'],cityCode:null,languageCodes:[],skillCodes:[],heightCm:null,intro:'',status:'ERASED',protectionEpoch:old.protectionEpoch+1});
 }
}

/** Old frozen plans cannot declare erasure complete while historical identity content survives. */
export async function assertHistoryErasureComplete(tx:Tx,workspaceId:string,personId:string){
 const aliases=(await tx.find('personAliases',{workspaceId})).filter(a=>a.canonicalPersonId===personId||a.oldPersonId===personId);
 for(const alias of aliases){
  const old=await tx.get('people',alias.oldPersonId),merge=await tx.get('personMerges',alias.mergeDecisionId),events=await tx.find('mergeHistoryErasures',{workspaceId,mergeDecisionId:alias.mergeDecisionId});
  invariant(old&&(old.id===personId||old.status==='ERASED')&&merge?.reasonErasedAt&&events.some(e=>e.recordKind==='PERSON'&&e.recordId===old.id),'TD2_HISTORY_CLEANUP_INCOMPLETE','合并历史身份或说明尚未完成专用清理',409);
  for(const table of ['talentProfiles','castingProfiles'] as const)invariant(!(await tx.find(table,{workspaceId,personId:old.id})).length,'TD2_HISTORY_CLEANUP_INCOMPLETE','旧主档案内容仍未清理',409);
  if(old.id!==personId)invariant(!(await tx.find('evidence',{workspaceId,personId:old.id})).length&&!(await tx.find('fieldProposals',{workspaceId,personId:old.id})).length,'TD2_HISTORY_CLEANUP_INCOMPLETE','旧身份字段证据仍未清理',409);
 }
}
