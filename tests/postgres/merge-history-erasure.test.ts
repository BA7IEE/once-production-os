import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {Application} from '../../packages/core/src/api.ts';
import {FakeClock,Client,SYNTHETIC_PASSWORD} from '../support/fixtures.ts';
import {verifyHistoryErasure} from '../support/merge-history-erasure.ts';
test('real PostgreSQL reviewed merge-history erasure preserves immutable minimal lineage and rolls back audit failure',async()=>{
 assert.equal(process.env.ALLOW_TD2_DB_TESTS,'yes');const raw=process.env.DATABASE_URL_TD2_TEST;assert.ok(raw);const url=new URL(raw);assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));assert.match(url.pathname,/^\/once_test_td2_[a-z0-9_]+$/);assert.equal(url.search,'');assert.equal(url.hash,'');
 const client=new PrismaClient({datasources:{db:{url:raw}},log:[]}),store=new PrismaStore(client),clock=new FakeClock();
 try{
  assert.equal(await client.workspace.count(),0);const app=new Application(store,{origin:'https://history-erasure.test.invalid',secureCookies:true,contactKey:randomBytes(32),csrfKey:randomBytes(32),recoveryEpoch:randomBytes(24).toString('hex'),accessMode:'INTERNAL',environment:'test',dataEgressMode:'INTERNAL_APPROVED',dataCleanupMode:'INTERNAL_APPROVED',dataMergeMode:'INTERNAL_APPROVED'},clock);await app.identity.bootstrap('owner','合成合并历史清理',SYNTHETIC_PASSWORD);const owner=new Client(app);assert.equal((await owner.login()).status,200);
  for(const oldOnly of [false,true]){
   const t=await verifyHistoryErasure({app,store,clock,owner},oldOnly,async(s,before)=>{
    const old=before.talentProfiles.find(p=>p.personId===s.b.personId)!;
    await assert.rejects(client.talentProfile.delete({where:{id:old.id}}));await assert.rejects(client.talentProfile.update({where:{id:old.id},data:{internalSummary:'must not mutate original history'}}));
    await assert.rejects(client.personMergeDecision.update({where:{id:s.mergeId},data:{decisionManifest:{reason:'must not replace historical decision'}}}));
    const alias=before.personAliases.find(a=>a.mergeDecisionId===s.mergeId)!;await assert.rejects(client.personAlias.delete({where:{id:alias.id}}));
   });
   const e=await client.mergeHistoryErasure.findFirstOrThrow({where:{mergeDecisionId:t.s.mergeId}});await assert.rejects(client.mergeHistoryErasure.delete({where:{id:e.id}}));await assert.rejects(client.mergeHistoryErasure.update({where:{id:e.id},data:{recordRevision:e.recordRevision+1}}));
  }
  console.log('PASS PG merge history: direct SQL history mutation/deletion and erasure-evidence mutation denied; actual frozen graph cleanup clears original payload with audit rollback/retry; alias-only leaves current identity and measurement facts unchanged');
 }finally{await store.close();}
});
