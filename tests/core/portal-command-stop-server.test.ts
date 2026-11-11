import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {Application} from '../../packages/core/src/api.ts';
import {MemoryStore} from '../support/memory-store.ts';
import {stagingFixture} from '../support/media-staging.ts';
import {Client,result} from '../support/fixtures.ts';

/** Synthetic in-memory API contracts only. The separate owned PostgreSQL/browser
 * acceptance is required for real transaction serialization and page recovery. */
async function fixture(bound=false){
 const store=new MemoryStore(),f=await stagingFixture(store,bound);
 const enabled=(value:boolean)=>{(f.app.config as typeof f.app.config&{portalCommandStopEnabled?:boolean}).portalCommandStopEnabled=value;};
 const headers=(who=f.a,key=randomUUID())=>({'x-once-talent-account':who.accountId,'idempotency-key':key});
 const stop=(key:string,who=f.a,overrides:Record<string,string>={})=>who.client.raw('POST',`/portal/commands/${key}/stop`,{}, {...headers(who,key),...overrides});
 const stopStatus=(key:string,who=f.a)=>who.client.raw('GET',`/portal/commands/${key}/stop`,undefined,headers(who));
 const original=(key:string,who=f.a)=>who.client.raw('GET',`/portal/commands/${key}`,undefined,headers(who));
 const cancelReceipt=(key:string,who=f.a)=>who.client.raw('GET',`/portal/commands/${key}/cancel`,undefined,headers(who));
 const cancel=(id:string,revision:number,key:string,who=f.a)=>who.client.raw('POST',`/portal/uploads/${id}/cancel`,{expectedRevision:revision},headers(who,key));
 const receipts=()=>store.rows('receipts').filter(r=>r.principalKind==='TALENT');
 const audits=()=>store.rows('audits').filter(a=>a.principalKind==='TALENT');
 return {...f,store,enabled,headers,stop,stopStatus,original,cancelReceipt,cancel,receipts,audits};
}
const assertError=(response:{status:number;body:unknown},status:number,code?:string)=>{assert.equal(response.status,status,JSON.stringify(response.body));if(code)assert.equal((response.body as {error?:{code?:string}}).error?.code,code);};

test('portal stop defaults off and does not create a fence when unavailable',async()=>{
 const f=await fixture(),key=randomUUID(),before=f.receipts().length;
 const me=await f.a.client.raw('GET','/portal/me');assert.equal(result(me).portalCommandStopEnabled,false);
 const stop=await f.stop(key);assertError(stop,503,'PORTAL_STOP_DISABLED');
 assert.notEqual((await f.stopStatus(key)).status,200);
 assert.equal(f.receipts().length,before);
 assert.equal(f.receipts().filter(r=>r.commandKey===key&&r.operation==='portal.command.stop').length,0);
});

test('portal stop wins: late cancel and another portal command with the same key cannot apply',async()=>{
 const f=await fixture(),u=await f.create(),id=u.resourceId as string,key=randomUUID();f.enabled(true);
 const before=(await f.store.transaction(tx=>tx.get('uploads',id)))!;
 assertError(await f.original(key),404);assertError(await f.cancelReceipt(key),404);
 const me=await f.a.client.raw('GET','/portal/me');assert.equal(result(me).portalCommandStopEnabled,true);
 const stopped=await f.stop(key);assertError(stopped,200);const stopBody=result(stopped);
 const fence=f.receipts().filter(r=>r.commandKey===key&&r.operation==='portal.command.stop');
 assert.equal(fence.length,1);assert.equal(fence[0]!.principalKind,'TALENT');assert.equal(fence[0]!.talentAccountId,f.a.accountId);assert.equal(fence[0]!.resourceKind,'talentAccount');assert.equal(fence[0]!.resourceId,f.a.accountId);assert.equal(stopBody.resourceId,f.a.accountId);assert.equal(stopBody.state,'SUCCEEDED');
 const status=await f.stopStatus(key);assertError(status,200);assert.equal(result(status).state,'STOPPED');
 assertError(await f.original(key),404);assertError(await f.cancelReceipt(key),404);
 const retry=await f.stop(key);assertError(retry,200);assert.equal(result(retry).operationId,stopBody.operationId);assert.equal(result(retry).replayed,true);
 assert.equal(f.receipts().filter(r=>r.commandKey===key&&r.operation==='portal.command.stop').length,1);
 const late=await f.cancel(id,before.revision,key);assertError(late,409,'PORTAL_COMMAND_STOPPED');
 const other=await f.a.client.raw('POST','/portal/auth/revoke-other-sessions',{},f.headers(f.a,key));assertError(other,409,'PORTAL_COMMAND_STOPPED');
 const after=(await f.store.transaction(tx=>tx.get('uploads',id)))!;assert.deepEqual(after,before);
 assert.equal(f.receipts().filter(r=>r.commandKey===key&&r.operation!=='portal.command.stop'&&r.talentAccountId===f.a.accountId).length,0);
 assert.equal(f.audits().filter(a=>a.resourceId===id&&a.action==='portal.upload.cancel').length,0);
});

