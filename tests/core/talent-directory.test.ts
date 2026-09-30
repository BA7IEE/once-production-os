import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,member,result,sourceInput} from '../support/fixtures.ts';
import {expectResponse as ok} from '../support/talent-v2-maintenance.ts';
import {ageRange} from '../../packages/core/src/talent-demographics.ts';
import {TransferSchema} from '../../packages/core/src/talent-transfer.ts';
async function search(f:Awaited<ReturnType<typeof fixture>>,query:string){return f.owner.raw('POST','/directory/talents/search',Object.fromEntries([...new URLSearchParams(query.replace(/^\?/,''))].map(([k,v])=>[k,['ageMin','ageMax','heightMin','heightMax'].includes(k)?Number(v):v])));}
async function setup(){const f=await fixture();const sourceId=ok(await f.owner.cmd('POST','/sources',sourceInput())).resourceId;
 const id=ok(await f.owner.cmd('POST','/directory/talents',{schemaVersion:'once-talent-experience-v1',displayName:'合成目录模特',kind:'TALENT',roleCodes:['model','actor'],sourceId,sourceRevision:1})).resourceId;
 const patch=async(values:Record<string,unknown>,key?:string)=>f.owner.cmd('PATCH',`/directory/talents/${id}`,{schemaVersion:'once-talent-experience-v1',expectedRevision:f.store.rows('people').find(p=>p.id===id)!.revision,sourceId,sourceRevision:1,...values},key);
 return {...f,id,sourceId,patch};}
