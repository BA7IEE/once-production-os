import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import type COS from 'cos-nodejs-sdk-v5';
import {CosMediaProvider} from '../../apps/api/src/media/cos-provider.ts';
import {LocalMediaProvider} from '../../apps/api/src/media/local-provider.ts';

const bucket={Bucket:'synthetic-123456',Region:'ap-guangzhou'};
const owner='synthetic-owner';
const signal=()=>new AbortController().signal;
const acl={ACL:'private',Owner:{ID:owner},Grants:[{Grantee:{ID:owner},Permission:'FULL_CONTROL'}]};
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'once-cos-reconcile-'));
 const local=await LocalMediaProvider.create(root),id=randomUUID(),token=randomUUID();
 const objects=new Set<string>(),deletes:string[]=[];
 const reads={bucket:0,list:0};
 let onPut=async({Key}:{Key:string})=>{objects.add(Key);return {statusCode:200};};
 let onDelete=async({Key}:{Key:string})=>{deletes.push(Key);objects.delete(Key);return {statusCode:204};};
 let list=async()=>({statusCode:200,IsTruncated:'false',Contents:[] as Array<{Key:string}>});
 const sdk={getBucketAcl:async()=>{reads.bucket++;return acl;},getBucketVersioning:async()=>({VersioningConfiguration:{}}),getBucketPolicy:async()=>({Policy:{}}),
  putObject:(p:{Key:string})=>onPut(p),deleteObject:(p:{Key:string})=>onDelete(p),getBucket:()=>{reads.list++;return list();}} as unknown as COS;
 const provider=new CosMediaProvider(root,sdk,bucket,'isolated');
 const key=(t:string,part='original.bin')=>`isolated/uploads/${id}/${t}/${part}`;
 const work=async(t=token)=>{const dir=local.work(id,t);await mkdir(dir,{recursive:true,mode:0o700});await writeFile(join(dir,'original.bin'),'synthetic');return dir;};
 const receipt=async()=>JSON.parse(await readFile(join(root,'trash',id,'.cos-reconciliation.json'),'utf8'));
 return {root,local,id,token,objects,deletes,reads,provider,key,work,receipt,
  setPut:(fn:typeof onPut)=>{onPut=fn;},setDelete:(fn:typeof onDelete)=>{onDelete=fn;},setList:(fn:typeof list)=>{list=fn;},cleanup:()=>rm(root,{recursive:true,force:true})};
}

test('known exact keys omitted from List are deleted, but an unrecorded hidden token keeps the namespace unresolved',async()=>{
 const f=await fixture();try{
  await f.work();const target=f.key(f.token),unknown=f.key(randomUUID());f.objects.add(target);f.objects.add(unknown);
  await assert.rejects(f.provider.purge(f.id),{code:'COS_PURGE_RECONCILIATION_REQUIRED'});
  assert.equal(f.objects.has(target),false);assert.equal(f.objects.has(unknown),true);
  const r=await f.receipt();assert.equal(r.state,'RECONCILIATION_REQUIRED');assert.equal(r.list,'NONAUTHORITATIVE');
  assert.deepEqual(r.candidates.map((x:any)=>x.key),[target,f.key(f.token,'preview.jpg')]);
  assert.ok(r.candidates.every((x:any)=>x.delete==='ACKNOWLEDGED'&&x.sources.includes('work-directory')));
  assert.equal((await stat(join(f.root,'trash',f.id))).isDirectory(),true);
 }finally{await f.cleanup();}
});

test('the purge intent supplies exact keys even when the local upload group is missing',async()=>{
 const f=await fixture();try{
  const target=f.key(f.token);f.objects.add(target);
  const ref={uploadId:f.id,objectToken:f.token,part:'original' as const,bytes:9,hash:'0'.repeat(64)};
  await assert.rejects(f.provider.purgeOwnedNamespace(ref,signal()),{code:'COS_PURGE_RECONCILIATION_REQUIRED'});
  assert.equal(f.objects.has(target),false);
  const r=await f.receipt();assert.ok(r.candidates.every((x:any)=>x.sources.includes('purge-intent')));
 }finally{await f.cleanup();}
});

test('a legacy late PUT after acknowledged deletes remains unresolved and is not silently counted as gone',async()=>{
 const f=await fixture();try{
  await f.work();await assert.rejects(f.provider.purge(f.id),{code:'COS_PURGE_RECONCILIATION_REQUIRED'});
  const target=f.key(f.token),receipt=await f.receipt(),reads={...f.reads},count=f.deletes.length;
  assert.ok(receipt.candidates.every((x:any)=>x.delete==='ACKNOWLEDGED'));
  f.objects.add(target); // Model a late PUT from a legacy or external writer.
  await assert.rejects(f.provider.purge(f.id),{code:'COS_PURGE_RECONCILIATION_REQUIRED'});
  assert.equal(f.objects.has(target),true);assert.equal(f.deletes.length,count);assert.deepEqual(f.reads,reads);
  assert.equal((await f.receipt()).state,'RECONCILIATION_REQUIRED');
 }finally{await f.cleanup();}
});

