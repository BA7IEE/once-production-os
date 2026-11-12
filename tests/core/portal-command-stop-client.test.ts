import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PortalCommands,PortalRequestError,PortalStopConfirmed,type PortalMarker} from '../../apps/admin-web/src/portal-command.ts';
import {encodePortalMarker,homepageMarkers,portalMarkers} from '../../apps/admin-web/src/portal-pending-marker.ts';

const owner='33333333-3333-4333-8333-333333333333';
const other='55555555-5555-4555-8555-555555555555';
const upload='22222222-2222-4222-8222-222222222222';
const wrongUpload='66666666-6666-4666-8666-666666666666';
const legacyKey='44444444-4444-4444-8444-444444444444';
const otherKey='77777777-7777-4777-8777-777777777777';
const cancelPath='/uploads/'+upload+'/cancel';
const cancelBody={expectedRevision:7};
const cancelReceipt={operationId:'11111111-1111-4111-8111-111111111111',resourceId:upload,revision:8,state:'SUCCEEDED' as const};
const stopReceipt={operationId:'88888888-8888-4888-8888-888888888888',resourceId:owner,revision:1,state:'SUCCEEDED' as const};
const noCancel=()=>new PortalRequestError('未找到原回执',404,'NOT_FOUND',false);
const noStop=()=>new PortalRequestError('尚未停止',404,'STOP_NOT_FOUND',false);
const lost=()=>new PortalRequestError('响应丢失',0,'NETWORK_ERROR',true);

type Call={path:string;method:string;body:unknown;key:string};
type Handler=(call:Call)=>Promise<unknown>;
const sha256=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');
function cancelBinding(key:string,id=upload,revision=7,operation='portal.upload.cancel'){
 // The fixture keys are written in canonical JSON order, independent of the implementation under test.
 const requestDigest=sha256(JSON.stringify({input:{expectedRevision:revision},operation,targetId:id}));
 return 'v1:'+sha256(JSON.stringify({commandKey:key,purpose:'portal.upload.cancel.binding.v1',requestDigest}));
}
function boundReceipt(call:Call,receipt:Record<string,unknown>=cancelReceipt){
 const match=/^\/commands\/([a-f0-9-]+)\/cancel$/i.exec(call.path);assert.ok(match);return {...receipt,requestBinding:cancelBinding(match[1]!)};
}
function assertCancelReceipt(value:{resourceId:string;revision:number;state:string}){assert.equal(value.resourceId,upload);assert.equal(value.revision,8);assert.equal(value.state,'SUCCEEDED');}
function transport(handler:Handler){
 const calls:Call[]=[];
 const request=async(path:string,method:string,body:unknown,key:string)=>{const call={path,method,body,key};calls.push(call);return handler(call);};
 return {calls,request};
}
function memory(seed:PortalMarker|null=null){
 let saved:PortalMarker|null=seed?JSON.parse(encodePortalMarker(seed)):null;
 let removes=0;
 return {
  read(_owner:string){return saved?{...saved}:null;},
  write(marker:PortalMarker){saved=JSON.parse(encodePortalMarker(marker));},
  remove(requestOwner:string,key?:string,binding?:string,nonCancel?:true){if(!saved||saved.owner!==requestOwner||saved.key!==key||saved.cancelBinding!==binding||saved.nonCancel!==nonCancel)throw new Error('待核对标记已变化');saved=null;removes++;},
  peek(){return saved?{...saved}:null;},
  replace(marker:PortalMarker|null){saved=marker?JSON.parse(encodePortalMarker(marker)):null;},
  get removes(){return removes;}
 };
}
async function unknownCancel(handler:Handler,enabled=true){
 const wire=transport(handler),storage=memory(),client=new PortalCommands(wire.request,()=>{},storage,{stopEnabled:enabled});
 await assert.rejects(()=>client.submit(owner,cancelPath,cancelBody));
 assert.equal(client.pending?.uncertain,true);assert.equal(client.hasPending,true);
 const marker=storage.peek();assert.ok(marker);assert.equal(marker.cancelBinding,cancelBinding(marker.key));return {...wire,storage,client,marker};
}

 test('cancel binding independently matches the versioned canonical test vector',()=>{
 assert.equal(cancelBinding(legacyKey),'v1:af8ceaec1a1c119e4ac9091bb25c16ad9b53f045ab502dc806bf6a3849e906f4');
 assert.notEqual(cancelBinding(otherKey),cancelBinding(legacyKey));assert.notEqual(cancelBinding(legacyKey,upload,8),cancelBinding(legacyKey));
 assert.notEqual(cancelBinding(legacyKey,upload,7,'portal.upload.complete'),cancelBinding(legacyKey));
});

for(const [label,body] of [
 ['missing revision',{}],
 ['zero revision',{expectedRevision:0}],
 ['extra fields',{expectedRevision:7,extra:'unexpected'}],
 ['JSON serialization injects extra fields',{toJSON:()=>({expectedRevision:7,extra:'unexpected'})}],
 ['JSON serialization fails',{toJSON:()=>{throw new Error('synthetic serialization failure');}}],
 ['non-finite revision',{expectedRevision:Number.NaN}],
 ['revision cannot be incremented safely',{expectedRevision:Number.MAX_SAFE_INTEGER}]
] as const){
 test('an invalid cancel ('+label+') is rejected before it can be classified as non-cancel',async()=>{
  const storage=memory(),wire=transport(async()=>{throw lost();}),p=new PortalCommands(wire.request,()=>{},storage,{stopEnabled:true});
  await assert.rejects(()=>p.submit(owner,cancelPath,body));assert.equal(wire.calls.length,0);assert.equal(storage.peek(),null);assert.equal(p.hasPending,false);
 });
}

