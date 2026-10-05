import {MEDIA_RETENTION_DEFAULTS} from './media-retention.ts';
import {randomUUID} from 'node:crypto';
import type {Store,Tx} from './store.ts';
import type {Actor,Clock,Config} from './model.ts';
import type {MediaAsset} from './media-model.ts';
import {mediaUsage} from './media-model.ts';
import {base,touch,audit} from './helpers.ts';
import {invariant} from './errors.ts';
import {requirePermission,deletionBlocked} from './policy.ts';
import {PURGE_LIMITS as L,irreversiblePurge,type MediaPurgeIntent,type PurgeObject} from './media-purge-model.ts';
export async function assertMediaNotPurging(tx:Tx,assetId:string){const p=(await tx.find('mediaPurgeIntents',{assetId}))[0];invariant(!p||!irreversiblePurge(p.state),'MEDIA_PURGE_IN_PROGRESS','素材已进入清理，请重新上传',409);}
/** Includes invisible and currently unusable formal references: loss of consent is not a deletion request. */
export async function formalMediaDependency(tx:Tx,a:MediaAsset){
 if(mediaUsage(a)==='ADOPTED'||a.sourceId)return true;
 for(const r of await tx.find('personMedia',{workspaceId:a.workspaceId,assetId:a.id}))if(r.usageState==='ADOPTED'||r.sourceId)return true;
 for(const table of ['mediaCollectionItems','workAssets','shortlistItemAssets'] as const)if((await tx.find(table,{workspaceId:a.workspaceId,assetId:a.id})).length)return true;
 for(const table of ['personCredentials','adultEligibilities'] as const)if((await tx.find(table,{workspaceId:a.workspaceId,evidenceAssetId:a.id})).length)return true;
 for(const table of ['talentProfiles','mediaCollections'] as const)if((await tx.find(table,{workspaceId:a.workspaceId,coverAssetId:a.id})).length)return true;
 return false;
}
/** Explicit deletion owns both direct targets and planned media dependencies, including completed requests. */
export async function explicitMediaDeletion(tx:Tx,workspaceId:string,assetId:string){
 const items=await tx.find('deletionItems',{workspaceId,resourceId:assetId});
 return (await tx.find('deletionRequests',{workspaceId})).some(r=>r.state!=='DRAFT'&&
  (r.targetKind==='ASSET'&&r.targetId===assetId||items.some(i=>i.requestId===r.id)));
}
export class MediaPurge {
 readonly store:Store;readonly clock:Clock;readonly config:Config;
 constructor(store:Store,clock:Clock,config:Config){this.store=store;this.clock=clock;this.config=config;}
 async overview(tx:Tx,actor:Actor){requirePermission(actor,'members.manage');invariant(actor.actorKind!=='MACHINE','FORBIDDEN','仅限内部维护人员',403);const {reconcileIds:_,...status}=await tx.mediaPurgeOverview(actor.workspaceId,this.now());return {...status,retention:this.config.mediaRetention??MEDIA_RETENTION_DEFAULTS};}
 async reconcile(tx:Tx,actor:Actor){await this.overview(tx,actor);await this.enabled(tx,actor.workspaceId);const status=await tx.mediaPurgeOverview(actor.workspaceId,this.now());for(const id of status.reconcileIds){const p=(await tx.get('mediaPurgeIntents',id))!;await tx.replace('mediaPurgeIntents',{...touch(p,this.clock),nextAttemptAt:this.now()});}return {id:actor.workspaceId,revision:1};}
 private now(){return this.clock.now().toISOString();}
 private async enabled(tx:Tx,w:string){const workspace=await tx.get('workspaces',w),recovery=(await tx.find('recoveryRuns',{workspaceId:w})).some(r=>r.state!=='APPROVED');invariant(!recovery&&this.config.accessMode==='INTERNAL'&&this.config.dataCleanupMode==='INTERNAL_APPROVED'&&workspace?.recoveryEpoch===this.config.recoveryEpoch,'CLEANUP_DISABLED','当前环境不允许清理',503);}
 private async event(tx:Tx,p:MediaPurgeIntent,action:string){await audit(tx,null,p.workspaceId,'media.purge.'+action,'mediaPurge',p.id,[],{requestId:randomUUID(),ip:'worker'},this.clock);}
 private async eligible(tx:Tx,a:MediaAsset,fenced=false){
  if(a.state!=='READY'&&!(fenced&&a.state==='QUARANTINED')||await formalMediaDependency(tx,a))return false;
  const rows=await tx.find('personMedia',{workspaceId:a.workspaceId,assetId:a.id});if(!rows.length)return false;
  if(!fenced&&(await deletionBlocked(tx,a.workspaceId,'ASSET',a.id)||a.personId&&await deletionBlocked(tx,a.workspaceId,'PERSON',a.personId)))return false;
  if(!fenced){
   if(a.personId){const p=await tx.get('people',a.personId);if(!p||await deletionBlocked(tx,a.workspaceId,'SOURCE',p.sourceId))return false;}
   for(const item of await tx.find('deletionItems',{workspaceId:a.workspaceId,resourceId:a.id})){const request=await tx.get('deletionRequests',item.requestId);if(request&&request.state!=='DRAFT')return false;}
  }
  for(const r of rows){
   if(r.purgedAt||!r.submissionId||!r.retainUntil||r.retainUntil>this.now())return false;
   if(!fenced&&r.usageState==='STAGED'){const s=await tx.get('talentSubmissions',r.submissionId);if(!s||['DRAFT','SUBMITTED'].includes(s.state)&&s.expiresAt>this.now())return false;}
  }
  return true;
 }
 async claim():Promise<MediaPurgeIntent|null>{
  if(this.config.accessMode!=='INTERNAL'||this.config.dataCleanupMode!=='INTERNAL_APPROVED')return null;
  return this.store.transaction(async tx=>{
   for(const id of await tx.mediaPurgeCandidates(this.now(),L.scan)){
    const a=await tx.get('assets',id);if(!a)continue;await this.enabled(tx,a.workspaceId);
    let p=(await tx.find('mediaPurgeIntents',{assetId:id}))[0];
    if(p?.leaseUntil&&p.leaseUntil>this.now())continue;
    if(p&&['SKIPPED','ERASED'].includes(p.state))continue;
    const upload=await tx.get('uploads',a.uploadId);
    if(a.state==='ERASED'||upload?.state==='ERASED'||await explicitMediaDeletion(tx,a.workspaceId,id)){
     if(p&&!irreversiblePurge(p.state)){
      await tx.replace('mediaPurgeIntents',{...touch(p,this.clock),state:'SKIPPED',leaseToken:null,leaseUntil:null,lastCode:'EXPLICIT_DELETION_TAKEOVER'});
      await this.event(tx,p,'skipped');
     }
     // An irreversible TTL plan must finish before explicit deletion can acquire ownership.
     if(!p||!irreversiblePurge(p.state)||a.state==='ERASED'||upload?.state==='ERASED')continue;
    }

    if(!p){if(a.state!=='READY'||a.bytes<=0)continue;p={...base(a.workspaceId,this.clock),assetId:id,uploadId:a.uploadId,objectToken:a.objectToken,state:'ELIGIBLE',objects:[{part:'original',bytes:a.bytes,hash:a.sha256,state:'PENDING'},...(a.previewBytes?[{part:'preview' as const,bytes:a.previewBytes,hash:a.previewHash,state:'PENDING' as const}]:[])],leaseToken:null,leaseUntil:null,recoveryEpoch:this.config.recoveryEpoch,attempts:0,nextAttemptAt:this.now(),lastCode:null,purgedAt:null};await tx.insert('mediaPurgeIntents',p);await this.event(tx,p,'eligible');}
    if(!irreversiblePurge(p.state)&&!await this.eligible(tx,a)){const formal=await formalMediaDependency(tx,a);await tx.replace('mediaPurgeIntents',{...touch(p,this.clock),state:formal?'SKIPPED':'ELIGIBLE',leaseToken:null,leaseUntil:null,nextAttemptAt:new Date(this.clock.now().getTime()+L.retryMs).toISOString(),lastCode:formal?'SKIPPED_FORMAL_DEPENDENCY':'PURGE_DEPENDENCY_DEFERRED'});await this.event(tx,p,formal?'skipped':'dependency-deferred');continue;}
    const n={...touch(p,this.clock),state:irreversiblePurge(p.state)?p.state:'CLAIMED' as const,leaseToken:randomUUID(),leaseUntil:new Date(this.clock.now().getTime()+L.leaseMs).toISOString(),recoveryEpoch:this.config.recoveryEpoch,attempts:p.attempts+1};await tx.replace('mediaPurgeIntents',n);await this.event(tx,n,'claimed');return n;
   }return null;
  });
 }
 private async owned(tx:Tx,c:MediaPurgeIntent){await this.enabled(tx,c.workspaceId);const p=await tx.get('mediaPurgeIntents',c.id);invariant(p&&p.leaseToken===c.leaseToken&&p.recoveryEpoch===c.recoveryEpoch&&p.recoveryEpoch===this.config.recoveryEpoch&&!!p.leaseUntil&&p.leaseUntil>this.now(),'LEASE_LOST','清理租约已失效',409);return p;}
 async heartbeat(c:MediaPurgeIntent){return this.store.transaction(async tx=>{const p=await this.owned(tx,c);await tx.replace('mediaPurgeIntents',{...p,leaseUntil:new Date(this.clock.now().getTime()+L.leaseMs).toISOString()});});}
 /** Last short transaction before any external DELETE. Retiring is an irreversible adoption fence. */
 async beginDelete(c:MediaPurgeIntent){return this.store.transaction(async tx=>{const p=await this.owned(tx,c),a=await tx.get('assets',p.assetId);invariant(a,'MEDIA_PURGE_INTEGRITY','素材记录丢失',409);
  if(!await this.eligible(tx,a,irreversiblePurge(p.state))){invariant(!irreversiblePurge(p.state),'MEDIA_PURGE_INTEGRITY','不可逆清理出现正式依赖',409);await tx.replace('mediaPurgeIntents',{...touch(p,this.clock),state:'SKIPPED',leaseToken:null,leaseUntil:null,lastCode:'SKIPPED_FORMAL_DEPENDENCY'});await this.event(tx,p,'skipped');return null;}
  invariant(a.objectToken===p.objectToken,'MEDIA_PURGE_INTEGRITY','不可变对象身份变化',409);
  for(const r of await tx.find('personMedia',{workspaceId:a.workspaceId,assetId:a.id})){if(r.submissionId){const submission=await tx.get('talentSubmissions',r.submissionId);if(submission&&['DRAFT','SUBMITTED'].includes(submission.state)&&submission.expiresAt<=this.now())await tx.replace('talentSubmissions',{...touch(submission,this.clock),state:'EXPIRED'});}await tx.replace('personMedia',{...touch(r,this.clock),usageState:'RETIRED',retiredAt:r.retiredAt??this.now(),protectionEpoch:r.protectionEpoch+1});}
  await tx.replace('assets',{...touch(a,this.clock),usageState:'RETIRED',protectionEpoch:(a.protectionEpoch??1)+1});
  const n={...touch(p,this.clock),state:p.state==='DELETE_UNKNOWN'?'DELETE_UNKNOWN' as const:'DELETE_PENDING' as const};await tx.replace('mediaPurgeIntents',n);await this.event(tx,n,'delete-requested');return n;
 });}
 async objectResult(c:MediaPurgeIntent,part:PurgeObject['part'],state:'UNKNOWN'|'MISSING'){return this.store.transaction(async tx=>{const p=await this.owned(tx,c),objects=p.objects.map(o=>o.part===part?{...o,state}:o);const n={...touch(p,this.clock),objects,state:objects.every(o=>o.state==='MISSING')?'DELETE_CONFIRMED' as const:'DELETE_UNKNOWN' as const};await tx.replace('mediaPurgeIntents',n);await this.event(tx,n,state==='MISSING'?'delete-confirmed':'delete-unknown');return n;});}
 async defer(c:MediaPurgeIntent,code='DELETE_UNKNOWN'){return this.store.transaction(async tx=>{const p=await this.owned(tx,c);await tx.replace('mediaPurgeIntents',{...touch(p,this.clock),leaseToken:null,leaseUntil:null,nextAttemptAt:new Date(this.clock.now().getTime()+L.retryMs).toISOString(),lastCode:code});await this.event(tx,p,'reconcile-deferred');});}
 async finalize(c:MediaPurgeIntent){return this.store.transaction(async tx=>{const p=await this.owned(tx,c);invariant(p.state==='DELETE_CONFIRMED'&&p.objects.every(o=>o.state==='MISSING'),'MEDIA_PURGE_UNCONFIRMED','尚未确认全部物理对象删除',409);const a=(await tx.get('assets',p.assetId))!,u=(await tx.get('uploads',p.uploadId))!;invariant(!await formalMediaDependency(tx,a),'MEDIA_PURGE_INTEGRITY','清理对象仍有正式依赖',409);const at=this.now(),zero='0'.repeat(64);
  await tx.replace('assets',{...touch(a,this.clock),state:'ERASED',usageState:'RETIRED',personId:null,fileName:'[ERASED]',sha256:zero,previewHash:zero,bytes:0,width:0,height:0,previewBytes:0,objectToken:'00000000-0000-0000-0000-000000000000'});
  await tx.replace('uploads',{...touch(u,this.clock),state:'ERASED',personId:null,personRoleId:null,personScopeId:null,personEpoch:null,personScopeRevision:null,fileName:'[ERASED]',expectedHash:zero,expectedBytes:0,purgedAt:at,receiveToken:null,receiveAuthorizationHash:null,receiveAuthorizationUntil:null,leaseToken:null,leaseUntil:null});
  for(const r of await tx.find('personMedia',{workspaceId:a.workspaceId,assetId:a.id}))await tx.replace('personMedia',{...touch(r,this.clock),usageState:'RETIRED',purgedAt:at,retiredAt:r.retiredAt??at,retainUntil:null});
  await tx.replace('mediaPurgeIntents',{...touch(p,this.clock),state:'ERASED',purgedAt:at,leaseToken:null,leaseUntil:null,lastCode:null});await this.event(tx,p,'finalized');
 });}
}
