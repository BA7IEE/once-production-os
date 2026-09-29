import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,member} from '../support/fixtures.ts';
import {seedHistoryErasure,verifyHistoryErasure} from '../support/merge-history-erasure.ts';
import {eraseSourceAfterHistory} from '../support/source-after-history-erasure.ts';
import {expectResponse as ok} from '../support/talent-v2-maintenance.ts';
test('TD2 source cleanup still blocks unreviewed merged payload and requires merge permission after separate historical cleanup',async()=>{
 const f=await fixture(),s=await seedHistoryErasure(f),input={targetKind:'SOURCE',targetId:s.b.sourceId,expectedRevision:1};
 const blocked=ok(await f.owner.raw('POST','/deletion-requests/preview',input),200);assert.equal(blocked.complete,false);assert.ok(blocked.unresolved.some((u:any)=>u.code==='TD2_MERGE_HISTORY_RETENTION_REQUIRED'));
 const t=await verifyHistoryErasure(f,true),editor=await member(f,'source_history_editor','EDITOR',['data.delete','sensitive.write']);
 const denied=ok(await editor.client.raw('POST','/deletion-requests/preview',{...input,targetId:t.s.b.sourceId}),200);assert.equal(denied.complete,false);assert.ok(denied.unresolved.some((u:any)=>u.code==='TD2_HISTORY_MERGE_PERMISSION_REQUIRED'));
});
test('TD2 source freeze rechecks separately cleared old identity scopes and its exact prior history',async()=>{
 const f=await fixture(),t=await verifyHistoryErasure(f,true),old=(await t.s.b.current()),other=await member(f,'other_history_scope','ADMIN'),scopeId=ok(await other.client.cmd('POST','/scopes',{name:'合成清理记录保护范围',membershipIds:[other.id]})).resourceId;
 await eraseSourceAfterHistory(f,t,async requestId=>{
  await f.store.transaction(tx=>tx.replace('people',{...old,scopeId}));
  const request=(await f.store.transaction(tx=>tx.get('deletionRequests',requestId)))!;
  const refused=ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/plan/freeze`,{expectedRevision:request.revision,acknowledgePlan:true}),409);assert.equal(refused.error.code,'TD2_ERASURE_GRAPH_STALE');
  assert.equal((await f.store.transaction(tx=>tx.get('sources',t.s.b.sourceId)))!.status,'CONFIRMED');
  await f.store.transaction(tx=>tx.replace('people',old));
 });
});
