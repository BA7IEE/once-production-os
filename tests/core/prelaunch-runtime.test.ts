import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,appendFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {SafetyJournalWriter,withSafetyJournalLock} from '../../apps/api/src/recovery/safety-journal.ts';
import {MediaWorker} from '../../apps/api/src/media/worker.ts';
import type {Application} from '../../packages/core/src/api.ts';
import type {LocalMediaProvider} from '../../apps/api/src/media/local-provider.ts';

test('journal kernel lock excludes a live process and releases after SIGKILL without deleting evidence', {timeout:15000}, async()=>{
 const root=await mkdtemp(join(tmpdir(),'once-lock-crash-')),path=join(root,'journal.jsonl');
 const module=new URL('../../apps/api/src/recovery/safety-journal.ts',import.meta.url).href;
 const writer=await SafetyJournalWriter.open(path);
 const child=spawn(process.execPath,['--experimental-strip-types','--input-type=module','-e',
  `import {withSafetyJournalLock} from ${JSON.stringify(module)}; await withSafetyJournalLock(${JSON.stringify(path)},async()=>{process.send('locked');await new Promise(resolve=>process.on('message',resolve));});`],{stdio:['ignore','ignore','pipe','ipc']});
 const closed=once(child,'close');
 try{
  await once(child,'message');
  await assert.rejects(writer.checkReady(),{code:'SAFETY_JOURNAL_LOCKED'});
  child.kill('SIGKILL');await closed;
  await writer.checkReady();
  await writer.writeAhead({intentId:'intent:crash-regression-0001',workspaceId:'test',operation:'source.suspend',requestId:'test',resourceId:'test'});
  assert.equal(writer.snapshot().sequence,1);
  await appendFile(path,'{"incomplete":');
  await assert.rejects(writer.checkReady(),{code:'SAFETY_JOURNAL_INVALID'});
  await assert.rejects(writer.writeAhead({intentId:'intent:crash-regression-0002',workspaceId:'test',operation:'source.suspend',requestId:'test2',resourceId:'test'}),{code:'SAFETY_JOURNAL_INVALID'});
 }finally{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await closed;}await rm(root,{recursive:true,force:true});}
});

test('journal lock survives exceptions and serializes independent handles',async()=>{
 const root=await mkdtemp(join(tmpdir(),'once-lock-parallel-')),path=join(root,'journal.jsonl');
 try{
  await SafetyJournalWriter.open(path);let active=0,peak=0;
  await Promise.all(Array.from({length:8},()=>withSafetyJournalLock(path,async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;})));
  assert.equal(peak,1);
  await assert.rejects(withSafetyJournalLock(path,async()=>{throw new Error('rollback')}));
  await (await SafetyJournalWriter.open(path)).checkReady();
 }finally{await rm(root,{recursive:true,force:true});}
});

test('unresolved cleanup does not mark purge or starve later cleanup and new uploads; retries are delayed',async()=>{
 let now=1000,claims=0;const marked:string[]=[],purged:string[]=[];
 let blocked=true;
 const core={clock:{now:()=>new Date(now)},media:{expire:async()=>[{id:'blocked'},{id:'ok'}].filter(u=>!marked.includes(u.id)),purgeAllowed:async()=>{},markPurged:async(id:string)=>{marked.push(id)},claim:async()=>{claims++;return null}}} as unknown as Application;
 const provider={purge:async(id:string)=>{purged.push(id);if(id==='blocked'&&blocked)throw new Error('COS_PUBLICATION_UNRESOLVED')}} as unknown as LocalMediaProvider;
 const worker=new MediaWorker(core,provider),signal=new AbortController().signal;
 await worker.cycle(signal);await worker.cycle(signal);
 assert.equal(claims,2);assert.deepEqual(marked,['ok']);assert.deepEqual(purged,['blocked','ok']);
 now+=60000;blocked=false;await worker.cycle(signal);
 assert.equal(claims,3);assert.deepEqual(marked,['ok','blocked']);
 const abort=new AbortController();abort.abort();await worker.cycle(abort.signal);assert.equal(claims,3);
});
