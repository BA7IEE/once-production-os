import {AiLedger} from '../../packages/core/src/ai-ledger.ts';
import {digest} from '../../packages/core/src/json.ts';
/** A new empty database is first installed at the frozen pre-TD2 baseline, populated with
 * synthetic legacy records, then upgraded in place. No reset, db push or edited migration. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,readdirSync,copyFileSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
import {Application} from '../../packages/core/src/api.ts';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {passwordHash} from '../../packages/core/src/crypto.ts';
import {FakeClock,Client,SYNTHETIC_PASSWORD} from '../support/fixtures.ts';
import {expectResponse as ok} from '../support/talent-v2-maintenance.ts';

test('TD2-T17 populated frozen pre-TD2 baseline upgrades without rewriting business rows',async()=>{
 assert.equal(process.env.ALLOW_TD2_UPGRADE_TESTS,'yes');const raw=process.env.DATABASE_URL_TD2_UPGRADE_TEST;assert.ok(raw);const url=new URL(raw);
 assert.ok(['postgres:','postgresql:'].includes(url.protocol));assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));assert.match(url.pathname,/^\/once_test_td2_upgrade_[a-z0-9_]+$/);assert.equal(url.search,'');assert.equal(url.hash,'');
 const db=new PrismaClient({datasources:{db:{url:raw}},log:[]}),temp=mkdtempSync(join(tmpdir(),'once-frozen-upgrade-'));
 const migrations=resolve('prisma/migrations'),names=readdirSync(migrations).filter(x=>/^\d/.test(x)).sort(),old=names.filter(x=>x<'202609270001_talent_domain_v2');
 const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');const fingerprints=names.map(name=>[name,hash(join(migrations,name,'migration.sql'))]);
 const deploy=(schema:string)=>{const r=spawnSync('pnpm',['exec','prisma','migrate','deploy','--schema',schema],{env:{...process.env,DATABASE_URL:raw},encoding:'utf8',timeout:120000});assert.equal(r.status,0,(r.stdout+r.stderr).split(raw).join('[test database]'));};
 try{
  const tables=await db.$queryRawUnsafe<any[]>("SELECT tablename FROM pg_tables WHERE schemaname='public'");assert.equal(tables.length,0,'Upgrade fixture requires a genuinely empty new database');
  mkdirSync(join(temp,'migrations'));copyFileSync(resolve('prisma/schema.prisma'),join(temp,'schema.prisma'));copyFileSync(join(migrations,'migration_lock.toml'),join(temp,'migrations/migration_lock.toml'));
  for(const name of old){mkdirSync(join(temp,'migrations',name));copyFileSync(join(migrations,name,'migration.sql'),join(temp,'migrations',name,'migration.sql'));}
  deploy(join(temp,'schema.prisma'));
  assert.equal((await db.$queryRawUnsafe<any[]>('SELECT * FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')).length,old.length);
  const workspaceId=randomUUID(),userId=randomUUID(),membershipId=randomUUID(),scopeId=randomUUID(),sourceId=randomUUID(),single=randomUUID(),multiple=randomUUID(),shortlistId=randomUUID(),singleItem=randomUUID(),multiItem=randomUUID();
  const now='2026-09-23T08:00:00.000Z',base=(id=randomUUID())=>({id,workspaceId,createdAt:now,updatedAt:now,revision:1});
  // Table names are a fixed test allowlist; payloads are parameters, never interpolated SQL.
  const allowed=new Set(['workspaces','users','memberships','scopes','sources','dictionary','people','works','projects','shortlists','shortlistItems','uploads','assets']);
  const insert=async(table:string,row:Record<string,unknown>)=>{assert.ok(allowed.has(table));await db.$executeRawUnsafe(`INSERT INTO "${table}" SELECT * FROM jsonb_populate_record(NULL::"${table}", $1::jsonb)`,JSON.stringify(row));};
  await insert('workspaces',{id:workspaceId,name:'合成升级基线',createdAt:now,recoveryEpoch:'synthetic-upgrade-epoch'});
  await insert('users',{...base(userId),loginName:'owner',displayName:'合成升级管理员',passwordHash:await passwordHash(SYNTHETIC_PASSWORD),status:'ACTIVE',sessionEpoch:1});
  await insert('memberships',{...base(membershipId),userId,role:'ADMIN',extraPermissions:[],status:'ACTIVE'});
  await insert('scopes',{...base(scopeId),name:'合成旧范围',mode:'WORKSPACE'});
  await insert('sources',{...base(sourceId),scopeId,maintainerId:membershipId,title:'合成旧来源',type:'MANUAL',providerClaim:'合成升级验证',textPayload:'仅合成旧数据',basisMode:'INTERNAL_USE',basisDescription:'合成测试内部使用',validFrom:'2026-09-01T00:00:00Z',validUntil:'2027-09-01T00:00:00Z',status:'CONFIRMED',protectionEpoch:1,reviewedBy:membershipId,reviewedAt:now});
  for(const [namespace,codes]of [['role',['model','translator']],['city',['shenzhen']],['language',['en','zh']],['skill',['commercial']]] as const)for(const code of codes)await insert('dictionary',{...base(),namespace,code,labelZh:'合成 '+code,labelEn:code,status:'ACTIVE'});
  for(const [id,roles]of [[single,['model']],[multiple,['model','translator']]] as const)await insert('people',{...base(id),scopeId,sourceId,maintainerId:membershipId,displayName:id===single?'合成旧单职业':'合成旧多职业',aliases:['合成旧别名'],roles,cityCode:'shenzhen',languageCodes:['en','zh'],skillCodes:['commercial'],heightCm:175,intro:'合成旧原文保持',status:'ACTIVE',protectionEpoch:1});
  const assetId=randomUUID();
  await insert('uploads',{...base(assetId),actorId:membershipId,sourceId,scopeId,actorRevision:1,actorEpoch:1,sourceRevision:1,sourceEpoch:1,scopeRevision:1,personId:single,personScopeId:scopeId,personEpoch:1,personScopeRevision:1,fileName:'synthetic-upgrade.png',mime:'image/png',expectedHash:'a'.repeat(64),state:'READY',expectedBytes:30,expiresAt:'2026-09-24T08:00:00Z',renewals:0,attempts:1,receiveToken:randomUUID(),leaseToken:null,leaseUntil:null,errorCode:null,purgedAt:null});
  await insert('assets',{...base(assetId),uploadId:assetId,sourceId,scopeId,objectToken:randomUUID(),personId:single,fileName:'synthetic-upgrade.png',mime:'image/png',sha256:'a'.repeat(64),previewHash:'b'.repeat(64),state:'READY',bytes:30,width:3,height:3,previewBytes:30});
  await insert('works',{...base(),scopeId,sourceId,maintainerId:membershipId,title:'合成旧作品 UUID',description:'合成历史说明',origin:'EXTERNAL',originNote:'',status:'DRAFT',coverEntryId:null,industryCode:null,workTypeCodes:[]});
  await insert('projects',{...base(),scopeId,sourceId,maintainerId:membershipId,title:'合成旧项目 UUID',brief:'合成历史项目',locationNote:'',dateNote:'',reviewNote:'',status:'DRAFT'});
  await insert('shortlists',{...base(shortlistId),scopeId,maintainerId:membershipId,title:'合成旧候选名单',brief:''});
  for(const [id,personId,position]of [[singleItem,single,0],[multiItem,multiple,1]] as const)await insert('shortlistItems',{...base(id),shortlistId,personId,workId:null,position,note:'合成旧候选上下文',addedPersonRevision:1,addedPersonSourceRevision:1,addedWorkRevision:null,addedWorkSourceRevision:null});
  const before=new Map<string,any[]>();for(const table of allowed)before.set(table,await db.$queryRawUnsafe(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY id`));
  // Upgrade the same populated database through migration 52 and preserve an
  // actually unresolved AI reservation while applying the project party export permission constraints.
  const prior=names.filter(n=>n<'202609290004_project_party_export_fields');
  for(const name of prior.filter(n=>!old.includes(n))){mkdirSync(join(temp,'migrations',name));copyFileSync(join(migrations,name,'migration.sql'),join(temp,'migrations',name,'migration.sql'));}
  deploy(join(temp,'schema.prisma'));
  const aiStore=new PrismaStore(db),aiClock=new FakeClock(),ledger=new AiLedger(aiClock),aiConfig={enabled:true,providerIdentityHash:digest('synthetic upgrade provider'),configRevision:1,recoveryEpoch:'synthetic-upgrade-epoch',currency:'USD',perTaskLimitUnits:50,dailyLimitUnits:1000,maxAttempts:3},meta={requestId:randomUUID(),ip:'test'};
  const legacyAudits:object[]=[];
  await aiStore.transaction(async current=>{const tx={...current,insert:async(table:any,row:any)=>{if(table==='audits'){const {principalKind,talentAccountId,...legacy}=row;legacyAudits.push(legacy);}else await current.insert(table,row);}};const r=await ledger.reserve(tx,workspaceId,membershipId,randomUUID(),digest('synthetic upgrade input'),50,aiConfig,meta);const a=await ledger.begin(tx,workspaceId,r.id,aiConfig,meta);await ledger.unknown(tx,workspaceId,a.id,meta);});
  for(const row of legacyAudits)await db.$executeRawUnsafe('INSERT INTO "audits" SELECT * FROM jsonb_populate_record(NULL::"audits", $1::jsonb)',JSON.stringify(row));
  const aiBefore=JSON.stringify({budgets:await db.aiBudget.findMany(),runs:await db.aiRun.findMany(),attempts:await db.aiAttempt.findMany()});
  const brandId=randomUUID(),linkId=randomUUID(),projectId=(await db.project.findFirstOrThrow()).id;
  await db.brand.create({data:{...base(brandId),sourceId,scopeId,name:'升级保留品牌',organizationId:null,status:'ACTIVE'}});
  await db.projectParty.create({data:{...base(linkId),projectId,clientOrganizationId:null,brandId}});
  const partiesBefore=JSON.stringify({brands:await db.brand.findMany(),links:await db.projectParty.findMany()});
  deploy(resolve('prisma/schema.prisma'));
  assert.equal(JSON.stringify({brands:await db.brand.findMany(),links:await db.projectParty.findMany()}),partiesBefore);
  assert.equal(JSON.stringify({budgets:await db.aiBudget.findMany(),runs:await db.aiRun.findMany(),attempts:await db.aiAttempt.findMany()}),aiBefore);
  assert.equal(await db.aiConnection.count(),0);assert.equal(await db.aiResponseMetadata.count(),0);assert.equal(await db.aiApproval.count(),0);assert.equal(await db.aiReconciliation.count(),0);assert.equal(await db.aiBudgetRelease.count(),0);

  for(const [table,rows]of before){const after=await db.$queryRawUnsafe<any[]>(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY id`);assert.equal(after.length,rows.length+(table==='dictionary'?14:0),table);const byId=new Map(after.map(r=>[r.row.id,r.row]));for(const previous of rows){assert.ok(byId.has(previous.row.id),table+' preserved ID');for(const [key,value]of Object.entries(previous.row))assert.deepEqual(byId.get(previous.row.id)[key],value,table+'.'+key);}if(table==='dictionary'){const original=new Set(rows.map(r=>r.row.id));const added=after.filter(r=>!original.has(r.row.id));assert.ok(added.every(r=>['nationality','roleStyle','roleService'].includes(r.row.namespace)));}}
  const applied=await db.$queryRawUnsafe<any[]>('SELECT migration_name,checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name');assert.deepEqual(applied.map(x=>[x.migration_name,x.checksum]),fingerprints);
  assert.equal(await db.talentProfile.count(),2);assert.equal(await db.personRole.count(),3);assert.equal(await db.personCapability.count(),2);assert.equal(await db.personLanguage.count(),4);assert.equal(await db.talentLocation.count(),2);assert.equal(await db.measurementSet.count(),0);assert.equal(await db.castingProfile.count(),0);
  for(const row of await db.personCapability.findMany()){assert.equal(row.personRoleId,null);assert.equal(row.levelCode,null);assert.equal(row.sourceId,sourceId);}
  for(const row of await db.personLanguage.findMany()){assert.equal(row.speakingLevelCode,null);assert.equal(row.listeningLevelCode,null);assert.equal(row.readingLevelCode,null);assert.equal(row.writingLevelCode,null);assert.equal(row.verifiedAt,null);assert.equal(row.sourceId,sourceId);}
  for(const row of await db.talentLocation.findMany()){assert.equal(row.relationCode,'BASE');assert.equal(row.sourceId,sourceId);}
  const bound=await db.shortlistItem.findUniqueOrThrow({where:{id:singleItem}}),pending=await db.shortlistItem.findUniqueOrThrow({where:{id:multiItem}});assert.equal(bound.roleContextState,'BOUND');assert.equal((await db.personRole.findUniqueOrThrow({where:{id:bound.personRoleId!}})).personId,single);assert.equal(pending.roleContextState,'LEGACY_REVIEW');assert.equal(pending.personRoleId,null);
  const reviews=await db.talentMigrationReview.findMany();assert.equal(reviews.length,3);assert.ok(reviews.every(r=>r.state==='PENDING'));assert.equal(reviews.filter(r=>r.reason==='HEIGHT_SEMANTICS_REQUIRED').length,2);assert.equal(reviews.find(r=>r.reason==='SHORTLIST_ROLE_REQUIRED')?.shortlistItemId,multiItem);
  const app=new Application(new PrismaStore(db),{origin:'https://upgrade.test.invalid',secureCookies:true,contactKey:randomBytes(32),csrfKey:randomBytes(32),recoveryEpoch:'synthetic-upgrade-epoch',accessMode:'INTERNAL',environment:'test',dataEgressMode:'INTERNAL_APPROVED',dataCleanupMode:'INTERNAL_APPROVED',dataMergeMode:'INTERNAL_APPROVED'},new FakeClock()),owner=new Client(app);ok(await owner.login(),200);
  const ids=(body:any)=>body.items.map((x:any)=>x.id).sort();for(const [legacy,typed]of [['role=model','role=model'],['role=translator','role=translator'],['languageCode=en','language=en'],['cityCode=shenzhen','location=shenzhen&locationRelation=BASE']])assert.deepEqual(ids(ok(await owner.raw('GET','/people?'+legacy),200)),ids(ok(await owner.raw('GET','/td2/people?'+typed),200)));
  assert.equal(ok(await owner.raw('GET','/td2/people?heightMin=170'),200).total,0);assert.equal(ok(await owner.raw('GET','/td2/people?language=en&languageLevel=WORKING'),200).total,0);
  assert.deepEqual(names.map(name=>[name,hash(join(migrations,name,'migration.sql'))]),fingerprints);
 }finally{await db.$disconnect();rmSync(temp,{recursive:true,force:true});}
});
