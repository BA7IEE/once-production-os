import type {Store,Tx} from './store.ts';
import type {Base,Clock,RequestMeta} from './model.ts';
import type {AiRun,AiLedgerConfig} from './ai-ledger-model.ts';
import {AiLedger} from './ai-ledger.ts';
import {workspaceRow} from './helpers.ts';
import {digest} from './json.ts';
import {invariant,missing} from './errors.ts';
import {base} from './helpers.ts';

export interface AiResponseMetadata extends Base {
 runId:string;inputTokens:number|null;outputTokens:number|null;
 cacheReadTokens:number|null;cacheWriteTokens:number|null;reasoningTokens:number|null;
 providerResponseId:string|null;outputStatus:'VALID_JSON'|'INVALID_JSON'|'INCOMPLETE';
}
export type AiResponseInfo=Omit<AiResponseMetadata,keyof Base|'runId'>;

export interface AiDispatchResponse {
 amountUnits?:number;evidenceDigest:string;output:unknown;metadata?:AiResponseInfo;
}
/** A concrete adapter must bound input/output and implement abort.
 * There is deliberately no default adapter or production fake implementation. */
export interface AiDispatchAdapter {
 providerIdentityHash?:string;
 send(input:unknown,context:{signal:AbortSignal;idempotencyKey:string;deadlineAt:string}):Promise<AiDispatchResponse>;
}
export interface AiDispatchPolicy {
 /** Reconstruct ONLY approved inputs, checking requester permissions, exact source
  * versions, AI_PROCESS grants and configuration in this current transaction. */
 authorize(tx:Tx,run:AiRun):Promise<unknown>;
 /** Validate provider output and store a PENDING proposal in this transaction.
  * This hook must never apply facts, make HTTP calls or grant source permissions. */
 proposal(tx:Tx,run:AiRun,output:unknown):Promise<void>;
}
/** All network work follows a committed attempt and current task authorization. */
export async function dispatchAi(store:Store,clock:Clock,config:AiLedgerConfig,workspaceId:string,runId:string,meta:RequestMeta,adapter:AiDispatchAdapter,policy:AiDispatchPolicy,timeoutMs:number,signal?:AbortSignal){
 invariant(Number.isInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=120000,'AI_TIMEOUT_INVALID','AI 请求时限无效',400);
 const ledger=new AiLedger(clock);
 const prepared=await store.transaction(async tx=>{
  const run=await workspaceRow(tx,'aiRuns',runId,workspaceId);if(!run)missing();
  invariant(!signal?.aborted,'AI_WORKER_STOPPED','后台已停止领取任务',409);
  const input=await policy.authorize(tx,run);
  invariant(digest(input)===run.inputDigest,'AI_INPUT_CHANGED','获准输入已变化，请重新确认',409);
  invariant(!signal?.aborted,'AI_WORKER_STOPPED','后台已停止领取任务',409);
  const attempt=await ledger.begin(tx,workspaceId,runId,config,meta);
  return {input,attempt};
 });
 const controller=new AbortController();let abort:()=>void=()=>{};let timer:ReturnType<typeof setTimeout>|undefined;
 let received:AiDispatchResponse|undefined;
 const recordResponse=async(tx:Tx)=>{
  if(received?.metadata&&!(await tx.find('aiResponseMetadata',{workspaceId,runId})).length)
   await tx.insert('aiResponseMetadata',{...base(workspaceId,clock),runId,...received.metadata});
 };
 try{
  const timeout=new Promise<never>((_,reject)=>{abort=()=>{controller.abort();reject(new Error('AI outcome unknown'));};timer=setTimeout(abort,timeoutMs);signal?.addEventListener('abort',abort,{once:true});});
  if(signal?.aborted){abort();await timeout;}
  invariant(clock.now().getTime()-Date.parse(prepared.attempt.createdAt)<timeoutMs,'AI_SEND_WINDOW_EXPIRED','请求发送窗口已经过期',409);
  const response=await Promise.race([adapter.send(prepared.input,{signal:controller.signal,idempotencyKey:prepared.attempt.providerIdempotencyKey,deadlineAt:new Date(Date.parse(prepared.attempt.createdAt)+timeoutMs).toISOString()}),timeout]);
  received=response;
  await store.transaction(async tx=>{
   const run=await workspaceRow(tx,'aiRuns',runId,workspaceId);if(!run)missing();
   // Even cancellation must account for a confirmed charge. A cancelled task never
   // creates a proposal. Authorization after the HTTP gap prevents stale adoption.
   if(!run.cancelRequested&&response.output!==null){
    await ledger.proposalCurrent(tx,run,config);
    invariant(digest(await policy.authorize(tx,run))===run.inputDigest,'AI_INPUT_CHANGED','获准输入已变化，请重新确认',409);
    await policy.proposal(tx,run,response.output);
   }
   await recordResponse(tx);
   if(response.amountUnits===undefined)await ledger.unknown(tx,workspaceId,prepared.attempt.id,meta);
   else await ledger.settle(tx,workspaceId,prepared.attempt.id,'SUCCEEDED',response.amountUnits,response.evidenceDigest,meta);
  });
  return {state:response.amountUnits===undefined?'RECEIVED_COST_UNKNOWN' as const:'SETTLED' as const,attemptId:prepared.attempt.id};
 }catch{
  // Includes invalid output, policy revocation, timeout, network and commit failure.
  // No provider body/error is logged, and the reservation is not released. A failed
  // unknown-state write leaves MAY_HAVE_EXECUTED, which also forbids another send.
  await store.transaction(async tx=>{await recordResponse(tx);await ledger.unknown(tx,workspaceId,prepared.attempt.id,meta);});
  return {state:'UNKNOWN' as const,attemptId:prepared.attempt.id};
 }finally{if(timer)clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
