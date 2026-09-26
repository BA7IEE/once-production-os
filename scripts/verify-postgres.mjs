/** Explicit disposable-DB gate. No implicit .env fallback, cleanup or deletion.
 * The main integration database is supplied by the caller. Additional M1 maintenance tests create
 * fresh sibling databases and deliberately leave them for CI-service disposal/evidence. */
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const raw=process.env.DATABASE_URL_TEST;
if(process.env.ALLOW_DB_TESTS!=='yes'||!raw){console.error('Requires ALLOW_DB_TESTS=yes and DATABASE_URL_TEST. See docs/release/LOCAL_RUN.md; no database was touched.');process.exit(2);}
let url;try{url=new URL(raw);}catch{console.error('Invalid test database URL.');process.exit(2);}
if(!['postgresql:','postgres:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!new RegExp('^/once_test_[a-z0-9_]+

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
 async function fresh(prefix,label,withMigrations=true){
  const name=prefix+testName;
  const target=new URL(url.toString());target.pathname='/'+name;
  const exists=await admin.$queryRawUnsafe(`SELECT datname FROM pg_database WHERE datname = '${name}'`);
  if(Array.isArray(exists)&&exists.length) throw new Error(`Fresh ${label} database already exists; refusing destructive reuse.`);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  if(withMigrations&&migrate(target.toString())!==0) throw new Error(`${label} database migration did not complete.`);
  return target.toString();
 }
 try{
  await admin.$connect();
  let status=0;
  const rebuild=await fresh('once_rebuild_','T29 rebuild');
  status=runNode('tests/postgres/rebuild.test.ts',{...process.env,DATABASE_URL_REBUILD_TEST:rebuild,ALLOW_REBUILD_TESTS:'yes'},180000);
  if(status===0){
   const restore=await fresh('once_restore_','DEV-09A/B restore');
   status=runNode('tests/postgres/recovery.test.ts',{...process.env,DATABASE_URL_RECOVERY_TEST:restore,ALLOW_RECOVERY_TESTS:'yes'},240000);
  }
  if(status===0){
   const backupSource=await fresh('once_backup_','DEV-09C backup source');
   const approvalRestore=await fresh('once_restore_approval_','DEV-09C approval restore',false);
   status=runNode('tests/postgres/recovery-approval.test.ts',{
    ...process.env,DATABASE_URL_BACKUP_APPROVAL_TEST:backupSource,
    DATABASE_URL_RECOVERY_APPROVAL_TEST:approvalRestore,
    ALLOW_RECOVERY_APPROVAL_TESTS:'yes'
   },300000);
  }
  process.exitCode=status;
 }catch(error){console.error(error instanceof Error?error.message:'Could not create a fresh isolated sibling database.');process.exitCode=1;}
 finally{await admin.$disconnect();}
}
).test(url.pathname)||url.search||url.hash||!url.username||!url.password){console.error('Only a named disposable once_test_* database on loopback with explicit credentials is permitted.');process.exit(2);}

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
 async function fresh(prefix,label,withMigrations=true){
  const name=prefix+testName;
  const target=new URL(url.toString());target.pathname='/'+name;
  const exists=await admin.$queryRawUnsafe(`SELECT datname FROM pg_database WHERE datname = '${name}'`);
  if(Array.isArray(exists)&&exists.length) throw new Error(`Fresh ${label} database already exists; refusing destructive reuse.`);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  if(withMigrations&&migrate(target.toString())!==0) throw new Error(`${label} database migration did not complete.`);
  return target.toString();
 }
 try{
  await admin.$connect();
  let status=0;
  const rebuild=await fresh('once_rebuild_','T29 rebuild');
  status=runNode('tests/postgres/rebuild.test.ts',{...process.env,DATABASE_URL_REBUILD_TEST:rebuild,ALLOW_REBUILD_TESTS:'yes'},180000);
  if(status===0){
   const restore=await fresh('once_restore_','DEV-09A/B restore');
   status=runNode('tests/postgres/recovery.test.ts',{...process.env,DATABASE_URL_RECOVERY_TEST:restore,ALLOW_RECOVERY_TESTS:'yes'},240000);
  }
  if(status===0){
   const backupSource=await fresh('once_backup_','DEV-09C backup source');
   const approvalRestore=await fresh('once_restore_approval_','DEV-09C approval restore',false);
   status=runNode('tests/postgres/recovery-approval.test.ts',{
    ...process.env,DATABASE_URL_BACKUP_APPROVAL_TEST:backupSource,
    DATABASE_URL_RECOVERY_APPROVAL_TEST:approvalRestore,
    ALLOW_RECOVERY_APPROVAL_TESTS:'yes'
   },300000);
  }
  process.exitCode=status;
 }catch(error){console.error(error instanceof Error?error.message:'Could not create a fresh isolated sibling database.');process.exitCode=1;}
 finally{await admin.$disconnect();}
}