for(const [label,firstReply] of [
 ['wrong upload',{...cancelReceipt,resourceId:wrongUpload}],
 ['wrong revision',{...cancelReceipt,revision:9}]
] as const){
 for(const verified of [true,false]){
  test('a successful-format first cancel response with '+label+' stays unknown until '+(verified?'the matching receipt arrives':'a mismatched receipt is rejected'),async()=>{
   const f=await unknownCancel(async call=>{
    if(call.method==='POST'&&call.path===cancelPath)return firstReply;
    if(call.method==='GET'&&call.path.endsWith('/cancel'))return verified?boundReceipt(call):{...cancelReceipt,requestBinding:cancelBinding(otherKey)};
    throw new Error('unexpected request');
   });
   assert.equal(f.client.confirmed,undefined);assert.deepEqual(f.storage.peek(),f.marker);assert.equal(f.storage.removes,0);
   if(verified)assertCancelReceipt(await f.client.replay(owner));else{await assert.rejects(()=>f.client.replay(owner));assert.equal(f.client.confirmed,undefined);assert.throws(()=>f.client.rendered());}
   assert.equal(f.client.hasPending,true);assert.deepEqual(f.storage.peek(),f.marker);assert.equal(f.storage.removes,0);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
  });
 }
}

 test('lowercase post is normalized as a bound cancel and is not replayed',async()=>{
 const storage=memory(),wire=transport(async call=>{
  if(call.method==='POST'&&call.path===cancelPath)throw lost();
  if(call.method==='GET'&&call.path.endsWith('/cancel'))return boundReceipt(call);
  throw new Error('unexpected request');
 });
 const p=new PortalCommands(wire.request,()=>{},storage,{stopEnabled:true});await assert.rejects(()=>p.submit(owner,cancelPath,cancelBody,'post'));
 const marker=storage.peek();assert.ok(marker);assert.equal(marker.cancelBinding,cancelBinding(marker.key));assert.equal(marker.nonCancel,undefined);
 assertCancelReceipt(await p.replay(owner));assert.deepEqual(wire.calls.map(c=>[c.method,c.path]),[['POST',cancelPath],['GET','/commands/'+marker.key+'/cancel']]);
 assert.deepEqual(storage.peek(),marker);assert.equal(storage.removes,0);
});

 test('unavailable digest fails before any marker or request and releases the preparation lock',async()=>{
 const subtle=crypto.subtle,previous=Object.getOwnPropertyDescriptor(subtle,'digest'),storage=memory(),wire=transport(async()=>{throw lost();});
 const p=new PortalCommands(wire.request,()=>{},storage,{stopEnabled:true});
 Object.defineProperty(subtle,'digest',{configurable:true,value:async()=>{throw new Error('synthetic digest failure');}});
 try{await assert.rejects(()=>p.submit(owner,cancelPath,cancelBody),/synthetic digest failure/);assert.equal(storage.peek(),null);assert.equal(wire.calls.length,0);assert.equal(p.hasPending,false);assert.equal(p.inFlight,false);}
 finally{if(previous)Object.defineProperty(subtle,'digest',previous);else Reflect.deleteProperty(subtle,'digest');}
 // A later retry may start normally; no local or HTTP operation existed before it.
 await assert.rejects(()=>p.submit(owner,cancelPath,cancelBody));const marker=storage.peek();assert.ok(marker);assert.equal(marker.cancelBinding,cancelBinding(marker.key));assert.equal(wire.calls.length,1);
});

 test('while the binding is being prepared a second submission and replay are rejected',async()=>{
 let enteredResolve!:()=>void,releaseResolve!:()=>void;
 const entered=new Promise<void>(resolve=>enteredResolve=resolve),release=new Promise<void>(resolve=>releaseResolve=resolve);
 const subtle=crypto.subtle,previous=Object.getOwnPropertyDescriptor(subtle,'digest'),digest=subtle.digest.bind(subtle),storage=memory(),wire=transport(async()=>{throw lost();});
 const p=new PortalCommands(wire.request,()=>{},storage,{stopEnabled:true});
 Object.defineProperty(subtle,'digest',{configurable:true,value:async(...args:Parameters<SubtleCrypto['digest']>)=>{enteredResolve();await release;return digest(...args);}});
 const first=p.submit(owner,cancelPath,cancelBody).catch(error=>error);await entered;
 try{
  assert.equal(p.inFlight,true);assert.equal(p.hasPending,true);assert.equal(storage.peek(),null);assert.equal(wire.calls.length,0);
  await assert.rejects(()=>p.submit(owner,cancelPath,cancelBody));await assert.rejects(()=>p.replay(owner));assert.equal(wire.calls.length,0);assert.equal(storage.peek(),null);
 }finally{releaseResolve();if(previous)Object.defineProperty(subtle,'digest',previous);else Reflect.deleteProperty(subtle,'digest');await first;}
 const marker=storage.peek();assert.ok(marker);assert.equal(marker.cancelBinding,cancelBinding(marker.key));assert.equal(wire.calls.length,1);assert.equal(p.pending?.uncertain,true);
});

 test('uncertain cancel checks only the scoped receipt and never reposts the original cancel',async()=>{
 const f=await unknownCancel(async call=>{if(call.path===cancelPath&&call.method==='POST')throw lost();if(call.method==='GET'&&call.path.endsWith('/cancel'))return boundReceipt(call);throw new Error('unexpected request');});
 const result=await f.client.replay(owner);assertCancelReceipt(result);
 assert.deepEqual(f.calls.map(c=>[c.method,c.path]),[['POST',cancelPath],['GET','/commands/'+f.marker.key+'/cancel']]);
 assert.equal(f.client.hasPending,true);assert.equal(f.client.canStop,false);assert.deepEqual(f.storage.peek(),f.marker);
 // A successful command still remains pending until the caller has rendered a fresh server view.
 f.client.rendered();assert.equal(f.client.hasPending,false);assert.equal(f.storage.peek(),null);assert.equal(f.storage.removes,1);
});

