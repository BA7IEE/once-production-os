import assert from 'node:assert/strict';
import type {Application} from '../../packages/core/src/api.ts';
import type {Store} from '../../packages/core/src/store.ts';
import type {FakeClock,Client} from './fixtures.ts';
import {sourceInput} from './fixtures.ts';
import {seedProfessionalGraph,expectResponse as ok} from './talent-v2-maintenance.ts';
import {TD2_FACTS,type FactTable} from '../../packages/core/src/talent-v2-schema.ts';
import {FaultStore} from './fault-store.ts';
import {DeletionCleanup} from '../../packages/core/src/deletion-cleanup.ts';
import {inspectTalentIntegrity} from '../../packages/core/src/talent-v2-integrity.ts';
const schemaVersion='once-talent-v2.0.0';
export type FactErasureContext={app:Application;store:Store;clock:FakeClock;owner:Client};
export async function seedSourceFacts(f:FactErasureContext,existingGraph?:Awaited<ReturnType<typeof seedProfessionalGraph>>) {
 const g=existingGraph??await seedProfessionalGraph(f.app,f.store,f.clock,f.owner);
 const sourceId=ok(await f.owner.cmd('POST','/sources',{...sourceInput(),title:'合成专业事实待删来源'})).resourceId as string;
 const basisId=ok(await f.owner.cmd('POST','/sources',{...sourceInput(),title:'合成完整独立字段依据'})).resourceId as string;
 const add=async(table:FactTable,source:string,values:Record<string,unknown>)=>ok(await f.owner.cmd('POST',`/td2/people/${g.personId}/${TD2_FACTS[table].slug}`,{schemaVersion,expectedPersonRevision:(await g.current()).revision,sourceId:source,sourceRevision:1,values})).resourceId as string;
 const roleId=await add('personRoles',sourceId,{roleCode:'photographer'}),languageId=await add('personLanguages',sourceId,{languageCode:'zh',speakingLevelCode:'FLUENT'});
 const collectionId=await add('mediaCollections',g.sourceId,{personRoleId:roleId,collectionTypeCode:'PORTFOLIO',title:'合成跨来源摄影集合'});
 const tagId=await add('mediaCollectionTags',g.sourceId,{collectionId,tagCode:'FASHION'});
 const prove=async(table:FactTable,id:string)=>{const row=(await f.store.transaction(tx=>tx.get(table,id)))!;for(const fieldPath of Object.keys(TD2_FACTS[table].fields))ok(await f.owner.cmd('POST','/td2/evidence',{schemaVersion,ownerKind:table,ownerId:id,fieldPath,expectedRevision:row.revision,sourceId:basisId,sourceRevision:1}),200);};
 await prove('personLanguages',languageId);
 const listId=ok(await f.owner.cmd('POST','/shortlists',{title:'合成保留待核职业候选',scopeId:(await g.current()).scopeId})).resourceId as string;
 ok(await f.owner.cmd('POST',`/shortlists/${listId}/items`,{expectedRevision:1,personId:g.personId,personRoleId:roleId,personRoleRevision:1,workAssetIds:[],note:'保留原候选备注'}),200);
 const candidateId=(await f.store.transaction(tx=>tx.find('shortlistItems',{shortlistId:listId})))[0]!.id;
 return {g,sourceId,basisId,roleId,languageId,collectionId,tagId,listId,candidateId,prove};
}
export async function prepareSourceFacts(f:FactErasureContext,s:Awaited<ReturnType<typeof seedSourceFacts>>,retainIds:string[]=[s.languageId]) {
 const preview=ok(await f.owner.raw('POST','/deletion-requests/preview',{targetKind:'SOURCE',targetId:s.sourceId,expectedRevision:1}),200);assert.equal(preview.complete,true,JSON.stringify(preview.unresolved));
 assert.equal(preview.items.filter((i:any)=>i.resourceKind==='talentSourceFact').length,4);
 const requestId=ok(await f.owner.cmd('POST','/deletion-requests',{targetKind:'SOURCE',targetId:s.sourceId,expectedRevision:1,previewDigest:preview.previewDigest,reason:'合成逐项保留语言，删除职业及其集合关系'})).resourceId as string;
 const current=()=>f.store.transaction(async tx=>(await tx.get('deletionRequests',requestId))!);
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/block`,{expectedRevision:1,previewDigest:preview.previewDigest,acknowledgeBlock:true}),200);
 for(const item of await f.store.transaction(tx=>tx.find('deletionItems',{requestId})))if(item.decision==='PENDING'){
  const retain=item.resourceKind==='talentSourceFact'&&retainIds.includes(item.resourceId);
  ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/decisions`,{expectedRevision:(await current()).revision,entryId:item.id,decision:retain?'RETAIN_WITH_BASIS':'APPLY_PROPOSED',decisionReason:retain?'合成确认完整字段独立依据':'合成明确删除该资料或确认整组处置',...(retain?{retentionSourceId:s.basisId}:{})}),200);
 }
 return {requestId,current};
}
export async function verifySourceFactErasure(f:FactErasureContext,existingGraph?:Awaited<ReturnType<typeof seedProfessionalGraph>>) {
 const s=await seedSourceFacts(f,existingGraph),r=await prepareSourceFacts(f,s);
 const before=await f.store.transaction(async tx=>({language:await tx.get('personLanguages',s.languageId),role:await tx.get('personRoles',s.roleId),collection:await tx.get('mediaCollections',s.collectionId),candidate:await tx.get('shortlistItems',s.candidateId),basis:await tx.find('evidence',{sourceId:s.basisId})}));
 ok(await f.owner.cmd('POST',`/deletion-requests/${r.requestId}/plan/freeze`,{expectedRevision:(await r.current()).revision,acknowledgePlan:true}),200);
 ok(await f.owner.cmd('POST',`/deletion-requests/${r.requestId}/cleaning/start`,{expectedRevision:(await r.current()).revision,planDigest:(await r.current()).planDigest,acknowledgeIrreversible:true}),200);
 const faults=new FaultStore(f.store);faults.afterInsert=(table,row)=>{if(table==='audits'&&'action' in row&&row.action==='deletion.cleanup-item'&&'changedFields' in row&&row.changedFields.includes('talentSourceFactGraph'))throw new Error('synthetic source fact group rollback');};
 const worker=new DeletionCleanup(faults,f.clock,f.app.config),claim=await worker.claim();assert.ok(claim);await worker.process(claim);
 assert.deepEqual(await f.store.transaction(tx=>tx.get('personRoles',s.roleId)),before.role);assert.deepEqual(await f.store.transaction(tx=>tx.get('mediaCollections',s.collectionId)),before.collection);assert.deepEqual(await f.store.transaction(tx=>tx.get('shortlistItems',s.candidateId)),before.candidate);
 faults.afterInsert=null;const retry=await worker.claim();assert.ok(retry);await worker.process(retry);
 assert.equal(await f.store.transaction(tx=>tx.get('personRoles',s.roleId)),null);assert.equal(await f.store.transaction(tx=>tx.get('mediaCollections',s.collectionId)),null);assert.equal(await f.store.transaction(tx=>tx.get('mediaCollectionTags',s.tagId)),null);
 assert.deepEqual(await f.store.transaction(tx=>tx.get('personLanguages',s.languageId)),before.language);assert.deepEqual(await f.store.transaction(tx=>tx.find('evidence',{sourceId:s.basisId})),before.basis);
 const candidate=(await f.store.transaction(tx=>tx.get('shortlistItems',s.candidateId)))!;assert.equal(candidate.note,before.candidate!.note);assert.equal(candidate.personRoleId,null);assert.equal(candidate.roleContextState,'LEGACY_REVIEW');assert.equal((await f.store.transaction(tx=>tx.find('talentMigrationReviews',{shortlistItemId:s.candidateId,state:'PENDING'}))).length,1);
 const final=await f.app.deletionFinalization.claim();assert.ok(final);await f.app.deletionFinalization.finish(final);assert.equal((await r.current()).state,'RETAINED_WITH_BASIS');assert.equal((await f.store.transaction(tx=>tx.get('sources',s.sourceId)))!.status,'ERASED');
 const detail=ok(await f.owner.raw('GET',`/td2/people/${s.g.personId}`),200);const language=detail.facts.personLanguages.find((l:any)=>l.id===s.languageId);assert.equal(language.speakingLevelCode,'FLUENT');assert.equal(language.usable,true);assert.deepEqual(language.unavailableFields,[]);
 assert.equal((await f.store.transaction(tx=>inspectTalentIntegrity(tx,(before.language!).workspaceId,f.app.config.contactKey))).relationFailures,0);
 return {s,r};
}
