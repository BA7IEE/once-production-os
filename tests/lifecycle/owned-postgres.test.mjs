import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ResourceRun} from '../../scripts/resource-run.mjs';
import {ownedPostgres} from '../../scripts/test-postgres-owned.mjs';

for (const outcome of ['PASS','FAIL','exception','timeout','SIGINT','SIGTERM','unknown-create']) {
  test(`owned PG ${outcome} reaches cleanup and zero (simulated Docker, no database)`, async () => {
    const scope = new ResourceRun({simulation:true}); let container=false, unlocked=false, stopped=false;
    scope.command=async (cmd,args) => {
      scope.check();
      if (args[0]==='ps') return '';
      if (args[0]==='run') { container=true; if(outcome==='unknown-create') throw new Error('CLI response unknown'); return 'new-id'; }
      if (args[0]==='exec') return '';
      if (args[0]==='port') return '127.0.0.1:12345';
      if (cmd==='pnpm') {
        if(outcome.startsWith('SIG')) { process.emit(outcome); scope.check(); }
        if(outcome!=='PASS') throw new Error(outcome);
      }
      return '';
    };
    const cleanupCommand=async (cmd,args) => {
      assert.equal(cmd,'docker');
      if(args[0]==='stop') { stopped=true; container=false; return ''; }
      assert.ok(args.includes(`label=io.once.test-run=${scope.id}`));
      assert.ok(args.includes(`name=^/once-os-test-pg-${scope.id}$`));
      return container?'new-id':'';
    };
    const execution=ownedPostgres({scope,guard:()=>{},lock:()=>()=>{unlocked=true;},cleanupCommand});
    if(outcome==='PASS') await execution; else await assert.rejects(execution);
    assert.ok(stopped); assert.ok(unlocked);
    assert.equal(scope.record.status,'ZERO_RESIDUE');
    assert.deepEqual(scope.record.remaining,{containers:0,processes:0,networks:0,temporaryVolumes:0});
  });
}
test('cleanup failure retains lock and reports leak (simulated)', async () => {
  const scope=new ResourceRun({simulation:true});let unlocked=false;
  scope.command=async (_cmd,args)=>args[0]==='ps'?'':Promise.reject(new Error('creation unknown'));
  await assert.rejects(ownedPostgres({scope,guard:()=>{},lock:()=>()=>{unlocked=true;},cleanupCommand:async()=>{throw new Error('daemon unavailable');}}),/RESOURCE_LEAK/);
  assert.equal(unlocked,false);assert.equal(scope.record.status,'CLEANUP_FAILED');
});
test('resource guard refuses before creating or querying Docker', async () => {
  const scope=new ResourceRun({simulation:true});let called=false,unlocked=false;
  scope.command=async()=>{called=true;};
  await assert.rejects(ownedPostgres({scope,guard:()=>{throw new Error('pressure');},lock:()=>()=>{unlocked=true;}}));
  assert.equal(called,false);assert.equal(scope.record.containers.length,0);assert.ok(unlocked);
});

test('unknown CI browser cannot create resources or execute an arbitrary file', async () => {
  const scope=new ResourceRun({simulation:true});let called=false,unlocked=false;
  scope.command=async()=>{called=true;};
  await assert.rejects(ownedPostgres({scope,suite:'ci-browser',baseline:'../../arbitrary',guard:()=>{},lock:()=>()=>{unlocked=true;}}),/Unknown CI browser suite/);
  assert.equal(called,false);assert.equal(scope.record.containers.length,0);assert.ok(unlocked);
  assert.equal(scope.record.status,'ZERO_RESIDUE');
});

test('unknown Docker create with no observed container is not falsely certified zero', async () => {
  const scope=new ResourceRun({simulation:true});let unlocked=false;
  scope.command=async (_cmd,args)=>{if(args[0]==='ps')return '';throw new Error('unknown request');};
  await assert.rejects(ownedPostgres({scope,guard:()=>{},lock:()=>()=>{unlocked=true;},cleanupCommand:async()=>''}),/RESOURCE_LEAK/);
  assert.equal(unlocked,false);assert.equal(scope.record.status,'CLEANUP_FAILED');assert.equal(scope.record.remaining.containers,'UNKNOWN');
});
test('verification success cannot become PASS when final cleanup fails',async()=>{
 const scope=new ResourceRun({simulation:true});let unlocked=false;
 scope.command=async(_cmd,args)=>args[0]==='port'?'127.0.0.1:55432':'';
 await assert.rejects(ownedPostgres({scope,guard:()=>{},lock:()=>()=>{unlocked=true;},cleanupCommand:async()=>{throw new Error('cleanup unknown');}}));
 assert.equal(scope.record.outcome,'CLEANUP_FAILED');assert.equal(unlocked,false);
});

for(const stopReply of ['success','unknown'])test(`observed --rm container ${stopReply} reply waits for verified async disappearance (simulated)`,async()=>{
 const scope=new ResourceRun({simulation:true});let stopped=false,reads=0,unlocked=false;
 scope.command=async(_cmd,args)=>args[0]==='port'?'127.0.0.1:55432':'';
 const cleanupCommand=async(_cmd,args)=>{
  assert.ok(args[0]==='stop'||args.includes(`label=io.once.test-run=${scope.id}`));
  if(args[0]==='stop'){stopped=true;if(stopReply==='unknown')throw new Error('response lost after stop');return '';}
  if(!stopped)return 'owned-id';
  return ++reads<3?'owned-id':'';
 };
 await ownedPostgres({scope,guard:()=>{},lock:()=>()=>{unlocked=true;},cleanupCommand});
 assert.equal(reads,3);assert.ok(unlocked);assert.equal(scope.record.status,'ZERO_RESIDUE');assert.equal(scope.record.outcome,'PASS');
});
