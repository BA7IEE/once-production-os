import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { Application } from '../../packages/core/src/api.ts';
import type { Config, Table } from '../../packages/core/src/model.ts';
import type { PrismaStore } from '../../apps/api/src/prisma-store.ts';
import { Client, FakeClock, sourceInput, result } from '../support/fixtures.ts';
import { FaultStore } from '../support/fault-store.ts';

type Context = { a: PrismaClient; b: PrismaClient; storeA: PrismaStore; ownerA: Client; ownerB: Client; appA: Application; config: Config; clock: FakeClock; identity: { workspaceId: string; membershipId: string } };

export async function runShortlistContracts(t: TestContext, c: Context) {
  const { a, b, storeA, ownerA, ownerB, config, clock } = c;
  const ok = async (p: ReturnType<Client['raw']>, status=200) => { const r=await p; assert.equal(r.status,status,JSON.stringify(r.body)); return result(r); };
  const projectId=(await ok(ownerA.cmd('POST','/projects',{title:'SL1 PG project',inlineSource:sourceInput()}),201)).resourceId as string;
  const p1=(await ok(ownerA.cmd('POST','/people',{displayName:'SL1 PG candidate A',roles:['model'],inlineSource:sourceInput()}),201)).resourceId as string;
  const p2=(await ok(ownerA.cmd('POST','/people',{displayName:'SL1 PG candidate B',roles:['model'],inlineSource:sourceInput()}),201)).resourceId as string;
  const workId=(await ok(ownerA.cmd('POST','/works',{title:'SL1 PG reference',origin:'EXTERNAL',originNote:'synthetic external work',inlineSource:sourceInput()}),201)).resourceId as string;

  await t.test('SL1 PG same create key on two clients yields one shortlist and one receipt', async()=>{
    const key=randomUUID(), body={projectId,title:'SL1 PG shortlist',brief:'synthetic shortlist'};
    const [x,y]=await Promise.all([ok(ownerA.cmd('POST','/shortlists',body,key),201),ok(ownerB.cmd('POST','/shortlists',body,key),201)]);
    assert.equal(x.resourceId,y.resourceId); assert.equal(Number(x.replayed)+Number(y.replayed),1);
    assert.equal(await a.shortlist.count({where:{id:x.resourceId}}),1); assert.equal(await a.commandReceipt.count({where:{commandKey:key}}),1);
  });

  const shortlistId=(await ok(ownerA.cmd('POST','/shortlists',{projectId,title:'SL1 PG candidate board',brief:'synthetic'}),201)).resourceId as string;
  const detail=()=>ok(ownerA.raw('GET','/shortlists/'+shortlistId));
  await t.test('SL1 PG candidate writes use parent CAS and never create project participation', async()=>{
    const d=await detail();
    const [x,y]=await Promise.all([
      ownerA.cmd('POST','/shortlists/'+shortlistId+'/people',{expectedRevision:d.revision,personId:p1,state:'PRIORITY',note:'primary'}),
      ownerB.cmd('POST','/shortlists/'+shortlistId+'/people',{expectedRevision:d.revision,personId:p2,state:'CANDIDATE',note:'backup'})
    ]);
    assert.deepEqual([x.status,y.status].sort(),[200,409]);
    assert.equal(await a.shortlistPerson.count({where:{shortlistId}}),1);
    assert.equal(await a.projectParticipant.count({where:{projectId}}),0);
    const current=await detail(), missing=current.people[0].person.id===p1?p2:p1;
    await ok(ownerA.cmd('POST','/shortlists/'+shortlistId+'/people',{expectedRevision:current.revision,personId:missing}));
    assert.equal(await a.shortlistPerson.count({where:{shortlistId}}),2);
  });

  await t.test('SL1 PG deferred ordering permits swaps but rejects duplicate final positions', async()=>{
    let d=await detail(); const ids=d.people.map((x:any)=>x.id);
    await ok(ownerA.cmd('POST','/shortlists/'+shortlistId+'/people/reorder',{expectedRevision:d.revision,entryIds:ids.slice().reverse()}));
    assert.deepEqual((await a.shortlistPerson.findMany({where:{shortlistId},orderBy:{position:'asc'}})).map(x=>x.id),ids.slice().reverse());
    await assert.rejects(a.$transaction(async tx=>{
      const rows=await tx.shortlistPerson.findMany({where:{shortlistId},orderBy:{position:'asc'}});
      await tx.shortlistPerson.update({where:{id:rows[0]!.id},data:{position:0}});
      await tx.shortlistPerson.update({where:{id:rows[1]!.id},data:{position:0}});
    }));
  });

  await t.test('SL1 PG work relation is unique and candidate source loss redacts live data', async()=>{
    let d=await detail(); await ok(ownerA.cmd('POST','/shortlists/'+shortlistId+'/works',{expectedRevision:d.revision,workId,note:'style reference'}));
    d=await detail(); assert.equal(d.works[0].work.id,workId);
    assert.equal((await ownerA.cmd('POST','/shortlists/'+shortlistId+'/works',{expectedRevision:d.revision,workId})).status,409);
    const person=await a.person.findUniqueOrThrow({where:{id:p1}}), source=await a.sourceRecord.findUniqueOrThrow({where:{id:person.sourceId}});
    await ok(ownerA.cmd('POST','/sources/'+source.id+'/suspend',{expectedRevision:source.revision,reason:'synthetic suspend'}));
    d=await detail(); const hidden=d.people.find((x:any)=>x.person===null); assert.ok(hidden); assert.equal(hidden.note,null); assert.ok(!JSON.stringify(d).includes('SL1 PG candidate A'));
  });

  await t.test('SL1 PG workspace FKs and parent uniqueness reject forged relations', async()=>{
    const entry=await a.shortlistPerson.findFirstOrThrow({where:{shortlistId}});
    await assert.rejects(a.shortlistPerson.create({data:{...entry,id:randomUUID()}}));
    await assert.rejects(a.shortlistPerson.create({data:{...entry,id:randomUUID(),personId:randomUUID()}}));
    const work=await a.shortlistWork.findFirstOrThrow({where:{shortlistId}});
    await assert.rejects(a.shortlistWork.create({data:{...work,id:randomUUID()}}));
  });

  for (const stage of ['shortlistPeople','audits','receipts'] as const) {
    await t.test('SL1 PG child/root/audit/receipt roll back after '+stage, async()=>{
      const fresh=(await ok(ownerA.cmd('POST','/shortlists',{projectId,title:'SL1 rollback '+stage,brief:''}),201)).resourceId as string;
      const faults=new FaultStore(storeA); let fired=false; faults.afterInsert=table=>{if(table===stage&&!fired){fired=true;throw new Error('SL1 deliberate failure')}};
      const app=new Application(faults,config,clock), client=new Client(app); client.jar={...ownerA.jar}; client.csrf=ownerA.csrf;
      const before={root:await a.shortlist.findUniqueOrThrow({where:{id:fresh}}),children:await a.shortlistPerson.count({where:{shortlistId:fresh}}),audit:await a.auditEvent.count(),receipts:await a.commandReceipt.count()};
      const key=randomUUID(), body={expectedRevision:1,personId:p2,state:'CANDIDATE' as const};
      const r=await client.cmd('POST','/shortlists/'+fresh+'/people',body,key); assert.ok(r.status>=500,JSON.stringify(r.body)); assert.ok(fired);
      assert.deepEqual(await a.shortlist.findUniqueOrThrow({where:{id:fresh}}),before.root); assert.equal(await a.shortlistPerson.count({where:{shortlistId:fresh}}),before.children); assert.equal(await a.auditEvent.count(),before.audit); assert.equal(await a.commandReceipt.count(),before.receipts);
      await ok(ownerA.cmd('POST','/shortlists/'+fresh+'/people',body,key)); assert.equal(await a.commandReceipt.count({where:{commandKey:key}}),1);
    });
  }
}
