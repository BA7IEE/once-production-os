import type {PurgeObjectRef,ObjectPresence} from './purge-provider.ts';
import {openHttpsByteStream, validateByteRequest, type ImmutableMediaObject, type ByteStreamRequest, type OpenMediaStream} from './byte-stream.ts';
import COS from 'cos-nodejs-sdk-v5';
import {readFile,writeFile,lstat,readdir,mkdir,rename,realpath} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import {createHash} from 'node:crypto';
import {Writable,type Readable} from 'node:stream';
import {LocalMediaProvider} from './local-provider.ts';
import {AppError,invariant} from '../../../../packages/core/src/errors.ts';
import {uuid} from '../../../../packages/core/src/validation.ts';
import {MEDIA_LIMITS as L,mediaByteLimit,type MediaAsset,type MediaUpload} from '../../../../packages/core/src/media-model.ts';
import {beginCosPublication,finishCosPublication,syncDirectory,withCosNamespaceLock,writeCosReconciliationReceipt,type CosReconciliationReceipt} from './cos-reconciliation.ts';

/** API and worker share a private staging volume. Final bytes are private COS objects;
 * the database retains only stable upload/attempt identities, never public URLs. */
export class CosMediaProvider extends LocalMediaProvider {
 readonly deferObjectMissingUntilNamespace=true as const;
 readonly cos:COS;readonly bucket:{Bucket:string;Region:string};readonly prefix:string;
 constructor(root:string,cos:COS,bucket:{Bucket:string;Region:string},prefix:string){super(root);this.cos=cos;this.bucket=bucket;this.prefix=prefix;}
 static async connect(env:NodeJS.ProcessEnv,existing=false){
  const Bucket=env.COS_BUCKET??'',Region=env.COS_REGION??'',prefix=env.COS_PREFIX??'';
  invariant(/^[a-z0-9-]+-\d+$/.test(Bucket)&&/^[a-z]+-[a-z]+-?\d*$/.test(Region)&&/^[a-zA-Z0-9_-]{1,64}$/.test(prefix),'COS_CONFIG_INVALID','需要独立COS桶、地域和应用目录',503);
  const file=env.COS_CREDENTIALS_FILE;invariant(file&&isAbsolute(file),'COS_CONFIG_INVALID','需要绝对路径的COS凭证文件',503);
  const st=await lstat(file);invariant(st.isFile()&&!st.isSymbolicLink()&&(st.mode&0o077)===0&&st.size<4096,'COS_CONFIG_INVALID','COS凭证文件权限或长度无效',503);
  let keys:Record<string,string>;try{keys=JSON.parse(await readFile(file,'utf8'));}catch{throw new AppError(503,'COS_CONFIG_INVALID','COS凭证文件格式无效');}
  invariant(typeof keys.SecretId==='string'&&typeof keys.SecretKey==='string'&&keys.SecretId.length>0&&keys.SecretKey.length>0,'COS_CONFIG_INVALID','COS凭证字段缺失',503);
  const local=existing?await LocalMediaProvider.openExisting(env.MEDIA_ROOT!):await LocalMediaProvider.create(env.MEDIA_ROOT!);
  const marker=join(local.root,'.once-cos-target.json'),identity=JSON.stringify({Bucket,Region,prefix});
  try{invariant(await readFile(marker,'utf8')===identity,'COS_TARGET_CHANGED','媒体目录已绑定其他COS位置',503);}catch(e){
   if((e as NodeJS.ErrnoException).code!=='ENOENT'||existing)throw e;
   await writeFile(marker,identity,{flag:'wx',mode:0o600});
  }
  const cos=new COS({SecretId:keys.SecretId,SecretKey:keys.SecretKey,Protocol:'https:',Timeout:30000,ChunkRetryTimes:0,FollowRedirect:false,FileParallelLimit:1});
  const provider=new CosMediaProvider(local.root,cos,{Bucket,Region},prefix);await provider.checkBucket();return provider;
 }
 private async io<T>(fn:()=>Promise<T>):Promise<T>{try{return await fn();}catch(e){if(e instanceof AppError)throw e;throw new AppError(503,'MEDIA_IO_FAILED','私有存储操作未完成，请核对状态');}}
 async checkBucket(){await this.io(async()=>{
  const [acl,version]=await Promise.all([this.cos.getBucketAcl(this.bucket),this.cos.getBucketVersioning(this.bucket)]);
  let hasPolicy=false;
  try{const policy=await this.cos.getBucketPolicy(this.bucket);hasPolicy=!!policy.Policy&&JSON.stringify(policy.Policy)!=='{}';}
  catch(e){if((e as COS.CosError)?.statusCode!==404)throw e;}
  // The SDK can label an AllUsers WRITE-only ACL as "private". Check the
  // underlying grants too, and refuse incomplete or group-based ACLs.
  const safeGrants=Array.isArray(acl.Grants)&&acl.Grants.every(grant=>{
   const grantee=grant?.Grantee as unknown as {ID?:unknown;URI?:unknown}|undefined;
   return !!grantee&&typeof grantee.ID==='string'&&grantee.ID.length>0&&grantee.ID.toLowerCase()!=='qcs::cam::anyone:anyone'&&!grantee.URI&&['READ','WRITE','READ_ACP','WRITE_ACP','FULL_CONTROL'].includes(grant.Permission);
  });
  const ownerId=acl.Owner?.ID;
  const ownerControl=typeof ownerId==='string'&&ownerId.length>0&&Array.isArray(acl.Grants)&&acl.Grants.some(grant=>{
   const grantee=grant?.Grantee as unknown as {ID?:unknown}|undefined;
   return grantee?.ID===ownerId&&grant.Permission==='FULL_CONTROL';
  });
  invariant(!hasPolicy&&acl.ACL==='private'&&safeGrants&&ownerControl&&!version.VersioningConfiguration?.Status,'COS_BUCKET_UNSAFE','COS必须为无公开或用户组授权、从未启用版本控制的私有专用桶',503);
 });}
 private key(id:string,token:string,part:string){return `${this.prefix}/uploads/${uuid.parse(id)}/${uuid.parse(token)}/${part}`;}
 override async receive(u:MediaUpload,input:Readable,signal:AbortSignal){
  return withCosNamespaceLock(this.root,u.id,async()=>{
   // A retired UUID must not recreate an active group after quarantine.
   try{await lstat(join(this.root,'trash',uuid.parse(u.id)));throw new AppError(503,'COS_PURGE_RECONCILIATION_REQUIRED','媒体目录已隔离，不能重新接收');}
   catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
   return super.receive(u,input,signal);
  });
 }
 override async publish(u:MediaUpload,signal:AbortSignal){return this.publishSealed(u.id,u.leaseToken!,signal);}
 async publishSealed(id:string,token:string,signal:AbortSignal,parts:Array<'original.bin'|'preview.jpg'>=['original.bin','preview.jpg']){
  return withCosNamespaceLock(this.root,id,async()=>{
  await this.checkBucket();
  invariant(!signal.aborted,'MEDIA_CANCELLED','处理已取消',409);
  const work=this.work(id,token);
  await beginCosPublication(work);
  for(const name of parts){
   invariant(!signal.aborted,'MEDIA_CANCELLED','处理已取消',409);
   // Local group is never recreated; purge or loss of the sealed copy blocks upload.
   const body=await readFile(join(this.work(id,token),name));
   invariant(body.length<= (name==='original.bin'?L.videoBytes:L.previewBytes),'MEDIA_SIZE_INVALID','文件长度无效',422);
   const Key=this.key(id,token,name);
   try{await this.cos.putObject({...this.bucket,Key,Body:body,ContentLength:body.length,ACL:'private',ContentType:'application/octet-stream',CacheControl:'private, no-store',ServerSideEncryption:'AES256',Headers:{'x-cos-forbid-overwrite':'true'}});}
   catch(e){
    if((e as COS.CosError)?.statusCode!==409)throw new AppError(503,'MEDIA_IO_FAILED','私有存储操作未完成，请核对状态');
    // A restore retry may see an already uploaded object; verify bytes, never overwrite.
    await this.download(Key,body.length,createHash('sha256').update(body).digest('hex'));
   }
   // A cancelled or purged local group must not leave a newly published cloud object.
   try{await lstat(this.group(id));invariant(!signal.aborted,'MEDIA_CANCELLED','处理已取消',409);}
   catch(e){await this.io(()=>this.cos.deleteObject({...this.bucket,Key}));throw e;}
  }
  await finishCosPublication(work);
  });
 }
 private async bytes(a:MediaAsset,preview:boolean){
  const size=preview?a.previewBytes:a.bytes,hash=preview?a.previewHash:a.sha256;
  invariant(size>0&&size<=(preview?L.previewBytes:mediaByteLimit(a.mime)),'MEDIA_FILE_INVALID','媒体长度无效',503);
  return this.download(this.key(a.uploadId,a.objectToken,preview?'preview.jpg':'original.bin'),size,hash);
 }
 private async download(Key:string,size:number,hash:string){
  const chunks:Buffer[]=[];let count=0;
  const output=new Writable({write(chunk:Buffer,_enc,done){count+=chunk.length;if(count>size)return done(new Error('size'));chunks.push(Buffer.from(chunk));done();}});
  // Stream cap is enforced even if a remote response ignores Range.
  output.on('error',()=>{});
  await this.io(()=>this.cos.getObject({...this.bucket,Key,Range:`bytes=0-${size}`,Output:output}));
  const body=Buffer.concat(chunks);invariant(body.length===size&&createHash('sha256').update(body).digest('hex')===hash,'MEDIA_FILE_INVALID','COS对象内容与登记摘要不符',503);return body;
 }
 override async statImmutableObject(a: MediaAsset, signal: AbortSignal): Promise<ImmutableMediaObject> {
  invariant(!signal.aborted, 'MEDIA_CANCELLED', '播放已取消', 409);
  const head = await this.io(() => this.cos.headObject({...this.bucket, Key: this.key(a.uploadId, a.objectToken, 'original.bin')}));
  invariant(!signal.aborted, 'MEDIA_CANCELLED', '播放已取消', 409);
  invariant(head.statusCode === 200 && head.headers?.['content-length'] === String(a.bytes) && a.bytes > 0 && a.bytes <= mediaByteLimit(a.mime) && /^"[^"\r\n]+"$/.test(head.ETag), 'MEDIA_FILE_INVALID', 'COS对象身份或长度不符', 503);
  return {asset: a, identity: head.ETag, bytes: a.bytes};
 }
 override async openByteStream(r: ByteStreamRequest): Promise<OpenMediaStream> {
  validateByteRequest(r);
  const a = r.objectRef.asset;
  const url = new URL(this.cos.getObjectUrl({...this.bucket, Key: this.key(a.uploadId, a.objectToken, 'original.bin'), Sign: true, Expires: 60}));
  invariant(url.protocol === 'https:' && url.hostname === `${this.bucket.Bucket}.cos.${this.bucket.Region}.myqcloud.com` && !url.port && !url.username && !url.password && !url.hash, 'COS_CONFIG_INVALID', 'COS播放地址不符合私有存储配置', 503);
  return openHttpsByteStream(url, r);
 }
 override readOriginal(a:MediaAsset){return this.bytes(a,false);}
 override readPreview(a:MediaAsset){return this.bytes(a,true);}
 private async purgeHead(ref:PurgeObjectRef,signal:AbortSignal):Promise<ObjectPresence>{
  invariant(!signal.aborted,'MEDIA_CANCELLED','清理已取消',409);await this.checkBucket();
  try{const h=await this.cos.headObject({...this.bucket,Key:this.key(ref.uploadId,ref.objectToken,ref.part==='original'?'original.bin':'preview.jpg')});
   invariant(h.statusCode===200&&h.headers?.['content-length']===String(ref.bytes),'MEDIA_FILE_INVALID','COS对象身份不符或重定向',503);
   await this.download(this.key(ref.uploadId,ref.objectToken,ref.part==='original'?'original.bin':'preview.jpg'),ref.bytes,ref.hash);return 'EXISTS';
  }catch(e){if((e as COS.CosError)?.statusCode===404)return 'MISSING';throw e;}
 }
 private async requireActiveNamespace(id:string){
  // Once quarantined, only the explicit reconciliation path may inspect the
  // namespace. Recurring object probes or deletes would otherwise continue
  // making cloud requests ahead of the unresolved-receipt gate.
  try{await lstat(join(this.root,'trash',uuid.parse(id)));}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}
  throw new AppError(503,'COS_PURGE_RECONCILIATION_REQUIRED','媒体目录已隔离，需先核对未决清理');
 }
 override async statPurgeObject(ref:PurgeObjectRef,signal:AbortSignal):Promise<ObjectPresence>{await this.requireActiveNamespace(ref.uploadId);const remote=await this.purgeHead(ref,signal),local=await super.statPurgeObject(ref,signal);return remote==='MISSING'&&local==='MISSING'?'MISSING':'EXISTS';}
 override async deleteImmutableObject(_ref:PurgeObjectRef,_signal:AbortSignal){
  // A standalone DELETE lacks the namespace's durable write-ahead receipt.
  throw new AppError(503,'COS_PURGE_RECONCILIATION_REQUIRED','COS对象必须通过命名空间核对清理');
 }
 override async purge(id:string){return this.reconcileNamespace(id);}
 override async purgeOwnedNamespace(ref:PurgeObjectRef,signal:AbortSignal){
  return this.reconcileNamespace(ref.uploadId,ref.objectToken,signal);
 }
 private async reconcileNamespace(id:string,knownToken?:string,signal?:AbortSignal){
  return withCosNamespaceLock(this.root,id,async()=>{
   invariant(!signal?.aborted,'MEDIA_CANCELLED','清理已取消',409);
   id=uuid.parse(id);if(knownToken)knownToken=uuid.parse(knownToken);
   const Prefix=`${this.prefix}/uploads/${id}/`,group=this.group(id),quarantine=join(this.root,'trash',id);
   invariant(await realpath(this.root)===this.root,'COS_PURGE_INVALID','媒体根目录身份异常',503);
   for(const name of ['uploads','trash']){
    const path=join(this.root,name),s=await lstat(path);
    invariant(s.isDirectory()&&!s.isSymbolicLink()&&await realpath(path)===path,'COS_PURGE_INVALID','媒体父目录身份异常',503);
   }
   const info=async(path:string)=>{try{return await lstat(path);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}};
   const [source,target]=await Promise.all([info(group),info(quarantine)]);
   invariant(!source||source.isDirectory()&&!source.isSymbolicLink(),'COS_PURGE_INVALID','媒体暂存目录身份异常',503);
   invariant(!target||target.isDirectory()&&!target.isSymbolicLink(),'COS_PURGE_INVALID','媒体隔离目录身份异常',503);
   invariant(!(source&&target),'COS_PURGE_INVALID','媒体暂存和隔离目录同时存在，需人工核对',503);
   if(source){await rename(group,quarantine);await syncDirectory(join(this.root,'uploads'));await syncDirectory(join(this.root,'trash'));}
   else if(!target){await mkdir(quarantine,{mode:0o700});await syncDirectory(join(this.root,'trash'));}

   type Source='work-directory'|'listed'|'purge-intent';
   const candidates=new Map<string,Set<Source>>(),tokens=new Set<string>();
   const add=(token:string,part:'original.bin'|'preview.jpg',source:Source)=>{
    uuid.parse(token);tokens.add(token);const key=this.key(id,token,part),sources=candidates.get(key)??new Set<Source>();sources.add(source);candidates.set(key,sources);
   };
   const addToken=(token:string,source:Source)=>{add(token,'original.bin',source);add(token,'preview.jpg',source);};
   const isUuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
   let workCount=0,ingestCount=0;
   for(const entry of await readdir(quarantine,{withFileTypes:true})){
    invariant(!entry.isSymbolicLink(),'COS_PURGE_INVALID','隔离目录存在符号链接',503);
    // Receipts are terminal for the automatic attempt, not authority to
    // resume or finalize. This also bounds cloud requests on repeated cycles.
    if(entry.isFile()&&entry.name==='.cos-reconciliation.json')throw new AppError(503,'COS_PURGE_RECONCILIATION_REQUIRED','已有未决清理记录，请先核对');
    if(entry.isFile()&&entry.name.startsWith('ingest-')&&entry.name.endsWith('.bin')&&isUuid(entry.name.slice(7,-4))){ingestCount++;continue;}
    const token=entry.name.startsWith('work-')?entry.name.slice(5):'';
    invariant(entry.isDirectory()&&isUuid(token),'COS_PURGE_INVALID','隔离目录存在未知对象',503);workCount++;
    const files=await readdir(join(quarantine,entry.name),{withFileTypes:true});
    invariant(!files.some(f=>f.name==='.cos-publishing'),'COS_PUBLICATION_UNRESOLVED','存在结果未知的COS写入，请核对后再完成物理清理',503);
    invariant(files.length<=2&&files.every(f=>f.isFile()&&!f.isSymbolicLink()&&['original.bin','preview.jpg'].includes(f.name)),'COS_PURGE_INVALID','处理目录存在未知对象',503);
    addToken(token,'work-directory');
   }
   invariant(workCount<=L.attempts&&ingestCount<=2,'COS_PURGE_INCOMPLETE','媒体处理目录数异常',503);
   if(knownToken)addToken(knownToken,'purge-intent');
   const receipt:CosReconciliationReceipt={schema:'once-cos-reconciliation-v1',state:'RECONCILIATION_REQUIRED',
    targetDigest:createHash('sha256').update(JSON.stringify({bucket:this.bucket,prefix:this.prefix})).digest('hex'),uploadId:id,list:'NOT_ATTEMPTED',candidates:[]};
   const refresh=()=>{receipt.candidates=[...candidates.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([key,sources])=>({key,sources:[...sources].sort(),delete:'NOT_ATTEMPTED'}));};
   refresh();await writeCosReconciliationReceipt(quarantine,receipt);
   await this.io(async()=>{
    await this.checkBucket();
    receipt.list='UNKNOWN';await writeCosReconciliationReceipt(quarantine,receipt);
    const listed=await this.cos.getBucket({...this.bucket,Prefix,MaxKeys:100});
    invariant(listed.statusCode===200&&String(listed.IsTruncated)==='false'&&Array.isArray(listed.Contents)&&listed.Contents.length<=L.attempts*2,'COS_PURGE_INCOMPLETE','媒体对象数异常，未确认删除完成',503);
    // Validate every local entry and every listed key before deleting anything.
    for(const row of listed.Contents){
     invariant(typeof row.Key==='string'&&row.Key.startsWith(Prefix),'COS_PURGE_INVALID','对象目录或身份不符',503);
     const parts=row.Key.slice(Prefix.length).split('/');
     invariant(parts.length===2&&isUuid(parts[0]!)&&(parts[1]==='original.bin'||parts[1]==='preview.jpg'),'COS_PURGE_INVALID','对象目录或身份不符',503);
     add(parts[0]!,parts[1] as 'original.bin'|'preview.jpg','listed');
    }
    invariant(tokens.size<=L.attempts&&candidates.size<=L.attempts*2,'COS_PURGE_INCOMPLETE','媒体对象数异常',503);
    receipt.list='NONAUTHORITATIVE';refresh();
    await writeCosReconciliationReceipt(quarantine,receipt);
    for(const candidate of receipt.candidates){
     invariant(!signal?.aborted,'MEDIA_CANCELLED','清理已取消',409);
     // Write UNKNOWN before the side effect: crash, timeout or a lost reply can
     // never leave a receipt claiming that the DELETE was not attempted.
     candidate.delete='UNKNOWN';await writeCosReconciliationReceipt(quarantine,receipt);
     const deleted=await this.cos.deleteObject({...this.bucket,Key:candidate.key});
     invariant(deleted.statusCode===200||deleted.statusCode===204,'COS_DELETE_UNKNOWN','COS删除结果尚未确认',503);
     candidate.delete='ACKNOWLEDGED';await writeCosReconciliationReceipt(quarantine,receipt);
    }
    const after=await this.cos.getBucket({...this.bucket,Prefix,MaxKeys:1});
    invariant(after.statusCode===200&&String(after.IsTruncated)==='false'&&Array.isArray(after.Contents)&&!after.Contents.length,'COS_PURGE_INCOMPLETE','COS对象仍存在或清单不完整',503);
    // Neither the receipt nor an empty list covers historical missing attempts,
    // old/external writers or a late PUT. Never finalize from these observations.
    throw new AppError(503,'COS_PURGE_RECONCILIATION_REQUIRED','COS对象目录与写入历史尚未完整核对，暂不能确认物理清理完成');
   });
  });
 }
}
export async function configuredMediaProvider(env:NodeJS.ProcessEnv=process.env,existing=false):Promise<LocalMediaProvider|null>{
 const mode=env.MEDIA_PROVIDER??'disabled';if(mode==='disabled')return null;
 if(mode==='cos')return CosMediaProvider.connect(env,existing);
 invariant(mode==='local','MEDIA_PROVIDER_INVALID','媒体提供方无效',503);
 return existing?LocalMediaProvider.openExisting(env.MEDIA_ROOT!):LocalMediaProvider.create(env.MEDIA_ROOT!);
}
