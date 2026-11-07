import assert from 'node:assert/strict';
import {SupplierDocumentWorker} from '../../apps/api/src/documents/worker.ts';
import {DOCUMENT_PROPOSAL_VERSION} from '../../packages/core/src/document-schema.ts';
import {inspectAiLedger} from '../../packages/core/src/ai-ledger-integrity.ts';

export function modelResponse(input){
 const page=input.manifest.pages[0].page;
 return {output:{schemaVersion:DOCUMENT_PROPOSAL_VERSION,documentKind:'PERSON_PROFILE',subjectAssociation:'EXPLICIT_AUTHOR',fields:[{key:'name',field:'displayName',value:'Lin He',evidence:[{page,bbox:null,kind:'TEXT',quote:'Lin He'}]}],images:[],works:[],unknowns:[]},
  usage:{inputTokens:50,outputTokens:10,cacheReadTokens:null,cacheWriteTokens:null,reasoningTokens:null},providerResponseId:'synthetic-page-'+page,outputStatus:'VALID_JSON'};
}

/** Shared real-file scenario, executed with MemoryStore and real PostgreSQL. */
export async function verifyBatchRecovery(f){
 await f.approve();await f.startWhole(true);
 const calls=[];let failOnce=true;
 const createWorker=()=>new SupplierDocumentWorker(f.app,f.provider,async()=>({callDocument:async input=>{
  const pages=input.pages.map(p=>p.page);calls.push(pages);assert.ok(pages.length<=4);assert.ok(input.pages.every(p=>p.bytes.length>100));
  if(pages[0]===5&&failOnce){failOnce=false;throw new Error('synthetic response loss');}
  return modelResponse(input);
 }}));
 let worker=createWorker();assert.equal(await worker.cycle(new AbortController().signal),true);
 let view=await f.list();assert.equal(view.batches[0].totalPages,10);assert.deepEqual(view.items.map(j=>j.pages).sort((a,b)=>a[0]-b[0]),[[1,2,3,4],[5,6,7,8],[9,10]]);
 const batchId=view.batches[0].id;
 assert.equal((await f.b.client.raw('POST','/portal/profile-drafts/'+f.draft.resourceId+'/documents/batch',{expectedRevision:await f.rev(),batchId,expectedBatchRevision:view.batches[0].revision,action:'CANCEL',aiRetryAccepted:false},f.headers(f.b))).status,404);
 await worker.cycle(new AbortController().signal);
 worker=createWorker(); // No in-memory batch cursor is needed after a process restart.
 await worker.cycle(new AbortController().signal);
 view=await f.list();assert.equal(view.batches[0].state,'BATCH_PAUSED');assert.equal(view.batches[0].retryMayCharge,true);assert.equal(view.batches[0].completedChunks,1);
 assert.equal(await worker.cycle(new AbortController().signal),false);assert.deepEqual(calls,[[1,2,3,4],[5,6,7,8]]);
 const denied=await f.control('RESUME');assert.equal(denied.status,409);assert.equal(denied.body.error.code,'DOCUMENT_AI_RETRY_CONFIRM_REQUIRED');
 assert.equal((await f.a.client.raw('POST','/portal/profile-drafts/'+f.draft.resourceId+'/confirm',{expectedRevision:await f.rev(),accepted:true},f.headers())).status,409);
 f.ok(await f.control('RESUME',{aiRetryAccepted:true}));
 await worker.cycle(new AbortController().signal);await createWorker().cycle(new AbortController().signal);
 view=await f.list();assert.equal(view.batches[0].state,'READY');assert.deepEqual(view.batches[0].completedPages,Array.from({length:10},(_,i)=>i+1));assert.equal(view.batches[0].completedChunks,3);
 assert.deepEqual(calls,[[1,2,3,4],[5,6,7,8],[5,6,7,8],[9,10]],'only explicitly approved failed pages are sent again');
 assert.equal(view.items.filter(j=>j.supersededBy).length,1,'retain the failed attempt separately');
 for(const job of view.items.filter(j=>!j.supersededBy)){
  f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+f.draft.resourceId+'/documents/apply',{expectedRevision:await f.rev(),jobId:job.id,expectedJobRevision:job.revision,selectedKeys:['name']},f.headers()));
 }
 assert.equal((await f.read(f.draft.resourceId)).profile.displayName,'Lin He');
 const rows=await f.store.transaction(async tx=>({runs:await tx.find('aiRuns'),attempts:await tx.find('aiAttempts'),integrity:await inspectAiLedger(tx,f.actor.workspaceId)}));
 assert.equal(rows.runs.length,4);assert.equal(rows.attempts.length,4);assert.equal(rows.integrity.relationFailures,0);
 assert.equal(new Set(rows.attempts.map(a=>a.runId)).size,4);
 f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+f.draft.resourceId+'/confirm',{expectedRevision:await f.rev(),accepted:true},f.headers()));
 const sources=await f.store.transaction(tx=>tx.find('sourceAttributions',{talentAccountId:f.a.accountId}));
 const materials=JSON.parse(sources[0].materialDescription);
 assert.deepEqual(materials.documents.flatMap(d=>d.selectedFields.flatMap(f=>f.evidence.map(e=>e.page))).sort((a,b)=>a-b),[1,5,9]);
 assert.equal(await worker.cycle(new AbortController().signal),false);
}