test('an established stop is enforced even if its creation capability is later disabled',async()=>{
 const f=await fixture(),u=await f.create(),id=u.resourceId as string,key=randomUUID();f.enabled(true);
 const before=(await f.store.transaction(tx=>tx.get('uploads',id)))!;assertError(await f.stop(key),200);
 f.enabled(false);assert.notEqual((await f.stop(randomUUID())).status,200);
 assertError(await f.cancel(id,before.revision,key),409,'PORTAL_COMMAND_STOPPED');assert.deepEqual(await f.store.transaction(tx=>tx.get('uploads',id)),before);
});

test('stop is actor scoped and the same key remains available to a different talent account',async()=>{
 const f=await fixture(),key=randomUUID();f.enabled(true);assertError(await f.stop(key),200);
 assertError(await f.stopStatus(key,f.b),404);assertError(await f.original(key,f.b),404);
 const other=await f.b.client.raw('POST','/portal/auth/revoke-other-sessions',{},f.headers(f.b,key));assertError(other,200);
 assert.equal(f.receipts().filter(r=>r.commandKey===key&&r.talentAccountId===f.b.accountId&&r.operation==='portal.sessions.revoke').length,1);
 assert.equal(f.receipts().filter(r=>r.commandKey===key&&r.talentAccountId===f.a.accountId&&r.operation==='portal.command.stop').length,1);
 assertError(await f.original(key),404);assertError(await f.stopStatus(key),200);assertError(await f.stop(key),200);
});

test('original cancel wins: a real receipt prevents stop and remains readable as the cancel',async()=>{
 const f=await fixture(),u=await f.create(),id=u.resourceId as string,key=randomUUID();f.enabled(true);
 const before=(await f.store.transaction(tx=>tx.get('uploads',id)))!,response=await f.cancel(id,before.revision,key);assertError(response,200);
 const after=(await f.store.transaction(tx=>tx.get('uploads',id)))!;assert.equal(after.state,'CANCELLED');assert.equal(after.revision,before.revision+1);
 const stopped=await f.stop(key);assertError(stopped,409,'PENDING_ALREADY_RECORDED');assertError(await f.stopStatus(key),409,'PENDING_ALREADY_RECORDED');assert.equal(f.receipts().filter(r=>r.commandKey===key&&r.operation==='portal.command.stop').length,0);
 const original=await f.original(key),specific=await f.cancelReceipt(key);assertError(original,200);assertError(specific,200);assert.equal(result(original).resourceId,id);assert.equal(result(specific).resourceId,id);assert.equal(result(specific).revision,after.revision);assert.equal(result(specific).state,'SUCCEEDED');
 assert.equal(Object.hasOwn(result(original),'requestBinding'),false);assert.match(result(specific).requestBinding,/^v1:[0-9a-f]{64}$/);assert.equal(Object.hasOwn(result(specific),'requestDigest'),false);
 assert.deepEqual(await f.store.transaction(tx=>tx.get('uploads',id)),after);assert.equal(f.receipts().filter(r=>r.commandKey===key&&r.operation==='portal.upload.cancel').length,1);
});

