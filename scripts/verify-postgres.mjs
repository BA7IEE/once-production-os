/** Explicit disposable-DB gate. No implicit .env fallback, migration, cleanup or deletion. */
import { spawnSync } from 'node:child_process';
const raw=process.env.DATABASE_URL_TEST;
if(process.env.ALLOW_DB_TESTS!=='yes'||!raw){console.error('Requires ALLOW_DB_TESTS=yes and DATABASE_URL_TEST. See docs/release/LOCAL_RUN.md; no database was touched.');process.exit(2);}
let url;try{url=new URL(raw);}catch{console.error('Invalid test database URL.');process.exit(2);}
if(!['postgresql:','postgres:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^\/once_test_[a-z0-9_]+$/.test(url.pathname)||url.search||!url.username||!url.password){console.error('Only a named disposable once_test_* database on loopback with explicit credentials is permitted.');process.exit(2);}
const r=spawnSync(process.execPath,['--experimental-strip-types','--test','--test-concurrency=1','tests/postgres/integration.test.ts'],{stdio:'inherit',env:process.env,timeout:180000});
if(r.error){console.error('PostgreSQL verification process did not complete.');process.exitCode=1;}else process.exitCode=r.status??1;
