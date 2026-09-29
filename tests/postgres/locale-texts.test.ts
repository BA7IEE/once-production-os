import {verifyAiLedger} from '../support/ai-ledger.ts';
import {verifyLocaleMerge} from '../support/locale-merge.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {Application} from '../../packages/core/src/api.ts';
import {FakeClock,Client,SYNTHETIC_PASSWORD} from '../support/fixtures.ts';
import {verifyLocaleTexts,verifyLocaleDeletion} from '../support/locale-texts.ts';
test('internal locale typed graph and actual PostgreSQL deferred constraints',async()=>{
 assert.equal(process.env.ALLOW_TD2_DB_TESTS,'yes');const raw=process.env.DATABASE_URL_TD2_TEST;assert.ok(raw);const url=new URL(raw);assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));assert.match(url.pathname,/^\/once_test_td2_locale_[a-z0-9_]+$/);
 const client=new PrismaClient({datasources:{db:{url:raw}},log:[]}),store=new PrismaStore(client),clock=new FakeClock();
 try{
  assert.equal(await client.workspace.count(),0);const app=new Application(store,{origin:'https://locale.test.invalid',secureCookies:true,contactKey:randomBytes(32),csrfKey:randomBytes(32),recoveryEpoch:randomBytes(24).toString('hex'),accessMode:'INTERNAL',environment:'test',dataEgressMode:'INTERNAL_APPROVED',dataCleanupMode:'INTERNAL_APPROVED',dataMergeMode:'INTERNAL_APPROVED'},clock);
  await app.identity.bootstrap('owner','合成内部文本验收',SYNTHETIC_PASSWORD);const owner=new Client(app);assert.equal((await owner.login()).status,200);
  const {created}=await verifyLocaleTexts({app,store,clock,owner},503);
  const row=await client.localeText.findUniqueOrThrow({where:{id:created[0]}}),dep=await client.localeDependency.findFirstOrThrow({where:{localeTextId:row.id,kind:'PERSON'}});
  await assert.rejects(client.localeText.create({data:{...row,id:randomUUID(),locale:'zh'}})); // no dependency graph at commit
  await assert.rejects(client.localeDependency.delete({where:{id:dep.id}})); // required root cannot disappear
  await assert.rejects(client.localeDependency.update({where:{id:dep.id},data:{kind:'SOURCE',sourceSubjectId:null}}));
  await assert.rejects(client.localeText.update({where:{id:row.id},data:{state:'ERASED',text:'',reviewedBy:null,reviewedAt:null}})); // erase graph atomically
  await assert.rejects(client.localeText.update({where:{id:row.id},data:{personId:null}}));
  assert.equal(await client.localeText.count(),3);assert.equal(await client.localeDependency.count(),6);
  await assert.rejects(client.localeDependency.update({where:{id:dep.id},data:{localeTextId:created[1]}}));
  for(const kind of ['SOURCE','PERSON','WORK','PROJECT'] as const)await verifyLocaleDeletion({app,store,clock,owner},kind);
  const merged=await verifyLocaleMerge({app,store,clock,owner},503);
  await assert.rejects(client.localeText.update({where:{id:merged.current.id},data:{mergeHistory:[]}}));
  const saved=await client.localeText.findUniqueOrThrow({where:{id:merged.current.id}});assert.equal((saved.mergeHistory as any[]).length,2);
  const forged=structuredClone(saved.mergeHistory) as any[];forged[0].text='changed immutable original';
  await assert.rejects(client.localeText.update({where:{id:saved.id},data:{mergeHistory:forged}}));
  const ledger=await verifyAiLedger(store,clock);
  await assert.rejects(client.aiAttempt.update({where:{id:ledger.attempt.id},data:{providerIdempotencyKey:randomUUID()}}));
  await assert.rejects(client.aiAttempt.delete({where:{id:ledger.attempt.id}}));
  await assert.rejects(client.aiRun.update({where:{id:ledger.run.id},data:{settledUnits:0}}));
  const budget=await client.aiBudget.findFirstOrThrow();
  await assert.rejects(client.aiBudget.update({where:{id:budget.id},data:{reservedUnits:1}}));
  await assert.rejects(client.aiBudget.update({where:{id:budget.id},data:{frozen:false}}));
 }finally{await store.close();}
});
