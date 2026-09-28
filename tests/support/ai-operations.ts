import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Application} from '../../packages/core/src/api.ts';
import type {Store} from '../../packages/core/src/store.ts';
import type {Client} from './fixtures.ts';
import {result} from './fixtures.ts';
import {aiBusinessFixture} from './ai-business.ts';
import {AiWorker} from '../../apps/api/src/ai/worker.ts';
export async function verifyAiOperations(f:{app:Application;store:Store;owner:Client}){
 const t=await aiBusinessFixture(f),id=await t.create(),worker=new AiWorker(f.app,{providerIdentityHash:f.app.config.ai!.providerIdentityHash,send:async()=>{throw new Error('Synthetic unknown response');}});
 assert.equal(await worker.cycle(new AbortController().signal),true);
 const task=await f.store.transaction(tx=>tx.get('aiTasks',id)),a=await f.store.transaction(async tx=>(await tx.find('aiAttempts',{runId:task!.runId}))[0]!);
 assert.equal(a.state,'UNKNOWN');const d={expectedRevision:a.revision,outcome:'SUCCEEDED',amountUnits:70,evidenceSourceId:t.source,evidenceSourceRevision:1,providerIdempotencyKey:a.providerIdempotencyKey,providerIdentityHash:f.app.config.ai!.providerIdentityHash,confirmProviderResult:true},key=randomUUID();
 let response=await f.owner.cmd('POST','/ai-attempts/'+a.id+'/reconcile',d,key);assert.equal(response.status,200,JSON.stringify(response.body));assert.equal((await f.owner.cmd('POST','/ai-attempts/'+a.id+'/reconcile',d,key)).status,200);
 const budget=await f.store.transaction(async tx=>{const run=await tx.get('aiRuns',task!.runId);return(await tx.get('aiBudgets',run!.budgetId))!;});assert.equal(budget.frozen,true);
 response=await f.owner.cmd('POST','/ai-budgets/'+budget.id+'/unfreeze',{expectedRevision:budget.revision,confirmOverrun:true});assert.equal(response.status,200,JSON.stringify(response.body));assert.equal((await f.store.transaction(tx=>tx.get('aiBudgets',budget.id)))!.frozen,false);
 const status=result(await f.owner.raw('GET','/ai-operations'));assert.equal(status.unresolved.length,0);assert.equal(status.enabled,true);
 return {budgetId:budget.id,approvalId:status.approval.id};
}
