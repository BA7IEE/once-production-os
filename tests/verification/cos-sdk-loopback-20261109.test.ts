import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import COS from 'cos-nodejs-sdk-v5';
import {CosMediaProvider} from '../../apps/api/src/media/cos-provider.ts';
import {LocalMediaProvider} from '../../apps/api/src/media/local-provider.ts';
import type {MediaAsset} from '../../packages/core/src/media-model.ts';

test('locked COS SDK on loopback: private publish, integrity, retry, scoped delete and pending purge',async()=>{
 const objects=new Map<string,Buffer>(),puts:Array<{key:string;acl:unknown;overwrite:unknown;encryption:unknown}>=[],deletes:string[]=[];
 const owner='synthetic-owner';let unexpected=0;
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url??'/','http://127.0.0.1');
  const xml=(body:string)=>{res.writeHead(200,{'Content-Type':'application/xml'});res.end(body);};
  if(req.method==='GET'&&url.searchParams.has('acl'))return xml(`<AccessControlPolicy><Owner><ID>${owner}</ID></Owner><AccessControlList><Grant><Grantee><ID>${owner}</ID></Grantee><Permission>FULL_CONTROL</Permission></Grant></AccessControlList></AccessControlPolicy>`);
  if(req.method==='GET'&&url.searchParams.has('versioning'))return xml('<VersioningConfiguration></VersioningConfiguration>');
  if(req.method==='GET'&&url.searchParams.has('policy')){res.writeHead(404,{'Content-Type':'application/xml'});res.end('<Error><Code>NoSuchBucketPolicy</Code><Message>none</Message></Error>');return;}
  if(req.method==='GET'&&url.searchParams.has('prefix')){
   const prefix=url.searchParams.get('prefix')??'',rows=[...objects.keys()].filter(key=>key.startsWith(prefix));
   return xml(`<ListBucketResult><Name>synthetic-123456</Name><Prefix>${prefix}</Prefix><IsTruncated>false</IsTruncated>${rows.map(key=>`<Contents><Key>${key}</Key><Size>${objects.get(key)!.length}</Size></Contents>`).join('')}</ListBucketResult>`);
  }
  const key=decodeURIComponent(url.pathname.slice(1));
  if(req.method==='PUT'){
   const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
   puts.push({key,acl:req.headers['x-cos-acl'],overwrite:req.headers['x-cos-forbid-overwrite'],encryption:req.headers['x-cos-server-side-encryption']});
   if(objects.has(key)){res.writeHead(409,{'Content-Type':'application/xml'});res.end('<Error><Code>ObjectAlreadyExists</Code><Message>exists</Message></Error>');return;}
   objects.set(key,Buffer.concat(chunks));res.writeHead(200,{ETag:'"synthetic-object"'});res.end();return;
  }
  if(req.method==='GET'&&objects.has(key)){
   const bytes=objects.get(key)!;const match=/^bytes=(\d+)-(\d+)$/.exec(String(req.headers.range));
   if(!match){res.writeHead(400);res.end();return;}
   const start=Number(match[1]),end=Math.min(Number(match[2]),bytes.length-1),body=bytes.subarray(start,end+1);
   res.writeHead(206,{'Content-Length':String(body.length),'Content-Range':`bytes ${start}-${end}/${bytes.length}`,ETag:'"synthetic-object"'});res.end(body);return;
  }
  if(req.method==='DELETE'){deletes.push(key);objects.delete(key);res.writeHead(204);res.end();return;}
  unexpected++;res.writeHead(400);res.end();
 });
 const root=await mkdtemp(join(tmpdir(),'once-cos-sdk-loopback-'));
 try{
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const port=(server.address() as {port:number}).port;
  const sdk=new COS({SecretId:'synthetic-id',SecretKey:'synthetic-key',Protocol:'http:',Domain:'127.0.0.1:'+port,Timeout:3000,ChunkRetryTimes:0,FollowRedirect:false,AutoSwitchHost:false});
  const local=await LocalMediaProvider.create(root),id=randomUUID(),token=randomUUID(),other=randomUUID();
  const original=Buffer.from('%PDF-synthetic-content'),preview=Buffer.from('synthetic-preview');
  await mkdir(local.work(id,token),{recursive:true,mode:0o700});
  await writeFile(join(local.work(id,token),'original.bin'),original);await writeFile(join(local.work(id,token),'preview.jpg'),preview);
  const sibling=`isolated/uploads/${other}/${token}/original.bin`;objects.set(sibling,Buffer.from('sibling'));
  const provider=new CosMediaProvider(root,sdk,{Bucket:'synthetic-123456',Region:'ap-guangzhou'},'isolated');
  const asset={uploadId:id,objectToken:token,mime:'application/pdf',bytes:original.length,sha256:createHash('sha256').update(original).digest('hex'),previewBytes:preview.length,previewHash:createHash('sha256').update(preview).digest('hex')} as MediaAsset;
  await provider.publishSealed(id,token,new AbortController().signal);
  assert.deepEqual(await provider.readOriginal(asset),original);assert.deepEqual(await provider.readPreview(asset),preview);
  await provider.publishSealed(id,token,new AbortController().signal);
  assert.equal(puts.length,4);assert.ok(puts.every(p=>p.acl==='private'&&p.overwrite==='true'&&p.encryption==='AES256'));
  await assert.rejects(provider.purge(id),{code:'COS_PURGE_RECONCILIATION_REQUIRED'});assert.equal(deletes.length,2);assert.ok(deletes.every(key=>key.startsWith(`isolated/uploads/${id}/`)));
  assert.equal(objects.has(sibling),true);assert.equal(objects.size,1);assert.equal(unexpected,0);
 }finally{server.closeAllConnections();if(server.listening)await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});}
});
