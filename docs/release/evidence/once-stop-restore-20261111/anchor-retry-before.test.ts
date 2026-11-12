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
