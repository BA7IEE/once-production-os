import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {FactErasureContext} from './talent-source-fact-erasure.ts';
import {verifyHistoryErasure} from './merge-history-erasure.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
import {SOURCE_FIELDS} from './talent-transfer.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import {FaultStore} from './fault-store.ts';
import {AppError} from '../../packages/core/src/errors.ts';
import {inspectTalentIntegrity} from '../../packages/core/src/talent-v2-integrity.ts';
export async function exportErasedHistory(f:FactErasureContext){
 const t=await verifyHistoryErasure(f,true),personId=t.s.a.personId,sources=[t.s.a.sourceId,t.s.b.sourceId];
 const exported=await exportSelectedHistory(f,personId,sources);return {t,...exported};
}
async function exportSelectedHistory(f:FactErasureContext,personId:string,sources:string[]){
 const fields=['person.displayName','person.status','person.td2.talentProfiles','person.td2.personRoles','person.td2.castingProfiles','person.td2.measurementSets','person.td2.fieldEvidence','person.td2.mergeHistory',...SOURCE_FIELDS],refs=[];
 for(const [kind,id,sourceId,grantFields] of [['PERSON',personId,sources[0],fields.filter(f=>f.startsWith('person.'))],...sources.map(s=>['SOURCE',s,s,fields.filter(f=>f!=='person.displayName'&&f!=='person.status')])] as const)refs.push(ok(await f.owner.cmd('POST','/use-permissions',{subjectKind:kind,subjectId:id,sourceId,fields:grantFields,validUntil:'2026-10-01T00:00:00.000Z',evidenceNote:'合成明确批准清理后历史最小编号、原决定归属和清理记录'})).resourceId as string);
 const input={format:'JSON',selectedIds:{people:[personId],works:[],projects:[]},fields,usePermissionRefs:refs},jobId=ok(await f.owner.cmd('POST','/exports',input),202).resourceId as string,claim=await f.app.exports.claim();assert.ok(claim);await f.app.exports.process(claim);
 const job=(await f.store.transaction(tx=>tx.get('exports',jobId)))!;assert.equal(job.state,'READY',job.errorCode??'erased history export not ready');
 const download=ok(await f.owner.raw('POST',`/exports/${jobId}/download`,{}),200),bundle=download.payload.manifest.talent;assert.equal(bundle.schemaVersion,'once-talent-transfer-v14');assert.equal(bundle.mergeHistory.erasures.length,3);assert.equal(bundle.mergeHistory.people[0].status,'ERASED');assert.equal('displayName'in bundle.mergeHistory.people[0],false);assert.equal(bundle.mergeHistory.talentProfiles.length,0);assert.equal(bundle.mergeHistory.castingProfiles.length,0);assert.equal(bundle.mergeHistory.decisions[0].decisionManifest.reason,'[ERASED]');
 return {download,bundle,jobId};
}
export async function roundTripErasedHistory(source:FactErasureContext,target:FactErasureContext,apply?:(payload:unknown,sha256:string)=>Promise<void>){
 const t=await exportErasedHistory(source),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
 await target.store.transaction(tx=>rebuild.preview(tx,actor,t.download.payload));
 const faults=new FaultStore(target.store);faults.afterInsert=(table,row)=>{if(table==='audits'&&'action'in row&&row.action==='rebuild.apply')throw new AppError(503,'SYNTHETIC_AUDIT_FAILURE','synthetic redacted history rebuild rollback');};
 await assert.rejects(faults.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'})),/synthetic redacted history/);assert.equal((await target.store.transaction(tx=>tx.find('people'))).length,0);assert.equal((await target.store.transaction(tx=>tx.find('mergeHistoryErasures'))).length,0);
 if(apply)await apply(t.download.payload,t.download.sha256);else await target.store.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'}));
 const personId=t.t.s.a.personId,oldId=t.t.s.b.personId,old=(await target.store.transaction(tx=>tx.get('people',oldId)))!;assert.equal(old.status,'ERASED');assert.equal(old.displayName,'[ERASED]');assert.equal((await target.owner.raw('GET',`/td2/people/${personId}`)).status,200);assert.equal((await target.store.transaction(tx=>tx.find('talentProfiles',{personId:oldId}))).length,0);
 const events=await target.store.transaction(tx=>tx.find('mergeHistoryErasures'));for(const e of events){assert.equal(e.requestId,null);assert.equal(e.actorId,null);assert.ok(e.originalRequestId&&e.originalActorId&&e.originalWorkspaceId);}
 assert.equal((await target.store.transaction(tx=>inspectTalentIntegrity(tx,old.workspaceId,target.app.config.contactKey))).relationFailures,0);
 const again=await exportSelectedHistory(target,personId,[t.t.s.a.sourceId,t.t.s.b.sourceId]);assert.deepEqual(again.bundle.mergeHistory.erasures,t.bundle.mergeHistory.erasures);assert.deepEqual(again.bundle.mergeHistory.decisions,t.bundle.mergeHistory.decisions);
 console.log('PASS v14 erased history rebuild: minimal erased identity, original alias/merge choice, distinct original erasure attribution, no deleted profile resurrection, audit rollback and retry');return t;
}
