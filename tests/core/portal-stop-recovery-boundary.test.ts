import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {SafetyJournalWriter,readSafetyJournal} from '../../apps/api/src/recovery/safety-journal.ts';
import {analyzeSafetyDeltas} from '../../apps/api/src/recovery/delta-resolution.ts';
import {MemoryStore} from '../support/memory-store.ts';
import {stagingFixture} from '../support/media-staging.ts';
import {result} from '../support/fixtures.ts';

/** The HTTP/core calls use synthetic accounts and MemoryStore; the independent
 * file journal and its production delta analyzer are real. This is not a PG test. */
async function withJournal(run:(writer:SafetyJournalWriter,path:string)=>Promise<void>){
 const {ResourceRun}=await import('../../scripts/resource-run.mjs');
 const scope=new ResourceRun(),id=randomUUID(),root=join(scope.directory,'temp-'+id);
 let passed=false;
 try{
  writeFileSync(join(scope.directory,'temporary-'+id+'.json'),JSON.stringify({path:root,kind:'NESTED_TEMP',status:'REGISTERED'}),{mode:0o600});
  mkdirSync(root,{mode:0o700});
  const path=join(root,'safety-journal.jsonl');
  await run(await SafetyJournalWriter.open(path),path);
  passed=true;
 }finally{scope.record.outcome=passed?'PASS':'FAIL';const clean=await scope.cleanup();assert.equal(clean.status,'ZERO_RESIDUE');}
}
async function fixture(){
 const f=await stagingFixture(new MemoryStore(),false),upload=await f.create();
 f.app.config.portalCommandStopEnabled=true;
 const key=randomUUID(),id=upload.resourceId as string;
 const headers={'x-once-talent-account':f.a.accountId,'idempotency-key':key};
 const stop=()=>f.a.client.raw('POST',`/portal/commands/${key}/stop`,{},headers);
 const status=()=>f.a.client.raw('GET',`/portal/commands/${key}/stop`,undefined,headers);
 const before=(await f.store.transaction(tx=>tx.get('uploads',id)))!;
 const cancel=()=>f.a.client.raw('POST',`/portal/uploads/${id}/cancel`,{expectedRevision:before.revision},headers);
 return {...f,id,key,headers,before,stop,status,cancel};
}
function attach(f:Awaited<ReturnType<typeof fixture>>,writer:SafetyJournalWriter){f.app.safetyIntent=writer;f.app.portal.sink=writer;}
function assertResponse(r:{status:number;body:unknown},status:number,code?:string){
 assert.equal(r.status,status,JSON.stringify(r.body));
 if(code)assert.equal((r.body as {error?:{code?:string}}).error?.code,code);
}

test('a committed stop after a backup anchor remains a recovery blocker',async()=>{
 await withJournal(async(writer,path)=>{
  const f=await fixture();attach(f,writer);const anchor=writer.snapshot().sequence;
  const stopped=await f.stop();assertResponse(stopped,200);assert.equal(result(stopped).resourceId,f.a.accountId);
  const audit=f.store.rows('audits').find(a=>a.action==='portal.command.stop'&&a.resourceId===f.a.accountId)!;assert.ok(audit);
  await writer.append([audit]);
  const journal=await readSafetyJournal(path),report=analyzeSafetyDeltas(journal,anchor);
  const item=report.items.find(i=>i.operation==='portal.command.stop'&&i.state==='COMMITTED');
  assert.equal(report.unresolved,1);assert.equal(item?.resolution,'BLOCKER');assert.equal(item?.reasonCode,'COMMITTED_REPLAY_REQUIRED');
  assert.ok(report.items.some(i=>i.reasonCode==='MATCHED_COMMIT_MARKER'));
  assert.equal(journal.entries.filter(e=>e.action==='intent.portal.command.stop')[0]?.resourceId,f.a.accountId);
  assert.equal(journal.entries.filter(e=>e.action==='commit.portal.command.stop')[0]?.resourceId,f.a.accountId);
  assert.equal(journal.entries.filter(e=>e.action.startsWith('abort.')).length,0);
 });
});

