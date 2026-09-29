import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Application} from '../../packages/core/src/api.ts';
import type {Store} from '../../packages/core/src/store.ts';
import {connectionKey} from '../../packages/core/src/ai-connection.ts';
import {AiWorker} from '../../apps/api/src/ai/worker.ts';
import {installedModelClient} from '../../apps/api/src/ai/installed-client.ts';
import {aiBusinessFixture} from './ai-business.ts';
import {result,type Client} from './fixtures.ts';
export const connectionInput={expectedRevision:0,connection:{name:'Synthetic connection',baseURL:'https://models.example.test/v1',protocol:'openai-chat',model:'synthetic-model',timeoutMs:60000,maxOutputTokens:2048},apiKey:'synthetic-test-key',currency:'USD',perTaskLimitUnits:50,dailyLimitUnits:1000};
export async function verifyAiConnections(f:{app:Application;store:Store;owner:Client}){
 const initial=await f.store.transaction(async tx=>({tasks:(await tx.find('aiTasks')).length,responses:(await tx.find('aiResponseMetadata')).length,budgets:await tx.find('aiBudgets')}));
 const priorReserved=initial.budgets.reduce((n,b)=>n+b.reservedUnits,0),priorSettled=initial.budgets.reduce((n,b)=>n+b.settledUnits,0);
 const key=randomUUID(),saved=await f.owner.cmd('POST','/ai-connection',connectionInput,key);assert.ok([200,201].includes(saved.status),JSON.stringify(saved.body));
 const repeated=await f.owner.cmd('POST','/ai-connection',connectionInput,key);assert.ok(result(repeated).replayed);
 let read=result(await f.owner.raw('GET','/ai-connection'));assert.equal(read.connection.model,'synthetic-model');assert.equal(read.hasKey,true);assert.ok(!JSON.stringify(read).includes(connectionInput.apiKey));
 const stored=(await f.store.transaction(tx=>tx.find('aiConnections')))[0]!;assert.notEqual(stored.keyCipher,connectionInput.apiKey);assert.equal(connectionKey(stored,f.app.config),connectionInput.apiKey);
 let calls=0;let output:unknown={changes:[],unknowns:[]};const prompts:string[]=[];
 const fetchImpl:typeof fetch=async(_url,init)=>{calls++;prompts.push(String(init?.body));return Response.json({id:'synthetic-id',choices:[{index:0,message:{role:'assistant',content:JSON.stringify(output)},finish_reason:'stop'}],usage:{prompt_tokens:12,completion_tokens:8,total_tokens:20}});};
 const worker=new AiWorker(f.app,id=>installedModelClient(f.app,id,fetchImpl));
 // Testing needs an explicit administrator action, but does not require enabling
 // business external processing or giving the administrator blanket ai.use.
 const tested=await f.owner.cmd('POST','/ai-connection/test',{expectedRevision:stored.revision,confirmTest:true});assert.ok([200,201].includes(tested.status),JSON.stringify(tested.body));
 assert.equal(await worker.cycle(new AbortController().signal),true);assert.equal(calls,1);
 assert.equal(await worker.cycle(new AbortController().signal),false);assert.equal(calls,1);
 read=result(await f.owner.raw('GET','/ai-connection'));assert.equal(read.test.outputStatus,'VALID_JSON');assert.equal(read.test.state,'UNKNOWN');
 assert.equal((await f.store.transaction(tx=>tx.find('aiTasks'))).length,initial.tasks);assert.ok(!prompts[0]!.includes('Synthetic artist'));
 const t=await aiBusinessFixture(f),id=await t.create();output={changes:[{field:'intro',value:'Grounded draft',evidence:t.evidence}],unknowns:[]};
 assert.equal(await worker.cycle(new AbortController().signal),true);
 const task=result(await f.owner.raw('GET','/ai-jobs/'+id));assert.equal(task.proposalState,'PENDING');assert.equal(task.state,'UNKNOWN');assert.equal(task.settledUnits,null);assert.equal(task.responseMetadata.inputTokens,12);
 assert.equal((await f.owner.cmd('POST','/proposals/'+id+'/apply',{expectedRevision:task.revision,selectedFields:['intro']})).status,200);
 assert.equal((await f.store.transaction(tx=>tx.get('people',t.person)))!.intro,'Grounded draft');
 const budget=(await f.store.transaction(tx=>tx.find('aiBudgets')))[0]!;assert.equal(budget.settledUnits,priorSettled);assert.equal(budget.reservedUnits,priorReserved+100);
 await t.create({...t.input,expectedRevision:2});const before=calls;
 const change=await f.owner.cmd('POST','/ai-connection',{...connectionInput,expectedRevision:stored.revision,apiKey:'',connection:{...connectionInput.connection,model:'changed-model'}});assert.ok([200,201].includes(change.status),JSON.stringify(change.body));
 assert.equal(result(await f.owner.raw('GET','/ai-settings')).enabled,false);assert.equal(connectionKey((await f.store.transaction(tx=>tx.find('aiConnections')))[0]!,f.app.config),connectionInput.apiKey);
 await worker.cycle(new AbortController().signal);assert.equal(calls,before);
 const responses=await f.store.transaction(tx=>tx.find('aiResponseMetadata'));assert.equal(responses.length,initial.responses+2);assert.ok(!JSON.stringify(responses).includes('Synthetic artist'));
 await assert.rejects(f.store.transaction(tx=>tx.remove('aiResponseMetadata',responses[0]!.id)));
 return {connectionId:stored.id,responseId:responses[0]!.id};
}
