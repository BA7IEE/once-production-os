/**
 * Dispatched only by test-recovery-contract-pg-20261112.mjs through ownedPostgres.
 * Runs one existing contract unchanged, in an owned container and synthetic data.
 * No raw child output, credentials, or private paths are saved in evidence.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { registeredTemp } from '../../scripts/registered-temp.mjs';

const specs = {
  recovery: { test: 'tests/postgres/recovery.test.ts', databases: ['once_restore_contract_'], migrate: [0] },
  approval: { test: 'tests/postgres/recovery-approval.test.ts', databases: ['once_backup_contract_', 'once_restore_approval_contract_'], migrate: [0] },
  'talent-v2': { test: 'tests/postgres/talent-v2-maintenance.test.ts', databases: ['once_test_td2_contract_'], migrate: [0] }
};
const sha = value => createHash('sha256').update(value).digest('hex');
const digestOutput = value => sha(Buffer.from(value ?? ''));
let phase = 'preflight', evidenceFile, sourceHashes = {}, sourceTreeHash, head, admin, temp, failureDetail;
let result = { status: 'IN_PROGRESS', realProviders: 'NOT_RUN', browser: 'NOT_RUN' };

function save(extra = {}) {
  Object.assign(result, extra);
  if (evidenceFile) writeFileSync(evidenceFile, JSON.stringify({ ...result, phase, head, sourceTreeHash, sourceHashes,
    fingerprintScope: 'tracked core, API, test support, migrations and explicitly listed runtime files; excludes dependencies',
    cleanup: 'see matching ResourceRun record; never inferred from test result' }, null, 2) + '\n', { mode: 0o600 });
}
function command(program, args, options = {}) {
  return spawnSync(program, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'], ...options });
}
function requireSuccess(run) {
  if (run.error || run.status !== 0) {
    failureDetail = { exit: run.status, signal: run.signal, subprocessError: run.error ? 'SPAWN_ERROR_OR_TIMEOUT' : null,
      stdoutSha256: digestOutput(run.stdout), stderrSha256: digestOutput(run.stderr) };
    throw new Error('SCOPED_COMMAND_FAILED');
  }
  return run.stdout;
}
function safeTap(stdout) {
  // Whitelist TAP structure and numeric diagnostics only. Individual test output can
  // contain URLs, paths or synthetic secrets in assertion messages, so never copy it.
  const lines = ['TAP version 13', '# Output sanitized; raw stdout/stderr retained only as SHA-256 digests.'];
  for (const line of (stdout ?? '').split(/\r?\n/)) {
    let match;
    if ((match = line.match(/^(not ok|ok) (\d+)(?:\s+-\s+.*)?$/))) lines.push(`${match[1]} ${match[2]} - contract assertion`);
    else if ((match = line.match(/^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$/))) lines.push(line);
    else if ((match = line.match(/^\s*(expected|actual):\s*(-?\d+)\s*$/))) lines.push(`# ${match[1]}: ${match[2]}`);
    else if ((match = line.match(/^\s*code:\s*['"]?(ERR_ASSERTION)['"]?\s*$/))) lines.push(`# code: ${match[1]}`);
    else if (line.includes('RECOVERY_TRUST_EVIDENCE_UNAVAILABLE')) lines.push('# error: RECOVERY_TRUST_EVIDENCE_UNAVAILABLE');
    else if ((match = line.match(/tests\/postgres\/(recovery(?:-approval)?\.test\.ts|talent-v2-maintenance\.test\.ts):(\d+):(\d+)/)))
      lines.push(`# location: ${match[1]}:${match[2]}:${match[3]}`);
  }
  return lines.join('\n') + '\n';
}

// The adapter accepts only the exact existing test's pg_dump/pg_restore forms.
// The password passes through the environment; it is never an argument or file.
function adapter(config, mode) {
  return `#!${process.execPath}\nconst CFG=${JSON.stringify(config)}, MODE=${JSON.stringify(mode)};\n` + String.raw`
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
function deny(){process.stderr.write('Scoped PostgreSQL adapter refused or failed.\n');process.exit(1);}
try {
 const a=process.argv.slice(2),dump=MODE==='dump';
 if(process.env.PGHOST!=='127.0.0.1'||process.env.PGPORT!==CFG.port||process.env.PGUSER!=='once_test'||!process.env.PGPASSWORD||
    process.env.PGDATABASE!==(dump?CFG.source:CFG.target))deny();
 if(dump&&(a.length!==5||a[0]!=='--format=custom'||a[1]!=='--no-owner'||a[2]!=='--no-privileges'||a[3]!=='--file'))deny();
 if(!dump&&(a.length!==5||a[0]!=='--no-owner'||a[1]!=='--no-privileges'||a[2]!=='--dbname'||a[3]!==CFG.target))deny();
 const file=a[4],backup=path.dirname(file),nested=path.dirname(backup),name=path.basename(nested);
 const m=/^temp-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(name);
 if(!path.isAbsolute(file)||path.resolve(file)!==file||!m||path.dirname(nested)!==CFG.runDir||path.basename(backup)!=='backup'||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.dump$/.test(path.basename(file))||
    fs.realpathSync(nested)!==nested||fs.realpathSync(backup)!==backup)deny();
 const record=JSON.parse(fs.readFileSync(path.join(CFG.runDir,'temporary-'+m[1]+'.json'),'utf8'));
 if(record.path!==nested||record.kind!=='NESTED_TEMP'||record.status!=='REGISTERED')deny();
 const flags=dump?(fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW):(fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 const fd=fs.openSync(file,flags,0o600);
 try {
   if(!fs.fstatSync(fd).isFile())deny();
   const args=['exec','-i','-e','PGPASSWORD','-e','PGUSER=once_test','-e','PGHOST=127.0.0.1','-e','PGPORT=5432',CFG.container,
     dump?'pg_dump':'pg_restore',...(dump?['--format=custom','--no-owner','--no-privileges','--dbname',CFG.source]:['--no-owner','--no-privileges','--dbname',CFG.target])];
   const r=spawnSync('docker',args,{env:process.env,stdio:dump?['ignore',fd,'pipe']:[fd,'pipe','pipe'],timeout:120000});
   if(r.error||r.status!==0)deny();
 } finally {fs.closeSync(fd);}
} catch {deny();}
`;
}

try {
  assert.equal(process.env.ALLOW_DB_TESTS, 'yes');
  assert.equal(process.env.MEDIA_PROVIDER, 'disabled');
  assert.deepEqual(Object.keys(process.env).filter(k => /^(?:COS_|TENCENT|AWS_|AZURE_|GCP_|GOOGLE_|TALENT_AUTH_|SMTP_|SMS_)/i.test(k)), []);
  assert.deepEqual(Object.keys(process.env).filter(k => /^MEDIA_/i.test(k) && k !== 'MEDIA_PROVIDER'), []);
  const caseName = process.env.ONCE_RECOVERY_CONTRACT_CASE, spec = specs[caseName];
  assert.ok(spec);
  const runDir = process.env.ONCE_RESOURCE_RUN_DIR;
  assert.ok(runDir && isAbsolute(runDir) && resolve(runDir) === runDir && realpathSync(runDir) === runDir);
  const record = JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8'));
  assert.match(record.id, /^[a-f0-9]{24}$/);
  assert.equal(runDir, join(resolve('data/local-resource-runs'), record.id));
  const container = `once-os-test-pg-${record.id}`;
  assert.deepEqual(record.containers, [{ name: container, label: `io.once.test-run=${record.id}`, creation: 'CONFIRMED' }]);
  const raw = process.env.DATABASE_URL_TEST, original = new URL(raw);
  assert.ok(['postgres:', 'postgresql:'].includes(original.protocol));
  assert.equal(original.hostname, '127.0.0.1'); assert.match(original.port, /^\d+$/);
  assert.equal(original.username, 'once_test'); assert.ok(original.password);
  assert.equal(original.pathname, `/once_test_${record.id}`); assert.equal(original.search, ''); assert.equal(original.hash, '');
  const label = requireSuccess(command('docker', ['inspect', '--format',
    '{{ index .Config.Labels "io.once.test-run" }}|{{ index .Config.Labels "io.once.lifecycle" }}|{{ .State.Running }}', container])).trim();
  assert.equal(label, `${record.id}|temporary|true`);
  assert.equal(requireSuccess(command('docker', ['port', container, '5432/tcp'])).trim(), `127.0.0.1:${original.port}`);
  const caseDir = process.env.ONCE_RECOVERY_CONTRACT_CASE_DIR, evidenceRoot = process.env.ONCE_ACCEPTANCE_EVIDENCE_DIR;
  assert.ok(caseDir && evidenceRoot && isAbsolute(caseDir) && realpathSync(caseDir) === caseDir && realpathSync(evidenceRoot) === evidenceRoot);
  assert.ok(caseDir.startsWith(evidenceRoot + '/recovery-contract-') && statSync(caseDir).isDirectory() && (statSync(caseDir).mode & 0o077) === 0);
  evidenceFile = join(caseDir, 'result.json');
  result.case = caseName; result.resourceRunId = record.id; result.testFile = spec.test;
  head = requireSuccess(command('git', ['rev-parse', 'HEAD'])).trim(); assert.match(head, /^[0-9a-f]{40}$/);
  const tracked = requireSuccess(command('git', ['ls-files', '-z', '--', 'packages/core/src', 'apps/api/src', 'tests/support', 'prisma/migrations']))
    .split('\0').filter(Boolean);
  const explicit = ['scripts/test-recovery-contract-pg-20261112.mjs', 'tests/acceptance/browser-recovery-contract-pg-20261112.mjs',
    'scripts/test-postgres-owned.mjs', 'scripts/resource-lifecycle.mjs', 'scripts/resource-run.mjs', 'scripts/registered-temp.mjs',
    'scripts/recovery-backup.ts', 'scripts/recovery-prepare.ts', 'scripts/recovery-check.ts', 'scripts/recovery-approve.ts',
    'scripts/recovery-restore-media.ts', 'scripts/safety-journal.ts', 'prisma/schema.prisma', 'package.json', 'pnpm-lock.yaml',
    ...Object.values(specs).map(s => s.test)];
  const paths = [...new Set([...tracked, ...explicit])].sort();
  const fingerprint = () => Object.fromEntries(paths.map(path => [path, sha(readFileSync(path))]));
  sourceHashes = fingerprint(); sourceTreeHash = sha(JSON.stringify(sourceHashes));
  save();

  phase = 'create-registered-owned-databases';
  const adminUrl = new URL(raw); adminUrl.pathname = '/postgres';
  admin = new PrismaClient({ datasources: { db: { url: adminUrl.href } }, log: [] });
  const names = spec.databases.map(prefix => prefix + record.id), urls = [];
  for (const name of names) {
    assert.match(name, /^once_[a-z0-9_]+$/); assert.ok(name.length <= 63);
    assert.equal((await admin.$queryRawUnsafe('SELECT datname FROM pg_database WHERE datname = $1', name)).length, 0);
    const dbRecord = join(runDir, `database-${name}.json`);
    writeFileSync(dbRecord, JSON.stringify({ name, container, status: 'CREATE_ATTEMPTED', cleanup: 'OWNING_CONTAINER' }), { mode: 0o600, flag: 'wx' });
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    writeFileSync(dbRecord, JSON.stringify({ name, container, status: 'CREATED', cleanup: 'OWNING_CONTAINER' }), { mode: 0o600 });
    const url = new URL(raw); url.pathname = '/' + name; urls.push(url.href);
    const client = new PrismaClient({ datasources: { db: { url: url.href } }, log: [] });
    try { assert.equal((await client.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).length, 0); }
    finally { await client.$disconnect(); }
  }
  const env = { PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin', HOME: process.env.HOME ?? '/tmp',
    LANG: process.env.LANG ?? 'C.UTF-8', ONCE_RESOURCE_RUN_DIR: runDir, ALLOW_DB_TESTS: 'yes',
    MEDIA_PROVIDER: 'disabled', DATABASE_URL_TEST: raw, DATABASE_URL: urls[0] };
  if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;
  // Keep the same socket/context already checked by the owning runner. Otherwise
  // docker exec could accidentally consult a different default Docker context.
  assert.ok(!(process.env.DOCKER_HOST && process.env.DOCKER_CONTEXT));
  if (process.env.DOCKER_HOST) env.DOCKER_HOST = process.env.DOCKER_HOST;
  if (process.env.DOCKER_CONTEXT) env.DOCKER_CONTEXT = process.env.DOCKER_CONTEXT;
  phase = 'migrate-owned-empty-database';
  for (const i of spec.migrate) requireSuccess(command('pnpm', ['db:deploy'], { env: { ...env, DATABASE_URL: urls[i] }, timeout: 120000 }));
  if (caseName === 'recovery') Object.assign(env, { ALLOW_RECOVERY_TESTS: 'yes', DATABASE_URL_RECOVERY_TEST: urls[0] });
  if (caseName === 'talent-v2') Object.assign(env, { ALLOW_TD2_DB_TESTS: 'yes', DATABASE_URL_TD2_TEST: urls[0] });
  if (caseName === 'approval') {
    Object.assign(env, { ALLOW_RECOVERY_APPROVAL_TESTS: 'yes', DATABASE_URL_BACKUP_APPROVAL_TEST: urls[0], DATABASE_URL_RECOVERY_APPROVAL_TEST: urls[1] });
    assert.ok(!/[\s\r\n]/.test(process.execPath));
    temp = registeredTemp({ short: true }); const bin = join(temp.path, 'bin'); mkdirSync(bin, { mode: 0o700 });
    const cfg = { container, runDir, source: names[0], target: names[1], port: original.port };
    for (const [name, mode] of [['pg_dump', 'dump'], ['pg_restore', 'restore']])
      writeFileSync(join(bin, name), adapter(cfg, mode), { mode: 0o700, flag: 'wx' });
    env.PATH = `${bin}:${env.PATH}`;
  }
  phase = 'unchanged-postgres-contract';
  const test = command(process.execPath, ['--experimental-strip-types', '--test', '--test-concurrency=1', spec.test],
    { env, timeout: 145000 });
  const stdout = test.stdout ?? '', stderr = test.stderr ?? '';
  writeFileSync(join(caseDir, 'sanitized.tap'), safeTap(stdout), { mode: 0o600, flag: 'wx' });
  const stat = key => { const m = stdout.match(new RegExp(`^# ${key} (\\d+)$`, 'm')); return m ? Number(m[1]) : null; };
  const stats = Object.fromEntries(['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map(key => [key, stat(key)]));
  const finalHashes = fingerprint();
  const sourceUnchanged = JSON.stringify(sourceHashes) === JSON.stringify(finalHashes);
  const success = !test.error && test.status === 0 && stats.tests > 0 && stats.fail === 0 && stats.cancelled === 0 && stats.skipped === 0 && stats.todo === 0 && sourceUnchanged;
  save({ status: success ? 'PASS' : 'FAIL', command: `node --experimental-strip-types --test --test-concurrency=1 ${spec.test}`,
    testExit: test.status, testSignal: test.signal, subprocessError: test.error ? 'SPAWN_ERROR_OR_TIMEOUT' : null,
    stats, stdoutSha256: digestOutput(stdout), stderrSha256: digestOutput(stderr), sourceUnchanged,
    migration: 'pnpm db:deploy on verified empty registered database',
    postgresClients: caseName === 'approval' ? 'PG16 docker exec restricted to registered source, target and test temp' : 'not used',
    note: 'Sanitized TAP preserves result counts, numeric assertion diagnostics and safe test locations; raw output is not stored.' });
  if (!success) process.exitCode = 1;
} catch (error) {
  const safeCode = typeof error?.code === 'string' && /^(?:ERR_ASSERTION|P\d{4})$/.test(error.code) ? error.code : undefined;
  save({ status: 'HARNESS_FAILURE', failure: 'Scoped preflight, database setup or subprocess failed; raw diagnostics withheld.',
    failureDetail, safeCode });
  console.error('Scoped recovery contract case refused or failed; inspect its private sanitized evidence and resource record.');
  process.exitCode = 1;
} finally {
  try { await admin?.$disconnect(); } catch { process.exitCode = 1; }
  try { temp?.cleanup(); } catch { process.exitCode = 1; }
}
