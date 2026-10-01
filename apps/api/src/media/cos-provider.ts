import type {PurgeObjectRef,ObjectPresence} from './purge-provider.ts';
import {openHttpsByteStream, validateByteRequest, type ImmutableMediaObject, type ByteStreamRequest, type OpenMediaStream} from './byte-stream.ts';
import COS from 'cos-nodejs-sdk-v5';
import {readFile,writeFile,lstat,readdir,rm,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Writable} from 'node:stream';
import {LocalMediaProvider} from './local-provider.ts';
import {AppError,invariant} from '../../../../packages/core/src/errors.ts';
import {uuid} from '../../../../packages/core/src/validation.ts';
import {MEDIA_LIMITS as L,mediaByteLimit,type MediaAsset,type MediaUpload} from '../../../../packages/core/src/media-model.ts';

/** API and worker share a private staging volume. Final bytes are private COS objects;
 * the database retains only stable upload/attempt identities, never public URLs. */
export class CosMediaProvider extends LocalMediaProvider {
 readonly cos:COS;readonly bucket:{Bucket:string;Region:string};readonly prefix:string;
 constructor(root:string,cos:COS,bucket:{Bucket:string;Region:string},prefix:string){super(root);this.cos=cos;this.bucket=bucket;this.prefix=prefix;}
 static async connect(env:NodeJS.ProcessEnv,existing=false){
  const Bucket=env.COS_BUCKET??'',Region=env.COS_REGION??'',prefix=env.COS_PREFIX??'';
  invariant(/^[a-z0-9-]+-\d+$/.test(Bucket)&&/^[a-z]+-[a-z]+-?\d*$/.test(Region)&&/^[a-zA-Z0-9_-]{1,64}$/.test(prefix),'COS_CONFIG_INVALID','需要独立COS桶、地域和应用目录',503);
  const file=env.COS_CREDENTIALS_FILE;invariant(file,'COS_CONFIG_INVALID','需要COS凭证文件',503);
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
  invariant(!hasPolicy&&acl.ACL==='private'&&!version.VersioningConfiguration?.Status,'COS_BUCKET_UNSAFE','COS必须为私有且从未启用版本控制的专用桶',503);
 });}
 private key(id:string,token:string,part:string){return `${this.prefix}/uploads/${uuid.parse(id)}/${uuid.parse(token)}/${part}`;}
 override async publish(u:MediaUpload,signal:AbortSignal){return this.publishSealed(u.id,u.leaseToken!,signal);}
 async publishSealed(id:string,token:string,signal:AbortSignal,parts:Array<'original.bin'|'preview.jpg'>=['original.bin','preview.jpg']){
  await this.checkBucket();
  const pending=join(this.work(id,token),'.cos-publishing');
  await writeFile(pending,'PENDING\n',{mode:0o600});
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
  await rm(pending,{force:true});
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
 override async statPurgeObject(ref:PurgeObjectRef,signal:AbortSignal):Promise<ObjectPresence>{const remote=await this.purgeHead(ref,signal),local=await super.statPurgeObject(ref,signal);return remote==='MISSING'&&local==='MISSING'?'MISSING':'EXISTS';}
 override async deleteImmutableObject(ref:PurgeObjectRef,signal:AbortSignal){
  if(await this.purgeHead(ref,signal)==='EXISTS'){
   invariant(!signal.aborted,'MEDIA_CANCELLED','清理已取消',409);
   try{const r=await this.cos.deleteObject({...this.bucket,Key:this.key(ref.uploadId,ref.objectToken,ref.part==='original'?'original.bin':'preview.jpg')});invariant(r.statusCode===200||r.statusCode===204,'COS_DELETE_UNKNOWN','COS删除结果尚未确认',503);}catch(e){if((e as COS.CosError)?.statusCode!==404)throw e;}
  }
  await super.deleteImmutableObject(ref,signal);
 }
 override async purge(id:string){
  await this.checkBucket();const Prefix=`${this.prefix}/uploads/${uuid.parse(id)}/`;
  // Rename staging out of the active namespace first. A late publisher cannot start.
  // An uncertain in-flight upload leaves its durable marker: never claim physical purge.
  const quarantine=join(this.root,'trash',uuid.parse(id));
  try{await rename(this.group(id),quarantine);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  let directories:string[]=[];try{directories=await readdir(quarantine);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  for(const dir of directories.filter(d=>d.startsWith('work-'))){
   try{await lstat(join(quarantine,dir,'.cos-publishing'));throw new AppError(503,'COS_PUBLICATION_UNRESOLVED','存在结果未知的COS写入，请核对后再完成物理清理');}
   catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }
  // At most three attempts, two objects per attempt. Bound both listing and deletion.
  await this.io(async()=>{
   const listed=await this.cos.getBucket({...this.bucket,Prefix,MaxKeys:100});
   invariant(listed.statusCode===200&&String(listed.IsTruncated)!=='true','COS_PURGE_INCOMPLETE','媒体对象数异常，未确认删除完成',503);
   invariant((listed.Contents??[]).length<=6,'COS_PURGE_INCOMPLETE','媒体对象数异常',503);
   for(const row of listed.Contents??[]){const suffix=row.Key.slice(Prefix.length);invariant(row.Key.startsWith(Prefix)&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(original\.bin|preview\.jpg)$/.test(suffix),'COS_PURGE_INVALID','对象目录或身份不符',503);try{const deleted=await this.cos.deleteObject({...this.bucket,Key:row.Key});invariant(deleted.statusCode===200||deleted.statusCode===204,'COS_DELETE_UNKNOWN','COS删除结果尚未确认',503);}catch(e){if((e as COS.CosError)?.statusCode!==404)throw e;}}
   const after=await this.cos.getBucket({...this.bucket,Prefix,MaxKeys:1});invariant(after.statusCode===200&&!(after.Contents??[]).length,'COS_PURGE_INCOMPLETE','COS对象仍存在',503);
  });
  await super.purge(id);
 }
}
export async function configuredMediaProvider(env:NodeJS.ProcessEnv=process.env,existing=false):Promise<LocalMediaProvider|null>{
 const mode=env.MEDIA_PROVIDER??'disabled';if(mode==='disabled')return null;
 if(mode==='cos')return CosMediaProvider.connect(env,existing);
 invariant(mode==='local','MEDIA_PROVIDER_INVALID','媒体提供方无效',503);
 return existing?LocalMediaProvider.openExisting(env.MEDIA_ROOT!):LocalMediaProvider.create(env.MEDIA_ROOT!);
}
