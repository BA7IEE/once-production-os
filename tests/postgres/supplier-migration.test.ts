import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {Application} from '../../packages/core/src/api.ts';
import {newSystem,SYNTHETIC_PASSWORD} from '../support/fixtures.ts';
import {migrationFixture,verifySupplierMerge,exportSupplier,verifySupplierRebuild} from '../support/supplier-migration.ts';
import {registeredTemp} from '../../scripts/registered-temp.mjs';
import {digest} from '../../packages/core/src/json.ts';
assert.equal(process.env.ALLOW_DB_TESTS,'yes');assert.ok(process.env.ONCE_RESOURCE_RUN_DIR);
const raw=process.env.DATABASE_URL_TEST;assert.ok(raw);const url=new URL(raw);assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/^\/once_test_[a-z0-9_]+$/);
test('real PG: immutable fact move requires append-only decision; merge/export/CLI cross-key rebuild preserve history and current permissions',async()=>{
 const db=new PrismaClient({datasources:{db:{url:raw}},log:[]}),store=new PrismaStore(db),temp=registeredTemp();let targetStore:PrismaStore|undefined;
 const targetUrl=new URL(raw),name='once_rebuild_supplier_'+randomUUID().replaceAll('-','');targetUrl.pathname='/'+name;
 try{
  const f=await migrationFixture(store);await verifySupplierMerge(f);const payload=await exportSupplier(f);
  const fact=await db.supplierFact.findFirstOrThrow({where:{valueType:'NUMBER'}});await assert.rejects(db.supplierFact.update({where:{id:fact.id},data:{numberValue:1990}}));
  await assert.rejects(db.supplierFact.update({where:{id:fact.id},data:{personId:f.b.id,mergeDecisionId:randomUUID()}}));
  await db.$executeRawUnsafe('CREATE DATABASE "'+name+'"');
  const migrate=spawnSync('pnpm',['db:deploy'],{env:{...process.env,DATABASE_URL:targetUrl.toString()},encoding:'utf8',timeout:120000});assert.equal(migrate.status,0,'owned isolated target migrations must succeed');
  targetStore=new PrismaStore(new PrismaClient({datasources:{db:{url:targetUrl.toString()}},log:[]}));const initial=newSystem(),app=new Application(targetStore,initial.app.config,initial.clock);await app.identity.bootstrap('owner','匿名目标管理员',SYNTHETIC_PASSWORD);
  const sourceKey=join(temp.path,'source-key'),targetKey=join(temp.path,'target-key'),file=join(temp.path,'payload.json');writeFileSync(sourceKey,f.app.config.contactKey.toString('hex'),{mode:0o600});writeFileSync(targetKey,app.config.contactKey.toString('hex'),{mode:0o600});writeFileSync(file,JSON.stringify(payload),{mode:0o600});
  await verifySupplierRebuild(f,payload,{store:targetStore,app,clock:initial.clock,apply:async()=>{
   for(const apply of [false,true]){const run=spawnSync('pnpm',['--silent','rebuild:json','--','--input',file,'--actor-login','owner','--expected-sha256',digest(payload),...(apply?['--apply']:[])],{env:{...process.env,DATABASE_URL_REBUILD:targetUrl.toString(),REBUILD_SOURCE_CONTACT_KEY_FILE:sourceKey,CONTACT_KEY_FILE:targetKey,ALLOW_REBUILD:'yes'},encoding:'utf8',timeout:60000});assert.equal(run.status,0,run.stderr);assert.ok(JSON.parse(run.stdout).professionalRecords>0);}
  }});
  console.log('PASS supplier migration: actual PostgreSQL immutable constraints, audit rollback, per-field decisions, exact WorkCredit/Shortlist links, v16 source permits and real CLI check/apply under new workspace/key; no active grants imported.');
 }finally{await targetStore?.close();await store.close();temp.cleanup();}
});