for(const [label,reply] of [
 ['different upload',{...cancelReceipt,resourceId:wrongUpload}],
 ['wrong revision',{...cancelReceipt,revision:9}],
 ['invalid state',{...cancelReceipt,state:'ACCEPTED'}],
 ['invalid operation id',{...cancelReceipt,operationId:'not-an-id'}]
] as const){
 test('uncertain cancel rejects a '+label+' receipt and remains pending',async()=>{
  const f=await unknownCancel(async call=>{if(call.path===cancelPath&&call.method==='POST')throw lost();if(call.method==='GET'&&call.path.endsWith('/cancel'))return boundReceipt(call,reply);throw new Error('unexpected request');});
  await assert.rejects(()=>f.client.replay(owner));assert.equal(f.client.hasPending,true);assert.equal(f.client.canStop,false);assert.deepEqual(f.storage.peek(),f.marker);
  assert.equal(f.calls.filter(c=>c.method==='POST').length,1);assert.equal(f.calls.filter(c=>c.path.endsWith('/stop')).length,0);
 });
}

 test('legacy marker retains its generic read, then offers explicit stop only after both negative reads',async()=>{
 let stopped=false;const marker={owner,key:legacyKey,draft:false},storage=memory(marker);
 const wire=transport(async call=>{
  if(call.method==='GET'&&call.path==='/commands/'+legacyKey)throw noCancel();
  if(call.method==='GET'&&call.path==='/commands/'+legacyKey+'/stop'){if(!stopped)throw noStop();return {state:'STOPPED'};}
  if(call.method==='POST'&&call.path==='/commands/'+legacyKey+'/stop'){assert.equal(call.key,legacyKey);assert.deepEqual(call.body,{});stopped=true;return stopReceipt;}
  throw new Error('unexpected request');
 });
 const p=new PortalCommands(wire.request,()=>{},storage,{stopEnabled:true});p.restore(owner);
 await p.replay(owner).catch(()=>{});assert.equal(p.hasPending,true);assert.equal(p.canStop,true);assert.deepEqual(storage.peek(),marker);
 assert.deepEqual(wire.calls.map(c=>[c.method,c.path]),[['GET','/commands/'+legacyKey],['GET','/commands/'+legacyKey+'/stop']]);
 await p.stop(owner);assert.deepEqual(wire.calls.slice(2).map(c=>[c.method,c.path]),[['POST','/commands/'+legacyKey+'/stop'],['GET','/commands/'+legacyKey+'/stop']]);
 // Stop confirmation is not an original-command receipt and does not clear storage by itself.
 assert.equal(p.hasPending,true);assert.equal(p.confirmed,undefined);assert.deepEqual(storage.peek(),marker);assert.equal(storage.removes,0);
 p.rendered();assert.equal(p.hasPending,false);assert.equal(storage.peek(),null);assert.equal(storage.removes,1);
});

