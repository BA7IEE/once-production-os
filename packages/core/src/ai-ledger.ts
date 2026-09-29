import {randomUUID} from 'node:crypto';
import type {Clock,RequestMeta} from './model.ts';
import type {Tx} from './store.ts';
import type {AiAttempt,AiLedgerConfig,AiRun} from './ai-ledger-model.ts';
import {audit,base,touch,workspaceRow} from './helpers.ts';
import {digest} from './json.ts';
import {invariant,missing} from './errors.ts';

const units=(n:number)=>invariant(Number.isSafeInteger(n)&&n>=0&&n<=2_000_000_000,'AI_AMOUNT_INVALID','AI 金额必须是有效的整数最小单位',400);
const hash=(s:string)=>invariant(/^[a-f0-9]{64}$/.test(s),'AI_DIGEST_INVALID','AI 摘要格式无效',400);
export function validateAiConfig(c:AiLedgerConfig){
  invariant(c.enabled,'AI_DISABLED','AI 调用尚未启用',409);hash(c.providerIdentityHash);
  invariant(Number.isSafeInteger(c.configRevision)&&c.configRevision>0&&c.recoveryEpoch.length>0&&/^[A-Z]{3}$/.test(c.currency)&&Number.isInteger(c.maxAttempts)&&c.maxAttempts>=1&&c.maxAttempts<=3,'AI_CONFIG_INVALID','AI 配置无效',409);
  units(c.perTaskLimitUnits);units(c.dailyLimitUnits);
  invariant(c.perTaskLimitUnits>0&&c.perTaskLimitUnits<=c.dailyLimitUnits,'AI_CONFIG_INVALID','AI 费用上限无效',409);
 }
/** Internal transaction primitive, not an authorization boundary or a provider adapter.
 * Caller must authorize the task, exact text/permissions and current source graph IN THE
 * SAME transaction before reserve/begin; no public route or worker is wired to this yet.
 * Returned begin attempt permits one send ONLY AFTER transaction commit. */
