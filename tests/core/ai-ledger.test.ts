import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from '../support/fixtures.ts';
import {ledgerFixture,verifyAiLedger} from '../support/ai-ledger.ts';
import {digest} from '../../packages/core/src/json.ts';

test('AI reservations serialize and uncertain/cancelled attempts retain funds until reconciliation',async()=>{const f=await fixture();await verifyAiLedger(f.store,f.clock);});
test('AI accounting and dispatch authorization roll back when audit fails',async()=>{
 const f=await fixture(),l=await ledgerFixture(f.store,f.clock);f.store.failNextAudit=true;await assert.rejects(l.reserve());assert.equal((await l.rows()).runs.length,0);assert.equal((await l.rows()).budgets.length,0);
 const run=await l.reserve();f.store.failNextAudit=true;await assert.rejects(l.begin(run.id));assert.equal((await l.rows()).attempts.length,0);assert.equal((await l.rows()).runs[0]!.state,'QUEUED');
 const attempt=await l.begin(run.id);f.store.failNextAudit=true;await assert.rejects(l.settle(attempt.id,'SUCCEEDED',20));assert.equal((await l.rows()).budgets[0]!.reservedUnits,60);assert.equal((await l.rows()).attempts[0]!.settlementDigest,null);await l.settle(attempt.id,'SUCCEEDED',20);
});
test('AI sends fail closed on changed provider, recovery epoch, disabled actor or midnight reservation',async()=>{
 const f=await fixture(),l=await ledgerFixture(f.store,f.clock),run=await l.reserve();
 for(const c of [{...l.config,enabled:false},{...l.config,providerIdentityHash:digest('other')},{...l.config,configRevision:2},{...l.config,recoveryEpoch:'new'},{...l.config,currency:'CNY'}])await assert.rejects(l.begin(run.id,c));
 await f.store.transaction(tx=>tx.replace('memberships',{...l.member,status:'DISABLED'}));await assert.rejects(l.begin(run.id));await f.store.transaction(tx=>tx.replace('memberships',l.member));
 f.clock.advance(86400000);await assert.rejects(l.begin(run.id));await l.cancel(run.id);assert.equal((await l.rows()).budgets[0]!.reservedUnits,0);await l.reserve();
});
test('AI known not executed has a bounded attempt count; cancellation releases only unsent funds',async()=>{
 const f=await fixture(),l=await ledgerFixture(f.store,f.clock),run=await l.reserve();
 for(let i=0;i<3;i++){const a=await l.begin(run.id);await l.settle(a.id,'NOT_EXECUTED',0);}
 await assert.rejects(l.begin(run.id));await l.cancel(run.id);assert.equal((await l.rows()).budgets[0]!.reservedUnits,0);
 const next=await l.reserve(),a=await l.begin(next.id);await l.cancel(next.id);await l.settle(a.id,'NOT_EXECUTED',0);assert.equal((await l.rows()).runs.find(r=>r.id===next.id)!.state,'CANCELLED');
});
test('AI request identity rejects reuse with different payload and invalid money/configuration',async()=>{
 const f=await fixture(),l=await ledgerFixture(f.store,f.clock),key=randomUUID();await l.reserve(key);await assert.rejects(l.reserve(key,30));
 await assert.rejects(f.store.transaction(tx=>l.ledger.reserve(tx,l.workspaceId,l.member.id,key,digest('other'),60,l.config,l.meta)));
 for(const amount of [0,-1,NaN,Infinity,1.5,61])await assert.rejects(l.reserve(randomUUID(),amount));
 for(const config of [{...l.config,maxAttempts:4},{...l.config,dailyLimitUnits:0},{...l.config,configRevision:0}])await assert.rejects(l.reserve(randomUUID(),1,config));
 assert.equal((await l.rows()).runs.length,1);
});
test('AI uncertain funds survive date rollover and an overrun freezes subsequent days too',async()=>{
 const f=await fixture(),l=await ledgerFixture(f.store,f.clock),run=await l.reserve(),a=await l.begin(run.id);await l.unknown(a.id);f.clock.advance(86400000);await l.settle(a.id,'SUCCEEDED',61);await assert.rejects(l.reserve());assert.equal((await l.rows()).budgets[0]!.settledUnits,61);
});
test('AI in-flight settlement remains possible after actor disable and restoration, but never sends again',async()=>{
 const f=await fixture(),l=await ledgerFixture(f.store,f.clock),run=await l.reserve(),a=await l.begin(run.id);
 await f.store.transaction(async tx=>{const workspace=await tx.get('workspaces',l.workspaceId);await tx.replace('workspaces',{...workspace!,recoveryEpoch:'restored'});await tx.replace('memberships',{...l.member,status:'DISABLED'});});
 await l.unknown(a.id);await assert.rejects(l.begin(run.id));await l.settle(a.id,'SUCCEEDED',15);assert.equal((await l.rows()).budgets[0]!.settledUnits,15);
});

