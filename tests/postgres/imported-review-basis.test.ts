import {registeredTemp} from '../../scripts/registered-temp.mjs';
/** Real SQL writes, retained 71->72 and physical restore. Historical IDs are not live FKs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtempSync,mkdirSync,copyFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
import {MemoryStore} from '../support/memory-store.ts';
import {authFixture} from '../support/talent-auth.ts';
import {sourceInput,result} from '../support/fixtures.ts';
import {TalentBasisTransferSchema} from '../../packages/core/src/rebuild-validation.ts';
import {reviewBasisSnapshot,consentBasisSnapshot,malformedReviewSnapshots} from '../support/imported-review-basis.ts';
test('migration72 rejects malformed imported INTERNAL_REVIEW, preserves retained71 data through the current schema and survives pg_dump/restore',async()=>{
 const raw=process.env.DATABASE_URL_IMPORTED_REVIEW_TEST;assert.equal(process.env.ALLOW_DB_TESTS,'yes');assert.ok(raw);const u=new URL(raw);assert.ok(['localhost','127.0.0.1'].includes(u.hostname));assert.match(u.pathname,/^\/once_test_[a-z0-9_]+$/);
 const db=new PrismaClient({datasources:{db:{url:raw}},log:[]}),tmp=registeredTemp().path;
 const run=(cmd:string,args:string[],url=raw)=>{const r=spawnSync(cmd,args,{env:{...process.env,DATABASE_URL:url},encoding:'utf8',timeout:120000});assert.equal(r.status,0,'isolated database operation failed');};
 const deploy=(schema:string)=>run('pnpm',['exec','prisma','migrate','deploy','--schema',schema]);
 try{
  assert.equal((await db.$queryRawUnsafe<any[]>("SELECT tablename FROM pg_tables WHERE schemaname='public'")).length,0);
  const names=readdirSync('prisma/migrations').filter(n=>/^\d/.test(n)).sort();assert.equal(names[71],'202610020004_imported_review_basis_shape');
  copyFileSync('prisma/schema.prisma',join(tmp,'schema.prisma'));mkdirSync(join(tmp,'migrations'));copyFileSync('prisma/migrations/migration_lock.toml',join(tmp,'migrations/migration_lock.toml'));
  for(const name of names.slice(0,71)){mkdirSync(join(tmp,'migrations',name));copyFileSync(join('prisma/migrations',name,'migration.sql'),join(tmp,'migrations',name,'migration.sql'));}deploy(join(tmp,'schema.prisma'));
  // Prepare only columns that existed on the historical schema, without
  // querying old tables through today's Prisma source/person models.
  const memory=new MemoryStore(),f=await authFixture(memory),w=memory.rows('workspaces')[0]!;
  const seed=async(table:string,row:object)=>{const columns=await db.$queryRawUnsafe<Array<{column_name:string}>>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",table),allowed=new Set(columns.map(c=>c.column_name));const data=Object.fromEntries(Object.entries(row).filter(([key])=>allowed.has(key)));await db.$executeRawUnsafe(`INSERT INTO "${table}" SELECT * FROM jsonb_populate_record(NULL::"${table}",$1::jsonb)`,JSON.stringify(data));};
  for(const table of ['workspaces','users','memberships','scopes','scopeMembers','dictionary','sessions'] as const)for(const row of memory.rows(table))await seed(table,row);
  const applied=await db.$queryRawUnsafe<any[]>('SELECT migration_name,checksum FROM _prisma_migrations ORDER BY migration_name');assert.equal(applied.length,71);
  const insert=async(value:any,kind='INTERNAL_REVIEW')=>{const id=randomUUID(),source=await f.owner.cmd('POST','/sources',sourceInput());assert.equal(source.status,201);const sourceId=result(source).resourceId;
   await seed('sources',memory.rows('sources').find(row=>row.id===sourceId)!);for(const row of memory.rows('sourceHistory').filter(row=>row.sourceId===sourceId))await seed('sourceHistory',row);
   await db.$transaction(async tx=>{await tx.$executeRawUnsafe('UPDATE sources SET "internalUseUntil"=$1::timestamptz WHERE id=$2::uuid','2026-10-15T00:00:00.000Z',sourceId);await tx.$executeRawUnsafe('INSERT INTO "sourceUseBases" (id,"workspaceId","createdAt","updatedAt",revision,"sourceId","consentId","consentRevision",purpose,"fieldScope",state,"validUntil","importedBasis","basisKind") VALUES ($1::uuid,$2::uuid,$3::timestamptz,$3::timestamptz,1,$4::uuid,NULL,$5,\'INTERNAL_DIRECTORY\',ARRAY[\'displayName\'],\'ACTIVE\',$6::timestamptz,$7::jsonb,$8)',id,w.id,f.clock.now().toISOString(),sourceId,kind==='TALENT_CONSENT'?1:null,'2026-10-15T00:00:00.000Z',JSON.stringify(value),kind);});return id;};
  const good=reviewBasisSnapshot(),consent=consentBasisSnapshot();const retained=[await insert(good),await insert(consent,'TALENT_CONSENT')];
  const before=await db.sourceUseBasis.findMany({orderBy:{id:'asc'}});deploy(resolve('prisma/schema.prisma'));await db.$disconnect();await db.$connect();assert.deepEqual(await db.sourceUseBasis.findMany({orderBy:{id:'asc'}}),before);const migrated=await db.$queryRawUnsafe<any[]>('SELECT migration_name,checksum FROM _prisma_migrations ORDER BY migration_name');assert.deepEqual(migrated.slice(0,71),applied);assert.deepEqual(migrated.map(row=>row.migration_name),names);
  const rejected:string[]=[];
  await assert.rejects(insert(good,'TALENT_CONSENT'),(e:any)=>e.code==='P2010'&&e.meta?.code==='23514'&&e.meta?.message?.includes('basis_imported_internal_review_shape'));
  rejected.push('review-json-cannot-masquerade-as-consent-column');
  const nul={...good,fieldScope:['\u0000']};assert.throws(()=>TalentBasisTransferSchema.parse(nul));await assert.rejects(insert(nul),(e:any)=>e.code==='P2010'&&e.meta?.code==='22P05');rejected.push('nul-text-json-boundary');
  for(const {name,value}of malformedReviewSnapshots()){
   assert.throws(()=>TalentBasisTransferSchema.parse(value),name);
   await assert.rejects(insert(value),(e:any)=>e.code==='P2010'&&e.meta?.code==='23514'&&e.meta?.message?.includes('basis_imported_internal_review_shape'),name);
   rejected.push(name);
  }
  for(const value of [good,{...good,fieldScope:['😀'.repeat(60)],validUntil:'2024-02-29T23:59:59.999Z'}]){assert.deepEqual(TalentBasisTransferSchema.parse(value),value);await insert(value);}
  for(const value of [consent,{...consent,version:'talent-basis-v2',fieldScope:['media','work']}]){assert.deepEqual(TalentBasisTransferSchema.parse(value),value);await insert(value,'TALENT_CONSENT');}
  assert.equal(await db.servicePrincipal.count(),0);assert.equal(await db.talentSubmission.count(),0);assert.equal(await db.sourceAttribution.count(),0);assert.equal(await db.talentConsent.count(),0);
  const adminUrl=new URL(raw);adminUrl.pathname='/postgres';const admin=new PrismaClient({datasources:{db:{url:adminUrl.toString()}},log:[]}),restoreUrl=new URL(raw);restoreUrl.pathname='/once_test_review_restore_'+randomBytes(5).toString('hex');
  try{
   await admin.$executeRawUnsafe(`CREATE DATABASE "${restoreUrl.pathname.slice(1)}"`);
   const pgEnv=(url:URL)=>({...process.env,PGHOST:url.hostname,PGPORT:url.port,PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:url.pathname.slice(1)});
   let p=spawnSync('pg_dump',['--format=custom','--file',join(tmp,'snapshot.dump')],{env:pgEnv(u),encoding:'utf8',timeout:120000});assert.equal(p.status,0,'pg_dump failed');
   p=spawnSync('pg_restore',['--no-owner','--no-acl','--dbname',restoreUrl.pathname.slice(1),join(tmp,'snapshot.dump')],{env:pgEnv(restoreUrl),encoding:'utf8',timeout:120000});assert.equal(p.status,0,'pg_restore failed');
   const restored=new PrismaClient({datasources:{db:{url:restoreUrl.toString()}},log:[]});try{
    assert.deepEqual(await restored.sourceUseBasis.findMany({orderBy:{id:'asc'}}),await db.sourceUseBasis.findMany({orderBy:{id:'asc'}}));
    for(const id of retained)await assert.rejects(restored.sourceUseBasis.update({where:{id},data:{basisKind:'INTERNAL_REVIEW',consentRevision:null,importedBasis:{...good,consentRevision:0}}}));
    assert.equal(await restored.servicePrincipal.count(),0);assert.equal(await restored.talentSubmission.count(),0);
   }finally{await restored.$disconnect();}
  }finally{await admin.$disconnect();}
  mkdirSync('artifacts/agent-ingestion-pr04a/finalization',{recursive:true});writeFileSync('artifacts/agent-ingestion-pr04a/finalization/imported-basis.json',JSON.stringify({status:'POSTGRES_TESTED',from:71,to:names.length,retainedRows:before.length,rejected,legitimateReviewAndConsent:true,schemaSqlParity:true,noFabricatedLiveSubjects:true,physicalDumpRestore:true,database:await db.$queryRawUnsafe('SELECT version()')},null,2)+'\n');
 }finally{await db.$disconnect();rmSync(tmp,{recursive:true,force:true});}
});
