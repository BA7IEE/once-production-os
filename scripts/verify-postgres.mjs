/** Explicit disposable-DB gate. No implicit .env fallback, cleanup or deletion.
 * The main integration database is supplied by the caller. Additional M1 maintenance tests create
 * fresh sibling databases and deliberately leave them for CI-service disposal/evidence. */
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const raw=process.env.DATABASE_URL_TEST;
if(process.env.ALLOW_DB_TESTS!=='yes'||!raw){console.error('Requires ALLOW_DB_TESTS=yes and DATABASE_URL_TEST. See docs/release/LOCAL_RUN.md; no database was touched.');process.exit(2);}
let url;try{url=new URL(raw);}catch{console.error('Invalid test database URL.');process.exit(2);}
if(!['postgresql:','postgres:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!new RegExp('^/once_test_[a-z0-9_]+$').test(url.pathname)||url.search||url.hash||!url.username||!url.password){console.error('Only a named disposable once_test_* database on loopback with explicit credentials is permitted.');process.exit(2);}

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
  if(status===0){
   const td2=await fresh('once_test_td2_','Talent 2 maintenance');
   status=runNode('tests/postgres/talent-v2-maintenance.test.ts',{
    ...process.env,DATABASE_URL_TD2_TEST:td2,ALLOW_TD2_DB_TESTS:'yes'
   },240000);
  }
  if(status===0){
   const typedMerge=await fresh('once_test_td2_merge_','Talent 2 professional merge');
   status=runNode('tests/postgres/talent-v2-merge.test.ts',{
    ...process.env,DATABASE_URL_TD2_TEST:typedMerge,ALLOW_TD2_DB_TESTS:'yes'
   },240000);
  }
  if(status===0){
   const transferSource=await fresh('once_test_td2_transfer_','Talent 2 transfer source');
   const transferTarget=await fresh('once_rebuild_td2_','Talent 2 transfer target');
   status=runNode('tests/postgres/talent-transfer.test.ts',{
    ...process.env,DATABASE_URL_TD2_TEST:transferSource,DATABASE_URL_TALENT_REBUILD_TEST:transferTarget,ALLOW_TD2_DB_TESTS:'yes'
   },240000);
  }
  if(status===0){
   const proofSource=await fresh('once_test_td2_proof_','Talent 2 proof source');
   const proofTarget=await fresh('once_rebuild_proof_','Talent 2 proof target');
   status=runNode('tests/postgres/credential-media-transfer.test.ts',{
    ...process.env,DATABASE_URL_TD2_TEST:proofSource,DATABASE_URL_TALENT_REBUILD_TEST:proofTarget,ALLOW_TD2_DB_TESTS:'yes'
   },240000);
  }
  if(status===0){
   const collectionSource=await fresh('once_test_td2_collection_','Talent 2 collection source');
   const collectionTarget=await fresh('once_rebuild_collection_','Talent 2 collection target');
   status=runNode('tests/postgres/collection-transfer.test.ts',{
    ...process.env,DATABASE_URL_TD2_TEST:collectionSource,DATABASE_URL_TALENT_REBUILD_TEST:collectionTarget,ALLOW_TD2_DB_TESTS:'yes'
   },240000);
  }
  if(status===0){
   const adultSource=await fresh('once_test_td2_adult_','Talent 2 adult source');
   const adultTarget=await fresh('once_rebuild_adult_','Talent 2 adult target');
   status=runNode('tests/postgres/adult-transfer.test.ts',{
    ...process.env,DATABASE_URL_TD2_TEST:adultSource,DATABASE_URL_TALENT_REBUILD_TEST:adultTarget,ALLOW_TD2_DB_TESTS:'yes'
   },240000);
  }
  if(status===0){
   const identitySource=await fresh('once_test_td2_identity_','Identity evidence source');
   const identityTarget=await fresh('once_rebuild_identity_','Identity evidence target');
   status=runNode('tests/postgres/identity-transfer.test.ts',{
    ...process.env,DATABASE_URL_TD2_TEST:identitySource,DATABASE_URL_TALENT_REBUILD_TEST:identityTarget,ALLOW_TD2_DB_TESTS:'yes'
   },240000);
  }
  process.exitCode=status;
 }catch(error){console.error(error instanceof Error?error.message:'Could not create a fresh isolated sibling database.');process.exitCode=1;}
 finally{await admin.$disconnect();}
}
