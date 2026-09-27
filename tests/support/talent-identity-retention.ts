import assert from 'node:assert/strict';
import {sourceInput} from './fixtures.ts';
import type {FactErasureContext} from './talent-source-fact-erasure.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
import {TD2_FACTS} from '../../packages/core/src/talent-v2-schema.ts';
import {FaultStore} from './fault-store.ts';
import {DeletionCleanup} from '../../packages/core/src/deletion-cleanup.ts';
import {AppError} from '../../packages/core/src/errors.ts';
import {talentSnapshot} from '../../packages/core/src/talent-v2-integrity.ts';
export async function verifyIdentityRetention(f:FactErasureContext,withTalent=true){
 const schemaVersion='once-talent-v2.0.0';
 const sourceId=ok(await f.owner.cmd('POST','/sources',{...sourceInput(),title:'合成人物最初来源'})).resourceId as string;
 const basisId=ok(await f.owner.cmd('POST','/sources',{...sourceInput(),title:'合成逐字段独立依据'})).resourceId as string;
 const personId=ok(await f.owner.cmd('POST','/td2/people',{schemaVersion,originSourceId:sourceId,sourceRevision:1,displayName:'合成有据保留身份',aliases:['合成别名'],intro:'合成完整身份依据',createTalent:withTalent})).resourceId as string;
 const currentPerson=()=>f.store.transaction(async tx=>(await tx.get('people',personId))!);
 const languageId=withTalent?ok(await f.owner.cmd('POST',`/td2/people/${personId}/languages`,{schemaVersion,expectedPersonRevision:(await currentPerson()).revision,sourceId,sourceRevision:1,values:{languageCode:'en',speakingLevelCode:'WORKING'}})).resourceId as string:null;
 const roleId=withTalent?ok(await f.owner.cmd('POST',`/td2/people/${personId}/roles`,{schemaVersion,expectedPersonRevision:(await currentPerson()).revision,sourceId,sourceRevision:1,values:{roleCode:'translator'}})).resourceId as string:null;
 const prove=async(ownerKind:string,ownerId:string,fieldPath:string,expectedRevision:number)=>ok(await f.owner.cmd('POST','/td2/evidence',{schemaVersion,ownerKind,ownerId,fieldPath,expectedRevision,sourceId:basisId,sourceRevision:1}),200);
 for(const field of ['displayName','aliases','intro'])await prove('person',personId,field,(await currentPerson()).revision);
 if(languageId)for(const field of Object.keys(TD2_FACTS.personLanguages.fields))await prove('personLanguages',languageId,field,1);
 ok(await f.owner.cmd('PUT',`/people/${personId}/contacts`,{expectedRevision:(await currentPerson()).revision,contacts:[{kind:'EMAIL',value:'synthetic-retained@example.invalid',sourceId:basisId}]}),200);
 if(withTalent)for(const table of ['talentProfiles','personRoles'] as const)for(const row of await f.store.transaction(tx=>tx.find(table,{personId})))for(const field of Object.keys(TD2_FACTS[table].fields))await prove(table,row.id,field,row.revision);
 const contactBefore=(await f.store.transaction(tx=>tx.find('contacts',{personId})))[0]!;
 const listId=ok(await f.owner.cmd('POST','/shortlists',{title:'合成身份保留候选',scopeId:(await currentPerson()).scopeId})).resourceId as string;
 if(withTalent)ok(await f.owner.cmd('POST',`/shortlists/${listId}/items`,{expectedRevision:1,personId,personRoleId:roleId,personRoleRevision:1,workAssetIds:[],note:'合成保留内部候选备注'}),200);
 const candidateBefore=(await f.store.transaction(tx=>tx.find('shortlistItems',{shortlistId:listId})))[0]!;
 let representedId:string|null=null,representationId:string|null=null;
 if(!withTalent){representedId=ok(await f.owner.cmd('POST','/td2/people',{schemaVersion,originSourceId:basisId,sourceRevision:1,displayName:'合成由保留联系人代表的人才',createTalent:true})).resourceId as string;const p=(await f.store.transaction(tx=>tx.get('people',representedId!)))!;representationId=ok(await f.owner.cmd('POST',`/td2/people/${representedId}/representations`,{schemaVersion,expectedPersonRevision:p.revision,sourceId:basisId,sourceRevision:1,values:{relationCode:'AGENT',agentPersonId:personId}})).resourceId as string;for(const field of Object.keys(TD2_FACTS.representations.fields))await prove('representations',representationId,field,1);}
 const personBefore=await currentPerson(),workspaceId=personBefore.workspaceId,basisBefore=await f.store.transaction(tx=>tx.find('evidence',{sourceId:basisId}));
 const preview=ok(await f.owner.raw('POST','/deletion-requests/preview',{targetKind:'SOURCE',targetId:sourceId,expectedRevision:1}),200);assert.equal(preview.complete,true,JSON.stringify(preview.unresolved));
 const requestId=ok(await f.owner.cmd('POST','/deletion-requests',{targetKind:'SOURCE',targetId:sourceId,expectedRevision:1,previewDigest:preview.previewDigest,reason:'合成删除原始来源，保留独立证明的身份与语言'})).resourceId as string;
 const current=()=>f.store.transaction(async tx=>(await tx.get('deletionRequests',requestId))!);
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/block`,{expectedRevision:1,previewDigest:preview.previewDigest,acknowledgeBlock:true}),200);
 for(const item of await f.store.transaction(tx=>tx.find('deletionItems',{requestId})))if(item.decision==='PENDING'){
  const retain=item.resourceKind==='person'||item.resourceKind==='talentSourceFact'||item.dependencyKind==='SOURCE_IDENTITY_DEPENDENCY';
  ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/decisions`,{expectedRevision:(await current()).revision,entryId:item.id,decision:retain?'RETAIN_WITH_BASIS':'APPLY_PROPOSED',decisionReason:'合成逐项核对现有独立依据，保持最初来源及核验归属',...(retain?{retentionSourceId:basisId}:{})}),200);
 }
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/plan/freeze`,{expectedRevision:(await current()).revision,acknowledgePlan:true}),200);
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/cleaning/start`,{expectedRevision:(await current()).revision,planDigest:(await current()).planDigest,acknowledgeIrreversible:true}),200);
 const before=await f.store.transaction(tx=>talentSnapshot(tx,workspaceId)),faults=new FaultStore(f.store);faults.afterInsert=(table,row)=>{if(table==='audits'&&'action' in row&&row.action==='deletion.cleanup-item'&&'changedFields' in row&&row.changedFields.includes('talentSourceFactGraph'))throw new AppError(503,'SYNTHETIC_AUDIT_FAILURE','synthetic identity retention rollback');};
 const worker=new DeletionCleanup(faults,f.clock,f.app.config),claim=await worker.claim();assert.ok(claim);await worker.process(claim);assert.deepEqual(await f.store.transaction(tx=>talentSnapshot(tx,workspaceId)),before);
 faults.afterInsert=null;const retry=await worker.claim();assert.ok(retry);await worker.process(retry);
 const basis=(await f.store.transaction(tx=>tx.get('sources',basisId)))!,originalTime=f.clock.value;
 f.clock.value=Date.parse(basis.validUntil)+1;
 let final=await f.app.deletionFinalization.claim();assert.ok(final);
 await f.app.deletionFinalization.finish(final);assert.equal((await current()).state,'CLEANING');assert.notEqual((await f.store.transaction(tx=>tx.get('sources',sourceId)))!.status,'ERASED');
 f.clock.value=originalTime;final=await f.app.deletionFinalization.claim();assert.ok(final);await f.app.deletionFinalization.finish(final);assert.equal((await current()).state,'RETAINED_WITH_BASIS');
 assert.deepEqual(await f.store.transaction(tx=>tx.get('contacts',contactBefore.id)),contactBefore);if(withTalent)assert.deepEqual(await f.store.transaction(tx=>tx.get('shortlistItems',candidateBefore.id)),candidateBefore);
 const person=await currentPerson();assert.equal(person.sourceId,sourceId);assert.equal(person.displayName,personBefore.displayName);assert.deepEqual(person.aliases,personBefore.aliases);assert.equal(person.intro,personBefore.intro);assert.deepEqual(await f.store.transaction(tx=>tx.find('evidence',{sourceId:basisId})),basisBefore);
 const detail=ok(await f.owner.raw('GET',`/td2/people/${personId}`),200);assert.equal(detail.originSourceId,sourceId);assert.equal(detail.originAvailable,false);assert.equal(detail.displayName,personBefore.displayName);if(languageId)assert.equal(detail.facts.personLanguages[0].id,languageId);else {assert.equal(detail.isTalent,false);assert.equal(Object.values(detail.facts).flat().length,0);}
 if(representedId){const related=ok(await f.owner.raw('GET',`/td2/people/${representedId}`),200);assert.equal(related.facts.representations[0].id,representationId);}
 for(const path of ['/people','/talent-search'])assert.ok(ok(await f.owner.raw('GET',path+'?q='+encodeURIComponent(person.displayName)),200).items.some((p:any)=>p.id===personId));
 assert.equal((await f.owner.raw('GET',`/people/${personId}`)).status,200);assert.equal((await f.owner.raw('GET',`/sources/${sourceId}`)).status,404);
 await f.store.transaction(tx=>tx.replace('sources',{...basis,status:'SUSPENDED'}));assert.equal((await f.owner.raw('GET',`/people/${personId}`)).status,404);assert.equal((await f.owner.raw('GET',`/td2/people/${personId}`)).status,404);
 await f.store.transaction(tx=>tx.replace('sources',basis));assert.equal((await f.owner.raw('GET',`/td2/people/${personId}`)).status,200);
 console.log('PASS TD2 identity retention: original source unchanged, complete independent evidence, atomic audit rollback/retry, basis expiry at finalization and suspended-basis access checks');
 return {personId,sourceId,basisId,languageId,requestId,currentPerson};
}
