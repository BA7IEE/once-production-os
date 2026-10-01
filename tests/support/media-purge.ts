import assert from 'node:assert/strict';
import type {Store} from '../../packages/core/src/store.ts';
import {stagingFixture,unitReady} from './media-staging.ts';
import {MediaPurge} from '../../packages/core/src/media-purge.ts';
import {MediaPurgeWorker} from '../../apps/api/src/media/purge-worker.ts';
import {FakeClock} from './fixtures.ts';
import {inspectTalentIntegrity} from '../../packages/core/src/talent-v2-integrity.ts';
export async function purgeRaceScenario(store:Store,cleanupFirst:boolean){
 const f=await stagingFixture(store),id=await unitReady(f);f.app.config.dataCleanupMode='INTERNAL_APPROVED';
 await f.expect(f.a.client.raw('POST','/portal/submissions/'+f.submissionId+'/submit',{expectedRevision:await f.revision()},f.headers()));
 // Two transaction snapshots straddling the retention boundary. Review retains the earlier Clock.
 const clock=new FakeClock();clock.value=f.clock.now().getTime()+181*86400000;const purge=new MediaPurge(store,clock,f.app.config),c=await purge.claim();assert.ok(c);
 if(cleanupFirst)await purge.beginDelete(c);
 const reviewed=await f.owner.cmd('POST','/talent-submissions/'+f.submissionId+'/decide',{expectedRevision:await f.revision(),acceptedKeys:['media_'+id],publicReason:'竞争审核'});
 if(cleanupFirst){assert.equal(reviewed.status,409);assert.ok(['MEDIA_NOT_ADOPTABLE','MEDIA_PURGE_IN_PROGRESS'].includes((reviewed.body as any).error.code));assert.equal((await store.transaction(tx=>tx.get('assets',id)))!.usageState,'RETIRED');}
 else {assert.equal(reviewed.status,200,JSON.stringify(reviewed.body));assert.equal(await purge.beginDelete(c),null);assert.equal((await store.transaction(tx=>tx.get('assets',id)))!.usageState,'ADOPTED');assert.equal((await store.transaction(tx=>tx.get('mediaPurgeIntents',c.id)))!.lastCode,'SKIPPED_FORMAL_DEPENDENCY');}
 return {f,id,purge,c,checks:[cleanupFirst?'delete-fence-denies-real-review-command':'real-review-adopts-before-delete-final-recheck-skips']};
}
export async function purgeLifecycleScenario(store:Store){
 const f=await stagingFixture(store),id=await unitReady(f);f.app.config.dataCleanupMode='INTERNAL_APPROVED';
 await f.expect(f.a.client.raw('POST','/portal/submissions/'+f.submissionId+'/withdraw',{expectedRevision:await f.revision()},f.headers()));
 const relation=(await store.transaction(tx=>tx.find('personMedia',{assetId:id})))[0]!;assert.equal(Date.parse(relation.retainUntil!)-f.clock.now().getTime(),7*86400000);
 f.clock.advance(7*86400000-1);assert.equal(await f.app.mediaPurge.claim(),null);f.clock.advance(1);
 const claims=await Promise.all([f.app.mediaPurge.claim(),f.app.mediaPurge.claim()]);assert.equal(claims.filter(Boolean).length,1);const c=claims.find(Boolean)!;
 await f.app.mediaPurge.beginDelete(c);await f.app.mediaPurge.objectResult(c,'original','UNKNOWN');assert.equal((await store.transaction(tx=>tx.get('uploads',id)))!.expectedBytes,100);
 f.clock.advance(60001);const second=(await f.app.mediaPurge.claim())!;assert.ok(second);await assert.rejects(f.app.mediaPurge.heartbeat(c));
 const objects=new Set(['original','preview']),worker=new MediaPurgeWorker(f.app,{purgeOwnedNamespace:async()=>{},statPurgeObject:async r=>objects.has(r.part)?'EXISTS':'MISSING',deleteImmutableObject:async r=>{objects.delete(r.part);}});await worker.process(second,new AbortController().signal);
 assert.equal((await store.transaction(tx=>tx.get('assets',id)))!.state,'ERASED');assert.equal((await store.transaction(tx=>tx.get('uploads',id)))!.expectedBytes,0);assert.equal(await f.app.mediaPurge.claim(),null);
 return {f,id,checks:['withdraw-seven-days-exact-boundary','two-workers-one-lease','expired-lease-fences-old-owner','unknown-retains-quota','reconcile-all-objects-before-quota-release','repeated-tick-no-double-release']};
}
import {FaultStore} from './fault-store.ts';
export async function purgeRollbackScenario(inner:Store){
 const store=new FaultStore(inner),f=await stagingFixture(store),id=await unitReady(f);f.app.config.dataCleanupMode='INTERNAL_APPROVED';f.clock.advance(90*86400000);
 const c=(await f.app.mediaPurge.claim())!;assert.ok(c);await f.app.mediaPurge.beginDelete(c);await f.app.mediaPurge.objectResult(c,'original','MISSING');await f.app.mediaPurge.objectResult(c,'preview','MISSING');
 store.afterInsert=(table,row)=>{if(table==='audits'&&(row as any).action==='media.purge.finalized')throw new Error('synthetic final audit fault');};
 await assert.rejects(f.app.mediaPurge.finalize(c));assert.equal((await store.transaction(tx=>tx.get('assets',id)))!.usageState,'RETIRED');assert.equal((await store.transaction(tx=>tx.get('assets',id)))!.state,'READY');assert.equal((await store.transaction(tx=>tx.get('uploads',id)))!.expectedBytes,100);assert.equal((await store.transaction(tx=>tx.get('mediaPurgeIntents',c.id)))!.state,'DELETE_CONFIRMED');
 store.afterInsert=null;f.clock.advance(60000);const recovered=(await f.app.mediaPurge.claim())!;assert.ok(recovered);let deletes=0;await new MediaPurgeWorker(f.app,{purgeOwnedNamespace:async()=>{},statPurgeObject:async()=> 'MISSING',deleteImmutableObject:async()=>{deletes++;}}).process(recovered,new AbortController().signal);assert.equal(deletes,0);assert.equal((await store.transaction(tx=>tx.get('uploads',id)))!.expectedBytes,0);assert.equal(await f.app.mediaPurge.claim(),null);
 return {f,id,checks:['real-transaction-final-audit-failure-rolls-back-finalize','fenced-media-not-readable-after-physical-delete-db-fault','confirmed-plan-reconciles-without-second-delete-or-quota-release']};
}
import {DeletionFinalizer} from '../../apps/api/src/deletion/finalizer.ts';
export async function purgeDeletionScenario(store:Store,ttlFirst:boolean,mode='normal'){
 const f=await stagingFixture(store),id=await unitReady(f);f.app.config.dataCleanupMode='INTERNAL_APPROVED';const clock=new FakeClock();clock.value=f.clock.now().getTime()+91*86400000;const purge=new MediaPurge(store,clock,f.app.config);let c;
 if(ttlFirst||['eligible','claimed','live'].includes(mode)){
  c=(await purge.claim())!;assert.ok(c);
  if(ttlFirst)await purge.beginDelete(c);
  else await store.transaction(tx=>tx.replace('mediaPurgeIntents',{...c!,state:mode==='eligible'?'ELIGIBLE':'CLAIMED',leaseUntil:mode==='live'?new Date(f.clock.now().getTime()+60000).toISOString():null,leaseToken:mode==='live'?c!.leaseToken:null}));
 }
 const person=(await store.transaction(tx=>tx.get('people',f.personId)))!,input={targetKind:'PERSON',targetId:person.id,expectedRevision:person.revision},preview=await f.expect(f.owner.raw('POST','/deletion-requests/preview',input));assert.equal(preview.complete,true,JSON.stringify(preview.unresolved));
 const created=await f.expect(f.owner.cmd('POST','/deletion-requests',{...input,previewDigest:preview.previewDigest,reason:'合成：显式删除与到期竞争'}),201),rid=created.resourceId,current=()=>store.transaction(tx=>tx.get('deletionRequests',rid));
 await f.expect(f.owner.cmd('POST','/deletion-requests/'+rid+'/block',{expectedRevision:1,previewDigest:preview.previewDigest,acknowledgeBlock:true}));
 for(const item of await store.transaction(tx=>tx.find('deletionItems',{requestId:rid})))if(item.decision==='PENDING')await f.expect(f.owner.cmd('POST','/deletion-requests/'+rid+'/decisions',{expectedRevision:(await current())!.revision,entryId:item.id,decision:'APPLY_PROPOSED',decisionReason:'合成完整清理确认'}));
 await f.expect(f.owner.cmd('POST','/deletion-requests/'+rid+'/plan/freeze',{expectedRevision:(await current())!.revision,acknowledgePlan:true}));await f.expect(f.owner.cmd('POST','/deletion-requests/'+rid+'/cleaning/start',{expectedRevision:(await current())!.revision,planDigest:(await current())!.planDigest,acknowledgeIrreversible:true}));
 if(ttlFirst){assert.equal(await f.app.deletionCleanup.claim(),null);assert.equal(await f.app.deletionFinalization.claim(),null);await purge.objectResult(c!,'original','MISSING');await purge.objectResult(c!,'preview','MISSING');await purge.finalize(c!);}else if(mode==='normal')assert.equal(await purge.claim(),null);
 const cleanup=await f.app.deletionCleanup.claim();assert.ok(cleanup);await f.app.deletionCleanup.process(cleanup);
 if(mode==='live'){
  assert.equal(await f.app.deletionFinalization.claim(),null);
  f.clock.advance(60001);
 }
 let deletes=0;
 const finalizer=new DeletionFinalizer(f.app,{purge:async()=>{
  deletes++;
  assert.equal(await purge.claim(),null);
  if(mode==='slow'){
   const tick=setInterval(()=>f.clock.advance(1000),1000);
   try{await new Promise(resolve=>setTimeout(resolve,32000));assert.equal(await f.app.deletionFinalization.claim(),null);await new Promise(resolve=>setTimeout(resolve,3000));}
   finally{clearInterval(tick);}
  }
 }} as any);
 await finalizer.cycle(new AbortController().signal);assert.equal(deletes,ttlFirst?0:1);assert.equal((await store.transaction(tx=>tx.get('uploads',id)))!.expectedBytes,0);assert.equal((await store.transaction(tx=>tx.get('assets',id)))!.state,'ERASED');assert.equal(await purge.claim(),null);
 clock.advance(300001);assert.equal(await purge.claim(),null);
 const intents=await store.transaction(tx=>tx.find('mediaPurgeIntents',{assetId:id}));
 assert.ok(intents.every(p=>['SKIPPED','ERASED'].includes(p.state)&&!p.leaseToken&&!p.leaseUntil));
 if(['eligible','claimed','live'].includes(mode)){assert.equal(intents[0]!.state,'SKIPPED');assert.equal(intents[0]!.lastCode,'EXPLICIT_DELETION_TAKEOVER');
  const inspect=()=>store.transaction(tx=>inspectTalentIntegrity(tx,f.actor.workspaceId,f.app.config.contactKey));
  const before=await inspect();
  await store.transaction(tx=>tx.replace('mediaPurgeIntents',{...intents[0]!,state:'ELIGIBLE'}));
  assert.ok((await inspect()).relationFailures>before.relationFailures);
  // The scheduler also terminalizes legacy dangling reversible intents without provider I/O.
  clock.advance(300001);assert.equal(await purge.claim(),null);
  assert.equal((await store.transaction(tx=>tx.get('mediaPurgeIntents',intents[0]!.id)))!.state,'SKIPPED');
  assert.equal((await inspect()).relationFailures,before.relationFailures);
 }

 assert.equal((await store.transaction(tx=>tx.get('uploads',id)))!.expectedBytes,0);
 return {f,id,checks:[mode+'-finalizer-ownership-no-retryable-intent-after-retry-window',ttlFirst?'TTL-fence-blocks-explicit-cleanup-then-handoff-without-second-physical-delete':'explicit-deletion-blocks-TTL-before-physical-delete','one-quota-release-after-explicit-TTL-handoff']};
}
export async function purgeBatchScenario(store:Store){
 const f=await stagingFixture(store),ids:string[]=[];f.app.config.dataCleanupMode='INTERNAL_APPROVED';for(let n=0;n<36;n++)ids.push(await unitReady(f));f.clock.advance(90*86400000);
 await store.transaction(async tx=>{const s=(await tx.get('talentSubmissions',f.submissionId))!;await tx.replace('talentSubmissions',{...s,expiresAt:new Date(f.clock.now().getTime()+86400000).toISOString()});const ordered=(await tx.find('personMedia')).sort((a,b)=>a.assetId.localeCompare(b.assetId));for(const r of ordered.slice(32)){await tx.replace('personMedia',{...r,usageState:'RETIRED',retiredAt:f.clock.now().toISOString()});const a=(await tx.get('assets',r.assetId))!;await tx.replace('assets',{...a,usageState:'RETIRED'});}});
 // A blocked window is recorded with backoff, so it cannot starve the next bounded window.
 assert.equal(await f.app.mediaPurge.claim(),null);assert.equal((await store.transaction(tx=>tx.find('mediaPurgeIntents'))).length,32);
 const worker=new MediaPurgeWorker(f.app,{purgeOwnedNamespace:async()=>{},statPurgeObject:async()=> 'MISSING',deleteImmutableObject:async()=>{throw new Error('must stat missing');}});await worker.cycle(new AbortController().signal,true);assert.equal((await store.transaction(tx=>tx.find('assets',{state:'ERASED'}))).length,4);assert.equal((await store.transaction(tx=>tx.find('uploads'))).reduce((n,u)=>n+u.expectedBytes,0),3200);
 f.clock.advance(86400000);await worker.cycle(new AbortController().signal,true);assert.equal((await store.transaction(tx=>tx.find('assets',{state:'ERASED'}))).length,8);
 return {f,checks:['bounded-32-candidate-window-defers-current-submission-dependency','blocked-window-does-not-starve-later-due-assets','one-cycle-at-most-four-purges','expired-transient-dependency-reconsidered-next-cycle']};
}
export async function purgeDecisionScenario(store:Store,partial:boolean){
 const f=await stagingFixture(store),first=await unitReady(f),second=await unitReady(f);f.app.config.dataCleanupMode='INTERNAL_APPROVED';await f.expect(f.a.client.raw('POST','/portal/submissions/'+f.submissionId+'/submit',{expectedRevision:await f.revision()},f.headers()));
 const submitted=(await store.transaction(tx=>tx.get('talentSubmissions',f.submissionId)))!;assert.equal(Date.parse(submitted.expiresAt)-f.clock.now().getTime(),180*86400000);
 await f.expect(f.owner.cmd('POST','/talent-submissions/'+f.submissionId+'/decide',{expectedRevision:await f.revision(),acceptedKeys:partial?['media_'+first]:[],publicReason:'合成未采纳保留期限'}));
 const submission=(await store.transaction(tx=>tx.get('talentSubmissions',f.submissionId)))!;assert.equal(submission.state,partial?'PARTIALLY_APPROVED':'REJECTED');const relations=await store.transaction(tx=>tx.find('personMedia'));for(const r of relations)assert.equal(r.retainUntil,r.assetId===first&&partial?null:new Date(f.clock.now().getTime()+30*86400000).toISOString());
 f.clock.advance(30*86400000-1);assert.equal(await f.app.mediaPurge.claim(),null);f.clock.advance(1);await new MediaPurgeWorker(f.app,{purgeOwnedNamespace:async()=>{},statPurgeObject:async()=> 'MISSING',deleteImmutableObject:async()=>{}}).cycle(new AbortController().signal,true);
 assert.equal((await store.transaction(tx=>tx.get('assets',second)))!.state,'ERASED');assert.equal((await store.transaction(tx=>tx.get('assets',first)))!.state,partial?'READY':'ERASED');assert.equal((await store.transaction(tx=>tx.find('uploads'))).reduce((n,u)=>n+u.expectedBytes,0),partial?100:0);
 return {f,checks:[partial?'actual-partial-review-only-unadopted-erased':'actual-rejected-review-thirty-day-purge','submit-sets-180-day-window','decision-exact-boundary-and-quota']};
}

import {loadMediaRetention} from '../../packages/core/src/media-retention.ts';
export async function uploadRetentionScenario(store:Store,days:number){
 const f=await stagingFixture(store,true,async f=>{f.app.config.mediaRetention=loadMediaRetention({MEDIA_RETENTION_DRAFT_DAYS:String(days)});});
 const deadline=f.clock.now().getTime()+days*86400000;
 assert.equal(Date.parse((await store.transaction(tx=>tx.get('talentSubmissions',f.submissionId)))!.expiresAt),deadline);
 const id=await unitReady(f);
 assert.equal(Date.parse((await store.transaction(tx=>tx.get('talentSubmissions',f.submissionId)))!.expiresAt),deadline);
 assert.equal(Date.parse((await store.transaction(tx=>tx.find('personMedia',{assetId:id})))[0]!.retainUntil!),deadline);
 return {f,id,checks:['configured-draft-'+days+'-days-preserved-through-portal-upload-and-READY']};
}
