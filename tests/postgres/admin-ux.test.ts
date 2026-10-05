import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {Application} from '../../packages/core/src/api.ts';
import {fixture,member} from '../support/fixtures.ts';
import {FaultStore} from '../support/fault-store.ts';
import {AppError} from '../../packages/core/src/errors.ts';
import {batchScenario,caseScenario,uxTalent,uxChoice,uxList,uxEntry} from '../support/admin-ux.ts';
import {expectResponse as ok} from '../support/talent-v2-maintenance.ts';
import {run} from '../../scripts/resource-lifecycle.mjs';
const raw=process.env.DATABASE_URL_TEST;assert.equal(process.env.ALLOW_DB_TESTS,'yes');assert.ok(process.env.ONCE_RESOURCE_RUN_DIR);assert.ok(raw);assert.match(new URL(raw).pathname,/^\/once_test_[a-z0-9_]+$/);
test('admin UX PostgreSQL: atomic batch, own readonly receipt, exact case credit, rollback and 100-item capacity',async()=>{
 let queries=0;const db=new PrismaClient({datasources:{db:{url:raw}},log:[{emit:'event',level:'query'}]});db.$on('query',()=>queries++);
 try{
  assert.equal((await db.$queryRawUnsafe<any[]>("SELECT tablename FROM pg_tables WHERE schemaname='public'")).length,0,'Owned empty DB only; never reset');await run('pnpm',['db:deploy'],{env:{...process.env,DATABASE_URL:raw},capture:true});
  const seed=await fixture();for(const table of ['workspaces','users','memberships','sessions','scopes','scopeMembers','dictionary'] as const)for(const row of seed.store.rows(table))await db.$executeRawUnsafe(`INSERT INTO "${table}" SELECT * FROM jsonb_populate_record(NULL::"${table}",$1::jsonb)`,JSON.stringify(row));
  const store=new PrismaStore(db),app=new Application(store,seed.app.config,seed.clock),owner=seed.owner;owner.app=app;const f={...seed,store,app,owner},checks:string[]=[];
  checks.push(...(await batchScenario(f)).checks,...(await caseScenario(f)).checks);
  const t=await uxTalent(f,'真实PG审计回滚候选'),p=(await uxChoice(f,[t.id]))[0],list=await uxList(f),key=randomUUID(),input={expectedRevision:1,entries:[uxEntry(p)]},fault=new FaultStore(store);fault.afterInsert=table=>{if(table==='audits'){fault.afterInsert=null;throw new AppError(503,'AUDIT_FAULT','synthetic audit failure');}};
  owner.app=new Application(fault,app.config,seed.clock);assert.equal((await owner.cmd('POST',`/shortlists/${list}/batch`,input,key)).status,503);assert.equal(await db.shortlistItem.count({where:{shortlistId:list}}),0);assert.equal(await db.commandReceipt.count({where:{operation:'shortlist.batchAdd',commandKey:key}}),0);ok(await owner.cmd('POST',`/shortlists/${list}/batch`,input,key),200);assert.equal(await db.shortlistItem.count({where:{shortlistId:list}}),1);owner.app=app;checks.push('real-audit-fault-transaction-rollback-exact-retry');
  const ids:string[]=[];for(let i=0;i<101;i++)ids.push((await uxTalent(f,'PG容量候选 '+i)).id);const candidates=await uxChoice(f,ids),capacity=await uxList(f),queryStart=queries,start=Date.now(),r=ok(await owner.cmd('POST',`/shortlists/${capacity}/batch`,{expectedRevision:1,entries:candidates.slice(0,100).map((p:any)=>uxEntry(p))}),200);assert.deepEqual(r.summary,{added:100,existing:0});const durationMs=Date.now()-start,queryCount=queries-queryStart;assert.ok(queryCount<500,'100-item command must not reread the whole source registry for every item');
  assert.equal((await owner.cmd('POST',`/shortlists/${capacity}/batch`,{expectedRevision:r.revision,entries:[uxEntry(candidates[100])]})).status,422);assert.equal(await db.shortlistItem.count({where:{shortlistId:capacity}}),100);checks.push('real-100-item-batch-and-no-overflow');
  // A receipt remains inaccessible after the original operator loses write permission.
  const membership=await db.membership.findUniqueOrThrow({where:{id:f.membershipId}});await db.membership.update({where:{id:membership.id},data:{role:'VIEWER'}});assert.equal((await owner.raw('POST','/commands/inspect',{operation:'shortlist.batchAdd',commandKey:key})).status,403);checks.push('current-permission-rechecked-on-read-inspection');
  mkdirSync('artifacts/admin-ux',{recursive:true});writeFileSync('artifacts/admin-ux/postgres.json',JSON.stringify({head:process.env.ONCE_ACCEPTANCE_SHA,status:'DB_TESTED',migrations:75,capacity:100,durationMs,queryCount,checks,providerVerified:'NOT_RUN'},null,2)+'\n');
 }finally{await db.$disconnect();}
});
