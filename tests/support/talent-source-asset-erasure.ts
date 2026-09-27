import assert from 'node:assert/strict';
import type {Application} from '../../packages/core/src/api.ts';
import type {Store} from '../../packages/core/src/store.ts';
import type {FakeClock,Client} from './fixtures.ts';
import {seedSharedProof} from './talent-asset-erasure.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
import {DeletionCleanup} from '../../packages/core/src/deletion-cleanup.ts';
import {FaultStore} from './fault-store.ts';
type Context={app:Application;store:Store;clock:FakeClock;owner:Client};
export async function prepareSourceAssets(f:Context,sourceId:string) {
 const preview=ok(await f.owner.raw('POST','/deletion-requests/preview',{targetKind:'SOURCE',targetId:sourceId,expectedRevision:1}),200);assert.equal(preview.complete,true,JSON.stringify(preview.unresolved));
 assert.ok(preview.items.some((i:any)=>i.resourceKind==='talentSourceAssetGraph'&&i.detailCode.endsWith(':C4:Q2:A1:P1')));
 const requestId=ok(await f.owner.cmd('POST','/deletion-requests',{targetKind:'SOURCE',targetId:sourceId,expectedRevision:1,previewDigest:preview.previewDigest,reason:'合成删除两份共享证明原件及其来源'})).resourceId as string;
 const current=()=>f.store.transaction(async tx=>(await tx.get('deletionRequests',requestId))!);
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/block`,{expectedRevision:1,previewDigest:preview.previewDigest,acknowledgeBlock:true}),200);
 for(const item of await f.store.transaction(tx=>tx.find('deletionItems',{requestId})))if(item.decision==='PENDING')ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/decisions`,{expectedRevision:(await current()).revision,entryId:item.id,decision:'APPLY_PROPOSED',decisionReason:'合成确认原件删除与全部共享引用清理'}),200);
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/plan/freeze`,{expectedRevision:(await current()).revision,acknowledgePlan:true}),200);
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/cleaning/start`,{expectedRevision:(await current()).revision,planDigest:(await current()).planDigest,acknowledgeIrreversible:true}),200);
 return {requestId,current};
}
export async function verifySourceAssetErasure(f:Context,root:string) {
 const s=await seedSharedProof(f,root,true);assert.ok(s.secondAssetId);assert.ok(s.secondCredentialId);
 const before=await f.store.transaction(async tx=>({items:await tx.find('mediaCollectionItems',{personId:s.g.personId}),evidence:await tx.find('evidence',{sourceId:s.g.sourceId}),adult:await tx.get('adultEligibilities',s.adultId)}));
 const r=await prepareSourceAssets(f,s.mediaSourceId),faults=new FaultStore(f.store);
 faults.afterInsert=(table,row)=>{if(table==='audits'&&'action' in row&&row.action==='deletion.cleanup-item'&&'changedFields' in row&&row.changedFields.includes('talentSourceAssetGraph'))throw new Error('synthetic source assets audit rollback');};
 const worker=new DeletionCleanup(faults,f.clock,f.app.config),claim=await worker.claim();assert.ok(claim);await worker.process(claim);
 assert.deepEqual(await f.store.transaction(tx=>tx.find('mediaCollectionItems',{personId:s.g.personId})),before.items);assert.deepEqual(await f.store.transaction(tx=>tx.get('adultEligibilities',s.adultId)),before.adult);
 faults.afterInsert=null;const retry=await worker.claim();assert.ok(retry);await worker.process(retry);
 for(const id of [s.credentialId,s.secondCredentialId])assert.equal((await f.store.transaction(tx=>tx.get('personCredentials',id)))!.status,'REVOKED');
 assert.equal((await f.store.transaction(tx=>tx.get('adultEligibilities',s.adultId)))!.state,'UNKNOWN');
 for(const collectionId of [s.g.collectionId,s.collection2]){const entries=await f.store.transaction(tx=>tx.find('mediaCollectionItems',{collectionId}));assert.equal(entries.length,1);assert.equal(entries[0]!.assetId,s.keptAssetId);assert.equal(entries[0]!.orderIndex,0);}
 assert.deepEqual(await f.store.transaction(tx=>tx.find('evidence',{sourceId:s.g.sourceId})),before.evidence);
 const final=await f.app.deletionFinalization.claim();assert.ok(final);const tasks=await f.app.deletionFinalization.mediaTasks(final);assert.deepEqual(tasks.map(t=>t.mediaId).sort(),[s.assetId,s.secondAssetId].sort());
 for(const task of tasks){await s.provider.purge(task.mediaId);await f.app.deletionFinalization.completeMediaPurge(final,task.mediaId);}
 await f.app.deletionFinalization.finish(final);assert.equal((await r.current()).state,'COMPLETED');assert.equal((await f.store.transaction(tx=>tx.get('sources',s.mediaSourceId)))!.status,'ERASED');assert.equal((await f.store.transaction(tx=>tx.get('assets',s.keptAssetId)))!.state,'READY');
 await s.provider.verifyAsset((await f.store.transaction(tx=>tx.get('assets',s.keptAssetId)))!);
 return {s,r};
}
