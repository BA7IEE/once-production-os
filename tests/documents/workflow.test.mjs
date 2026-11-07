import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import sharp from 'sharp';
import {registeredTemp} from '../../scripts/registered-temp.mjs';
import {MemoryStore} from '../support/memory-store.ts';
import {supplierFixture} from '../support/supplier-profiles.ts';
import {SupplierDocumentWorker} from '../../apps/api/src/documents/worker.ts';
import {LocalMediaProvider} from '../../apps/api/src/media/local-provider.ts';
import {DOCUMENT_PROPOSAL_VERSION} from '../../packages/core/src/document-schema.ts';
import {digest} from '../../packages/core/src/json.ts';
import {inspectAiLedger} from '../../packages/core/src/ai-ledger-integrity.ts';

import {uploadedDocumentFixture as fixture} from '../support/supplier-document-fixture.mjs';

test('actual uploaded PDF becomes protected text and image candidates, then self-confirmed formal material',async()=>fixture(async f=>{
 await f.start();const worker=new SupplierDocumentWorker(f.app,f.provider);
 assert.equal((await f.a.client.raw('POST','/portal/profile-drafts/'+f.draft.resourceId+'/confirm',{expectedRevision:await f.rev(),accepted:true},f.headers())).status,409);
 assert.equal(await worker.cycle(new AbortController().signal),true);
 const job=(await f.jobs())[0];assert.equal(job.state,'READY');assert.equal(job.result.totalPages,2);assert.match(job.result.pages[0].text,/Lin He/);assert.equal(job.result.pages[0].imageCount,1);
 assert.deepEqual(await readdir(join(f.provider.root,'document-tasks')),[]);
 assert.equal((await f.b.client.raw('GET','/portal/profile-drafts/'+f.draft.resourceId+'/documents',undefined,f.headers(f.b))).status,404);
 f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+f.draft.resourceId+'/documents/images',{expectedRevision:await f.rev(),jobId:job.id,expectedJobRevision:job.revision,imageKeys:[job.imageCandidates[0].key]},f.headers()));
 await worker.cycle(new AbortController().signal);
 const imported=(await f.jobs())[0];assert.equal(imported.state,'READY',JSON.stringify(imported));
 const imageId=imported.importedImages[job.imageCandidates[0].key],image=await f.store.transaction(tx=>tx.get('assets',imageId));assert.equal(image.mime,'image/png');
 const pixels=await sharp(await f.provider.readOriginal(image)).raw().toBuffer();assert.ok(pixels.some((n,i)=>i%3===0&&n>200),'real extracted photograph must survive staging');
 f.ok(await f.a.client.raw('POST','/portal/submissions/'+f.draft.resourceId+'/works',{expectedRevision:await f.rev(),works:[{clientItemKey:'self_case',mode:'CREATE_EXTERNAL_WORK',targetWorkId:null,expectedWorkRevision:null,personRoleId:null,declaredRoleCode:'director',title:'本人品牌短片案例',description:'本人确认的作品经历',caseDate:null,datePrecision:'UNKNOWN',location:'',industryCode:null,workTypeCodes:[],brandDisplayName:'',creditNote:'导演',coverAssetId:imageId,items:[{assetId:imageId,referenceKind:'SUBMISSION_STAGED_ASSET'}]}]},f.headers()));
 f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+f.draft.resourceId+'/confirm',{expectedRevision:await f.rev(),accepted:true},f.headers()));
 const asset=await f.store.transaction(tx=>tx.get('assets',f.upload.resourceId));assert.equal(asset.usageState,'ADOPTED');
 f.ok(await f.owner.raw('GET','/assets/'+asset.id));
 const final=await f.read(f.draft.resourceId),cases=f.ok(await f.a.client.raw('GET','/portal/profiles/'+final.personId+'/works',undefined,f.headers()));
 assert.equal(cases.works.length,1);assert.equal(cases.works[0].coverAssetId,imageId);assert.equal(cases.works[0].credit.roleCode,'director');
 assert.equal((await f.store.transaction(tx=>f.app.media.talentRead(tx,f.actor,imageId))).id,imageId);
}));
test('actual page images reach multimodal boundary; selected AI fields prefill a draft and retain document provenance',async()=>fixture(async f=>{
 await f.approve();await f.start(true);let calls=0;
 const worker=new SupplierDocumentWorker(f.app,f.provider,async()=>({callDocument:async input=>{
  calls++;assert.equal(input.pages.length,2);assert.ok(input.pages[0].bytes.length>100);assert.match(input.manifest.pages[0].text,/Lin He/);
  return {output:{schemaVersion:DOCUMENT_PROPOSAL_VERSION,documentKind:'PERSON_PROFILE',subjectAssociation:'EXPLICIT_AUTHOR',fields:[{key:'person_name',field:'displayName',value:'Lin He',evidence:[{page:1,bbox:null,kind:'TEXT',quote:'Lin He'}]}],images:[{key:'image_a',page:1,bbox:[0,0,1,1],purpose:'PORTFOLIO'}],works:[{key:'case_a',title:'Synthetic campaign',description:'',roleCode:'director',brandDisplayName:'',dateText:'',imageKeys:['image_a'],evidence:[{page:1,bbox:null,kind:'TEXT',quote:'Lin He'}]}],unknowns:[]},usage:{inputTokens:50,outputTokens:10,cacheReadTokens:null,cacheWriteTokens:null,reasoningTokens:null},providerResponseId:'synthetic-response',outputStatus:'VALID_JSON'};
 }}));
 await worker.cycle(new AbortController().signal);await worker.cycle(new AbortController().signal);assert.equal(calls,1);
 const job=(await f.jobs())[0];assert.equal(job.state,'READY');assert.equal((await f.read(f.draft.resourceId)).profile.displayName,'林光');
 f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+f.draft.resourceId+'/documents/apply',{expectedRevision:await f.rev(),jobId:job.id,expectedJobRevision:job.revision,selectedKeys:['person_name']},f.headers()));
 assert.equal((await f.read(f.draft.resourceId)).profile.displayName,'Lin He');
 assert.equal((await f.store.transaction(tx=>tx.find('people',{displayName:'Lin He'}))).length,0);
 let applied=(await f.jobs())[0];
 f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+f.draft.resourceId+'/documents/images',{expectedRevision:await f.rev(),jobId:job.id,expectedJobRevision:applied.revision,imageKeys:['image_a']},f.headers()));
 await worker.cycle(new AbortController().signal);applied=(await f.jobs())[0];assert.equal(applied.state,'APPLIED');
 f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+f.draft.resourceId+'/documents/work',{expectedRevision:await f.rev(),jobId:job.id,expectedJobRevision:applied.revision,workKey:'case_a'},f.headers()));
 const workDraft=(await f.read(f.draft.resourceId)).items.find(i=>i.kind==='WORK').work;
 f.ok(await f.a.client.raw('POST','/portal/submissions/'+f.draft.resourceId+'/works',{expectedRevision:await f.rev(),works:[{...workDraft,title:'本人校正后的案例名称'}]},f.headers()));
 f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+f.draft.resourceId+'/confirm',{expectedRevision:await f.rev(),accepted:true},f.headers()));
 const rows=await f.store.transaction(async tx=>({runs:await tx.find('aiRuns'),items:await tx.find('talentSubmissionItems'),attrs:await tx.find('sourceAttributions'),integrity:await inspectAiLedger(tx,f.actor.workspaceId)}));
 assert.equal(rows.runs[0].actorId,null);assert.equal(rows.runs[0].talentAccountId,f.a.accountId);assert.equal(rows.runs[0].state,'UNKNOWN','usage tokens must not be invented into a paid invoice');
 assert.equal(rows.integrity.relationFailures,0);assert.ok(!JSON.stringify(rows.items).includes('Lin He'));
 const attribution=JSON.parse(rows.attrs[0].materialDescription);assert.equal(attribution.documents[0].assetId,f.upload.resourceId);assert.equal(attribution.documents[0].selectedFields[0].evidence[0].page,1);
 assert.equal(rows.items.find(i=>i.kind==='WORK').baseline.originDocument.assetId,f.upload.resourceId);
 const cases=await f.store.transaction(tx=>tx.find('works'));assert.equal(cases[0].title,'本人校正后的案例名称');assert.ok(cases[0].coverEntryId);
}));
test('AI request loss is not automatically retried and temp material is removed',async()=>fixture(async f=>{
 await f.approve();await f.start(true);let calls=0;
 const worker=new SupplierDocumentWorker(f.app,f.provider,async()=>({callDocument:async()=>{calls++;throw new Error('synthetic network loss');}}));
 await worker.cycle(new AbortController().signal);await worker.cycle(new AbortController().signal);assert.equal(calls,1);
 const job=(await f.jobs())[0];assert.equal(job.state,'REJECTED');assert.equal(job.errorCode,'AI_OUTCOME_UNKNOWN');
 assert.deepEqual(await readdir(join(f.provider.root,'document-tasks')),[]);
}));
test('revoking consent before dispatch blocks extraction and prevents a model request',async()=>fixture(async f=>{
 await f.approve();await f.start(true);let calls=0;
 const draft=await f.read(f.draft.resourceId);
 f.ok(await f.a.client.raw('POST','/portal/consents/'+draft.consent.id+'/revoke',{expectedRevision:draft.consent.revision},f.headers()));
 const worker=new SupplierDocumentWorker(f.app,f.provider,async()=>({callDocument:async()=>{calls++;throw new Error('must not send');}}));
 await worker.cycle(new AbortController().signal);assert.equal(calls,0);
 assert.equal((await f.jobs())[0].state,'REJECTED');assert.equal((await f.store.transaction(tx=>tx.find('aiRuns'))).length,0);
}));
test('AI prefill refuses a field edited after extraction started',async()=>fixture(async f=>{
 await f.approve();await f.start(true);
 const worker=new SupplierDocumentWorker(f.app,f.provider,async()=>({callDocument:async()=>({output:{schemaVersion:DOCUMENT_PROPOSAL_VERSION,documentKind:'PERSON_PROFILE',subjectAssociation:'EXPLICIT_AUTHOR',fields:[{key:'name',field:'displayName',value:'Lin He',evidence:[{page:1,bbox:null,kind:'TEXT',quote:'Lin He'}]}],images:[],works:[],unknowns:[]},usage:{inputTokens:50,outputTokens:10,cacheReadTokens:null,cacheWriteTokens:null,reasoningTokens:null},providerResponseId:'synthetic-conflict',outputStatus:'VALID_JSON'})}));
 const draft=await f.read(f.draft.resourceId);
 f.ok(await f.a.client.raw('PATCH','/portal/profile-drafts/'+draft.id,{expectedRevision:draft.revision,profile:{...draft.profile,displayName:'本人已修改名字'}},f.headers()));
 await worker.cycle(new AbortController().signal);const job=(await f.jobs())[0];assert.equal(job.state,'READY');
 const rejected=await f.a.client.raw('POST','/portal/profile-drafts/'+draft.id+'/documents/apply',{expectedRevision:await f.rev(),jobId:job.id,expectedJobRevision:job.revision,selectedKeys:['name']},f.headers());
 assert.equal(rejected.status,409);assert.equal(rejected.body.error.code,'DOCUMENT_FIELD_CONFLICT');assert.equal((await f.read(draft.id)).profile.displayName,'本人已修改名字');
}));
