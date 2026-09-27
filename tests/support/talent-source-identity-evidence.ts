import assert from 'node:assert/strict';
import {sourceInput} from './fixtures.ts';
import {seedSourceFacts,prepareSourceFacts,type FactErasureContext} from './talent-source-fact-erasure.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
import {FaultStore} from './fault-store.ts';
import {DeletionCleanup} from '../../packages/core/src/deletion-cleanup.ts';
import {AppError} from '../../packages/core/src/errors.ts';
const schemaVersion='once-talent-v2.0.0';
export async function seedSourceOtherIdentity(f:FactErasureContext,complete=true){
 const s=await seedSourceFacts(f),basisId=ok(await f.owner.cmd('POST','/sources',{...sourceInput(),title:'合成另一身份的独立现成依据',validUntil:new Date(f.clock.value+86400000).toISOString()})).resourceId as string;
 const personId=ok(await f.owner.cmd('POST','/td2/people',{schemaVersion,originSourceId:s.g.sourceId,sourceRevision:1,displayName:'合成其他来源的普通联系人',intro:'不涉及本次撤回的简介',createTalent:false})).resourceId as string;
 for(const sourceId of complete?[s.sourceId,basisId]:[s.sourceId])ok(await f.owner.cmd('POST','/td2/evidence',{schemaVersion,ownerKind:'person',ownerId:personId,expectedRevision:(await f.store.transaction(tx=>tx.get('people',personId)))!.revision,fieldPath:'displayName',sourceId,sourceRevision:1}),200);
 return {s,basisId,personId};
}
export async function verifySourceOtherIdentity(f:FactErasureContext){
 const t=await seedSourceOtherIdentity(f),r=await prepareSourceFacts(f,t.s),person=await f.store.transaction(tx=>tx.get('people',t.personId)),basis=await f.store.transaction(tx=>tx.find('evidence',{personId:t.personId,sourceId:t.basisId})),removed=await f.store.transaction(tx=>tx.find('evidence',{personId:t.personId,sourceId:t.s.sourceId}));
 const identityItem=(await f.store.transaction(tx=>tx.find('deletionItems',{requestId:r.requestId}))).find(i=>i.resourceKind==='talentSourceIdentityEvidence');assert.ok(identityItem);assert.equal(identityItem.decision,'APPLY_PROPOSED');
 ok(await f.owner.cmd('POST',`/deletion-requests/${r.requestId}/plan/freeze`,{expectedRevision:(await r.current()).revision,acknowledgePlan:true}),200);
 ok(await f.owner.cmd('POST',`/deletion-requests/${r.requestId}/cleaning/start`,{expectedRevision:(await r.current()).revision,planDigest:(await r.current()).planDigest,acknowledgeIrreversible:true}),200);
 const faults=new FaultStore(f.store);faults.afterInsert=(table,row)=>{if(table==='audits'&&'action'in row&&row.action==='deletion.cleanup-item'&&'changedFields'in row&&row.changedFields.includes('talentSourceFactGraph'))throw new AppError(503,'SYNTHETIC_AUDIT_FAILURE','synthetic combined identity withdrawal rollback');};
 const worker=new DeletionCleanup(faults,f.clock,f.app.config),claim=await worker.claim();assert.ok(claim);await worker.process(claim);
 assert.deepEqual(await f.store.transaction(tx=>tx.get('people',t.personId)),person);assert.deepEqual(await f.store.transaction(tx=>tx.find('evidence',{personId:t.personId,sourceId:t.s.sourceId})),removed);assert.ok(await f.store.transaction(tx=>tx.get('personRoles',t.s.roleId)));
 faults.afterInsert=null;const retry=await worker.claim();assert.ok(retry);await worker.process(retry);
 assert.equal((await f.store.transaction(tx=>tx.find('evidence',{personId:t.personId,sourceId:t.s.sourceId}))).length,0);assert.deepEqual(await f.store.transaction(tx=>tx.find('evidence',{personId:t.personId,sourceId:t.basisId})),basis);
 const now=f.clock.value;f.clock.value+=86400001;const expired=await f.app.deletionFinalization.claim();assert.ok(expired);await f.app.deletionFinalization.finish(expired);assert.equal((await r.current()).state,'CLEANING');assert.equal((await r.current()).finalizationErrorCode,'TD2_IDENTITY_RETENTION_CHANGED');f.clock.value=now;
 const final=await f.app.deletionFinalization.claim();assert.ok(final);await f.app.deletionFinalization.finish(final);assert.equal((await r.current()).state,'RETAINED_WITH_BASIS');
 const kept=(await f.store.transaction(tx=>tx.get('people',t.personId)))!;assert.equal(kept.sourceId,person!.sourceId);assert.equal(kept.displayName,person!.displayName);assert.equal(kept.intro,person!.intro);assert.equal((await f.owner.raw('GET',`/td2/people/${t.personId}`)).status,200);
 assert.equal((await f.store.transaction(tx=>tx.find('talentProfiles',{personId:t.personId}))).length,0);
 console.log('PASS combined source/other-identity withdrawal: explicit field item, unchanged other identity and independent evidence, whole-group audit rollback/retry, final basis expiry refuses completion');
 return {t,r};
}