test('a same-key receipt of another operation blocks stop rather than being called a cancel',async()=>{
 const f=await fixture(),key=randomUUID();f.enabled(true);
 const committed=await f.a.client.raw('POST','/portal/auth/revoke-other-sessions',{},f.headers(f.a,key));assertError(committed,200);
 const read=await f.cancelReceipt(key);assertError(read,404,'NOT_FOUND');assert.equal(Object.hasOwn(result(read),'requestBinding'),false);
 assertError(await f.stop(key),409);assert.equal(f.receipts().filter(r=>r.commandKey===key&&r.operation==='portal.command.stop').length,0);
 assertError(await f.original(key),200);
});

test('two different same-key portal receipts make stop and cancel lookup ambiguous',async()=>{
 const f=await fixture(),u=await f.create(),id=u.resourceId as string,key=randomUUID();f.enabled(true);
 const before=(await f.store.transaction(tx=>tx.get('uploads',id)))!;assertError(await f.cancel(id,before.revision,key),200);
 assertError(await f.a.client.raw('POST','/portal/auth/revoke-other-sessions',{},f.headers(f.a,key)),200);
 const sameKey=f.receipts().filter(r=>r.commandKey===key&&r.talentAccountId===f.a.accountId);assert.equal(sameKey.length,2);assert.notEqual(sameKey[0]!.operation,sameKey[1]!.operation);
 assertError(await f.stop(key),409);assert.equal(f.receipts().filter(r=>r.commandKey===key&&r.operation==='portal.command.stop').length,0);
 assert.notEqual((await f.original(key)).status,200);const read=await f.cancelReceipt(key);assertError(read,404,'NOT_FOUND');assert.equal(Object.hasOwn(result(read),'requestBinding'),false);
});

test('an inaccessible existing cancel receipt is never mistaken for no receipt or safely stopped',async()=>{
 const f=await fixture(true),u=await f.create(),id=u.resourceId as string,key=randomUUID();f.enabled(true);
 const before=(await f.store.transaction(tx=>tx.get('uploads',id)))!;assertError(await f.cancel(id,before.revision,key),200);
 const authorized=await f.cancelReceipt(key);assertError(authorized,200);assert.match(result(authorized).requestBinding,/^v1:[0-9a-f]{64}$/);
 assert.ok(f.grantId);const grant=(await f.store.transaction(tx=>tx.get('talentAccessGrants',f.grantId!)))!;
 assertError(await f.owner.cmd('POST',`/talent-grants/${grant.id}/revoke`,{expectedRevision:grant.revision}),200);
 const denied=await f.cancelReceipt(key);assert.notEqual(denied.status,200);assert.equal(Object.hasOwn(result(denied),'requestBinding'),false);assert.equal(JSON.stringify(denied.body).includes(result(authorized).requestBinding),false);
 assertError(await f.stop(key),409);assert.equal(f.receipts().filter(r=>r.commandKey===key&&r.operation==='portal.command.stop').length,0);
 assert.equal(f.receipts().filter(r=>r.commandKey===key&&r.operation==='portal.upload.cancel').length,1);
});

test('stop requires the original key, same authenticated account, CSRF and origin',async()=>{
 const f=await fixture(),key=randomUUID(),different=randomUUID();f.enabled(true);
 assert.notEqual((await f.stop(key,f.a,{'idempotency-key':different})).status,200);
 assertError(await f.stop(key,f.a,{origin:'https://wrong-origin.test.invalid'}),403);
 assertError(await f.stop(key,f.a,{'x-csrf-token':'synthetic-wrong'}),403);
 assert.notEqual((await f.stop(key,f.a,{'x-once-talent-account':f.b.accountId})).status,200);
 assert.notEqual((await f.owner.raw('POST',`/portal/commands/${key}/stop`,{}, {'idempotency-key':key,'x-once-talent-account':f.a.accountId})).status,200);
 assert.equal(f.receipts().filter(r=>r.commandKey===key&&r.operation==='portal.command.stop').length,0);
 assert.notEqual((await f.a.client.raw('POST',`/portal/commands/${key}/stop`,{unexpected:true},f.headers(f.a,key))).status,200);
 assert.equal(f.receipts().filter(r=>r.commandKey===key&&r.operation==='portal.command.stop').length,0);
});

