/** Explicit disposable-DB gate. No implicit .env fallback, cleanup or deletion.
 * The main integration database is supplied by the caller. T29 additionally creates one
 * fresh sibling once_rebuild_* database, migrates it, tests it, and deliberately leaves it. */
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
const mainStatus=runNode('tests/postgres/integration.test.ts');
if(mainStatus!==0){process.exitCode=mainStatus;}else{
 const testName=url.pathname.slice('/once_test_'.length);
 const rebuildName='once_rebuild_'+testName;
 const rebuildUrl=new URL(url.toString());rebuildUrl.pathname='/'+rebuildName;
 const adminUrl=new URL(url.toString());adminUrl.pathname='/postgres';
 const admin=new PrismaClient({datasources:{db:{url:adminUrl.toString()}},log:[]});
 try{
  await admin.$connect();
  const exists=await admin.$queryRawUnsafe(`SELECT datname FROM pg_database WHERE datname = '${rebuildName}'`);
  if(Array.isArray(exists)&&exists.length){console.error('Fresh T29 rebuild database already exists; refusing destructive reuse.');process.exitCode=2;}
  else{
   await admin.$executeRawUnsafe(`CREATE DATABASE "${rebuildName}"`);
   const migrated=spawnSync('pnpm',['exec','prisma','migrate','deploy'],{stdio:'inherit',env:{...process.env,DATABASE_URL:rebuildUrl.toString()},timeout:120000});
   if(migrated.error||migrated.status!==0){console.error('T29 rebuild database migration did not complete.');process.exitCode=1;}
   else process.exitCode=runNode('tests/postgres/rebuild.test.ts',{...process.env,DATABASE_URL_REBUILD_TEST:rebuildUrl.toString(),ALLOW_REBUILD_TESTS:'yes'},180000);
  }
 }catch{console.error('Could not create the fresh isolated T29 rebuild database.');process.exitCode=1;}
 finally{await admin.$disconnect();}
}
