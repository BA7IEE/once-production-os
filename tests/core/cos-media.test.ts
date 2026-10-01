import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import type COS from 'cos-nodejs-sdk-v5';
import {CosMediaProvider} from '../../apps/api/src/media/cos-provider.ts';
import {LocalMediaProvider} from '../../apps/api/src/media/local-provider.ts';
import type {MediaAsset} from '../../packages/core/src/media-model.ts';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
async function fixture(){
 const root=await mkdtemp(join(await realpath(tmpdir()),'once-cos-')),local=await LocalMediaProvider.create(root),id=randomUUID(),token=randomUUID();
 const objects=new Map<string,Buffer>(),requests:COS.PutObjectParams[]=[];let version:string|undefined,acl='private',failDelete=false;
 const sdk={
  async getBucketPolicy(){throw {statusCode:404};},async getBucketAcl(){return {ACL:acl};},async getBucketVersioning(){return {VersioningConfiguration:{Status:version}};},
  async putObject(p:COS.PutObjectParams){requests.push(p);if(objects.has(p.Key))throw {statusCode:409};objects.set(p.Key,Buffer.from(p.Body as Buffer));return {};},
  async getObject(p:COS.GetObjectParams){const b=objects.get(p.Key);if(!b)throw {statusCode:404};await new Promise<void>((resolve,reject)=>{const out=p.Output as import('node:stream').Writable;out.once('error',reject);out.end(b,resolve);});return {};},
  async getBucket(p:COS.GetBucketParams){return {statusCode:200,Contents:[...objects.keys()].filter(k=>k.startsWith(p.Prefix!)).map(Key=>({Key})),IsTruncated:'false'};},
  async deleteObject(p:COS.DeleteObjectParams){if(failDelete)throw new Error('private-key must not leak');objects.delete(p.Key);return {statusCode:204};}
 } as unknown as COS;
 await mkdir(local.work(id,token),{recursive:true,mode:0o700});const original=Buffer.from('%PDF opaque'),preview=Buffer.from('synthetic JPEG');
 await writeFile(join(local.work(id,token),'original.bin'),original);await writeFile(join(local.work(id,token),'preview.jpg'),preview);
 const provider=new CosMediaProvider(root,sdk,{Bucket:'synthetic-123456',Region:'ap-guangzhou'},'once');
 const asset={uploadId:id,objectToken:token,mime:'application/pdf',bytes:original.length,sha256:hash(original),previewBytes:preview.length,previewHash:hash(preview)} as MediaAsset;
 return {provider,id,token,asset,objects,requests,original,preview,setVersion:(s:string)=>{version=s;},setAcl:(s:string)=>{acl=s;},failDelete:()=>{failDelete=true;},cleanup:()=>rm(root,{recursive:true,force:true})};
}
test('COS stores private objects, verifies retries and round-trips original and preview',async()=>{
 const f=await fixture();try{
  await f.provider.publishSealed(f.id,f.token,new AbortController().signal);await f.provider.publishSealed(f.id,f.token,new AbortController().signal);
  assert.equal(f.objects.size,2);assert.ok(f.requests.every(p=>p.ACL==='private'&&p.Headers?.['x-cos-forbid-overwrite']==='true'));
  assert.deepEqual(await f.provider.readOriginal(f.asset),f.original);assert.deepEqual(await f.provider.readPreview(f.asset),f.preview);
  await f.provider.purge(f.id);assert.equal(f.objects.size,0);
 }finally{await f.cleanup();}
});
test('COS refuses public or versioned buckets and detects changed or oversized objects',async()=>{
 const f=await fixture();try{
  f.setAcl('public-read');await assert.rejects(f.provider.checkBucket());f.setAcl('private');f.setVersion('Suspended');await assert.rejects(f.provider.checkBucket());
  f.setVersion('');await f.provider.publishSealed(f.id,f.token,new AbortController().signal);
  const key=[...f.objects.keys()].find(k=>k.endsWith('original.bin'))!;f.objects.set(key,Buffer.alloc(f.original.length+1));await assert.rejects(f.provider.readOriginal(f.asset));
  f.objects.set(key,Buffer.alloc(f.original.length));await assert.rejects(f.provider.readOriginal(f.asset));
  await assert.rejects(f.provider.publishSealed(f.id,f.token,new AbortController().signal));
 }finally{await f.cleanup();}
});
test('COS failed purge stays incomplete and never leaks SDK errors',async()=>{
 const f=await fixture();try{
  await f.provider.publishSealed(f.id,f.token,new AbortController().signal);f.failDelete();
  await assert.rejects(f.provider.purge(f.id),e=>e instanceof Error&&!e.message.includes('private-key'));assert.equal(f.objects.size,2);
 }finally{await f.cleanup();}
});

test('COS purge blocks on an uncertain publication and prevents later publishing',async()=>{
 const f=await fixture();try{
  const pending=join(f.provider.work(f.id,f.token),'.cos-publishing');await writeFile(pending,'PENDING');
  await assert.rejects(f.provider.purge(f.id),e=>!!e&&typeof e==='object'&&'code' in e&&e.code==='COS_PUBLICATION_UNRESOLVED');
  await assert.rejects(f.provider.publishSealed(f.id,f.token,new AbortController().signal));assert.equal(f.requests.length,0);
 }finally{await f.cleanup();}
});
