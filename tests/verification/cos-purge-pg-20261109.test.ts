import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {PrismaClient} from '@prisma/client';
import type COS from 'cos-nodejs-sdk-v5';
import {registeredTemp} from '../../scripts/registered-temp.mjs';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {stagingFixture,unitReady} from '../support/media-staging.ts';
import {LocalMediaProvider} from '../../apps/api/src/media/local-provider.ts';
import {CosMediaProvider} from '../../apps/api/src/media/cos-provider.ts';
import {MediaPurgeWorker} from '../../apps/api/src/media/purge-worker.ts';

test('owned PostgreSQL: exact hidden COS key is deleted but incomplete inventory retains the asset and quota',async()=>{
 assert.equal(process.env.ALLOW_DB_TESTS,'yes');assert.ok(process.env.ONCE_RESOURCE_RUN_DIR);
 const raw=process.env.DATABASE_URL_TEST;assert.ok(raw);const url=new URL(raw);
 assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));assert.match(url.pathname,/^\/once_test_[a-z0-9_]+$/);assert.ok(url.username&&url.password&&!url.search&&!url.hash);
 const store=new PrismaStore(new PrismaClient({datasources:{db:{url:raw}},log:[]})),temp=registeredTemp({short:true});
 try{
  assert.equal(await store.client.workspace.count(),0);
  const f=await stagingFixture(store),id=await unitReady(f);f.app.config.dataCleanupMode='INTERNAL_APPROVED';
  const relation=await store.client.personMedia.findFirstOrThrow({where:{assetId:id}});
  f.clock.advance(relation.retainUntil!.getTime()-f.clock.now().getTime());
  const stored=await store.client.mediaAsset.findUniqueOrThrow({where:{id}});
  const hidden=`isolated/uploads/${stored.uploadId}/${stored.objectToken}/original.bin`;
  const sibling=`isolated/uploads/00000000-0000-4000-8000-000000000001/${stored.objectToken}/original.bin`;
  const objects=new Set([hidden,sibling]),deletes:string[]=[];
  const root=join(temp.path,'media');
  const owner='synthetic-owner',sdk={
   getBucketAcl:async()=>({ACL:'private',Owner:{ID:owner},Grants:[{Grantee:{ID:owner},Permission:'FULL_CONTROL'}]}),
   getBucketVersioning:async()=>({VersioningConfiguration:{}}),getBucketPolicy:async()=>({Policy:{}}),
   headObject:async()=>{throw {statusCode:404};},getBucket:async()=>({statusCode:200,IsTruncated:'false',Contents:[]}),
   deleteObject:async({Key}:{Key:string})=>{
    const receipt=JSON.parse(await readFile(join(root,'trash',stored.uploadId,'.cos-reconciliation.json'),'utf8'));
    assert.equal(receipt.candidates.find((candidate:any)=>candidate.key===Key)?.delete,'UNKNOWN');
    deletes.push(Key);objects.delete(Key);return {statusCode:204};
   },
  } as unknown as COS;
  await LocalMediaProvider.create(root);
  const provider=new CosMediaProvider(root,sdk,{Bucket:'synthetic-123456',Region:'ap-guangzhou'},'isolated');
  const claim=await f.app.mediaPurge.claim();assert.ok(claim);
  await new MediaPurgeWorker(f.app,provider).process(claim,new AbortController().signal);
  assert.equal(objects.has(hidden),false);assert.equal(objects.has(sibling),true);assert.ok(deletes.includes(hidden));
  const [intent,asset,upload,personMedia]=await Promise.all([
   store.client.mediaPurgeIntent.findUniqueOrThrow({where:{id:claim.id}}),store.client.mediaAsset.findUniqueOrThrow({where:{id}}),
   store.client.mediaUpload.findUniqueOrThrow({where:{id}}),store.client.personMedia.findFirstOrThrow({where:{assetId:id}}),
  ]);
  assert.equal(intent.state,'DELETE_UNKNOWN');assert.equal(intent.purgedAt,null);
  assert.ok(Array.isArray(intent.objects)&&intent.objects.every((o:any)=>o.state==='UNKNOWN'));
  assert.equal(asset.state,'READY');assert.equal(asset.usageState,'RETIRED');
  assert.equal(upload.purgedAt,null);assert.ok(upload.expectedBytes>0);assert.equal(personMedia.purgedAt,null);
 }finally{await store.close();temp.cleanup();}
});
