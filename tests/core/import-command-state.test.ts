import {test,afterEach,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {ImportCommandState} from '../../apps/admin-web/src/import-command-state.ts';
import {ApiError,call,read,resetTransport,unresolvedCommands} from '../../apps/admin-web/src/api.ts';
import type {Receipt,ImportBatch} from '../../apps/admin-web/src/dto.ts';
const original=globalThis.fetch,actor='12345678-1234-4234-8234-123456789abc';
(globalThis as unknown as {window:EventTarget}).window=new EventTarget();
const receipt={operationId:actor,resourceId:actor,revision:2,state:'ACCEPTED'} as Receipt;
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
const definite=(e:unknown)=>e instanceof ApiError&&!e.unknownOutcome;
const submit=(s:ImportCommandState<{expectedRevision:number;selectedRows:number[]}>,batch='batch-a',rows=[0])=>s.submit({expectedRevision:1,selectedRows:rows},batch,(input,id)=>call<'import.commit',Receipt>('import.commit',input,{id:id!}),definite);
beforeEach(async()=>{globalThis.fetch=async()=>response({membershipId:actor,csrfToken:'csrf'});await call('identity.me',undefined);});
afterEach(()=>{globalThis.fetch=original;resetTransport();});
test('definite import rejection releases the old batch selection and next preview sends its current rows',async()=>{
 const s=new ImportCommandState<{expectedRevision:number;selectedRows:number[]}>(),requests:Array<{url:string;body:unknown;key:string}>=[];
 globalThis.fetch=async(url,init)=>{requests.push({url:String(url),body:JSON.parse(init!.body as string),key:(init!.headers as Record<string,string>)['Idempotency-Key']!});return requests.length===1?response({error:{code:'REVISION_CONFLICT',message:'source changed'}},409):response(receipt);};
 await assert.rejects(()=>submit(s));assert.equal(s.locked,false);assert.equal(s.input,null);s.reset();await submit(s,'batch-b',[0,1]);
 assert.deepEqual(requests[1]!.body,{expectedRevision:1,selectedRows:[0,1]});assert.ok(requests[1]!.url.endsWith('/batch-b/commit'));assert.notEqual(requests[0]!.key,requests[1]!.key);
});
test('GET success and GET failure cannot unlock an unknown import or change its batch, selection and key',async()=>{
 const s=new ImportCommandState<{expectedRevision:number;selectedRows:number[]}>(),writes:Array<{url:string;body:string;key:string}>=[];let readFails=false;
 globalThis.fetch=async(url,init)=>{if(init!.method==='GET'){if(readFails)throw new Error('read failed');return response({id:'batch-a',rows:[{index:0,state:'VALID'},{index:1,state:'VALID'}],job:null});}writes.push({url:String(url),body:init!.body as string,key:(init!.headers as Record<string,string>)['Idempotency-Key']!});if(writes.length===1)throw new Error('lost commit');return response(receipt);};
 await assert.rejects(()=>submit(s));await read<ImportBatch>('import.get',{id:'batch-a'});assert.equal(s.unknown,true);assert.equal(s.locked,true);readFails=true;await assert.rejects(()=>read('import.get',{id:'batch-a'}));assert.equal(s.locked,true);
 await submit(s,'batch-b',[0,1]);assert.deepEqual(writes[0],writes[1]);assert.equal(unresolvedCommands().length,0);
});
test('confirmed import with failed result read only rereads; unknown followed by denial remains frozen',async()=>{
 const s=new ImportCommandState<{expectedRevision:number;selectedRows:number[]}>();let writes=0;
 globalThis.fetch=async(_url,init)=>{if(init!.method==='GET')throw new Error('result unavailable');writes++;return response(receipt);};
 await submit(s);await assert.rejects(()=>read('import.get',{id:'batch-a'}));assert.equal(s.locked,true);await submit(s);assert.equal(writes,1);
 s.reset();let attempts=0;globalThis.fetch=async()=>{if(++attempts===1)throw new Error('lost');return response({error:{code:'FORBIDDEN',message:'access changed'}},403);};
 await assert.rejects(()=>submit(s));await assert.rejects(()=>submit(s));assert.equal(s.unknown,true);assert.equal(s.batchId,'batch-a');assert.deepEqual(s.input!.selectedRows,[0]);
});
