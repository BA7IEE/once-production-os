/** Real private bytes + pg_dump/restore; recovery remains isolated throughout. */
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
import {backupPrivateMedia,restorePrivateMedia} from '../../dist/apps/api/src/recovery/media-backup.js';
import {PrismaStore} from '../../dist/apps/api/src/prisma-store.js';
import {RecoveryOps} from '../../dist/packages/core/src/recovery.js';
import {Application} from '../../dist/packages/core/src/api.js';
import {loadConfig} from '../../dist/apps/api/src/config.js';
export async function restoreStaging({prisma,env,tmp,oldToken,stagedId}){
 const url=new URL(env.DATABASE_URL),target=new URL(url),adminUrl=new URL(url);adminUrl.pathname='/postgres';
 target.pathname='/once_restore_media_'+randomBytes(6).toString('hex');
 const admin=new PrismaClient({datasources:{db:{url:adminUrl.href}},log:[]});try{await admin.$executeRawUnsafe('CREATE DATABASE "'+target.pathname.slice(1)+'"');}finally{await admin.$disconnect();}
 const restored=new PrismaClient({datasources:{db:{url:target.href}},log:[]}),store=new PrismaStore(restored),snapshot=db=>Promise.all([db.mediaAsset.findMany({orderBy:{id:'asc'}}),db.personMedia.findMany({orderBy:{id:'asc'}}),db.mediaUpload.findMany({orderBy:{id:'asc'}}),db.mediaCollection.findMany({orderBy:{id:'asc'}}),db.mediaCollectionItem.findMany({orderBy:{id:'asc'}}),db.mediaCollectionTag.findMany({orderBy:{id:'asc'}})]);
 const prior={...process.env};Object.assign(process.env,env);let config;try{config=loadConfig();}finally{for(const key of Object.keys(process.env))if(!(key in prior))delete process.env[key];Object.assign(process.env,prior);}
 try{
  const before=await snapshot(prisma);assert.ok(before[0].some(a=>a.usageState==='STAGED'));assert.ok(before[0].some(a=>a.usageState==='ADOPTED'));
  const bundle=join(tmp,'media-backup'),media=await backupPrivateMedia(prisma,'local',env.MEDIA_ROOT,bundle),dump=join(tmp,'database.dump');
  const pgEnv=u=>({...process.env,PGHOST:u.hostname,PGPORT:u.port,PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:u.pathname.slice(1)});
  for(const [cmd,args,u] of [['pg_dump',['--format=custom','--file',dump],url],['pg_restore',['--no-owner','--no-acl','--dbname',target.pathname.slice(1),dump],target]]){const r=spawnSync(cmd,args,{env:pgEnv(u),encoding:'utf8',timeout:120000});assert.equal(r.status,0,r.stderr);}
  await restorePrivateMedia(media,bundle,join(tmp,'restored-media'));assert.deepEqual(await snapshot(restored),before);
  const recoveryConfig={...config,accessMode:'MAINTENANCE',dataEgressMode:'DISABLED',dataCleanupMode:'DISABLED',dataMergeMode:'DISABLED',recoveryEpoch:randomBytes(24).toString('hex')},clock={now:()=>new Date()},ops=new RecoveryOps(clock,recoveryConfig);
  await store.transaction(async tx=>ops.prepare(tx,await ops.actorFromRestoredTarget(tx,'owner'),createHash('sha256').update(config.recoveryEpoch).digest('hex'),{requestId:crypto.randomUUID(),ip:'synthetic-restore'}));
  const after=await snapshot(restored);assert.deepEqual(after[0].map(a=>[a.id,a.usageState,a.sha256,a.sourceId]),before[0].map(a=>[a.id,a.usageState,a.sha256,a.sourceId]));assert.ok(after[0].every(a=>a.state==='QUARANTINED'));assert.deepEqual(after[1],before[1]);assert.deepEqual(after.slice(3),before.slice(3));assert.ok(before[3].length>=3);
  assert.equal(await restored.talentSession.count({where:{revokedAt:null}}),0);assert.equal(await restored.talentAccessGrant.count({where:{state:'ACTIVE'}}),0);
  const app=new Application(store,recoveryConfig,clock);assert.equal((await app.handle({method:'GET',url:'/api/v1/portal/me',ip:'synthetic-restore',headers:{cookie:'once_talent_session='+oldToken}})).status,503);
  const u=await restored.mediaUpload.findUniqueOrThrow({where:{id:stagedId}});await assert.rejects(store.transaction(tx=>app.media.staged(tx,{actorKind:'TALENT',workspaceId:u.workspaceId,talentAccountId:u.talentAccountId,sessionEpoch:u.actorEpoch,sessionId:''},stagedId)));
  return {assets:media.assetCount,bytes:media.totalBytes,checks:['collection-order-cover-current-tags-preserved-through-physical-restore-without-reviving-grants','real-pg-dump-restore-preserves-staged-adopted-relations-and-uploader','private-original-preview-backup-restore-hash-verified','real-recovery-prepare-quarantines-bytes-revokes-grants-sessions-preserves-usage','old-portal-cookie-and-staged-authorization-rejected-after-restore']};
 }finally{await store.close();}
}