test('a late cancellation rejected by a previously established fence leaves a blocker',async()=>{
 await withJournal(async(writer,path)=>{
  const f=await fixture();attach(f,writer);assertResponse(await f.stop(),200);const anchor=writer.snapshot().sequence;
  assertResponse(await f.cancel(),409,'PORTAL_COMMAND_STOPPED');
  assert.deepEqual(await f.store.transaction(tx=>tx.get('uploads',f.id)),f.before);
  assert.equal(f.store.rows('receipts').filter(r=>r.commandKey===f.key&&r.operation==='portal.upload.cancel').length,0);
  const journal=await readSafetyJournal(path),report=analyzeSafetyDeltas(journal,anchor);
  const item=report.items.find(i=>i.operation==='portal.upload.cancel');
  assert.equal(report.unresolved,1);assert.equal(item?.state,'UNRESOLVED');assert.equal(item?.resolution,'BLOCKER');assert.equal(item?.reasonCode,'MISSING_COMPLETION_MARKER');
  assert.equal(journal.entries.filter(e=>e.action==='abort.portal.upload.cancel').length,0);
 });
});

test('a post-commit journal completion failure cannot become a no-commit claim',async()=>{
 await withJournal(async(writer,path)=>{
  const f=await fixture();attach(f,writer);const anchor=writer.snapshot().sequence;
  f.app.portal.sink={writeAhead:i=>writer.writeAhead(i),async committed(){throw new Error('synthetic completion failure');},aborted:(i,p)=>writer.aborted(i,p)};
  assertResponse(await f.stop(),500);
  assert.equal(f.store.rows('receipts').filter(r=>r.commandKey===f.key&&r.operation==='portal.command.stop').length,1);
  assertResponse(await f.status(),200);assert.equal(result(await f.status()).state,'STOPPED');
  const audit=f.store.rows('audits').find(a=>a.action==='portal.command.stop'&&a.resourceId===f.a.accountId)!;assert.ok(audit);await writer.append([audit]);
  const journal=await readSafetyJournal(path),report=analyzeSafetyDeltas(journal,anchor);
  const item=report.items.find(i=>i.operation==='portal.command.stop'&&i.state==='UNRESOLVED');
  assert.equal(report.unresolved,2);assert.equal(item?.resolution,'BLOCKER');assert.equal(item?.reasonCode,'MISSING_COMPLETION_MARKER');
  assert.ok(report.items.some(i=>i.reasonCode==='UNMATCHED_COMMITTED_AUDIT'&&i.resolution==='BLOCKER'));
  assert.equal(journal.entries.filter(e=>e.action==='commit.portal.command.stop'||e.action==='abort.portal.command.stop').length,0);
 });
});

test('stop conflict with a previously committed cancel leaves a conservative blocker',async()=>{
 await withJournal(async(writer,path)=>{
  const f=await fixture();assertResponse(await f.cancel(),200);attach(f,writer);const anchor=writer.snapshot().sequence;
  assertResponse(await f.stop(),409,'PENDING_ALREADY_RECORDED');
  assert.equal(f.store.rows('receipts').filter(r=>r.commandKey===f.key&&r.operation==='portal.command.stop').length,0);
  const journal=await readSafetyJournal(path),report=analyzeSafetyDeltas(journal,anchor);
  const item=report.items.find(i=>i.operation==='portal.command.stop');
  assert.equal(report.unresolved,1);assert.equal(item?.state,'UNRESOLVED');assert.equal(item?.resolution,'BLOCKER');assert.equal(item?.reasonCode,'MISSING_COMPLETION_MARKER');
  assert.equal(journal.entries.filter(e=>e.action==='abort.portal.command.stop').length,0);
 });
});

test('a rate-limited stop after the anchor also remains unresolved',async()=>{
 await withJournal(async(writer,path)=>{
  const f=await fixture();attach(f,writer);
  for(let i=0;i<10;i++){
   const key=randomUUID();const response=await f.a.client.raw('POST',`/portal/commands/${key}/stop`,{}, {'x-once-talent-account':f.a.accountId,'idempotency-key':key});assertResponse(response,200);
  }
  const anchor=writer.snapshot().sequence;assertResponse(await f.stop(),429,'RATE_LIMITED');
  const journal=await readSafetyJournal(path),report=analyzeSafetyDeltas(journal,anchor);
  const item=report.items.find(i=>i.operation==='portal.command.stop');
  assert.equal(report.unresolved,1);assert.equal(item?.state,'UNRESOLVED');assert.equal(item?.resolution,'BLOCKER');assert.equal(item?.reasonCode,'MISSING_COMPLETION_MARKER');
  assert.equal(journal.entries.filter(e=>e.action==='abort.portal.command.stop').length,0);
 });
});
