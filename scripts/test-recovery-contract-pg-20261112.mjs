/**
 * Local-only, owned PostgreSQL recovery contract runner.
 * Each case receives its own ResourceRun, container, lock and cleanup record.
 * The caller must pre-create a private absolute evidence directory.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { ownedPostgres } from './test-postgres-owned.mjs';
import { ResourceRun } from './resource-run.mjs';

for (const key of Object.keys(process.env)) {
  if (/^(?:COS_|TENCENT|AWS_|AZURE_|GCP_|GOOGLE_|MEDIA_|TALENT_AUTH_|SMTP_|SMS_|DATABASE_URL|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|NODE_OPTIONS|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY)/i.test(key)
      || /(?:TOKEN|PASSWORD|SECRET|CREDENTIAL|API_KEY|PRIVATE_KEY)/i.test(key)) delete process.env[key];
}
process.env.MEDIA_PROVIDER = 'disabled';

try {
  if (process.env.ONCE_TEST_LIFECYCLE_FAULT) throw new Error('Unexpected lifecycle fault configuration');
  const evidenceRoot = process.env.ONCE_ACCEPTANCE_EVIDENCE_DIR;
  if (!evidenceRoot || !isAbsolute(evidenceRoot) || resolve(evidenceRoot) !== evidenceRoot
      || realpathSync(evidenceRoot) !== evidenceRoot) throw new Error('A canonical private evidence directory is required');
  const info = statSync(evidenceRoot);
  if (!info.isDirectory() || (info.mode & 0o077) !== 0) throw new Error('Evidence directory must be private');
  const reportDir = join(evidenceRoot, `recovery-contract-${randomUUID()}`);
  mkdirSync(reportDir, { mode: 0o700 });
  const summaryFile = join(reportDir, 'summary.json');
  const results = [];
  let blocked = false;
  const save = () => writeFileSync(summaryFile, JSON.stringify({
    schema: 'once-local-recovery-contract-run-v1', realProviders: 'NOT_RUN', browser: 'NOT_RUN',
    results, blocked
  }, null, 2) + '\n', { mode: 0o600 });
  save();

  for (const caseName of ['recovery', 'approval', 'talent-v2']) {
    const caseDir = join(reportDir, `${caseName}-${randomUUID()}`);
    mkdirSync(caseDir, { mode: 0o700 });
    const scope = new ResourceRun();
    process.env.ONCE_RECOVERY_CONTRACT_CASE = caseName;
    process.env.ONCE_RECOVERY_CONTRACT_CASE_DIR = caseDir;
    try {
      const record = await ownedPostgres({ scope, suite: 'browser-flow', baseline: 'recovery-contract-pg-20261112' });
      results.push({ case: caseName, resourceRunId: scope.id, outcome: record.outcome,
        resourceStatus: record.status, remaining: record.remaining });
    } catch {
      results.push({ case: caseName, resourceRunId: scope.id, outcome: scope.record.outcome,
        resourceStatus: scope.record.status, remaining: scope.record.remaining ?? 'UNKNOWN' });
      // Do not continue if cleanup, interruption or ownership is uncertain.
      if (scope.controller.signal.aborted || scope.record.status !== 'ZERO_RESIDUE' || scope.record.outcome !== 'FAIL') blocked = true;
    }
    save();
    if (blocked) break;
  }
  delete process.env.ONCE_RECOVERY_CONTRACT_CASE;
  delete process.env.ONCE_RECOVERY_CONTRACT_CASE_DIR;
  console.log(JSON.stringify({ results, blocked }));
  if (blocked || results.length !== 3 || results.some(row => row.outcome !== 'PASS' || row.resourceStatus !== 'ZERO_RESIDUE'))
    process.exitCode = 1;
} catch {
  console.error('Owned recovery contract run refused or interrupted; inspect its private resource records.');
  process.exitCode = 1;
}
