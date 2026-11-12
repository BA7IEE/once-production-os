import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,chmod,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import type COS from 'cos-nodejs-sdk-v5';
import {CosMediaProvider} from '../../apps/api/src/media/cos-provider.ts';
import {LocalMediaProvider} from '../../apps/api/src/media/local-provider.ts';

const bucket={Bucket:'synthetic-123456',Region:'ap-guangzhou'};
const owner='qcs::cam::uin/100000:uin/100000';
const signal=()=>new AbortController().signal;
const sdk=(acl:unknown,extras:Record<string,unknown>={})=>({
 getBucketAcl:async()=>acl,
 getBucketVersioning:async()=>({VersioningConfiguration:{}}),
 getBucketPolicy:async()=>({Policy:{}}),
 ...extras,
}) as unknown as COS;

test('private COS bucket gate rejects AllUsers WRITE even when SDK classifies ACL as private',async()=>{
 const own={ACL:'private',Owner:{ID:owner},Grants:[{Grantee:{ID:owner},Permission:'FULL_CONTROL'}]};
 await new CosMediaProvider('/unused',sdk(own),bucket,'isolated').checkBucket();
 for(const grantee of [{ID:'qcs::cam::anyone:anyone'},{URI:'http://cam.qcloud.com/groups/global/AllUsers'},{URI:'http://cam.qcloud.com/groups/global/AuthenticatedUsers'}]){
  const acl={...own,Grants:[...own.Grants,{Grantee:grantee,Permission:'WRITE'}]};
  await assert.rejects(new CosMediaProvider('/unused',sdk(acl),bucket,'isolated').checkBucket(),{code:'COS_BUCKET_UNSAFE'});
 }
});

test('COS fails closed when the SDK omits the underlying grants array',async()=>{
 await assert.rejects(new CosMediaProvider('/unused',sdk({ACL:'private'}),bucket,'isolated').checkBucket(),{code:'COS_BUCKET_UNSAFE'});
});

test('COS requires an identified owner and an explicit owner full-control grant',async()=>{
 for(const acl of [
  {ACL:'private',Owner:{},Grants:[]},
  {ACL:'private',Owner:{ID:owner},Grants:[]},
  {ACL:'private',Owner:{ID:owner},Grants:[{Grantee:{ID:owner},Permission:'READ'}]},
 ]) await assert.rejects(new CosMediaProvider('/unused',sdk(acl),bucket,'isolated').checkBucket(),{code:'COS_BUCKET_UNSAFE'});
});

test('COS rejects external bucket policy, suspended versioning and redacts SDK error details',async()=>{
 const acl={ACL:'private',Owner:{ID:owner},Grants:[{Grantee:{ID:owner},Permission:'FULL_CONTROL'}]};
 for(const extra of [{getBucketPolicy:async()=>({Policy:{Statement:[{Effect:'Allow'}]}})}, {getBucketVersioning:async()=>({VersioningConfiguration:{Status:'Suspended'}})}])
  await assert.rejects(new CosMediaProvider('/unused',sdk(acl,extra),bucket,'isolated').checkBucket(),{code:'COS_BUCKET_UNSAFE'});
 const broken=sdk(acl,{getBucketPolicy:async()=>{throw new Error('synthetic-private-provider-error');}});
 await assert.rejects(new CosMediaProvider('/unused',broken,bucket,'isolated').checkBucket(),(e:any)=>e.code==='MEDIA_IO_FAILED'&&!e.message.includes('synthetic-private-provider-error'));
});

