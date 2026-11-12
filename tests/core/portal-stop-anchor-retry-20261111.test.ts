import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {SafetyJournalWriter,readSafetyJournal} from '../../apps/api/src/recovery/safety-journal.ts';
import {analyzeSafetyDeltas} from '../../apps/api/src/recovery/delta-resolution.ts';
import * as delta from '../../apps/api/src/recovery/delta-resolution.ts';
import type {SafetyJournalState} from '../../apps/api/src/recovery/safety-journal.ts';
import type {SafetyIntent} from '../../packages/core/src/safety-intent.ts';
import {MemoryStore} from '../support/memory-store.ts';
import {stagingFixture} from '../support/media-staging.ts';
import {result} from '../support/fixtures.ts';

/** Real file journal with synthetic API and MemoryStore. No physical PG backup
 * is claimed; a captured in-memory receipt set models the old snapshot. */
test('a failed pre-anchor stop retried after anchor must leave a new blocking journal delta',async t=>{
 const {ResourceRun}=await import('../../scripts/resource-run.mjs');
 const scope=new ResourceRun(),id=randomUUID(),root=join(scope.directory,'temp-'+id);
 let passed=false;
 try{
  writeFileSync(join(scope.directory,'temporary-'+id+'.json'),JSON.stringify({path:root,kind:'NESTED_TEMP',status:'REGISTERED'}),{mode:0o600});
  mkdirSync(root,{mode:0o700});
  const path=join(root,'safety-journal.jsonl'),writer=await SafetyJournalWriter.open(path);
  const store=new MemoryStore(),f=await stagingFixture(store,false);f.app.config.portalCommandStopEnabled=true;
  f.app.safetyIntent=writer;f.app.portal.sink=writer;
  const headers=(key:string)=>({'x-once-talent-account':f.a.accountId,'idempotency-key':key});
  const stop=(key:string)=>f.a.client.raw('POST',`/portal/commands/${key}/stop`,{},headers(key));
  for(let n=0;n<10;n++)assert.equal((await stop(randomUUID())).status,200);
  const key=randomUUID(),denied=await stop(key);assert.equal(denied.status,429);assert.equal(result(denied).error.code,'RATE_LIMITED');
  const before=await readSafetyJournal(path),anchor=before.snapshot.sequence;
  assert.equal(before.entries.at(-1)?.action,'intent.portal.command.stop');
  assert.equal(store.rows('receipts').filter(r=>r.operation==='portal.command.stop'&&r.commandKey===key).length,0);
  assert.equal(store.rows('uploads').length,0,'the synthetic anchor does not hide a runnable upload');
  const snapshotReceiptCount=store.rows('receipts').filter(r=>r.operation==='portal.command.stop'&&r.commandKey===key).length;
  f.clock.advance(3600001);
  f.app.portal.sink={writeAhead:i=>writer.writeAhead(i),async committed(){throw new Error('synthetic post-commit completion failure');},aborted:(i,p)=>writer.aborted(i,p)};
  const retry=await stop(key);assert.equal(retry.status,500);
  const receiptCount=store.rows('receipts').filter(r=>r.operation==='portal.command.stop'&&r.commandKey===key).length;assert.equal(receiptCount,1);
  const status=await f.a.client.raw('GET',`/portal/commands/${key}/stop`,undefined,headers(key));assert.equal(status.status,200);assert.equal(result(status).state,'STOPPED');
  const after=await readSafetyJournal(path),report=analyzeSafetyDeltas(after,anchor);
  t.diagnostic(JSON.stringify({synthetic:true,initialStatus:denied.status,retryStatus:retry.status,
   stopStatus:result(status).state,snapshotReceiptCount,currentReceiptCount:receiptCount,
   anchorSequence:anchor,currentSequence:after.snapshot.sequence,postBackupEntries:report.postBackupEntries,unresolved:report.unresolved}));
  assert.ok(report.items.some(i=>i.operation==='portal.command.stop'&&i.resolution==='BLOCKER'),
   'the post-anchor DB commit lacks a completion marker; recovery must not report zero unresolved delta');
  passed=true;
 }finally{scope.record.outcome=passed?'PASS':'FAIL';const clean=await scope.cleanup();assert.equal(clean.status,'ZERO_RESIDUE');}
});

