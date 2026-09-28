import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DeletionCleanup} from '../../packages/core/src/deletion-cleanup.ts';
import {TD2_FACTS} from '../../packages/core/src/talent-v2-schema.ts';
import {sourceInput} from './fixtures.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
import type {FactErasureContext} from './talent-source-fact-erasure.ts';
import {FaultStore} from './fault-store.ts';
const schemaVersion='once-talent-v2.0.0';
/** Explicit withdrawal of qualification and secret precedes source cleanup. Ordinary
 * independent evidence retains history only; it never restores the revoked qualification. */
export async function verifyClearedCredentialRetention(f:FactErasureContext,assetId?:string){
 const makeSource=async(title:string)=>ok(await f.owner.cmd('POST','/sources',{...sourceInput(),title})).resourceId as string;
 const originId=await makeSource('合成资质保留人物来源'),sourceId=await makeSource('合成待删资质来源'),basisId=await makeSource('合成撤销资质独立历史依据');
 const personId=ok(await f.owner.cmd('POST','/td2/people',{schemaVersion,originSourceId:originId,sourceRevision:1,displayName:'合成资质清除后来源处置',createTalent:true})).resourceId as string;
 const person=()=>f.store.transaction(async tx=>(await tx.get('people',personId))!);
 const credentialId=ok(await f.owner.cmd('POST',`/td2/people/${personId}/credentials`,{schemaVersion,expectedPersonRevision:1,sourceId,sourceRevision:1,values:{credentialTypeCode:'DRONE_LICENSE',issuerName:'合成历史签发机构',...(assetId?{evidenceAssetId:assetId}:{})}})).resourceId as string;
 const credential=()=>f.store.transaction(async tx=>(await tx.get('personCredentials',credentialId))!);
 const input=async()=>({schemaVersion,expectedRevision:(await credential()).revision,expectedPersonRevision:(await person()).revision,sourceRevision:1});
 if(assetId)ok(await f.owner.cmd('POST',`/td2/credentials/${credentialId}/verify`,await input()),200);
 ok(await f.owner.cmd('POST',`/td2/credentials/${credentialId}/identifier`,{schemaVersion,expectedRevision:(await credential()).revision,expectedPersonRevision:(await person()).revision,identifier:'SYNTHETIC-RETAIN-'+randomUUID()}),200);
 const original=await credential();assert.ok(original.identifierCiphertext);
 // Source blocking follows the separate, explicit revoke and clear commands.
 ok(await f.owner.cmd('POST',`/td2/credentials/${credentialId}/revoke`,await input()),200);
 ok(await f.owner.cmd('POST',`/td2/credentials/${credentialId}/identifier/clear`,{...await input(),acknowledge:true}),200);
 const retained=await credential();assert.equal(retained.status,'REVOKED');assert.equal(retained.identifierCiphertext,null);assert.equal(retained.evidenceAssetId,original.evidenceAssetId);
 for(const fieldPath of Object.keys(TD2_FACTS.personCredentials.fields))ok(await f.owner.cmd('POST','/td2/evidence',{schemaVersion,ownerKind:'personCredentials',ownerId:credentialId,fieldPath,expectedRevision:retained.revision,sourceId:basisId,sourceRevision:1}),200);
 const independent=await f.store.transaction(tx=>tx.find('evidence',{personCredentialId:credentialId,sourceId:basisId}));
 const preview=ok(await f.owner.raw('POST','/deletion-requests/preview',{targetKind:'SOURCE',targetId:sourceId,expectedRevision:1}),200);assert.equal(preview.complete,true,JSON.stringify(preview.unresolved));
 const requestId=ok(await f.owner.cmd('POST','/deletion-requests',{targetKind:'SOURCE',targetId:sourceId,expectedRevision:1,previewDigest:preview.previewDigest,reason:'合成已撤销资格并清除编号，仅保留有独立依据的历史资质'})).resourceId as string;
 const request=()=>f.store.transaction(async tx=>(await tx.get('deletionRequests',requestId))!);
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/block`,{expectedRevision:1,previewDigest:preview.previewDigest,acknowledgeBlock:true}),200);
 for(const item of await f.store.transaction(tx=>tx.find('deletionItems',{requestId})))if(item.decision==='PENDING'){
  const retain=item.resourceKind==='talentSourceFact'&&item.resourceId===credentialId;
  ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/decisions`,{expectedRevision:(await request()).revision,entryId:item.id,decision:retain?'RETAIN_WITH_BASIS':'APPLY_PROPOSED',decisionReason:'合成明确处理：保留已撤销资质历史，不保留编号或恢复资格',...(retain?{retentionSourceId:basisId}:{})}),200);
 }
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/plan/freeze`,{expectedRevision:(await request()).revision,acknowledgePlan:true}),200);
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/cleaning/start`,{expectedRevision:(await request()).revision,planDigest:(await request()).planDigest,acknowledgeIrreversible:true}),200);
 const fault=new FaultStore(f.store);let fired=false;fault.afterInsert=(table,row)=>{if(table==='audits'&&'action' in row&&row.action==='deletion.cleanup-item'&&'changedFields' in row&&row.changedFields.includes('talentSourceFactGraph')){fired=true;throw new Error('synthetic credential retention cleanup audit failure');}};
 const worker=new DeletionCleanup(fault,f.clock,f.app.config),claim=await worker.claim();assert.ok(claim);await worker.process(claim);assert.equal(fired,true);assert.deepEqual(await credential(),retained);assert.deepEqual(await f.store.transaction(tx=>tx.find('evidence',{personCredentialId:credentialId,sourceId:basisId})),independent);
 fault.afterInsert=null;const retry=await worker.claim();assert.ok(retry);await worker.process(retry);const final=await f.app.deletionFinalization.claim();assert.ok(final);await f.app.deletionFinalization.finish(final);
 assert.equal((await request()).state,'RETAINED_WITH_BASIS');assert.equal((await f.store.transaction(tx=>tx.get('sources',sourceId)))!.status,'ERASED');assert.deepEqual(await credential(),retained);assert.deepEqual(await f.store.transaction(tx=>tx.find('evidence',{personCredentialId:credentialId,sourceId:basisId})),independent);
 const detail=ok(await f.owner.raw('GET',`/td2/people/${personId}`),200),visible=detail.facts.personCredentials.find((r:any)=>r.id===credentialId);assert.equal(visible.status,'REVOKED');assert.equal(visible.usable,false);assert.equal(ok(await f.owner.raw('GET',`/td2/people?q=合成资质清除后来源处置&credentialType=DRONE_LICENSE`),200).total,0);
 return {personId,credentialId,requestId};
}
