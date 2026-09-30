import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {prepareRebuildMedia} from '../../scripts/rebuild-media.ts';
import {randomUUID} from 'node:crypto';
import {proofTransfer} from './credential-media-transfer.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import {inspectTalentIntegrity,talentSnapshot} from '../../packages/core/src/talent-v2-integrity.ts';
import {RecoveryOps} from '../../packages/core/src/recovery.ts';
import {mergePreview,mergeInput} from './talent-v2-merge.ts';
import {prepareAssetDeletion} from './talent-asset-erasure.ts';
import {DeletionCleanup} from '../../packages/core/src/deletion-cleanup.ts';
import type {Application} from '../../packages/core/src/api.ts';
import type {Store} from '../../packages/core/src/store.ts';
import type {FakeClock,Client} from './fixtures.ts';
type Context={app:Application;store:Store;clock:FakeClock;owner:Client};
/** Runs unchanged against memory and actual PostgreSQL. No SQL shortcuts create business attributes. */
export async function verifyDirectoryLifecycle(f:Context,target:Context,root:string){
 const t=await proofTransfer(f,root),id=t.graph.personId;
 const update=async(values:Record<string,unknown>)=>ok(await f.owner.cmd('PATCH',`/directory/talents/${id}`,{schemaVersion:'once-talent-experience-v1',expectedRevision:(await t.graph.current()).revision,sourceId:t.graph.sourceId,sourceRevision:1,...values}),200);
 await update({profile:{genderCode:'FEMALE',birthPrecision:'YEAR_ONLY',birthYear:2000,nationalityCodes:['US'],coverAssetId:t.asset.id},model:{castingMarketCode:'DOMESTIC',experienceCode:'AMATEUR',styleCodes:['natural'],serviceCodes:['print']},measurement:{heightCm:177,measuredOn:null,datePrecision:'UNKNOWN',supersedesId:t.graph.measurementId},confirmMeasurement:true});
 assert.equal((await f.owner.raw('POST',`/exports/${t.jobId}/download`,{})).status,409,'old exports become stale when the professional graph changes');
 const job=ok(await f.owner.cmd('POST','/exports',t.input),202).resourceId,claim=await f.app.exports.claim();assert.ok(claim);await f.app.exports.process(claim);const download=ok(await f.owner.raw('POST',`/exports/${job}/download`,{}),200),bundle=download.payload.manifest.talent;
 const profile=bundle.tables.talentProfiles.find((r:any)=>r.personId===id),model=bundle.tables.personRoles.find((r:any)=>r.personId===id&&r.data.roleCode==='model'),measurement=bundle.tables.measurementSets.find((r:any)=>r.data.datePrecision==='UNKNOWN');
 assert.equal(profile.data.coverAssetId,t.asset.id);assert.deepEqual(profile.data.nationalityCodes,['US']);assert.equal(model.data.experienceCode,'AMATEUR');assert.equal(measurement.data.measuredOn,null);assert.equal(bundle.assets.length,1);
 const rebuild=new JsonRebuild(target.clock,{sourceContactKey:f.app.config.contactKey,targetContactKey:target.app.config.contactKey}),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
 const input=join(root,'transfer-input');await mkdir(input,{mode:0o700});await writeFile(join(input,t.asset.id+'.original.bin'),t.original,{mode:0o600});await writeFile(join(input,t.asset.id+'.preview.jpg'),t.preview,{mode:0o600});
 const verified=await prepareRebuildMedia(download.payload,actor.workspaceId,{REBUILD_MEDIA_INPUT_DIR:input,REBUILD_MEDIA_TARGET_DIR:join(root,'restored-media')},true),ready=new JsonRebuild(target.clock,{sourceContactKey:f.app.config.contactKey,targetContactKey:target.app.config.contactKey},verified);
 await target.store.transaction(tx=>ready.apply(tx,actor,download.payload,{requestId:randomUUID(),ip:'test'}));
 for(const [table,row] of [['talentProfiles',profile],['personRoles',model],['measurementSets',measurement]] as const){const restored=await target.store.transaction(tx=>tx.get(table,row.id));assert.ok(restored);for(const [key,value] of Object.entries(row.data))if(!['verification'].includes(key))assert.deepEqual((restored as any)[key],value,key);}
 assert.equal((await target.store.transaction(tx=>inspectTalentIntegrity(tx,actor.workspaceId,target.app.config.contactKey))).relationFailures,0);
 const recovery=new RecoveryOps(target.clock,{...target.app.config,accessMode:'MAINTENANCE',dataEgressMode:'DISABLED',dataCleanupMode:'DISABLED',dataMergeMode:'DISABLED',recoveryEpoch:'synthetic_directory_epoch_'+ 'x'.repeat(40)}),recoveryActor=await target.store.transaction(tx=>recovery.actorFromRestoredTarget(tx,'owner'));
 const before=await target.store.transaction(tx=>talentSnapshot(tx,actor.workspaceId)),plan=await target.store.transaction(tx=>recovery.preview(tx,recoveryActor));await target.store.transaction(tx=>recovery.prepare(tx,recoveryActor,plan.sourceEpochDigest,{requestId:randomUUID(),ip:'test'}));const after=await target.store.transaction(tx=>talentSnapshot(tx,actor.workspaceId));
 for(const table of ['talentProfiles','personRoles','measurementSets'] as const)assert.deepEqual(after[table],before[table],'recovery retains new data and unknowns');
 const canonical=ok(await f.owner.cmd('POST','/td2/people',{schemaVersion:'once-talent-v2.1.0',originSourceId:t.graph.sourceId,sourceRevision:1,displayName:'合成目录主身份'})).resourceId;
 const preview=await mergePreview(f.store,f.owner,canonical,id);assert.equal(preview.complete,true,JSON.stringify(preview.blockers));ok(await f.owner.cmd('POST','/people/merge',mergeInput(preview)),200);
 const mergedProfile=await f.store.transaction(tx=>tx.get('talentProfiles',profile.id));assert.equal(mergedProfile?.personId,canonical);assert.equal(mergedProfile?.coverAssetId,t.asset.id);assert.equal((await f.store.transaction(tx=>tx.get('assets',t.asset.id)))?.personId,canonical);assert.equal((await f.store.transaction(tx=>tx.get('personRoles',model.id)))?.experienceCode,'AMATEUR');
 assert.equal((await f.owner.raw('GET',`/directory/talents/${id}`)).status,404,'old Person ID retains its alias, never becomes a second entry');
 assert.equal((await f.store.transaction(tx=>tx.find('personAliases',{oldPersonId:id})))[0]?.canonicalPersonId,canonical);
 await prepareAssetDeletion(f,t.asset.id);const cleanup=new DeletionCleanup(f.store,f.clock,f.app.config),clean=await cleanup.claim();assert.ok(clean);await cleanup.process(clean);assert.equal((await f.store.transaction(tx=>tx.get('talentProfiles',profile.id)))?.coverAssetId,null);assert.equal((await f.store.transaction(tx=>tx.get('personRoles',model.id)))?.experienceCode,'AMATEUR');
 assert.equal((await f.store.transaction(tx=>inspectTalentIntegrity(tx,mergedProfile!.workspaceId,f.app.config.contactKey))).relationFailures,0);
 const compare=async(query:Record<string,unknown>)=>{const sql=ok(await f.owner.raw('POST','/directory/talents/search',query),200),qs=new URLSearchParams(Object.entries(query).map(([k,v])=>[k,String(v)]));const reference=ok(await f.owner.raw('GET','/td2/people?'+qs),200);assert.equal(sql.total,reference.total,JSON.stringify(query));assert.deepEqual(sql.items.map((p:any)=>p.id),reference.items.map((p:any)=>p.id),JSON.stringify(query));if(query.market){assert.equal(sql.facets.roles.model,1);assert.equal(sql.facets.roles.translator??0,0,'facet count must run the actual role plus market query');}};
 for(const query of [{mode:'ALL'},{role:'model'},{role:'model',gender:'FEMALE',nationality:'US',market:'DOMESTIC',experience:'AMATEUR',style:'natural',service:'print',ageMin:25,ageMax:26,heightMin:175},{ageUnknown:true},{gender:'UNKNOWN'},{role:'translator',market:'DOMESTIC'},{q:'合成目录主身份',page:2,pageSize:1},{ageMin:26,ageMax:26},{nationality:'CN'}])await compare(query);
 const src=await f.store.transaction(tx=>tx.get('sources',t.graph.sourceId));ok(await f.owner.cmd('POST',`/sources/${t.graph.sourceId}/suspend`,{expectedRevision:src!.revision,reason:'合成查询撤回来源'}),200);await compare({role:'model',gender:'FEMALE'});await compare({q:'合成目录主身份'});
 return {profileId:profile.id,modelRoleId:model.id,measurementId:measurement.id,coverAssetId:t.asset.id,canonicalPersonId:canonical,checks:['persisted-new-fields','stale-export','controlled-media-export','typed-rebuild-preserves-ids','recovery-keeps-unknowns','merge-preserves-old-id-and-business-fields','asset-erasure-clears-cover','sql-reference-parity','withdrawn-source-queries']};
}
