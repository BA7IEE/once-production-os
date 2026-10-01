import {collectRecoveryExternalCheck} from '../../apps/api/src/recovery/external-check.ts';
/** Offline recovery drill. Both databases are disposable synthetic fixtures; never enables a restored service. */
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,realpath,mkdir,writeFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {Application} from '../../packages/core/src/api.ts';import {RecoveryOps} from '../../packages/core/src/recovery.ts';
import {stagingFixture,unitReady,unitOriginal,unitPreview} from '../support/media-staging.ts';
import {LocalMediaProvider} from '../../apps/api/src/media/local-provider.ts';import {MediaPurgeWorker} from '../../apps/api/src/media/purge-worker.ts';
import {backupPrivateMedia,restorePrivateMedia} from '../../apps/api/src/recovery/media-backup.ts';
export async function purgeRestoreScenario(store:PrismaStore,db:PrismaClient,url:string){
 const f=await stagingFixture(store),ids=[await unitReady(f),await unitReady(f)];f.app.config.dataCleanupMode='INTERNAL_APPROVED';
 const tmp=await mkdtemp(join(await realpath(tmpdir()),'once-purge-restore-')),root=join(tmp,'private'),provider=await LocalMediaProvider.create(root);
 for(const id of ids){const a=await db.mediaAsset.findUniqueOrThrow({where:{id}}),dir=provider.work(id,a.objectToken);await mkdir(dir,{recursive:true,mode:0o700});await writeFile(join(dir,'original.bin'),unitOriginal,{mode:0o400});await writeFile(join(dir,'preview.jpg'),unitPreview,{mode:0o400});}
 f.clock.advance(90*86400000);const claims=[];
 for(let n=0;n<2;n++){const c=(await f.app.mediaPurge.claim())!;assert.ok(c);claims.push(c);await f.app.mediaPurge.beginDelete(c);for(const o of c.objects){if(n===0&&o.part==='preview')continue;await provider.deleteImmutableObject({...o,uploadId:c.uploadId,objectToken:c.objectToken},new AbortController().signal);}await f.app.mediaPurge.objectResult(c,'original','UNKNOWN');}
 const bundle=join(tmp,'bundle'),manifest=await backupPrivateMedia(db,'local',root,bundle);assert.equal(manifest.totalBytes,50);assert.deepEqual(manifest.assets.map(a=>a.missingParts!.length).sort(),[1,2]);assert.equal(await db.mediaUpload.aggregate({_sum:{expectedBytes:true}}).then(r=>r._sum.expectedBytes),200);
 const dump=join(tmp,'database.dump'),pgEnv=(raw:string)=>{const u=new URL(raw);return {...process.env,PGHOST:u.hostname,PGPORT:u.port,PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:u.pathname.slice(1)};};
 const command=(cmd:string,args:string[],raw:string)=>{const r=spawnSync(cmd,args,{env:pgEnv(raw),encoding:'utf8',timeout:120000});assert.equal(r.status,0,r.stderr);};command('pg_dump',['--format=custom','--file',dump],url);
 const target=new URL(url);target.pathname='/once_restore_purge_'+randomUUID().replaceAll('-','');const adminUrl=new URL(url);adminUrl.pathname='/postgres';const admin=new PrismaClient({datasources:{db:{url:adminUrl.href}},log:[]});try{await admin.$executeRawUnsafe('CREATE DATABASE "'+target.pathname.slice(1)+'"');}finally{await admin.$disconnect();}
 command('pg_restore',['--no-owner','--no-acl','--dbname',target.pathname.slice(1),dump],target.href);
 const restored=new PrismaClient({datasources:{db:{url:target.href}},log:[]}),rs=new PrismaStore(restored),targetRoot=join(tmp,'restored-private');await restorePrivateMedia(manifest,bundle,targetRoot);
 try{
  assert.deepEqual(await restored.mediaPurgeIntent.findMany({orderBy:{id:'asc'}}),await db.mediaPurgeIntent.findMany({orderBy:{id:'asc'}}));
  // The source fixture proves real prepare fences every pre-restore token and leaves UNKNOWN intact.
  const targetEpoch=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-',''),ops=new RecoveryOps(f.clock,{...f.app.config,accessMode:'MAINTENANCE',dataCleanupMode:'DISABLED',dataEgressMode:'DISABLED',dataMergeMode:'DISABLED',recoveryEpoch:targetEpoch});
  await store.transaction(async tx=>ops.prepare(tx,await ops.actorFromRestoredTarget(tx,'owner'),createHash('sha256').update(f.app.config.recoveryEpoch).digest('hex'),{requestId:randomUUID(),ip:'synthetic-purge-restore'}));
  for(const c of claims)await assert.rejects(f.app.mediaPurge.heartbeat(c));await assert.rejects(f.app.mediaPurge.claim(),e=>(e as any).code==='CLEANUP_DISABLED');assert.equal(await db.mediaPurgeIntent.count({where:{state:'DELETE_UNKNOWN',leaseToken:null}}),2);
  const isolated=new Application(store,{...f.app.config,accessMode:'MAINTENANCE',recoveryEpoch:targetEpoch},f.clock);assert.equal(await isolated.mediaPurge.claim(),null);
  // Offline reconciliation of the restored snapshot, not deployment approval or a running Portal.
  f.clock.advance(60001);const app=new Application(rs,f.app.config,f.clock),local=await LocalMediaProvider.openExisting(targetRoot),worker=new MediaPurgeWorker(app,local);await worker.cycle(new AbortController().signal,true);
  assert.equal(await restored.mediaPurgeIntent.count({where:{state:'ERASED'}}),2);assert.equal(await restored.mediaUpload.aggregate({_sum:{expectedBytes:true}}).then(r=>r._sum.expectedBytes),0);
  for(const c of claims){await assert.rejects(stat(local.group(c.uploadId)),{code:'ENOENT'});await assert.rejects(app.mediaPurge.heartbeat(c));}
  await collectRecoveryExternalCheck(restored,{MEDIA_PROVIDER:'local',MEDIA_ROOT:targetRoot});await assert.rejects(collectRecoveryExternalCheck(restored,{MEDIA_PROVIDER:'disabled'}));
  const resurrected=claims[0]!,resurrectedDir=local.work(resurrected.uploadId,resurrected.objectToken);await mkdir(resurrectedDir,{recursive:true,mode:0o700});await writeFile(join(resurrectedDir,'original.bin'),unitOriginal,{mode:0o400});await assert.rejects(collectRecoveryExternalCheck(restored,{MEDIA_PROVIDER:'local',MEDIA_ROOT:targetRoot}),e=>(e as any).code==='RECOVERY_PURGE_INTEGRITY');await rm(local.group(resurrected.uploadId),{recursive:true});
  return {checks:['ERASED-physical-resurrection-and-disabled-provider-fail-closed','real-pg-dump-restore-UNKNOWN-plan-and-partial-private-bytes','prepare-fences-old-leases-preserves-UNKNOWN-and-quota','maintenance-mode-and-old-config-worker-blocked-during-prepared-recovery','offline-restored-UNKNOWN-one-preview-exists-one-all-missing-reconciled','restored-physical-namespace-missing-quota-released-exactly-once']};
 }finally{await rs.close();}
}