test('a timeout leaves a durable UNKNOWN receipt and automatic retries make no more cloud requests',async()=>{
 const f=await fixture();try{
  await f.work();let calls=0;
  f.setDelete(async({Key})=>{f.deletes.push(Key);if(++calls===2)throw new Error('synthetic private SDK error');f.objects.delete(Key);return {statusCode:204};});
  await assert.rejects(f.provider.purge(f.id),(e:any)=>e.code==='MEDIA_IO_FAILED'&&!e.message.includes('private'));
  let r=await f.receipt();assert.deepEqual(r.candidates.map((x:any)=>x.delete),['ACKNOWLEDGED','UNKNOWN']);
  assert.equal(JSON.stringify(r).includes('synthetic private SDK error'),false);
  const requests=f.deletes.length,reads={...f.reads};
  f.setDelete(async({Key})=>{f.deletes.push(Key);f.objects.delete(Key);return {statusCode:204};});
  await assert.rejects(f.provider.purge(f.id),{code:'COS_PURGE_RECONCILIATION_REQUIRED'});
  r=await f.receipt();assert.equal(r.state,'RECONCILIATION_REQUIRED');assert.deepEqual(r.candidates.map((x:any)=>x.delete),['ACKNOWLEDGED','UNKNOWN']);assert.equal(f.deletes.length,requests);assert.deepEqual(f.reads,reads);
 }finally{await f.cleanup();}
});

test('404 and invalid DELETE response are unknown, not acknowledgements',async()=>{
 for(const outcome of ['404','redirect']){
  const f=await fixture();try{
   await f.work();f.setDelete(async()=>{if(outcome==='404')throw {statusCode:404};return {statusCode:302};});
   await assert.rejects(f.provider.purge(f.id));const r=await f.receipt();
   assert.equal(r.state,'RECONCILIATION_REQUIRED');assert.deepEqual(r.candidates.map((x:any)=>x.delete),['UNKNOWN','NOT_ATTEMPTED']);
  }finally{await f.cleanup();}
 }
});

test('unresolved PUT cannot be overwritten by a retry and blocks all namespace deletion',async()=>{
 const f=await fixture();try{
  const dir=await f.work();let calls=0;
  f.setPut(async()=>{calls++;throw new Error('synthetic timeout');});
  await assert.rejects(f.provider.publishSealed(f.id,f.token,signal(),['original.bin']));
  assert.equal(await readFile(join(dir,'.cos-publishing'),'utf8'),'PENDING\n');
  f.objects.add(f.key(f.token)); // A timed-out server-side PUT can complete later.
  await assert.rejects(f.provider.publishSealed(f.id,f.token,signal(),['original.bin']),{code:'COS_PUBLICATION_UNRESOLVED'});
  await assert.rejects(f.provider.purge(f.id),{code:'COS_PUBLICATION_UNRESOLVED'});
  assert.equal(calls,1);assert.deepEqual(f.deletes,[]);assert.equal(f.objects.has(f.key(f.token)),true);
 }finally{await f.cleanup();}
});

test('a quarantined upload ID cannot be received again by an upgraded writer',async()=>{
 const f=await fixture();try{
  const bytes=Buffer.from('synthetic'),upload={id:f.id,receiveToken:randomUUID(),expectedBytes:bytes.length,expectedHash:createHash('sha256').update(bytes).digest('hex'),mime:'application/pdf'} as any;
  await f.provider.receive(upload,Readable.from(bytes),signal());
  await assert.rejects(f.provider.purge(f.id),{code:'COS_PURGE_RECONCILIATION_REQUIRED'});
  await assert.rejects(f.provider.receive(upload,Readable.from(bytes),signal()),{code:'COS_PURGE_RECONCILIATION_REQUIRED'});
  await assert.rejects(stat(f.provider.group(f.id)),{code:'ENOENT'});
 }finally{await f.cleanup();}
});

test('a concurrent purge waits for an upgraded writer before finding and deleting its exact key',async()=>{
 const f=await fixture();let release!:()=>void;const held=new Promise<void>(r=>{release=r;});
 try{
  await f.work();let started!:()=>void;const begun=new Promise<void>(r=>{started=r;});
  f.setPut(async({Key})=>{started();await held;f.objects.add(Key);return {statusCode:200};});
  const publishing=f.provider.publishSealed(f.id,f.token,signal(),['original.bin']);await begun;
  const purging=f.provider.purge(f.id);await sleep(100);assert.deepEqual(f.deletes,[]);
  release();await publishing;await assert.rejects(purging,{code:'COS_PURGE_RECONCILIATION_REQUIRED'});
  assert.equal(f.objects.has(f.key(f.token)),false);assert.ok(f.deletes.includes(f.key(f.token)));
 }finally{release();await f.cleanup();}
});

