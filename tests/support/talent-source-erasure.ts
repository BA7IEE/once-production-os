import assert from 'node:assert/strict';
import type { Application } from '../../packages/core/src/api.ts';
import type { Store } from '../../packages/core/src/store.ts';
import type { FakeClock, Client } from './fixtures.ts';
import { sourceInput } from './fixtures.ts';
import { seedProfessionalGraph, expectResponse as ok } from './talent-v2-maintenance.ts';
import { DeletionCleanup } from '../../packages/core/src/deletion-cleanup.ts';
import { FaultStore } from './fault-store.ts';
const schemaVersion='once-talent-v2.0.0';
type Context={app:Application;store:Store;clock:FakeClock;owner:Client};
export async function seedIndependentSource(f:Context) {
 const g=await seedProfessionalGraph(f.app,f.store,f.clock,f.owner);
 const sourceId=ok(await f.owner.cmd('POST','/sources',{...sourceInput(),title:'合成可撤回的独立字段来源'})).resourceId as string;
 ok(await f.owner.cmd('POST','/td2/evidence',{schemaVersion,ownerKind:'personLanguages',ownerId:g.languageId,fieldPath:'speakingLevelCode',expectedRevision:1,sourceId,sourceRevision:1}),200);
 const proposalId=ok(await f.owner.cmd('POST','/td2/proposals',{schemaVersion,ownerKind:'personLanguages',ownerId:g.languageId,fieldPath:'readingLevelCode',expectedRevision:1,sourceId,sourceRevision:1,proposedValue:'FLUENT'})).resourceId as string;
 return {g,sourceId,proposalId};
}
export async function prepareSourceEvidenceDeletion(f:Context,sourceId:string) {
 const preview=ok(await f.owner.raw('POST','/deletion-requests/preview',{targetKind:'SOURCE',targetId:sourceId,expectedRevision:1}),200);
 assert.equal(preview.complete,true,JSON.stringify(preview.unresolved));
 assert.ok(preview.items.some((i:any)=>i.resourceKind==='talentSourceEvidenceGraph'));
 assert.equal(preview.items.some((i:any)=>i.resourceKind==='evidence'),false);
 const requestId=ok(await f.owner.cmd('POST','/deletion-requests',{targetKind:'SOURCE',targetId:sourceId,expectedRevision:1,previewDigest:preview.previewDigest,reason:'合成删除独立来源，保留其他当前依据'})).resourceId as string;
 const current=()=>f.store.transaction(async tx=>(await tx.get('deletionRequests',requestId))!);
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/block`,{expectedRevision:1,previewDigest:preview.previewDigest,acknowledgeBlock:true}),200);
 for(const item of await f.store.transaction(tx=>tx.find('deletionItems',{requestId})))if(item.decision==='PENDING') {
  if(item.resourceKind==='talentSourceEvidenceGraph')assert.equal((await f.owner.cmd('POST',`/deletion-requests/${requestId}/decisions`,{expectedRevision:(await current()).revision,entryId:item.id,decision:'RETAIN_WITH_BASIS',decisionReason:'禁止把原核验改记到另一来源',retentionSourceId:sourceId})).status,422);
  ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/decisions`,{expectedRevision:(await current()).revision,entryId:item.id,decision:'APPLY_PROPOSED',decisionReason:'合成确认只清理该来源记录，其他依据保留'}),200);
 }
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/plan/freeze`,{expectedRevision:(await current()).revision,acknowledgePlan:true}),200);
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/cleaning/start`,{expectedRevision:(await current()).revision,planDigest:(await current()).planDigest,acknowledgeIrreversible:true}),200);
 return {requestId,current};
}
export async function verifyIndependentSourceErasure(f:Context) {
 const s=await seedIndependentSource(f),before=await f.store.transaction(async tx=>({fact:await tx.get('personLanguages',s.g.languageId),evidence:await tx.find('evidence',{personLanguageId:s.g.languageId})}));
 const r=await prepareSourceEvidenceDeletion(f,s.sourceId),faults=new FaultStore(f.store);
 faults.afterInsert=(table,row)=>{if(table==='audits'&&'action' in row&&row.action==='deletion.cleanup-item'&&'changedFields' in row&&row.changedFields.includes('talentSourceEvidenceGraph'))throw new Error('synthetic source evidence audit rollback');};
 const worker=new DeletionCleanup(faults,f.clock,f.app.config),claim=await worker.claim();assert.ok(claim);await worker.process(claim);
 assert.deepEqual(await f.store.transaction(tx=>tx.find('evidence',{personLanguageId:s.g.languageId})),before.evidence);
 assert.ok(await f.store.transaction(tx=>tx.get('fieldProposals',s.proposalId)));
 faults.afterInsert=null;const retry=await worker.claim();assert.ok(retry);await worker.process(retry);
 assert.deepEqual(await f.store.transaction(tx=>tx.get('personLanguages',s.g.languageId)),before.fact);
 assert.deepEqual(await f.store.transaction(tx=>tx.find('evidence',{personLanguageId:s.g.languageId})),before.evidence.filter(e=>e.sourceId!==s.sourceId));
 assert.equal(await f.store.transaction(tx=>tx.get('fieldProposals',s.proposalId)),null);
 const final=await f.app.deletionFinalization.claim();assert.ok(final);assert.deepEqual(await f.app.deletionFinalization.mediaTasks(final),[]);await f.app.deletionFinalization.finish(final);
 assert.equal((await r.current()).state,'COMPLETED');
 assert.equal((await f.store.transaction(tx=>tx.get('sources',s.sourceId)))!.status,'ERASED');
 const detail=ok(await f.owner.raw('GET',`/td2/people/${s.g.personId}`),200);
 assert.equal(detail.facts.personLanguages.find((row:any)=>row.id===s.g.languageId).speakingLevelCode,before.fact!.speakingLevelCode);
 const history=ok(await f.owner.raw('GET',`/td2/evidence?ownerKind=personLanguages&ownerId=${s.g.languageId}&fieldPath=speakingLevelCode`),200);
 assert.equal(history.total,1);assert.equal(history.items[0].source.id,s.g.sourceId);assert.equal(history.items[0].supportsCurrentValue,true);
 return {s,r};
}
