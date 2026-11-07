import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {verifySupplierProfiles} from '../support/supplier-profiles.ts';
const raw=process.env.DATABASE_URL_TEST;assert.equal(process.env.ALLOW_DB_TESTS,'yes');assert.ok(raw);assert.ok(process.env.ONCE_RESOURCE_RUN_DIR);
const url=new URL(raw);assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/^\/once_test_[a-z0-9_]+$/);
test('directory returns correct multi-role counts and pages at 1,000 and 10,000 synthetic people',async()=>{
 const db=new PrismaClient({datasources:{db:{url:raw}},log:[]}),store=new PrismaStore(db),metrics=[];
 try{
  assert.equal(await db.workspace.count(),0);const {f,personId}=await verifySupplierProfiles(store);
  const person=await db.person.findUniqueOrThrow({where:{id:personId}}),profile=await db.talentProfile.findFirstOrThrow({where:{personId}}),roles=await db.personRole.findMany({where:{personId}});
  const source=await db.sourceRecord.findUniqueOrThrow({where:{id:f.sourceId}}),history=await db.sourceHistory.findFirstOrThrow({where:{sourceId:f.sourceId,sourceRevision:1}});
  let seeded=0;
  for(const target of [1000,10000]){
   for(let offset=seeded;offset<target;offset+=250){
    const ids=Array.from({length:Math.min(250,target-offset)},()=>randomUUID()),sourceIds=new Map(ids.map(id=>[id,randomUUID()]));
    await db.sourceRecord.createMany({data:ids.map(id=>({...source,id:sourceIds.get(id)!,title:'合成规模来源'}))});
    await db.sourceHistory.createMany({data:ids.map(id=>({...history,id:randomUUID(),sourceId:sourceIds.get(id)!,snapshot:{...(history.snapshot as Record<string,unknown>),id:sourceIds.get(id)!,title:'合成规模来源'}}))});
    await db.person.createMany({data:ids.map((id,i)=>({...person,id,sourceId:sourceIds.get(id)!,displayName:'规模供应商 '+String(offset+i).padStart(5,'0')}))});
    await db.talentProfile.createMany({data:ids.map(personId=>({...profile,id:randomUUID(),personId,sourceId:sourceIds.get(personId)!}))});
    await db.personRole.createMany({data:ids.flatMap(personId=>roles.map(role=>({...role,id:randomUUID(),personId,sourceId:sourceIds.get(personId)!})))});
   }
   seeded=target;const query={q:'规模供应商',role:'director',page:1,pageSize:20};
   f.ok(await f.owner.raw('POST','/directory/talents/search',query));const samples=[];let first:any;
   for(let i=0;i<5;i++){const start=performance.now();first=f.ok(await f.owner.raw('POST','/directory/talents/search',query));samples.push(Math.round((performance.now()-start)*100)/100);assert.equal(first.total,target);assert.equal(first.items.length,20);}
   const second=f.ok(await f.owner.raw('POST','/directory/talents/search',{...query,page:2}));assert.equal(second.total,target);assert.ok(second.items.every((r:any)=>!first.items.some((x:any)=>x.id===r.id)));
   const p95Ms=[...samples].sort((a,b)=>a-b)[4];metrics.push({people:target,roles:target*2,samplesMs:samples,p95Ms});console.log(JSON.stringify(metrics.at(-1)));
  }
  mkdirSync('artifacts/supplier-library',{recursive:true});writeFileSync('artifacts/supplier-library/scale.json',JSON.stringify({status:'PASSED',scope:'Synthetic records, two roles and one independent synthetic employee source per person, single caller, warm reads; PostgreSQL limited to 1 CPU/512 MiB. No concurrent upload/model workload or production capacity claim.',metrics},null,2)+'\n');
 }finally{await store.close();}
});
