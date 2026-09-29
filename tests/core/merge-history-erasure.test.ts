import {test} from 'node:test';
import {fixture} from '../support/fixtures.ts';
import {verifyHistoryErasure} from '../support/merge-history-erasure.ts';
test('TD2 erases whole merged identity and retained profiles while retaining explicit immutable lineage',async()=>{await verifyHistoryErasure(await fixture());});
test('TD2 old merged identity erasure leaves canonical professional facts and measurements unchanged',async()=>{await verifyHistoryErasure(await fixture(),true);});

test('TD2 historical erasure requires merge permission and never reveals a hidden old identity to administrators',async()=>{
 const {default:assert}=await import('node:assert/strict');const {member}=await import('../support/fixtures.ts');const {seedHistoryErasure}=await import('../support/merge-history-erasure.ts');const {expectResponse:ok}=await import('../support/talent-v2-maintenance.ts');
 const f=await fixture(),s=await seedHistoryErasure(f),p=await s.a.current(),editor=await member(f,'history_eraser','EDITOR',['data.delete','sensitive.write']);
 const input={targetKind:'PERSON',targetId:p.id,expectedRevision:p.revision},denied=ok(await editor.client.raw('POST','/deletion-requests/preview',input),200);assert.equal(denied.complete,false);assert.ok(denied.unresolved.some((x:any)=>x.code==='TD2_HISTORY_MERGE_PERMISSION_REQUIRED'));
 const admin=await member(f,'history_admin','ADMIN'),scopeId=ok(await f.owner.cmd('POST','/scopes',{name:'合成旧身份专属范围',membershipIds:[f.membershipId]})).resourceId;
 await f.store.transaction(async tx=>{const old=(await tx.get('people',s.b.personId))!;await tx.replace('people',{...old,scopeId});});
 const hidden=ok(await admin.client.raw('POST','/deletion-requests/preview',input),200);assert.equal(hidden.complete,false);assert.ok(hidden.unresolved.some((x:any)=>x.code==='TD2_HIDDEN_DEPENDENCY'));assert.equal(hidden.items.some((i:any)=>i.resourceKind==='talentGraph'),false);assert.equal(ok(await admin.client.raw('GET',`/people/${p.id}/merge-history`),200).items.length,0);
});

test('TD2 archived identity content changed after blocking invalidates its frozen erasure plan',async()=>{
 const {default:assert}=await import('node:assert/strict');const {seedHistoryErasure}=await import('../support/merge-history-erasure.ts');const {expectResponse:ok}=await import('../support/talent-v2-maintenance.ts');
 const f=await fixture(),s=await seedHistoryErasure(f),p=await s.a.current(),input={targetKind:'PERSON',targetId:p.id,expectedRevision:p.revision},preview=ok(await f.owner.raw('POST','/deletion-requests/preview',input),200);
 const requestId=ok(await f.owner.cmd('POST','/deletion-requests',{...input,previewDigest:preview.previewDigest,reason:'合成旧身份变化使冻结计划失效'})).resourceId as string;
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/block`,{expectedRevision:1,previewDigest:preview.previewDigest,acknowledgeBlock:true}),200);
 for(const item of f.store.rows('deletionItems').filter(i=>i.requestId===requestId&&i.decision==='PENDING'))ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/decisions`,{expectedRevision:f.store.rows('deletionRequests').find(r=>r.id===requestId)!.revision,entryId:item.id,decision:'APPLY_PROPOSED',decisionReason:'合成明确清理原旧身份内容'}),200);
 await f.store.transaction(async tx=>{const old=(await tx.get('people',s.b.personId))!;await tx.replace('people',{...old,revision:old.revision+1,intro:'合成冻结后变化，必须重新评估'});});
 const response=ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/plan/freeze`,{expectedRevision:f.store.rows('deletionRequests').find(r=>r.id===requestId)!.revision,acknowledgePlan:true}),409);assert.equal(response.error.code,'TD2_ERASURE_GRAPH_STALE');assert.equal(f.store.rows('mergeHistoryErasures').length,0);assert.equal(f.store.rows('talentProfiles').filter(p=>p.personId===s.b.personId).length,1);
});

test('TD2 cleared history markers still require the old identity scope and merge permission',async()=>{
 const {default:assert}=await import('node:assert/strict');const {member}=await import('../support/fixtures.ts');const {expectResponse:ok}=await import('../support/talent-v2-maintenance.ts');
 const f=await fixture(),t=await verifyHistoryErasure(f,true),viewer=await member(f,'erased_history_viewer','VIEWER'),admin=await member(f,'erased_history_admin','ADMIN'),path=`/people/${t.s.a.personId}/merge-history`;
 assert.equal((await viewer.client.raw('GET',path)).status,403);assert.equal(ok(await admin.client.raw('GET',path),200).items.length,3);
 const scopeId=ok(await f.owner.cmd('POST','/scopes',{name:'清理后身份仍受范围限制',membershipIds:[f.membershipId]})).resourceId;
 await f.store.transaction(async tx=>{const old=(await tx.get('people',t.s.b.personId))!;await tx.replace('people',{...old,scopeId});});assert.equal(ok(await admin.client.raw('GET',path),200).items.length,0);
});
