import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {Application} from '../../packages/core/src/api.ts';
import {fixture} from '../support/fixtures.ts';
import {verifyBusinessIdentity} from '../support/business-flow-identity.ts';
import {run} from '../../scripts/resource-lifecycle.mjs';
const raw=process.env.DATABASE_URL_TEST;assert.equal(process.env.ALLOW_DB_TESTS,'yes');assert.ok(process.env.ONCE_RESOURCE_RUN_DIR);assert.ok(raw);assert.match(new URL(raw).pathname,/^\/once_test_[a-z0-9_]+$/);
test('business identity PostgreSQL: typed AI evidence and archive restore are atomic',async()=>{
 const db=new PrismaClient({datasources:{db:{url:raw}},log:[]});
 try{
  assert.equal((await db.$queryRawUnsafe<any[]>("SELECT tablename FROM pg_tables WHERE schemaname='public'")).length,0,'Owned empty DB only; never reset');await run('pnpm',['db:deploy'],{env:{...process.env,DATABASE_URL:raw},capture:true});
  const seed=await fixture();for(const table of ['workspaces','users','memberships','sessions','scopes','scopeMembers','dictionary'] as const)for(const row of seed.store.rows(table))await db.$executeRawUnsafe(`INSERT INTO "${table}" SELECT * FROM jsonb_populate_record(NULL::"${table}",$1::jsonb)`,JSON.stringify(row));
  const store=new PrismaStore(db),app=new Application(store,seed.app.config,seed.clock),owner=seed.owner;owner.app=app;
  const checks=await verifyBusinessIdentity({...seed,store,app,owner});
  mkdirSync('artifacts/business-flow-review',{recursive:true});writeFileSync('artifacts/business-flow-review/identity-postgres.json',JSON.stringify({head:process.env.ONCE_ACCEPTANCE_SHA,status:'DB_TESTED',migrations:75,checks,providerVerified:'NOT_RUN'},null,2)+'\n');
 }finally{await db.$disconnect();}
});