test('PR01b composed maintenance persists attributes and shared filters, without nationality inference or fabricated measurement date',async()=>{
 const f=await setup();ok(await f.patch({profile:{genderCode:'FEMALE',birthPrecision:'YEAR_ONLY',birthYear:2000,nationalityCodes:['US']},model:{castingMarketCode:'DOMESTIC',experienceCode:'AMATEUR',styleCodes:['natural'],serviceCodes:['print']},locationCode:'shenzhen',measurement:{heightCm:175,measuredOn:null,datePrecision:'UNKNOWN'},confirmMeasurement:true}),200);
 const p=f.store.rows('talentProfiles')[0]!,r=f.store.rows('personRoles').find(r=>r.roleCode==='model')!,m=f.store.rows('measurementSets')[0]!;
 assert.equal(p.birthYear,2000);assert.deepEqual(p.nationalityCodes,['US']);assert.equal(r.castingMarketCode,'DOMESTIC');assert.equal(m.reportedAt,m.createdAt);assert.equal(m.measuredOn,null);assert.equal(m.status,'CONFIRMED');
 const q='?role=model&gender=FEMALE&nationality=US&market=DOMESTIC&experience=AMATEUR&style=natural&service=print&location=shenzhen&ageMin=25&ageMax=26&heightMin=170';
 const a=ok(await search(f,q),200),b=ok(await f.owner.raw('GET','/td2/people'+q),200);assert.deepEqual(a.items,b.items);assert.equal(a.total,b.total);assert.equal(a.facets.roles.model,1);assert.equal(a.facets.roles.actor,0,'actor option cannot borrow model classifications');assert.equal(a.total,1);assert.equal(a.items[0].id,f.id);assert.equal(a.facets.genders.FEMALE,1);
 assert.equal(ok(await search(f,q.replace('ageMax=26','ageMax=25')),200).total,0,'year-only includes possible age 26');
 assert.equal(ok(await search(f,q.replace('nationality=US','nationality=CN')),200).total,0);
 assert.equal(ok(await search(f,q.replace('role=model','role=actor')),200).total,0,'another occupation cannot borrow model fields');
});
test('PR01b rejects contradictory birth branches, fake unknown dates, non-model labels and stale atomic commands',async()=>{
 const f=await setup(),before=JSON.stringify(f.store.rows('talentProfiles'));
 for(const values of [{profile:{birthPrecision:'YEAR_ONLY',birthYear:null}},{profile:{birthPrecision:'UNKNOWN',birthYear:2001}},{profile:{birthPrecision:'DECLARED_RANGE',minAgeYears:30,maxAgeYears:20,ageAsOfDate:'2026-09-23'}},{measurement:{heightCm:175,measuredOn:'2026-09-23',datePrecision:'UNKNOWN'}}])assert.equal((await f.patch(values)).status,422);
 assert.equal(JSON.stringify(f.store.rows('talentProfiles')),before);
 const actorRole=f.store.rows('personRoles').find(r=>r.roleCode==='actor')!;
 assert.equal((await f.owner.cmd('PATCH',`/td2/roles/${actorRole.id}`,{schemaVersion:'once-talent-v2.1.0',expectedRevision:1,expectedPersonRevision:f.store.rows('people')[0]!.revision,sourceId:f.sourceId,sourceRevision:1,values:{experienceCode:'AMATEUR'}})).status,422);
 const key=randomUUID(),input={schemaVersion:'once-talent-experience-v1',expectedRevision:f.store.rows('people')[0]!.revision,sourceId:f.sourceId,sourceRevision:1,profile:{genderCode:'FEMALE'},model:{experienceCode:'PROFESSIONAL'}};
 f.store.failNextAudit=true;assert.equal((await f.owner.cmd('PATCH',`/directory/talents/${f.id}`,input,key)).status,500);assert.equal(JSON.stringify(f.store.rows('talentProfiles')),before);
 ok(await f.owner.cmd('PATCH',`/directory/talents/${f.id}`,input,key),200);assert.equal(result(await f.owner.cmd('PATCH',`/directory/talents/${f.id}`,input,key)).replayed,true);
 assert.equal((await f.owner.cmd('PATCH',`/directory/talents/${f.id}`,input)).status,409);
});
test('PR01b complete birth date needs separate grants, safe derived ages remain available and hidden source cannot match',async()=>{
 const f=await setup(),ordinary=await member(f,'ordinary','ADMIN');assert.equal((await ordinary.client.cmd('PATCH',`/directory/talents/${f.id}`,{schemaVersion:'once-talent-experience-v1',expectedRevision:f.store.rows('people')[0]!.revision,sourceId:f.sourceId,sourceRevision:1,profile:{birthPrecision:'EXACT_DATE',birthDate:'2000-05-01'}})).status,403);
 const sensitive=await member(f,'birthday','ADMIN',['sensitive.read','sensitive.write']);
 ok(await sensitive.client.cmd('PATCH',`/directory/talents/${f.id}`,{schemaVersion:'once-talent-experience-v1',expectedRevision:f.store.rows('people')[0]!.revision,sourceId:f.sourceId,sourceRevision:1,profile:{birthPrecision:'EXACT_DATE',birthDate:'2000-05-01'}}),200);
 const detail=ok(await ordinary.client.raw('GET',`/directory/talents/${f.id}`),200);assert.equal(detail.facts.talentProfiles[0].birthDate,null);assert.ok(detail.facts.talentProfiles[0].unavailableFields.includes('birthDate'));assert.equal(detail.ageRange.min,26);
 assert.equal(ok(await sensitive.client.raw('GET',`/directory/talents/${f.id}`),200).facts.talentProfiles[0].birthDate,'2000-05-01');
 const viewer=await member(f,'readonly','VIEWER');assert.equal((await viewer.client.cmd('PATCH',`/directory/talents/${f.id}`,{schemaVersion:'once-talent-experience-v1',expectedRevision:1,sourceId:f.sourceId,sourceRevision:1,profile:{genderCode:'MALE'}})).status,403);
 ok(await f.owner.cmd('POST',`/sources/${f.sourceId}/suspend`,{expectedRevision:1,reason:'合成依据暂停'}),200);assert.equal(ok(await search(f,'?ageMin=20'),200).total,0);
});
test('PR01b unknown and declared ages keep precision through time and v14 imports gain unknown defaults',()=>{
 assert.equal(ageRange({birthPrecision:'UNKNOWN'},'2026-09-30'),null);
 assert.deepEqual(ageRange({birthPrecision:'DECLARED_RANGE',minAgeYears:20,maxAgeYears:22,ageAsOfDate:'2025-09-30'},'2026-09-30'),{min:21,max:23,asOf:'2026-09-30',precision:'DECLARED_RANGE'});
 const bundle=TransferSchema.parse({schemaVersion:'once-talent-transfer-v14',selectedFields:[],tables:{talentProfiles:[],personRoles:[],personLanguages:[],talentLocations:[],personExternalRefs:[],personCredentials:[],castingProfiles:[],measurementSets:[],adultEligibilities:[],translatorLanguagePairs:[],translatorServiceModes:[],representations:[],personCapabilities:[],mediaCollections:[],mediaCollectionTags:[]},identityFields:[],identityEvidence:[],capabilityDefinitions:[],organizations:[],evidence:[],assets:[],collectionItems:[],identifierContextWorkspaceId:randomUUID(),credentialIdentifiersIncluded:false,retainedOrigins:[]});assert.equal(bundle.schemaVersion,'once-talent-transfer-v15');
});