test('racing real API commands choose one outcome in the serialized in-memory store',async()=>{
 const f=await fixture(),u=await f.create(),id=u.resourceId as string,key=randomUUID();f.enabled(true);
 const before=(await f.store.transaction(tx=>tx.get('uploads',id)))!;
 const [stopped,cancelled]=await Promise.all([f.stop(key),f.cancel(id,before.revision,key)]);
 assert.deepEqual([stopped.status,cancelled.status].sort(),[200,409]);
 const sameKey=f.receipts().filter(r=>r.commandKey===key&&r.talentAccountId===f.a.accountId);
 assert.equal(sameKey.length,1);
 const after=(await f.store.transaction(tx=>tx.get('uploads',id)))!;
 if(stopped.status===200){
  assert.equal(sameKey[0]!.operation,'portal.command.stop');assertError(cancelled,409,'PORTAL_COMMAND_STOPPED');assert.deepEqual(after,before);
  assertError(await f.stopStatus(key),200);assertError(await f.cancelReceipt(key),404);
 }else{
  assert.equal(sameKey[0]!.operation,'portal.upload.cancel');assertError(stopped,409,'PENDING_ALREADY_RECORDED');assert.equal(after.state,'CANCELLED');assert.equal(after.revision,before.revision+1);
  assertError(await f.stopStatus(key),409,'PENDING_ALREADY_RECORDED');assertError(await f.cancelReceipt(key),200);
 }
});

test('synthetic mixed-version stop and original receipts remain ambiguous and reject stop replay',async()=>{
 const f=await fixture(),u=await f.create(),id=u.resourceId as string,originalKey=randomUUID(),key=randomUUID();f.enabled(true);
 const before=(await f.store.transaction(tx=>tx.get('uploads',id)))!;assertError(await f.cancel(id,before.revision,originalKey),200);assertError(await f.stop(key),200);
 // Inject an inconsistent synthetic state: an old writer or bad restore may have
 // ignored an existing fence. This is a negative control, not a real PG race.
 const original=f.receipts().find(r=>r.commandKey===originalKey&&r.operation==='portal.upload.cancel')!;
 await f.store.transaction(tx=>tx.insert('receipts',{...original,id:randomUUID(),commandKey:key}));
 assertError(await f.original(key),409,'PENDING_STATUS_AMBIGUOUS');assertError(await f.cancelReceipt(key),409,'PENDING_STATUS_AMBIGUOUS');assertError(await f.stopStatus(key),409,'PENDING_STATUS_AMBIGUOUS');
 assertError(await f.stop(key),409,'PENDING_ALREADY_RECORDED');assertError(await f.cancel(id,before.revision,key),409,'PORTAL_COMMAND_STOPPED');
 assert.equal(f.receipts().filter(r=>r.commandKey===key&&r.talentAccountId===f.a.accountId).length,2);
});

test('new stops are rate limited per account; replay is free and limit expires',async()=>{
 const f=await fixture();f.enabled(true);const keys=Array.from({length:11},()=>randomUUID());
 for(const key of keys.slice(0,10))assertError(await f.stop(key),200);
 for(let n=0;n<3;n++){const replay=await f.stop(keys[0]!);assertError(replay,200);assert.equal(result(replay).replayed,true);}
 assertError(await f.stop(keys[10]!),429,'RATE_LIMITED');
 assert.equal(f.receipts().filter(r=>r.operation==='portal.command.stop'&&r.talentAccountId===f.a.accountId).length,10);
 assertError(await f.stop(keys[10]!,f.b),200);
 f.clock.advance(3600001);assertError(await f.stop(keys[10]!),200);
});

