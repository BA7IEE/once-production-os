import {ownedPostgres} from './test-postgres-owned.mjs';

// The existing supervisor owns the only PostgreSQL container and its cleanup.
try {
  const result = await ownedPostgres({suite:'browser-flow',baseline:'stop-recovery-pg-20261111'});
  console.log(JSON.stringify({outcome:result.outcome,status:result.status,remaining:result.remaining}));
} catch {
  console.error('Synthetic stop recovery scenario failed or was refused; inspect its redacted result and ResourceRun journal.');
  process.exitCode=1;
}
