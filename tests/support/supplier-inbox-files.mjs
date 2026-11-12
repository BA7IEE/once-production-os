import {assertEmployeeInboxAiResolved} from '../../packages/core/src/supplier-inbox.ts';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {registeredTemp} from '../../scripts/registered-temp.mjs';
import {newSystem,Client,SYNTHETIC_PASSWORD,sourceInput} from './fixtures.ts';
import {LocalMediaProvider} from '../../apps/api/src/media/local-provider.ts';
import {MediaWorker} from '../../apps/api/src/media/worker.ts';
import {SupplierInboxWorker} from '../../apps/api/src/documents/inbox-worker.ts';
import {emptySupplierProfile} from '../../packages/core/src/supplier-profile-contract.ts';
import {permissionsFor} from '../../packages/core/src/policy.ts';
import {digest} from '../../packages/core/src/json.ts';
import {inspectTalentIntegrity} from '../../packages/core/src/talent-v2-integrity.ts';
import {inspectAiLedger} from '../../packages/core/src/ai-ledger-integrity.ts';
import {DeletionCleanup} from '../../packages/core/src/deletion-cleanup.ts';
import {modelResponse} from './supplier-document-batches.mjs';

/** Anonymous original bytes, actual employee identity, real media/PDF worker. */
export async function verifyInboxFiles(store){
 const temp=registeredTemp();
 try{
  execFileSync('python3',[resolve('tests/documents/fixtures.py'),temp.path],{timeout:15000,stdio:'pipe'});
  const f=newSystem();f.store=store;
  // Construct the application against the supplied transaction implementation.
  const {Application}=await import('../../packages/core/src/api.ts');
  f.app=new Application(store,f.app.config,f.clock);f.owner=new Client(f.app);
  const ids=await f.app.identity.bootstrap('owner','合成员工',SYNTHETIC_PASSWORD);
  await store.transaction(async tx=>{const m=await tx.get('memberships',ids.membershipId);await tx.replace('memberships',{...m,extraPermissions:[...m.extraPermissions,'ai.use']});});
  await f.owner.login();f.app.config.mediaEnabled=true;
  const ok=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
  const actor=await store.transaction(async tx=>{const m=await tx.get('memberships',ids.membershipId),u=await tx.get('users',m.userId);return {actorKind:'HUMAN',workspaceId:ids.workspaceId,userId:u.id,membershipId:m.id,role:m.role,permissions:permissionsFor(m),displayName:u.displayName,userEpoch:u.sessionEpoch,sessionId:'synthetic-employee'};});
  const batch=ok(await f.owner.cmd('POST','/supplier-inbox',{source:{...sourceInput(),title:'匿名原件收件验收'},receivedAt:f.clock.now().toISOString()}),201).resourceId;
  const read=async()=>ok(await f.owner.raw('GET','/supplier-inbox/'+batch));
  const provider=await LocalMediaProvider.create(join(temp.path,'media'));
  async function upload(name,mime='application/pdf'){
   const bytes=await readFile(join(temp.path,name)),sha256=createHash('sha256').update(bytes).digest('hex');
   const u=await store.transaction(tx=>f.app.media.create(tx,actor,{sourceId:batch,expectedSourceRevision:1,fileName:name,mime,expectedBytes:bytes.length,sha256}));
   const receiving=await store.transaction(tx=>f.app.media.beginReceive(tx,actor,u.id,bytes.length));
   const received=await provider.receive(receiving,Readable.from(bytes),new AbortController().signal);
   await store.transaction(async tx=>{const ready=await f.app.media.finishReceive(tx,actor,u.id,receiving.receiveToken,received.bytes,received.sha256);await f.app.media.complete(tx,actor,u.id,{expectedRevision:ready.revision});});
   const claim=await f.app.media.claim(u.id);assert.ok(claim);await new MediaWorker(f.app,provider).process(claim,new AbortController().signal);
   assert.equal((await store.transaction(tx=>tx.get('assets',u.id))).state,'READY');return u.id;
  }
  async function add(assetId){const b=await read();ok(await f.owner.cmd('POST','/supplier-inbox/'+batch+'/materials',{expectedRevision:b.revision,assetId,url:null,note:'合成原件，无真实个人信息'}));return (await read()).materials.find(m=>m.assetId===assetId);}
  async function command(name,m,extra={}){const b=await read(),current=b.materials.find(x=>x.id===m.id);return f.owner.cmd('POST','/supplier-inbox/'+batch+'/'+name,{expectedRevision:b.revision,materialId:m.id,expectedMaterialRevision:current.revision,...extra});}
  const asset=await upload('long-portfolio.pdf'),m=await add(asset);
  ok(await command('parse',m,{useAi:false,aiAccepted:false}));
  for(let i=0;i<3;i++)assert.equal(await new SupplierInboxWorker(f.app,provider).cycle(new AbortController().signal),true);
  let current=(await read()).materials.find(x=>x.id===m.id);
  assert.equal(current.state,'READY');assert.deepEqual(current.payload.chunks.map(c=>c.pages),[[1,2,3,4],[5,6,7,8],[9,10]]);
  assert.ok(current.payload.chunks.every(c=>c.actorId===actor.membershipId&&c.sourceRevision===1));
  assert.match(current.payload.chunks[0].manifest.pages[0].text,/Lin He/);
  const chunk=current.payload.chunks[0],image=chunk.manifest.pages[0].images[0];assert.ok(image);
  ok(await command('images',m,{imageKeys:[chunk.id+':'+image.key]}));await new SupplierInboxWorker(f.app,provider).cycle(new AbortController().signal);
  current=(await read()).materials.find(x=>x.id===m.id);assert.equal(current.state,'READY');const imageId=Object.values(current.payload.imageImports)[0];assert.ok(imageId);
  const subject=(name,page)=>({id:randomUUID(),decision:'CREATE',personId:null,expectedPersonRevision:null,profile:{...emptySupplierProfile(),displayName:name,roleCodes:['photographer']},evidencePages:[page],professionalReplace:[],works:[]});
  const first=subject('匿名摄影甲',1),second=subject('匿名摄影乙',5);
  first.works=[{id:randomUUID(),title:'匿名案例',description:'合成作品',roleCode:'photographer',brandDisplayName:'',dateText:'2024',assetIds:[imageId],origins:[]}];
  ok(await command('review',m,{materialKind:'MULTI_PERSON',subjects:[first,second]}));
  for(const s of [first,second])ok(await command('adopt',m,{subjectId:s.id,confirmOwnership:true}));
  const people=await store.transaction(tx=>tx.find('people'));assert.equal(people.length,2);assert.equal((await store.transaction(tx=>tx.find('workCredits'))).length,1);
  const png=await add(await upload('photo.png','image/png'));ok(await command('parse',png,{useAi:false,aiAccepted:false}));await new SupplierInboxWorker(f.app,provider).cycle(new AbortController().signal);
  const linked={...subject('不覆盖原姓名',1),decision:'LINK',personId:people[0].id,expectedPersonRevision:people[0].revision,profile:{...emptySupplierProfile(),displayName:'不覆盖原姓名',roleCodes:['director']}};
  ok(await command('review',png,{materialKind:'PORTFOLIO',subjects:[linked]}));ok(await command('adopt',png,{subjectId:linked.id,confirmOwnership:true}));assert.equal((await store.transaction(tx=>tx.find('people'))).length,2);
  assert.equal((await store.transaction(tx=>tx.find('talentAccounts'))).length,0);
  // Controlled model response loss: no automatic resend and no new-task bypass.
  f.app.config.ai={enabled:true,providerIdentityHash:digest('synthetic-employee-model'),configRevision:1,recoveryEpoch:f.app.config.recoveryEpoch,currency:'CNY',perTaskLimitUnits:100,dailyLimitUnits:1000,maxAttempts:1};
  const ops=ok(await f.owner.raw('GET','/ai-operations'));ok(await f.owner.cmd('POST','/ai-operations/approval',{configDigest:ops.candidate.digest,expectedRevision:0,enabled:true,confirmConfiguration:true}));
  const ai=await add(await upload('portfolio.pdf'));ok(await command('parse',ai,{useAi:true,aiAccepted:true}));let calls=0;
  await new SupplierInboxWorker(f.app,provider,async()=>({callDocument:async()=>{calls++;throw new Error('synthetic lost response');}})).cycle(new AbortController().signal);
  assert.equal((await read()).materials.find(x=>x.id===ai.id).state,'PAUSED');
  assert.equal(await new SupplierInboxWorker(f.app,provider).cycle(new AbortController().signal),false);assert.equal(calls,1);
  assert.equal((await command('control',ai,{action:'RESUME',aiRetryAccepted:true})).body.error.code,'AI_OUTCOME_RECONCILE_REQUIRED');
  const duplicate=await add(await upload('portfolio.pdf'));assert.equal((await command('parse',duplicate,{useAi:true,aiAccepted:true})).body.error.code,'AI_OUTCOME_RECONCILE_REQUIRED');
  await assert.rejects(store.transaction(tx=>assertEmployeeInboxAiResolved(tx,actor)),error=>error.code==='AI_OUTCOME_RECONCILE_REQUIRED');
  const unresolved=ok(await f.owner.raw('GET','/ai-operations')).unresolved[0],attempt=await store.transaction(tx=>tx.get('aiAttempts',unresolved.id));
  ok(await f.owner.cmd('POST','/ai-attempts/'+attempt.id+'/reconcile',{expectedRevision:attempt.revision,outcome:'NOT_EXECUTED',amountUnits:0,evidenceSourceId:batch,evidenceSourceRevision:1,providerIdempotencyKey:attempt.providerIdempotencyKey,providerIdentityHash:f.app.config.ai.providerIdentityHash,confirmProviderResult:true}));
  ok(await command('control',ai,{action:'RESUME',aiRetryAccepted:true}));
  await new SupplierInboxWorker(f.app,provider,async()=>({callDocument:async input=>{calls++;return modelResponse(input);}})).cycle(new AbortController().signal);
  current=(await read()).materials.find(x=>x.id===ai.id);assert.equal(current.state,'READY');assert.equal(calls,2);assert.equal(current.payload.chunks.length,1);
  const integrity=await store.transaction(tx=>inspectTalentIntegrity(tx,actor.workspaceId,f.app.config.contactKey,f.clock));assert.equal(integrity.relationFailures,0);assert.equal(integrity.professionalFactFailures,0);
  assert.equal((await store.transaction(tx=>inspectAiLedger(tx,actor.workspaceId))).relationFailures,0);
  // Explicit deletion sees the encrypted derivative before blocking and erases it.
  const person=await store.transaction(tx=>tx.get('people',people[0].id));
  const preview=ok(await f.owner.raw('POST','/deletion-requests/preview',{targetKind:'PERSON',targetId:person.id,expectedRevision:person.revision}));assert.equal(preview.complete,true,JSON.stringify(preview.unresolved));assert.ok(preview.items.some(i=>i.resourceKind==='supplierInboxMaterial'));
  const request=ok(await f.owner.cmd('POST','/deletion-requests',{targetKind:'PERSON',targetId:person.id,expectedRevision:person.revision,previewDigest:preview.previewDigest,reason:'匿名收件派生资料清理验收'}),201);
  const state=()=>store.transaction(tx=>tx.get('deletionRequests',request.resourceId));
  ok(await f.owner.cmd('POST','/deletion-requests/'+request.resourceId+'/block',{expectedRevision:request.revision,previewDigest:preview.previewDigest,acknowledgeBlock:true}));
  assert.equal((await read()).materials.find(x=>x.id===m.id).state,'RESTRICTED');
  for(const item of await store.transaction(tx=>tx.find('deletionItems',{requestId:request.resourceId})))if(item.decision==='PENDING')ok(await f.owner.cmd('POST','/deletion-requests/'+request.resourceId+'/decisions',{expectedRevision:(await state()).revision,entryId:item.id,decision:'APPLY_PROPOSED',decisionReason:'明确清理匿名人物派生资料'}));
  ok(await f.owner.cmd('POST','/deletion-requests/'+request.resourceId+'/plan/freeze',{expectedRevision:(await state()).revision,acknowledgePlan:true}));
  ok(await f.owner.cmd('POST','/deletion-requests/'+request.resourceId+'/cleaning/start',{expectedRevision:(await state()).revision,planDigest:(await state()).planDigest,acknowledgeIrreversible:true}));
  const cleanup=new DeletionCleanup(store,f.clock,f.app.config),claim=await cleanup.claim();assert.ok(claim);await cleanup.process(claim);
  assert.equal((await store.transaction(tx=>tx.get('supplierInboxMaterials',m.id))).ciphertext===null,true,JSON.stringify((await store.transaction(tx=>tx.find('deletionItems',{requestId:request.resourceId}))).map(i=>({kind:i.resourceKind,state:i.cleanupState,error:i.cleanupErrorCode}))));
  assert.equal((await store.transaction(tx=>tx.get('assets',asset))).state,'READY','independently owned original is preserved');
 }finally{temp.cleanup();}
}
