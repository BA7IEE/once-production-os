import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type COS from 'cos-nodejs-sdk-v5';
import {MemoryStore} from '../support/memory-store.ts';
import {stagingFixture,unitReady} from '../support/media-staging.ts';
import {LocalMediaProvider} from '../../apps/api/src/media/local-provider.ts';
import {CosMediaProvider} from '../../apps/api/src/media/cos-provider.ts';
import {MediaPurgeWorker} from '../../apps/api/src/media/purge-worker.ts';
import {PURGE_LIMITS} from '../../packages/core/src/media-purge-model.ts';

test('COS uncertain namespace prevents purge worker from finalizing or releasing retained data',async()=>{
 const root=await mkdtemp(join(tmpdir(),'once-cos-worker-'));try{
  await LocalMediaProvider.create(root);
  const store=new MemoryStore(),f=await stagingFixture(store);await unitReady(f);
  f.app.config.dataCleanupMode='INTERNAL_APPROVED';
  const relation=store.rows('personMedia')[0]!;f.clock.advance(Date.parse(relation.retainUntil!)-f.clock.now().getTime());
  const owner='synthetic-owner',calls={bucket:0,head:0,list:0};
  const sdk={
   getBucketAcl:async()=>{calls.bucket++;return {ACL:'private',Owner:{ID:owner},Grants:[{Grantee:{ID:owner},Permission:'FULL_CONTROL'}]};},
   getBucketVersioning:async()=>({VersioningConfiguration:{}}),getBucketPolicy:async()=>({Policy:{}}),
   headObject:async()=>{calls.head++;throw {statusCode:404};},
   getBucket:async()=>{calls.list++;return {statusCode:200,IsTruncated:'false',Contents:[]};},
  } as unknown as COS;
  const provider=new CosMediaProvider(root,sdk,{Bucket:'synthetic-123456',Region:'ap-guangzhou'},'isolated');
  const claim=await f.app.mediaPurge.claim();assert.ok(claim);
  await f.app.mediaPurge.beginDelete(claim);
  await f.app.mediaPurge.objectResult(claim,'original','MISSING'); // Legacy observation must be rechecked.
  await new MediaPurgeWorker(f.app,provider).process(claim,new AbortController().signal);
  const intent=store.rows('mediaPurgeIntents')[0]!,asset=store.rows('assets')[0]!,upload=store.rows('uploads')[0]!;
  assert.equal(intent.state,'DELETE_UNKNOWN');assert.equal(asset.state,'READY');assert.equal(asset.usageState,'RETIRED');
  assert.ok(intent.objects.every(o=>o.state==='UNKNOWN'),'an unverified HEAD 404 must not be recorded as physical absence');
  assert.equal(upload.purgedAt,null);assert.ok(upload.expectedBytes>0);
  const prior={...calls};f.clock.advance(PURGE_LIMITS.retryMs);
  const retry=await f.app.mediaPurge.claim();assert.ok(retry);
  await new MediaPurgeWorker(f.app,provider).process(retry,new AbortController().signal);
  assert.deepEqual(calls,prior,'a quarantined upload must not trigger repeated cloud probes');
  assert.ok(store.rows('mediaPurgeIntents')[0]!.objects.every(o=>o.state==='UNKNOWN'));
 }finally{await rm(root,{recursive:true,force:true});}
});
