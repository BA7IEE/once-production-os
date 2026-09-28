import {verifyParties,exportParties,erasePartySource} from '../support/project-parties.ts';
import {verifyAiProcessCrash} from '../support/ai-process-crash.ts';
import {verifyAiConnections} from '../support/ai-connections.ts';
import {verifyAiOperations} from '../support/ai-operations.ts';
import {verifyAiBusiness} from '../support/ai-business.ts';
/** Explicit TD2 domain acceptance on real PostgreSQL, including direct constraint probes.
 * Each scenario uses formal commands; no database reset, migration edits or memory adapter. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {Application} from '../../packages/core/src/api.ts';
import {FakeClock,Client,SYNTHETIC_PASSWORD,sourceInput} from '../support/fixtures.ts';
import {expectResponse as ok} from '../support/talent-v2-maintenance.ts';
import {seedSharedProof} from '../support/talent-asset-erasure.ts';
import {TALENT_SCHEMA_VERSION as schemaVersion} from '../../packages/core/src/talent-v2-model.ts';
import {verifyLegacyProjection,verifyDelegatedLegacyProjection} from '../support/talent-legacy-projection.ts';
import {verifyHeightReview} from '../support/talent-height-review.ts';
import {verifyStructuredCompatibility} from '../support/talent-structured-compatibility.ts';
import {verifyClearedCredentialRetention} from '../support/talent-credential-retention.ts';
import {verifyManualMaintenance} from '../support/talent-manual-maintenance.ts';
import {decryptContact} from '../../packages/core/src/crypto.ts';

test('TD2-T01 through T15 and T18: actual PostgreSQL domain contracts and private media',async t=>{
 assert.equal(process.env.ALLOW_TD2_DB_TESTS,'yes');const raw=process.env.DATABASE_URL_TD2_TEST;assert.ok(raw);const url=new URL(raw);assert.ok(['postgres:','postgresql:'].includes(url.protocol));assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));assert.match(url.pathname,/^\/once_test_td2_[a-z0-9_]+$/);assert.equal(url.search,'');assert.equal(url.hash,'');
 const client=new PrismaClient({datasources:{db:{url:raw}},log:[]}),store=new PrismaStore(client),clock=new FakeClock(),tmp=realpathSync(mkdtempSync(join(tmpdir(),'once-domain-gates-')));
 try{
  assert.equal(await client.workspace.count(),0);const app=new Application(store,{origin:'https://td2-gates.test.invalid',secureCookies:true,contactKey:randomBytes(32),csrfKey:randomBytes(32),recoveryEpoch:randomBytes(24).toString('hex'),accessMode:'INTERNAL',environment:'test',dataEgressMode:'INTERNAL_APPROVED',dataCleanupMode:'INTERNAL_APPROVED',dataMergeMode:'INTERNAL_APPROVED'},clock);
  const ids=await app.identity.bootstrap('owner','合成人才2.0逐项验收',SYNTHETIC_PASSWORD),owner=new Client(app);assert.equal((await owner.login()).status,200);
  const f={app,store,clock,owner},proof=await seedSharedProof(f,join(tmp,'private-media')),g=proof.g;
  const view=async()=>ok(await owner.raw('GET',`/td2/people/${g.personId}`),200),query=async(q:string)=>ok(await owner.raw('GET','/td2/people?'+q),200);
  const command=async(slug:string,values:Record<string,unknown>,personId=g.personId,sourceId=g.sourceId)=>owner.cmd('POST',`/td2/people/${personId}/${slug}`,{schemaVersion,expectedPersonRevision:(await client.person.findUniqueOrThrow({where:{id:personId}})).revision,sourceId,sourceRevision:(await client.sourceRecord.findUniqueOrThrow({where:{id:sourceId}})).revision,values});
  const contactId=ok(await owner.cmd('POST','/td2/people',{schemaVersion,originSourceId:g.sourceId,sourceRevision:1,displayName:'合成无职业联系人'})).resourceId as string;
  let shortlistId='',workId='';
  await t.test('TD2-T01 ordinary contact remains independent and enrollment preserves identity',async()=>{
   assert.equal(ok(await owner.raw('GET',`/td2/people/${contactId}`),200).isTalent,false);assert.equal((await command('roles',{roleCode:'model'},contactId)).status,409);ok(await command('languages',{languageCode:'fr'},contactId));
   ok(await owner.cmd('POST',`/td2/people/${contactId}/enroll`,{schemaVersion,expectedRevision:(await client.person.findUniqueOrThrow({where:{id:contactId}})).revision,sourceRevision:1}),200);assert.equal(ok(await owner.raw('GET',`/td2/people/${contactId}`),200).id,contactId);assert.equal(await client.personRole.count({where:{personId:contactId}}),0);
  });
  await t.test('TD2-T02 multi-role identity and database duplicate-role constraint',async()=>{
   ok(await command('roles',{roleCode:'actor'}));ok(await command('roles',{roleCode:'kol'}));assert.equal((await command('roles',{roleCode:'model'})).status,409);const role=await client.personRole.findUniqueOrThrow({where:{id:g.roleId}});await assert.rejects(client.personRole.create({data:{...role,id:randomUUID()}}));assert.equal(await client.personRole.count({where:{personId:g.personId,status:'ACTIVE'}}),4);
  });
  await t.test('TD2-T03 actual independent origins and same-value evidence are preserved',async()=>{
   const originId=ok(await owner.cmd('POST','/sources',sourceInput())).resourceId as string,basisId=ok(await owner.cmd('POST','/sources',sourceInput())).resourceId as string;
   const personId=ok(await owner.cmd('POST','/td2/people',{schemaVersion,originSourceId:originId,sourceRevision:1,displayName:'合成独立字段来源'})).resourceId as string;
   const languageId=ok(await command('languages',{languageCode:'en',speakingLevelCode:'WORKING'},personId,basisId)).resourceId as string;
   ok(await owner.cmd('POST','/td2/evidence',{schemaVersion,ownerKind:'personLanguages',ownerId:languageId,fieldPath:'speakingLevelCode',expectedRevision:1,sourceId:originId,sourceRevision:1}),200);
   assert.ok(await client.fieldEvidence.count({where:{personLanguageId:languageId,fieldPath:'speakingLevelCode'}})>=2);
   ok(await owner.cmd('POST',`/sources/${originId}/suspend`,{expectedRevision:1,reason:'合成原始出处暂停，其他来源仍可用'}),200);const detail=ok(await owner.raw('GET',`/td2/people/${personId}`),200);assert.equal(detail.originAvailable,false);assert.equal(detail.facts.personLanguages[0].speakingLevelCode,'WORKING');assert.equal((await client.personLanguage.findUniqueOrThrow({where:{id:languageId}})).sourceId,basisId);
  });
  await t.test('TD2-T04 exact reference verification, conflict constraint and withdrawal',async()=>{
   const path='/td2/resolve?providerCode=WECHAT&namespaceCode=synthetic&externalKey='+encodeURIComponent('ref-'+g.personId);assert.equal((await owner.raw('GET',path)).status,404);
   ok(await owner.cmd('POST',`/td2/external-refs/${g.externalRefId}/verify`,{schemaVersion,expectedRevision:1,expectedPersonRevision:(await g.current()).revision,sourceRevision:1}),200);assert.equal(ok(await owner.raw('GET',path),200).personId,g.personId);
   const row=await client.personExternalRef.findUniqueOrThrow({where:{id:g.externalRefId}});await assert.rejects(client.personExternalRef.create({data:{...row,id:randomUUID(),personId:g.agentId}}));
   ok(await owner.cmd('POST',`/td2/external-refs/${g.externalRefId}/revoke`,{schemaVersion,expectedRevision:2,expectedPersonRevision:(await g.current()).revision,sourceRevision:1}),200);assert.equal((await owner.raw('GET',path)).status,404);
  });
  await t.test('TD2-T05 machine proposal-only boundary, real audit/receipt, scope and rotate/revoke',async()=>{
   const machine=(token:string,method:string,path:string,body:unknown={},key=randomUUID())=>app.handle({method,url:'/api/v1'+path,ip:'192.0.2.151',body:JSON.stringify(body),headers:{authorization:'Bearer '+token,'content-type':'application/json','idempotency-key':key}});
   assert.equal((await machine(g.token,'POST',`/td2/people/${g.personId}/languages`,{schemaVersion,expectedPersonRevision:(await g.current()).revision,sourceId:g.sourceId,sourceRevision:1,values:{languageCode:'fr'}})).status,403);
   const input={schemaVersion,ownerKind:'personLanguages',ownerId:g.languageId,fieldPath:'speakingLevelCode',expectedRevision:1,sourceId:g.sourceId,sourceRevision:1,proposedValue:'FLUENT'},key=randomUUID(),receipt=ok(await machine(g.token,'POST','/td2/proposals',input,key));assert.equal(ok(await machine(g.token,'POST','/td2/proposals',input,key)).replayed,true);
   const audit=await client.auditEvent.findFirstOrThrow({where:{resourceId:receipt.resourceId}}),stored=await client.commandReceipt.findFirstOrThrow({where:{resourceId:receipt.resourceId}});assert.equal(audit.actorId,null);assert.equal(stored.actorId,null);assert.equal(audit.servicePrincipalId,g.principalId);assert.equal(stored.servicePrincipalId,g.principalId);assert.equal((await client.personLanguage.findUniqueOrThrow({where:{id:g.languageId}})).speakingLevelCode,'WORKING');
   const privateScope=ok(await owner.cmd('POST','/scopes',{name:'合成机器不可见范围',membershipIds:[ids.membershipId]})).resourceId as string;ok(await owner.cmd('PATCH',`/records/person/${contactId}/scope`,{expectedRevision:(await client.person.findUniqueOrThrow({where:{id:contactId}})).revision,scopeId:privateScope}),200);assert.equal((await machine(g.token,'GET',`/td2/people/${contactId}`)).status,404);
   assert.equal((await machine(g.token,'GET','/memberships')).status,403);const rotated=ok(await owner.raw('POST',`/td2/principals/${g.principalId}/rotate`,{schemaVersion,expectedRevision:1}),200);assert.equal((await machine(g.token,'GET','/td2/people')).status,401);ok(await machine(rotated.token,'GET','/td2/people'),200);ok(await owner.cmd('POST',`/td2/principals/${g.principalId}/revoke`,{schemaVersion,expectedRevision:2}),200);assert.equal((await machine(rotated.token,'GET','/td2/people')).status,401);assert.ok(!JSON.stringify([audit,stored]).includes(g.token));
  });
  await t.test('TD2-T06 registered capability, applicability and schema boundaries',async()=>{
   assert.equal((await command('capabilities',{capabilityCode:'unregistered-gate-code'})).status,422);const capability=await client.personCapability.findFirstOrThrow({where:{personId:g.personId}});assert.equal((await command('capabilities',{capabilityCode:capability.capabilityCode,personRoleId:g.translatorId})).status,422);
   const bad=await owner.cmd('POST',`/td2/people/${g.personId}/roles`,{schemaVersion:'obsolete',expectedPersonRevision:(await g.current()).revision,sourceId:g.sourceId,sourceRevision:1,values:{roleCode:'photographer'}});assert.equal(bad.status,400);
  });
  await t.test('TD2-T07 nullable language levels and temporal base/service locations',async()=>{
   assert.equal((await query('language=fr&languageLevel=WORKING')).total,0);ok(await command('locations',{locationCode:'dongguan',relationCode:'SERVICE'}));assert.equal((await command('locations',{locationCode:'guangzhou',relationCode:'BASE'})).status,409);
   const base=await client.talentLocation.findFirstOrThrow({where:{personId:g.personId,relationCode:'BASE'}});await assert.rejects(client.talentLocation.create({data:{...base,id:randomUUID(),locationCode:'guangzhou'}}));assert.equal((await query('location=dongguan&locationRelation=BASE')).total,0);assert.equal((await query('location=dongguan&locationRelation=SERVICE')).items[0].id,g.personId);
  });
  await t.test('TD2-T08 shared casting and immutable measurement history with explicit size system',async()=>{
   assert.equal(await client.castingProfile.count({where:{personId:g.personId}}),1);assert.equal((await command('measurements',{measuredOn:'2026-02-30',datePrecision:'EXACT_DAY',heightCm:175})).status,400);assert.equal((await command('measurements',{measuredOn:'2026-09-22',datePrecision:'EXACT_DAY',shoeSizeValue:'38'})).status,422);
   await assert.rejects(client.measurementSet.update({where:{id:g.measurementId},data:{heightCm:199}}));const replacement=ok(await command('measurements',{measuredOn:'2026-09-23',datePrecision:'EXACT_DAY',heightCm:176,supersedesId:g.measurementId})).resourceId as string;ok(await owner.cmd('POST',`/td2/measurements/${replacement}/confirm`,{schemaVersion,expectedRevision:1,expectedPersonRevision:(await g.current()).revision,sourceRevision:1}),200);assert.equal((await client.measurementSet.findUniqueOrThrow({where:{id:g.measurementId}})).heightCm,175);assert.equal(await client.measurementSet.count({where:{personId:g.personId}}),2);
  });
  await t.test('TD2-T09 unknown adult state and unavailable proof never qualify',async()=>{
   assert.equal(ok(await owner.raw('GET',`/td2/people/${g.agentId}`),200).adultState,'UNKNOWN');assert.equal((await command('adult-eligibility',{state:'VERIFIED_ADULT'})).status,400);assert.equal((await view()).adultState,'VERIFIED_ADULT');
   const asset=await store.transaction(async tx=>(await tx.get('assets',proof.assetId))!);await store.transaction(tx=>tx.replace('assets',{...asset,state:'QUARANTINED'}));assert.equal((await view()).adultState,'UNKNOWN');await store.transaction(tx=>tx.replace('assets',asset));await proof.provider.verifyAsset(asset);
  });
  await t.test('TD2-T10 representative remains an ordinary contact with role and territory',async()=>{
   const relation=await client.representation.findFirstOrThrow({where:{personId:g.personId}});assert.equal(relation.personRoleId,g.roleId);assert.equal(relation.territoryCode,'cn');assert.equal(await client.talentProfile.count({where:{personId:g.agentId}}),0);
  });
  await t.test('TD2-T11 actual private asset is reused across collections, work and shortlist; unlink preserves bytes',async()=>{
   workId=ok(await owner.cmd('POST','/works',{title:'合成跨集合复用作品',sourceId:g.sourceId})).resourceId as string;ok(await owner.cmd('POST',`/works/${workId}/assets`,{expectedRevision:1,assetId:proof.assetId}),200);ok(await owner.cmd('POST',`/works/${workId}/credits`,{expectedRevision:2,personId:g.personId,roleCode:'model',note:'合成实际署名'}),200);
   shortlistId=ok(await owner.cmd('POST','/shortlists',{title:'合成原件复用与职业上下文',scopeId:(await g.current()).scopeId})).resourceId as string;const link=await client.workAsset.findFirstOrThrow({where:{workId}});ok(await owner.cmd('POST',`/shortlists/${shortlistId}/items`,{expectedRevision:1,personId:g.personId,personRoleId:g.roleId,personRoleRevision:1,workId,workAssetIds:[link.id],note:'合成保留原件引用'}),200);
   const item=await client.mediaCollectionItem.findFirstOrThrow({where:{collectionId:g.collectionId,assetId:proof.assetId}}),collection=await client.mediaCollection.findUniqueOrThrow({where:{id:g.collectionId}});ok(await owner.cmd('POST',`/td2/collections/${g.collectionId}/items/remove`,{schemaVersion,expectedRevision:collection.revision,expectedPersonRevision:(await g.current()).revision,itemId:item.id}),200);
   assert.equal(await client.mediaCollectionItem.count({where:{collectionId:proof.collection2,assetId:proof.assetId}}),1);assert.equal(await client.workAsset.count({where:{assetId:proof.assetId}}),1);assert.equal(await client.shortlistItemAsset.count({where:{assetId:proof.assetId}}),1);await proof.provider.verifyAsset((await store.transaction(tx=>tx.get('assets',proof.assetId)))!);assert.equal((await command('collections',{collectionTypeCode:'LINGERIE',title:'不可把内容标签当集合类型'})).status,400);
  });
  await t.test('TD2-T13 translator direction and service mode, crew as role rather than separate table',async()=>{
   assert.equal((await query('translationSource=en&translationTarget=zh&translationMode=ON_SET')).items[0].id,g.personId);assert.equal((await query('translationSource=zh&translationTarget=en')).total,0);ok(await command('roles',{roleCode:'photographer'}));ok(await owner.cmd('POST',`/works/${workId}/credits`,{expectedRevision:(await client.work.findUniqueOrThrow({where:{id:workId}})).revision,personId:g.personId,roleCode:'photographer',note:'合成摄影工作'}),200);assert.equal((await query('role=photographer')).items[0].id,g.personId);
  });
  await t.test('TD2-T14 encrypted credential number and expiry do not erase history or create capability',async()=>{
   const raw=await client.personCredential.findUniqueOrThrow({where:{id:g.credentialId}});assert.ok(raw.identifierCiphertext);assert.equal(decryptContact(raw.identifierCiphertext!,app.config.contactKey,`credential:${ids.workspaceId}:${raw.id}`),'SYNTHETIC-PRIVATE-9876');assert.ok(!JSON.stringify(await view()).includes('identifierCiphertext'));
   const count=await client.personCapability.count({where:{personId:g.personId}}),expired=ok(await command('credentials',{credentialTypeCode:'TRANSLATION_CERTIFICATE',issuerName:'合成历史颁发机构',evidenceAssetId:proof.assetId,expiresOn:'2020-01-01'})).resourceId as string;
   ok(await owner.cmd('POST',`/td2/credentials/${expired}/verify`,{schemaVersion,expectedRevision:1,expectedPersonRevision:(await g.current()).revision,sourceRevision:1}),200);assert.equal((await query('credentialType=TRANSLATION_CERTIFICATE')).total,0);assert.equal(await client.personCredential.count({where:{id:expired}}),1);assert.equal(await client.personCapability.count({where:{personId:g.personId}}),count);
  });
  await t.test('TD2-T15 combined filters and occupation-specific actual work maintain totals and facets',async()=>{
   const combined='role=model&language=en&languageLevel=WORKING&location=shenzhen&locationRelation=BASE&heightMin=170&collectionType=PORTFOLIO&collectionTag=FASHION&adultState=VERIFIED_ADULT';const found=await query(combined);assert.equal(found.total,1);assert.equal(found.items[0].id,g.personId);assert.equal(found.facets.roles.model,1);
   for(const [namespace,code] of [['industry','furniture'],['industry','fashion'],['workType','photo'],['workType','video']])ok(await owner.cmd('POST','/catalog/items',{namespace,code,labelZh:'合成分类',labelEn:'Synthetic'}));
   const work=async(industryCode:string,workTypeCode:string,roleCode:string)=>{const id=ok(await owner.cmd('POST','/works',{title:'合成同作品匹配边界',sourceId:g.sourceId,industryCode,workTypeCodes:[workTypeCode]})).resourceId as string;ok(await owner.cmd('POST',`/works/${id}/credits`,{expectedRevision:1,personId:g.personId,roleCode,note:'合成对应职业'}),200);};
   await work('furniture','photo','model');await work('fashion','video','model');await work('furniture','video','translator');const sameWork='role=model&industryCode=furniture&workTypeCode=video';assert.equal((await query(sameWork)).total,0);await work('furniture','video','model');assert.equal((await query(sameWork)).total,1);
   const member=ok(await owner.raw('POST','/memberships',{loginName:'private-evidence-editor',displayName:'合成独立依据维护人',role:'EDITOR',extraPermissions:[]})),editor=new Client(app,'192.0.2.153');assert.equal((await editor.activate(member.activationToken)).status,200);assert.equal((await editor.login('private-evidence-editor')).status,200);
   const hidden=ok(await editor.cmd('POST','/sources',sourceInput(true))).resourceId as string;ok(await editor.cmd('POST',`/td2/people/${g.personId}/languages`,{schemaVersion,expectedPersonRevision:(await g.current()).revision,sourceId:hidden,sourceRevision:1,values:{languageCode:'fr',speakingLevelCode:'NATIVE'}}));
   const visible=await query('role=model&pageSize=1');assert.equal(visible.total,1);assert.equal(visible.facets.languages.fr,undefined);assert.equal((await query('role=model&language=fr')).total,0);assert.equal(ok(await editor.raw('GET','/td2/people?role=model&language=fr'),200).total,1);const later=await query('role=model&pageSize=1&page=2');assert.equal(later.items.length,0);assert.equal(later.total,1);assert.deepEqual(later.facets,visible.facets);
   const project=ok(await owner.cmd('POST','/projects',{title:'合成真实翻译参与',sourceId:g.sourceId})).resourceId as string;ok(await owner.cmd('POST',`/projects/${project}/participants`,{expectedRevision:1,personId:g.personId,roleCode:'translator',state:'ACTUAL',note:'合成已实际参与'}),200);assert.equal((await query('role=model&actualProject=true')).total,0);assert.equal((await query('role=translator&actualProject=true')).total,1);
  });
  await t.test('TD2-T12 shortlist never switches a stale selected occupation to another active role',async()=>{
   assert.equal((await owner.cmd('POST',`/shortlists/${shortlistId}/items`,{expectedRevision:2,personId:g.personId,workAssetIds:[],note:''})).status,422);ok(await owner.cmd('POST',`/shortlists/${shortlistId}/items`,{expectedRevision:2,personId:g.personId,personRoleId:g.translatorId,personRoleRevision:1,workAssetIds:[],note:'合成翻译候选'}),200);
   ok(await owner.cmd('PATCH',`/td2/roles/${g.roleId}`,{schemaVersion,expectedRevision:1,expectedPersonRevision:(await g.current()).revision,sourceId:g.sourceId,sourceRevision:1,values:{status:'INACTIVE'}}),200);const items=ok(await owner.raw('GET',`/shortlists/${shortlistId}`),200).items;assert.equal(items[0].unavailable,true);assert.equal(items[1].roleCode,'translator');
  });
  await t.test('TD2-T18 same-value evidence, conflicting proposals, stale base and schema/field rejection',async()=>{
   const basisId=ok(await owner.cmd('POST','/sources',sourceInput())).resourceId as string,input={schemaVersion,ownerKind:'personLanguages',ownerId:g.languageId,fieldPath:'speakingLevelCode',expectedRevision:1,sourceId:basisId,sourceRevision:1,proposedValue:'FLUENT'};
   const first=ok(await owner.cmd('POST','/td2/proposals',input)).resourceId as string,second=ok(await owner.cmd('POST','/td2/proposals',{...input,proposedValue:'NATIVE'})).resourceId as string;assert.equal((await client.personLanguage.findUniqueOrThrow({where:{id:g.languageId}})).speakingLevelCode,'WORKING');
   ok(await owner.cmd('POST',`/td2/proposals/${first}/decide`,{schemaVersion,expectedRevision:1,decision:'APPLY'}),200);ok(await owner.cmd('POST',`/td2/proposals/${second}/decide`,{schemaVersion,expectedRevision:1,decision:'APPLY'}),200);assert.equal((await client.fieldProposal.findUniqueOrThrow({where:{id:second}})).state,'STALE');
   const currentInput={...input,expectedRevision:2};const before=await client.fieldProposal.count();for(const bad of [{...currentInput,schemaVersion:'old'},{...currentInput,fieldPath:'unregistered'},{...currentInput,proposedValue:{unregistered:true}}])assert.ok([400,422].includes((await owner.cmd('POST','/td2/proposals',bad)).status));assert.equal(await client.fieldProposal.count(),before);
   const invalidated=ok(await owner.cmd('POST','/td2/proposals',{...currentInput,proposedValue:'NATIVE'})).resourceId as string;
   ok(await owner.cmd('POST',`/sources/${basisId}/suspend`,{expectedRevision:1,reason:'合成采纳依据暂停，不回退到旧值'}),200);assert.equal((await view()).facts.personLanguages.find((r:any)=>r.id===g.languageId).speakingLevelCode,null);ok(await owner.cmd('POST',`/td2/proposals/${invalidated}/decide`,{schemaVersion,expectedRevision:1,decision:'APPLY'}),200);assert.equal((await client.fieldProposal.findUniqueOrThrow({where:{id:invalidated}})).state,'STALE');
  });
  await t.test('Phase C legacy projections and write protection use the same PostgreSQL facts',async()=>{await verifyLegacyProjection(owner);});
  await t.test('Phase C basic handoff cannot expand professional source/scope access',async()=>{await verifyDelegatedLegacyProjection(owner,clock.now());});
  await t.test('Legacy height review is resolved only by an actual height, with atomic audit rollback/retry',async()=>{await verifyHeightReview(f,503);});
  await t.test('Legacy structured search has current typed reviews, same-work/occupation matching and complete facets',async()=>{await verifyStructuredCompatibility(owner);});
  await t.test('Manual height dismissal and credential identifier clearing preserve history and roll back with audit failure',async()=>{await verifyManualMaintenance(f,503,{credentialId:g.credentialId,personId:g.personId});await proof.provider.verifyAsset((await store.transaction(tx=>tx.get('assets',proof.assetId)))!);});
  await t.test('Revoked credential history survives source cleanup only after explicit secret clearance',async()=>{await verifyClearedCredentialRetention(f,proof.assetId);await proof.provider.verifyAsset((await store.transaction(tx=>tx.get('assets',proof.assetId)))!);});
  await t.test('Brands and project parties: actual audit rollback, permissions, export and source cleanup',async()=>{
   const parties=await verifyParties(f);await exportParties(f);await erasePartySource(f);await erasePartySource(f,'organization');
   const link=await client.projectParty.findFirstOrThrow({where:{projectId:parties.projectId}});
   await assert.rejects(client.projectParty.create({data:{...link,id:randomUUID()}}));
   await assert.rejects(client.projectParty.update({where:{id:link.id},data:{brandId:randomUUID()}}));
  });
  await t.test('AI PostgreSQL proposal adoption and immutable task inputs',async()=>{
   const ai=await verifyAiBusiness(f),task=await client.aiTask.findFirstOrThrow({where:{actorId:ai.member.id}});
   await assert.rejects(client.aiTask.update({where:{id:task.id},data:{proposalState:'PENDING'}}));
   await assert.rejects(client.aiTask.update({where:{id:task.id},data:{inputSpec:{}}}));
   const operations=await verifyAiOperations(f);
   await assert.rejects(client.aiApproval.update({where:{id:operations.approvalId},data:{configDigest:'f'.repeat(64)}}));
   const release=await client.aiBudgetRelease.findFirstOrThrow({where:{budgetId:operations.budgetId}});await assert.rejects(client.aiBudgetRelease.delete({where:{id:release.id}}));
   const connection=await verifyAiConnections(f);await verifyAiProcessCrash(f);
   await assert.rejects(client.aiResponseMetadata.delete({where:{id:connection.responseId}}));
   await client.aiBudget.update({where:{id:operations.budgetId},data:{frozen:true,revision:{increment:1}}});
   await assert.rejects(client.aiBudget.update({where:{id:operations.budgetId},data:{frozen:false,revision:{increment:1}}}));
   const dep=await client.aiDependency.findFirstOrThrow({where:{taskId:task.id,grantId:{not:null}}});await assert.rejects(client.aiDependency.delete({where:{id:dep.id}}));
  });
 }finally{await store.close();rmSync(tmp,{recursive:true,force:true});}
});
