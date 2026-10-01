import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
import {fixture,createPerson,result} from '../support/fixtures.ts';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {Application} from '../../packages/core/src/api.ts';
const raw=process.env.DATABASE_URL_MEDIA_UPGRADE_TEST;assert.equal(process.env.ALLOW_DB_TESTS,'yes');assert.ok(raw);const u=new URL(raw);assert.ok(['localhost','127.0.0.1'].includes(u.hostname));assert.match(u.pathname,/^\/once_test_[a-z0-9_]+$/);
const db=new PrismaClient({datasources:{db:{url:raw}},log:[]}),root=mkdtempSync(join(tmpdir(),'once-media-upgrade-'));
try{
 assert.equal((await db.$queryRawUnsafe<any[]>("SELECT tablename FROM pg_tables WHERE schemaname='public'")).length,0);const names=readdirSync('prisma/migrations').filter(x=>/^\d/.test(x)).sort(),prior=names.slice(0,61);assert.equal(prior.at(-1),'202610010006_talent_submission_ownership');
 copyFileSync('prisma/schema.prisma',join(root,'schema.prisma'));mkdirSync(join(root,'migrations'));copyFileSync('prisma/migrations/migration_lock.toml',join(root,'migrations/migration_lock.toml'));for(const name of prior){mkdirSync(join(root,'migrations',name));copyFileSync(join('prisma/migrations',name,'migration.sql'),join(root,'migrations',name,'migration.sql'));}
 const deploy=(schema:string)=>{const r=spawnSync('pnpm',['exec','prisma','migrate','deploy','--schema',schema],{env:{...process.env,DATABASE_URL:raw},encoding:'utf8',timeout:120000});assert.equal(r.status,0,r.stderr);};deploy(join(root,'schema.prisma'));
 const f=await fixture();f.app.config.mediaEnabled=true;const personId=await createPerson(f.owner,'旧内部媒体人才',true),person=f.store.rows('people').find(x=>x.id===personId)!,source=f.store.rows('sources').find(x=>x.id===person.sourceId)!;
 const r=await f.owner.cmd('POST','/uploads',{sourceId:source.id,expectedSourceRevision:source.revision,personId,fileName:'old.png',mime:'image/png',expectedBytes:12,sha256:'a'.repeat(64)});assert.equal(r.status,201);const id=result(r).resourceId;
 await f.store.transaction(async tx=>{const a=await f.app.identity.authenticate(tx,f.owner.jar.once_session!);const u=await f.app.media.beginReceive(tx,a,id,12);await f.app.media.finishReceive(tx,a,id,u.receiveToken!,12,'a'.repeat(64));});await f.owner.cmd('POST','/uploads/'+id+'/complete',{expectedRevision:f.store.rows('uploads')[0]!.revision});const claim=await f.app.media.claim();assert.ok(claim);await f.app.media.finish(claim,{bytes:12,sha256:'a'.repeat(64),mime:'image/png',width:3,height:4,previewBytes:20,previewHash:'b'.repeat(64)});
 const tables=['workspaces','users','memberships','sessions','scopes','scopeMembers','dictionary','sources','sourceHistory','people','uploads','assets'] as const;
 for(const table of tables){const fields=await db.$queryRawUnsafe<Array<{column_name:string}>>('SELECT column_name FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=$1',table);const allowed=new Set(fields.map(x=>x.column_name));for(const row of f.store.rows(table)){const data=Object.fromEntries(Object.entries(row).filter(([key])=>allowed.has(key)));await db.$executeRawUnsafe(`INSERT INTO "${table}" SELECT * FROM jsonb_populate_record(NULL::"${table}",$1::jsonb)`,JSON.stringify(data));}}
 const before=await db.$queryRawUnsafe<any[]>('SELECT * FROM uploads ORDER BY id'),assets=await db.$queryRawUnsafe<any[]>('SELECT * FROM assets ORDER BY id');deploy(resolve('prisma/schema.prisma'));await db.$disconnect();await db.$connect();
 for(const [table,rows] of [['uploads',before],['assets',assets]] as const){const after=await db.$queryRawUnsafe<any[]>(`SELECT * FROM "${table}" ORDER BY id`);for(let i=0;i<rows.length;i++)for(const [key,value]of Object.entries(rows[i]!))assert.deepEqual(after[i]![key],value,table+'.'+key);}
 assert.equal((await db.mediaUpload.findUniqueOrThrow({where:{id}})).principalKind,'INTERNAL');assert.equal((await db.mediaAsset.findUniqueOrThrow({where:{id}})).usageState,'ADOPTED');assert.equal(await db.personMedia.count(),0);
 const store=new PrismaStore(db),app=new Application(store,f.app.config,f.clock);await store.transaction(async tx=>app.media.preview(tx,await app.identity.authenticate(tx,f.owner.jar.once_session!),id,{requestId:crypto.randomUUID(),ip:'test'}));
 mkdirSync('artifacts/talent-experience-pr03-staging',{recursive:true});writeFileSync('artifacts/talent-experience-pr03-staging/upgrade.json',JSON.stringify({status:'PASSED',fromMigrations:61,toMigrations:names.length,checks:['all-existing-upload-asset-columns-unchanged','legacy-internal-ready-maps-to-adopted-without-invented-submission','legacy-source-person-authorization-and-preview-still-work']},null,2)+'\n');
}finally{await db.$disconnect();rmSync(root,{recursive:true,force:true});}
