import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { ResourceRun } from '../../scripts/resource-run.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const testScope=new ResourceRun();
after(async()=>{await testScope.cleanup();assert.equal(testScope.record.remaining.processes,0);});
const run=(command,args,options={})=>testScope.command(command,args,options);
test('success and failure are distinguished', async () => {
  assert.equal(await run(process.execPath, ['-e', "console.log('done')"], { capture: true }), 'done');
  await assert.rejects(run(process.execPath, ['-e', 'process.exit(7)'], { capture: true }));
});
test('timeout kills an uncooperative child', async () => {
  await assert.rejects(run(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { timeout: 100, capture: true }));
});
for (const signal of ['SIGINT','SIGTERM']) test(`parent ${signal} terminates child and reports failure`, async () => {
  const module = new URL('../../scripts/resource-lifecycle.mjs', import.meta.url).href;
  const parent = spawn(process.execPath, ['--input-type=module', '-e', `import {run} from ${JSON.stringify(module)}; try {await run(process.execPath,['-e',"console.log(process.pid);setInterval(()=>{},1000)"],{timeout:10000});}catch{process.exitCode=1;}`], { detached:true, env:{...process.env,ONCE_RESOURCE_RUN_DIR:testScope.directory}, stdio: ['ignore', 'pipe', 'pipe'] });
  writeFileSync(join(testScope.directory,`process-${parent.pid}.json`),JSON.stringify({pgid:parent.pid,supervisorPid:process.pid,status:'ACTIVE'}),{mode:0o600});
  let pid;
  await new Promise(resolve => parent.stdout.once('data', chunk => { pid = Number(chunk.toString().trim()); resolve(); }));
  parent.kill(signal);
  const code = await new Promise(resolve => parent.once('close', resolve));
  assert.equal(code, 1);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});
test('descendants are killed after leader exits', async () => {
  const code = "const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(c.pid);c.unref();";
  const pid = Number(await run(process.execPath, ['-e', code], { capture: true }));
  await new Promise(resolve => setTimeout(resolve, 100));
  const ps = execFileSync('ps', ['-axo', 'pid=,stat='], { encoding: 'utf8' });
  const line = ps.split('\n').find(row => Number(row.trim().split(/\s+/)[0]) === pid);
  assert.ok(!line || line.trim().split(/\s+/)[1].startsWith('Z'));
});

test('spawn exception and pre-aborted task create no live child', async () => {
  await assert.rejects(run('/nonexistent/once-os-command',[],{capture:true}));
  const controller=new AbortController();controller.abort();
  const {run:rawRun}=await import('../../scripts/resource-lifecycle.mjs');
  await assert.rejects(rawRun(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:controller.signal}));
});
test('leader exit with inherited pipes reclaims descendant promptly', async () => {
  const result=await run(process.execPath,['-e',"const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['ignore','inherit','inherit']});console.log(c.pid);c.unref();"],{capture:true,timeout:2000});
  assert.throws(()=>process.kill(Number(result),0),{code:'ESRCH'});
});
test('nested supervisor cancellation reclaims registered independent groups', async () => {
  const {ResourceRun}=await import('../../scripts/resource-run.mjs');
  const scope=new ResourceRun();
  const module=new URL('../../scripts/resource-lifecycle.mjs',import.meta.url).href;
  const timer=setTimeout(()=>scope.controller.abort(),250);
  try {
    await assert.rejects(scope.command(process.execPath,['--input-type=module','-e',`import {run} from ${JSON.stringify(module)};await run(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"]);`],{capture:true,timeout:10000}));
  } finally { clearTimeout(timer);await scope.cleanup(); }
  assert.equal(scope.record.remaining.processes,0);
});

test('successful nested supervisor does not kill its ancestor', async () => {
  const {ResourceRun}=await import('../../scripts/resource-run.mjs');const scope=new ResourceRun();
  const module=new URL('../../scripts/resource-lifecycle.mjs',import.meta.url).href;
  try{assert.equal(await scope.command(process.execPath,['--input-type=module','-e',`import {run} from ${JSON.stringify(module)};await run(process.execPath,['-e',"console.log('nested-success')"]);`],{capture:true}),'nested-success');}
  finally{await scope.cleanup();}
});
