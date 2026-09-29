import assert from 'node:assert/strict';
import type {FactErasureContext} from './talent-source-fact-erasure.ts';
import {seedProfessionalGraph,expectResponse as ok} from './talent-v2-maintenance.ts';
import {mergePreview,mergeInput} from './talent-v2-merge.ts';
import {talentSnapshot,inspectTalentIntegrity} from '../../packages/core/src/talent-v2-integrity.ts';
import {FaultStore} from './fault-store.ts';
import {DeletionCleanup} from '../../packages/core/src/deletion-cleanup.ts';
import {AppError} from '../../packages/core/src/errors.ts';
export async function seedHistoryErasure(f:FactErasureContext){
 const a=await seedProfessionalGraph(f.app,f.store,f.clock,f.owner),b=await seedProfessionalGraph(f.app,f.store,f.clock,f.owner),p=await mergePreview(f.store,f.owner,a.personId,b.personId);
 const input={...mergeInput(p),reason:'合成含个人资料的合并说明须专用清理',professionalConflicts:p.professional.conflicts.map((c:any)=>({table:c.table,canonicalId:c.canonicalId,duplicateId:c.duplicateId,choice:c.choices.includes('RETAIN_DUPLICATE_HISTORY')?'RETAIN_DUPLICATE_HISTORY':'KEEP_CANONICAL_ACTIVE'}))};
 const mergeId=ok(await f.owner.cmd('POST','/people/merge',input),200).resourceId as string;
 return {a,b,mergeId};
}
export async function verifyHistoryErasure(f:FactErasureContext,oldOnly=false,beforeErase?:(s:Awaited<ReturnType<typeof seedHistoryErasure>>,data:Awaited<ReturnType<typeof talentSnapshot>>)=>Promise<void>){
 const s=await seedHistoryErasure(f),target=oldOnly?s.b:s.a,person=await target.current(),before=await f.store.transaction(tx=>talentSnapshot(tx,person.workspaceId));
 const readable=ok(await f.owner.raw('GET',`/people/${s.a.personId}/merge-history`),200); assert.equal(readable.items.length,2); assert.ok(readable.items.every((r:any)=>r.oldIdentity.id===s.b.personId&&r.oldIdentity.revision===(before.people.find(p=>p.id===s.b.personId)!.revision)));
 if(beforeErase)await beforeErase(s,before);
 const preview=ok(await f.owner.raw('POST','/deletion-requests/preview',{targetKind:'PERSON',targetId:person.id,expectedRevision:person.revision}),200);assert.equal(preview.complete,true,JSON.stringify(preview.unresolved));
 const requestId=ok(await f.owner.cmd('POST','/deletion-requests',{targetKind:'PERSON',targetId:person.id,expectedRevision:person.revision,previewDigest:preview.previewDigest,reason:'合成明确清理合并历史个人内容，保留最小原合并关系'})).resourceId as string,current=()=>f.store.transaction(async tx=>(await tx.get('deletionRequests',requestId))!);
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/block`,{expectedRevision:1,previewDigest:preview.previewDigest,acknowledgeBlock:true}),200);
 for(const item of await f.store.transaction(tx=>tx.find('deletionItems',{requestId})))if(item.decision==='PENDING')ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/decisions`,{expectedRevision:(await current()).revision,entryId:item.id,decision:'APPLY_PROPOSED',decisionReason:'合成确认清除对应内容，保留编号映射及原决定归属'}),200);
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/plan/freeze`,{expectedRevision:(await current()).revision,acknowledgePlan:true}),200);
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/cleaning/start`,{expectedRevision:(await current()).revision,planDigest:(await current()).planDigest,acknowledgeIrreversible:true}),200);
 const frozen=await f.store.transaction(tx=>talentSnapshot(tx,person.workspaceId)),faults=new FaultStore(f.store);faults.afterInsert=(table,row)=>{if(table==='audits'&&'action'in row&&row.action==='deletion.cleanup-item'&&'changedFields'in row&&row.changedFields.includes('talentGraph'))throw new AppError(503,'SYNTHETIC_AUDIT_FAILURE','synthetic history erasure rollback');};
 const worker=new DeletionCleanup(faults,f.clock,f.app.config),claim=await worker.claim();assert.ok(claim);await worker.process(claim);assert.deepEqual(await f.store.transaction(tx=>talentSnapshot(tx,person.workspaceId)),frozen);
 faults.afterInsert=null;const retry=await worker.claim();assert.ok(retry);await worker.process(retry);
 const graphItem=(await f.store.transaction(tx=>tx.find('deletionItems',{requestId}))).find(i=>i.resourceKind==='talentGraph')!;assert.equal(graphItem.cleanupState,'DONE',graphItem.cleanupErrorCode??'history group not complete');
 const final=await f.app.deletionFinalization.claim();assert.ok(final);await f.app.deletionFinalization.finish(final);assert.equal((await current()).state,'COMPLETED');
 const after=await f.store.transaction(tx=>talentSnapshot(tx,person.workspaceId));assert.equal(after.mergeHistoryErasures.filter(e=>e.mergeDecisionId===s.mergeId).length,3);assert.deepEqual(after.personAliases,before.personAliases);
 const original=before.personMerges.find(m=>m.id===s.mergeId)!,erased=after.personMerges.find(m=>m.id===s.mergeId)!;
 for(const field of Object.keys(original).filter(k=>!['revision','updatedAt','reasonErasedAt','decisionManifest'].includes(k)))assert.deepEqual(erased[field],original[field]);
 assert.equal((erased.decisionManifest as any).reason,'[ERASED]');assert.ok(erased.reasonErasedAt);const {reason,...oldDecisions}=original.decisionManifest as any,{reason:newReason,...newDecisions}=erased.decisionManifest as any;assert.deepEqual(newDecisions,oldDecisions);
 assert.equal((await s.b.current()).status,'ERASED');assert.equal((await s.b.current()).displayName,'[ERASED]');assert.equal((await s.a.current()).status,oldOnly?before.people.find(p=>p.id===s.a.personId)!.status:'ERASED');
 for(const table of ['talentProfiles','castingProfiles'] as const){assert.equal(after[table].some(r=>r.personId===s.b.personId),false);if(oldOnly)assert.deepEqual(after[table].filter(r=>r.personId===s.a.personId),before[table].filter(r=>r.personId===s.a.personId));}
 if(oldOnly){const read=ok(await f.owner.raw('GET',`/people/${s.a.personId}/merge-history`),200);assert.equal(read.items.length,3);assert.ok(read.items.every((r:any)=>r.erased===true&&r.retained===false&&r.record.usable===false&&r.oldIdentity.displayName==='[ERASED]'));assert.equal(JSON.stringify(read).includes('合成含个人资料'),false);assert.deepEqual(after.people.find(p=>p.id===s.a.personId),before.people.find(p=>p.id===s.a.personId));assert.deepEqual(after.measurementSets,before.measurementSets);}else assert.equal(after.measurementSets.some(r=>r.personId===s.a.personId),false);
 assert.equal((await f.store.transaction(tx=>inspectTalentIntegrity(tx,person.workspaceId,f.app.config.contactKey))).relationFailures,0);
 console.log('PASS merged history erasure: '+(oldOnly?'old identity only preserves current facts':'whole merged identity clears all historical payload')+', append-only lineage, original merge choices/actor, atomic audit rollback and retry');
 return {s,requestId,before,after};
}
