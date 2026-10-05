import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PortalCommands,PortalRequestError} from '../../apps/admin-web/src/portal-command.ts';
import {encodePortalMarker} from '../../apps/admin-web/src/portal-pending-marker.ts';
const receipt={operationId:'11111111-1111-4111-8111-111111111111',resourceId:'22222222-2222-4222-8222-222222222222',revision:2,state:'SUCCEEDED'};
test('portal deterministic rejection allows correction and a new request key',async()=>{
 const keys:string[]=[];const p=new PortalCommands(async(_path,_method,body,key)=>{keys.push(key);if(!(body as {items:unknown[]}).items.length)throw new PortalRequestError('没有可提交内容',422,'EMPTY_SUBMISSION',false);return receipt;},()=>{});
 await assert.rejects(()=>p.submit('talent','/submissions/id/submit',{items:[]}));assert.equal(p.pending,null);
 await p.submit('talent','/submissions/id/submit',{items:['corrected']});assert.notEqual(keys[0],keys[1]);p.rendered();assert.equal(p.pending,null);
});
test('portal unknown followed by denial retains exact body, key and original identity',async()=>{
 const requests:Array<{body:unknown;key:string}>=[];let n=0;
 const p=new PortalCommands(async(_path,_method,body,key)=>{requests.push({body,key});if(++n===1)throw new Error('lost response');if(n===2)throw new PortalRequestError('已失去权限',403,'FORBIDDEN',false);return receipt;},()=>{});
 await assert.rejects(()=>p.submit('talent','/submissions/id',{intro:'original'}));
 await assert.rejects(()=>p.submit('talent','/submissions/id',{intro:'changed'}));await assert.rejects(()=>p.replay('another'));
 await assert.rejects(()=>p.replay('talent'));assert.equal(p.pending?.uncertain,true);await p.replay('talent');assert.equal(requests.length,3);assert.deepEqual(requests[0],requests[1]);assert.deepEqual(requests[0],requests[2]);
});
test('portal success remains known when refresh fails and never repeats the write',async()=>{
 let writes=0;const p=new PortalCommands(async()=>{writes++;return receipt;},()=>{});
 await p.submit('talent','/submissions',{});assert.equal(p.pending?.receipt?.resourceId,receipt.resourceId);
 await p.replay('talent');assert.equal(writes,1);p.rendered();assert.equal(p.pending,null);
});
test('portal malformed receipts retain original request',async()=>{
 const p=new PortalCommands(async()=>({resourceId:receipt.resourceId,revision:1,state:'SUCCEEDED'}),()=>{});
 await assert.rejects(()=>p.submit('talent','/submissions',{}));assert.equal(p.pending?.uncertain,true);
});
test('reload stores only minimal marker and queries receipt without replaying a request body',async()=>{
 let saved:string|null=null;const owner=receipt.resourceId,storage={read:()=>saved?JSON.parse(saved):null,write:(m:any)=>{saved=encodePortalMarker(m);},remove:()=>{saved=null;}};
 const first=new PortalCommands(async()=>{throw new Error('lost response');},()=>{},storage);
 await assert.rejects(()=>first.submit(owner,'/submissions',{intro:'PRIVATE ORIGINAL TEXT',token:'PRIVATE TOKEN'}));
 assert.deepEqual(Object.keys(JSON.parse(saved!)).sort(),['draft','key','owner']);assert.ok(!saved!.includes('PRIVATE'));
 const reads:any[]=[];const next=new PortalCommands(async(...args)=>{reads.push(args);return receipt;},()=>{},storage);next.restore(owner);await assert.rejects(()=>next.submit(owner,'/submissions',{}));await next.replay(owner);assert.equal(reads[0][1],'GET');assert.equal(reads[0][2],undefined);assert.equal(next.draftResourceId,receipt.resourceId);next.rendered();assert.equal(saved,null);
 assert.equal(encodePortalMarker({owner,key:receipt.operationId,draft:false,receipt} as any).includes('revision'),false);
});
test('a missing receipt after reload stays unknown and never unlocks a second write',async()=>{
 const marker={owner:receipt.resourceId,key:receipt.operationId,draft:false};const p=new PortalCommands(async()=>{throw new PortalRequestError('未查到',404,'NOT_FOUND',false);},()=>{},{read:()=>marker,write:()=>{},remove:()=>assert.fail('unknown marker cannot be cleared')});
 p.restore(marker.owner);await assert.rejects(()=>p.replay(marker.owner));assert.equal(p.hasPending,true);await assert.rejects(()=>p.replay('another'));await assert.rejects(()=>p.submit(marker.owner,'/claims',{}));
});
test('an unreadable reload marker blocks writes in the transport itself',async()=>{
 const p=new PortalCommands(async()=>assert.fail('unknown marker must not permit a request'),()=>{},{read:()=>{throw new Error('invalid marker');},write:()=>assert.fail(),remove:()=>assert.fail()});
 assert.throws(()=>p.restore(receipt.resourceId),/invalid marker/);assert.equal(p.hasPending,true);
 await assert.rejects(()=>p.submit(receipt.resourceId,'/claims',{}));await assert.rejects(()=>p.replay(receipt.resourceId),/invalid marker/);
});