test('failed stop audit rolls back its receipt and rate change',async()=>{
 const f=await fixture(),u=await f.create(),id=u.resourceId as string,key=randomUUID();f.enabled(true);
 const before=(await f.store.transaction(tx=>tx.get('uploads',id)))!,buckets=await f.store.transaction(tx=>tx.find('rateBuckets'));
 f.store.failNextAudit=true;assertError(await f.stop(key),500);
 assert.equal(f.receipts().filter(r=>r.commandKey===key&&r.operation==='portal.command.stop').length,0);
 assert.deepEqual(await f.store.transaction(tx=>tx.find('rateBuckets')),buckets);
 // The test controls this failure before commit; this is not guidance to blindly
 // retry an unknown client request in production.
 assertError(await f.cancel(id,before.revision,key),200);assertError(await f.stop(key),409,'PENDING_ALREADY_RECORDED');
});

test('stop committed before a response-side journal failure is recovered by status without reissuing cancel',async()=>{
 const f=await fixture(),u=await f.create(),id=u.resourceId as string,key=randomUUID();f.enabled(true);
 const before=(await f.store.transaction(tx=>tx.get('uploads',id)))!,sink=f.app.portal.sink!;
 const completions:Array<{operation:string;resourceId:string}>=[];
 f.app.portal.sink={...sink,async committed(intent,resourceId){
  completions.push({operation:intent.operation,resourceId});
  if(intent.operation==='portal.command.stop')throw new Error('synthetic post-commit journal failure');
  await sink.committed(intent,resourceId);
 }};
 // The injected failure occurs only after the transaction; the HTTP error alone
 // is never evidence that the stop was absent or that a cancel is safe to send.
 assertError(await f.stop(key),500);
 const stops=f.receipts().filter(r=>r.commandKey===key&&r.operation==='portal.command.stop');assert.equal(stops.length,1);
 const intent=f.intents.filter(i=>i.operation==='portal.command.stop').at(-1);assert.equal(intent?.resourceId,f.a.accountId);
 assert.deepEqual(completions,[{operation:'portal.command.stop',resourceId:f.a.accountId}]);
 const read=await f.stopStatus(key);assertError(read,200);assert.equal(result(read).state,'STOPPED');assertError(await f.original(key),404);
 assertError(await f.cancel(id,before.revision,key),409,'PORTAL_COMMAND_STOPPED');assert.deepEqual(await f.store.transaction(tx=>tx.get('uploads',id)),before);
});

test('account disable prevents later stop creation, status reads and receipt replay',async()=>{
 const f=await fixture(),key=randomUUID(),newKey=randomUUID();f.enabled(true);assertError(await f.stop(key),200);
 const account=(await f.store.transaction(tx=>tx.get('talentAccounts',f.a.accountId)))!;
 assertError(await f.owner.cmd('POST',`/talent-accounts/${account.id}/disable`,{expectedRevision:account.revision}),200);
 assertError(await f.stopStatus(key),401);assertError(await f.stop(key),401);assertError(await f.stop(newKey),401);assertError(await f.original(key),401);
 assert.equal(f.receipts().filter(r=>r.commandKey===key&&r.operation==='portal.command.stop').length,1);
 assert.equal(f.receipts().filter(r=>r.commandKey===newKey&&r.operation==='portal.command.stop').length,0);
});

/** Independent wire-contract calculation; keys here are in canonical JSON order. */
const sha256=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');
function expectedBinding(key:string,targetId:string,expectedRevision:number,operation='portal.upload.cancel'){
 const requestDigest=sha256(JSON.stringify({input:{expectedRevision},operation,targetId}));
 return {requestDigest,binding:'v1:'+sha256(JSON.stringify({commandKey:key,purpose:'portal.upload.cancel.binding.v1',requestDigest}))};
}

