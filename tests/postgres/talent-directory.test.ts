import {verifyDirectoryFinalization} from '../support/talent-directory-finalization.ts';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,realpath,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {Application} from '../../packages/core/src/api.ts';
import {FakeClock,Client,SYNTHETIC_PASSWORD} from '../support/fixtures.ts';
import {verifyDirectoryLifecycle} from '../support/talent-directory-lifecycle.ts';
test('PR01b real PostgreSQL new fields, private cover, typed transfer, recovery, merge and erasure',async()=>{
 assert.equal(process.env.ALLOW_TD2_DB_TESTS,'yes');const urls=[process.env.DATABASE_URL_TD2_TEST,process.env.DATABASE_URL_DIRECTORY_REBUILD_TEST];assert.notEqual(urls[0],urls[1]);
 for(const raw of urls){assert.ok(raw);const u=new URL(raw);assert.ok(['postgres:','postgresql:'].includes(u.protocol));assert.ok(['localhost','127.0.0.1','[::1]'].includes(u.hostname));assert.match(u.pathname,/^\/once_test_td2_[a-z0-9_]+$/);assert.ok(u.username&&u.password&&!u.search&&!u.hash);}
 const stores=urls.map(url=>new PrismaStore(new PrismaClient({datasources:{db:{url}},log:[]}))),clock=new FakeClock(),root=await mkdtemp(join(await realpath(tmpdir()),'once-pg-pr01b-'));
 try{const contexts=[];for(const store of stores){assert.equal(await store.client.workspace.count(),0);const app=new Application(store,{origin:'https://pr01b.test.invalid',secureCookies:true,contactKey:randomBytes(32),csrfKey:randomBytes(32),recoveryEpoch:randomBytes(24).toString('hex'),accessMode:'INTERNAL',environment:'test',dataEgressMode:'INTERNAL_APPROVED',dataCleanupMode:'INTERNAL_APPROVED',dataMergeMode:'INTERNAL_APPROVED'},clock);await app.identity.bootstrap('owner','合成目录管理员',SYNTHETIC_PASSWORD);const owner=new Client(app);assert.equal((await owner.login()).status,200);contexts.push({app,store,clock,owner});}
 const result=await verifyDirectoryLifecycle(contexts[0]!,contexts[1]!,root);
 const restoreUrl=process.env.DATABASE_URL_DIRECTORY_RESTORE_TEST;assert.ok(restoreUrl);const restore=new URL(restoreUrl);assert.ok(['postgresql:','postgres:'].includes(restore.protocol));assert.ok(['127.0.0.1','localhost','[::1]'].includes(restore.hostname));assert.match(restore.pathname,/^\/once_restore_pr01b_[a-z0-9_]+$/);assert.ok(restore.username&&restore.password&&!restore.search&&!restore.hash);assert.ok(!urls.includes(restoreUrl));
 const restored=new PrismaStore(new PrismaClient({datasources:{db:{url:restoreUrl}},log:[]}));
 try{assert.equal((await restored.client.$queryRawUnsafe<any[]>("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).length,0);
 const pgEnv=(raw:string)=>{const u=new URL(raw);return {...process.env,PGHOST:u.hostname,PGPORT:u.port,PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:u.pathname.slice(1)};},dump=join(root,'new-fields.dump');
 const a=spawnSync('pg_dump',['--format=custom','--file',dump],{env:pgEnv(urls[1]!),encoding:'utf8',timeout:120000});assert.equal(a.status,0,a.stderr.slice(-1000));const b=spawnSync('pg_restore',['--no-owner','--no-acl','--dbname',restore.pathname.slice(1),dump],{env:pgEnv(restoreUrl),encoding:'utf8',timeout:120000});assert.equal(b.status,0,b.stderr.slice(-1000));
 for(const model of ['talentProfile','personRole','measurementSet','castingProfile','mediaAsset','fieldEvidence','commandReceipt'] as const)assert.deepEqual(await restored.client[model].findMany({orderBy:{id:'asc'}} as never),await stores[1]!.client[model].findMany({orderBy:{id:'asc'}} as never),model+' physical restore');
 result.checks.push('actual-pg-dump-restore-new-fields-and-cover');
 }finally{await restored.close();}
const finalization=await verifyDirectoryFinalization(contexts[0]!);result.checks.push(...finalization.checks);
const versions=await stores[0]!.client.$queryRawUnsafe<any[]>('SELECT version()');await mkdir('artifacts/talent-experience-pr01b',{recursive:true});await writeFile('artifacts/talent-experience-pr01b/postgres-lifecycle.json',JSON.stringify({status:'PASSED',database:versions[0].version,...result},null,2)+'\n');console.log('PASS PR01b PostgreSQL: '+result.checks.join(', '));
 }finally{for(const store of stores)await store.close();await rm(root,{recursive:true,force:true});}
});
