import assert from 'node:assert/strict';
import type {Application} from '../../packages/core/src/api.ts';
import type {Store} from '../../packages/core/src/store.ts';
import {type FakeClock,type Client,sourceInput} from './fixtures.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
import {SOURCE_FIELDS} from './talent-transfer.ts';
import {IDENTITY_EVIDENCE_CODE} from '../../packages/core/src/identity-transfer.ts';
export async function identityTransfer(f:{app:Application;store:Store;clock:FakeClock;owner:Client}) {
 const schemaVersion='once-talent-v2.0.0',source=ok(await f.owner.cmd('POST','/sources',sourceInput())).resourceId as string;
 const other=ok(await f.owner.cmd('POST','/sources',{...sourceInput(),title:'身份字段独立来源'})).resourceId as string;
 const excluded=ok(await f.owner.cmd('POST','/sources',{...sourceInput(),title:'未导出的简介来源'})).resourceId as string;
 const personId=ok(await f.owner.cmd('POST','/td2/people',{schemaVersion,originSourceId:source,sourceRevision:1,displayName:'合成普通联系人',aliases:['合成别名'],intro:'不导出的简介'})).resourceId as string;
 const current=()=>f.store.transaction(async tx=>(await tx.get('people',personId))!);
 for(const [fieldPath,sourceId] of [['displayName',source],['aliases',source],['intro',excluded],['displayName',other]])ok(await f.owner.cmd('POST','/td2/evidence',{schemaVersion,ownerKind:'person',ownerId:personId,fieldPath,expectedRevision:(await current()).revision,sourceId,sourceRevision:1}),200);
 const identityFields=['person.displayName','person.aliases'],fields=[...identityFields,'person.status',IDENTITY_EVIDENCE_CODE,...SOURCE_FIELDS],refs=[];
 for(const [kind,id,scopeFields] of [['PERSON',personId,[...identityFields,'person.status',IDENTITY_EVIDENCE_CODE]],['SOURCE',source,[...SOURCE_FIELDS,...identityFields,IDENTITY_EVIDENCE_CODE]],['SOURCE',other,[...SOURCE_FIELDS,'person.displayName',IDENTITY_EVIDENCE_CODE]]] as const)refs.push(ok(await f.owner.cmd('POST','/use-permissions',{subjectKind:kind,subjectId:id,sourceId:kind==='PERSON'?source:id,fields:scopeFields,validUntil:'2026-10-01T00:00:00.000Z',evidenceNote:'合成：单独批准身份字段和来源证据'})).resourceId as string);
 const input={format:'JSON',selectedIds:{people:[personId],works:[],projects:[]},fields,usePermissionRefs:refs};
 const jobId=ok(await f.owner.cmd('POST','/exports',input),202).resourceId as string,claim=await f.app.exports.claim();assert.ok(claim);await f.app.exports.process(claim);
 const download=ok(await f.owner.raw('POST',`/exports/${jobId}/download`,{}),200);
 assert.equal(download.payload.manifest.talent.schemaVersion,'once-talent-transfer-v10');
 assert.equal(download.payload.manifest.talent.identityEvidence.length,3);
 assert.equal(download.payload.manifest.talent.selectedFields.length,0);
 assert.equal(download.payload.manifest.sources.some((s:{id:string})=>s.id===excluded),false);
 assert.equal((await f.store.transaction(tx=>tx.find('talentProfiles',{personId}))).length,0);
 const actor=await f.store.transaction(tx=>f.app.identity.authenticate(tx,f.owner.jar.once_session!));
 return {personId,source,other,excluded,input,jobId,download,actor,current};
}
