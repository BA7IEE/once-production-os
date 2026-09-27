import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../support/fixtures.ts';
import {verifySourceFactErasure,seedSourceFacts,prepareSourceFacts} from '../support/talent-source-fact-erasure.ts';
import {expectResponse as ok} from '../support/talent-v2-maintenance.ts';
test('TD2 source facts independently retain or erase with atomic graph rollback and preserve candidate history pending explicit role review',async()=>{await verifySourceFactErasure(await fixture());});
test('TD2 source plan cannot retain a child while erasing its parent role',async()=>{
 const f=await fixture(),s=await seedSourceFacts(f);await s.prove('mediaCollections',s.collectionId);
 const r=await prepareSourceFacts(f,s,[s.languageId,s.collectionId]);
 const response=await f.owner.cmd('POST',`/deletion-requests/${r.requestId}/plan/freeze`,{expectedRevision:(await r.current()).revision,acknowledgePlan:true});assert.equal(response.status,409);assert.equal(ok(response,409).error.code,'TD2_SOURCE_PARENT_ERASED');
 assert.ok(await f.store.transaction(tx=>tx.get('personRoles',s.roleId)));
});
test('TD2 source fact retention requires actual field coverage and later changes invalidate a frozen plan',async()=>{
 const f=await fixture(),s=await seedSourceFacts(f),r=await prepareSourceFacts(f,s);
 const roleItem=(await f.store.transaction(tx=>tx.find('deletionItems',{requestId:r.requestId,resourceId:s.roleId})))[0]!;
 const rejected=await f.owner.cmd('POST',`/deletion-requests/${r.requestId}/decisions`,{expectedRevision:(await r.current()).revision,entryId:roleItem.id,decision:'RETAIN_WITH_BASIS',decisionReason:'合成缺少逐字段证据，不能凭空换依据',retentionSourceId:s.basisId});assert.equal(rejected.status,409);assert.equal(ok(rejected,409).error.code,'TD2_SOURCE_FACT_BASIS_INCOMPLETE');
 assert.equal((await f.store.transaction(tx=>tx.get('deletionItems',roleItem.id)))!.decision,'APPLY_PROPOSED');
 ok(await f.owner.cmd('POST',`/deletion-requests/${r.requestId}/plan/freeze`,{expectedRevision:(await r.current()).revision,acknowledgePlan:true}),200);
 const proposal=ok(await f.owner.cmd('POST','/td2/proposals',{schemaVersion:'once-talent-v2.0.0',ownerKind:'personLanguages',ownerId:s.languageId,fieldPath:'speakingLevelCode',expectedRevision:1,sourceId:s.basisId,sourceRevision:1,proposedValue:'NATIVE'})).resourceId;
 ok(await f.owner.cmd('POST',`/td2/proposals/${proposal}/decide`,{schemaVersion:'once-talent-v2.0.0',expectedRevision:1,decision:'APPLY'}),200);
 const stale=await f.owner.cmd('POST',`/deletion-requests/${r.requestId}/cleaning/start`,{expectedRevision:(await r.current()).revision,planDigest:(await r.current()).planDigest,acknowledgeIrreversible:true});assert.equal(stale.status,409);assert.equal(ok(stale,409).error.code,'TD2_ERASURE_GRAPH_STALE');
 assert.equal((await r.current()).state,'BLOCKED_FOR_USE');assert.ok(await f.store.transaction(tx=>tx.get('personRoles',s.roleId)));
});
