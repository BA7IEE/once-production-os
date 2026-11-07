import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {uploadedDocumentFixture as fixture} from '../support/supplier-document-fixture.mjs';
import {verifyBatchRecovery,modelResponse} from '../support/supplier-document-batches.mjs';
import {SupplierDocumentWorker} from '../../apps/api/src/documents/worker.ts';
import {SupplierDocuments} from '../../packages/core/src/supplier-documents.ts';

const long={fileName:'long-portfolio.pdf'};
test('whole PDF persists exact page batches, resumes only an explicitly approved failure, and preserves source evidence',()=>fixture(verifyBatchRecovery,long));

test('whole native PDF survives worker restarts, suppresses duplicate submission and covers all ten pages',()=>fixture(async f=>{
 const key=randomUUID(),body={expectedRevision:await f.rev(),assetId:f.upload.resourceId,mode:'ALL',useAi:false,aiAccepted:false};
 const url='/portal/profile-drafts/'+f.draft.resourceId+'/documents';
 f.ok(await f.a.client.raw('POST',url,body,f.headers(f.a,key)));
 assert.equal(f.ok(await f.a.client.raw('POST',url,body,f.headers(f.a,key))).replayed,true);
 assert.equal((await f.list()).batches.length,1);
 assert.equal((await f.a.client.raw('POST',url,{...body,expectedRevision:await f.rev()},f.headers())).status,409);
 for(let i=0;i<4;i++)assert.equal(await new SupplierDocumentWorker(f.app,f.provider).cycle(new AbortController().signal),true);
 const view=await f.list();assert.equal(view.batches[0].state,'READY');assert.equal(view.batches[0].completedPages.length,10);assert.equal(view.items.length,3);
 assert.deepEqual(view.items.flatMap(j=>j.result.pages.map(p=>p.page)).sort((a,b)=>a-b),Array.from({length:10},(_,i)=>i+1));
 assert.equal((await f.store.transaction(tx=>tx.find('aiRuns'))).length,0);assert.deepEqual(await readdir(join(f.provider.root,'document-tasks')),[]);
},long));

test('cancelling a partially completed document keeps finished pages and permits confirmation without processing the rest',()=>fixture(async f=>{
 await f.startWhole();const worker=new SupplierDocumentWorker(f.app,f.provider);
 await worker.cycle(new AbortController().signal);await worker.cycle(new AbortController().signal);
 f.ok(await f.control('CANCEL'));
 const view=await f.list();assert.equal(view.batches[0].state,'REJECTED');assert.equal(view.batches[0].completedPages.length,4);
 assert.equal(await worker.cycle(new AbortController().signal),false);
 assert.equal(view.items.filter(j=>j.state==='READY').length,1);assert.equal(view.items.filter(j=>j.state==='REJECTED').length,2);
 f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+f.draft.resourceId+'/confirm',{expectedRevision:await f.rev(),accepted:true},f.headers()));
},long));

test('expired chunk lease pauses the batch; a stale worker cannot publish and continuation needs no AI acknowledgement before dispatch',()=>fixture(async f=>{
 await f.approve();await f.startWhole(true);
 const worker=new SupplierDocumentWorker(f.app,f.provider),documents=new SupplierDocuments(f.clock,f.app.config);
 await worker.cycle(new AbortController().signal);
 const claim=await f.store.transaction(tx=>documents.claim(tx));assert.ok(claim);
 assert.equal(await f.store.transaction(tx=>documents.claim(tx)),null,'one document slot per account');
 f.clock.advance(241000);assert.equal(await f.store.transaction(tx=>documents.claim(tx)),null);
 const view=await f.list();assert.equal(view.batches[0].state,'BATCH_PAUSED');assert.equal(view.batches[0].retryMayCharge,false);
 await assert.rejects(f.store.transaction(tx=>documents.current(tx,claim)),e=>e.code==='DOCUMENT_LEASE_LOST');
 f.ok(await f.control('RESUME'));assert.ok(await f.store.transaction(tx=>documents.claim(tx)));
},long));

test('cancellation after AI dispatch rejects late output and never schedules the remaining pages',()=>fixture(async f=>{
 await f.approve();await f.startWhole(true);let calls=0;
 const worker=new SupplierDocumentWorker(f.app,f.provider,async()=>({callDocument:async input=>{
  calls++;f.ok(await f.control('CANCEL'));return modelResponse(input);
 }}));
 await worker.cycle(new AbortController().signal);await worker.cycle(new AbortController().signal);
 const view=await f.list();assert.equal(view.batches[0].state,'REJECTED');assert.equal(view.items.some(j=>j.proposal!==null),false);
 assert.equal(await worker.cycle(new AbortController().signal),false);assert.equal(calls,1);
 const runs=await f.store.transaction(tx=>tx.find('aiRuns'));assert.equal(runs.length,1);assert.equal(runs[0].state,'UNKNOWN');
 assert.equal((await f.control('RESUME',{aiRetryAccepted:true})).status,409);
},long));

test('revoking consent between chunks stops all pending pages without another model call',()=>fixture(async f=>{
 await f.approve();await f.startWhole(true);let calls=0;
 const worker=new SupplierDocumentWorker(f.app,f.provider,async()=>({callDocument:async input=>{calls++;return modelResponse(input);}}));
 await worker.cycle(new AbortController().signal);await worker.cycle(new AbortController().signal);
 const draft=await f.read(f.draft.resourceId);
 f.ok(await f.a.client.raw('POST','/portal/consents/'+draft.consent.id+'/revoke',{expectedRevision:draft.consent.revision},f.headers()));
 assert.equal(await worker.cycle(new AbortController().signal),false);assert.equal(calls,1);
 const view=await f.list();assert.equal(view.batches[0].state,'REJECTED');assert.equal(view.items.filter(j=>j.state==='PENDING').length,0);
},long));

test('a document above the whole-file page limit fails discovery with no partial completion or model run',()=>fixture(async f=>{
 await f.approve();await f.startWhole(true);let calls=0;
 const worker=new SupplierDocumentWorker(f.app,f.provider,async()=>({callDocument:async()=>{calls++;throw new Error('must not send');}}));
 await worker.cycle(new AbortController().signal);
 const view=await f.list();assert.equal(view.batches[0].errorCode,'PAGE_LIMIT_EXCEEDED');assert.equal(view.batches[0].state,'REJECTED');assert.equal(view.items.length,0);assert.equal(calls,0);
 assert.deepEqual(await readdir(join(f.provider.root,'document-tasks')),[]);
},{fileName:'over-limit.pdf'}));