test('PR01b POST query is strict, authenticated and read-only: no key, receipt or business audit',async()=>{const f=await setup(),receipts=f.store.rows('receipts').length,audits=f.store.rows('audits').length;
 assert.equal((await f.owner.raw('POST','/directory/talents/search',{gender:'FEMALE',page:1,pageSize:20})).status,200);assert.equal(f.store.rows('receipts').length,receipts);assert.equal(f.store.rows('audits').length,audits);
 assert.equal((await f.owner.raw('POST','/directory/talents/search',{page:1,hiddenField:'forbidden'})).status,400);assert.equal((await f.owner.raw('POST','/directory/talents/search',{}, {'origin':'https://different.invalid'})).status,403);assert.equal((await f.owner.raw('POST','/directory/talents/search',{}, {'x-csrf-token':''})).status,403);
});

test('PR01b server receipt time cannot be forged and legacy writes refuse new fields',async()=>{const f=await setup();assert.equal((await f.owner.cmd('POST','/catalog/items',{namespace:'nationality',code:'ca',labelZh:'合成国籍',labelEn:'Synthetic'})).status,400);assert.equal((await f.owner.cmd('POST','/catalog/items',{namespace:'city',code:'UPPER_CITY',labelZh:'合成城市',labelEn:'Synthetic'})).status,400);ok(await f.owner.cmd('POST','/catalog/items',{namespace:'nationality',code:'CA',labelZh:'合成加拿大',labelEn:'Synthetic Canada'}),201);const input={schemaVersion:'once-talent-v2.1.0',expectedPersonRevision:f.store.rows('people')[0]!.revision,sourceId:f.sourceId,sourceRevision:1,values:{heightCm:175,measuredOn:null,datePrecision:'UNKNOWN',reportedAt:'2026-01-01T00:00:00.000Z'}};assert.equal((await f.owner.cmd('POST',`/td2/people/${f.id}/measurements`,input)).status,400);assert.equal((await f.owner.cmd('PATCH',`/td2/profile/${f.store.rows('talentProfiles')[0]!.id}`,{schemaVersion:'once-talent-v2.0.0',expectedRevision:1,expectedPersonRevision:input.expectedPersonRevision,sourceId:f.sourceId,sourceRevision:1,values:{genderCode:'FEMALE'}})).status,422);const {reportedAt,...values}=input.values;assert.equal((await f.owner.cmd('POST',`/td2/people/${f.id}/measurements`,{...input,schemaVersion:'once-talent-v2.0.0',values})).status,422);});

