import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {supplierFixture} from '../support/supplier-profiles.ts';
import {inspectTalentIntegrity} from '../../packages/core/src/talent-v2-integrity.ts';
import {eraseSupplierFields} from '../../packages/core/src/supplier-field-lifecycle.ts';
const raw=process.env.DATABASE_URL_TEST;
assert.equal(process.env.ALLOW_DB_TESTS,'yes');assert.ok(raw);assert.ok(process.env.ONCE_RESOURCE_RUN_DIR);
const url=new URL(raw);assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/^\/once_test_[a-z0-9_]+$/);
async function verifyReplacementBatches(db:PrismaClient,f:Awaited<ReturnType<typeof supplierFixture>>,personId:string){
  const schema=f.ok(await f.a.client.raw('GET','/portal/profile-schema',undefined,f.headers()));
  const professional=(answers:unknown[])=>({catalogVersion:schema.fieldCatalog.version,catalogDigest:schema.fieldCatalog.digest,answers});
  const detail=f.ok(await f.owner.raw('GET','/people/'+personId+'/professional'));
  const photo=detail.entries.find((e:any)=>e.field.code==='role.started_year'&&e.answer.roleCode==='photographer'),director=detail.entries.find((e:any)=>e.field.code==='role.started_year'&&e.answer.roleCode==='director');
  const snapshot=async()=>JSON.stringify({person:await db.person.findUniqueOrThrow({where:{id:personId}}),facts:await db.supplierFact.findMany({where:{personId},orderBy:{id:'asc'}}),grants:await db.talentAccessGrant.findMany({where:{personId},orderBy:{id:'asc'}})});
  const before=await snapshot(),retired=await db.supplierFact.count({where:{personId,status:'RETIRED'}}),active=await db.supplierFact.count({where:{personId,status:'ACTIVE'}});
  const write=(replace:any[],answers:unknown[])=>f.owner.cmd('POST','/people/'+personId+'/professional',{expectedPersonRevision:detail.revision,sourceId:f.sourceId,sourceRevision:1,professional:professional(answers),replace});
  for(const replace of [[photo,director],[photo,photo],[director]]){
   assert.equal((await write(replace.map(e=>({id:e.id,revision:e.revision})),[{...photo.answer,value:2019}])).status,422);
   assert.equal(await snapshot(),before);
  }
  f.ok(await write([photo,director].map(e=>({id:e.id,revision:e.revision})),[{...photo.answer,value:2019},{fieldCode:'role.started_year',roleCode:'director',state:'NOT_PROVIDED'}]));
  const own=f.ok(await f.a.client.raw('GET','/portal/supplier-profiles/'+personId,undefined,f.headers()));
  assert.deepEqual(own.profile.professional.answers.find((a:any)=>a.roleCode==='director'),{fieldCode:'role.started_year',roleCode:'director',state:'NOT_PROVIDED'});
  assert.equal(own.profile.professional.answers.find((a:any)=>a.fieldCode==='role.started_year'&&a.roleCode==='photographer').value,2019);
  assert.equal(await db.supplierFact.count({where:{personId,status:'RETIRED'}}),retired+2);
  assert.equal(await db.supplierFact.count({where:{personId,status:'ACTIVE'}}),active);
}
test('published field catalogs, typed facts, choices, atomic self confirmation and field search use real PostgreSQL constraints',async()=>{
 const db=new PrismaClient({datasources:{db:{url:raw}},log:[]}),store=new PrismaStore(db);
 try{
  const f=await supplierFixture(store),schema=f.ok(await f.a.client.raw('GET','/portal/profile-schema',undefined,f.headers()));
  f.ok(await f.owner.cmd('POST','/td2/capability-definitions',{schemaVersion:'once-talent-v2.1.0',code:'synthetic_typed_tool',labelZh:'合成工具',labelEn:'',aliases:[],applicableRoleCodes:['photographer'],levelSchemeCode:'ABILITY_5',semanticVersion:'1.0.0'}),201);
  const profile={...f.profile,roleCodes:['director','photographer','translator','model'],capabilityDetails:[{roleCode:'photographer',capabilityCode:'synthetic_typed_tool',levelCode:'WORKING'}],credentials:[{roleCode:'photographer',credentialTypeCode:'EQUIPMENT_CERTIFICATE',credentialName:'Synthetic equipment claim',issuerName:'Synthetic issuer',issuedOn:null,expiresOn:null}],translation:{pairs:[{sourceLanguageCode:'zh',targetLanguageCode:'en'}],modeCodes:['ON_SET']},measurements:{...f.profile.measurements,shoeSizeValue:'39',shoeSizeSystem:'EU',measuredOn:'2026-09-20',datePrecision:'EXACT_DAY'},professional:{catalogVersion:1,catalogDigest:schema.fieldCatalog.digest,answers:[
   {fieldCode:'camera.specialties',roleCode:'photographer',state:'KNOWN',value:['steadicam','moco']},
   {fieldCode:'role.started_year',roleCode:'photographer',state:'KNOWN',value:2015},
   {fieldCode:'role.started_year',roleCode:'director',state:'KNOWN',value:2020},
   {fieldCode:'person.education',roleCode:null,state:'KNOWN',value:[{id:randomUUID(),values:{institution:'Synthetic academy',from:'2012-09-01'}}]},
  ]}};
  const created=f.ok(await f.a.client.raw('POST','/portal/profile-drafts',{...f.input,profile},f.headers()));
  f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+created.resourceId+'/confirm',{expectedRevision:created.revision,accepted:true},f.headers()));
  const saved=await f.read(created.resourceId),personId=saved.personId,workspaceId=(await db.person.findUniqueOrThrow({where:{id:personId}})).workspaceId;
  const own=f.ok(await f.a.client.raw('GET','/portal/supplier-profiles/'+personId,undefined,f.headers()));assert.equal(own.profile.professional.answers.length,4);
  assert.equal((await db.personCredential.findFirstOrThrow({where:{personId}})).credentialName,'Synthetic equipment claim');assert.equal((await db.personCredential.findFirstOrThrow({where:{personId}})).status,'UNVERIFIED');assert.equal(await db.translatorLanguagePair.count({where:{personId}}),1);assert.equal((await db.measurementSet.findFirstOrThrow({where:{personId}})).shoeSizeSystem,'EU');assert.deepEqual(own.profile.capabilityDetails,profile.capabilityDetails);
  assert.ok(!(await db.supplierFact.findMany()).some(r=>r.textCiphertext?.includes('Synthetic academy')));
  const found=f.ok(await f.owner.raw('POST','/directory/talents/search',{q:'林光',professional:{roleCode:'photographer',fields:[{fieldCode:'camera.specialties',codes:['steadicam','moco'],match:'ALL'},{fieldCode:'role.started_year',min:2010,max:2020}]}}));assert.equal(found.total,1);assert.equal(found.items[0].id,personId);
  const published=await db.supplierCatalog.findFirstOrThrow({where:{workspaceId,state:'PUBLISHED'}});await assert.rejects(db.supplierCatalog.update({where:{id:published.id},data:{publishReason:'rewrite'}}));
  const fact=await db.supplierFact.findFirstOrThrow({where:{personId,fieldCode:'role.started_year',roleCode:'photographer'}}),id=randomUUID();
  await assert.rejects(db.supplierFact.create({data:{...fact,id,setId:id,textCiphertext:'invalid extra typed value'}}));
  await assert.rejects(db.supplierFact.update({where:{id:fact.id},data:{numberValue:2000}}));
  const multi=await db.supplierFact.findFirstOrThrow({where:{personId,fieldCode:'camera.specialties'}});
  await assert.rejects(db.supplierFactChoice.create({data:{id:randomUUID(),workspaceId,factId:multi.id,code:'unregistered_term',createdAt:new Date(),updatedAt:new Date(),revision:1}}));
  const choices=await db.supplierFactChoice.findMany({where:{factId:multi.id}});assert.equal(choices.length,2);
  await assert.rejects(db.supplierFactChoice.deleteMany({where:{factId:multi.id}}));assert.equal(await db.supplierFactChoice.count({where:{factId:multi.id}}),2);
  await verifyReplacementBatches(db,f,personId);
  const detail=f.ok(await f.owner.raw('GET','/people/'+personId+'/professional')),entry=detail.entries.find((e:any)=>e.field.code==='role.started_year'&&e.answer.roleCode==='photographer');
  const update=(revision:number,target:typeof entry,value:number)=>f.owner.cmd('POST','/people/'+personId+'/professional',{expectedPersonRevision:revision,sourceId:f.sourceId,sourceRevision:1,professional:{catalogVersion:1,catalogDigest:schema.fieldCatalog.digest,answers:[{fieldCode:'role.started_year',roleCode:'photographer',state:'KNOWN',value}]},replace:[{id:target.id,revision:target.revision}]});
  f.ok(await update(detail.revision,entry,2016));const second=f.ok(await f.owner.raw('GET','/people/'+personId+'/professional'));f.ok(await update(second.revision,second.entries.find((e:any)=>e.field.code==='role.started_year'&&e.answer.roleCode==='photographer'),2017));
  const report=await store.transaction(tx=>inspectTalentIntegrity(tx,workspaceId,f.app.config.contactKey,f.clock));assert.equal(report.relationFailures,0);assert.equal(report.professionalFactFailures,0);
  await store.transaction(tx=>eraseSupplierFields(tx,workspaceId,[personId]));assert.equal(await db.supplierFact.count({where:{personId}}),0);assert.equal(await db.supplierFactChoice.count(),0);
 }finally{await store.close();}
});
