import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadedDocumentFixture} from '../support/supplier-document-fixture.mjs';
import {verifyWorkGrouping,prepareWorkCandidates,workRef} from '../support/supplier-work-grouping.mjs';
import {exportMaintenance} from '../support/talent-maintenance.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import {fixture} from '../support/fixtures.ts';
import {randomUUID} from 'node:crypto';

test('cross-page, cross-batch and cross-file cases preserve edited facts, de-duplicated images, all origins and one-send receipts',async()=>uploadedDocumentFixture(async f=>{
 await verifyWorkGrouping(f);
 const payload=await exportMaintenance({...f,b:f.a}),target=await fixture(),rebuild=new JsonRebuild(target.clock);
 try{
  const actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
  await target.store.transaction(tx=>rebuild.apply(tx,actor,payload,{requestId:randomUUID(),ip:'test'}));
  const bases=await target.store.transaction(tx=>tx.find('sourceUseBases'));
  assert.equal(bases[0].importedBasis.confirmedByTalentId,f.a.accountId,'rebuild retains real self-confirmation basis');
  assert.equal((await target.store.transaction(tx=>tx.find('talentAccounts'))).length,0,'rebuild does not invent a supplier account');
 }finally{await target.store.close();}
},{fileName:'long-portfolio.pdf'}));

test('grouping refuses a removed image and a missing destination without partial writes, and respects consent withdrawal',async()=>uploadedDocumentFixture(async f=>{
 const {worker}=await prepareWorkCandidates(f),sid=f.draft.resourceId,jobs=await f.jobs(),job=jobs.find(j=>j.pages.includes(1)),refs=[workRef(job,'case_1')],path='/portal/profile-drafts/'+sid+'/documents/work-group';
 const rev=await f.rev();
 const missing=await f.a.client.raw('POST',path,{expectedRevision:rev,targetClientItemKey:'no-longer-present',candidates:refs},f.headers());assert.equal(missing.body.error.code,'DOCUMENT_WORK_TARGET_UNAVAILABLE');
 const assetId=job.importedImages[job.proposal.works[0].imageKeys[0]];
 await f.store.transaction(async tx=>{const a=await tx.get('assets',assetId);await tx.replace('assets',{...a,usageState:'PURGE_PENDING'});});
 const unavailable=await f.a.client.raw('POST',path,{expectedRevision:rev,targetClientItemKey:null,candidates:refs},f.headers());assert.equal(unavailable.body.error.code,'DOCUMENT_WORK_IMAGE_UNAVAILABLE');assert.equal(await f.rev(),rev);
 const draft=await f.read(sid);f.ok(await f.a.client.raw('POST','/portal/consents/'+draft.consent.id+'/revoke',{expectedRevision:draft.consent.revision},f.headers()));
 const withdrawn=await f.a.client.raw('POST',path,{expectedRevision:rev,targetClientItemKey:null,candidates:refs},f.headers());assert.notEqual(withdrawn.status,200);
 assert.equal((await f.store.transaction(tx=>tx.find('talentSubmissionItems',{submissionId:sid,kind:'WORK'}))).length,0);assert.equal(await worker.cycle(new AbortController().signal),false);
},{fileName:'long-portfolio.pdf'}));
