import {ownedPostgres} from './test-postgres-owned.mjs';
try { const record=await ownedPostgres({suite:'browser-flow',baseline:'cos-purge-pg-20261109'}); console.log(JSON.stringify({outcome:record.outcome,status:record.status,remaining:record.remaining})); }
catch { console.error('Owned COS purge PG run failed or was refused; inspect its resource journal.'); process.exitCode=1; }
