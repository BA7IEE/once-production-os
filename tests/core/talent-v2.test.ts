import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, result, sourceInput, member } from '../support/fixtures.ts';
import type { ApiResponse } from '../../packages/core/src/api.ts';
import { TALENT_SCHEMA_VERSION as schemaVersion } from '../../packages/core/src/talent-v2-model.ts';
import { TD2_FACTS, type FactTable } from '../../packages/core/src/talent-v2-schema.ts';
import { base } from '../../packages/core/src/helpers.ts';
import { decryptContact } from '../../packages/core/src/crypto.ts';
type F=Awaited<ReturnType<typeof setup>>;
function ok(r:ApiResponse,status=201){assert.equal(r.status,status,JSON.stringify(r.body));return result(r);}
async function setup(talent=true){
    const f=await fixture(),s=ok(await f.owner.cmd('POST','/sources',sourceInput()));
    const p=ok(await f.owner.cmd('POST','/td2/people',{schemaVersion,originSourceId:s.resourceId,sourceRevision:1,displayName:'合成人物',createTalent:talent}));
    return {...f,personId:p.resourceId as string,sourceId:s.resourceId as string};
}
const pRev=(f:F)=>f.store.rows('people').find(p=>p.id===f.personId)!.revision;
async function add(f:F,table:FactTable,values:Record<string,unknown>,sourceId=f.sourceId){return f.owner.cmd('POST',`/td2/people/${f.personId}/${TD2_FACTS[table].slug}`,{schemaVersion,expectedPersonRevision:pRev(f),sourceId,sourceRevision:f.store.rows('sources').find(s=>s.id===sourceId)!.revision,values});}
async function detail(f:F){return ok(await f.owner.raw('GET',`/td2/people/${f.personId}`),200);}
async function asset(f:F){
    const row={...base(f.workspaceId,f.clock),uploadId:randomUUID(),sourceId:f.sourceId,scopeId:f.store.rows('scopes')[0]!.id,objectToken:randomUUID(),personId:f.personId,fileName:'synthetic.png',mime:'image/png',sha256:'a'.repeat(64),previewHash:'b'.repeat(64),state:'READY' as const,bytes:30,width:3,height:3,previewBytes:30};
    await f.store.transaction(async tx=>{await tx.insert('assets',row);});return row;
}
async function confirm(f:F,kind:'measurements'|'external-refs'|'credentials',id:string,action='verify'){
    const table=kind==='measurements'?'measurementSets':kind==='external-refs'?'personExternalRefs':'personCredentials';
    const row=f.store.rows(table).find(r=>r.id===id)!;
    return f.owner.cmd('POST',`/td2/${kind}/${id}/${action}`,{schemaVersion,expectedRevision:row.revision,expectedPersonRevision:pRev(f),sourceRevision:1});
}

