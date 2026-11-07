import assert from 'node:assert/strict';
import {SupplierDocumentWorker} from '../../apps/api/src/documents/worker.ts';
import {DOCUMENT_PROPOSAL_VERSION} from '../../packages/core/src/document-schema.ts';

/** Controlled extraction suggestions; actual PDF parsing, crops, media and commands. */
export function workModelResponse(input){
 const works=input.manifest.pages.map(p=>({key:'case_'+p.page,title:'合成项目 · 第 '+p.page+' 页',description:'本页合成项目说明',roleCode:'director',brandDisplayName:'合成品牌',dateText:'2026',imageKeys:p.images.slice(0,1).map(i=>i.key),evidence:[{page:p.page,bbox:null,kind:'TEXT',quote:p.text.includes('Lin He')?'Lin He':p.text.trim().slice(0,120)}]}));
 if(works[0]?.key==='case_1')works.push({...works[0],key:'detail_1',title:'同一项目的另一段说明'},{...works[0],key:'photo_1',roleCode:'photographer'},{...works[0],key:'unknown_1',roleCode:null});
 return {output:{schemaVersion:DOCUMENT_PROPOSAL_VERSION,documentKind:'PERSON_PROFILE',subjectAssociation:'EXPLICIT_AUTHOR',fields:[],images:[],works,unknowns:[]},usage:{inputTokens:50,outputTokens:10,cacheReadTokens:null,cacheWriteTokens:null,reasoningTokens:null},providerResponseId:'synthetic-work-'+input.manifest.pages[0].page,outputStatus:'VALID_JSON'};
}
export async function prepareWorkCandidates(f){
 await f.approve();await f.startWhole(true);let calls=0;
 const worker=new SupplierDocumentWorker(f.app,f.provider,async()=>({callDocument:async input=>{calls++;return workModelResponse(input);}}));
 for(let i=0;i<4;i++)assert.equal(await worker.cycle(new AbortController().signal),true);
 assert.equal((await f.list()).batches[0].state,'READY');assert.equal(calls,3);
 const importImages=async job=>{f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+f.draft.resourceId+'/documents/images',{expectedRevision:await f.rev(),jobId:job.id,expectedJobRevision:job.revision,imageKeys:job.imageCandidates.map(i=>i.key)},f.headers()));await worker.cycle(new AbortController().signal);};
 for(const job of await f.jobs())await importImages(job);
 return {worker,importImages,calls:()=>calls};
}
export const workRef=(job,key)=>({jobId:job.id,expectedJobRevision:job.revision,workKey:key});

