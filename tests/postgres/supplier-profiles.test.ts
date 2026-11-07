import assert from 'node:assert/strict';
import test from 'node:test';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {digest} from '../../packages/core/src/json.ts';
import {AiLedger} from '../../packages/core/src/ai-ledger.ts';
import {inspectAiLedger} from '../../packages/core/src/ai-ledger-integrity.ts';
import {verifySupplierProfiles} from '../support/supplier-profiles.ts';
const raw=process.env.DATABASE_URL_TEST;
assert.equal(process.env.ALLOW_DB_TESTS,'yes');assert.ok(process.env.ONCE_RESOURCE_RUN_DIR);assert.ok(raw);
const url=new URL(raw);assert.ok(['127.0.0.1','localhost'].includes(url.hostname));assert.match(url.pathname,/^\/once_test_[a-z0-9_]+$/);
test('real PostgreSQL self confirmation, provenance constraints and account isolation',async()=>{
 const db=new PrismaClient({datasources:{db:{url:raw}},log:[]}),store=new PrismaStore(db);
 try{
  assert.equal(await db.workspace.count(),0);
  const {f,personId,id,own}=await verifySupplierProfiles(store);
  const source=await db.sourceRecord.findFirstOrThrow({where:{confirmedByTalentId:f.a.accountId}});
  await assert.rejects(db.sourceRecord.update({where:{id:source.id},data:{confirmedByTalentId:f.b.accountId}}));
  await assert.rejects(db.talentSubmission.update({where:{id},data:{confirmedByTalentId:f.b.accountId}}));
  const grant=await db.talentAccessGrant.findFirstOrThrow({where:{personId}});
  await assert.rejects(db.talentAccessGrant.update({where:{id:grant.id},data:{confirmedByTalentId:null}}));
  assert.equal((await db.person.findUniqueOrThrow({where:{id:personId}})).displayName,'林光');
  const {claimId:unused,...input}=f.input;
  const draft=f.ok(await f.a.client.raw('POST','/portal/profile-drafts',{...input,grantId:own.grantId},f.headers()));
  const role=await db.personRole.findFirstOrThrow({where:{personId,roleCode:'director'}});
  const saved=f.ok(await f.a.client.raw('POST','/portal/submissions/'+draft.resourceId+'/works',{expectedRevision:draft.revision,works:[{clientItemKey:'db_case',mode:'CREATE_EXTERNAL_WORK',targetWorkId:null,expectedWorkRevision:null,personRoleId:role.id,declaredRoleCode:null,title:'数据库本人作品',description:'',caseDate:null,datePrecision:'UNKNOWN',location:'',industryCode:null,workTypeCodes:[],brandDisplayName:'',creditNote:'导演',coverAssetId:null,items:[]}]},f.headers()));
  f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+draft.resourceId+'/confirm',{expectedRevision:saved.revision,accepted:true},f.headers()));
  assert.equal((await db.workCredit.findFirstOrThrow()).personId,personId);
  const workspaceId=source.workspaceId,config={enabled:true,providerIdentityHash:digest('db-synthetic-provider'),configRevision:1,recoveryEpoch:f.app.config.recoveryEpoch,currency:'CNY',perTaskLimitUnits:100,dailyLimitUnits:1000,maxAttempts:1};
  const ledger=new AiLedger(f.clock),meta={requestId:crypto.randomUUID(),ip:'test'};
  const run=await store.transaction(tx=>ledger.reserve(tx,workspaceId,null,crypto.randomUUID(),digest('synthetic-document-input'),100,config,meta,{talentAccountId:f.a.accountId,actorEpoch:1}));
  const actual=await db.aiRun.findUniqueOrThrow({where:{id:run.id}});assert.equal(actual.actorId,null);assert.equal(actual.talentAccountId,f.a.accountId);assert.equal(actual.purpose,'SUPPLIER_DOCUMENT');
  await assert.rejects(db.aiRun.update({where:{id:run.id},data:{talentAccountId:f.b.accountId}}));
  const attempt=await store.transaction(tx=>ledger.begin(tx,workspaceId,run.id,config,meta));
  await store.transaction(tx=>ledger.unknown(tx,workspaceId,attempt.id,meta));
  await assert.rejects(store.transaction(tx=>ledger.begin(tx,workspaceId,run.id,config,meta)));
  assert.equal((await store.transaction(tx=>inspectAiLedger(tx,workspaceId))).relationFailures,0);

 }finally{await store.close();}
});