test('a killed publisher leaves its synced pending marker and a later cleanup fails closed',async()=>{
 const f=await fixture();let child:ReturnType<typeof spawn>|undefined,closed:Promise<unknown>|undefined;
 try{
  const dir=await f.work();
  const moduleUrl=new URL('../../apps/api/src/media/cos-provider.ts',import.meta.url).href;
  const script=`import {CosMediaProvider} from ${JSON.stringify(moduleUrl)};
   const [root,id,token]=process.argv.slice(1),owner='synthetic-owner';
   const sdk={getBucketAcl:async()=>({ACL:'private',Owner:{ID:owner},Grants:[{Grantee:{ID:owner},Permission:'FULL_CONTROL'}]}),
    getBucketVersioning:async()=>({VersioningConfiguration:{}}),getBucketPolicy:async()=>({Policy:{}}),
    putObject:async()=>{process.stdout.write('PUT_STARTED\\n');return new Promise(()=>{});}};
   setInterval(()=>{},1000);
   await new CosMediaProvider(root,sdk,{Bucket:'synthetic-123456',Region:'ap-guangzhou'},'isolated').publishSealed(id,token,new AbortController().signal,['original.bin']);`;
  child=spawn(process.execPath,['--experimental-strip-types','--input-type=module','--eval',script,f.root,f.id,f.token],{stdio:['ignore','pipe','pipe']});
  closed=new Promise(resolve=>child!.once('close',resolve));
  const ready=new Promise<void>((resolve,reject)=>{let out='';child!.stdout!.on('data',chunk=>{out+=String(chunk);if(out.includes('PUT_STARTED\n'))resolve();});child!.once('error',reject);child!.once('close',()=>reject(new Error('publisher exited before PUT')));});
  const timeout=AbortSignal.timeout(5000);
  await Promise.race([ready,new Promise<never>((_,reject)=>timeout.addEventListener('abort',()=>reject(new Error('publisher start timed out')),{once:true}))]);
  assert.equal(await readFile(join(dir,'.cos-publishing'),'utf8'),'PENDING\n');
  child.kill('SIGKILL');await closed;
  await assert.rejects(f.provider.purge(f.id),{code:'COS_PUBLICATION_UNRESOLVED'});assert.deepEqual(f.deletes,[]);
 }finally{if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');if(closed)await closed;await f.cleanup();}
});

test('a killed deleter leaves UNKNOWN on disk and a replacement process does not retry automatically',async()=>{
 const f=await fixture();let child:ReturnType<typeof spawn>|undefined,closed:Promise<unknown>|undefined;
 try{
  await f.work();
  const moduleUrl=new URL('../../apps/api/src/media/cos-provider.ts',import.meta.url).href;
  const script=`import {CosMediaProvider} from ${JSON.stringify(moduleUrl)};
   const [root,id]=process.argv.slice(1),owner='synthetic-owner';
   const sdk={getBucketAcl:async()=>({ACL:'private',Owner:{ID:owner},Grants:[{Grantee:{ID:owner},Permission:'FULL_CONTROL'}]}),
    getBucketVersioning:async()=>({VersioningConfiguration:{}}),getBucketPolicy:async()=>({Policy:{}}),
    getBucket:async()=>({statusCode:200,IsTruncated:'false',Contents:[]}),
    deleteObject:async()=>{process.stdout.write('DELETE_STARTED\\n');return new Promise(()=>{});}};
   setInterval(()=>{},1000);
   await new CosMediaProvider(root,sdk,{Bucket:'synthetic-123456',Region:'ap-guangzhou'},'isolated').purge(id);`;
  child=spawn(process.execPath,['--experimental-strip-types','--input-type=module','--eval',script,f.root,f.id],{stdio:['ignore','pipe','pipe']});
  closed=new Promise(resolve=>child!.once('close',resolve));
  const ready=new Promise<void>((resolve,reject)=>{let out='';child!.stdout!.on('data',chunk=>{out+=String(chunk);if(out.includes('DELETE_STARTED\n'))resolve();});child!.once('error',reject);child!.once('close',()=>reject(new Error('deleter exited before DELETE')));});
  const timeout=AbortSignal.timeout(5000);
  await Promise.race([ready,new Promise<never>((_,reject)=>timeout.addEventListener('abort',()=>reject(new Error('deleter start timed out')),{once:true}))]);
  const before=await f.receipt();assert.deepEqual(before.candidates.map((x:any)=>x.delete),['UNKNOWN','NOT_ATTEMPTED']);
  child.kill('SIGKILL');await closed;
  await assert.rejects(f.provider.purge(f.id),{code:'COS_PURGE_RECONCILIATION_REQUIRED'});
  assert.deepEqual(await f.receipt(),before);assert.deepEqual(f.deletes,[]);assert.deepEqual(f.reads,{bucket:0,list:0});
 }finally{if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');if(closed)await closed;await f.cleanup();}
});

test('invalid local identity or conflicting quarantine blocks every deletion',async()=>{
 for(const mode of ['symlink','both']){
  const f=await fixture();try{
   const dir=await f.work();
   if(mode==='symlink')await symlink(join(f.root,'.once-private-media-v1'),join(dir,'preview.jpg'));
   else await mkdir(join(f.root,'trash',f.id));
   f.setList(async()=>({statusCode:200,IsTruncated:'false',Contents:[{Key:f.key(f.token)}]}));
   await assert.rejects(f.provider.purge(f.id),{code:'COS_PURGE_INVALID'});assert.deepEqual(f.deletes,[]);
  }finally{await f.cleanup();}
 }
});