/** Same transaction/provenance assertions on MemoryStore and real PostgreSQL. */
export async function verifyWorkGrouping(f){
 const {worker,importImages,calls}=await prepareWorkCandidates(f),sid=f.draft.resourceId,path='/portal/profile-drafts/'+sid+'/documents/work-group';
 const jobs=(await f.jobs()).sort((a,b)=>a.pages[0]-b.pages[0]),first=workRef(jobs[0],'case_1'),second=workRef(jobs[0],'case_2'),fifth=workRef(jobs[1],'case_5');
 const group=async(candidates,targetClientItemKey=null,extra={})=>f.a.client.raw('POST',path,{expectedRevision:await f.rev(),targetClientItemKey,candidates,...extra},f.headers());
 const before=await f.rev();
 for(const [refs,code] of [
  [[first,first],'DOCUMENT_WORK_DUPLICATE'],[[first,workRef(jobs[0],'photo_1')],'DOCUMENT_WORK_ROLE_CONFLICT'],
  [[first,workRef(jobs[0],'unknown_1')],'WORK_ROLE_REQUIRED'],[[first,workRef(jobs[1],'missing')],'DOCUMENT_WORK_UNAVAILABLE'],
  [[first,{...fifth,expectedJobRevision:fifth.expectedJobRevision-1}],'REVISION_CONFLICT']
 ]){const rejected=await group(refs);assert.ok([409,422].includes(rejected.status),JSON.stringify(rejected.body));assert.equal(rejected.body.error.code,code);assert.equal(await f.rev(),before);}
 assert.equal((await f.b.client.raw('POST',path,{expectedRevision:before,targetClientItemKey:null,candidates:[first]},f.headers(f.b))).status,404);
 assert.equal((await f.list()).workDrafts.length,0,'invalid group must not leave any partial case');
 const headers=f.headers(),body={expectedRevision:before,targetClientItemKey:null,candidates:[first,second,fifth]};
 const created=f.ok(await f.a.client.raw('POST',path,body,headers)),replayed=f.ok(await f.a.client.raw('POST',path,body,headers));assert.equal(created.revision,replayed.revision);assert.equal(replayed.replayed,true);
 let work=(await f.read(sid)).items.find(i=>i.kind==='WORK').work;
 assert.equal(work.items.length,3);assert.equal(work.coverAssetId,work.items[0].assetId);
 const key=work.clientItemKey,chosenCover=work.items[2].assetId;
 f.ok(await f.a.client.raw('POST','/portal/submissions/'+sid+'/works',{expectedRevision:await f.rev(),works:[{...work,title:'本人整理的完整案例',description:'本人改写的简介',brandDisplayName:'本人纠正的品牌',caseDate:'2025',datePrecision:'YEAR',coverAssetId:chosenCover,items:[...work.items].reverse()}]},f.headers()));
 // Reusing an already grouped candidate is refused even after a human edit.
 assert.equal((await group([fifth])).body.error.code,'DOCUMENT_WORK_ALREADY_ADDED');
 const singleDuplicate=await f.a.client.raw('POST','/portal/profile-drafts/'+sid+'/documents/work',{expectedRevision:await f.rev(),...first},f.headers());assert.equal(singleDuplicate.body.error.code,'DOCUMENT_WORK_ALREADY_ADDED');
 f.ok(await group([workRef(jobs[0],'detail_1')],key));
 work=(await f.read(sid)).items.find(i=>i.kind==='WORK').work;assert.equal(work.items.length,3,'same imported asset is included once');
 // Another actual PDF in the same owned draft can add evidence and an image.
 const extra=await f.uploadDocument('portfolio.pdf');
 f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+sid+'/documents',{expectedRevision:await f.rev(),assetId:extra.resourceId,pages:[1,2],useAi:true,aiAccepted:true},f.headers()));
 await worker.cycle(new AbortController().signal);
 let extraJob=(await f.jobs()).find(j=>j.assetId===extra.resourceId);await importImages(extraJob);extraJob=(await f.jobs()).find(j=>j.assetId===extra.resourceId);
 f.ok(await group([workRef(extraJob,'case_1')],key));
 work=(await f.read(sid)).items.find(i=>i.kind==='WORK').work;assert.equal(work.title,'本人整理的完整案例');assert.equal(work.description,'本人改写的简介');assert.equal(work.brandDisplayName,'本人纠正的品牌');assert.equal(work.caseDate,'2025');assert.equal(work.datePrecision,'YEAR');assert.equal(work.coverAssetId,chosenCover);assert.equal(work.items[0].assetId,chosenCover);assert.equal(work.items.length,4);
 const view=await f.list();assert.equal(view.workDrafts.length,1);assert.equal(view.workDrafts[0].imageCount,4);assert.equal(view.items.find(j=>j.id===jobs[1].id).addedWorks.case_5,key);
 // A later normal save preserves every document origin without accepting client-supplied provenance.
 f.ok(await f.a.client.raw('POST','/portal/submissions/'+sid+'/works',{expectedRevision:await f.rev(),works:[{...work,title:'最终案例'}]},f.headers()));
 const item=(await f.store.transaction(tx=>tx.find('talentSubmissionItems',{submissionId:sid,kind:'WORK'})))[0];
 assert.equal(item.baseline.originDocuments.length,5);assert.deepEqual(item.baseline.originDocuments.map(o=>o.evidence[0].page),[1,2,5,1,1]);assert.equal(new Set(item.baseline.originDocuments.map(o=>o.assetId)).size,2);
 f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+sid+'/confirm',{expectedRevision:await f.rev(),accepted:true},f.headers()));
 const rows=await f.store.transaction(async tx=>({works:await tx.find('works'),credits:await tx.find('workCredits'),assets:await tx.find('workAssets'),attrs:await tx.find('sourceAttributions'),accounts:await tx.find('talentAccounts')}));
 assert.equal(rows.works.length,1);assert.equal(rows.works[0].title,'最终案例');assert.equal(rows.assets.length,4);assert.equal(rows.credits.length,1);assert.equal(rows.credits[0].roleCode,'director');
 const attribution=JSON.parse(rows.attrs.find(a=>a.submissionId===sid).materialDescription);
 assert.deepEqual(attribution.derivedWorks[0].originDocuments,item.baseline.originDocuments);assert.equal(calls(),4,'grouping and edits never call the model again');
 return {f,origins:item.baseline.originDocuments};
}
