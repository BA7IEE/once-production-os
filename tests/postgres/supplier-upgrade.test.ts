import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,mkdirSync,copyFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {PrismaClient} from '@prisma/client';
import {registeredTemp} from '../../scripts/registered-temp.mjs';
import {run} from '../../scripts/resource-lifecycle.mjs';
import {fixture,result,sourceInput} from '../support/fixtures.ts';
const raw=process.env.DATABASE_URL_TEST;
assert.equal(process.env.ALLOW_DB_TESTS,'yes');assert.ok(raw);assert.ok(process.env.ONCE_RESOURCE_RUN_DIR);
const url=new URL(raw);assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/^\/once_test_[a-z0-9_]+$/);

test('populated migration 75 upgrades forward without changing original data or applied checksums',async()=>{
 const db=new PrismaClient({datasources:{db:{url:raw}},log:[]}),temp=registeredTemp();
 try{
  assert.equal((await db.$queryRawUnsafe<any[]>("SELECT tablename FROM pg_tables WHERE schemaname='public'")).length,0);
  const names=readdirSync('prisma/migrations').filter(n=>/^\d/.test(n)).sort();assert.equal(names[74],'202610030001_business_flow');assert.equal(names.length,85);
  copyFileSync('prisma/schema.prisma',join(temp.path,'schema.prisma'));mkdirSync(join(temp.path,'migrations'));copyFileSync('prisma/migrations/migration_lock.toml',join(temp.path,'migrations/migration_lock.toml'));
  for(const name of names.slice(0,75)){mkdirSync(join(temp.path,'migrations',name));copyFileSync(join('prisma/migrations',name,'migration.sql'),join(temp.path,'migrations',name,'migration.sql'));}
  const deploy=async(schema:string)=>run('pnpm',['exec','prisma','migrate','deploy','--schema',schema],{env:{...process.env,DATABASE_URL:raw},capture:true,timeout:120000});
  await deploy(join(temp.path,'schema.prisma'));
  const f=await fixture(),sourceId=result(await f.owner.cmd('POST','/sources',sourceInput())).resourceId;
  const personId=result(await f.owner.cmd('POST','/people',{displayName:'升级前已存在的人',roles:['photographer'],sourceId})).resourceId;
  for(const table of ['workspaces','users','memberships','sessions','scopes','scopeMembers','dictionary','sources','sourceHistory','people','evidence','receipts','audits'] as const){
   const columns=await db.$queryRawUnsafe<Array<{column_name:string}>>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",table),allowed=new Set(columns.map(c=>c.column_name));
   for(const row of f.store.rows(table)){
    if(table==='dictionary'&&['screenwriter','lighting','colorist','sound','art_director','beijing','shanghai','hangzhou','chengdu'].includes(String((row as any).code)))continue;
    const data=Object.fromEntries(Object.entries(row).filter(([key])=>allowed.has(key)));
    await db.$executeRawUnsafe(`INSERT INTO "${table}" SELECT * FROM jsonb_populate_record(NULL::"${table}",$1::jsonb)`,JSON.stringify(data));
   }
  }
  const before=await db.$queryRawUnsafe<any[]>('SELECT * FROM sources'),people=await db.$queryRawUnsafe<any[]>('SELECT * FROM people'),history=await db.$queryRawUnsafe<any[]>('SELECT * FROM "sourceHistory"'),checksums=await db.$queryRawUnsafe<any[]>('SELECT migration_name,checksum FROM _prisma_migrations ORDER BY migration_name');
  await db.$disconnect();await deploy(resolve('prisma/schema.prisma'));await db.$connect();
  const after=await db.$queryRawUnsafe<any[]>('SELECT * FROM sources');for(const row of before)for(const [key,value] of Object.entries(row))assert.deepEqual(after.find(r=>r.id===row.id)[key],value);
  assert.deepEqual(await db.$queryRawUnsafe('SELECT * FROM people'),people);assert.equal(people[0].id,personId);
  const currentHistory=await db.$queryRawUnsafe<any[]>('SELECT * FROM "sourceHistory"');for(const row of history)for(const [key,value] of Object.entries(row))assert.deepEqual(currentHistory.find(r=>r.id===row.id)[key],value);
  const migrated=await db.$queryRawUnsafe<any[]>('SELECT migration_name,checksum FROM _prisma_migrations ORDER BY migration_name');assert.equal(migrated.length,85);assert.deepEqual(migrated.slice(0,75),checksums);
  for(const delegate of [db.supplierInboxBatch,db.projectRequirement,db.clientPresentation,db.clientVersion,db.clientRecipient,db.clientGuestSession,db.clientFeedback,db.professionalHomepage,db.homepageVersion])assert.equal(await delegate.count(),0,'new workflow tables must exist without inventing historical business records');
  assert.equal(await db.dictionaryItem.count({where:{namespace:'role',code:{in:['screenwriter','lighting','colorist','sound','art_director']}}}),5);
  assert.equal((await db.sourceRecord.findUniqueOrThrow({where:{id:sourceId}})).confirmedByTalentId,null);
 }finally{await db.$disconnect();temp.cleanup();}
});