export class AiLedger {
 readonly clock:Clock;
 constructor(clock:Clock){this.clock=clock;}
 private async current(tx:Tx,run:AiRun,c:AiLedgerConfig){
  validateAiConfig(c);
  invariant(run.providerIdentityHash===c.providerIdentityHash&&run.configRevision===c.configRevision,'AI_CONFIG_CHANGED','AI 配置已变化，请重新确认任务',409);
  const workspace=await tx.get('workspaces',run.workspaceId);
  invariant(workspace?.recoveryEpoch===run.recoveryEpoch&&run.recoveryEpoch===c.recoveryEpoch,'AI_RECOVERY_CHANGED','恢复前的 AI 任务不能继续发送',409);
  const member=await workspaceRow(tx,'memberships',run.actorId,run.workspaceId),user=member?await workspaceRow(tx,'users',member.userId,run.workspaceId):null;
  invariant(member?.status==='ACTIVE'&&user?.status==='ACTIVE','AI_ACTOR_INACTIVE','发起成员已失效，不能继续调用',403);
  const budget=await workspaceRow(tx,'aiBudgets',run.budgetId,run.workspaceId);if(!budget)missing();
  invariant(budget.currency===c.currency,'AI_CONFIG_CHANGED','费用币种已变化',409);
  return budget;
 }
 private async record(tx:Tx,run:AiRun,action:string,meta:RequestMeta){
  await audit(tx,null,run.workspaceId,action,'aiRun',run.id,['state','reservedUnits','settledUnits'],meta,this.clock);
 }
 async reserve(tx:Tx,workspaceId:string,actorId:string,key:string,inputDigest:string,reservedUnits:number,c:AiLedgerConfig,meta:RequestMeta){
  validateAiConfig(c);hash(inputDigest);units(reservedUnits);
  invariant(/^[A-Za-z0-9_-]{8,128}$/.test(key),'INVALID_COMMAND_KEY','请求键无效',400);
  invariant(reservedUnits>0&&reservedUnits<=c.perTaskLimitUnits,'BUDGET_NOT_AVAILABLE','任务预留费用超过上限',409);
  const requestDigest=digest({inputDigest,reservedUnits,providerIdentityHash:c.providerIdentityHash,configRevision:c.configRevision,currency:c.currency,recoveryEpoch:c.recoveryEpoch});
  const old=(await tx.find('aiRuns',{workspaceId,actorId,requestKey:key}))[0];
  if(old){invariant(old.requestDigest===requestDigest,'IDEMPOTENCY_CONFLICT','请求键已用于不同的 AI 请求',409);await this.current(tx,old,c);return old;}
  invariant(!(await tx.find('aiBudgets',{workspaceId})).some(b=>b.frozen),'AI_BUDGET_FROZEN','AI 费用待核对，暂停新增调用',409);
  const period=this.clock.now().toISOString().slice(0,10);
  let budget=(await tx.find('aiBudgets',{workspaceId,period,currency:c.currency}))[0];
  if(!budget){budget={...base(workspaceId,this.clock),period,currency:c.currency,reservedUnits:0,settledUnits:0,frozen:false};await tx.insert('aiBudgets',budget);}
  invariant(budget.reservedUnits+budget.settledUnits+reservedUnits<=c.dailyLimitUnits,'BUDGET_NOT_AVAILABLE','当天 AI 预算不足',409);
  const run:AiRun={...base(workspaceId,this.clock),actorId,budgetId:budget.id,requestKey:key,requestDigest,inputDigest,providerIdentityHash:c.providerIdentityHash,configRevision:c.configRevision,recoveryEpoch:c.recoveryEpoch,state:'QUEUED',reservedUnits,settledUnits:null,cancelRequested:false};
  await this.current(tx,run,c);
  await tx.replace('aiBudgets',{...touch(budget,this.clock),reservedUnits:budget.reservedUnits+reservedUnits});await tx.insert('aiRuns',run);await this.record(tx,run,'ai.reserve',meta);return run;
 }
 async proposalCurrent(tx:Tx,run:AiRun,c:AiLedgerConfig){
  await this.current(tx,run,c);
  invariant(run.state==='RUNNING'&&!run.cancelRequested,'AI_PROPOSAL_BLOCKED','任务已取消或结果待核对',409);
 }
 async begin(tx:Tx,workspaceId:string,id:string,c:AiLedgerConfig,meta:RequestMeta):Promise<AiAttempt>{
  const run=await workspaceRow(tx,'aiRuns',id,workspaceId);if(!run)missing();
  const budget=await this.current(tx,run,c);
  invariant(run.state==='QUEUED'&&!run.cancelRequested,'AI_OUTCOME_UNKNOWN','该任务不能再次发送，请核对任务结果',409);
  // A queued job cannot silently spend yesterday's reservation against today's limit.
  invariant(budget.period===this.clock.now().toISOString().slice(0,10),'AI_BUDGET_PERIOD_EXPIRED','任务预留日期已过期，请取消后重新确认',409);
  invariant(!(await tx.find('aiBudgets',{workspaceId})).some(b=>b.frozen),'AI_BUDGET_FROZEN','AI 费用待核对',409);
  invariant(run.reservedUnits<=c.perTaskLimitUnits&&budget.reservedUnits+budget.settledUnits<=c.dailyLimitUnits,'BUDGET_NOT_AVAILABLE','当前预算不足',409);
  const attempts=await tx.find('aiAttempts',{workspaceId,runId:id});
  invariant(attempts.every(a=>a.state==='NOT_EXECUTED')&&attempts.length<c.maxAttempts,'AI_OUTCOME_UNKNOWN','已有请求未决或已达到调用上限',409);
  const attempt:AiAttempt={...base(workspaceId,this.clock),runId:id,attemptNo:attempts.length+1,state:'MAY_HAVE_EXECUTED',requestDigest:run.requestDigest,providerIdempotencyKey:randomUUID(),settlementDigest:null};
  await tx.insert('aiAttempts',attempt);await tx.replace('aiRuns',{...touch(run,this.clock),state:'RUNNING'});await this.record(tx,run,'ai.dispatchAuthorized',meta);return attempt;
 }
 async unknown(tx:Tx,workspaceId:string,attemptId:string,meta:RequestMeta){
  const a=await workspaceRow(tx,'aiAttempts',attemptId,workspaceId);if(!a)missing();
  if(a.state==='UNKNOWN')return;
  invariant(a.state==='MAY_HAVE_EXECUTED','AI_ATTEMPT_FINAL','请求结果已经核对',409);
  const run=await workspaceRow(tx,'aiRuns',a.runId,workspaceId);if(!run)missing();
  await tx.replace('aiAttempts',{...touch(a,this.clock),state:'UNKNOWN'});await tx.replace('aiRuns',{...touch(run,this.clock),state:'UNKNOWN'});await this.record(tx,run,'ai.outcomeUnknown',meta);
 }
 /** Trusted reconciliation only. Proof is a digest of separately governed evidence,
  * never a provider response/error body. Do not expose this as arbitrary user input. */
 async settle(tx:Tx,workspaceId:string,attemptId:string,outcome:'SUCCEEDED'|'NOT_EXECUTED',amount:number,evidenceDigest:string,meta:RequestMeta){
  units(amount);hash(evidenceDigest);invariant(outcome==='SUCCEEDED'||outcome==='NOT_EXECUTED','AI_OUTCOME_INVALID','核对结果无效',400);
  invariant(outcome!=='NOT_EXECUTED'||amount===0,'AI_SETTLEMENT_INVALID','未执行证明不能同时声明已收费',400);
  const a=await workspaceRow(tx,'aiAttempts',attemptId,workspaceId);if(!a)missing();
  const settlementDigest=digest({outcome,amount,evidenceDigest});
  if(a.settlementDigest){invariant(a.settlementDigest===settlementDigest,'AI_SETTLEMENT_CONFLICT','请求已按其他结果核对',409);return;}
  invariant(a.state==='UNKNOWN'||a.state==='MAY_HAVE_EXECUTED','AI_ATTEMPT_FINAL','请求已结束',409);
  const run=await workspaceRow(tx,'aiRuns',a.runId,workspaceId);if(!run)missing();
  const budget=await workspaceRow(tx,'aiBudgets',run.budgetId,workspaceId);if(!budget)missing();
  await tx.replace('aiAttempts',{...touch(a,this.clock),state:outcome,settlementDigest});
  if(outcome==='NOT_EXECUTED'&&!run.cancelRequested){
   await tx.replace('aiRuns',{...touch(run,this.clock),state:'QUEUED'});
  }else{
   const settled=budget.settledUnits+amount;units(settled);
   await tx.replace('aiBudgets',{...touch(budget,this.clock),reservedUnits:budget.reservedUnits-run.reservedUnits,settledUnits:settled,frozen:budget.frozen||amount>run.reservedUnits});
   await tx.replace('aiRuns',{...touch(run,this.clock),state:run.cancelRequested?'CANCELLED':'SUCCEEDED',settledUnits:amount});
  }
  await this.record(tx,run,'ai.settled',meta);
 }
 async cancel(tx:Tx,workspaceId:string,id:string,meta:RequestMeta){
  const run=await workspaceRow(tx,'aiRuns',id,workspaceId);if(!run)missing();
  if(run.cancelRequested||['SUCCEEDED','FAILED','CANCELLED'].includes(run.state))return;
  if(run.state==='QUEUED'){
   const budget=await workspaceRow(tx,'aiBudgets',run.budgetId,workspaceId);if(!budget)missing();
   await tx.replace('aiBudgets',{...touch(budget,this.clock),reservedUnits:budget.reservedUnits-run.reservedUnits});
   await tx.replace('aiRuns',{...touch(run,this.clock),state:'CANCELLED',cancelRequested:true,settledUnits:0});
  }else await tx.replace('aiRuns',{...touch(run,this.clock),cancelRequested:true});
  await this.record(tx,run,'ai.cancelRequested',meta);
 }
}
