import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import sharp from 'sharp';
import {registeredTemp} from '../../scripts/registered-temp.mjs';
import {MemoryStore} from './memory-store.ts';
import {supplierFixture} from './supplier-profiles.ts';
import {LocalMediaProvider} from '../../apps/api/src/media/local-provider.ts';
import {digest} from '../../packages/core/src/json.ts';

export async function uploadedDocumentFixture(fn,{fileName='portfolio.pdf',store=new MemoryStore()}={}){
 const temporary=registeredTemp();
 try{
  execFileSync('python3',[resolve('tests/documents/fixtures.py'),temporary.path],{timeout:15000,stdio:'pipe'});
  const f=await supplierFixture(store),draft=await f.create();
  f.app.config.mediaEnabled=true;
  const workspaceId=(await f.store.transaction(tx=>tx.find('workspaces')))[0].id;
  const actor={actorKind:'TALENT',workspaceId,talentAccountId:f.a.accountId,sessionId:'',sessionEpoch:1};
  const provider=await LocalMediaProvider.create(join(temporary.path,'media'));
  const rev=async()=> (await f.read(draft.resourceId)).revision;
  async function uploadDocument(name){
  const bytes=await readFile(join(temporary.path,name)),hash=createHash('sha256').update(bytes).digest('hex');
  const upload=f.ok(await f.a.client.raw('POST','/portal/uploads',{context:{kind:'TALENT_SUBMISSION',submissionId:draft.resourceId},expectedSubmissionRevision:await rev(),fileName:name,mime:'application/pdf',expectedBytes:bytes.length,sha256:hash},f.headers()));
  const receiving=await f.store.transaction(tx=>f.app.media.beginReceive(tx,actor,upload.resourceId,bytes.length));
  const received=await provider.receive(receiving,Readable.from(bytes),new AbortController().signal);
  await f.store.transaction(tx=>f.app.media.finishReceive(tx,actor,upload.resourceId,receiving.receiveToken,received.bytes,received.sha256));
  const current=await f.store.transaction(tx=>tx.get('uploads',upload.resourceId));
  f.ok(await f.a.client.raw('POST','/portal/uploads/'+current.id+'/complete',{expectedRevision:current.revision},f.headers()));
  const claim=await f.app.media.claim();assert.equal(claim.id,upload.resourceId);
  const sealed=await provider.seal(claim,new AbortController().signal),preview=await sharp({create:{width:24,height:24,channels:3,background:'white'}}).jpeg().toBuffer();
  await writeFile(sealed.preview,preview,{mode:0o400});await provider.publish(claim,new AbortController().signal);
  await f.app.media.finish(claim,{mime:'application/pdf',bytes:bytes.length,sha256:hash,width:24,height:24,previewBytes:preview.length,previewHash:createHash('sha256').update(preview).digest('hex')});
  await provider.removeStaging(claim);
   return upload;
  }
  const upload=await uploadDocument(fileName);
  const list=async()=>f.ok(await f.a.client.raw('GET','/portal/profile-drafts/'+draft.resourceId+'/documents',undefined,f.headers()));
  const jobs=async()=>(await list()).items;
  const startWhole=async(useAi=false)=>f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+draft.resourceId+'/documents',{expectedRevision:await rev(),assetId:upload.resourceId,mode:'ALL',useAi,aiAccepted:useAi},f.headers()));
  const control=async(action,extra={})=>{const batch=(await list()).batches[0];return f.a.client.raw('POST','/portal/profile-drafts/'+draft.resourceId+'/documents/batch',{expectedRevision:await rev(),batchId:batch.id,expectedBatchRevision:batch.revision,action,aiRetryAccepted:false,...extra},f.headers());};
  const start=async(useAi=false)=>f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+draft.resourceId+'/documents',{expectedRevision:await rev(),assetId:upload.resourceId,pages:[1,2],useAi,aiAccepted:useAi},f.headers()));
  const approve=async()=>{f.app.config.ai={enabled:true,providerIdentityHash:digest('synthetic-document-model'),configRevision:1,recoveryEpoch:f.app.config.recoveryEpoch,currency:'CNY',perTaskLimitUnits:100,dailyLimitUnits:1000,maxAttempts:1};
   const ops=f.ok(await f.owner.raw('GET','/ai-operations'));f.ok(await f.owner.cmd('POST','/ai-operations/approval',{configDigest:ops.candidate.digest,expectedRevision:0,enabled:true,confirmConfiguration:true}));};
  await fn({...f,draft,rev,actor,provider,upload,uploadDocument,jobs,start,approve,list,startWhole,control});
 }finally{await store.close();temporary.cleanup();}
}
