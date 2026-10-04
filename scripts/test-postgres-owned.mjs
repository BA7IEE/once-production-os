import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { acquireLock, preflight } from './resource-lifecycle.mjs';
import { ResourceRun } from './resource-run.mjs';

export async function ownedPostgres({ scope = new ResourceRun(), guard = preflight, lock = acquireLock, cleanupCommand, suite='full', baseline='74' } = {}) {
  const name = `once-os-test-pg-${scope.id}`;
  const label = `io.once.test-run=${scope.id}`;
  let release;
  try {
    release = lock(); guard(); scope.check();
    const stale = await scope.command('docker', ['ps', '-aq', '--filter', 'label=io.once.lifecycle=temporary'], { capture:true, timeout:10000 });
    if (stale) throw new Error('Previous owned test containers exist; investigate before creating another.');
    const fault=process.env.ONCE_TEST_LIFECYCLE_FAULT;
    if(fault&&!['FAIL','exception','timeout','SIGINT','SIGTERM'].includes(fault))throw new Error('Invalid owned-test lifecycle fault.');
    const password = randomBytes(24).toString('hex');
    // Register BEFORE Docker: failed/unknown CLI response can still mean it created a container.
    scope.registerContainer(name, label);
    await scope.command('docker', ['run', '-d', '--rm', '--pull=never', '--name', name, '--label', 'io.once.lifecycle=temporary', '--label', label,
      '--restart=no', '--memory=512m', '--cpus=1', '--pids-limit=128', '--mount', 'type=tmpfs,destination=/var/lib/postgresql/data,tmpfs-size=536870912',
      '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_USER=once_test', '-e', `POSTGRES_DB=once_test_${scope.id}`, 'postgres:16-bookworm'],
      { env:{...process.env,POSTGRES_PASSWORD:password}, capture:true, timeout:30000 });
    scope.confirmContainer(name);
    let ready = false;
    for (let i=0; i<30; i++) {
      scope.check();
      try { await scope.command('docker', ['exec', name, 'pg_isready', '-U', 'once_test'], { capture:true, timeout:3000 }); ready=true; break; }
      catch { scope.check(); await new Promise(resolve => setTimeout(resolve,1000)); }
    }
    if (!ready) throw new Error('Test database startup timed out.');
    // Acceptance faults only apply to the newly registered disposable instance.
    if(fault==='FAIL')await scope.command(process.execPath,['-e','process.exit(7)']);
    if(fault==='exception')await scope.command(process.execPath,['-e',"throw new Error('synthetic lifecycle fault')"]);
    if(fault==='timeout')await scope.command(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{timeout:1000});
    if(fault==='SIGINT'||fault==='SIGTERM'){process.kill(process.pid,fault);await new Promise(resolve=>setImmediate(resolve));scope.check();}
    const endpoint = await scope.command('docker', ['port', name, '5432/tcp'], { capture:true, timeout:10000 });
    if (!/^127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error('Unexpected Docker port.');
    const url = `postgresql://once_test:${password}@${endpoint}/once_test_${scope.id}`;
    const env = { ...process.env,DATABASE_URL:url,DATABASE_URL_TEST:url,ALLOW_DB_TESTS:'yes' };
    if(suite==='browser-flow')await scope.command(process.execPath,[`tests/acceptance/browser-${baseline}.mjs`],{env:{...env,ALLOW_BROWSER_TESTS:'yes'},timeout:180000});
    else if(suite==='admin-ux')await scope.command(process.execPath,['--experimental-strip-types','--test','--test-concurrency=1','tests/postgres/admin-ux.test.ts'],{env,timeout:180000});
    else if(suite==='business-flow')await scope.command(process.execPath,['--experimental-strip-types','--test','--test-concurrency=1','tests/postgres/business-flow.test.ts'],{env:{...env,BUSINESS_FLOW_BASELINE:baseline},timeout:180000});
    else {await scope.command('pnpm', ['db:deploy'], {env});await scope.command(process.execPath, ['scripts/verify-postgres.mjs'], {env});}
    scope.record.outcome='VERIFIED_PENDING_CLEANUP';
  } catch (error) {
    scope.record.outcome=scope.controller.signal.aborted?'INTERRUPTED':scope.record.containers.length?'FAIL':'NOT_RUN';
    throw error;
  } finally {
    // Failed cleanup preserves the cross-checkout lock and the evidence.
    await scope.cleanup(cleanupCommand);
    release?.();
  }
  scope.record.outcome='PASS';scope.save();return scope.record;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async()=>{if(process.argv.includes('--admin-ux-browser')){for(const baseline of ['admin-ux','business-flow','talent-maintenance']){const record=await ownedPostgres({suite:'browser-flow',baseline});console.log(JSON.stringify({baseline,...record.remaining}));}}else if(process.argv.includes('--admin-ux')){const record=await ownedPostgres({suite:'admin-ux'});console.log(JSON.stringify(record.remaining));}else if(process.argv.includes('--business-flow-browser')){for(const baseline of ['business-flow','talent-maintenance']){const record=await ownedPostgres({suite:'browser-flow',baseline});console.log(JSON.stringify({baseline,...record.remaining}));}}else if(process.argv.includes('--business-flow')){for(const baseline of ['74','empty']){const record=await ownedPostgres({suite:'business-flow',baseline});console.log(JSON.stringify({baseline,...record.remaining}));}}else console.log(JSON.stringify((await ownedPostgres()).remaining));})()
    .catch(() => { console.error('Owned PostgreSQL run refused, failed or interrupted. Inspect private resource journal; no credentials printed.'); process.exitCode=1; });
}
