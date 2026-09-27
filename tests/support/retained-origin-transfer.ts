import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {verifySourceFactErasure,type FactErasureContext} from './talent-source-fact-erasure.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
import {SOURCE_FIELDS} from './talent-transfer.ts';
import {EVIDENCE_TRANSFER_CODE,collectTalentTransfer} from '../../packages/core/src/talent-transfer.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import {FaultStore} from './fault-store.ts';
import {digest} from '../../packages/core/src/json.ts';
import {AppError} from '../../packages/core/src/errors.ts';
export async function exportRetainedOrigin(f:FactErasureContext) {
 const {s}=await verifySourceFactErasure(f),fields=['person.displayName','person.status','person.td2.personLanguages',EVIDENCE_TRANSFER_CODE];
 const permit=async(kind:string,id:string,sourceId:string,fields:string[])=>ok(await f.owner.cmd('POST','/use-permissions',{subjectKind:kind,subjectId:id,sourceId,fields,validUntil:'2026-10-01T00:00:00.000Z',evidenceNote:'合成许可独立依据及所支持保留语言迁移'})).resourceId as string;
 const personPermission=await permit('PERSON',s.g.personId,s.g.sourceId,fields),primaryPermission=await permit('SOURCE',s.g.sourceId,s.g.sourceId,[...SOURCE_FIELDS,...fields.slice(2)]),basisPermission=await permit('SOURCE',s.basisId,s.basisId,[...SOURCE_FIELDS,...fields.slice(2)]);
 const input={format:'JSON',selectedIds:{people:[s.g.personId],works:[],projects:[]},fields:[...fields,...SOURCE_FIELDS],usePermissionRefs:[personPermission,primaryPermission,basisPermission]};
 const missing=await f.owner.cmd('POST','/exports',{...input,usePermissionRefs:[personPermission,primaryPermission]});assert.equal(missing.status,422);
 const jobId=ok(await f.owner.cmd('POST','/exports',input),202).resourceId as string,claim=await f.app.exports.claim();assert.ok(claim);assert.equal(claim.id,jobId);await f.app.exports.process(claim);
 const download=ok(await f.owner.raw('POST',`/exports/${jobId}/download`,{}),200),bundle=download.payload.manifest.talent;
 assert.equal(bundle.schemaVersion,'once-talent-transfer-v12');assert.equal(download.sha256,digest(download.payload));
 const origin=(await f.store.transaction(tx=>tx.get('sources',s.sourceId)))!;
 assert.deepEqual(bundle.retainedOrigins,[{id:origin.id,revision:origin.revision,protectionEpoch:origin.protectionEpoch,status:'ERASED'}]);assert.equal(download.payload.manifest.sources.some((r:any)=>r.id===origin.id),false);
 return {s,input,jobId,download,bundle,basisPermission};
}
export async function roundTripRetainedOrigin(source:FactErasureContext,target:FactErasureContext,apply?:(payload:unknown,sha256:string)=>Promise<void>) {
 const t=await exportRetainedOrigin(source),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
 const summary=await target.store.transaction(tx=>rebuild.preview(tx,actor,t.download.payload));assert.equal(summary.professionalRecords,2);assert.equal(summary.counts.sources,3);
 const faults=new FaultStore(target.store);faults.afterInsert=(table,row)=>{if(table==='audits'&&'action' in row&&row.action==='rebuild.apply')throw new AppError(503,'STORE_UNAVAILABLE','synthetic retained origin rebuild audit rollback');};
 await assert.rejects(faults.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'})),/synthetic retained origin/);assert.equal((await target.store.transaction(tx=>tx.find('sources'))).length,0);
 if(apply)await apply(t.download.payload,t.download.sha256);else await target.store.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'}));
 const origin=(await target.store.transaction(tx=>tx.get('sources',t.s.sourceId)))!;assert.equal(origin.status,'ERASED');assert.equal(origin.reviewedBy,null);assert.equal(origin.providerClaim,'');assert.equal(origin.textPayload,'');
 const row=(await target.store.transaction(tx=>tx.get('personLanguages',t.s.languageId)))!;assert.equal(row.sourceId,origin.id);assert.equal(row.speakingLevelCode,'FLUENT');
 const detail=ok(await target.owner.raw('GET',`/td2/people/${t.s.g.personId}`),200);assert.equal(detail.facts.personLanguages.find((l:any)=>l.id===row.id).usable,true);
 const again=await target.store.transaction(tx=>collectTalentTransfer(tx,actor,target.clock,[t.s.g.personId],['person.td2.personLanguages'],true));assert.equal(again.schemaVersion,'once-talent-transfer-v12');assert.deepEqual(again.tables.personLanguages,t.bundle.tables.personLanguages);assert.deepEqual(again.evidence,t.bundle.evidence);
 assert.equal((await target.owner.raw('GET',`/sources/${origin.id}`)).status,404);
 assert.equal((await target.owner.cmd('POST',`/sources/${origin.id}/review`,{expectedRevision:origin.revision,basisDescription:'不能重新激活已删除来源',validUntil:'2026-12-31T00:00:00.000Z'})).status,404);
 assert.equal((await target.owner.cmd('POST',`/sources/${origin.id}/suspend`,{expectedRevision:origin.revision,reason:'不能把已删来源改回暂停再重新核验'})).status,404);
 assert.equal((await target.store.transaction(tx=>tx.get('sources',origin.id)))!.status,'ERASED');
 return t;
}