test('TD2-T01 contact identity is independent from talent enrollment and preserves UUID',async()=>{
    const f=await setup(false);assert.equal((await detail(f)).isTalent,false);
    assert.equal((await add(f,'personRoles',{roleCode:'model'})).status,409);
    ok(await add(f,'personLanguages',{languageCode:'en'}));
    ok(await f.owner.cmd('POST',`/td2/people/${f.personId}/enroll`,{schemaVersion,expectedRevision:pRev(f),sourceRevision:1}),200);
    const view=await detail(f);assert.equal(view.id,f.personId);assert.equal(view.isTalent,true);assert.equal(view.facts.personRoles.length,0);
});
test('TD2-T02 one identity has model and translator roles; overlapping duplicate role rejected',async()=>{
    const f=await setup();ok(await add(f,'personRoles',{roleCode:'model'}));ok(await add(f,'personRoles',{roleCode:'translator'}));
    assert.equal((await add(f,'personRoles',{roleCode:'model'})).status,409);
    assert.equal((await detail(f)).facts.personRoles.length,2);assert.equal(f.store.rows('people').length,1);
});
test('TD2-T03 source-bound claims stay independent; origin suspension does not authorize or erase other-source facts',async()=>{
    const f=await setup(),s2=ok(await f.owner.cmd('POST','/sources',sourceInput()));
    ok(await add(f,'personLanguages',{languageCode:'en',speakingLevelCode:'WORKING'},s2.resourceId));
    ok(await f.owner.cmd('POST',`/sources/${f.sourceId}/suspend`,{expectedRevision:1,reason:'合成来源暂停测试'}),200);
    const view=await detail(f);assert.equal(view.originAvailable,false);assert.equal(view.facts.personLanguages[0].speakingLevelCode,'WORKING');
    const search=ok(await f.owner.raw('GET','/td2/people?language=en&languageLevel=WORKING'),200);assert.equal(search.total,1);
});
test('TD2-T04 exact external reference resolves only after human verification; same names do not merge',async()=>{
    const f=await setup();const ref=ok(await add(f,'personExternalRefs',{providerCode:'WECHAT',namespaceCode:'supplier',externalKey:'synthetic-ref'}));
    const q='/td2/resolve?providerCode=WECHAT&namespaceCode=supplier&externalKey=synthetic-ref';
    assert.equal((await f.owner.raw('GET',q)).status,404);ok(await confirm(f,'external-refs',ref.resourceId),200);
    assert.equal(ok(await f.owner.raw('GET',q),200).personId,f.personId);
    assert.equal((await add(f,'personExternalRefs',{providerCode:'WECHAT',namespaceCode:'supplier',externalKey:'synthetic-ref'})).status,409);
    ok(await confirm(f,'external-refs',ref.resourceId,'revoke'),200);assert.equal((await f.owner.raw('GET',q)).status,404);
});
test('TD2-T06 capability registry is separate from occupational roles and validates applicable roles and levels',async()=>{
    const f=await setup(),role=ok(await add(f,'personRoles',{roleCode:'model'}));
    assert.equal((await add(f,'personCapabilities',{capabilityCode:'invented'})).status,422);
    ok(await f.owner.cmd('POST','/td2/capability-definitions',{schemaVersion,code:'on-camera',labelZh:'镜头表现',labelEn:'On camera',aliases:[],applicableRoleCodes:['model'],levelSchemeCode:'ABILITY_5',semanticVersion:'1.0.0'}));
    ok(await add(f,'personCapabilities',{capabilityCode:'on-camera',personRoleId:role.resourceId,levelCode:'WORKING'}));
    const translator=ok(await add(f,'personRoles',{roleCode:'translator'}));
    assert.equal((await add(f,'personCapabilities',{capabilityCode:'on-camera',personRoleId:translator.resourceId})).status,422);
});
test('TD2-T07 unknown language level never satisfies a minimum; base and service locations remain separate',async()=>{
    const f=await setup();ok(await add(f,'personLanguages',{languageCode:'en'}));
    assert.equal(ok(await f.owner.raw('GET','/td2/people?language=en&languageLevel=WORKING'),200).total,0);
    ok(await add(f,'talentLocations',{locationCode:'shenzhen',relationCode:'BASE'}));ok(await add(f,'talentLocations',{locationCode:'dongguan',relationCode:'SERVICE'}));
    assert.equal((await add(f,'talentLocations',{locationCode:'guangzhou',relationCode:'BASE'})).status,409);
    assert.equal(ok(await f.owner.raw('GET','/td2/people?location=dongguan&locationRelation=BASE'),200).total,0);
    assert.equal(ok(await f.owner.raw('GET','/td2/people?location=dongguan&locationRelation=SERVICE'),200).total,1);
});
test('TD2-T08 confirmed measurements are immutable and require real dates and paired size systems',async()=>{
    const f=await setup();ok(await add(f,'personRoles',{roleCode:'model'}));ok(await add(f,'castingProfiles',{}));
    assert.equal((await add(f,'measurementSets',{measuredOn:'2026-02-30',datePrecision:'EXACT_DAY',heightCm:175})).status,400);
    assert.equal((await add(f,'measurementSets',{measuredOn:'2026-09-22',datePrecision:'EXACT_DAY',shoeSizeValue:'38'})).status,422);
    const m=ok(await add(f,'measurementSets',{measuredOn:'2026-09-22',datePrecision:'EXACT_DAY',heightCm:175,shoeSizeValue:'38',shoeSizeSystem:'EU'}));ok(await confirm(f,'measurements',m.resourceId,'confirm'),200);
    assert.equal((await f.owner.cmd('PATCH',`/td2/measurements/${m.resourceId}`,{schemaVersion,expectedRevision:2,expectedPersonRevision:pRev(f),sourceId:f.sourceId,sourceRevision:1,values:{heightCm:176}})).status,409);
    assert.equal(ok(await f.owner.raw('GET','/td2/people?heightMin=170&heightMax=180'),200).total,1);
    const second=ok(await add(f,'measurementSets',{measuredOn:'2026-09-23',datePrecision:'EXACT_DAY',heightCm:176,supersedesId:m.resourceId}));ok(await confirm(f,'measurements',second.resourceId,'confirm'),200);
    assert.equal(f.store.rows('measurementSets').length,2);assert.equal(f.store.rows('measurementSets').find(r=>r.id===m.resourceId)!.heightCm,175);
});
test('TD2-T09 adult unknown is fail-closed; generic fields cannot forge verification',async()=>{
    const f=await setup();ok(await add(f,'personRoles',{roleCode:'model'}));assert.equal((await detail(f)).adultState,'UNKNOWN');
    assert.equal((await add(f,'adultEligibilities',{state:'VERIFIED_ADULT'})).status,400);
    const age=ok(await add(f,'adultEligibilities',{state:'SELF_DECLARED_ADULT'}));const evidence=await asset(f);
    ok(await f.owner.cmd('POST',`/td2/adult-eligibility/${age.resourceId}/verify`,{schemaVersion,expectedRevision:1,expectedPersonRevision:pRev(f),sourceRevision:1,evidenceAssetId:evidence.id,validUntil:'2026-12-01T00:00:00.000Z'}),200);
    assert.equal((await detail(f)).adultState,'VERIFIED_ADULT');await f.store.transaction(async tx=>{await tx.replace('assets',{...evidence,state:'QUARANTINED'});});assert.equal((await detail(f)).adultState,'UNKNOWN');
});
test('TD2-T10 representation is scoped to role and territory; agent can be non-talent contact',async()=>{
    const f=await setup(),role=ok(await add(f,'personRoles',{roleCode:'model'}));
    const agent=ok(await f.owner.cmd('POST','/td2/people',{schemaVersion,originSourceId:f.sourceId,sourceRevision:1,displayName:'合成经纪联系人'}));
    ok(await add(f,'representations',{personRoleId:role.resourceId,relationCode:'AGENT',agentPersonId:agent.resourceId,territoryCode:'cn'}));
    assert.equal((await detail(f)).facts.representations[0].territoryCode,'cn');assert.equal(f.store.rows('talentProfiles').some(p=>p.personId===agent.resourceId),false);
});
test('TD2-T11 collections separate type and content tag; reused assets are never deleted when unlinked',async()=>{
    const f=await setup(),role=ok(await add(f,'personRoles',{roleCode:'model'})),a=await asset(f);
    const c1=ok(await add(f,'mediaCollections',{personRoleId:role.resourceId,collectionTypeCode:'PORTFOLIO',title:'合成作品集'})),c2=ok(await add(f,'mediaCollections',{collectionTypeCode:'MODEL_CARD',title:'合成模卡'}));
    ok(await add(f,'mediaCollectionTags',{collectionId:c1.resourceId,tagCode:'FASHION'}));
    for(const c of [c1,c2])ok(await f.owner.cmd('POST',`/td2/collections/${c.resourceId}/items`,{schemaVersion,expectedRevision:1,expectedPersonRevision:pRev(f),assetId:a.id}),200);
    const item=f.store.rows('mediaCollectionItems').find(i=>i.collectionId===c1.resourceId)!;
    ok(await f.owner.cmd('POST',`/td2/collections/${c1.resourceId}/items/remove`,{schemaVersion,expectedRevision:2,expectedPersonRevision:pRev(f),itemId:item.id}),200);
    assert.equal(f.store.rows('assets').length,1);assert.equal(f.store.rows('mediaCollectionItems').length,1);
    assert.equal((await add(f,'mediaCollections',{collectionTypeCode:'LINGERIE',title:'错误类别'})).status,400);
});
test('TD2-T13 translation source/target and on-set service mode are tied to translator role',async()=>{
    const f=await setup(),role=ok(await add(f,'personRoles',{roleCode:'translator'}));
    ok(await add(f,'translatorLanguagePairs',{personRoleId:role.resourceId,sourceLanguageCode:'en',targetLanguageCode:'zh'}));ok(await add(f,'translatorServiceModes',{personRoleId:role.resourceId,modeCode:'ON_SET'}));
    assert.equal(ok(await f.owner.raw('GET','/td2/people?translationSource=en&translationTarget=zh&translationMode=ON_SET'),200).total,1);
    assert.equal(ok(await f.owner.raw('GET','/td2/people?translationSource=zh&translationTarget=en'),200).total,0);
});
test('TD2-T14 qualification verification and encrypted identifier are separate from skills and public metadata',async()=>{
    const f=await setup(),a=await asset(f),c=ok(await add(f,'personCredentials',{credentialTypeCode:'DRONE_LICENSE',issuerName:'合成颁发机构',evidenceAssetId:a.id}));
    ok(await f.owner.cmd('POST',`/td2/credentials/${c.resourceId}/identifier`,{schemaVersion,expectedRevision:1,expectedPersonRevision:pRev(f),identifier:'SYNTHETIC-ID-12345'}),200);
    const raw=f.store.rows('personCredentials')[0]!;assert.ok(raw.identifierCiphertext&&!raw.identifierCiphertext.includes('SYNTHETIC'));
    assert.equal(decryptContact(raw.identifierCiphertext!,f.app.config.contactKey,`credential:${f.workspaceId}:${c.resourceId}`),'SYNTHETIC-ID-12345');
    assert.ok(!JSON.stringify(await detail(f)).includes('identifierCiphertext'));ok(await confirm(f,'credentials',c.resourceId),200);
    assert.equal(ok(await f.owner.raw('GET','/td2/people?credentialType=DRONE_LICENSE'),200).total,1);
});
test('TD2-T18 conflicts create proposals, stale proposals do not overwrite and revoked supporting evidence masks adopted values',async()=>{
    const f=await setup(),lang=ok(await add(f,'personLanguages',{languageCode:'en',speakingLevelCode:'BASIC'})),s2=ok(await f.owner.cmd('POST','/sources',sourceInput()));
    const request={schemaVersion,ownerKind:'personLanguages',ownerId:lang.resourceId,fieldPath:'speakingLevelCode',expectedRevision:1,sourceId:s2.resourceId,sourceRevision:1,proposedValue:'WORKING'};
    const proposal=ok(await f.owner.cmd('POST','/td2/proposals',request));assert.equal(f.store.rows('personLanguages')[0]!.speakingLevelCode,'BASIC');
    const stale=ok(await f.owner.cmd('POST','/td2/proposals',{...request,proposedValue:'FLUENT'}));
    ok(await f.owner.cmd('POST',`/td2/proposals/${proposal.resourceId}/decide`,{schemaVersion,expectedRevision:1,decision:'APPLY'}),200);
    ok(await f.owner.cmd('POST',`/td2/proposals/${stale.resourceId}/decide`,{schemaVersion,expectedRevision:1,decision:'APPLY'}),200);
    assert.equal(f.store.rows('fieldProposals').find(p=>p.id===stale.resourceId)!.state,'STALE');assert.equal(f.store.rows('personLanguages')[0]!.speakingLevelCode,'WORKING');
    ok(await f.owner.cmd('POST',`/sources/${s2.resourceId}/suspend`,{expectedRevision:1,reason:'合成支持来源被撤销'}),200);
    assert.equal((await detail(f)).facts.personLanguages[0].speakingLevelCode,null);assert.equal(ok(await f.owner.raw('GET','/td2/people?language=en&languageLevel=WORKING'),200).total,0);
});
test('TD2-T18 unknown schema, unknown field and stale parent CAS reject before mutating facts',async()=>{
    const f=await setup(),before=f.store.rows('personRoles').length;
    for(const body of [{schemaVersion:'old',values:{roleCode:'model'}},{schemaVersion,values:{roleCode:'model',arbitrary:'no'}},{schemaVersion,expectedPersonRevision:900,values:{roleCode:'model'}}]){
        const response=await f.owner.cmd('POST',`/td2/people/${f.personId}/roles`,{schemaVersion,sourceId:f.sourceId,sourceRevision:1,expectedPersonRevision:pRev(f),...body});assert.ok([400,409].includes(response.status),JSON.stringify(response.body));
    }assert.equal(f.store.rows('personRoles').length,before);
});

