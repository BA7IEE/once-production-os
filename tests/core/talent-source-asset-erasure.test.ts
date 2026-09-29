import {test} from 'node:test';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture} from '../support/fixtures.ts';
import {verifySourceAssetErasure} from '../support/talent-source-asset-erasure.ts';
test('TD2 source asset batch clears both originals from shared collections and proofs atomically, preserving independent original and field history',async()=>{
 const root=await mkdtemp(join(await realpath(tmpdir()),'once-source-proof-'));
 try{await verifySourceAssetErasure(await fixture(),root);}finally{await rm(root,{recursive:true,force:true});}
});
test('TD2 source asset batch rejects changed original metadata before clearing any proof or shared collection',async()=>{
 const {seedSharedProof}=await import('../support/talent-asset-erasure.ts');const {prepareSourceAssets}=await import('../support/talent-source-asset-erasure.ts');const {DeletionCleanup}=await import('../../packages/core/src/deletion-cleanup.ts');const {default:assert}=await import('node:assert/strict');
 const f=await fixture(),root=await mkdtemp(join(await realpath(tmpdir()),'once-source-proof-stale-'));
 try {const s=await seedSharedProof(f,root,true),r=await prepareSourceAssets(f,s.mediaSourceId);
  await f.store.transaction(async tx=>{const a=(await tx.get('assets',s.secondAssetId!))!;await tx.replace('assets',{...a,fileName:'synthetic-concurrent-change.png',revision:a.revision+1});});
  const worker=new DeletionCleanup(f.store,f.clock,f.app.config),claim=await worker.claim();assert.ok(claim);await worker.process(claim);
  const item=(await f.store.transaction(tx=>tx.find('deletionItems',{requestId:r.requestId}))).find(i=>i.resourceKind==='talentSourceAssetGraph')!;assert.equal(item.cleanupState,'FAILED');assert.equal(item.cleanupErrorCode,'TD2_ERASURE_GRAPH_STALE');
  assert.equal((await f.store.transaction(tx=>tx.find('mediaCollectionItems',{assetId:s.assetId}))).length,2);assert.equal((await f.store.transaction(tx=>tx.find('mediaCollectionItems',{assetId:s.secondAssetId!}))).length,2);
  assert.equal((await f.store.transaction(tx=>tx.get('personCredentials',s.credentialId)))!.status,'VERIFIED');await s.provider.verifyAsset((await f.store.transaction(tx=>tx.get('assets',s.assetId)))!);
 }finally{await rm(root,{recursive:true,force:true});}
});
