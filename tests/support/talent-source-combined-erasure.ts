import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {seedSharedProof} from './talent-asset-erasure.ts';
import {seedSourceFacts,prepareSourceFacts,type FactErasureContext} from './talent-source-fact-erasure.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
import {FaultStore} from './fault-store.ts';
import {DeletionCleanup} from '../../packages/core/src/deletion-cleanup.ts';
import {inspectTalentIntegrity} from '../../packages/core/src/talent-v2-integrity.ts';
export async function verifyCombinedSourceErasure(f:FactErasureContext,root:string) {
 const media=await seedSharedProof(f,root,true),s=await seedSourceFacts(f,media.g,media.mediaSourceId);
 // A retained collection belongs to the erased source itself, with two erased originals and one independent original.
 const collectionId=ok(await f.owner.cmd('POST',`/td2/people/${s.g.personId}/collections`,{schemaVersion:'once-talent-v2.0.0',expectedPersonRevision:(await s.g.current()).revision,sourceId:s.sourceId,sourceRevision:1,values:{collectionTypeCode:'PORTFOLIO',title:'合成保留集合与部分原件'}})).resourceId as string;
 for(const targetCollectionId of [collectionId,s.collectionId]) for(const assetId of [media.assetId,media.secondAssetId!,media.keptAssetId]) {
  const c=(await f.store.transaction(tx=>tx.get('mediaCollections',targetCollectionId)))!;
  ok(await f.owner.cmd('POST',`/td2/collections/${targetCollectionId}/items`,{schemaVersion:'once-talent-v2.0.0',expectedRevision:c.revision,expectedPersonRevision:(await s.g.current()).revision,assetId,caption:'合成联合处置'}),200);
 }
 await s.prove('mediaCollections',collectionId);
 const preview=ok(await f.owner.raw('POST','/deletion-requests/preview',{targetKind:'SOURCE',targetId:s.sourceId,expectedRevision:1}),200);
 assert.equal(preview.complete,true,JSON.stringify(preview.unresolved));assert.equal(preview.items.filter((i:any)=>i.resourceKind==='talentSourceFactGraph').length,1);assert.equal(preview.items.some((i:any)=>i.resourceKind==='talentSourceAssetGraph'),false);
 const r=await prepareSourceFacts(f,s,[s.languageId,collectionId],5);
 const capture=()=>f.store.transaction(async tx=>({language:await tx.get('personLanguages',s.languageId),collection:await tx.get('mediaCollections',collectionId),role:await tx.get('personRoles',s.roleId),items:await tx.find('mediaCollectionItems',{personId:s.g.personId}),credentials:await tx.find('personCredentials',{personId:s.g.personId}),adult:await tx.get('adultEligibilities',media.adultId),proposals:await tx.find('fieldProposals',{personCredentialId:media.credentialId}),basis:await tx.find('evidence',{sourceId:s.basisId})}));
 const initial=await capture();
 ok(await f.owner.cmd('POST',`/deletion-requests/${r.requestId}/plan/freeze`,{expectedRevision:(await r.current()).revision,acknowledgePlan:true}),200);
 ok(await f.owner.cmd('POST',`/deletion-requests/${r.requestId}/cleaning/start`,{expectedRevision:(await r.current()).revision,planDigest:(await r.current()).planDigest,acknowledgeIrreversible:true}),200);
 const faults=new FaultStore(f.store);faults.afterInsert=(table,row)=>{if(table==='audits'&&'action' in row&&row.action==='deletion.cleanup-item'&&'changedFields' in row&&row.changedFields.includes('talentSourceFactGraph'))throw new Error('synthetic combined source rollback');};
 const worker=new DeletionCleanup(faults,f.clock,f.app.config),claim=await worker.claim();assert.ok(claim);await worker.process(claim);
 assert.deepEqual(await capture(),initial);
 faults.afterInsert=null;const retry=await worker.claim();assert.ok(retry);await worker.process(retry);
 const after=await capture();assert.equal(after.role,null);assert.deepEqual(after.language,initial.language);assert.deepEqual(after.basis,initial.basis);
 assert.deepEqual({...after.collection,revision:initial.collection!.revision,updatedAt:initial.collection!.updatedAt},initial.collection);
 for(const id of [s.g.collectionId,media.collection2,collectionId]){const rows=after.items.filter(i=>i.collectionId===id);assert.equal(rows.length,1);assert.equal(rows[0]!.assetId,media.keptAssetId);assert.equal(rows[0]!.orderIndex,0);}
 for(const id of [media.credentialId,media.secondCredentialId]){const c=after.credentials.find(c=>c.id===id)!;assert.equal(c.status,'REVOKED');assert.equal(c.evidenceAssetId,null);}
 assert.equal(after.adult!.state,'UNKNOWN');assert.equal(after.proposals.find(p=>p.id===media.proposalId)!.state,'STALE');
 let final=await f.app.deletionFinalization.claim();assert.ok(final);const tasks=await f.app.deletionFinalization.mediaTasks(final);assert.deepEqual(tasks.map(t=>t.mediaId).sort(),[media.assetId,media.secondAssetId!].sort());
 for(const task of tasks){await media.provider.purge(task.mediaId);await f.app.deletionFinalization.completeMediaPurge(final,task.mediaId);}
 const originalPerson=await s.g.current(),hiddenScopeId=randomUUID(),now=f.clock.now().toISOString();
 await f.store.transaction(async tx=>{await tx.insert('scopes',{id:hiddenScopeId,workspaceId:originalPerson.workspaceId,createdAt:now,updatedAt:now,revision:1,name:'合成最终化前失去关联范围',mode:'RESTRICTED'});await tx.replace('people',{...originalPerson,scopeId:hiddenScopeId});});
 await f.app.deletionFinalization.finish(final);assert.equal((await r.current()).state,'CLEANING');assert.equal((await r.current()).finalizationErrorCode,'TD2_CLEANUP_INCOMPLETE');assert.notEqual((await f.store.transaction(tx=>tx.get('sources',s.sourceId)))!.status,'ERASED');
 await f.store.transaction(tx=>tx.replace('people',originalPerson));final=await f.app.deletionFinalization.claim();assert.ok(final);
 await f.app.deletionFinalization.finish(final);assert.equal((await r.current()).state,'RETAINED_WITH_BASIS');assert.equal((await f.store.transaction(tx=>tx.get('sources',s.sourceId)))!.status,'ERASED');
 await media.provider.verifyAsset((await f.store.transaction(tx=>tx.get('assets',media.keptAssetId)))!);
 assert.equal((await f.store.transaction(tx=>inspectTalentIntegrity(tx,initial.language!.workspaceId,f.app.config.contactKey))).relationFailures,0);
 return {s,media,r,collectionId};
}
