import type {Application} from '../../../../packages/core/src/api.ts';
import type {MediaPurgeProvider,PurgeObjectRef} from './purge-provider.ts';
import type {MediaPurgeIntent} from '../../../../packages/core/src/media-purge-model.ts';
import {PURGE_LIMITS} from '../../../../packages/core/src/media-purge-model.ts';
import type {SafetyIntentSink} from '../../../../packages/core/src/safety-intent.ts';
import {digest} from '../../../../packages/core/src/json.ts';
/** Separate scheduler and leases from media processing. External I/O never holds a DB transaction. */
export class MediaPurgeWorker {
 private nextTick=0;
 readonly core:Application;readonly provider:MediaPurgeProvider;readonly journal:SafetyIntentSink|null;
 constructor(core:Application,provider:MediaPurgeProvider,journal:SafetyIntentSink|null=null){this.core=core;this.provider=provider;this.journal=journal;}
 async cycle(signal:AbortSignal,force=false){if(signal.aborted||!force&&this.core.clock.now().getTime()<this.nextTick)return false;this.nextTick=this.core.clock.now().getTime()+PURGE_LIMITS.tickMs;let did=false;
  for(let n=0;n<PURGE_LIMITS.batch&&!signal.aborted;n++){const c=await this.core.mediaPurge.claim();if(!c)break;did=true;await this.process(c,signal);}return did;
 }
 async process(claim:MediaPurgeIntent,signal:AbortSignal){
  const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();let pending=false,journaled=!this.journal;
  const timer=setInterval(()=>{if(pending)return;pending=true;void this.core.mediaPurge.heartbeat(claim).catch(abort).finally(()=>{pending=false;});},10000);
  const intent={intentId:'intent:'+digest({id:claim.id,attempt:claim.attempts}),workspaceId:claim.workspaceId,operation:'worker.media.purge',requestId:claim.id,resourceId:claim.assetId};
  try{
   if(this.journal){await this.journal.writeAhead(intent);journaled=true;}
   const started=await this.core.mediaPurge.beginDelete(claim);if(!started){if(this.journal)await this.journal.committed(intent,claim.assetId).catch(()=>{});return;}let p:MediaPurgeIntent=started;
   const provisional:PurgeObjectRef[]=[];
   for(const object of p.objects){
    if(controller.signal.aborted)return;
    // Even a previously confirmed object is re-statted after crash/restore before finalization.
    const ref={...object,uploadId:p.uploadId,objectToken:p.objectToken};
    try{
     if(this.provider.deferObjectMissingUntilNamespace){
      // Validate any present known bytes, but never delete a COS object outside
      // the durable namespace receipt. A 404 is only a provisional observation.
      await this.provider.statPurgeObject(ref,controller.signal);
      provisional.push(ref);
      p=await this.core.mediaPurge.objectResult(claim,object.part,'UNKNOWN');
      continue;
     }
     if(await this.provider.statPurgeObject(ref,controller.signal)==='EXISTS'){
      const authorized=await this.core.mediaPurge.beginDelete(claim);if(!authorized)return;
      await this.provider.deleteImmutableObject(ref,controller.signal);
     }
     const state=await this.provider.statPurgeObject(ref,controller.signal)==='MISSING'?'MISSING':'UNKNOWN';
     if(state==='MISSING'&&p.objects.filter(o=>o.part!==object.part).every(o=>o.state==='MISSING'))await this.provider.purgeOwnedNamespace(ref,controller.signal);
     p=await this.core.mediaPurge.objectResult(claim,object.part,state);
    }catch{p=await this.core.mediaPurge.objectResult(claim,object.part,'UNKNOWN');}
   }
   if(this.provider.deferObjectMissingUntilNamespace&&provisional.length>0&&provisional.length===p.objects.length&&!controller.signal.aborted){
    let confirmed=false;
    try{await this.provider.purgeOwnedNamespace(provisional[provisional.length-1]!,controller.signal);confirmed=true;}
    catch{/* Namespace remains unconfirmed; every processed object stays UNKNOWN. */}
    if(confirmed)for(const ref of provisional)p=await this.core.mediaPurge.objectResult(claim,ref.part,'MISSING');
   }
   if(p.state==='DELETE_CONFIRMED')await this.core.mediaPurge.finalize(claim);else await this.core.mediaPurge.defer(claim);
   if(this.journal)await this.journal.committed(intent,claim.assetId).catch(()=>{});
  }catch{if(journaled)await this.core.mediaPurge.defer(claim,'PURGE_RECONCILIATION_REQUIRED').catch(()=>{});}
  finally{clearInterval(timer);signal.removeEventListener('abort',abort);}
 }
}
