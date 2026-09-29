import assert from 'node:assert/strict';
import type {FactErasureContext} from './talent-source-fact-erasure.ts';
import {verifyHistoryErasure} from './merge-history-erasure.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
import {talentSnapshot,inspectTalentIntegrity} from '../../packages/core/src/talent-v2-integrity.ts';
import {FaultStore} from './fault-store.ts';
import {DeletionCleanup} from '../../packages/core/src/deletion-cleanup.ts';
export async function eraseSourceAfterHistory(f:FactErasureContext,t:Awaited<ReturnType<typeof verifyHistoryErasure>>,beforeFreeze?:(requestId:string)=>Promise<void>){
 const sourceId=t.s.b.sourceId,source=(await f.store.transaction(tx=>tx.get('sources',sourceId)))!,input={targetKind:'SOURCE',targetId:sourceId,expectedRevision:source.revision};
 const preview=ok(await f.owner.raw('POST','/deletion-requests/preview',input),200);assert.equal(preview.complete,true,JSON.stringify(preview.unresolved));assert.ok(preview.items.some((i:any)=>i.resourceKind==='talentSourceFactGraph'));
 const requestId=ok(await f.owner.cmd('POST','/deletion-requests',{...input,previewDigest:preview.previewDigest,reason:'合成旧身份已完成独立清理，再逐项删除其原始来源'})).resourceId as string,current=()=>f.store.transaction(async tx=>(await tx.get('deletionRequests',requestId))!);
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/block`,{expectedRevision:1,previewDigest:preview.previewDigest,acknowledgeBlock:true}),200);
 for(const item of await f.store.transaction(tx=>tx.find('deletionItems',{requestId})))if(item.decision==='PENDING')ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/decisions`,{expectedRevision:(await current()).revision,entryId:item.id,decision:'APPLY_PROPOSED',decisionReason:'合成明确删除该来源剩余资料，保留原历史清理证据'}),200);
 if(beforeFreeze)await beforeFreeze(requestId);
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/plan/freeze`,{expectedRevision:(await current()).revision,acknowledgePlan:true}),200);ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/cleaning/start`,{expectedRevision:(await current()).revision,planDigest:(await current()).planDigest,acknowledgeIrreversible:true}),200);
 const frozen=await f.store.transaction(tx=>talentSnapshot(tx,source.workspaceId)),faults=new FaultStore(f.store);faults.afterInsert=(table,row)=>{if(table==='audits'&&'action'in row&&row.action==='deletion.cleanup-item'&&'changedFields'in row&&row.changedFields.includes('talentSourceFactGraph'))throw new Error('synthetic source after historical erasure rollback');};
 const worker=new DeletionCleanup(faults,f.clock,f.app.config),claim=await worker.claim();assert.ok(claim);await worker.process(claim);assert.deepEqual(await f.store.transaction(tx=>talentSnapshot(tx,source.workspaceId)),frozen);faults.afterInsert=null;const retry=await worker.claim();assert.ok(retry);await worker.process(retry);
 const final=await f.app.deletionFinalization.claim();assert.ok(final);await f.app.deletionFinalization.finish(final);assert.equal((await current()).state,'COMPLETED',JSON.stringify(await current()));
 const after=await f.store.transaction(tx=>talentSnapshot(tx,source.workspaceId));assert.equal(after.sources.find(s=>s.id===sourceId)!.status,'ERASED');assert.deepEqual(after.personAliases,t.after.personAliases);assert.deepEqual(after.personMerges,t.after.personMerges);assert.deepEqual(after.mergeHistoryErasures,t.after.mergeHistoryErasures);assert.equal((await f.owner.raw('GET',`/td2/people/${t.s.a.personId}`)).status,200);assert.equal((await f.store.transaction(tx=>inspectTalentIntegrity(tx,source.workspaceId,f.app.config.contactKey))).relationFailures,0);
 console.log('PASS source after separately reviewed old identity erasure: exact prior aliases/decisions/markers preserved, remaining source facts removed atomically with audit rollback/retry, canonical identity remains readable');
 return {requestId,current};
}
