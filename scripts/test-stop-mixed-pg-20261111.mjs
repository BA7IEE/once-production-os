import {ownedPostgres} from './test-postgres-owned.mjs';

// Independent run, container, database and journal; does not touch the restore drill.
try {
  const result=await ownedPostgres({suite:'browser-flow',baseline:'stop-mixed-pg-20261111'});
  console.log(JSON.stringify({outcome:result.outcome,status:result.status,remaining:result.remaining}));
} catch {
  console.error('Synthetic mixed-version scenario failed or was refused; inspect redacted evidence and the ResourceRun journal.');
  process.exitCode=1;
}