test('cancel request binding identifies key, operation, target and revision without unauthorized disclosure',async()=>{
 const f=await fixture(),first=await f.create(),second=await f.create();
 const target=first.resourceId as string,otherTarget=second.resourceId as string,key=randomUUID(),otherKey=randomUUID();
 // Fork the same synthetic pre-command state so each real API request can use
 // the same actor/key without violating that operation's idempotency contract.
 const snapshot=structuredClone(f.store.data);
 async function execute(id:string,revisionStage:1|2|3,operation:'cancel'|'complete'='cancel',commandKey=key){
  const store=new MemoryStore();store.data=structuredClone(snapshot);
  const app=new Application(store,f.app.config,f.clock),client=new Client(app),other=new Client(app),internal=new Client(app);
  client.jar={...f.a.client.jar};client.csrf=f.a.client.csrf;
  other.jar={...f.b.client.jar};other.csrf=f.b.client.csrf;
  internal.jar={...f.owner.jar};internal.csrf=f.owner.csrf;
  if(revisionStage>=2){const receiving=await store.transaction(tx=>app.media.beginReceive(tx,f.actor,id,100));assert.equal(receiving.revision,2);
   if(revisionStage===3)await store.transaction(tx=>app.media.finishReceive(tx,f.actor,id,receiving.receiveToken!,100,'a'.repeat(64)));
  }
  const before=(await store.transaction(tx=>tx.get('uploads',id)))!;assert.equal(before.revision,revisionStage);
  const headers={'x-once-talent-account':f.a.accountId,'idempotency-key':commandKey};
  const post=await client.raw('POST',`/portal/uploads/${id}/${operation}`,{expectedRevision:revisionStage},headers);assertError(post,200);
  assert.equal(Object.hasOwn(result(post),'requestBinding'),false);
  const rows=store.rows('receipts').filter(r=>r.commandKey===commandKey&&r.talentAccountId===f.a.accountId);assert.equal(rows.length,1);
  const expected=expectedBinding(commandKey,id,revisionStage,'portal.upload.'+operation);assert.equal(rows[0]!.requestDigest,expected.requestDigest);
  const generic=await client.raw('GET',`/portal/commands/${commandKey}`,undefined,headers);assertError(generic,200);
  assert.equal(Object.hasOwn(result(generic),'requestBinding'),false);assert.equal(Object.hasOwn(result(generic),'requestDigest'),false);
  const scoped=await client.raw('GET',`/portal/commands/${commandKey}/cancel`,undefined,headers);
  if(operation==='cancel'){
   assertError(scoped,200);assert.equal(result(scoped).requestBinding,expected.binding);assert.equal(Object.hasOwn(result(scoped),'requestDigest'),false);
   assert.deepEqual(Object.keys(result(scoped)).sort(),['operationId','requestBinding','resourceId','revision','state'].sort());
   const repeat=await client.raw('GET',`/portal/commands/${commandKey}/cancel`,undefined,headers);assert.equal(result(repeat).requestBinding,expected.binding);
   const crossAccount=await other.raw('GET',`/portal/commands/${commandKey}/cancel`,undefined,{'x-once-talent-account':f.b.accountId});assertError(crossAccount,404);
   const spoof=await other.raw('GET',`/portal/commands/${commandKey}/cancel`,undefined,{'x-once-talent-account':f.a.accountId});assertError(spoof,409,'IDENTITY_CHANGED');
   const staff=await internal.raw('GET',`/portal/commands/${commandKey}/cancel`,undefined,{'x-once-talent-account':f.a.accountId});assertError(staff,401);
   for(const denied of [crossAccount,spoof,staff]){assert.equal(Object.hasOwn(result(denied),'requestBinding'),false);assert.equal(JSON.stringify(denied.body).includes(expected.binding),false);}
  }else{assertError(scoped,404,'NOT_FOUND');assert.equal(Object.hasOwn(result(scoped),'requestBinding'),false);}
  return expected.binding;
 }
 const a=await execute(target,1),otherTargetBinding=await execute(otherTarget,1),rev2=await execute(target,2),rev3=await execute(target,3);
 const otherOperation=await execute(target,3,'complete'),otherCommandKey=await execute(target,1,'cancel',otherKey);
 assert.notEqual(a,otherTargetBinding);assert.notEqual(a,rev2);assert.notEqual(rev2,rev3);assert.notEqual(rev3,otherOperation);assert.notEqual(a,otherCommandKey);
});
