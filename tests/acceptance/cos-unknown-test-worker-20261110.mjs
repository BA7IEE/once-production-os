// Test-only: the COS SDK is an in-process fake and the database is an owned disposable instance.
import assert from 'node:assert/strict';
import {realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {sep} from 'node:path';
import {PrismaStore} from '../../dist/apps/api/src/prisma-store.js';
import {Application} from '../../dist/packages/core/src/api.js';
import {loadConfig} from '../../dist/apps/api/src/config.js';
import {CosMediaProvider} from '../../dist/apps/api/src/media/cos-provider.js';
import {MediaPurgeWorker} from '../../dist/apps/api/src/media/purge-worker.js';
import {SafetyJournalWriter} from '../../dist/apps/api/src/recovery/safety-journal.js';

assert.equal(process.env.ALLOW_BROWSER_TESTS,'yes');assert.ok(process.env.ONCE_RESOURCE_RUN_DIR);
assert.equal(process.env.MEDIA_PROVIDER,'local');assert.equal(process.env.DATABASE_URL,process.env.DATABASE_URL_TEST);
const db=new URL(process.env.DATABASE_URL);assert.ok(['127.0.0.1','localhost','[::1]'].includes(db.hostname));assert.match(db.pathname,/^\/once_test_[a-z0-9_]+$/);
assert.ok(realpathSync(process.env.MEDIA_ROOT).startsWith(realpathSync(tmpdir())+sep));
const store=new PrismaStore();
try{
 const config=loadConfig(),journal=await SafetyJournalWriter.open(process.env.SAFETY_JOURNAL_FILE);
 const app=new Application(store,config,undefined,journal),claim=await app.mediaPurge.claim();assert.ok(claim);
 const owner='synthetic-owner',prefix='isolated',target=`${prefix}/uploads/${claim.uploadId}/${claim.objectToken}/original.bin`;
 const sibling=`${prefix}/uploads/00000000-0000-4000-8000-000000000001/${claim.objectToken}/original.bin`;
 const objects=new Set([target,sibling]);let deletes=0;
 const sdk={getBucketAcl:async()=>({ACL:'private',Owner:{ID:owner},Grants:[{Grantee:{ID:owner},Permission:'FULL_CONTROL'}]}),
  getBucketVersioning:async()=>({VersioningConfiguration:{}}),getBucketPolicy:async()=>({Policy:{}}),
  headObject:async()=>{throw {statusCode:404};},getBucket:async()=>({statusCode:200,IsTruncated:'false',Contents:[]}),
  deleteObject:async({Key})=>{deletes++;objects.delete(Key);return {statusCode:204};}};
 const provider=new CosMediaProvider(process.env.MEDIA_ROOT,sdk,{Bucket:'synthetic-123456',Region:'ap-guangzhou'},prefix);
 await new MediaPurgeWorker(app,provider,journal).process(claim,new AbortController().signal);
 assert.equal(objects.has(target),false);assert.equal(objects.has(sibling),true);
 console.log(JSON.stringify({provider:'local COS fake',knownKeyDeleted:true,siblingRetained:true,deleteRequests:deletes}));
}finally{await store.close();}
