import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Application } from '../../packages/core/src/api.ts';
import type { Config } from '../../packages/core/src/model.ts';
import { PrismaStore } from '../../apps/api/src/prisma-store.ts';
import { Client, FakeClock, sourceInput, result } from '../support/fixtures.ts';

type Context = { a: PrismaClient; b: PrismaClient; storeA: PrismaStore; ownerA: Client; ownerB: Client; appA: Application; config: Config; clock: FakeClock; identity: { workspaceId: string; membershipId: string } };

export async function runSearchContracts(t: TestContext, c: Context) {
  const { a, ownerA, config, clock, identity } = c;
  const ok = async (p: ReturnType<Client['raw']>, status=200) => { const r=await p; assert.equal(r.status,status,JSON.stringify(r.body)); return result(r); };
  const personId=(await ok(ownerA.cmd('POST','/people',{displayName:'SR1 PG家具模特',roles:['model'],cityCode:'shenzhen',languageCodes:['en'],skillCodes:['lifestyle'],inlineSource:sourceInput()}),201)).resourceId as string;

  await t.test('SR1 PG field filters and current evidence use exact current values', async()=>{
    let p=await ok(ownerA.raw('GET','/people/'+personId));
    assert.equal((await ownerA.cmd('POST','/field-evidence',{personId,expectedRevision:p.revision,fieldPath:'roles',sourceId:p.sourceId,sourceRevision:p.source.revision})).status,200);
    let r=await ok(ownerA.raw('GET','/people/search?role=model&cityCode=shenzhen&languageCode=en&skillCode=lifestyle&verifiedWithinDays=90'));
    assert.equal(r.total,1); assert.equal(r.items[0].id,personId); assert.equal(r.items[0].match.direct[0].verification.state,'CURRENT');
    p=await ok(ownerA.raw('GET','/people/'+personId));
    assert.equal((await ownerA.cmd('PATCH','/people/'+personId,{expectedRevision:p.revision,roles:['model','photographer']})).status,200);
    r=await ok(ownerA.raw('GET','/people/search?role=model&verifiedWithinDays=90')); assert.equal(r.total,0);
    r=await ok(ownerA.raw('GET','/people/search?role=model')); assert.equal(r.total,1); assert.equal(r.items[0].match.direct[0].verification.state,'NONE');
  });

  await t.test('SR1 PG work and ACTUAL project filters drop immediately when dependency source is suspended', async()=>{
    const work=(await ok(ownerA.cmd('POST','/works',{title:'SR1 PG家具作品',description:'家具 Lifestyle 场景',origin:'EXTERNAL',originNote:'合成外部作品',inlineSource:sourceInput()}),201)).resourceId as string;
    let wd=await ok(ownerA.raw('GET','/works/'+work));
    assert.equal((await ownerA.cmd('POST','/works/'+work+'/credits',{expectedRevision:wd.revision,personId,roleCode:'model',note:'合成署名'})).status,200);
    const project=(await ok(ownerA.cmd('POST','/projects',{title:'SR1 PG实际项目',inlineSource:sourceInput()}),201)).resourceId as string;
    let pd=await ok(ownerA.raw('GET','/projects/'+project));
    assert.equal((await ownerA.cmd('POST','/projects/'+project+'/participants',{expectedRevision:pd.revision,personId,roleCode:'model',state:'ACTUAL',note:'合成实际参与'})).status,200);
    let r=await ok(ownerA.raw('GET','/people/search?q=SR1%20PG家具模特&workQ=家具&workOrigin=EXTERNAL&actualProject=true'));
    assert.equal(r.total,1); assert.equal(r.items[0].match.actualProjectCount,1); assert.equal(r.items[0].match.matchedWorks[0].id,work);
    const wr=await a.work.findUniqueOrThrow({where:{id:work}}), source=await a.sourceRecord.findUniqueOrThrow({where:{id:wr.sourceId}});
    assert.equal((await ownerA.cmd('POST','/sources/'+source.id+'/suspend',{expectedRevision:source.revision,reason:'SR1 PG合成停止使用'})).status,200);
    r=await ok(ownerA.raw('GET','/people/search?q=SR1%20PG家具模特&workQ=家具&workOrigin=EXTERNAL')); assert.equal(r.total,0);
    r=await ok(ownerA.raw('GET','/people/search?q=SR1%20PG家具模特&actualProject=true')); assert.equal(r.total,1);
    const pr=await a.project.findUniqueOrThrow({where:{id:project}}), ps=await a.sourceRecord.findUniqueOrThrow({where:{id:pr.sourceId}});
    assert.equal((await ownerA.cmd('POST','/sources/'+ps.id+'/suspend',{expectedRevision:ps.revision,reason:'SR1 PG合成项目停止使用'})).status,200);
    r=await ok(ownerA.raw('GET','/people/search?q=SR1%20PG家具模特&actualProject=true')); assert.equal(r.total,0);
  });

  await t.test('SR1 PG search query count stays bounded when visible people scale', async()=>{
    const template=await a.person.findUniqueOrThrow({where:{id:personId}});
    const source=await a.sourceRecord.findUniqueOrThrow({where:{id:template.sourceId}});
    const measured=new PrismaClient({datasources:{db:{url:process.env.DATABASE_URL_TEST!}},log:[{emit:'event',level:'query'}]});
    let queries=0; measured.$on('query',()=>{queries++});
    const store=new PrismaStore(measured); const app=new Application(store,config,clock); const client=new Client(app); client.jar={...ownerA.jar}; client.csrf=ownerA.csrf;
    try {
      const existing=await a.person.count();
      if(existing<200) await a.person.createMany({data:Array.from({length:200-existing},(_,i)=>({...template,id:randomUUID(),displayName:'SR1 PG scale '+i,revision:1,createdAt:clock.now(),updatedAt:clock.now(),sourceId:source.id}))});
      queries=0; const r=await client.raw('GET','/people/search?role=model&pageSize=100'); assert.equal(r.status,200,JSON.stringify(r.body));
      assert.ok(queries<=35,'search query budget exceeded: '+queries); console.log(JSON.stringify({metric:'PG-search',people:await a.person.count(),queries}));
    } finally { await store.close(); }
    assert.equal(identity.workspaceId,template.workspaceId);
  });
}
