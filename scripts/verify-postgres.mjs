/** Explicit disposable-DB gate. No implicit .env fallback, cleanup or deletion.
 * The main integration database is supplied by the caller. T29 and DEV-09A each create one
 * fresh sibling database, migrate it, test it, and deliberately leave it for evidence. */
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const raw=process.env.DATABASE_URL_TEST;
if(process.env.ALLOW_DB_TESTS!=='yes'||!raw){console.error('Requires ALLOW_DB_TESTS=yes and DATABASE_URL_TEST. See docs/release/LOCAL_RUN.md; no database was touched.');process.exit(2);}
let url;try{url=new URL(raw);}catch{console.error('Invalid test database URL.');process.exit(2);}
if(!['postgresql:','postgres:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^\/once_test_[a-z0-9_]+$/.test(url.pathname)||url.search||url.hash||!url.username||!url.password){console.error('Only a named disposable once_test_* database on loopback with explicit credentials is permitted.');process.exit(2);}

function runNode(file, env=process.env, timeout=180000){
 const r=spawnSync(process.execPath,['--experimental-strip-types','--test','--test-concurrency=1',file],{stdio:'inherit',env,timeout});
 if(r.error){console.error('PostgreSQL verification process did not complete.');return 1;}
 return r.status??1;
}
function migrate(target){
 const r=spawnSync('pnpm',['exec','prisma','migrate','deploy'],{stdio:'inherit',env:{...process.env,DATABASE_URL:target},timeout:120000});
 return r.error||r.status!==0?1:0;
}

const mainStatus=runNode('tests/postgres/integration.test.ts');
if(mainStatus!==0){process.exitCode=mainStatus;}else{
 const testName=url.pathname.slice('/once_test_'.length);
 const adminUrl=new URL(url.toString());adminUrl.pathname='/postgres';
 const admin=new PrismaClient({datasources:{db:{url:adminUrl.toString()}},log:[]});
 async function sibling(prefix,label,file,extraEnv){
  const name=prefix+testName;
  const target=new URL(url.toString());target.pathname='/'+name;
  const exists=await admin.$queryRawUnsafe(`SELECT datname FROM pg_database WHERE datname = '${name}'`);
  if(Array.isArray(exists)&&exists.length){console.error(`Fresh ${label} database already exists; refusing destructive reuse.`);return 2;}
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  if(migrate(target.toString())!==0){console.error(`${label} database migration did not complete.`);return 1;}
  return runNode(file,{...process.env,...extraEnv(target.toString())},180000);
 }
 try{
  await admin.$connect();
  let status=await sibling('once_rebuild_','T29 rebuild','tests/postgres/rebuild.test.ts',
   target=>({DATABASE_URL_REBUILD_TEST:target,ALLOW_REBUILD_TESTS:'yes'}));
  if(status===0) status=await sibling('once_restore_','DEV-09A restore','tests/postgres/recovery.test.ts',
   target=>({DATABASE_URL_RECOVERY_TEST:target,ALLOW_RECOVERY_TESTS:'yes'}));
  process.exitCode=status;
 }catch{console.error('Could not create a fresh isolated sibling database.');process.exitCode=1;}
 finally{await admin.$disconnect();}
}