/** Guard the historical anchor separately from post-backup delta accounting. */
function unclosed(state:SafetyJournalState,anchor:number):number{
 const fn=(delta as unknown as {countUnclosedStopIntentsAtAnchor?:(state:SafetyJournalState,anchor:number)=>number}).countUnclosedStopIntentsAtAnchor;
 assert.equal(typeof fn,'function','the recovery anchor guard must be exported');return fn!(state,anchor);
}
async function journalCase(run:(writer:SafetyJournalWriter,path:string)=>Promise<void>){
 const {ResourceRun}=await import('../../scripts/resource-run.mjs'),scope=new ResourceRun(),id=randomUUID(),root=join(scope.directory,'temp-'+id);
 let passed=false;
 try{
  writeFileSync(join(scope.directory,'temporary-'+id+'.json'),JSON.stringify({path:root,kind:'NESTED_TEMP',status:'REGISTERED'}),{mode:0o600});
  mkdirSync(root,{mode:0o700});const path=join(root,'safety-journal.jsonl');await run(await SafetyJournalWriter.open(path),path);passed=true;
 }finally{scope.record.outcome=passed?'PASS':'FAIL';const clean=await scope.cleanup();assert.equal(clean.status,'ZERO_RESIDUE');}
}
function syntheticIntent(operation='portal.command.stop'):SafetyIntent{
 return {intentId:'intent:'+randomUUID(),workspaceId:randomUUID(),operation,requestId:randomUUID(),resourceId:randomUUID()};
}

test('pre-anchor unclosed stop is counted even with zero post-anchor events',async()=>{
 await journalCase(async(writer,path)=>{
  await writer.writeAhead(syntheticIntent());const anchor=writer.snapshot().sequence,state=await readSafetyJournal(path);
  const deltaReport=analyzeSafetyDeltas(state,anchor);assert.equal(deltaReport.postBackupEntries,0);assert.equal(deltaReport.unresolved,0);
  assert.equal(unclosed(state,anchor),1);
 });
});

test('pre-anchor unclosed stop remains counted when other post-anchor deltas are resolved',async()=>{
 await journalCase(async(writer,path)=>{
  await writer.writeAhead(syntheticIntent());const anchor=writer.snapshot().sequence,other=syntheticIntent('synthetic.other');
  // This synthetic other attempt truly has not started a DB transaction.
  await writer.writeAhead(other);await writer.aborted(other,'NOT_STARTED');
  const state=await readSafetyJournal(path),deltaReport=analyzeSafetyDeltas(state,anchor);
  assert.equal(deltaReport.postBackupEntries,2);assert.equal(deltaReport.unresolved,0);assert.equal(unclosed(state,anchor),1);
 });
});

test('a pre-anchor abort for a stop cannot prove that an old stable key was never retried',async()=>{
 await journalCase(async(writer,path)=>{
  const i=syntheticIntent();await writer.writeAhead(i);
  // This synthetic attempt has not started a transaction, but the legacy ID can be retried later.
  await writer.aborted(i,'NOT_STARTED');const anchor=writer.snapshot().sequence,state=await readSafetyJournal(path);
  assert.equal(analyzeSafetyDeltas(state,anchor).postBackupEntries,0);assert.equal(unclosed(state,anchor),1);
 });
});

test('a genuinely committed pre-anchor stop is closed, including a synthetic legacy requestId mismatch',async()=>{
 await journalCase(async(writer,path)=>{
  const store=new MemoryStore(),f=await stagingFixture(store,false);f.app.config.portalCommandStopEnabled=true;f.app.safetyIntent=writer;
  // Model a legacy stable ID: the intent's first attempt and the successful
  // retry can have different request IDs, while the operation/account still match.
  f.app.portal.sink={writeAhead:i=>writer.writeAhead(i),committed:(i,resourceId)=>writer.committed({...i,requestId:randomUUID()},resourceId),aborted:(i,p)=>writer.aborted(i,p)};
  const key=randomUUID(),response=await f.a.client.raw('POST',`/portal/commands/${key}/stop`,{}, {'x-once-talent-account':f.a.accountId,'idempotency-key':key});
  assert.equal(response.status,200);assert.equal(store.rows('receipts').filter(r=>r.operation==='portal.command.stop'&&r.commandKey===key).length,1);
  const anchor=writer.snapshot().sequence,state=await readSafetyJournal(path);assert.equal(unclosed(state,anchor),0);
 });
});

