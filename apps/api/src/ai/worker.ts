import {randomUUID} from 'node:crypto';
import type {Application} from '../../../../packages/core/src/api.ts';
import type {AiDispatchAdapter} from '../../../../packages/core/src/ai-dispatch.ts';
import {AiLedger} from '../../../../packages/core/src/ai-ledger.ts';
import {AppError,invariant} from '../../../../packages/core/src/errors.ts';
/** Only a deployment-verified adapter may be installed. No synthetic/default adapter.
 * The committed unique attempt is the one-send authority. It is never taken over:
 * after the bounded request window an abandoned attempt becomes UNKNOWN, not QUEUED. */
export interface InstalledAiAdapter extends AiDispatchAdapter { providerIdentityHash:string; }
export class AiWorker {
 readonly core:Application;readonly adapter:InstalledAiAdapter|null;
 constructor(core:Application,adapter:InstalledAiAdapter|null){this.core=core;this.adapter=adapter;}
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
  if(!this.adapter||!this.core.config.ai?.enabled)return swept>0;
  invariant(this.adapter.providerIdentityHash===this.core.config.ai.providerIdentityHash,'AI_ADAPTER_MISMATCH','AI 适配器与部署配置不一致',409);
  const candidates=await this.core.store.transaction(async tx=>{
   const queued=await tx.find('aiRuns',{state:'QUEUED'}),tasks=await tx.find('aiTasks');
   return queued.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)).slice(0,20).map(r=>({run:r,task:tasks.find(t=>t.runId===r.id&&t.workspaceId===r.workspaceId)}));
  });
  for(const {run,task} of candidates){
   if(signal.aborted)return swept>0;
   try{
    invariant(task&&task.proposalState==='NONE','AI_TASK_UNAVAILABLE','任务已不再适合执行',409);
    await this.core.ai.dispatch(this.core.store,task.id,run.workspaceId,this.adapter,meta,signal);
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
