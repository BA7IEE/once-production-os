import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,member} from '../support/fixtures.ts';
import {expectResponse as ok} from '../support/talent-v2-maintenance.ts';
import {seedIndependentSource,prepareSourceEvidenceDeletion,verifyIndependentSourceErasure} from '../support/talent-source-erasure.ts';
import {DeletionCleanup} from '../../packages/core/src/deletion-cleanup.ts';
test('TD2 independent evidence source erasure retains exact other facts and provenance, rolls back audit failure and finishes after retry',async()=>{await verifyIndependentSourceErasure(await fixture());});
test('TD2 independent source cannot erase the only basis of the current value or rewrite its reviewer to another source',async()=>{
 const f=await fixture(),s=await seedIndependentSource(f);
 ok(await f.owner.cmd('POST',`/td2/proposals/${s.proposalId}/decide`,{schemaVersion:'once-talent-v2.0.0',expectedRevision:1,decision:'APPLY'}),200);
 const preview=ok(await f.owner.raw('POST','/deletion-requests/preview',{targetKind:'SOURCE',targetId:s.sourceId,expectedRevision:1}),200);
 assert.equal(preview.complete,false);assert.ok(preview.unresolved.some((r:any)=>r.code==='TD2_SOURCE_INDEPENDENT_EVIDENCE_REQUIRED'));
 assert.equal((await f.store.transaction(tx=>tx.get('personLanguages',s.g.languageId)))!.readingLevelCode,'FLUENT');
});
test('TD2 frozen independent source cleanup rechecks surviving basis and rejects a suspended source',async()=>{
 const f=await fixture(),s=await seedIndependentSource(f),r=await prepareSourceEvidenceDeletion(f,s.sourceId);
 ok(await f.owner.cmd('POST',`/sources/${s.g.sourceId}/suspend`,{expectedRevision:1,reason:'合成保留依据失效'}),200);
 const worker=new DeletionCleanup(f.store,f.clock,f.app.config),claim=await worker.claim();assert.ok(claim);await worker.process(claim);
 assert.equal((await f.store.transaction(tx=>tx.find('evidence',{sourceId:s.sourceId}))).length,1);
 const item=(await f.store.transaction(tx=>tx.find('deletionItems',{requestId:r.requestId}))).find(i=>i.resourceKind==='talentSourceEvidenceGraph')!;
 assert.equal(item.cleanupState,'FAILED');assert.equal(item.cleanupErrorCode,'TD2_ERASURE_GRAPH_STALE');
});
test('TD2 source preview blocks when its professional owner is outside the current operator scope',async()=>{
 const f=await fixture(),s=await seedIndependentSource(f),admin=await member(f,'source_erasure_admin','ADMIN');
 const privateScope=ok(await f.owner.cmd('POST','/scopes',{name:'合成私有专业资料',membershipIds:[f.membershipId]})).resourceId;
 ok(await f.owner.cmd('PATCH',`/records/person/${s.g.personId}/scope`,{expectedRevision:(await s.g.current()).revision,scopeId:privateScope}),200);
 const preview=ok(await admin.client.raw('POST','/deletion-requests/preview',{targetKind:'SOURCE',targetId:s.sourceId,expectedRevision:1}),200);
 assert.equal(preview.complete,false);assert.ok(preview.unresolved.some((r:any)=>r.code==='TD2_HIDDEN_DEPENDENCY'));
 assert.equal(preview.items.some((i:any)=>i.resourceKind==='talentSourceEvidenceGraph'),false);
});
