import {registeredTemp} from '../../scripts/registered-temp.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {Application} from '../../packages/core/src/api.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import {FakeClock,Client,SYNTHETIC_PASSWORD} from '../support/fixtures.ts';
import {FaultStore} from '../support/fault-store.ts';
import {localeTransfer,eraseImportedLocaleSource} from '../support/locale-transfer.ts';
import {inspectLocaleIntegrity} from '../../packages/core/src/locale-integrity.ts';
import {digest} from '../../packages/core/src/json.ts';
test('locale transfer actual three PostgreSQL databases and CLI preserve provenance with rollback and explicit re-review',async()=>{
 assert.equal(process.env.ALLOW_TD2_DB_TESTS,'yes');
 const checked=(name:string,prefix:string)=>{const raw=process.env[name];assert.ok(raw);const url=new URL(raw);assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));assert.match(url.pathname,new RegExp('^/'+prefix+'[a-z0-9_]+$'));return raw;};
 const sourceUrl=checked('DATABASE_URL_TD2_TEST','once_test_td2_locale_'),targetUrl=checked('DATABASE_URL_LOCALE_REBUILD_TEST','once_rebuild_locale_'),restoreUrl=checked('DATABASE_URL_LOCALE_RESTORE_TEST','once_restore_locale_');assert.notEqual(sourceUrl,targetUrl);assert.notEqual(targetUrl,restoreUrl);
 const sourceClient=new PrismaClient({datasources:{db:{url:sourceUrl}},log:[]}),targetClient=new PrismaClient({datasources:{db:{url:targetUrl}},log:[]}),sourceStore=new PrismaStore(sourceClient),targetStore=new PrismaStore(targetClient),tmp=registeredTemp().path,clock=new FakeClock();
 const app=(store:PrismaStore)=>new Application(store,{origin:'https://locale-transfer.test.invalid',secureCookies:true,contactKey:randomBytes(32),csrfKey:randomBytes(32),recoveryEpoch:randomBytes(24).toString('hex'),accessMode:'INTERNAL',environment:'test',dataEgressMode:'INTERNAL_APPROVED',dataCleanupMode:'INTERNAL_APPROVED',dataMergeMode:'INTERNAL_APPROVED'},clock);
 try{
  assert.equal(await sourceClient.workspace.count(),0);assert.equal(await targetClient.workspace.count(),0);
  const sourceApp=app(sourceStore),targetApp=app(targetStore),ids=await sourceApp.identity.bootstrap('owner','合成语言导出源',SYNTHETIC_PASSWORD);await targetApp.identity.bootstrap('owner','合成语言重建目标',SYNTHETIC_PASSWORD);const owner=new Client(sourceApp);assert.equal((await owner.login()).status,200);
  const t=await localeTransfer({app:sourceApp,store:sourceStore,clock,owner},true),rebuild=new JsonRebuild(clock),actor=await targetStore.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
  const faults=new FaultStore(targetStore);let fired=false;faults.afterInsert=(table,row)=>{if(table==='audits'&&'action' in row&&row.action==='rebuild.apply'){fired=true;throw new Error('synthetic locale rebuild audit failure');}};
  await assert.rejects(faults.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'CLI'})),(e:any)=>e.code==='STORE_UNAVAILABLE');assert.equal(fired,true);assert.equal(await targetClient.localeText.count(),0);assert.equal(await targetClient.sourceRecord.count(),0);
  const file=join(tmp,'locale.json');writeFileSync(file,JSON.stringify(t.download.payload),{mode:0o600});
  const command=['--experimental-strip-types','scripts/rebuild-export.ts','--input',file,'--actor-login','owner','--expected-sha256',digest(t.download.payload)];
  for(const apply of [false,true]){const r=spawnSync(process.execPath,[...command,...apply?['--apply']:[]],{encoding:'utf8',timeout:120000,env:{...process.env,DATABASE_URL_REBUILD:targetUrl,ALLOW_REBUILD:'yes'}});assert.equal(r.status,0,r.stderr.slice(-2000));const report=JSON.parse(r.stdout);assert.equal(report.localeTexts,3);assert.equal(report.localeDependencies,7);}
  for(const original of t.download.payload.manifest.locales.texts){const row=await targetClient.localeText.findUniqueOrThrow({where:{id:original.id}});assert.equal(row.text,original.text);assert.equal(row.state,'DRAFT');assert.equal(row.reviewedBy,null);assert.equal(row.originalReviewMembershipId,ids.membershipId);assert.equal(row.originalReviewWorkspaceId,ids.workspaceId);assert.equal(row.originalReviewTextDigest,digest(original.text));assert.deepEqual((row.importedBasis as any).dependencies,original.dependencies);assert.equal(await targetClient.localeDependency.count({where:{localeTextId:row.id}}),row.id===t.localeIds[0]?3:2);assert.deepEqual(row.mergeHistory,original.mergeHistory);if(row.id===t.localeIds[0])assert.deepEqual((await targetClient.localeDependency.findMany({where:{localeTextId:row.id,kind:'SOURCE'},orderBy:{sourceId:'asc'}})).map(d=>d.sourceId),[t.sourceId,t.basisId].sort());}
  assert.equal((await targetClient.localeText.findUniqueOrThrow({where:{id:t.localeIds[0]}})).mergeHistory instanceof Array,true);
  const report=await targetStore.transaction(tx=>inspectLocaleIntegrity(tx,actor.workspaceId));assert.equal(report.relationFailures,0);
  const row=await targetClient.localeText.findUniqueOrThrow({where:{id:t.localeIds[0]}});await assert.rejects(targetClient.localeText.update({where:{id:row.id},data:{originalReviewTextDigest:null}}));await assert.rejects(targetClient.localeText.update({where:{id:row.id},data:{importedBasis:{workspaceId:null,sourceDigest:'a'.repeat(64),textDigest:'b'.repeat(64),dependencies:[]}}}));
  const targetOwner=new Client(targetApp);assert.equal((await targetOwner.login()).status,200);const get=await targetOwner.raw('GET','/locale-texts/'+row.id);assert.equal(get.status,200);assert.equal((get.body as any).needsReview,true);assert.equal((get.body as any).originalReview.matchesCurrentText,true);
  const dump=join(tmp,'locale-import.dump'),pgEnv=(raw:string)=>{const u=new URL(raw);return {...process.env,PGHOST:u.hostname,PGPORT:u.port,PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:u.pathname.slice(1)};};
  const dumped=spawnSync('pg_dump',['--format=custom','--file',dump],{env:pgEnv(targetUrl),encoding:'utf8',timeout:120000});assert.equal(dumped.status,0,dumped.stderr.slice(-1000));
  const restored=spawnSync('pg_restore',['--no-owner','--no-acl','--dbname',new URL(restoreUrl).pathname.slice(1),dump],{env:pgEnv(restoreUrl),encoding:'utf8',timeout:120000});assert.equal(restored.status,0,restored.stderr.slice(-1000));
  const restoredClient=new PrismaClient({datasources:{db:{url:restoreUrl}},log:[]}),restoredStore=new PrismaStore(restoredClient);
  try{assert.deepEqual(await restoredClient.localeText.findMany({orderBy:{id:'asc'}}),await targetClient.localeText.findMany({orderBy:{id:'asc'}}));assert.deepEqual(await restoredClient.localeDependency.findMany({orderBy:{id:'asc'}}),await targetClient.localeDependency.findMany({orderBy:{id:'asc'}}));assert.equal((await restoredStore.transaction(tx=>inspectLocaleIntegrity(tx,actor.workspaceId))).relationFailures,0);}finally{await restoredStore.close();}
  console.log('PASS imported locale actual pg_dump/pg_restore: exact bodies, original review attribution, original basis and current typed dependencies survive; integrity inspection passes');
  await eraseImportedLocaleSource({app:targetApp,store:targetStore,clock,owner:targetOwner},t.basisId);
  console.log('PASS locale v3 real source permissions -> export -> CLI preview/apply; original review and exact basis preserved; local review remains unset; audit failure rolls back all inserted rows; database provenance constraints enforced');
 }finally{await sourceStore.close();await targetStore.close();rmSync(tmp,{recursive:true,force:true});}
});