test('TD2-T12 shortlist keeps the selected occupation and does not silently fall back after role deactivation',async()=>{
    const f=await setup(),model=ok(await add(f,'personRoles',{roleCode:'model'})),translator=ok(await add(f,'personRoles',{roleCode:'translator'}));
    const shortlist=ok(await f.owner.cmd('POST','/shortlists',{title:'合成候选名单',scopeId:f.store.rows('scopes')[0]!.id}));
    const body={expectedRevision:1,personId:f.personId,workAssetIds:[],note:''};
    assert.equal((await f.owner.cmd('POST',`/shortlists/${shortlist.resourceId}/items`,body)).status,422);
    ok(await f.owner.cmd('POST',`/shortlists/${shortlist.resourceId}/items`,{...body,personRoleId:model.resourceId,personRoleRevision:1}),200);
    ok(await f.owner.cmd('POST',`/shortlists/${shortlist.resourceId}/items`,{...body,expectedRevision:2,personRoleId:translator.resourceId,personRoleRevision:1}),200);
    let items=ok(await f.owner.raw('GET',`/shortlists/${shortlist.resourceId}`),200).items;assert.equal(items.length,2);assert.equal(items[0].roleCode,'model');
    ok(await f.owner.cmd('PATCH',`/td2/roles/${model.resourceId}`,{schemaVersion,expectedRevision:1,expectedPersonRevision:pRev(f),sourceId:f.sourceId,sourceRevision:1,values:{status:'INACTIVE'}}),200);
    items=ok(await f.owner.raw('GET',`/shortlists/${shortlist.resourceId}`),200).items;assert.equal(items[0].unavailable,true);assert.equal(items[1].roleCode,'translator');
});
test('TD2-T05 machine principal has real audit/receipt identity, bounded permissions and immediate rotation/revocation',async()=>{
    const f=await setup(),scopeId=f.store.rows('scopes')[0]!.id;
    const principal=ok(await f.owner.raw('POST','/td2/principals',{schemaVersion,displayName:'合成导入Agent',scopeId,defaultMaintainerMembershipId:f.membershipId,permissionCodes:['records.read','sources.read','talent.propose','talent.fact.write'],expiresAt:'2026-10-01T00:00:00.000Z'}));
    async function machine(token:string,method:string,path:string,body:unknown={},key=randomUUID()){
        return f.app.handle({method,url:'/api/v1'+path,ip:'192.0.2.140',body:JSON.stringify(body),headers:{authorization:'Bearer '+token,'content-type':'application/json','idempotency-key':key}});
    }
    const data={schemaVersion,expectedPersonRevision:pRev(f),sourceId:f.sourceId,sourceRevision:1,values:{languageCode:'en',speakingLevelCode:'WORKING'}},key=randomUUID();
    const created=ok(await machine(principal.token,'POST',`/td2/people/${f.personId}/languages`,data,key));
    assert.equal(ok(await machine(principal.token,'POST',`/td2/people/${f.personId}/languages`,data,key)).replayed,true);
    assert.equal(f.store.rows('personLanguages').length,1);
    const receipt=f.store.rows('receipts').find(r=>r.resourceId===created.resourceId)!;assert.equal(receipt.actorId,null);assert.equal(receipt.servicePrincipalId,principal.id);
    const audit=f.store.rows('audits').find(r=>r.resourceId===created.resourceId)!;assert.equal(audit.actorId,null);assert.equal(audit.servicePrincipalId,principal.id);
    assert.equal((await machine(principal.token,'GET','/memberships')).status,403);
    assert.equal((await machine(principal.token,'GET','/td2/principals')).status,403);
    const rotated=ok(await f.owner.raw('POST',`/td2/principals/${principal.id}/rotate`,{schemaVersion,expectedRevision:1}),200);
    assert.equal((await machine(principal.token,'GET','/td2/people')).status,401);
    ok(await machine(rotated.token,'GET','/td2/people'),200);
    ok(await f.owner.cmd('POST',`/td2/principals/${principal.id}/revoke`,{schemaVersion,expectedRevision:2}),200);
    assert.equal((await machine(rotated.token,'GET','/td2/people')).status,401);
    assert.ok(!JSON.stringify(f.store.rows('audits')).includes(principal.token));assert.ok(!JSON.stringify(f.store.rows('receipts')).includes(principal.token));
});