test('AI dispatcher commits its unique attempt before network and never repeats an uncertain request',async()=>{
 const {dispatchAi}=await import('../../packages/core/src/ai-dispatch.ts');const f=await fixture(),l=await ledgerFixture(f.store,f.clock),run=await l.reserve();let calls=0;
 const adapter={send:async()=>{calls++;assert.equal((await l.rows()).attempts[0]!.state,'MAY_HAVE_EXECUTED');throw new Error('private provider error must not be retained');}};
 const policy={authorize:async()=> 'synthetic text not stored',proposal:async()=>{throw new Error('not reached');}};
 assert.equal((await dispatchAi(f.store,f.clock,l.config,l.workspaceId,run.id,l.meta,adapter,policy,1000)).state,'UNKNOWN');
 await assert.rejects(dispatchAi(f.store,f.clock,l.config,l.workspaceId,run.id,l.meta,adapter,policy,1000));assert.equal(calls,1);assert.equal(JSON.stringify(await l.rows()).includes('private provider'),false);
});
test('AI dispatcher times out with reserved cost; late provider completion cannot create a proposal',async()=>{
 const {dispatchAi}=await import('../../packages/core/src/ai-dispatch.ts');const f=await fixture(),l=await ledgerFixture(f.store,f.clock),run=await l.reserve();let finish!:(value:any)=>void,signal:AbortSignal|undefined,proposals=0;
 const adapter={send:async(_input:unknown,context:{signal:AbortSignal})=>{signal=context.signal;return new Promise<any>(resolve=>{finish=resolve;});}};
 const policy={authorize:async()=> 'synthetic text not stored',proposal:async()=>{proposals++;}};
 const response=await dispatchAi(f.store,f.clock,l.config,l.workspaceId,run.id,l.meta,adapter,policy,10);assert.equal(response.state,'UNKNOWN');assert.equal(signal?.aborted,true);
 finish({amountUnits:20,evidenceDigest:digest('proof'),output:{}});await Promise.resolve();assert.equal(proposals,0);assert.equal((await l.rows()).budgets[0]!.reservedUnits,60);
});
test('AI dispatcher checks input again before send and cancellation during HTTP suppresses proposals',async()=>{
 const {dispatchAi}=await import('../../packages/core/src/ai-dispatch.ts');const f=await fixture(),l=await ledgerFixture(f.store,f.clock),run=await l.reserve();let calls=0,proposals=0;
 const adapter={send:async()=>{calls++;await l.cancel(run.id);return {amountUnits:12,evidenceDigest:digest('proof'),output:{}};}};
 const bad={authorize:async()=> 'changed',proposal:async()=>{proposals++;}};await assert.rejects(dispatchAi(f.store,f.clock,l.config,l.workspaceId,run.id,l.meta,adapter,bad,1000));assert.equal(calls,0);assert.equal((await l.rows()).attempts.length,0);
 const policy={...bad,authorize:async()=> 'synthetic text not stored'};assert.equal((await dispatchAi(f.store,f.clock,l.config,l.workspaceId,run.id,l.meta,adapter,policy,1000)).state,'SETTLED');assert.equal(proposals,0);assert.equal((await l.rows()).budgets[0]!.settledUnits,12);
});
test('AI proposal and settlement share a transaction; failed proposal does not create settled success',async()=>{
 const {dispatchAi}=await import('../../packages/core/src/ai-dispatch.ts');const f=await fixture(),l=await ledgerFixture(f.store,f.clock),run=await l.reserve();
 const adapter={send:async()=>({amountUnits:12,evidenceDigest:digest('proof'),output:{}})};
 const policy={authorize:async()=> 'synthetic text not stored',proposal:async(tx:any)=>{await tx.replace('memberships',{...l.member,status:'DISABLED'});throw new Error('invalid output');}};
 assert.equal((await dispatchAi(f.store,f.clock,l.config,l.workspaceId,run.id,l.meta,adapter,policy,1000)).state,'UNKNOWN');assert.equal(f.store.rows('memberships')[0]!.status,'ACTIVE');assert.equal((await l.rows()).budgets[0]!.settledUnits,0);
});

test('AI recovery inspection includes unresolved attempts and detects accounting or request-identity damage',async()=>{
 const {inspectAiLedger}=await import('../../packages/core/src/ai-ledger-integrity.ts');const f=await fixture(),l=await ledgerFixture(f.store,f.clock),run=await l.reserve(),a=await l.begin(run.id);
 const inspect=()=>f.store.transaction(tx=>inspectAiLedger(tx,l.workspaceId));const before=await inspect();assert.equal(before.unresolvedCount,1);assert.equal(before.relationFailures,0);
 await l.unknown(a.id);assert.notEqual((await inspect()).graphDigest,before.graphDigest);
 await f.store.transaction(async tx=>{const budget=(await tx.find('aiBudgets'))[0]!;await tx.replace('aiBudgets',{...budget,reservedUnits:0});await tx.replace('aiAttempts',{...a,requestDigest:digest('tampered')});});
 assert.ok((await inspect()).relationFailures>=2);assert.deepEqual((await inspect()).blockers,['AI_LEDGER_INVALID']);
});
