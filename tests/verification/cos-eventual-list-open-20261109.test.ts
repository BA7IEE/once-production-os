import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import type COS from 'cos-nodejs-sdk-v5';
import {CosMediaProvider} from '../../apps/api/src/media/cos-provider.ts';
import {LocalMediaProvider} from '../../apps/api/src/media/local-provider.ts';

test('an eventually consistent empty list cannot certify a still-present synthetic COS object as purged',async()=>{
 const root=await mkdtemp(join(tmpdir(),'once-cos-list-lag-'));try{
  const local=await LocalMediaProvider.create(root),id=randomUUID(),token=randomUUID(),owner='synthetic-owner';
  await mkdir(local.work(id,token),{recursive:true,mode:0o700});
  await writeFile(join(local.work(id,token),'original.bin'),Buffer.from('synthetic-object'));
  const target=`isolated/uploads/${id}/${token}/original.bin`,objects=new Set([target]);
  let headCalls=0;
  const fake={
   getBucketAcl:async()=>({ACL:'private',Owner:{ID:owner},Grants:[{Grantee:{ID:owner},Permission:'FULL_CONTROL'}]}),
   getBucketVersioning:async()=>({VersioningConfiguration:{}}),getBucketPolicy:async()=>({Policy:{}}),
   getBucket:async()=>({statusCode:200,IsTruncated:'false',Contents:[]}),
   headObject:async()=>{headCalls++;return {statusCode:200};},
   deleteObject:async({Key}:{Key:string})=>{objects.delete(Key);return {statusCode:204};},
  } as unknown as COS;
  // A known work token supplies the exact key even when List omits it; this
  // partial deletion still cannot certify a complete historical inventory.
  const provider=new CosMediaProvider(root,fake,{Bucket:'synthetic-123456',Region:'ap-guangzhou'},'isolated');
  await assert.rejects(provider.purge(id),{code:'COS_PURGE_RECONCILIATION_REQUIRED'});
  assert.equal(objects.has(target),false);assert.equal(headCalls,0);
  assert.ok((await stat(join(root,'trash',id,'work-'+token,'original.bin'))).isFile(),'quarantine evidence must remain');
 }finally{await rm(root,{recursive:true,force:true});}
});
