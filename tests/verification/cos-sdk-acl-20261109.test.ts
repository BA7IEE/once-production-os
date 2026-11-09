import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import COS from 'cos-nodejs-sdk-v5';
import {CosMediaProvider} from '../../apps/api/src/media/cos-provider.ts';

test('locked COS SDK parses AllUsers WRITE as private; the ONCE gate must reject its grants',async()=>{
 let calls=0;
 const xml=`<?xml version="1.0" encoding="UTF-8"?>
 <AccessControlPolicy><Owner><ID>synthetic-owner</ID><DisplayName>owner</DisplayName></Owner>
 <AccessControlList><Grant><Grantee><ID>synthetic-owner</ID></Grantee><Permission>FULL_CONTROL</Permission></Grant>
 <Grant><Grantee><ID>qcs::cam::anyone:anyone</ID></Grantee><Permission>WRITE</Permission></Grant></AccessControlList></AccessControlPolicy>`;
 const server=createServer((_req,res)=>{calls++;res.writeHead(200,{'Content-Type':'application/xml'});res.end(xml);});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 try{
  const port=(server.address() as {port:number}).port;
  // A real SDK instance talks solely to this loopback stub, never a cloud endpoint.
  const client=new COS({SecretId:'synthetic-id',SecretKey:'synthetic-key',Protocol:'http:',Domain:'127.0.0.1:'+port,Timeout:2000,ChunkRetryTimes:0,FollowRedirect:false,AutoSwitchHost:false});
  const bucket={Bucket:'synthetic-123456',Region:'ap-guangzhou'};
  const parsed=await client.getBucketAcl(bucket);
  assert.equal(calls,1);assert.equal(parsed.ACL,'private');
  assert.ok(parsed.Grants.some((g:any)=>g.Grantee.ID==='qcs::cam::anyone:anyone'&&g.Permission==='WRITE'));
  const fake={getBucketAcl:async()=>parsed,getBucketVersioning:async()=>({VersioningConfiguration:{}}),getBucketPolicy:async()=>({Policy:{}})} as unknown as COS;
  await assert.rejects(new CosMediaProvider('/unused',fake,bucket,'isolated').checkBucket(),{code:'COS_BUCKET_UNSAFE'});
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});

test('locked COS SDK maps malformed ownerless ACL XML to private; ONCE must fail closed',async()=>{
 const server=createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'application/xml'});res.end('<Unexpected/>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 try{
  const port=(server.address() as {port:number}).port;
  const client=new COS({SecretId:'synthetic-id',SecretKey:'synthetic-key',Protocol:'http:',Domain:'127.0.0.1:'+port,Timeout:2000,ChunkRetryTimes:0,FollowRedirect:false,AutoSwitchHost:false});
  const bucket={Bucket:'synthetic-123456',Region:'ap-guangzhou'},parsed=await client.getBucketAcl(bucket);
  assert.equal(parsed.ACL,'private');assert.deepEqual(parsed.Grants,[]);assert.equal(parsed.Owner.ID,undefined);
  const fake={getBucketAcl:async()=>parsed,getBucketVersioning:async()=>({VersioningConfiguration:{}}),getBucketPolicy:async()=>({Policy:{}})} as unknown as COS;
  await assert.rejects(new CosMediaProvider('/unused',fake,bucket,'isolated').checkBucket(),{code:'COS_BUCKET_UNSAFE'});
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
