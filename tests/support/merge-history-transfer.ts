import assert from 'node:assert/strict';
import type {Application} from '../../packages/core/src/api.ts';
import type {Store} from '../../packages/core/src/store.ts';
import {type FakeClock,type Client,sourceInput} from './fixtures.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
import {mergeInput,mergePreview} from './talent-v2-merge.ts';
import {SOURCE_FIELDS} from './talent-transfer.ts';
export async function mergeHistoryTransfer(f:{app:Application;store:Store;clock:FakeClock;owner:Client}) {
 const schemaVersion='once-talent-v2.0.0',ids:string[]=[],sources:string[]=[],measurements:string[]=[];
 for(const label of ['当前','历史']) {
  const sourceId=ok(await f.owner.cmd('POST','/sources',{...sourceInput(),title:label+'合并来源'})).resourceId as string;sources.push(sourceId);
  const personId=ok(await f.owner.cmd('POST','/td2/people',{schemaVersion,originSourceId:sourceId,sourceRevision:1,displayName:label+'合成人物',createTalent:true})).resourceId as string;ids.push(personId);
  const person=()=>f.store.transaction(async tx=>(await tx.get('people',personId))!);
  for(const [slug,values] of [['roles',{roleCode:'model'}],['casting',{hairColorCode:'BROWN'}],['measurements',{measuredOn:'2026-09-22',datePrecision:'EXACT_DAY',heightCm:175}]] as const){const id=ok(await f.owner.cmd('POST',`/td2/people/${personId}/${slug}`,{schemaVersion,expectedPersonRevision:(await person()).revision,sourceId,sourceRevision:1,values})).resourceId as string;if(slug==='measurements'){measurements.push(id);ok(await f.owner.cmd('POST',`/td2/measurements/${id}/confirm`,{schemaVersion,expectedRevision:1,expectedPersonRevision:(await person()).revision,sourceRevision:1}),200);}}
 }
 const [personId,oldPersonId]=ids as [string,string],preview=await mergePreview(f.store,f.owner,personId,oldPersonId);
 assert.equal(preview.complete,true,JSON.stringify(preview.blockers));
 const mergeId=ok(await f.owner.cmd('POST','/people/merge',{...mergeInput(preview),professionalConflicts:preview.professional.conflicts.map((c:any)=>({table:c.table,canonicalId:c.canonicalId,duplicateId:c.duplicateId,choice:c.choices[0]}))}),200).resourceId as string;
 const fields=['person.displayName','person.status','person.td2.talentProfiles','person.td2.personRoles','person.td2.castingProfiles','person.td2.measurementSets','person.td2.fieldEvidence','person.td2.mergeHistory',...SOURCE_FIELDS],refs=[];
 for(const [kind,id,sourceId,grantFields] of [['PERSON',personId,sources[0],fields.filter(f=>f.startsWith('person.'))],...sources.map(s=>['SOURCE',s,s,fields.filter(f=>f!=='person.displayName'&&f!=='person.status')])] as const)refs.push(ok(await f.owner.cmd('POST','/use-permissions',{subjectKind:kind,subjectId:id,sourceId,fields:grantFields,validUntil:'2026-10-01T00:00:00.000Z',evidenceNote:'合成：明确批准旧身份、保留档案、字段证据及原合并决定'})).resourceId as string);
 const input={format:'JSON',selectedIds:{people:[personId],works:[],projects:[]},fields,usePermissionRefs:refs};const jobId=ok(await f.owner.cmd('POST','/exports',input),202).resourceId as string,claim=await f.app.exports.claim();assert.ok(claim);await f.app.exports.process(claim);
 const download=ok(await f.owner.raw('POST',`/exports/${jobId}/download`,{}),200);assert.equal(download.payload.manifest.talent.schemaVersion,'once-talent-transfer-v11');
 const actor=await f.store.transaction(tx=>f.app.identity.authenticate(tx,f.owner.jar.once_session!));
 return {personId,oldPersonId,sources,measurements,mergeId,input,jobId,download,actor};
}