for(const [label,response] of [
 ['plausible cancel receipt',cancelReceipt],
 ['receipt from another operation',{...cancelReceipt,resourceId:other}],
 ['unverifiable purported binding',{...cancelReceipt,requestBinding:cancelBinding(legacyKey)}]
] as const){
 test('legacy marker keeps pending when generic GET returns 200 with '+label,async()=>{
  const marker={owner,key:legacyKey,draft:false},storage=memory(marker);
  const wire=transport(async call=>{if(call.method==='GET'&&call.path==='/commands/'+legacyKey)return response;throw new Error('unexpected request');});
  const p=new PortalCommands(wire.request,()=>{},storage,{stopEnabled:true});p.restore(owner);
  await assert.rejects(()=>p.replay(owner),error=>error instanceof Error&&/联系/.test(error.message));
  assert.equal(p.hasPending,true);assert.equal(p.confirmed,undefined);assert.equal(p.canStop,false);assert.deepEqual(storage.peek(),marker);assert.equal(storage.removes,0);
  assert.throws(()=>p.rendered());assert.deepEqual(wire.calls.map(c=>[c.method,c.path]),[['GET','/commands/'+legacyKey]]);
 });
}

 test('stop response loss is resolved by status read and never becomes a fake command receipt',async()=>{
 let stopped=false;const marker={owner,key:legacyKey,draft:false},storage=memory(marker);
 const wire=transport(async call=>{
  if(call.method==='GET'&&call.path==='/commands/'+legacyKey)throw noCancel();
  if(call.method==='GET'&&call.path==='/commands/'+legacyKey+'/stop'){if(!stopped)throw noStop();return {state:'STOPPED'};}
  if(call.method==='POST'&&call.path==='/commands/'+legacyKey+'/stop'){assert.equal(call.key,legacyKey);stopped=true;throw lost();}
  throw new Error('unexpected request');
 });
 const p=new PortalCommands(wire.request,()=>{},storage,{stopEnabled:true});p.restore(owner);await p.replay(owner).catch(()=>{});assert.equal(p.canStop,true);
 await assert.rejects(()=>p.stop(owner));assert.equal(p.hasPending,true);assert.deepEqual(storage.peek(),marker);assert.equal(storage.removes,0);
 await assert.rejects(()=>p.replay(owner),error=>error instanceof PortalStopConfirmed);
 assert.equal(p.confirmed,undefined);assert.equal(p.hasPending,true);assert.deepEqual(storage.peek(),marker);
 assert.equal(wire.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/stop')).length,1);
 assert.equal(wire.calls.filter(c=>c.method==='POST'&&c.path===cancelPath).length,0);
 p.rendered();assert.equal(storage.peek(),null);
});

for(const outcome of ['success','unknown failure'] as const){
 test('an in-flight cancel POST rejects replay immediately and preserves its marker on '+outcome,async()=>{
  let enteredResolve!:()=>void,releaseResolve!:()=>void;
  const entered=new Promise<void>(resolve=>enteredResolve=resolve),release=new Promise<void>(resolve=>releaseResolve=resolve);
  const storage=memory();
  const wire=transport(async call=>{
   if(call.method==='POST'&&call.path===cancelPath){enteredResolve();await release;if(outcome==='success')return cancelReceipt;throw lost();}
   if(call.method==='GET'&&call.path.endsWith('/cancel'))return boundReceipt(call);
   throw new Error('unexpected request');
  });
  const p=new PortalCommands(wire.request,()=>{},storage,{stopEnabled:true});
  const original=p.submit(owner,cancelPath,cancelBody).then(value=>({value}),error=>({error}));await entered;
  const marker=storage.peek();assert.ok(marker);assert.equal(marker.cancelBinding,cancelBinding(marker.key));
  const duplicate=p.replay(owner).then(()=> 'resolved',()=> 'rejected');
  let duplicateState='pending',postsBeforeRelease=0;
  try{
   duplicateState=await Promise.race([duplicate,new Promise<string>(resolve=>setTimeout(()=>resolve('pending'),500))]);
   postsBeforeRelease=wire.calls.filter(c=>c.method==='POST').length;
   assert.equal(p.hasPending,true);assert.deepEqual(storage.peek(),marker);assert.equal(storage.removes,0);
  }finally{releaseResolve();}
  const originalResult=await original;await duplicate;
  assert.equal(duplicateState,'rejected');assert.equal(postsBeforeRelease,1);
  assert.equal(wire.calls.filter(c=>c.method==='POST').length,1);assert.equal(p.hasPending,true);assert.deepEqual(storage.peek(),marker);assert.equal(storage.removes,0);
  if(outcome==='success'){assert.ok('value' in originalResult);assertCancelReceipt(originalResult.value);assert.ok(p.confirmed);assertCancelReceipt(p.confirmed);}
  else{assert.ok('error' in originalResult);assert.equal(p.pending?.uncertain,true);assertCancelReceipt(await p.replay(owner));assert.equal(wire.calls.filter(c=>c.method==='POST').length,1);}
  assert.deepEqual(storage.peek(),marker);assert.equal(storage.removes,0);
 });
}

for(const [label,failure] of [
 ['permission denied',new PortalRequestError('不允许',403,'FORBIDDEN',false)],
 ['server failure',new PortalRequestError('服务不可用',503,'UNAVAILABLE',true)],
 ['network failure',new PortalRequestError('连接失败',0,'NETWORK_ERROR',true)],
 ['ambiguous 404',new PortalRequestError('其他 404',404,'NOT_FOUND',false)]
] as const){
 test('unavailable stop status ('+label+') cannot enable stop or clear the marker',async()=>{
  const f=await unknownCancel(async call=>{if(call.path===cancelPath&&call.method==='POST')throw lost();if(call.method==='GET'&&call.path.endsWith('/cancel'))throw noCancel();if(call.method==='GET'&&call.path.endsWith('/stop'))throw failure;throw new Error('unexpected request');});
  await f.client.replay(owner).catch(()=>{});assert.equal(f.client.hasPending,true);assert.equal(f.client.canStop,false);assert.deepEqual(f.storage.peek(),f.marker);
  await assert.rejects(()=>f.client.stop(owner));assert.equal(f.calls.filter(c=>c.method==='POST').length,1);assert.equal(f.storage.removes,0);
 });
}

for(const [label,failure] of [
 ['permission denied',new PortalRequestError('不允许',403,'FORBIDDEN',false)],
 ['server failure',new PortalRequestError('服务不可用',503,'UNAVAILABLE',true)],
 ['network failure',new PortalRequestError('连接失败',0,'NETWORK_ERROR',true)],
 ['unrecognized 404',new PortalRequestError('路径不可用',404,'ROUTE_NOT_FOUND',false)]
] as const){
 test('unavailable cancel receipt ('+label+') never enables stop or resends cancel',async()=>{
  const f=await unknownCancel(async call=>{if(call.path===cancelPath&&call.method==='POST')throw lost();if(call.method==='GET'&&call.path.endsWith('/cancel'))throw failure;throw new Error('unexpected request');});
  await f.client.replay(owner).catch(()=>{});assert.equal(f.client.hasPending,true);assert.equal(f.client.canStop,false);assert.deepEqual(f.storage.peek(),f.marker);
  assert.equal(f.calls.filter(c=>c.method==='POST').length,1);await assert.rejects(()=>f.client.stop(owner));assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
 });
}

 test('malformed stop status and a refused stop preserve pending identity',async()=>{
 let malformed=true;const marker={owner,key:legacyKey,draft:false},storage=memory(marker);
 const wire=transport(async call=>{
  if(call.method==='GET'&&call.path==='/commands/'+legacyKey)throw noCancel();
  if(call.method==='GET'&&call.path.endsWith('/stop')){if(malformed)return {state:'SUCCEEDED'};throw noStop();}
  if(call.method==='POST'&&call.path.endsWith('/stop'))throw new PortalRequestError('不能确认',409,'PENDING_STATUS_AMBIGUOUS',false);
  throw new Error('unexpected request');
 });
 const p=new PortalCommands(wire.request,()=>{},storage,{stopEnabled:true});p.restore(owner);await p.replay(owner).catch(()=>{});
 assert.equal(p.canStop,false);assert.equal(p.hasPending,true);assert.deepEqual(storage.peek(),marker);await assert.rejects(()=>p.stop(owner));
 malformed=false;await p.replay(owner).catch(()=>{});assert.equal(p.canStop,true);await assert.rejects(()=>p.stop(owner));
 assert.equal(p.hasPending,true);assert.deepEqual(storage.peek(),marker);assert.equal(storage.removes,0);
});

 test('disabled feature still reads uncertain cancellation without reposting or clearing',async()=>{
 const f=await unknownCancel(async call=>{if(call.path===cancelPath&&call.method==='POST')throw lost();if(call.method==='GET'&&call.path.endsWith('/cancel'))throw noCancel();if(call.method==='GET'&&call.path.endsWith('/stop'))throw new PortalRequestError('未开放',503,'PORTAL_STOP_DISABLED',true);throw new Error('unexpected request');},false);
 await f.client.replay(owner).catch(()=>{});assert.equal(f.client.canStop,false);assert.equal(f.client.hasPending,true);assert.deepEqual(f.storage.peek(),f.marker);
 await assert.rejects(()=>f.client.stop(owner));assert.equal(f.calls.filter(c=>c.method==='POST').length,1);assert.equal(f.storage.removes,0);
});

 test('stop cannot run before a verified missing receipt or under a different owner',async()=>{
 const marker={owner,key:legacyKey,draft:false},storage=memory(marker),wire=transport(async()=>{throw new Error('no network expected');});
 const p=new PortalCommands(wire.request,()=>{},storage,{stopEnabled:true});p.restore(owner);await assert.rejects(()=>p.stop(owner));await assert.rejects(()=>p.stop(other));await assert.rejects(()=>p.replay(other));
 assert.equal(p.hasPending,true);assert.equal(p.canStop,false);assert.deepEqual(storage.peek(),marker);assert.equal(wire.calls.length,0);
});

 test('replacement marker with the same owner is never cleared by an older stopped request',async()=>{
 let stopped=false;const marker={owner,key:legacyKey,draft:false},storage=memory(marker);
 const wire=transport(async call=>{if(call.method==='GET'&&call.path==='/commands/'+legacyKey)throw noCancel();if(call.method==='GET'&&call.path.endsWith('/stop')){if(!stopped)throw noStop();return {state:'STOPPED'};}if(call.method==='POST'&&call.path.endsWith('/stop')){stopped=true;return stopReceipt;}throw new Error('unexpected request');});
 const p=new PortalCommands(wire.request,()=>{},storage,{stopEnabled:true});p.restore(owner);await p.replay(owner).catch(()=>{});await p.stop(owner);
 const newer={owner,key:otherKey,draft:false};storage.replace(newer);assert.throws(()=>p.rendered());assert.equal(p.hasPending,true);assert.deepEqual(storage.peek(),newer);assert.equal(storage.removes,0);
});

 test('same-owner same-key marker with a replaced proof cannot be cleared after confirmation',async()=>{
 const f=await unknownCancel(async call=>{
  if(call.method==='POST'&&call.path===cancelPath)throw lost();
  if(call.method==='GET'&&call.path.endsWith('/cancel'))return boundReceipt(call);
  throw new Error('unexpected request');
 });
 assertCancelReceipt(await f.client.replay(owner));
 const changed={...f.marker,cancelBinding:cancelBinding(f.marker.key,wrongUpload)};f.storage.replace(changed);
 assert.throws(()=>f.client.rendered());assert.equal(f.client.hasPending,true);assert.deepEqual(f.storage.peek(),changed);assert.equal(f.storage.removes,0);
});

 test('both real marker stores remove only the exact owner and request key',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),values=new Map<string,string>();
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}});
 try{
  for(const store of [portalMarkers,homepageMarkers]){
   store.write({owner,key:legacyKey,draft:false});store.write({owner,key:otherKey,draft:false});
   assert.throws(()=>store.remove(owner,legacyKey));assert.equal(store.read(owner)?.key,otherKey);
   assert.throws(()=>store.remove(other,otherKey));assert.equal(store.read(owner)?.key,otherKey);
   store.remove(owner,otherKey);assert.equal(store.read(owner),null);
  }
 }finally{if(previous)Object.defineProperty(globalThis,'sessionStorage',previous);else Reflect.deleteProperty(globalThis,'sessionStorage');}
});

 test('both real stores compare the binding or category before removing a same-key marker',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),values=new Map<string,string>();
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}});
 try{
  for(const store of [portalMarkers,homepageMarkers]){
   const original=cancelBinding(legacyKey),replacement=cancelBinding(otherKey);store.write({owner,key:legacyKey,draft:false,cancelBinding:replacement});
   assert.throws(()=>store.remove(owner,legacyKey,original));assert.equal(store.read(owner)?.cancelBinding,replacement);
   store.remove(owner,legacyKey,replacement);assert.equal(store.read(owner),null);
   store.write({owner,key:legacyKey,draft:false,nonCancel:true});assert.throws(()=>store.remove(owner,legacyKey));assert.equal(store.read(owner)?.nonCancel,true);
   store.remove(owner,legacyKey,undefined,true);assert.equal(store.read(owner),null);
  }
 }finally{if(previous)Object.defineProperty(globalThis,'sessionStorage',previous);else Reflect.deleteProperty(globalThis,'sessionStorage');}
});

 test('an unreadable marker remains blocked and never triggers recovery requests',async()=>{
 const wire=transport(async()=>{throw new Error('no network expected');});const storage={read:()=>{throw new Error('invalid marker');},write:()=>assert.fail('cannot overwrite'),remove:()=>assert.fail('cannot remove')};
 const p=new PortalCommands(wire.request,()=>{},storage,{stopEnabled:true});assert.throws(()=>p.restore(owner));assert.equal(p.hasPending,true);assert.equal(p.canStop,false);
 await assert.rejects(()=>p.replay(owner));await assert.rejects(()=>p.stop(owner));assert.equal(p.hasPending,true);assert.equal(wire.calls.length,0);
});

 test('cancel markers contain only the versioned binding and minimal identifiers',()=>{
 const binding=cancelBinding(legacyKey);
 const encoded=encodePortalMarker({owner,key:legacyKey,draft:false,cancelBinding:binding,cancel:{uploadId:upload,expectedRevision:7},body:'SYNTHETIC PRIVATE BODY',path:cancelPath,token:'SYNTHETIC TOKEN'} as unknown as PortalMarker);
 assert.deepEqual(Object.keys(JSON.parse(encoded)).sort(),['cancelBinding','draft','key','owner']);assert.equal(JSON.parse(encoded).cancelBinding,binding);
 assert.ok(!encoded.includes('SYNTHETIC'));assert.ok(!encoded.includes(upload));assert.ok(!encoded.includes('expectedRevision'));
});

 test('new non-cancel markers preserve their prior generic recovery without request content',async()=>{
 const storage=memory(),receipt={...cancelReceipt,resourceId:other,revision:4};
 const wire=transport(async call=>{
  if(call.method==='POST'&&call.path==='/claims')throw lost();
  if(call.method==='GET'&&call.path.startsWith('/commands/'))return receipt;
  throw new Error('unexpected request');
 });
 const first=new PortalCommands(wire.request,()=>{},storage,{stopEnabled:true});
 await assert.rejects(()=>first.submit(owner,'/claims',{note:'SYNTHETIC PRIVATE BODY'}));
 const marker=storage.peek();assert.ok(marker);assert.deepEqual(Object.keys(marker).sort(),['draft','key','nonCancel','owner']);assert.equal(marker.nonCancel,true);assert.ok(!JSON.stringify(marker).includes('SYNTHETIC'));
 const restored=new PortalCommands(wire.request,()=>{},storage,{stopEnabled:true});restored.restore(owner);
 assert.equal((await restored.replay(owner)).resourceId,other);assert.deepEqual(wire.calls.map(c=>[c.method,c.path]),[['POST','/claims'],['GET','/commands/'+marker.key]]);
 assert.equal(restored.hasPending,true);assert.deepEqual(storage.peek(),marker);restored.rendered();assert.equal(storage.peek(),null);
});

