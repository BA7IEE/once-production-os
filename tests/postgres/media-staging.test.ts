import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {stagingScenario,stagingSecurityScenario,exportStagingScenario,stagingLifecycleScenario,stagingWorkerScenario,stagingConcurrencyScenario,unitOriginal,unitPreview} from '../support/media-staging.ts';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {authFixture} from '../support/talent-auth.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import {prepareRebuildMedia} from '../../scripts/rebuild-media.ts';
const url=process.env.DATABASE_URL_MEDIA_STAGING_TEST;
assert.ok(process.env.ALLOW_DB_TESTS==='yes'&&url&&new URL(url).pathname.startsWith('/once_test_'));
const db=new PrismaClient({datasources:{db:{url}},log:[]}),store=new PrismaStore(db);
try{
 assert.equal(await db.workspace.count(),0);
 if(process.env.MEDIA_STAGING_WORKER){const stop=process.env.MEDIA_STAGING_WORKER;assert.ok(stop==='grant'||stop==='withdraw'||stop==='consent'||stop==='recovery');console.log(JSON.stringify(await stagingWorkerScenario(store,stop)));}else if(process.env.MEDIA_STAGING_CONCURRENCY==='yes'){console.log(JSON.stringify(await stagingConcurrencyScenario(store)));}else if(process.env.MEDIA_STAGING_LIFECYCLE){const kind=process.env.MEDIA_STAGING_LIFECYCLE;assert.ok(kind==='merge'||kind==='adopted-merge'||kind==='delete'||kind==='expiry');const {checks}=await stagingLifecycleScenario(store,kind);console.log(JSON.stringify({checks}));}else if(process.env.MEDIA_STAGING_SECURITY==='yes'){const {checks}=await stagingSecurityScenario(store);console.log(JSON.stringify({checks}));}else{
 const {f,id,checks}=await stagingScenario(store,process.env.MEDIA_STAGING_ENROLL!=='yes');
 const u=await db.mediaUpload.findUniqueOrThrow({where:{id}});
 await assert.rejects(db.mediaUpload.update({where:{id},data:{actorId:(await db.membership.findFirstOrThrow()).id}}));checks.push('postgres-uploader-xor');
 await assert.rejects(db.mediaUpload.create({data:{...u,id:crypto.randomUUID(),talentAccountId:crypto.randomUUID()}}));checks.push('postgres-uploader-fk');
 await assert.rejects(db.mediaUpload.create({data:{...u,id:crypto.randomUUID(),talentAccountId:f.b.accountId}}));checks.push('postgres-submission-account-fk');
 await assert.rejects(db.mediaAsset.update({where:{id},data:{sourceId:f.sourceId}}));checks.push('postgres-immutable-asset-origin');
 await assert.rejects(db.mediaAsset.update({where:{id},data:{sha256:'f'.repeat(64)}}));checks.push('postgres-immutable-hash');
 await assert.rejects(db.mediaAsset.update({where:{id},data:{usageState:'STAGED'}}));checks.push('postgres-no-half-adoption');
 const payload=await exportStagingScenario(f,id);assert.equal(payload.manifest.talent.assets[0].id,id);checks.push('postgres-formal-media-export-with-source-basis-and-relation');
 if(process.env.MEDIA_STAGING_ENROLL!=='yes'){
  const target=new URL(url!),adminUrl=new URL(url!);adminUrl.pathname='/postgres';target.pathname='/once_test_media_rebuild_'+crypto.randomUUID().replaceAll('-','').slice(0,12);const admin=new PrismaClient({datasources:{db:{url:adminUrl.href}},log:[]});try{await admin.$executeRawUnsafe('CREATE DATABASE "'+target.pathname.slice(1)+'"');}finally{await admin.$disconnect();}
  const migrated=spawnSync('pnpm',['db:deploy'],{env:{...process.env,DATABASE_URL:target.href},encoding:'utf8',timeout:120000});assert.equal(migrated.status,0,migrated.stderr);
  const rebuilt=new PrismaStore(new PrismaClient({datasources:{db:{url:target.href}},log:[]})),root=mkdtempSync(join(tmpdir(),'once-media-pg-rebuild-'));try{const fixture=await authFixture(rebuilt);fixture.clock.value=f.clock.value;const rebuild=new JsonRebuild(fixture.clock),actor=await rebuilt.transaction(tx=>rebuild.actorFromTarget(tx,'owner')),input=join(root,'input');mkdirSync(input,{mode:0o700});writeFileSync(join(input,id+'.original.bin'),unitOriginal);writeFileSync(join(input,id+'.preview.jpg'),unitPreview);
   const verified=await prepareRebuildMedia(payload,actor.workspaceId,{REBUILD_MEDIA_INPUT_DIR:input,REBUILD_MEDIA_TARGET_DIR:join(root,'target')},true);await rebuilt.transaction(tx=>new JsonRebuild(fixture.clock,undefined,verified).apply(tx,actor,payload,{requestId:crypto.randomUUID(),ip:'test'}));assert.equal(await rebuilt.client.talentAccount.count(),0);assert.equal(await rebuilt.client.talentAccessGrant.count(),0);const relation=await rebuilt.client.personMedia.findFirstOrThrow();assert.equal(relation.usageState,'ADOPTED');assert.equal((relation.importedOrigin as any).talentAccountId,f.a.accountId);assert.equal((await rebuilt.client.mediaAsset.findFirstOrThrow()).sha256,(await db.mediaAsset.findUniqueOrThrow({where:{id}})).sha256);checks.push('postgres-json-rebuild-formal-multi-source-relation-and-bytes-without-auth');
  }finally{await rebuilt.close();rmSync(root,{recursive:true,force:true});}
 }
 console.log(JSON.stringify({checks}));}
}finally{await store.close();}
