import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,member,result} from '../support/fixtures.ts';
import {aiBusinessFixture} from '../support/ai-business.ts';
import {AiWorker} from '../../apps/api/src/ai/worker.ts';
import {AiLedger} from '../../packages/core/src/ai-ledger.ts';
import {digest} from '../../packages/core/src/json.ts';
const meta={requestId:'test-ai-operations',ip:'test'};
async function uncertain(f:Awaited<ReturnType<typeof fixture>>,t:Awaited<ReturnType<typeof aiBusinessFixture>>){const id=await t.create();await f.app.ai.dispatch(f.store,id,t.workspaceId,{send:async()=>{throw new Error('private provider body');}},meta);const a=await f.store.transaction(async tx=>{const task=await tx.get('aiTasks',id);return(await tx.find('aiAttempts',{runId:task!.runId}))[0]!;});return a;}
function proof(t:Awaited<ReturnType<typeof aiBusinessFixture>>,a:{revision:number;providerIdempotencyKey:string}){return {expectedRevision:a.revision,outcome:'SUCCEEDED',amountUnits:70,evidenceSourceId:t.source,evidenceSourceRevision:1,providerIdempotencyKey:a.providerIdempotencyKey,providerIdentityHash:digest('synthetic approved adapter only'),confirmProviderResult:true};}
test('AI approval binds the exact candidate and active human approver; disable is atomic and replayable',async()=>{
 const f=await fixture(),t=await aiBusinessFixture(f),status=result(await f.owner.raw('GET','/ai-operations')),key=randomUUID(),d={configDigest:status.candidate.digest,expectedRevision:status.approval.revision,enabled:false,confirmConfiguration:true};
 f.store.failNextAudit=true;assert.equal((await f.owner.cmd('POST','/ai-operations/approval',d,key)).status,500);assert.equal(result(await f.owner.raw('GET','/ai-settings')).enabled,true);
 assert.equal((await f.owner.cmd('POST','/ai-operations/approval',d,key)).status,200);assert.equal((await f.owner.cmd('POST','/ai-operations/approval',d,key)).status,200);assert.equal((await f.owner.cmd('POST','/ai-jobs',t.input)).status,409);
 f.app.config.ai={...f.app.config.ai!,dailyLimitUnits:1100};const changed=result(await f.owner.raw('GET','/ai-operations'));assert.equal((await f.owner.cmd('POST','/ai-operations/approval',{...d,configDigest:changed.candidate.digest,expectedRevision:0,enabled:true})).status,409);
 const editor=await member(f,'ai-operator-editor');assert.equal((await editor.client.raw('GET','/ai-operations')).status,403);
});
test('AI worker serializes send authority across concurrent workers and ignores cancelled sources',async()=>{
 const f=await fixture(),t=await aiBusinessFixture(f);await t.create();let calls=0;
 const adapter={providerIdentityHash:f.app.config.ai!.providerIdentityHash,send:async()=>{calls++;await Promise.resolve();return{amountUnits:10,evidenceDigest:digest('usage'),output:{changes:[],unknowns:[]}};}};
 await Promise.all([new AiWorker(f.app,adapter).cycle(new AbortController().signal),new AiWorker(f.app,adapter).cycle(new AbortController().signal)]);assert.equal(calls,1);
 await t.create();await f.owner.cmd('POST','/sources/'+t.source+'/suspend',{expectedRevision:1,reason:'Synthetic permission revoked before sending'});await new AiWorker(f.app,adapter).cycle(new AbortController().signal);assert.equal(calls,1);assert.ok((await f.store.transaction(tx=>tx.find('aiRuns'))).some(r=>r.state==='CANCELLED'));
});
test('AI worker restart isolates abandoned attempts even without an adapter and preserves reserved cost',async()=>{
 const f=await fixture(),t=await aiBusinessFixture(f),id=await t.create(),ledger=new AiLedger(f.clock);const task=await f.store.transaction(tx=>tx.get('aiTasks',id));await f.store.transaction(tx=>ledger.begin(tx,t.workspaceId,task!.runId,f.app.config.ai!,meta));const worker=new AiWorker(f.app,null);
 assert.equal(await worker.cycle(new AbortController().signal),false);f.clock.advance(130001);assert.equal(await worker.cycle(new AbortController().signal),true);const r=await f.store.transaction(tx=>tx.get('aiRuns',task!.runId));assert.equal(r!.state,'UNKNOWN');assert.equal(r!.settledUnits,null);assert.equal((await f.store.transaction(tx=>tx.find('aiBudgets')))[0]!.reservedUnits,50);
});
test('AI shutdown during provider work aborts and never creates a proposal or resend',async()=>{
 const f=await fixture(),t=await aiBusinessFixture(f);await t.create();const stop=new AbortController();let calls=0,aborted=false;
 const worker=new AiWorker(f.app,{providerIdentityHash:f.app.config.ai!.providerIdentityHash,send:async(_input,{signal})=>{calls++;signal.addEventListener('abort',()=>{aborted=true;});stop.abort();return new Promise(()=>{});}});
 await worker.cycle(stop.signal);assert.equal(calls,1);assert.equal(aborted,true);assert.equal((await f.store.transaction(tx=>tx.find('aiRuns')))[0]!.state,'UNKNOWN');assert.equal((await f.store.transaction(tx=>tx.find('aiTasks')))[0]!.proposalState,'NONE');
});
test('AI reconciliation verifies original request evidence, rolls back with audit and never resends',async()=>{
 const f=await fixture(),t=await aiBusinessFixture(f),a=await uncertain(f,t),d=proof(t,a),key=randomUUID();assert.equal((await f.owner.cmd('POST','/ai-attempts/'+a.id+'/reconcile',{...d,providerIdempotencyKey:randomUUID()})).status,422);
 f.store.failNextAudit=true;assert.equal((await f.owner.cmd('POST','/ai-attempts/'+a.id+'/reconcile',d,key)).status,500);assert.equal((await f.store.transaction(tx=>tx.get('aiAttempts',a.id)))!.state,'UNKNOWN');
 assert.equal((await f.owner.cmd('POST','/ai-attempts/'+a.id+'/reconcile',d,key)).status,200);assert.equal((await f.owner.cmd('POST','/ai-attempts/'+a.id+'/reconcile',d,key)).status,200);const b=(await f.store.transaction(tx=>tx.find('aiBudgets')))[0]!;assert.equal(b.settledUnits,70);assert.equal(b.frozen,true);assert.equal((await f.store.transaction(tx=>tx.get('aiRuns',a.runId)))!.state,'CANCELLED');
 const unfreeze={expectedRevision:b.revision,confirmOverrun:true};f.store.failNextAudit=true;assert.equal((await f.owner.cmd('POST','/ai-budgets/'+b.id+'/unfreeze',unfreeze)).status,500);assert.equal((await f.store.transaction(tx=>tx.find('aiBudgetReleases'))).length,0);assert.equal((await f.owner.cmd('POST','/ai-budgets/'+b.id+'/unfreeze',unfreeze)).status,200);assert.equal((await f.store.transaction(tx=>tx.get('aiBudgets',b.id)))!.settledUnits,70);assert.equal((await f.store.transaction(tx=>tx.find('aiBudgetReleases'))).length,1);
});
test('AI confirmed nonexecution releases funds but requires a new human task; unresolved cost blocks unfreeze',async()=>{
 const f=await fixture(),t=await aiBusinessFixture(f),a=await uncertain(f,t);const d={...proof(t,a),outcome:'NOT_EXECUTED',amountUnits:0};assert.equal((await f.owner.cmd('POST','/ai-attempts/'+a.id+'/reconcile',d)).status,200);assert.equal((await f.store.transaction(tx=>tx.get('aiRuns',a.runId)))!.state,'CANCELLED');assert.equal((await f.store.transaction(tx=>tx.find('aiBudgets')))[0]!.reservedUnits,0);
 const b=await uncertain(f,t),c=await uncertain(f,t);assert.equal((await f.owner.cmd('POST','/ai-attempts/'+b.id+'/reconcile',proof(t,b))).status,200);const budget=(await f.store.transaction(tx=>tx.find('aiBudgets')))[0]!;assert.equal((await f.owner.cmd('POST','/ai-budgets/'+budget.id+'/unfreeze',{expectedRevision:budget.revision,confirmOverrun:true})).status,409);assert.equal((await f.store.transaction(tx=>tx.get('aiAttempts',c.id)))!.state,'UNKNOWN');
});
test('AI approval is invalidated by approver qualification and recovery isolation',async()=>{
 const f=await fixture(),t=await aiBusinessFixture(f);await f.store.transaction(tx=>tx.replace('memberships',{...t.member,role:'EDITOR'}));assert.equal(result(await f.owner.raw('GET','/ai-settings')).enabled,false);
 await f.store.transaction(tx=>tx.replace('memberships',{...t.member,extraPermissions:[...t.member.extraPermissions,'ai.use']}));assert.equal(result(await f.owner.raw('GET','/ai-settings')).enabled,true);
 const {isolateAi}=await import('../../packages/core/src/ai-maintenance.ts');await f.store.transaction(tx=>isolateAi(tx,t.workspaceId,f.clock,meta));assert.equal(result(await f.owner.raw('GET','/ai-settings')).enabled,false);assert.ok((await f.store.transaction(tx=>tx.find('aiApprovals'))).every(a=>!a.enabled));
});
test('AI global egress and maintenance switches block queued sends without blocking reconciliation',async()=>{
 const f=await fixture(),t=await aiBusinessFixture(f),a=await uncertain(f,t);await t.create();let calls=0;
 f.app.config.dataEgressMode='DISABLED';assert.equal(result(await f.owner.raw('GET','/ai-settings')).enabled,false);assert.equal((await f.owner.cmd('POST','/ai-jobs',t.input)).status,409);
 await new AiWorker(f.app,{providerIdentityHash:f.app.config.ai!.providerIdentityHash,send:async()=>{calls++;throw new Error('must not send');}}).cycle(new AbortController().signal);assert.equal(calls,0);
 assert.equal((await f.owner.cmd('POST','/ai-attempts/'+a.id+'/reconcile',{...proof(t,a),outcome:'NOT_EXECUTED',amountUnits:0})).status,200);
 f.app.config.dataEgressMode='INTERNAL_APPROVED';f.app.config.accessMode='MAINTENANCE';const {approvedAi}=await import('../../packages/core/src/ai-operations.ts');await assert.rejects(f.store.transaction(tx=>approvedAi(tx,t.workspaceId,f.app.config)),{code:'AI_EGRESS_DISABLED'});
});
test('AI approval rejects invalid limits and still permits stopping while global egress is off',async()=>{
 const f=await fixture();await aiBusinessFixture(f);const previous={...f.app.config.ai!};f.app.config.ai={...previous,configRevision:2,perTaskLimitUnits:0};
 const c=await f.owner.cmd('POST','/ai-operations/approval',{configDigest:digest(f.app.config.ai),expectedRevision:0,enabled:true,confirmConfiguration:true});assert.equal(c.status,409);assert.equal((await f.store.transaction(tx=>tx.find('aiApprovals'))).length,1);
 f.app.config.ai=previous;f.app.config.dataEgressMode='DISABLED';const row=result(await f.owner.raw('GET','/ai-operations'));assert.equal(row.enabled,false);assert.equal((await f.owner.cmd('POST','/ai-operations/approval',{configDigest:row.candidate.digest,expectedRevision:row.approval.revision,enabled:false,confirmConfiguration:true})).status,200);
});
