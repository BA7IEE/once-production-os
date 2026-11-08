import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {homepageFixture,verifyHomepageErasure} from '../support/professional-homepages.ts';
import {inspectTalentIntegrity} from '../../packages/core/src/talent-v2-integrity.ts';
import {quarantineHomepages} from '../../packages/core/src/professional-homepage-lifecycle.ts';
import {assertHomepageErasureClean} from '../../packages/core/src/professional-homepage-lifecycle.ts';
import {FaultStore} from '../support/fault-store.ts';
import {Application} from '../../packages/core/src/api.ts';
import {Client} from '../support/fixtures.ts';
import {AppError} from '../../packages/core/src/errors.ts';

assert.equal(process.env.ALLOW_DB_TESTS,'yes');assert.ok(process.env.ONCE_RESOURCE_RUN_DIR);
const raw=process.env.DATABASE_URL_TEST;assert.ok(raw);const u=new URL(raw);assert.equal(u.hostname,'127.0.0.1');assert.match(u.pathname,/^\/once_test_[a-z0-9_]+$/);
test('PostgreSQL: homepage owner FKs, immutable identity/version, encrypted rollback, recovery and reviewed all-version erasure',async()=>{
 const db=new PrismaClient({datasources:{db:{url:raw}},log:[]}),store=new PrismaStore(db);
 try{
  const f=await homepageFixture(store,'director',true),before=await f.get();assert.equal((await db.$queryRawUnsafe('SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL'))[0].n,85);
  await f.publish();assert.equal((await f.publicRead()).status,200);
  const original=await db.homepageVersion.findFirstOrThrow(),root=await db.professionalHomepage.findUniqueOrThrow({where:{id:f.id}});
  await assert.rejects(db.homepageVersion.update({where:{id:original.id},data:{contentCiphertext:'forged'}}));
  await assert.rejects(db.homepageVersion.delete({where:{id:original.id}}));
  await assert.rejects(db.homepageVersion.update({where:{id:original.id},data:{state:'ERASED',contentCiphertext:null}}));
  await assert.rejects(db.professionalHomepage.update({where:{id:f.id},data:{slug:'z'.repeat(24)}}));
  await assert.rejects(db.professionalHomepage.update({where:{id:f.id},data:{state:'ERASED',draftCiphertext:null,currentVersionId:null}}));
  await assert.rejects(db.professionalHomepage.create({data:{...root,id:randomUUID(),personId:randomUUID(),slug:'a'.repeat(24),state:'DRAFT',currentVersionId:null}}));
  await assert.rejects(db.homepageVersion.create({data:{...original,id:randomUUID(),versionNumber:2,talentAccountId:f.b.accountId}}));
  const fault=new FaultStore(store);fault.afterInsert=(t,row)=>{if(t==='audits'&&'action' in row&&row.action==='portal.homepage.publish')throw new AppError(503,'AUDIT_FAILURE','synthetic homepage audit rollback');};
  const app=new Application(fault,f.app.config,f.clock),c=new Client(app);c.jar={...f.a.client.jar};c.csrf=f.a.client.csrf;
  const body={expectedRevision:(await f.get()).revision,previewDigest:f.ok(await f.a.client.raw('GET','/portal/homepages/'+f.id+'/preview',undefined,f.headers())).previewDigest,expiresAt:new Date(f.clock.now().getTime()+10*86400000).toISOString(),consentVersion:'once-public-homepage-v1',publicAccepted:true,mediaRightsAccepted:true,adultDeclared:true},key=randomUUID();
  assert.equal((await c.raw('POST','/portal/homepages/'+f.id+'/publish',body,f.headers(f.a,key))).status,503);assert.equal(await db.homepageVersion.count(),1);assert.equal(await db.talentConsent.count({where:{purpose:'PUBLIC_PROFILE'}}),1);
  fault.afterInsert=null;f.ok(await c.raw('POST','/portal/homepages/'+f.id+'/publish',body,f.headers(f.a,key)));assert.equal(f.ok(await c.raw('GET','/portal/commands/'+key,undefined,f.headers())).resourceId,f.id);
  assert.equal(await db.homepageVersion.count(),2);assert.equal((await f.get()).url,before.url);assert.equal((await db.homepageVersion.findUniqueOrThrow({where:{id:original.id}})).state,'REVOKED');
  const integrity=await store.transaction(tx=>inspectTalentIntegrity(tx,f.workspaceId,f.app.config.contactKey,f.clock));assert.equal(integrity.relationFailures,0);assert.equal(integrity.professionalFactFailures,0);
  for(const [kind,id] of [['PERSON',f.personId],['WORK',f.options.works[0].id],['ASSET',f.asset],['SOURCE',(await db.sourceRecord.findFirstOrThrow({where:{confirmedByTalentId:f.a.accountId}})).id]])await assert.rejects(store.transaction(tx=>assertHomepageErasureClean(tx,f.workspaceId,kind!,id!)),/个人主页/);
  await store.transaction(tx=>quarantineHomepages(tx,f.workspaceId,f.clock));assert.equal((await f.publicRead()).status,404);assert.equal((await f.get()).state,'UNPUBLISHED');
  await f.publish();await verifyHomepageErasure(f);assert.equal(await db.homepageVersion.count({where:{state:'ERASED',contentCiphertext:null}}),3);
  const freshDraft={...f.input,coverAssetId:null,works:[{creditId:f.options.works[1].credit.id,assetIds:[],externalUrl:'https://example.com/remaining-confirmed-case'}]},created=f.ok(await f.a.client.raw('POST','/portal/homepages',{personId:f.personId,draft:freshDraft},f.headers()));
  const fresh=f.ok(await f.a.client.raw('GET','/portal/homepages/'+created.resourceId,undefined,f.headers()));assert.notEqual(fresh.slug,before.slug);assert.equal((await f.publicRead()).status,404);
  const freshBody={...body,expectedRevision:fresh.revision,previewDigest:f.ok(await f.a.client.raw('GET','/portal/homepages/'+fresh.id+'/preview',undefined,f.headers())).previewDigest};f.ok(await f.a.client.raw('POST','/portal/homepages/'+fresh.id+'/publish',freshBody,f.headers()));assert.equal((await f.a.client.raw('GET','/public/homepages/'+fresh.slug)).status,200);assert.equal(await db.professionalHomepage.count({where:{personId:f.personId}}),2);
 }finally{await store.close();}
});
