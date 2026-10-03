import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdirSync,copyFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {Application} from '../../packages/core/src/api.ts';
import {fixture,Client,sourceInput,result} from '../support/fixtures.ts';
import {run} from '../../scripts/resource-lifecycle.mjs';
import {registeredTemp} from '../../scripts/registered-temp.mjs';
import {expectResponse as ok} from '../support/talent-v2-maintenance.ts';
const raw=process.env.DATABASE_URL_TEST;
assert.equal(process.env.ALLOW_DB_TESTS,'yes');assert.ok(process.env.ONCE_RESOURCE_RUN_DIR);assert.ok(raw);
const url=new URL(raw);assert.ok(['127.0.0.1','localhost'].includes(url.hostname));assert.match(url.pathname,/^\/once_test_[a-z0-9_]+$/);
test('business flow on PostgreSQL: populated 74 migration upgrade or new empty installation, typed import and private review publication',async()=>{
 const db=new PrismaClient({datasources:{db:{url:raw}},log:[]}),temp=registeredTemp();
 try{
  assert.equal((await db.$queryRawUnsafe<any[]>("SELECT tablename FROM pg_tables WHERE schemaname='public'")).length,0);
  const names=readdirSync('prisma/migrations').filter(n=>/^\d/.test(n)).sort();assert.equal(names.at(-1),'202610030001_business_flow');assert.equal(names.length,75);
  const deploy=async(schema:string)=>run('pnpm',['exec','prisma','migrate','deploy','--schema',schema],{env:{...process.env,DATABASE_URL:raw},timeout:120000,capture:true});
  const upgrade=process.env.BUSINESS_FLOW_BASELINE==='74';
  if(upgrade){copyFileSync('prisma/schema.prisma',join(temp.path,'schema.prisma'));mkdirSync(join(temp.path,'migrations'));copyFileSync('prisma/migrations/migration_lock.toml',join(temp.path,'migrations/migration_lock.toml'));for(const name of names.slice(0,74)){mkdirSync(join(temp.path,'migrations',name));copyFileSync(join('prisma/migrations',name,'migration.sql'),join(temp.path,'migrations',name,'migration.sql'));}await deploy(join(temp.path,'schema.prisma'));}
  else await deploy(resolve('prisma/schema.prisma'));
  const f=await fixture(),sourceId=ok(await f.owner.cmd('POST','/sources',sourceInput()),201).resourceId;
  const batchId=ok(await f.owner.cmd('POST','/imports/preview',{sourceId,rows:[{displayName:'合成旧批次保留',roles:['model'],cityCode:'shenzhen'}]}),201).resourceId;
  ok(await f.owner.cmd('POST',`/imports/${batchId}/commit`,{expectedRevision:1,selectedRows:[0]}),202);await f.app.imports.process((await f.app.imports.claim())!);
  // Seed only columns actually present at the old baseline; keep the legacy checkpoint and receipts.
  for(const table of ['workspaces','users','memberships','sessions','scopes','scopeMembers','dictionary','sources','sourceHistory','people','evidence','imports','jobs','receipts','audits'] as const){
   const fields=await db.$queryRawUnsafe<Array<{column_name:string}>>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",table),allowed=new Set(fields.map(f=>f.column_name));
   for(const row of f.store.rows(table)){const data=Object.fromEntries(Object.entries(row).filter(([k])=>allowed.has(k)));await db.$executeRawUnsafe(`INSERT INTO "${table}" SELECT * FROM jsonb_populate_record(NULL::"${table}",$1::jsonb)`,JSON.stringify(data));}
  }
  const before=await db.$queryRawUnsafe<any[]>('SELECT * FROM imports ORDER BY id'),jobsBefore=await db.$queryRawUnsafe<any[]>('SELECT * FROM jobs ORDER BY id');
  if(upgrade)await deploy(resolve('prisma/schema.prisma'));
  const after=await db.$queryRawUnsafe<any[]>('SELECT * FROM imports ORDER BY id');for(let i=0;i<before.length;i++)for(const [key,value] of Object.entries(before[i]!))assert.deepEqual(after[i]![key],value,key);assert.equal(after[0].formatVersion,1);assert.deepEqual(await db.$queryRawUnsafe('SELECT * FROM jobs ORDER BY id'),jobsBefore);
  const store=new PrismaStore(db),app=new Application(store,f.app.config,f.clock);f.owner.app=app;
  const preview=ok(await f.owner.raw('GET',`/imports/${batchId}/upgrade-preview`),200),r=preview.rows[0];assert.equal(r.state,'READY');
  ok(await f.owner.cmd('POST',`/imports/${batchId}/upgrade`,{expectedRevision:preview.revision,confirm:true,entries:[{index:r.index,personId:r.personId,expectedPersonRevision:r.expectedPersonRevision,sourceRevision:r.sourceRevision}]}),200);
  const modern=ok(await f.owner.cmd('POST','/imports/preview',{schemaVersion:'once-talent-import-v2',sourceId,rows:[{displayName:'合成新批次模特',roles:['model'],cityCode:'shenzhen'},{displayName:'合成普通联系人',roles:[],kind:'CONTACT'}]}),201).resourceId;
  // Simulate an old binary checkpointing a new-format row without typed facts.
  const legacyOnly=ok(await f.owner.cmd('POST','/people',{displayName:'合成旧进程未建职业',roles:['model'],sourceId}),201).resourceId;
  await assert.rejects(db.$executeRawUnsafe(`UPDATE imports SET rows=jsonb_set(jsonb_set(rows,'{0,state}','"IMPORTED"'),'{0,personId}',to_jsonb($1::text)) WHERE id=$2::uuid`,legacyOnly,modern));
  ok(await f.owner.cmd('POST',`/imports/${modern}/commit`,{expectedRevision:1,selectedRows:[0,1]}),202);await app.imports.process((await app.imports.claim())!);
  assert.equal(ok(await f.owner.raw('POST','/directory/talents/search',{mode:'TALENT',role:'model',location:'shenzhen'}),200).total,2);assert.equal(ok(await f.owner.raw('POST','/directory/talents/search',{mode:'CONTACT'}),200).items.filter((p:any)=>p.displayName==='合成普通联系人').length,1);
  const make=async(name:string,role:string)=>{const member=ok(await f.owner.raw('POST','/memberships',{loginName:name,displayName:'合成 '+name,role,extraPermissions:[]}),201),client=new Client(app);ok(await client.activate(member.activationToken),200);ok(await client.login(name),200);return {id:member.membershipId,client};};
  const editor=await make('floweditor','EDITOR'),reviewer=await make('flowreviewer','REVIEWER'),personId=ok(await editor.client.cmd('POST','/directory/talents',{schemaVersion:'once-talent-experience-v1',displayName:'合成私有人才',kind:'TALENT'}),201).resourceId;
  const options=ok(await editor.client.raw('GET',`/people/${personId}/source-review-options`),200),scope=await store.transaction(tx=>tx.find('scopes',{mode:'WORKSPACE'}));
  const task=ok(await editor.client.cmd('POST',`/people/${personId}/source-reviews`,{expectedRevision:options.revision,expectedSourceRevision:options.sourceRevision,reviewerId:reviewer.id,publisherId:f.membershipId,targetScopeId:scope[0]!.id,expiresAt:'2026-09-29T00:00:00.000Z',acknowledgeLimitedAccess:true}),201).resourceId;
  assert.equal((await f.owner.raw('GET',`/directory/talents/${personId}`)).status,404);ok(await reviewer.client.cmd('POST',`/source-reviews/${task}/accept`,{expectedRevision:1}),200);
  ok(await reviewer.client.cmd('POST',`/source-reviews/${task}/review`,{expectedRevision:2,basisDescription:'合成团队内部使用核验',validUntil:'2026-12-31T00:00:00.000Z'}),200);
  const key=randomUUID(),body={expectedRevision:3,confirmScope:true};ok(await f.owner.cmd('POST',`/source-reviews/${task}/publish`,body,key),200);assert.equal(result(await f.owner.cmd('POST',`/source-reviews/${task}/publish`,body,key)).replayed,true);assert.equal((await f.owner.raw('GET',`/directory/talents/${personId}`)).status,200);
  mkdirSync('artifacts/business-flow',{recursive:true});writeFileSync(`artifacts/business-flow/postgres-${upgrade?'upgrade':'fresh'}.json`,JSON.stringify({status:'DB_TESTED',baseline:upgrade?74:0,migrations:75,checks:['legacy-columns-and-checkpoints-preserved','explicit-legacy-enrollment','typed-import-directory-filters','contact-distinction','private-review-publish','receipt-replay']},null,2)+'\n');
 }finally{await db.$disconnect();temp.cleanup();}
});