test('COS validates every listed key before deleting any key from a mixed namespace',async()=>{
 const root=await mkdtemp(join(tmpdir(),'once-cos-batch-'));try{
  const local=await LocalMediaProvider.create(root),id=randomUUID(),token=randomUUID();
  const valid=`isolated/uploads/${id}/${token}/original.bin`,unexpected=`isolated/uploads/${id}/unexpected-object`;
  const deleted:string[]=[];
  const fake=sdk({ACL:'private',Owner:{ID:owner},Grants:[{Grantee:{ID:owner},Permission:'FULL_CONTROL'}]}, {
   getBucket:async()=>({statusCode:200,IsTruncated:'false',Contents:[{Key:valid},{Key:unexpected}]}),
   deleteObject:async({Key}:{Key:string})=>{deleted.push(Key);return {statusCode:204};},
  });
  const provider=new CosMediaProvider(local.root,fake,bucket,'isolated');
  await assert.rejects(provider.purge(id),{code:'COS_PURGE_INVALID'});
  assert.deepEqual(deleted,[],'invalid listing must be rejected before any delete');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('COS refuses relative credential files at the provider boundary before reading media root',async()=>{
 const root=await mkdtemp(join(tmpdir(),'once-cos-config-'));try{
  const file=join(root,'synthetic.json');await writeFile(file,JSON.stringify({SecretId:'synthetic-id',SecretKey:'synthetic-key'}),{mode:0o600});
  const env={COS_BUCKET:bucket.Bucket,COS_REGION:bucket.Region,COS_PREFIX:'isolated',COS_CREDENTIALS_FILE:relative(process.cwd(),file),MEDIA_ROOT:'not-absolute'};
  await assert.rejects(CosMediaProvider.connect(env),{code:'COS_CONFIG_INVALID'});
 }finally{await rm(root,{recursive:true,force:true});}
});

test('COS deletes only the selected synthetic upload namespace',async()=>{
 const root=await mkdtemp(join(tmpdir(),'once-cos-isolation-'));try{
  const local=await LocalMediaProvider.create(root),id=randomUUID(),other=randomUUID(),token=randomUUID();
  const target=`isolated/uploads/${id}/${token}/original.bin`,sibling=`isolated/uploads/${other}/${token}/original.bin`;
  const objects=new Set([target,sibling]),deleted:string[]=[];
  const fake=sdk({ACL:'private',Owner:{ID:owner},Grants:[{Grantee:{ID:owner},Permission:'FULL_CONTROL'}]}, {
   getBucket:async({Prefix}:{Prefix:string})=>({statusCode:200,IsTruncated:'false',Contents:[...objects].filter(key=>key.startsWith(Prefix)).map(Key=>({Key}))}),
   deleteObject:async({Key}:{Key:string})=>{deleted.push(Key);objects.delete(Key);return {statusCode:204};},
  });
  await assert.rejects(new CosMediaProvider(local.root,fake,bucket,'isolated').purge(id),{code:'COS_PURGE_RECONCILIATION_REQUIRED'});
  assert.deepEqual(deleted,[target]);assert.equal(objects.has(sibling),true);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('COS never confirms purge when final listing is truncated even if it appears empty',async()=>{
 const root=await mkdtemp(join(tmpdir(),'once-cos-incomplete-'));try{
  const local=await LocalMediaProvider.create(root),id=randomUUID(),token=randomUUID();let calls=0;
  const key=`isolated/uploads/${id}/${token}/original.bin`;
  const fake=sdk({ACL:'private',Owner:{ID:owner},Grants:[{Grantee:{ID:owner},Permission:'FULL_CONTROL'}]}, {
   getBucket:async()=>++calls===1?({statusCode:200,IsTruncated:'false',Contents:[{Key:key}]}):({statusCode:200,IsTruncated:'true',Contents:[]}),
   deleteObject:async()=>({statusCode:204}),
  });
  await assert.rejects(new CosMediaProvider(local.root,fake,bucket,'isolated').purge(id),{code:'COS_PURGE_INCOMPLETE'});
 }finally{await rm(root,{recursive:true,force:true});}
});

test('COS rejects unsafe credential permissions, symlinks and malformed JSON before network use',async()=>{
 const root=await mkdtemp(join(tmpdir(),'once-cos-credentials-'));try{
  const file=join(root,'synthetic.json'),link=join(root,'link.json');
  await writeFile(file,'not-json',{mode:0o600});await symlink(file,link);
  const env={COS_BUCKET:bucket.Bucket,COS_REGION:bucket.Region,COS_PREFIX:'isolated',COS_CREDENTIALS_FILE:file,MEDIA_ROOT:'not-absolute'};
  await assert.rejects(CosMediaProvider.connect({...env,COS_CREDENTIALS_FILE:link}),{code:'COS_CONFIG_INVALID'});
  await chmod(file,0o644);await assert.rejects(CosMediaProvider.connect(env),{code:'COS_CONFIG_INVALID'});
  await chmod(file,0o600);await assert.rejects(CosMediaProvider.connect(env),{code:'COS_CONFIG_INVALID'});
 }finally{await rm(root,{recursive:true,force:true});}
});
