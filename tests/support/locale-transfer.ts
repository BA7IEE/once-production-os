import {localeMergeInput} from './locale-merge.ts';
import assert from 'node:assert/strict';
import {sourceInput} from './fixtures.ts';
import type {FactErasureContext} from './talent-source-fact-erasure.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
import {SOURCE_FIELDS} from './talent-transfer.ts';
export async function localeTransfer(f:FactErasureContext,withMerge=false){
 const sourceId=ok(await f.owner.cmd('POST','/sources',{...sourceInput(),title:'合成语言迁移主体来源'})).resourceId as string;
 const basisId=ok(await f.owner.cmd('POST','/sources',{...sourceInput(),title:'合成语言迁移独立依据'})).resourceId as string;
 const people=[ok(await f.owner.cmd('POST','/td2/people',{schemaVersion:'once-talent-v2.0.0',originSourceId:sourceId,sourceRevision:1,displayName:'合成语言迁移普通人物'})).resourceId as string];
 const works=[ok(await f.owner.cmd('POST','/works',{sourceId,title:'合成语言迁移作品'})).resourceId as string],projects=[ok(await f.owner.cmd('POST','/projects',{sourceId,title:'合成语言迁移项目'})).resourceId as string];
 const localeIds:string[]=[],usePermissionRefs:string[]=[],personFields=['person.displayName','person.status','person.localeTexts'],workFields=['work.title','work.origin','work.status','work.localeTexts'],projectFields=['project.title','project.status','project.localeTexts'];
 const grant=async(subjectKind:string,subjectId:string,originId:string,fields:string[])=>ok(await f.owner.cmd('POST','/use-permissions',{subjectKind,subjectId,sourceId:originId,fields,validUntil:'2026-10-01T00:00:00.000Z',evidenceNote:'合成逐项批准内部文本和依据的迁移'})).resourceId as string;
 for(const [subjectKind,subjectId,fields]of [['PERSON',people[0]!,personFields],['WORK',works[0]!,workFields],['PROJECT',projects[0]!,projectFields]] as const){
  let duplicateId='',duplicateTextId='';
  if(withMerge&&subjectKind==='PERSON'){
   duplicateId=ok(await f.owner.cmd('POST','/td2/people',{schemaVersion:'once-talent-v2.0.0',originSourceId:basisId,sourceRevision:1,displayName:'合成迁移前重复人物'})).resourceId as string;
   duplicateTextId=ok(await f.owner.cmd('POST','/locale-texts',{subjectKind:'PERSON',subjectId:duplicateId,locale:'en',text:'Chosen merged English.',expectedSubjectRevision:1,sourceRefs:[{id:sourceId,expectedRevision:1}],confirmCurrentBasis:true})).resourceId as string;
   f.clock.advance(1000);
  }
  localeIds.push(ok(await f.owner.cmd('POST','/locale-texts',{subjectKind,subjectId,locale:'en',text:'Synthetic '+subjectKind+' locale transfer.',expectedSubjectRevision:1,sourceRefs:[{id:basisId,expectedRevision:1}],confirmCurrentBasis:true})).resourceId as string);
  if(withMerge&&subjectKind==='PERSON'){
   const preview=ok(await f.owner.raw('POST','/people/merge-preview',{canonicalId:subjectId,duplicateId,expectedCanonicalRevision:1,expectedDuplicateRevision:1}),200);
   ok(await f.owner.cmd('POST','/people/merge',localeMergeInput(preview)),200);
   const merged=ok(await f.owner.raw('GET','/locale-texts/'+localeIds[0]),200);assert.equal(merged.history.length,2);assert.equal(merged.text,'Chosen merged English.');assert.equal((await f.store.transaction(tx=>tx.get('localeTexts',duplicateTextId)))!.state,'ERASED');
  }
  usePermissionRefs.push(await grant(subjectKind,subjectId,sourceId,fields));
 }
 const sourceFields=[...SOURCE_FIELDS,'person.localeTexts','work.localeTexts','project.localeTexts'];usePermissionRefs.push(await grant('SOURCE',sourceId,sourceId,sourceFields));usePermissionRefs.push(await grant('SOURCE',basisId,basisId,sourceFields));
 const input={format:'JSON',selectedIds:{people,works,projects},fields:[...personFields,...workFields,...projectFields,...SOURCE_FIELDS],usePermissionRefs};
 const jobId=ok(await f.owner.cmd('POST','/exports',input),202).resourceId as string,claim=await f.app.exports.claim();assert.ok(claim);assert.equal(claim.id,jobId);await f.app.exports.process(claim);
 const download=ok(await f.owner.raw('POST','/exports/'+jobId+'/download',{}),200);assert.equal(download.payload.schemaVersion,'once-export-v3-locale');assert.equal(download.payload.manifest.locales.texts.length,3);
 return {input,download,jobId,localeIds,sourceId,basisId,people,works,projects};
}
export async function eraseImportedLocaleSource(f:FactErasureContext,sourceId:string){
 const source=(await f.store.transaction(tx=>tx.get('sources',sourceId)))!,texts=await f.store.transaction(tx=>tx.find('localeTexts',{workspaceId:source.workspaceId}));assert.equal(texts.length,3);assert.ok(texts.every(t=>!!t.importedBasis));
 const preview=ok(await f.owner.raw('POST','/deletion-requests/preview',{targetKind:'SOURCE',targetId:sourceId,expectedRevision:source.revision}),200);assert.equal(preview.complete,true,JSON.stringify(preview.unresolved));
 const requestId=ok(await f.owner.cmd('POST','/deletion-requests',{targetKind:'SOURCE',targetId:sourceId,expectedRevision:source.revision,previewDigest:preview.previewDigest,reason:'合成清除已导入内部文本及原始迁移依据'})).resourceId as string;
 const request=()=>f.store.transaction(async tx=>(await tx.get('deletionRequests',requestId))!);
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/block`,{expectedRevision:1,previewDigest:preview.previewDigest,acknowledgeBlock:true}),200);
 const items=await f.store.transaction(tx=>tx.find('deletionItems',{requestId}));assert.equal(items.filter(i=>i.resourceKind==='localeText').length,3);
 for(const item of items)if(item.decision==='PENDING')ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/decisions`,{expectedRevision:(await request()).revision,entryId:item.id,decision:'APPLY_PROPOSED',decisionReason:'合成明确删除正文和原复核及迁移依据'}),200);
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/plan/freeze`,{expectedRevision:(await request()).revision,acknowledgePlan:true}),200);ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/cleaning/start`,{expectedRevision:(await request()).revision,planDigest:(await request()).planDigest,acknowledgeIrreversible:true}),200);
 const claim=await f.app.deletionCleanup.claim();assert.ok(claim);await f.app.deletionCleanup.process(claim);const final=await f.app.deletionFinalization.claim();assert.ok(final);await f.app.deletionFinalization.finish(final);assert.equal((await request()).state,'COMPLETED');
 for(const text of texts){const row=(await f.store.transaction(tx=>tx.get('localeTexts',text.id)))!;assert.equal(row.state,'ERASED');assert.equal(row.text,'');assert.equal(row.importedBasis,null);assert.equal(row.mergeHistory,null);assert.equal(row.originalReviewMembershipId,null);assert.equal(row.originalReviewWorkspaceId,null);assert.equal(row.originalReviewedAt,null);assert.equal(row.originalReviewTextDigest,null);assert.equal((await f.store.transaction(tx=>tx.find('localeDependencies',{localeTextId:row.id}))).length,0);}
}
