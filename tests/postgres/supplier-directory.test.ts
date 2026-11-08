import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PrismaClient,Prisma} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {supplierFieldRootSql} from '../../apps/api/src/supplier-field-sql.ts';
import {Application} from '../../packages/core/src/api.ts';
import {Client} from '../support/fixtures.ts';
import {migrationFixture} from '../support/supplier-migration.ts';
import type {Store} from '../../packages/core/src/store.ts';
assert.equal(process.env.ALLOW_DB_TESTS,'yes');assert.ok(process.env.ONCE_RESOURCE_RUN_DIR);
const raw=process.env.DATABASE_URL_TEST;assert.ok(raw);const url=new URL(raw);assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/^\/once_test_[a-z0-9_]+$/);
test('more than 50,000 workspace facts: real SQL narrows candidate/role/source before the sentinel, preserving counts, pages, ANY/ALL and withdrawal',async()=>{
 const db=new PrismaClient({datasources:{db:{url:raw}},log:[]}),store=new PrismaStore(db);
 try{
  const f=await migrationFixture(store),template=await db.supplierFact.findFirstOrThrow({where:{personId:f.b.id,fieldCode:'role.started_year',status:'ACTIVE'}});
  // All normal metadata, FK and deferred group/choice triggers stay enabled.
  const seed=performance.now();await db.$executeRaw(Prisma.sql`WITH ids AS MATERIALIZED(SELECT gen_random_uuid() id FROM generate_series(1,50001))
   INSERT INTO "supplierFacts"(id,"workspaceId","createdAt","updatedAt",revision,"personId","personRoleId","roleCode","sourceId","sourceRevision","catalogVersion","setId","fieldCode","recordKey","componentCode","valueType","valueState","numberValue","booleanValue","dateValue","codeValue","textCiphertext",status,visibility)
   SELECT id,${f.ids.workspaceId}::uuid,${template.createdAt},${template.updatedAt},1,${f.a.id}::uuid,${f.a.role}::uuid,'director',${f.sourceA}::uuid,1,1,id,'role.started_year','single','value','NUMBER','KNOWN',2010,NULL,NULL,NULL,NULL,'ACTIVE','SELF_SHARED' FROM ids`);
  assert.ok(await db.supplierFact.count({where:{fieldCode:'role.started_year',status:'ACTIVE'}})>50000);
  const query={q:'合成重复人物',professional:{roleCode:'photographer',fields:[{fieldCode:'role.started_year',min:2016,max:2018}]},page:1,pageSize:1};
  const legacy:Store={transaction:fn=>store.transaction(tx=>fn({...tx,supplierFieldRoots:q=>tx.find('supplierFacts',{workspaceId:q.workspaceId,fieldCode:q.fieldCode,status:'ACTIVE',recordKey:'single'})})),close:async()=>{}};
  const oldClient=new Client(new Application(legacy,f.app.config,f.clock));oldClient.jar={...f.owner.jar};oldClient.csrf=f.owner.csrf;const before=await oldClient.raw('POST','/directory/talents/search',query);assert.equal(before.status,503);assert.equal((before.body as any).error.code,'FIELD_SEARCH_LIMIT');
  const started=performance.now(),result=f.ok(await f.owner.raw('POST','/directory/talents/search',query)),queryMs=performance.now()-started;assert.equal(result.total,1);assert.equal(result.items[0].id,f.b.id);assert.equal(f.ok(await f.owner.raw('POST','/directory/talents/search',{...query,page:2})).items.length,0);
  for(const [match,codes,total] of [['ALL',['steadicam','moco'],1],['ALL',['steadicam','trinity'],0],['ANY',['steadicam','trinity'],1]] as const){const r=f.ok(await f.owner.raw('POST','/directory/talents/search',{...query,professional:{roleCode:'photographer',fields:[{fieldCode:'camera.specialties',codes,match}]}}));assert.equal(r.total,total);}
  assert.equal(f.ok(await f.owner.raw('POST','/directory/talents/search',{...query,professional:{roleCode:'director',fields:[{fieldCode:'role.started_year',min:2010}]}})).total,0);
  const input={workspaceId:f.ids.workspaceId,personIds:[f.b.id],roleIds:[f.b.role],sourceIds:[f.sourceA,f.sourceB],fieldCode:'role.started_year',visibility:'SELF_SHARED' as const,owner:'ROLE' as const};assert.equal((await store.transaction(tx=>tx.supplierFieldRoots(input))).length,1);
  const plan=await db.$queryRaw(Prisma.sql`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${supplierFieldRootSql(input)}`);
  const source=await db.sourceRecord.findUniqueOrThrow({where:{id:f.sourceB}});f.ok(await f.owner.cmd('POST','/sources/'+source.id+'/suspend',{expectedRevision:source.revision,reason:'匿名来源撤回，相关专业事实不再命中'}));assert.equal(f.ok(await f.owner.raw('POST','/directory/talents/search',query)).total,0);
  mkdirSync('artifacts/once-upgrade/p04',{recursive:true});writeFileSync('artifacts/once-upgrade/p04/sql-scale.json',JSON.stringify({status:'PASSED',scope:'50,001 synthetic noise roots plus a narrow target; all PostgreSQL constraints enabled; one caller, no production capacity claim',seedMs:Math.round(started-seed),queryMs:Math.round(queryMs*100)/100,legacy:'FIELD_SEARCH_LIMIT',currentRows:1,total:1,secondPage:0,plan},null,2)+'\n');console.log('PASS narrow query over >50,000 facts; '+Math.round(queryMs)+'ms (single synthetic sample).');
 }finally{await store.close();}
});
