import {currentAiConfig} from './ai-connection.ts';
import type { Actor, Clock, Config, Base, RequestMeta } from './model.ts';
import type { Tx } from './store.ts';
import { base, cas, touch, workspaceRow } from './helpers.ts';
import { AppError, invariant, missing } from './errors.ts';
import { permissionsFor, requirePermission, sourceFor } from './policy.ts';
import { digest } from './json.ts';
import { AiLedger, validateAiConfig } from './ai-ledger.ts';
import { AiSchemas as S } from './ai-validation.ts';
export interface AiApproval extends Base { configDigest:string; configRevision:number; reviewerId:string; enabled:boolean; recoveryEpoch:string; }
export interface AiBudgetRelease extends Base { budgetId:string; budgetRevision:number; approvalId:string; reviewerId:string; }
export interface AiReconciliation extends Base { attemptId:string; reviewerId:string; evidenceSourceId:string; sourceRevision:number; protectionEpoch:number; outcome:'SUCCEEDED'|'NOT_EXECUTED'; amountUnits:number; }
export function aiOperator(actor:Actor) { requirePermission(actor,'members.manage'); invariant(actor.actorKind!=='MACHINE','HUMAN_AI_REQUIRED','AI 配置和费用需要管理员本人确认',403); }
export const aiConfigDigest=(config:Config)=>config.ai?digest(config.ai):null;
export async function approvedAi(tx:Tx,workspaceId:string,config:Config){
 const c=await currentAiConfig(tx,workspaceId,config);
 invariant(c?.enabled,'AI_DISABLED','请先保存模型连接配置',409);
 invariant(config.accessMode==='INTERNAL'&&config.dataEgressMode==='INTERNAL_APPROVED','AI_EGRESS_DISABLED','系统处于维护状态或数据外送未启用',409);
 validateAiConfig(c);
 const approvals=await tx.find('aiApprovals',{workspaceId}),row=approvals.find(a=>a.configDigest===digest(c));
 invariant(!approvals.some(a=>a.configRevision>c.configRevision),'AI_CONFIG_CHANGED','不能恢复已被较新版本替代的 AI 配置',409);
 const m=row?await workspaceRow(tx,'memberships',row.reviewerId,workspaceId):null,u=m?await tx.get('users',m.userId):null;
 invariant(row?.enabled&&row.recoveryEpoch===config.recoveryEpoch&&m?.status==='ACTIVE'&&u?.status==='ACTIVE'&&permissionsFor(m).includes('members.manage'),'AI_APPROVAL_REQUIRED','当前 AI 配置尚未批准、已停用或批准人资格已变化',409);
 invariant((await tx.get('workspaces',workspaceId))?.recoveryEpoch===config.recoveryEpoch,'AI_RECOVERY_CHANGED','恢复后须重新批准配置',409);
 return c;
}
export class AiOperations {
 readonly clock:Clock;readonly config:Config;
 constructor(clock:Clock,config:Config){this.clock=clock;this.config=config;}
 async status(tx:Tx,actor:Actor){
  aiOperator(actor);const c=await currentAiConfig(tx,actor.workspaceId,this.config),candidateDigest=c?digest(c):null,approval=candidateDigest?(await tx.find('aiApprovals',{workspaceId:actor.workspaceId,configDigest:candidateDigest}))[0]:null;
  let enabled=false;try{await approvedAi(tx,actor.workspaceId,this.config);enabled=true;}catch(e){if(!(e instanceof AppError&&[403,409].includes(e.status)))throw e;}
  const runs=await tx.find('aiRuns',{workspaceId:actor.workspaceId});
  return {candidate:c?{digest:candidateDigest,providerIdentityHash:c.providerIdentityHash,configRevision:c.configRevision,currency:c.currency,perTaskLimitUnits:c.perTaskLimitUnits,dailyLimitUnits:c.dailyLimitUnits,maxAttempts:c.maxAttempts}:null,approval:approval?{id:approval.id,revision:approval.revision,enabled:approval.enabled}:null,enabled,budgets:(await tx.find('aiBudgets',{workspaceId:actor.workspaceId})).map(b=>({id:b.id,revision:b.revision,period:b.period,currency:b.currency,reservedUnits:b.reservedUnits,settledUnits:b.settledUnits,frozen:b.frozen})),unresolved:(await tx.find('aiAttempts',{workspaceId:actor.workspaceId})).filter(a=>['UNKNOWN','MAY_HAVE_EXECUTED'].includes(a.state)).map(a=>({id:a.id,revision:a.revision,runId:a.runId,providerIdentityHash:runs.find(r=>r.id===a.runId)?.providerIdentityHash??'',state:a.state,createdAt:a.createdAt,providerIdempotencyKey:a.providerIdempotencyKey}))};
 }
 async approval(tx:Tx,actor:Actor,input:unknown){
  aiOperator(actor);const d=S.approval.parse(input),c=await currentAiConfig(tx,actor.workspaceId,this.config);
  invariant(c?.enabled&&d.configDigest===digest(c),'AI_CONFIG_CHANGED','部署配置不存在或已经变化，请重新读取',409);
  invariant(d.confirmConfiguration,'AI_CONFIRM_REQUIRED','请确认模型连接及调用限额',422);
  if(d.enabled){validateAiConfig(c);invariant(this.config.accessMode==='INTERNAL'&&this.config.dataEgressMode==='INTERNAL_APPROVED','AI_EGRESS_DISABLED','系统处于维护状态或数据外送未启用',409);}
  const old=(await tx.find('aiApprovals',{workspaceId:actor.workspaceId,configDigest:d.configDigest}))[0];
  invariant(!(await tx.find('aiApprovals',{workspaceId:actor.workspaceId})).some(a=>a.configDigest!==d.configDigest&&a.configRevision>=c.configRevision),'AI_CONFIG_REVISION_REUSED','配置变化必须提升配置版本',409);
  invariant(old?old.revision===d.expectedRevision:d.expectedRevision===0,'REVISION_CONFLICT','配置审批已变化，请刷新',409);
  const row:AiApproval={...(old?touch(old,this.clock):base(actor.workspaceId,this.clock)),configDigest:d.configDigest,configRevision:c.configRevision,reviewerId:actor.membershipId,enabled:d.enabled,recoveryEpoch:this.config.recoveryEpoch};
  if(old)await tx.replace('aiApprovals',row);else await tx.insert('aiApprovals',row);return row;
 }
 async reconcile(tx:Tx,actor:Actor,id:string,input:unknown,meta:RequestMeta){
  aiOperator(actor);requirePermission(actor,'sources.review');requirePermission(actor,'sensitive.read');
  const d=S.reconcile.parse(input),a=await workspaceRow(tx,'aiAttempts',id,actor.workspaceId);if(!a)missing();cas(a,d.expectedRevision);
  invariant(a.state==='UNKNOWN','AI_ATTEMPT_NOT_UNKNOWN','只能核对已经结束等待的未知请求',409);
  const r=await workspaceRow(tx,'aiRuns',a.runId,actor.workspaceId);if(!r)missing();
  invariant(d.confirmProviderResult&&d.providerIdempotencyKey===a.providerIdempotencyKey&&d.providerIdentityHash===r.providerIdentityHash,'AI_PROOF_MISMATCH','核对证据必须对应本次供应商和请求编号',422);
  const source=await sourceFor(tx,actor,d.evidenceSourceId,this.clock);cas(source,d.evidenceSourceRevision);
  invariant(source.status==='CONFIRMED'&&source.basisMode==='INTERNAL_USE','AI_PROOF_REQUIRED','请先登记并核验供应商账单或未执行证明',422);
  // No automatic resend follows a human reconciliation. Confirmed nonexecution closes
  // the old job; a new task requires a fresh user confirmation and reservation.
  await tx.insert('aiReconciliations',{...base(actor.workspaceId,this.clock),attemptId:a.id,reviewerId:actor.membershipId,evidenceSourceId:source.id,sourceRevision:source.revision,protectionEpoch:source.protectionEpoch,outcome:d.outcome,amountUnits:d.amountUnits});
  const received=(await tx.find('aiResponseMetadata',{workspaceId:actor.workspaceId,runId:r.id}))[0];
  invariant(!received||d.outcome!=='NOT_EXECUTED','AI_PROOF_CONFLICT','已收到模型响应，不能确认成未执行',422);
  const ledger=new AiLedger(this.clock);if(!received)await ledger.cancel(tx,actor.workspaceId,r.id,meta);
  await ledger.settle(tx,actor.workspaceId,a.id,d.outcome,d.amountUnits,digest({sourceId:source.id,revision:source.revision,protectionEpoch:source.protectionEpoch,providerIdempotencyKey:a.providerIdempotencyKey,providerIdentityHash:r.providerIdentityHash,reviewerId:actor.membershipId}),meta);
  return (await tx.get('aiAttempts',id))!;
 }
 async unfreeze(tx:Tx,actor:Actor,id:string,input:unknown){
  aiOperator(actor);const d=S.unfreeze.parse(input),b=await workspaceRow(tx,'aiBudgets',id,actor.workspaceId);if(!b)missing();cas(b,d.expectedRevision);
  invariant(d.confirmOverrun&&b.frozen,'AI_CONFIRM_REQUIRED','请确认已核对超额费用',422);
  invariant(!(await tx.find('aiAttempts',{workspaceId:actor.workspaceId})).some(a=>['UNKNOWN','MAY_HAVE_EXECUTED'].includes(a.state)),'AI_UNRESOLVED','仍有未决费用，不能解除冻结',409);
  const c=await approvedAi(tx,actor.workspaceId,this.config);
  const today=(await tx.find('aiBudgets',{workspaceId:actor.workspaceId,period:this.clock.now().toISOString().slice(0,10),currency:c.currency}))[0];
  invariant(!today||today.reservedUnits+today.settledUnits<=c.dailyLimitUnits,'BUDGET_NOT_AVAILABLE','当天已用费用超过当前上限，请调整并重新批准配置或次日再操作',409);
  const approval=(await tx.find('aiApprovals',{workspaceId:actor.workspaceId,configDigest:digest(c)}))[0]!;
  await tx.insert('aiBudgetReleases',{...base(actor.workspaceId,this.clock),budgetId:b.id,budgetRevision:b.revision,approvalId:approval.id,reviewerId:actor.membershipId});
  const row={...touch(b,this.clock),frozen:false};await tx.replace('aiBudgets',row);return row;
 }
}
