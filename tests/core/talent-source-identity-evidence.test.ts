import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,member} from '../support/fixtures.ts';
import {verifySourceOtherIdentity,seedSourceOtherIdentity} from '../support/talent-source-identity-evidence.ts';
import {prepareSourceFacts} from '../support/talent-source-fact-erasure.ts';
import {expectResponse as ok} from '../support/talent-v2-maintenance.ts';
test('TD2 source fact deletion withdraws other identity evidence atomically and rechecks the frozen surviving proof at completion',async()=>{await verifySourceOtherIdentity(await fixture());});
test('TD2 combined source identity withdrawal rejects the last basis before making a deletion plan',async()=>{
 const f=await fixture(),t=await seedSourceOtherIdentity(f,false),p=ok(await f.owner.raw('POST','/deletion-requests/preview',{targetKind:'SOURCE',targetId:t.s.sourceId,expectedRevision:1}),200);assert.equal(p.complete,false);assert.ok(p.unresolved.some((x:any)=>x.code==='TD2_SOURCE_INDEPENDENT_EVIDENCE_REQUIRED'));assert.ok(await f.store.transaction(tx=>tx.get('personRoles',t.s.roleId)));
});
test('TD2 combined source identity withdrawal hides an out-of-scope independent basis from administrators',async()=>{
 const f=await fixture(),t=await seedSourceOtherIdentity(f),admin=await member(f,'other_identity_admin','ADMIN'),scopeId=ok(await f.owner.cmd('POST','/scopes',{name:'合成私有身份依据',membershipIds:[f.membershipId]})).resourceId;
 ok(await f.owner.cmd('PATCH',`/records/source/${t.basisId}/scope`,{expectedRevision:1,scopeId}),200);
 const p=ok(await admin.client.raw('POST','/deletion-requests/preview',{targetKind:'SOURCE',targetId:t.s.sourceId,expectedRevision:1}),200);assert.equal(p.complete,false);assert.ok(p.unresolved.some((x:any)=>x.code==='TD2_HIDDEN_DEPENDENCY'));assert.equal(p.items.some((x:any)=>x.resourceKind==='talentSourceIdentityEvidence'),false);
});
test('TD2 combined source identity withdrawal binds independent source changes before freeze',async()=>{
 const f=await fixture(),t=await seedSourceOtherIdentity(f),r=await prepareSourceFacts(f,t.s);
 ok(await f.owner.cmd('POST',`/sources/${t.basisId}/suspend`,{expectedRevision:1,reason:'合成冻结前独立依据失效'}),200);
 const response=await f.owner.cmd('POST',`/deletion-requests/${r.requestId}/plan/freeze`,{expectedRevision:(await r.current()).revision,acknowledgePlan:true});assert.equal(response.status,409);assert.equal(ok(response,409).error.code,'TD2_ERASURE_GRAPH_STALE');assert.ok(await f.store.transaction(tx=>tx.get('personRoles',t.s.roleId)));
});
