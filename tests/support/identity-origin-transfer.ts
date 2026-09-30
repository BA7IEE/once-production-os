import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {verifyIdentityRetention} from './talent-identity-retention.ts';
import type {FactErasureContext} from './talent-source-fact-erasure.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
import {SOURCE_FIELDS} from './talent-transfer.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import {FaultStore} from './fault-store.ts';
import {AppError} from '../../packages/core/src/errors.ts';
export async function exportRetainedIdentity(f:FactErasureContext,withTalent=false){
 const person=await verifyIdentityRetention(f,withTalent),fields=['person.displayName','person.aliases','person.intro','person.status','person.identityEvidence',...(withTalent?['person.td2.talentProfiles','person.td2.personRoles','person.td2.personLanguages','person.td2.fieldEvidence']:[])];
 const personPermitInput={subjectKind:'PERSON',subjectId:person.personId,sourceId:person.sourceId,retentionBasisSourceId:person.basisId,fields,validUntil:'2026-10-01T00:00:00.000Z',evidenceNote:'合成原始来源最小编号与完整独立身份依据许可'},personPermitKey=randomUUID();
 const personPermission=ok(await f.owner.cmd('POST','/use-permissions',personPermitInput,personPermitKey)).resourceId as string;
 assert.equal(ok(await f.owner.cmd('POST','/use-permissions',personPermitInput,personPermitKey)).replayed,true);
 const basisPermission=ok(await f.owner.cmd('POST','/use-permissions',{subjectKind:'SOURCE',subjectId:person.basisId,sourceId:person.basisId,fields:[...SOURCE_FIELDS,...fields.filter(f=>f!=='person.status')],validUntil:'2026-10-01T00:00:00.000Z',evidenceNote:'合成独立身份依据的字段及来源许可'})).resourceId as string;
 const input={format:'JSON',selectedIds:{people:[person.personId],works:[],projects:[]},fields:[...fields,...SOURCE_FIELDS],usePermissionRefs:[personPermission,basisPermission]};
 const exportKey=randomUUID(),jobId=ok(await f.owner.cmd('POST','/exports',input,exportKey),202).resourceId as string,claim=await f.app.exports.claim();assert.ok(claim);assert.equal(claim.id,jobId);await f.app.exports.process(claim);
 assert.equal(ok(await f.owner.cmd('POST','/exports',input,exportKey),202).replayed,true);
 const ready=(await f.store.transaction(tx=>tx.get('exports',jobId)))!;assert.equal(ready.state,'READY',ready.errorCode??'export worker not ready');
 const download=ok(await f.owner.raw('POST',`/exports/${jobId}/download`,{}),200),bundle=download.payload.manifest.talent;assert.equal(bundle.schemaVersion,'once-talent-transfer-v15');assert.equal(bundle.selectedFields.length,withTalent?3:0);assert.equal(bundle.retainedOrigins[0].id,person.sourceId);assert.equal(download.payload.manifest.people[0].sourceId,person.sourceId);assert.equal(download.payload.manifest.sources.length,1);assert.equal(download.payload.manifest.sources[0].id,person.basisId);
 return {person,input,jobId,download,bundle,personPermission,basisPermission,personPermitInput,personPermitKey,exportKey};
}
export async function roundTripRetainedIdentity(source:FactErasureContext,target:FactErasureContext,apply?:(payload:unknown,sha256:string)=>Promise<void>,withTalent=false){
 const t=await exportRetainedIdentity(source,withTalent),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
 const summary=await target.store.transaction(tx=>rebuild.preview(tx,actor,t.download.payload));assert.equal(summary.counts.sources,2);assert.equal(summary.counts.people,1);
 const faults=new FaultStore(target.store);faults.afterInsert=(table,row)=>{if(table==='audits'&&'action' in row&&row.action==='rebuild.apply')throw new AppError(503,'SYNTHETIC_AUDIT_FAILURE','synthetic retained identity rebuild rollback');};
 await assert.rejects(faults.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'})),/synthetic retained identity/);assert.equal((await target.store.transaction(tx=>tx.find('people'))).length,0);
 if(apply)await apply(t.download.payload,t.download.sha256);else await target.store.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'}));
 const identity=ok(await target.owner.raw('GET',`/td2/people/${t.person.personId}`),200);assert.equal(identity.originSourceId,t.person.sourceId);assert.equal(identity.originAvailable,false);assert.equal(identity.isTalent,withTalent);assert.equal(identity.displayName,'合成有据保留身份');assert.equal((await target.owner.raw('GET',`/sources/${t.person.sourceId}`)).status,404);
 const origin=(await target.store.transaction(tx=>tx.get('sources',t.person.sourceId)))!;assert.equal(origin.status,'ERASED');assert.equal(origin.providerClaim,'');assert.equal(origin.reviewedAt,null);assert.equal((await target.store.transaction(tx=>tx.find('usePermissions'))).length,0);
 console.log('PASS retained identity v13: separately approved current basis, erased original header, actual identity evidence and original reviewers, audit rollback and rebuild without restoring old permissions');
 return t;
}