test('PR01b birthday proposals stay restricted and export requires new exact grants on both person and source',async()=>{
 const {controlledTransfer}=await import('../support/talent-transfer.ts'),{BIRTH_DATE_CODE}=await import('../../packages/core/src/talent-transfer.ts'),{JsonRebuild}=await import('../../packages/core/src/rebuild.ts');
 const f=await fixture(),t=await controlledTransfer(f.app,f.store,f.clock,f.owner),id=t.graph.personId;
 const legacy=structuredClone(t.bundle);legacy.schemaVersion='once-talent-transfer-v14' as any;for(const r of legacy.tables.talentProfiles)for(const k of ['genderCode','birthPrecision','birthDate','birthYear','minAgeYears','maxAgeYears','ageAsOfDate','nationalityCodes','coverAssetId'])delete r.data[k];for(const r of legacy.tables.personRoles)for(const k of ['castingMarketCode','experienceCode','styleCodes','serviceCodes'])delete r.data[k];for(const r of legacy.tables.measurementSets)delete r.data.reportedAt;const parsed=TransferSchema.parse(legacy);assert.equal(parsed.tables.talentProfiles[0]!.data.birthPrecision,'UNKNOWN');assert.equal(parsed.tables.measurementSets[0]!.data.reportedAt,null);
 ok(await f.owner.cmd('PATCH',`/directory/talents/${id}`,{schemaVersion:'once-talent-experience-v1',expectedRevision:(await t.graph.current()).revision,sourceId:t.graph.sourceId,sourceRevision:1,profile:{birthPrecision:'EXACT_DATE',birthDate:'2000-05-01'}}),200);
 const profile=f.store.rows('talentProfiles').find(p=>p.personId===id)!;
 ok(await f.owner.cmd('POST','/td2/proposals',{schemaVersion:'once-talent-v2.1.0',ownerKind:'talentProfiles',ownerId:profile.id,fieldPath:'birthDate',expectedRevision:profile.revision,sourceId:t.graph.sourceId,sourceRevision:1,proposedValue:'2000-05-02'}),201);
 const ordinary=await member(f,'no_birth','ADMIN');assert.equal(JSON.stringify(ok(await ordinary.client.raw('GET','/td2/proposals?personId='+id),200)).includes('2000-05-02'),false);
 assert.equal((await f.owner.cmd('POST','/exports',{...t.input,fields:t.input.fields.filter(f=>f!=='person.td2.talentProfiles').concat('person.td2.birthDate' as any)})).status,422,'birthday cannot travel without typed profile');
 assert.equal((await f.owner.cmd('POST','/exports',t.input)).status,422,'old professional grants do not include birthday');
 const input={...t.input,fields:[...t.input.fields,BIRTH_DATE_CODE]};assert.equal((await f.owner.cmd('POST','/exports',input)).status,422,'adding field needs independent permission');
 const refs:string[]=[];for(const [subjectKind,subjectId]of [['PERSON',id],['SOURCE',t.graph.sourceId]])refs.push(ok(await f.owner.cmd('POST','/use-permissions',{subjectKind,subjectId,sourceId:t.graph.sourceId,fields:[...f.store.rows('usePermissions').find(p=>p.subjectKind===subjectKind&&p.subjectId===subjectId)!.fields,BIRTH_DATE_CODE],validUntil:'2026-10-01T00:00:00.000Z',evidenceNote:'合成：单独批准生日迁移'})).resourceId);
 const permitted={...input,usePermissionRefs:[...input.usePermissionRefs.filter(ref=>{const p=f.store.rows('usePermissions').find(p=>p.id===ref)!;return !(p.subjectKind==='PERSON'&&p.subjectId===id||p.subjectKind==='SOURCE'&&p.subjectId===t.graph.sourceId);}),...refs]};assert.equal((await ordinary.client.cmd('POST','/exports',permitted)).status,403);
 const job=ok(await f.owner.cmd('POST','/exports',permitted),202).resourceId,claim=await f.app.exports.claim();assert.ok(claim);await f.app.exports.process(claim);const payload=ok(await f.owner.raw('POST',`/exports/${job}/download`,{}),200).payload;assert.equal(payload.manifest.talent.tables.talentProfiles.find((r:any)=>r.id===profile.id).data.birthDate,'2000-05-01');
 const target=await fixture(),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
 await target.store.transaction(async tx=>{const m=(await tx.get('memberships',actor.membershipId))!;await tx.replace('memberships',{...m,extraPermissions:[]});});
 await assert.rejects(target.store.transaction(tx=>rebuild.preview(tx,actor,payload)),/权限/,'cached actor does not bypass actual target birthday write permission');
 assert.equal(target.store.rows('people').length,0);
});
