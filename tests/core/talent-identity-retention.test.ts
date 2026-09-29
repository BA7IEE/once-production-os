import {test} from 'node:test';
import {fixture} from '../support/fixtures.ts';
import {verifyIdentityRetention} from '../support/talent-identity-retention.ts';
test('TD2 retained identity and professional facts preserve original source and independently checked field evidence',async()=>{await verifyIdentityRetention(await fixture());});
test('TD2 ordinary identity remains accessible on independent evidence without becoming talent',async()=>{await verifyIdentityRetention(await fixture(),false);});

test('TD2 persisted legacy person-rebind cleanup cannot rewrite the original source',async()=>{
 const {default:assert}=await import('node:assert/strict');
 const {sourceInput}=await import('../support/fixtures.ts');
 const {expectResponse:ok}=await import('../support/talent-v2-maintenance.ts');
 const {frozenDeletionPlan}=await import('../../packages/core/src/deletion-model.ts');
 const {digest}=await import('../../packages/core/src/json.ts');
 const f=await fixture(),schemaVersion='once-talent-v2.0.0';
 const sourceId=ok(await f.owner.cmd('POST','/sources',sourceInput())).resourceId as string;
 const basisId=ok(await f.owner.cmd('POST','/sources',sourceInput())).resourceId as string;
 const personId=ok(await f.owner.cmd('POST','/td2/people',{schemaVersion,originSourceId:sourceId,sourceRevision:1,displayName:'合成旧计划重绑阻断'})).resourceId as string;
 for(const fieldPath of ['displayName','aliases','intro'])ok(await f.owner.cmd('POST','/td2/evidence',{schemaVersion,ownerKind:'person',ownerId:personId,fieldPath,expectedRevision:f.store.rows('people').find(p=>p.id===personId)!.revision,sourceId:basisId,sourceRevision:1}),200);
 const preview=ok(await f.owner.raw('POST','/deletion-requests/preview',{targetKind:'SOURCE',targetId:sourceId,expectedRevision:1}),200);
 const requestId=ok(await f.owner.cmd('POST','/deletion-requests',{targetKind:'SOURCE',targetId:sourceId,expectedRevision:1,previewDigest:preview.previewDigest,reason:'合成历史版本冻结计划'})).resourceId as string;
 const current=()=>f.store.rows('deletionRequests').find(r=>r.id===requestId)!;
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/block`,{expectedRevision:1,previewDigest:preview.previewDigest,acknowledgeBlock:true}),200);
 for(const item of f.store.rows('deletionItems').filter(i=>i.requestId===requestId&&i.decision==='PENDING'))ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/decisions`,{expectedRevision:current().revision,entryId:item.id,decision:item.resourceKind==='person'?'RETAIN_WITH_BASIS':'APPLY_PROPOSED',decisionReason:'合成完整独立依据',...(item.resourceKind==='person'?{retentionSourceId:basisId}:{})}),200);
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/plan/freeze`,{expectedRevision:current().revision,acknowledgePlan:true}),200);
 // Model a persisted pre-TD2 plan, including its old, internally consistent frozen digest.
 await f.store.transaction(async tx=>{for(const item of await tx.find('deletionItems',{requestId})){if(item.resourceKind==='talentSourceFactGraph')await tx.remove('deletionItems',item.id);else if(item.resourceKind==='person')await tx.replace('deletionItems',{...item,dependencyKind:'SOURCE_OWNS_PERSON',detailCode:'SUBJECT_MAY_REQUIRE_INDEPENDENT_BASIS'});}const items=await tx.find('deletionItems',{requestId}),row=(await tx.get('deletionRequests',requestId))!;await tx.replace('deletionRequests',{...row,impactCount:items.length,planDigest:digest(frozenDeletionPlan(row,items))});});
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/cleaning/start`,{expectedRevision:current().revision,planDigest:current().planDigest,acknowledgeIrreversible:true}),200);
 const claim=await f.app.deletionCleanup.claim();assert.ok(claim);await f.app.deletionCleanup.process(claim);
 const entry=f.store.rows('deletionItems').find(i=>i.requestId===requestId&&i.resourceKind==='person')!;
 assert.equal(entry.cleanupState,'FAILED');assert.equal(entry.cleanupErrorCode,'TD2_IDENTITY_PLAN_REFRESH_REQUIRED');assert.equal(f.store.rows('people').find(p=>p.id===personId)!.sourceId,sourceId);assert.equal(current().state,'CLEANING');
});
