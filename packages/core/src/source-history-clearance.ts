import type {Actor} from './model.ts';
import type {Tx} from './store.ts';
import type {talentSnapshot} from './talent-v2-integrity.ts';
import {scopeVisible} from './policy.ts';
type Snapshot=Awaited<ReturnType<typeof talentSnapshot>>;
/** A completed, separately reviewed PERSON cleanup may precede SOURCE cleanup.
 * Minimal immutable history does not itself authorize another historical erasure. */
export async function sourceHistoryClearance(tx:Tx,actor:Actor,sourceId:string,data:Snapshot){
 const owned=new Set(data.people.filter(p=>p.sourceId===sourceId).map(p=>p.id));
 const aliases=data.personAliases.filter(a=>owned.has(String(a.oldPersonId))||owned.has(String(a.canonicalPersonId)));
 if(!aliases.length)return {blocker:null,snapshot:null};
 const endpoints=data.people.filter(p=>aliases.some(a=>a.oldPersonId===p.id||a.canonicalPersonId===p.id));
 let blocker:string|null=actor.permissions.includes('data.merge')?null:'TD2_HISTORY_MERGE_PERMISSION_REQUIRED';
 const merges=data.personMerges.filter(m=>aliases.some(a=>a.mergeDecisionId===m.id)),events=data.mergeHistoryErasures.filter(e=>aliases.some(a=>a.mergeDecisionId===e.mergeDecisionId));
 const sourceIds=new Set([...endpoints.map(p=>String(p.sourceId)),...events.map(e=>String(e.sourceId))]),sources=data.sources.filter(s=>sourceIds.has(s.id));
 if(sources.length!==sourceIds.size)blocker=blocker??'TD2_HISTORY_LINEAGE_MISSING';
 for(const a of aliases){
  const old=endpoints.find(p=>p.id===a.oldPersonId),merge=merges.find(m=>m.id===a.mergeDecisionId);
  if(!old||old.status!=='ERASED'||!merge?.reasonErasedAt||!events.some(e=>e.recordKind==='PERSON'&&e.recordId===old.id&&e.mergeDecisionId===merge.id)
    ||data.talentProfiles.some(p=>p.personId===a.oldPersonId)||data.castingProfiles.some(p=>p.personId===a.oldPersonId)
    ||data.evidence.some(e=>e.personId===a.oldPersonId)||data.fieldProposals.some(p=>p.personId===a.oldPersonId))blocker=blocker??'TD2_MERGE_HISTORY_RETENTION_REQUIRED';
 }
 for(const p of endpoints)if(!sources.some(s=>s.id===p.sourceId))blocker=blocker??'TD2_HISTORY_LINEAGE_MISSING';
 for(const row of [...endpoints,...sources])if(!await scopeVisible(tx,actor,String(row.scopeId)))blocker='TD2_HIDDEN_DEPENDENCY';
 return {blocker,snapshot:{aliases,merges,events,endpoints:endpoints.map(p=>({id:p.id,sourceId:p.sourceId,scopeId:p.scopeId})),sources:sources.map(s=>({id:s.id,scopeId:s.scopeId}))}};
}
