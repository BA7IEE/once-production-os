import type {Store,Tx} from './store.ts';
import type {Clock,RequestMeta} from './model.ts';
import type {AiRun,AiLedgerConfig} from './ai-ledger-model.ts';
import {AiLedger} from './ai-ledger.ts';
import {workspaceRow} from './helpers.ts';
import {digest} from './json.ts';
import {invariant,missing} from './errors.ts';

export interface AiDispatchResponse {
 amountUnits:number;evidenceDigest:string;output:unknown;
}
/** A concrete approved adapter must bound price/input/output and implement abort.
 * There is deliberately no default adapter or production fake implementation. */
export interface AiDispatchAdapter {
 send(input:unknown,context:{signal:AbortSignal;idempotencyKey:string}):Promise<AiDispatchResponse>;
}
export interface AiDispatchPolicy {
 /** Reconstruct ONLY approved inputs, checking requester permissions, exact source
  * versions, AI_PROCESS grants and configuration in this current transaction. */
 authorize(tx:Tx,run:AiRun):Promise<unknown>;
 /** Validate provider output and store a PENDING proposal in this transaction.
  * This hook must never apply facts, make HTTP calls or grant source permissions. */
 proposal(tx:Tx,run:AiRun,output:unknown):Promise<void>;
}
/** No production entrypoint instantiates this until its task policy and approved
 * provider adapter are implemented. All network work follows a committed attempt. */
export async function dispatchAi(store:Store,clock:Clock,config:AiLedgerConfig,workspaceId:string,runId:string,meta:RequestMeta,adapter:AiDispatchAdapter,policy:AiDispatchPolicy,timeoutMs:number){
 invariant(Number.isInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=120000,'AI_TIMEOUT_INVALID','AI 请求时限无效',400);
 const ledger=new AiLedger(clock);
 const prepared=await store.transaction(async tx=>{
  const run=await workspaceRow(tx,'aiRuns',runId,workspaceId);if(!run)missing();
  const input=await policy.authorize(tx,run);
  invariant(digest(input)===run.inputDigest,'AI_INPUT_CHANGED','获准输入已变化，请重新确认',409);
  const attempt=await ledger.begin(tx,workspaceId,runId,config,meta);
  return {input,attempt};
 });
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('AI outcome unknown'));},timeoutMs);});
  const response=await Promise.race([adapter.send(prepared.input,{signal:controller.signal,idempotencyKey:prepared.attempt.providerIdempotencyKey}),timeout]);
  await store.transaction(async tx=>{
   const run=await workspaceRow(tx,'aiRuns',runId,workspaceId);if(!run)missing();
   // Even cancellation must account for a confirmed charge. A cancelled task never
   // creates a proposal. Authorization after the HTTP gap prevents stale adoption.
   if(!run.cancelRequested){
    await ledger.proposalCurrent(tx,run,config);
    invariant(digest(await policy.authorize(tx,run))===run.inputDigest,'AI_INPUT_CHANGED','获准输入已变化，请重新确认',409);
    await policy.proposal(tx,run,response.output);
   }
   await ledger.settle(tx,workspaceId,prepared.attempt.id,'SUCCEEDED',response.amountUnits,response.evidenceDigest,meta);
  });
  return {state:'SETTLED' as const,attemptId:prepared.attempt.id};
 }catch{
  // Includes invalid output, policy revocation, timeout, network and commit failure.
  // No provider body/error is logged, and the reservation is not released. A failed
  // unknown-state write leaves MAY_HAVE_EXECUTED, which also forbids another send.
  await store.transaction(tx=>ledger.unknown(tx,workspaceId,prepared.attempt.id,meta));
  return {state:'UNKNOWN' as const,attemptId:prepared.attempt.id};
 }finally{if(timer)clearTimeout(timer);}
}
