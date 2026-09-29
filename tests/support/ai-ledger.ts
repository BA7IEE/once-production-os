import {FaultStore} from './fault-store.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Store} from '../../packages/core/src/store.ts';
import type {Clock} from '../../packages/core/src/model.ts';
import {AiLedger} from '../../packages/core/src/ai-ledger.ts';
import type {AiLedgerConfig} from '../../packages/core/src/ai-ledger-model.ts';
import {digest} from '../../packages/core/src/json.ts';
export async function ledgerFixture(store:Store,clock:Clock){
 const {workspace,member}=await store.transaction(async tx=>({workspace:(await tx.find('workspaces'))[0]!,member:(await tx.find('memberships'))[0]!}));
 const config:AiLedgerConfig={enabled:true,providerIdentityHash:digest('test-only-no-provider'),configRevision:1,recoveryEpoch:workspace.recoveryEpoch,currency:'USD',perTaskLimitUnits:60,dailyLimitUnits:100,maxAttempts:3};
 const ledger=new AiLedger(clock),meta={requestId:randomUUID(),ip:'test'},workspaceId=workspace.id;
 const reserve=(key=randomUUID(),amount=60,c=config)=>store.transaction(tx=>ledger.reserve(tx,workspaceId,member.id,key,digest('synthetic text not stored'),amount,c,meta));
 const begin=(id:string,c=config)=>store.transaction(tx=>ledger.begin(tx,workspaceId,id,c,meta));
 const cancel=(id:string)=>store.transaction(tx=>ledger.cancel(tx,workspaceId,id,meta));
 const unknown=(id:string)=>store.transaction(tx=>ledger.unknown(tx,workspaceId,id,meta));
 const settle=(id:string,outcome:'SUCCEEDED'|'NOT_EXECUTED',amount:number)=>store.transaction(tx=>ledger.settle(tx,workspaceId,id,outcome,amount,digest('test settlement evidence'),meta));
 const rows=()=>store.transaction(async tx=>({runs:await tx.find('aiRuns',{workspaceId}),attempts:await tx.find('aiAttempts',{workspaceId}),budgets:await tx.find('aiBudgets',{workspaceId})}));
 return {config,ledger,meta,workspaceId,member,reserve,begin,cancel,unknown,settle,rows};
}
/** Shared behavioral proof; exercised against MemoryStore and the real PrismaStore. */
export async function verifyAiLedger(store:Store,clock:Clock){
 const f=await ledgerFixture(store,clock),key=randomUUID();
 const faulty=new FaultStore(store),fault=await ledgerFixture(faulty,clock);let fired=false;
 faulty.afterInsert=(table)=>{if(table==='audits'){fired=true;throw new Error('synthetic AI ledger audit failure');}};
 await assert.rejects(fault.reserve());assert.equal(fired,true);assert.equal((await f.rows()).runs.length,0);assert.equal((await f.rows()).budgets.length,0);
 faulty.afterInsert=null;
 const results=await Promise.allSettled([f.reserve(key),f.reserve()]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 const run=(await f.rows()).runs[0]!;assert.equal((await f.reserve(run.requestKey)).id,run.id);
 const attempt=await f.begin(run.id);assert.equal((await f.rows()).attempts[0]!.state,'MAY_HAVE_EXECUTED');
 await assert.rejects(f.begin(run.id));await f.unknown(attempt.id);await f.cancel(run.id);
 assert.equal((await f.rows()).budgets[0]!.reservedUnits,60);await assert.rejects(f.reserve());await assert.rejects(f.begin(run.id));
 await f.settle(attempt.id,'SUCCEEDED',25);await f.settle(attempt.id,'SUCCEEDED',25);
 assert.equal((await f.rows()).budgets[0]!.reservedUnits,0);assert.equal((await f.rows()).budgets[0]!.settledUnits,25);assert.equal((await f.rows()).runs[0]!.state,'CANCELLED');
 await assert.rejects(f.settle(attempt.id,'SUCCEEDED',26));
 const next=await f.reserve(),first=await f.begin(next.id);await f.unknown(first.id);await f.settle(first.id,'NOT_EXECUTED',0);
 const second=await f.begin(next.id);assert.notEqual(first.providerIdempotencyKey,second.providerIdempotencyKey);assert.equal(second.attemptNo,2);
 await f.settle(second.id,'SUCCEEDED',80);assert.equal((await f.rows()).budgets[0]!.frozen,true);await assert.rejects(f.reserve());
 return {run,attempt,next,second};
}
