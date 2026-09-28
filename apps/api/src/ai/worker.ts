import {currentAiConfig,connectionRow,CONNECTION_TEST_INPUT} from '../../../../packages/core/src/ai-connection.ts';
import {digest} from '../../../../packages/core/src/json.ts';
import {permissionsFor} from '../../../../packages/core/src/policy.ts';
import {dispatchAi} from '../../../../packages/core/src/ai-dispatch.ts';
import {randomUUID} from 'node:crypto';
import type {Application} from '../../../../packages/core/src/api.ts';
import type {AiDispatchAdapter} from '../../../../packages/core/src/ai-dispatch.ts';
import {AiLedger} from '../../../../packages/core/src/ai-ledger.ts';
import {AppError,invariant} from '../../../../packages/core/src/errors.ts';
/** Resolve the configured SDK adapter per workspace; production has no synthetic fallback.
 * The committed unique attempt is the one-send authority. It is never taken over:
 * after the bounded request window an abandoned attempt becomes UNKNOWN, not QUEUED. */
export interface InstalledAiAdapter extends AiDispatchAdapter { providerIdentityHash:string; }
export class AiWorker {
 readonly core:Application;readonly adapter:InstalledAiAdapter|null|((workspaceId:string)=>Promise<InstalledAiAdapter|null>);
 constructor(core:Application,adapter:InstalledAiAdapter|null|((workspaceId:string)=>Promise<InstalledAiAdapter|null>)){this.core=core;this.adapter=adapter;}
 async cycle(signal:AbortSignal):Promise<boolean>{
  if(signal.aborted)return false;
  const meta={requestId:randomUUID(),ip:'worker'},ledger=new AiLedger(this.core.clock);
  const swept=await this.core.store.transaction(async tx=>{
   let count=0;
   for(const a of await tx.find('aiAttempts',{state:'MAY_HAVE_EXECUTED'})){
    if(this.core.clock.now().getTime()-Date.parse(a.createdAt)<130000)continue;
    await ledger.unknown(tx,a.workspaceId,a.id,meta);count++;
   }
   return count;
  });
  if(!this.adapter)return swept>0;
  const candidates=await this.core.store.transaction(async tx=>{
   const queued=await tx.find('aiRuns',{state:'QUEUED'}),tasks=await tx.find('aiTasks');
   return queued.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)).slice(0,20).map(r=>({run:r,task:tasks.find(t=>t.runId===r.id&&t.workspaceId===r.workspaceId)}));
  });
  for(const {run,task} of candidates){
   if(signal.aborted)return swept>0;
   try{
    const isTest=!task&&run.inputDigest===digest(CONNECTION_TEST_INPUT);
    invariant(isTest||task&&task.proposalState==='NONE','AI_TASK_UNAVAILABLE','任务已不再适合执行',409);
    const adapter=typeof this.adapter==='function'?await this.adapter(run.workspaceId):this.adapter;
    if(!adapter)continue;
    const {c,timeoutMs}=await this.core.store.transaction(async tx=>({c:await currentAiConfig(tx,run.workspaceId,this.core.config),timeoutMs:(await connectionRow(tx,run.workspaceId))?.settings.timeoutMs??60000}));
    invariant(c?.enabled&&adapter.providerIdentityHash===c.providerIdentityHash,'AI_ADAPTER_MISMATCH','模型连接已变化',409);
    if(isTest){
     await dispatchAi(this.core.store,this.core.clock,c,run.workspaceId,run.id,meta,adapter,{
      authorize:async tx=>{
       const member=await tx.get('memberships',run.actorId),user=member?await tx.get('users',member.userId):null;
       invariant(member?.workspaceId===run.workspaceId&&member.status==='ACTIVE'&&user?.status==='ACTIVE'&&permissionsFor(member).includes('members.manage'),'FORBIDDEN','测试发起者资格已变化',403);
       invariant(this.core.config.accessMode==='INTERNAL'&&this.core.config.dataEgressMode==='INTERNAL_APPROVED'&&(await tx.get('workspaces',run.workspaceId))?.recoveryEpoch===this.core.config.recoveryEpoch,'AI_EGRESS_DISABLED','当前不允许外部调用',409);
       invariant(digest(await currentAiConfig(tx,run.workspaceId,this.core.config))===digest(c),'AI_CONFIG_CHANGED','连接配置已变化',409);
       return CONNECTION_TEST_INPUT;
      },proposal:async()=>{},
     },timeoutMs,signal);
    }else await this.core.ai.dispatch(this.core.store,task!.id,run.workspaceId,adapter,meta,signal);
    return true;
   }catch(e){
    // A losing concurrent worker must never cancel another worker's committed send.
    // Transient storage/audit errors leave QUEUED intact for the next cycle.
    if(!(e instanceof AppError)||![400,403,404,409,422].includes(e.status))throw e;
    if(signal.aborted)return swept>0;
    await this.core.store.transaction(async tx=>{
     const current=await tx.get('aiRuns',run.id);
     if(current?.state==='QUEUED')await ledger.cancel(tx,run.workspaceId,run.id,meta);
    });
    return true;
   }
  }
  return swept>0;
 }
}
