/** Synthetic local scale regression, not the specified 4vCPU/8GB production P95 gate.
 * Frozen migrations and fresh explicit loopback database; all synthetic rows stay for review. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {Application} from '../../packages/core/src/api.ts';
import {FakeClock,Client,SYNTHETIC_PASSWORD,sourceInput} from '../support/fixtures.ts';
import {expectResponse as ok} from '../support/talent-v2-maintenance.ts';

test('typed and compatible searches retain exact permissions, facets and fixed query count at 100/1000 people',async()=>{
 assert.equal(process.env.ALLOW_TD2_DB_TESTS,'yes');const raw=process.env.DATABASE_URL_TD2_TEST;assert.ok(raw);const url=new URL(raw);assert.ok(['postgres:','postgresql:'].includes(url.protocol));assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));assert.match(url.pathname,/^\/once_test_td2_scale_[a-z0-9_]+$/);assert.equal(url.search,'');assert.equal(url.hash,'');
 const client=new PrismaClient({datasources:{db:{url:raw}},log:[{emit:'event',level:'query'}]}),store=new PrismaStore(client),clock=new FakeClock();let queries=0;client.$on('query',event=>{if(/^\s*SELECT\b/i.test(event.query)&&/\bFROM\s+"public"\."[A-Za-z]+"/i.test(event.query))queries++;}); // Count domain SELECTs only; transaction controls and driver health probes are not domain reads.
 try{
  assert.equal(await client.workspace.count(),0);const app=new Application(store,{origin:'https://td2-scale.test.invalid',secureCookies:true,contactKey:randomBytes(32),csrfKey:randomBytes(32),recoveryEpoch:randomBytes(24).toString('hex'),accessMode:'INTERNAL',environment:'test',dataEgressMode:'INTERNAL_APPROVED',dataCleanupMode:'INTERNAL_APPROVED',dataMergeMode:'INTERNAL_APPROVED'},clock);
  await app.identity.bootstrap('owner','合成专业检索规模',SYNTHETIC_PASSWORD);const owner=new Client(app);ok(await owner.login(),200);
  const schemaVersion='once-talent-v2.0.0',sourceId=ok(await owner.cmd('POST','/sources',sourceInput())).resourceId as string;
  const personId=ok(await owner.cmd('POST','/td2/people',{schemaVersion,originSourceId:sourceId,sourceRevision:1,displayName:'合成规模种子',createTalent:true})).resourceId as string;
  const roleId=ok(await owner.cmd('POST',`/td2/people/${personId}/roles`,{schemaVersion,expectedPersonRevision:1,sourceId,sourceRevision:1,values:{roleCode:'model'}})).resourceId as string;
  const languageId=ok(await owner.cmd('POST',`/td2/people/${personId}/languages`,{schemaVersion,expectedPersonRevision:2,sourceId,sourceRevision:1,values:{languageCode:'en',speakingLevelCode:'WORKING'}})).resourceId as string;
  ok(await owner.cmd('POST','/td2/evidence',{schemaVersion,ownerKind:'personLanguages',ownerId:languageId,fieldPath:'speakingLevelCode',expectedRevision:1,sourceId,sourceRevision:1}),200);
  const suspended=ok(await owner.cmd('POST','/sources',{...sourceInput(),title:'合成不可用语言依据'})).resourceId as string;ok(await owner.cmd('POST',`/sources/${suspended}/suspend`,{expectedRevision:1,reason:'合成规模筛选不可用事实'}),200);
  const [person,profile,role,language,evidence]=await Promise.all([client.person.findUniqueOrThrow({where:{id:personId}}),client.talentProfile.findFirstOrThrow({where:{personId}}),client.personRole.findUniqueOrThrow({where:{id:roleId}}),client.personLanguage.findUniqueOrThrow({where:{id:languageId}}),client.fieldEvidence.findFirstOrThrow({where:{personLanguageId:languageId}})]);
  let seeded=0;const expectedCounts=new Map<string,number>();
  for(const target of [100,1000]){
   const ids=Array.from({length:target-seeded},()=>randomUUID()),langs=ids.map(personId=>({...language,id:randomUUID(),personId}));
   await client.person.createMany({data:ids.map((id,i)=>({...person,id,displayName:'合成规模人才 '+String(seeded+i).padStart(4,'0')}))});
   await client.talentProfile.createMany({data:ids.map(personId=>({...profile,id:randomUUID(),personId}))});await client.personRole.createMany({data:ids.map(personId=>({...role,id:randomUUID(),personId}))});
   await client.personLanguage.createMany({data:[...langs,...ids.map(personId=>({...language,id:randomUUID(),personId,sourceId:suspended,languageCode:'fr'}))]});
   await client.fieldEvidence.createMany({data:langs.map(row=>({...evidence,id:randomUUID(),personLanguageId:row.id}))});seeded=target;
   const endpoints=[['typed','/td2/people?q='+encodeURIComponent('合成规模人才')+'&role=model&language=en&languageLevel=WORKING'],['compatible','/talent-search?q='+encodeURIComponent('合成规模人才')+'&role=model&languageCode=en']] as const;
   for(const [name,path] of endpoints){
    ok(await owner.raw('GET',path+'&page=1&pageSize=20'),200); // Warm the same query before timing or comparing SQL counts.
    for(let round=1;round<=3;round++){
     const times:number[]=[];let measuredCount=0;
     for(let sample=0;sample<5;sample++){
      queries=0;const started=performance.now(),response=ok(await owner.raw('GET',path+'&page=1&pageSize=20'),200);times.push(performance.now()-started);measuredCount=queries;assert.ok(queries>0,'domain SELECT measurement must be active');
      assert.equal(response.total,target);assert.equal(response.items.length,20);assert.equal(name==='typed'?response.facets.roles.model:response.facets.roles.find((r:any)=>r.code==='model')?.count,target);assert.equal(name==='typed'?response.facets.languages.fr:response.facets.languages.find((r:any)=>r.code==='fr'),undefined);
      const first=expectedCounts.get(name);if(first===undefined)expectedCounts.set(name,queries);else assert.equal(queries,first,'query count must not grow with dataset size or round');
     }
     times.sort((a,b)=>a-b);console.log(JSON.stringify({metric:'TD2-local-scale',endpoint:name,people:target,round,samples:times.length,domainSelects:measuredCount,p95Ms:Math.round(times[Math.ceil(times.length*.95)-1]! *100)/100}));
    }
    const second=ok(await owner.raw('GET',path+'&page=2&pageSize=20'),200);assert.equal(second.total,target);assert.equal(second.items.length,20);
   }
   assert.equal(ok(await owner.raw('GET','/td2/people?language=fr'),200).total,0);assert.equal(ok(await owner.raw('GET','/td2/people?heightMin=170'),200).total,0);
  }
 }finally{await store.close();}
});
