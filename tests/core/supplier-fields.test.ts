import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {MemoryStore} from '../support/memory-store.ts';
import {supplierFixture} from '../support/supplier-profiles.ts';
import {validateFieldCatalog,validateScalar} from '../../packages/core/src/supplier-field-validation.ts';
import {DEFAULT_SUPPLIER_FIELD_CATALOG} from '../../packages/core/src/supplier-field-defaults.ts';
import {digest} from '../../packages/core/src/json.ts';
import type {ProfessionalAnswer} from '../../packages/core/src/supplier-field-contract.ts';
import {inspectTalentIntegrity} from '../../packages/core/src/talent-v2-integrity.ts';
import {revokePersonMaintenance} from '../../packages/core/src/talent-maintenance-lifecycle.ts';
import {eraseSupplierFields,supplierFieldSnapshot} from '../../packages/core/src/supplier-field-lifecycle.ts';
import {sourceInput} from '../support/fixtures.ts';
import {DeletionCleanup} from '../../packages/core/src/deletion-cleanup.ts';

async function setup(){const store=new MemoryStore(),f=await supplierFixture(store);const schema=f.ok(await f.a.client.raw('GET','/portal/profile-schema',undefined,f.headers()));
 const professional=(answers:ProfessionalAnswer[])=>({catalogVersion:schema.fieldCatalog.version,catalogDigest:schema.fieldCatalog.digest,answers});
 const create=async(answers:ProfessionalAnswer[])=>f.ok(await f.a.client.raw('POST','/portal/profile-drafts',{...f.input,profile:{...f.profile,professional:professional(answers)}},f.headers()));
 const confirm=async(draft:{resourceId:string;revision:number})=>{f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+draft.resourceId+'/confirm',{expectedRevision:draft.revision,accepted:true},f.headers()));return f.read(draft.resourceId);};
 return {store,f,schema,professional,create,confirm};}