for(const [label,extra] of [
 ['false non-cancel category',{nonCancel:false}],
 ['string non-cancel category',{nonCancel:'true'}],
 ['both categories',{nonCancel:true,cancelBinding:cancelBinding(legacyKey)}],
 ['malformed cancel binding',{cancelBinding:'v1:not-a-hash'}]
] as const){
 test('a '+label+' marker never becomes an automatically confirmed receipt',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),values=new Map<string,string>(),raw=JSON.stringify({owner,key:legacyKey,draft:false,...extra});
  values.set('once-portal-pending',raw);
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}});
  try{
   const p=new PortalCommands(async()=>cancelReceipt,()=>{},portalMarkers,{stopEnabled:true});try{p.restore(owner);}catch{/* A corrupt marker may fail at restore. */}
   await assert.rejects(()=>p.replay(owner));assert.equal(p.hasPending,true);assert.equal(p.confirmed,undefined);assert.equal(p.canStop,false);
   try{p.rendered();}catch{/* Either rejection path must retain the original marker. */}
   assert.equal(p.hasPending,true);assert.equal(values.get('once-portal-pending'),raw);
  }finally{if(previous)Object.defineProperty(globalThis,'sessionStorage',previous);else Reflect.deleteProperty(globalThis,'sessionStorage');}
 });
}

 test('reloading an uncertain cancel verifies its binding with the scoped receipt path',async()=>{
 const f=await unknownCancel(async call=>{
  if(call.path===cancelPath&&call.method==='POST')throw lost();
  if(call.method==='GET'&&call.path.endsWith('/cancel'))return boundReceipt(call);
  throw new Error('unexpected request');
 });
 assert.deepEqual(Object.keys(f.marker).sort(),['cancelBinding','draft','key','owner']);assert.equal(f.marker.cancelBinding,cancelBinding(f.marker.key));
 assert.ok(!JSON.stringify(f.marker).includes(upload));assert.ok(!JSON.stringify(f.marker).includes('expectedRevision'));
 const restored=new PortalCommands(f.request,()=>{},f.storage,{stopEnabled:true});restored.restore(owner);
 assertCancelReceipt(await restored.replay(owner));
 assert.deepEqual(f.calls.map(c=>[c.method,c.path]),[['POST',cancelPath],['GET','/commands/'+f.marker.key+'/cancel']]);
 assert.equal(restored.hasPending,true);assert.deepEqual(f.storage.peek(),f.marker);assert.equal(f.storage.removes,0);
});