test('a stop committed after the anchor does not close the pre-anchor stop and is also a delta blocker',async()=>{
 await journalCase(async(writer,path)=>{
  const store=new MemoryStore(),f=await stagingFixture(store,false);f.app.config.portalCommandStopEnabled=true;f.app.safetyIntent=writer;f.app.portal.sink=writer;
  const key=randomUUID(),response=await f.a.client.raw('POST',`/portal/commands/${key}/stop`,{}, {'x-once-talent-account':f.a.accountId,'idempotency-key':key});assert.equal(response.status,200);
  const state=await readSafetyJournal(path),intent=state.entries.find(e=>e.action==='intent.portal.command.stop')!,commit=state.entries.find(e=>e.action==='commit.portal.command.stop')!;
  assert.ok(intent.seq<commit.seq);const anchor=intent.seq;
  assert.equal(unclosed(state,anchor),1);
  const report=analyzeSafetyDeltas(state,anchor);assert.ok(report.items.some(i=>i.operation==='portal.command.stop'&&i.resolution==='BLOCKER'&&i.reasonCode==='COMMITTED_REPLAY_REQUIRED'));
 });
});

test('each stop network attempt has its own intent while business receipt remains idempotent',async()=>{
 await journalCase(async(writer,path)=>{
  const store=new MemoryStore(),f=await stagingFixture(store,false);f.app.config.portalCommandStopEnabled=true;f.app.safetyIntent=writer;f.app.portal.sink=writer;
  const key=randomUUID(),headers={'x-once-talent-account':f.a.accountId,'idempotency-key':key};
  const first=await f.a.client.raw('POST',`/portal/commands/${key}/stop`,{},headers);assert.equal(first.status,200);const anchor=writer.snapshot().sequence;
  const second=await f.a.client.raw('POST',`/portal/commands/${key}/stop`,{},headers);assert.equal(second.status,200);assert.equal(result(second).replayed,true);assert.equal(result(first).operationId,result(second).operationId);
  const state=await readSafetyJournal(path),intents=state.entries.filter(e=>e.action==='intent.portal.command.stop'),commits=state.entries.filter(e=>e.action==='commit.portal.command.stop');
  assert.equal(intents.length,2);assert.equal(commits.length,2);assert.notEqual(intents[0]!.auditId,intents[1]!.auditId);assert.notEqual(intents[0]!.requestId,intents[1]!.requestId);
  assert.equal(store.rows('receipts').filter(r=>r.operation==='portal.command.stop'&&r.commandKey===key).length,1);
  const report=analyzeSafetyDeltas(state,anchor);assert.ok(report.items.some(i=>i.operation==='portal.command.stop'&&i.resolution==='BLOCKER'));
 });
});

for(const [label,mode] of [
 ['orphan commit','orphanCommit'],['orphan abort','orphanAbort'],
 ['different workspace','workspace'],['different resource','resource'],['different operation','operation'],
 ['commit before intent','order'],['both abort and commit','both']
] as const){
 test('anchor guard rejects '+label,async()=>{
  await journalCase(async(writer,path)=>{
   const i=syntheticIntent();
   if(mode==='orphanCommit')await writer.committed(i,i.resourceId);
   else if(mode==='orphanAbort')await writer.aborted(i,'NOT_STARTED');
   else if(mode==='order'){await writer.committed(i,i.resourceId);await writer.writeAhead(i);}
   else{
    await writer.writeAhead(i);
    if(mode==='both')await writer.aborted(i,'NOT_STARTED');
    // Every mismatch below is intentional synthetic journal input. No such
    // entry constitutes evidence that a real transaction did or did not run.
    await writer.committed(mode==='workspace'?{...i,workspaceId:randomUUID()}:mode==='operation'?{...i,operation:'portal.upload.cancel'}:i,mode==='resource'?randomUUID():i.resourceId);
   }
   const state=await readSafetyJournal(path),anchor=state.snapshot.sequence;
   assert.equal(unclosed(state,anchor),1);
   if(['workspace','operation','order','both'].includes(mode))assert.throws(()=>analyzeSafetyDeltas(state,anchor));
  });
 });
}