test('every replacement needs its own role-specific answer and invalid batches leave facts, exposure and person unchanged',async()=>{
 const {f,store,professional,create,confirm}=await setup(),saved=await confirm(await create([
  {fieldCode:'role.started_year',roleCode:'photographer',state:'KNOWN',value:2018},
  {fieldCode:'role.started_year',roleCode:'director',state:'KNOWN',value:2020},
 ]));
 const detail=f.ok(await f.owner.raw('GET','/people/'+saved.personId+'/professional'));
 const photo=detail.entries.find((e:any)=>e.answer.roleCode==='photographer'),director=detail.entries.find((e:any)=>e.answer.roleCode==='director');
 const snapshot=()=>store.transaction(async tx=>({person:await tx.get('people',saved.personId),facts:await tx.find('supplierFacts',{personId:saved.personId}),grants:await tx.find('talentAccessGrants',{personId:saved.personId})}));
 const before=await snapshot(),ownBefore=f.ok(await f.a.client.raw('GET','/portal/supplier-profiles/'+saved.personId,undefined,f.headers()));
 const write=(replace:any[],answers:ProfessionalAnswer[])=>f.owner.cmd('POST','/people/'+saved.personId+'/professional',{
  expectedPersonRevision:detail.revision,sourceId:f.sourceId,sourceRevision:1,professional:professional(answers),replace,
 });
 const incomplete=await write([photo,director].map(e=>({id:e.id,revision:e.revision})),[{...photo.answer,value:2019}]);
 assert.equal(incomplete.status,422,JSON.stringify(incomplete.body));
 assert.deepEqual(await snapshot(),before);
 assert.deepEqual(f.ok(await f.a.client.raw('GET','/portal/supplier-profiles/'+saved.personId,undefined,f.headers())),ownBefore);
 const duplicate=await write([{id:photo.id,revision:photo.revision},{id:photo.id,revision:photo.revision}],[{...photo.answer,value:2019}]);
 assert.equal(duplicate.status,422,JSON.stringify(duplicate.body));assert.deepEqual(await snapshot(),before);
 const wrongRole=await write([{id:director.id,revision:director.revision}],[{...photo.answer,value:2019}]);
 assert.equal(wrongRole.status,422);assert.deepEqual(await snapshot(),before);
 f.ok(await write([photo,director].map(e=>({id:e.id,revision:e.revision})),[{...photo.answer,value:2019},{fieldCode:'role.started_year',roleCode:'director',state:'NOT_PROVIDED'}]));
 const after=f.ok(await f.a.client.raw('GET','/portal/supplier-profiles/'+saved.personId,undefined,f.headers())).profile.professional.answers;
 assert.equal(after.find((a:ProfessionalAnswer)=>a.roleCode==='photographer').value,2019);
 assert.deepEqual(after.find((a:ProfessionalAnswer)=>a.roleCode==='director'),{fieldCode:'role.started_year',roleCode:'director',state:'NOT_PROVIDED'});
 const current=await snapshot();assert.equal(current.person!.revision,before.person!.revision+1);
 assert.equal(current.facts.filter(r=>r.status==='RETIRED').length,2);assert.equal(current.facts.filter(r=>r.status==='ACTIVE').length,2);
});
test('replacement rejects withdrawn source without retiring current facts or changing exposure',async()=>{
 const {f,store,professional,create,confirm}=await setup(),saved=await confirm(await create([{fieldCode:'camera.specialties',roleCode:'photographer',state:'KNOWN',value:['steadicam']}]));
 const detail=f.ok(await f.owner.raw('GET','/people/'+saved.personId+'/professional')),entry=detail.entries[0];
 await store.transaction(async tx=>{const source=(await tx.get('sources',entry.sourceId))!;await tx.replace('sources',{...source,status:'SUSPENDED'});});
 const snapshot=()=>store.transaction(async tx=>({person:await tx.get('people',saved.personId),facts:await tx.find('supplierFacts',{personId:saved.personId}),grants:await tx.find('talentAccessGrants',{personId:saved.personId})}));
 const before=await snapshot();assert.equal((await f.owner.cmd('POST','/people/'+saved.personId+'/professional',{expectedPersonRevision:detail.revision,sourceId:f.sourceId,sourceRevision:1,
  professional:professional([{...entry.answer,value:['trinity']}]),replace:[{id:entry.id,revision:entry.revision}]})).status,404);
 assert.deepEqual(await snapshot(),before);
});
test('dynamic professional facts remain typed, encrypted, role-specific and self-confirmed on the same Person',async()=>{
 const {f,store,schema,create,confirm}=await setup();assert.ok(!JSON.stringify(schema).includes('internal.relationship_tags'));
 const answers:ProfessionalAnswer[]=[{fieldCode:'camera.duties',roleCode:'photographer',state:'KNOWN',value:['dp','camera_operator']},
  {fieldCode:'person.education',roleCode:null,state:'KNOWN',value:[{id:randomUUID(),values:{institution:'匿名培训机构',program:'摄影进修',from:'2022-09-01'}}]}];
 const draft=await create(answers),saved=await confirm(draft),own=f.ok(await f.a.client.raw('GET','/portal/supplier-profiles/'+saved.personId,undefined,f.headers()));
 assert.equal(own.profile.professional.answers.length,2);assert.deepEqual(own.profile.professional.answers.find((a:ProfessionalAnswer)=>a.fieldCode==='camera.duties').value,['camera_operator','dp']);
 assert.ok(!JSON.stringify(await store.transaction(tx=>tx.find('supplierFacts'))).includes('匿名培训机构'));
 const detail=f.ok(await f.owner.raw('GET','/people/'+saved.personId+'/professional'));assert.equal(detail.entries.length,2);assert.equal(detail.entries[0].sourceTitle,'供应商本人确认资料');
 assert.equal((await store.transaction(tx=>tx.find('people'))).filter(p=>p.id===saved.personId).length,1);
});
test('published catalogs preserve old drafts and reject type reinterpretation and deleted option codes',async()=>{
 const {f,schema,create,confirm}=await setup(),draft=await create([{fieldCode:'camera.specialties',roleCode:'photographer',state:'KNOWN',value:['steadicam']}]);
 const master=f.ok(await f.owner.raw('GET','/supplier-field-catalog')),definition=structuredClone(master.current.definition);
 definition.fields.find((f:{code:string})=>f.code==='camera.specialties').options.push({code:'virtual_production',label:'虚拟制片',aliases:[],status:'ACTIVE'});
 const created=f.ok(await f.owner.cmd('POST','/supplier-field-catalog',{baseVersion:1,definition}),201);
 f.ok(await f.owner.cmd('POST','/supplier-field-catalog/'+created.resourceId+'/publish',{expectedRevision:created.revision,reason:'增加摄影专业选项'}));
 assert.equal((await f.read(draft.resourceId)).fieldCatalog.version,1);const saved=await confirm(draft);
 const own=f.ok(await f.a.client.raw('GET','/portal/supplier-profiles/'+saved.personId,undefined,f.headers()));assert.equal(own.profile.professional.catalogVersion,2);
 const invalid=structuredClone(definition);invalid.fields.find((f:{code:string})=>f.code==='role.started_year').type='TEXT';
 assert.equal((await f.owner.cmd('POST','/supplier-field-catalog',{baseVersion:2,definition:invalid})).status,422);
 const removed=structuredClone(definition);removed.fields.find((f:{code:string})=>f.code==='camera.specialties').options.shift();
 assert.equal((await f.owner.cmd('POST','/supplier-field-catalog',{baseVersion:2,definition:removed})).status,422);
 assert.equal((await f.owner.cmd('PATCH','/supplier-field-catalog/'+created.resourceId,{expectedRevision:2,definition})).status,409);
});
test('ONCE corrections update explicitly shared professional facts and fence stale self drafts',async()=>{
 const {f,create,confirm}=await setup(),saved=await confirm(await create([{fieldCode:'camera.specialties',roleCode:'photographer',state:'KNOWN',value:['steadicam']}]));
 const own=f.ok(await f.a.client.raw('GET','/portal/supplier-profiles/'+saved.personId,undefined,f.headers()));
 const stale=f.ok(await f.a.client.raw('POST','/portal/profile-drafts',{...f.input,claimId:undefined,grantId:own.grantId,profile:own.profile},f.headers()));
 const detail=f.ok(await f.owner.raw('GET','/people/'+saved.personId+'/professional')),e=detail.entries[0];
 f.ok(await f.owner.cmd('POST','/people/'+saved.personId+'/professional',{expectedPersonRevision:detail.revision,sourceId:f.sourceId,sourceRevision:1,
  professional:{catalogVersion:detail.catalog.version,catalogDigest:detail.catalog.digest,answers:[{...e.answer,value:['steadicam','trinity']}]},replace:[{id:e.id,revision:e.revision}]}));
 const after=f.ok(await f.a.client.raw('GET','/portal/supplier-profiles/'+saved.personId,undefined,f.headers()));assert.deepEqual(after.profile.professional.answers[0].value,['steadicam','trinity']);
 assert.equal((await f.a.client.raw('POST','/portal/profile-drafts/'+stale.resourceId+'/confirm',{expectedRevision:stale.revision,accepted:true},f.headers())).status,409);
 const current=f.ok(await f.owner.raw('GET','/people/'+saved.personId+'/professional'));
 f.ok(await f.owner.cmd('POST','/people/'+saved.personId+'/professional',{expectedPersonRevision:current.revision,sourceId:f.sourceId,sourceRevision:1,
  professional:{catalogVersion:current.catalog.version,catalogDigest:current.catalog.digest,answers:[{fieldCode:'internal.relationship_tags',roleCode:null,state:'KNOWN',value:['needs_followup']}]},replace:[]}));
 assert.ok(!JSON.stringify(f.ok(await f.a.client.raw('GET','/portal/supplier-profiles/'+saved.personId,undefined,f.headers()))).includes('needs_followup'));
});
test('new fields reject cross-role data, invented options, fake dates and empty multi selections',async()=>{
 const {f,professional}=await setup();for(const answer of [
  {fieldCode:'camera.duties',roleCode:'director',state:'KNOWN',value:['dp']},
  {fieldCode:'camera.duties',roleCode:'photographer',state:'KNOWN',value:['invented']},
  {fieldCode:'camera.duties',roleCode:'photographer',state:'KNOWN',value:[]},
  {fieldCode:'internal.relationship_tags',roleCode:null,state:'KNOWN',value:['contacted']},
 ]){const r=await f.a.client.raw('POST','/portal/profile-drafts',{...f.input,profile:{...f.profile,professional:professional([answer as ProfessionalAnswer])}},f.headers());assert.ok([400,422].includes(r.status),JSON.stringify(r.body));}
 assert.throws(()=>validateScalar('2026-02-31',{code:'day',label:'日期',type:'DATE',required:false}));
 assert.deepEqual(validateFieldCatalog(DEFAULT_SUPPLIER_FIELD_CATALOG),DEFAULT_SUPPLIER_FIELD_CATALOG);
});
test('confirmation audit failure rolls professional facts and choices back with the rest of the profile',async()=>{
 const {f,store,create}=await setup(),d=await create([{fieldCode:'camera.duties',roleCode:'photographer',state:'KNOWN',value:['dp']}]);store.failNextAudit=true;
 assert.equal((await f.a.client.raw('POST','/portal/profile-drafts/'+d.resourceId+'/confirm',{expectedRevision:d.revision,accepted:true},f.headers())).status,500);
 assert.equal((await store.transaction(tx=>tx.find('supplierFacts'))).length,0);assert.equal((await store.transaction(tx=>tx.find('supplierFactChoices'))).length,0);
});
test('structured tag search supports ANY and ALL on the same role, with no missing-as-negative or private source leakage',async()=>{
 const {f,create,confirm}=await setup(),saved=await confirm(await create([{fieldCode:'production.focus',roleCode:'photographer',state:'KNOWN',value:['commercial','fashion']},{fieldCode:'camera.specialties',roleCode:'photographer',state:'UNKNOWN'},{fieldCode:'production.focus',roleCode:'director',state:'KNOWN',value:['documentary']}]));
 const search=async(fields:unknown[],roleCode='photographer')=>f.ok(await f.owner.raw('POST','/directory/talents/search',{q:'林光',professional:{roleCode,fields}}));
 assert.ok((await search([{fieldCode:'production.focus',codes:['fashion','documentary'],match:'ANY'}])).items.some((r:{id:string})=>r.id===saved.personId));
 assert.equal((await search([{fieldCode:'production.focus',codes:['fashion','documentary'],match:'ALL'}])).total,0,'must not pool director tags into photographer facts');
 assert.equal((await search([{fieldCode:'production.focus',codes:['fashion','commercial'],match:'ALL'}])).total,1);
 assert.equal((await search([{fieldCode:'camera.specialties',state:'DECLARED_NONE'}])).total,0);
 assert.equal((await search([{fieldCode:'camera.specialties',state:'UNKNOWN'}])).total,1);
 assert.equal((await search([{fieldCode:'role.started_year',state:'NOT_PROVIDED'}])).total,1);
 assert.equal((await search([{fieldCode:'camera.specialties',state:'NOT_PROVIDED'}])).total,0);
 const closed=await f.read(saved.id),consent=closed.consent;
 f.ok(await f.a.client.raw('POST','/portal/consents/'+consent.id+'/revoke',{expectedRevision:consent.revision},f.headers()));
 assert.equal((await search([{fieldCode:'production.focus',codes:['fashion']}])).total,0);
});
test('native professional details reuse capability, credential, translation and dated measurement tables',async()=>{
 const {f,store}=await setup();
 const capability=f.ok(await f.owner.cmd('POST','/td2/capability-definitions',{schemaVersion:'once-talent-v2.1.0',code:'resolve_synthetic',labelZh:'合成调色工具',labelEn:'',aliases:[],applicableRoleCodes:['photographer','director'],levelSchemeCode:'ABILITY_5',semanticVersion:'1.0.0'}),201);
 const profile={...f.profile,roleCodes:['photographer','director','model','translator'],capabilityDetails:[{roleCode:'photographer',capabilityCode:'resolve_synthetic',levelCode:'PROFESSIONAL'}],credentials:[{roleCode:'photographer',credentialTypeCode:'EQUIPMENT_CERTIFICATE',credentialName:'合成稳定器培训资格',issuerName:'合成机构',issuedOn:'2024-05-01',expiresOn:null}],translation:{pairs:[{sourceLanguageCode:'zh',targetLanguageCode:'en'}],modeCodes:['ON_SET']},measurements:{...f.profile.measurements,shoeSizeValue:'39',shoeSizeSystem:'EU',measuredOn:'2026-10-20',datePrecision:'EXACT_DAY'}};
 const draft=f.ok(await f.a.client.raw('POST','/portal/profile-drafts',{...f.input,profile},f.headers()));
 f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+draft.resourceId+'/confirm',{expectedRevision:draft.revision,accepted:true},f.headers()));const saved=await f.read(draft.resourceId);
 const own=f.ok(await f.a.client.raw('GET','/portal/supplier-profiles/'+saved.personId,undefined,f.headers()));assert.deepEqual(own.profile.capabilityDetails,profile.capabilityDetails);assert.deepEqual(own.profile.translation,profile.translation);assert.deepEqual(own.profile.credentials,profile.credentials);assert.equal(own.profile.measurements.shoeSizeSystem,'EU');assert.equal(own.profile.measurements.measuredOn,'2026-10-20');
 const rows=await store.transaction(async tx=>({capabilities:await tx.find('personCapabilities',{personId:saved.personId}),credentials:await tx.find('personCredentials',{personId:saved.personId}),pairs:await tx.find('translatorLanguagePairs',{personId:saved.personId}),measurements:await tx.find('measurementSets',{personId:saved.personId})}));
 assert.equal(rows.capabilities.length,1);assert.equal(rows.credentials[0]!.status,'UNVERIFIED');assert.equal(rows.credentials[0]!.credentialName,'合成稳定器培训资格');assert.equal(rows.pairs.length,1);assert.equal(rows.measurements[0]!.heightCm,null);
 const filtered=f.ok(await f.owner.raw('POST','/directory/talents/search',{q:'林光',professional:{roleCode:'photographer',fields:[],capabilities:[{capabilityCode:'resolve_synthetic',minLevel:'WORKING'}]}}));assert.equal(filtered.total,1);
 const wrongRole=f.ok(await f.owner.raw('POST','/directory/talents/search',{q:'林光',professional:{roleCode:'director',fields:[],capabilities:[{capabilityCode:'resolve_synthetic',minLevel:'BASIC'}]}}));assert.equal(wrongRole.total,0);
});
test('catalogs and typed fields participate in recovery integrity and explicit person cleanup',async()=>{
 const {f,store,create,confirm}=await setup(),saved=await confirm(await create([{fieldCode:'person.education',roleCode:null,state:'KNOWN',value:[{id:randomUUID(),values:{institution:'匿名恢复样本'}}]}]));
 const workspaceId=(await store.transaction(tx=>tx.get('sources',f.sourceId)))!.workspaceId;
 const report=await store.transaction(tx=>inspectTalentIntegrity(tx,workspaceId,f.app.config.contactKey,f.clock));assert.equal(report.relationFailures,0);assert.equal(report.professionalFactFailures,0);
 const snapshot=await store.transaction(tx=>supplierFieldSnapshot(tx,workspaceId,[saved.personId]));assert.ok(snapshot.count>0);
 await store.transaction(async tx=>{await eraseSupplierFields(tx,workspaceId,[saved.personId]);await revokePersonMaintenance(tx,workspaceId,[saved.personId],f.clock,true);});
 assert.equal((await store.transaction(tx=>supplierFieldSnapshot(tx,workspaceId,[saved.personId]))).count,0);assert.equal((await f.a.client.raw('GET','/portal/profile-drafts/'+saved.id,undefined,f.headers())).status,404);
});
test('a source holding only new professional facts receives a complete deletion plan and cleans without deleting the Person',async()=>{
 const {f,store,create,confirm}=await setup(),saved=await confirm(await create([])),source=f.ok(await f.owner.cmd('POST','/sources',{...sourceInput(),title:'Synthetic extension-only source'}),201);
 const detail=f.ok(await f.owner.raw('GET','/people/'+saved.personId+'/professional'));
 f.ok(await f.owner.cmd('POST','/people/'+saved.personId+'/professional',{expectedPersonRevision:detail.revision,sourceId:source.resourceId,sourceRevision:1,professional:{catalogVersion:detail.catalog.version,catalogDigest:detail.catalog.digest,answers:[{fieldCode:'role.started_year',roleCode:'photographer',state:'KNOWN',value:2018}]},replace:[]}));
 const preview=f.ok(await f.owner.raw('POST','/deletion-requests/preview',{targetKind:'SOURCE',targetId:source.resourceId,expectedRevision:1}));assert.equal(preview.complete,true,JSON.stringify(preview.unresolved));assert.ok(preview.items.some((i:{resourceKind:string})=>i.resourceKind==='talentSourceFactGraph'));
 const request=f.ok(await f.owner.cmd('POST','/deletion-requests',{targetKind:'SOURCE',targetId:source.resourceId,expectedRevision:1,previewDigest:preview.previewDigest,reason:'Synthetic source withdrawal clears extension facts'}),201);
 const current=()=>store.transaction(async tx=>(await tx.get('deletionRequests',request.resourceId))!);
 f.ok(await f.owner.cmd('POST','/deletion-requests/'+request.resourceId+'/block',{expectedRevision:request.revision,previewDigest:preview.previewDigest,acknowledgeBlock:true}));
 for(const item of await store.transaction(tx=>tx.find('deletionItems',{requestId:request.resourceId})))if(item.decision==='PENDING')f.ok(await f.owner.cmd('POST','/deletion-requests/'+request.resourceId+'/decisions',{expectedRevision:(await current()).revision,entryId:item.id,decision:'APPLY_PROPOSED',decisionReason:'Synthetic explicit source cleanup'}));
 f.ok(await f.owner.cmd('POST','/deletion-requests/'+request.resourceId+'/plan/freeze',{expectedRevision:(await current()).revision,acknowledgePlan:true}));
 f.ok(await f.owner.cmd('POST','/deletion-requests/'+request.resourceId+'/cleaning/start',{expectedRevision:(await current()).revision,planDigest:(await current()).planDigest,acknowledgeIrreversible:true}));
 const cleanup=new DeletionCleanup(store,f.clock,f.app.config),claim=await cleanup.claim();assert.ok(claim);await cleanup.process(claim);const final=await f.app.deletionFinalization.claim();assert.ok(final);await f.app.deletionFinalization.finish(final);
 assert.equal((await store.transaction(tx=>tx.get('sources',source.resourceId)))!.status,'ERASED');assert.equal((await store.transaction(tx=>tx.find('supplierFacts',{sourceId:source.resourceId}))).length,0);assert.equal((await store.transaction(tx=>tx.get('people',saved.personId)))!.status,'ACTIVE');
});