for(const [label,makeValue] of [
 ['missing binding',()=>undefined],
 ['malformed binding',()=> 'v1:not-a-hash'],
 ['another key',()=>cancelBinding(otherKey)],
 ['another upload',key=>cancelBinding(key,wrongUpload)],
 ['another revision',key=>cancelBinding(key,upload,8)],
 ['another operation',key=>cancelBinding(key,upload,7,'portal.upload.complete')]
] as Array<[string,(key:string)=>string|undefined]>){
 for(const reloaded of [false,true]){
  test((reloaded?'reloaded':'same-page')+' cancel rejects '+label+' without clearing',async()=>{
   const f=await unknownCancel(async call=>{
    if(call.path===cancelPath&&call.method==='POST')throw lost();
    if(call.method==='GET'&&call.path.endsWith('/cancel')){const key=call.path.split('/')[2]!;return {...cancelReceipt,requestBinding:makeValue(key)};}
    throw new Error('unexpected request');
   });
   const p=reloaded?new PortalCommands(f.request,()=>{},f.storage,{stopEnabled:true}):f.client;if(reloaded)p.restore(owner);
   await assert.rejects(()=>p.replay(owner));assert.equal(p.hasPending,true);assert.equal(p.confirmed,undefined);assert.equal(p.canStop,false);
   assert.throws(()=>p.rendered());assert.deepEqual(f.storage.peek(),f.marker);assert.equal(f.storage.removes,0);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
  });
 }
}

for(const [label,wrongReceipt] of [
 ['another upload',{...cancelReceipt,resourceId:wrongUpload}],
 ['another revision',{...cancelReceipt,revision:9}]
] as const){
 test('after reload a matching binding with '+label+' result remains unknown',async()=>{
  let wrong=true;
  const f=await unknownCancel(async call=>{
   if(call.method==='POST'&&call.path===cancelPath)throw lost();
   if(call.method==='GET'&&call.path.endsWith('/cancel'))return boundReceipt(call,wrong?wrongReceipt:cancelReceipt);
   throw new Error('unexpected request');
  });
  const restored=new PortalCommands(f.request,()=>{},f.storage,{stopEnabled:true});restored.restore(owner);
  await assert.rejects(()=>restored.replay(owner));assert.equal(restored.confirmed,undefined);assert.equal(restored.hasPending,true);assert.equal(restored.canStop,false);
  assert.throws(()=>restored.rendered());assert.deepEqual(f.storage.peek(),f.marker);assert.equal(f.storage.removes,0);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
  wrong=false;assertCancelReceipt(await restored.replay(owner));assert.deepEqual(f.storage.peek(),f.marker);assert.equal(f.storage.removes,0);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
 });
}

 test('an older receipt whose binding recomputation finishes late cannot override a newer read',async()=>{
 const f=await unknownCancel(async call=>{
  if(call.method==='POST'&&call.path===cancelPath)throw lost();
  if(call.method==='GET'&&call.path.endsWith('/cancel'))return boundReceipt(call);
  throw new Error('unexpected request');
 });
 let enteredResolve!:()=>void,releaseResolve!:()=>void,hold=true;
 const entered=new Promise<void>(resolve=>enteredResolve=resolve),release=new Promise<void>(resolve=>releaseResolve=resolve);
 const subtle=crypto.subtle,previous=Object.getOwnPropertyDescriptor(subtle,'digest'),digest=subtle.digest.bind(subtle);
 Object.defineProperty(subtle,'digest',{configurable:true,value:async(...args:Parameters<SubtleCrypto['digest']>)=>{if(hold){hold=false;enteredResolve();await release;}return digest(...args);}});
 const older=f.client.replay(owner).then(()=>null,error=>error);await entered;
 let oldResult:unknown;
 try{
  assertCancelReceipt(await f.client.replay(owner));assert.ok(f.client.confirmed);assertCancelReceipt(f.client.confirmed);assert.equal(f.client.canStop,false);
 }finally{releaseResolve();if(previous)Object.defineProperty(subtle,'digest',previous);else Reflect.deleteProperty(subtle,'digest');oldResult=await older;}
 assert.ok(oldResult instanceof PortalRequestError);assert.equal(oldResult.code,'STALE_CHECK');assert.ok(f.client.confirmed);assertCancelReceipt(f.client.confirmed);
 assert.equal(f.client.canStop,false);assert.equal(f.client.hasPending,true);assert.deepEqual(f.storage.peek(),f.marker);assert.equal(f.storage.removes,0);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});

