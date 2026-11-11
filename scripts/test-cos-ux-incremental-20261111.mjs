import {ownedPostgres} from './test-postgres-owned.mjs';
try{const result=await ownedPostgres({suite:'browser-flow',baseline:'cos-ux-incremental-20261111'});console.log(JSON.stringify({outcome:result.outcome,status:result.status,remaining:result.remaining}));}
catch{console.error('Owned browser scenario failed or was refused; inspect the resource journal and redacted evidence.');process.exitCode=1;}
