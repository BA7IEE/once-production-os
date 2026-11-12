import {ownedPostgres} from './test-postgres-owned.mjs';
try{const result=await ownedPostgres({suite:'browser-flow',baseline:'command-stop-legacy-20261111'});console.log(JSON.stringify({outcome:result.outcome,status:result.status,remaining:result.remaining}));}
catch{console.error('Owned legacy command-stop scenario failed or was refused; inspect the resource journal and redacted evidence.');process.exitCode=1;}