for(const [label,status] of [
 ['forbidden',new PortalRequestError('不允许',403,'FORBIDDEN',false)],
 ['unavailable',new PortalRequestError('服务异常',503,'UNAVAILABLE',true)],
 ['malformed',{state:'SUCCEEDED'}]
] as const){
 test('a stop POST followed by '+label+' status never clears or fabricates confirmation',async()=>{
  let posted=false;const marker={owner,key:legacyKey,draft:false},storage=memory(marker);
  const wire=transport(async call=>{
   if(call.method==='GET'&&call.path==='/commands/'+legacyKey)throw noCancel();
   if(call.method==='GET'&&call.path==='/commands/'+legacyKey+'/stop'){if(!posted)throw noStop();if(status instanceof Error)throw status;return status;}
   if(call.method==='POST'&&call.path==='/commands/'+legacyKey+'/stop'){posted=true;assert.equal(call.key,legacyKey);return stopReceipt;}
   throw new Error('unexpected request');
  });
  const p=new PortalCommands(wire.request,()=>{},storage,{stopEnabled:true});p.restore(owner);await p.replay(owner).catch(()=>{});assert.equal(p.canStop,true);
  await assert.rejects(()=>p.stop(owner));assert.equal(p.hasPending,true);assert.equal(p.confirmed,undefined);assert.deepEqual(storage.peek(),marker);assert.equal(storage.removes,0);
  assert.equal(wire.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/stop')).length,1);
 });
}

 test('a later authorization failure must invalidate a previous canStop observation',async()=>{
 let phase='missing';const marker={owner,key:legacyKey,draft:false},storage=memory(marker);
 const wire=transport(async call=>{
  if(call.method==='GET'&&call.path==='/commands/'+legacyKey){if(phase==='denied')throw new PortalRequestError('不允许',403,'FORBIDDEN',false);throw noCancel();}
  if(call.method==='GET'&&call.path.endsWith('/stop'))throw noStop();
  throw new Error('unexpected request');
 });
 const p=new PortalCommands(wire.request,()=>{},storage,{stopEnabled:true});p.restore(owner);await p.replay(owner).catch(()=>{});assert.equal(p.canStop,true);
 phase='denied';await p.replay(owner).catch(()=>{});assert.equal(p.canStop,false);assert.equal(p.hasPending,true);assert.deepEqual(storage.peek(),marker);assert.equal(storage.removes,0);
});

 test('a legacy draft marker uses generic key fencing without inventing a draft receipt',async()=>{
 let stopped=false;const marker={owner,key:legacyKey,draft:true},storage=memory(marker);
 const wire=transport(async call=>{
  if(call.method==='GET'&&call.path==='/commands/'+legacyKey)throw noCancel();
  if(call.method==='GET'&&call.path.endsWith('/stop')){if(!stopped)throw noStop();return {state:'STOPPED'};}
  if(call.method==='POST'&&call.path.endsWith('/stop')){stopped=true;return stopReceipt;}
  throw new Error('unexpected request');
 });
 const p=new PortalCommands(wire.request,()=>{},storage,{stopEnabled:true});p.restore(owner);await p.replay(owner).catch(()=>{});assert.equal(p.canStop,true);await p.stop(owner);
 assert.equal(p.hasPending,true);assert.equal(p.confirmed,undefined);assert.equal(p.draftResourceId,null);assert.deepEqual(storage.peek(),marker);p.rendered();assert.equal(storage.peek(),null);
});

 test('stop cannot be offered while its not-found status read is still in flight',async()=>{
 let enteredResolve!:()=>void,releaseResolve!:()=>void;
 const entered=new Promise<void>(resolve=>enteredResolve=resolve),release=new Promise<void>(resolve=>releaseResolve=resolve);
 const f=await unknownCancel(async call=>{
  if(call.path===cancelPath&&call.method==='POST')throw lost();
  if(call.method==='GET'&&call.path.endsWith('/cancel'))throw noCancel();
  if(call.method==='GET'&&call.path.endsWith('/stop')){enteredResolve();await release;throw noStop();}
  throw new Error('unexpected request');
 });
 const checking=f.client.replay(owner).catch(()=>{});await entered;
 let enabledBeforeReply=false,stopRejected=false,postsWhileWaiting=0;
 try{enabledBeforeReply=f.client.canStop;try{await f.client.stop(owner);}catch{stopRejected=true;}postsWhileWaiting=f.calls.filter(c=>c.method==='POST').length;}
 finally{releaseResolve();await checking;}
 assert.equal(enabledBeforeReply,false);assert.equal(stopRejected,true);assert.equal(postsWhileWaiting,1);
 assert.equal(f.client.canStop,true);assert.equal(f.client.hasPending,true);assert.deepEqual(f.storage.peek(),f.marker);
});

 test('an older missing-stop-status response cannot offer stop after a newer confirmed receipt',async()=>{
 let enteredResolve!:()=>void,releaseResolve!:()=>void,reads=0;
 const entered=new Promise<void>(resolve=>enteredResolve=resolve),release=new Promise<void>(resolve=>releaseResolve=resolve);
 const f=await unknownCancel(async call=>{
  if(call.path===cancelPath&&call.method==='POST')throw lost();
  if(call.method==='GET'&&call.path.endsWith('/cancel')){reads++;if(reads===1)throw noCancel();return boundReceipt(call);}
  // This 404 represents a status response produced before the later receipt
  // committed, but delayed in transit until after the later read completed.
  if(call.method==='GET'&&call.path.endsWith('/stop')){enteredResolve();await release;throw noStop();}
  throw new Error('unexpected request');
 });
 const older=f.client.replay(owner).catch(()=>{});await entered;
 try{assertCancelReceipt(await f.client.replay(owner));assert.ok(f.client.confirmed);assertCancelReceipt(f.client.confirmed);}
 finally{releaseResolve();await older;}
 assert.ok(f.client.confirmed);assertCancelReceipt(f.client.confirmed);assert.equal(f.client.canStop,false);
 await assert.rejects(()=>f.client.stop(owner));assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
 assert.equal(f.client.hasPending,true);assert.deepEqual(f.storage.peek(),f.marker);assert.equal(f.storage.removes,0);
});

 test('an older successful read cannot clear the marker of a newer in-flight request',async()=>{
 let oldEnteredResolve!:()=>void,oldReleaseResolve!:()=>void,newEnteredResolve!:()=>void,newReleaseResolve!:()=>void;
 const oldEntered=new Promise<void>(resolve=>oldEnteredResolve=resolve),oldRelease=new Promise<void>(resolve=>oldReleaseResolve=resolve);
 const newEntered=new Promise<void>(resolve=>newEnteredResolve=resolve),newRelease=new Promise<void>(resolve=>newReleaseResolve=resolve);
 const storage=memory({owner,key:legacyKey,draft:false,cancelBinding:cancelBinding(legacyKey)});
 const oldWire=transport(async call=>{
  if(call.method==='GET'&&call.path==='/commands/'+legacyKey+'/cancel'){oldEnteredResolve();await oldRelease;return boundReceipt(call);}
  throw new Error('unexpected old request');
 });
 const newWire=transport(async call=>{
  if(call.method==='POST'&&call.path===cancelPath){newEnteredResolve();await newRelease;throw lost();}
  throw new Error('unexpected new request');
 });
 const oldClient=new PortalCommands(oldWire.request,()=>{},storage,{stopEnabled:true});oldClient.restore(owner);
 const newClient=new PortalCommands(newWire.request,()=>{},storage,{stopEnabled:true});
 const oldRead=oldClient.replay(owner);await oldEntered;
 const newWrite=newClient.submit(owner,cancelPath,cancelBody).catch(()=>{});await newEntered;
 try{
  const newer=storage.peek();assert.ok(newer);assert.notEqual(newer.key,legacyKey);assert.equal(newClient.pending?.key,newer.key);
  oldReleaseResolve();assertCancelReceipt(await oldRead);
  assert.throws(()=>oldClient.rendered());assert.deepEqual(storage.peek(),newer);
  assert.equal(oldClient.hasPending,true);assert.equal(newClient.hasPending,true);assert.equal(storage.removes,0);
 }finally{oldReleaseResolve();newReleaseResolve();await oldRead.catch(()=>{});await newWrite;}
});

 test('unconfirmed unknown outcomes cannot clear the marker through rendered',async()=>{
 const f=await unknownCancel(async call=>{if(call.method==='POST'&&call.path===cancelPath)throw lost();throw new Error('unexpected request');});
 assert.throws(()=>f.client.rendered());assert.equal(f.client.hasPending,true);assert.deepEqual(f.storage.peek(),f.marker);assert.equal(f.storage.removes,0);
});

 test('a late old stop-status read cannot undo recovery after a lost stop response',async()=>{
 let enteredResolve!:()=>void,releaseResolve!:()=>void,stopReads=0,stopped=false;
 const entered=new Promise<void>(resolve=>enteredResolve=resolve),release=new Promise<void>(resolve=>releaseResolve=resolve);
 const marker={owner,key:legacyKey,draft:false},storage=memory(marker);
 const wire=transport(async call=>{
  if(call.method==='GET'&&call.path==='/commands/'+legacyKey)throw noCancel();
  if(call.method==='GET'&&call.path==='/commands/'+legacyKey+'/stop'){
   stopReads++;if(stopReads===1){enteredResolve();await release;throw noStop();}
   if(stopped)return {state:'STOPPED'};throw noStop();
  }
  if(call.method==='POST'&&call.path==='/commands/'+legacyKey+'/stop'){stopped=true;throw lost();}
  throw new Error('unexpected request');
 });
 const p=new PortalCommands(wire.request,()=>{},storage,{stopEnabled:true});p.restore(owner);
 const older=p.replay(owner).catch(error=>error);await entered;
 try{
  await p.replay(owner).catch(()=>{});assert.equal(p.canStop,true);
  await assert.rejects(()=>p.stop(owner));assert.equal(p.hasPending,true);assert.deepEqual(storage.peek(),marker);
  await assert.rejects(()=>p.replay(owner),error=>error instanceof PortalStopConfirmed);
  assert.equal(p.stopped,true);assert.equal(p.confirmed,undefined);assert.equal(p.canStop,false);
 }finally{releaseResolve();await older;}
 assert.equal(p.stopped,true);assert.equal(p.canStop,false);assert.equal(p.hasPending,true);assert.deepEqual(storage.peek(),marker);assert.equal(storage.removes,0);
 assert.equal(wire.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/stop')).length,1);
 p.rendered();assert.equal(storage.peek(),null);
});
