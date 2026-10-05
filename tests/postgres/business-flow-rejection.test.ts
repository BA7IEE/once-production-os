import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {run} from '../../scripts/resource-lifecycle.mjs';
import {ingestionRejectionScenario} from '../support/ingestion-rejection.ts';
const raw=process.env.DATABASE_URL_TEST;assert.equal(process.env.ALLOW_DB_TESTS,'yes');assert.ok(process.env.ONCE_RESOURCE_RUN_DIR);assert.ok(raw);assert.match(new URL(raw).pathname,/^\/once_test_[a-z0-9_]+$/);
test('business flow PostgreSQL: stale rejection permissions, frozen payload, audit/receipt rollback and retention',async()=>{
 const db=new PrismaClient({datasources:{db:{url:raw}}});
 try{
  assert.equal((await db.$queryRawUnsafe<any[]>("SELECT tablename FROM pg_tables WHERE schemaname='public'")).length,0,'Owned empty DB only; never reset');
  await run('pnpm',['db:deploy'],{env:{...process.env,DATABASE_URL:raw},capture:true});
  const result=await ingestionRejectionScenario(new PrismaStore(db));
  const frozen=await db.talentSubmission.findFirstOrThrow({where:{principalKind:'MACHINE'}});
  for(const data of [{recoveryEpoch:'a'.repeat(48)},{payloadDigest:'0'.repeat(64)}])await assert.rejects(db.talentSubmission.update({where:{id:frozen.id},data}),error=>error instanceof Error&&/immutable|23514/.test(error.message));
  assert.deepEqual(await db.talentSubmission.findUniqueOrThrow({where:{id:frozen.id}}),frozen);
  result.checks.push('PostgreSQL-frozen-owner-and-payload-mutations-rejected-without-disabling-triggers');
  mkdirSync('artifacts/business-flow-review' ,{recursive:true});writeFileSync('artifacts/business-flow-review/rejection-postgres.json',JSON.stringify({head:process.env.ONCE_ACCEPTANCE_SHA,status:'DB_TESTED',...result,providerVerified:'NOT_RUN'},null,2)+'\n');
 }finally{await db.$disconnect();}
});
