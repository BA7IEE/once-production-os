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
  for(const variant of ['lifecycle','review-first','purge-first','rollback','restore','deletion-ttl','deletion-explicit','ownership-eligible','ownership-claimed','ownership-live','ownership-slow','retention-1','retention-30','batch','partial','rejected']){const db=await fresh('once_test_media_purge_'+variant.replace('-','_')+'_','Media purge '+variant);status=runNode('tests/postgres/media-purge.test.ts',{...process.env,DATABASE_URL_MEDIA_PURGE_TEST:db,MEDIA_PURGE_VARIANT:variant},180000);if(status!==0)throw new Error('Media purge PostgreSQL verification failed');}
  for(const variant of ['base','lifecycle','enroll','export','PERSON','WORK','MERGE','shared','takeover','legacy']){const db=await fresh('once_test_work_case_'+variant+'_','Work cases '+variant);const target=variant==='export'?await fresh('once_test_work_rebuild_','Work JSON rebuild'):undefined;status=runNode('tests/postgres/work-cases.test.ts',{...process.env,DATABASE_URL_WORK_CASE_TEST:db,DATABASE_URL_WORK_REBUILD_TEST:target,WORK_CASE_VARIANT:variant},180000);if(status!==0)throw new Error('Work case PostgreSQL verification failed');}
  for(const variant of ['base','security','enroll','export','merge','finalization']){const db=await fresh('once_test_collection_'+variant+'_','Media collections '+variant);const target=variant==='export'?await fresh('once_test_collection_rebuild_','Collection JSON rebuild'):undefined;status=runNode('tests/postgres/media-collections.test.ts',{...process.env,COLLECTION_FINALIZATION:variant==='finalization'?'yes':'no',DATABASE_URL_COLLECTION_REBUILD_TEST:target,DATABASE_URL_COLLECTION_TEST:db,COLLECTION_SECURITY:variant==='security'?'yes':'no',COLLECTION_ENROLL:variant==='enroll'?'yes':'no',COLLECTION_EXPORT:variant==='export'?'yes':'no',COLLECTION_MERGE:variant==='merge'?'yes':'no'},180000);if(status!==0)throw new Error('Media collection PostgreSQL verification failed');}
  for(const variant of ['formal-bound','formal-enroll','formal-role','bound','enroll','security','merge','adopted-merge','delete','expiry','grant','withdraw','consent','recovery','concurrency']){
   const media=await fresh('once_test_media_'+variant.replaceAll('-','_')+'_','Media staging '+variant);
   status=runNode('tests/postgres/media-staging.test.ts',{...process.env,DATABASE_URL_MEDIA_STAGING_TEST:media,ALLOW_DB_TESTS:'yes',MEDIA_FORMAL_AUTH:variant.startsWith('formal-')?variant.slice(7):'',MEDIA_STAGING_WORKER:['grant','withdraw','consent','recovery'].includes(variant)?variant:'',MEDIA_STAGING_CONCURRENCY:variant==='concurrency'?'yes':'no',MEDIA_STAGING_LIFECYCLE:['merge','adopted-merge','delete','expiry'].includes(variant)?variant:'',MEDIA_STAGING_ENROLL:variant==='enroll'?'yes':'no',MEDIA_STAGING_SECURITY:variant==='security'?'yes':'no'},180000);
   if(status!==0)throw new Error('Media staging PostgreSQL verification failed');
  }
  const collectionUpgrade=await fresh('once_test_collection_upgrade_','Populated migration 62 to 63 upgrade',false);status=runNode('tests/postgres/collection-upgrade.test.ts',{...process.env,DATABASE_URL_COLLECTION_UPGRADE_TEST:collectionUpgrade},180000);if(status!==0)throw new Error('Collection upgrade failed');
  const mediaUpgrade=await fresh('once_test_media_upgrade_','Media populated migration 61 upgrade',false);
  status=runNode('tests/postgres/media-upgrade.test.ts',{...process.env,DATABASE_URL_MEDIA_UPGRADE_TEST:mediaUpgrade,ALLOW_DB_TESTS:'yes'},180000);
  if(status!==0)throw new Error('Media upgrade verification failed');
  const maintenance=await fresh('once_test_maint_','Talent maintenance');
  const maintenanceRebuild=await fresh('once_test_maint_rebuild_','Talent maintenance JSON rebuild');const maintenanceRestore=await fresh('once_test_maint_restore_','Talent maintenance physical restore',false);
  status=runNode('tests/postgres/talent-maintenance.test.ts',{...process.env,DATABASE_URL_TALENT_MAINTENANCE_TEST:maintenance,DATABASE_URL_TALENT_MAINTENANCE_REBUILD_TEST:maintenanceRebuild,DATABASE_URL_TALENT_MAINTENANCE_RESTORE_TEST:maintenanceRestore,ALLOW_TALENT_MAINTENANCE_DB_TESTS:'yes'},180000);
  if(status!==0)throw new Error('Talent maintenance PostgreSQL verification failed');
  const auth=await fresh('once_test_auth_','Talent auth principals');
  const authRestore=await fresh('once_restore_auth_','Talent auth physical restore',false);
  status=runNode('tests/postgres/talent-auth.test.ts',{...process.env,DATABASE_URL_TALENT_AUTH_TEST:auth,DATABASE_URL_TALENT_AUTH_RESTORE_TEST:authRestore,ALLOW_TALENT_AUTH_DB_TESTS:'yes'},180000);
  if(status!==0)throw new Error('Talent auth PostgreSQL verification failed');
  const authUpgrade=await fresh('once_test_auth_upgrade_','Talent auth migration 55 upgrade',false);
  status=runNode('tests/postgres/talent-auth-upgrade.test.ts',{...process.env,DATABASE_URL_TALENT_AUTH_UPGRADE_TEST:authUpgrade,ALLOW_TALENT_AUTH_DB_TESTS:'yes'},180000);
  if(status!==0)throw new Error('Talent auth upgrade verification failed');
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
   const upgrade=await fresh('once_test_td2_upgrade_','Populated pre-TD2 baseline upgrade',false);
   status=runNode('tests/postgres/talent-baseline-upgrade.test.ts',{...process.env,DATABASE_URL_TD2_UPGRADE_TEST:upgrade,ALLOW_TD2_UPGRADE_TESTS:'yes'},240000);
  }
  if(status===0){
   const domain=await fresh('once_test_td2_domain_','Talent 2 domain gates');
   status=runNode('tests/postgres/talent-domain-gates.test.ts',{...process.env,DATABASE_URL_TD2_TEST:domain,ALLOW_TD2_DB_TESTS:'yes'},240000);
  }
  if(status===0){
   const locale=await fresh('once_test_td2_locale_','Internal locale text contracts');
   status=runNode('tests/postgres/locale-texts.test.ts',{...process.env,DATABASE_URL_TD2_TEST:locale,ALLOW_TD2_DB_TESTS:'yes'},240000);
  }
  if(status===0){
   const locale=await fresh('once_test_td2_locale_transfer_','Locale transfer source'),target=await fresh('once_rebuild_locale_transfer_','Locale transfer target'),restore=await fresh('once_restore_locale_transfer_','Locale import backup restore',false);
   status=runNode('tests/postgres/locale-transfer.test.ts',{...process.env,DATABASE_URL_TD2_TEST:locale,DATABASE_URL_LOCALE_REBUILD_TEST:target,DATABASE_URL_LOCALE_RESTORE_TEST:restore,ALLOW_TD2_DB_TESTS:'yes'},240000);
  }
  if(status===0){
   const scale=await fresh('once_test_td2_scale_','Typed search scale');
   status=runNode('tests/postgres/talent-search-scale.test.ts',{...process.env,DATABASE_URL_TD2_TEST:scale,ALLOW_TD2_DB_TESTS:'yes'},240000);
  }
  if(status===0){
   const td2=await fresh('once_test_td2_','Talent 2 maintenance');
   status=runNode('tests/postgres/talent-v2-maintenance.test.ts',{
    ...process.env,DATABASE_URL_TD2_TEST:td2,ALLOW_TD2_DB_TESTS:'yes'
   },240000);
  }
  if(status===0){
   const directory=await fresh('once_test_td2_pr01b_','PR01b lifecycle source'),target=await fresh('once_test_td2_pr01b_target_','PR01b lifecycle target'),restore=await fresh('once_restore_pr01b_','PR01b physical restore',false);
   status=runNode('tests/postgres/talent-directory.test.ts',{...process.env,DATABASE_URL_TD2_TEST:directory,DATABASE_URL_DIRECTORY_REBUILD_TEST:target,DATABASE_URL_DIRECTORY_RESTORE_TEST:restore,ALLOW_TD2_DB_TESTS:'yes'},240000);
  }
  if(status===0){
   const sharedProof=await fresh('once_test_td2_asset_','Talent 2 shared proof erasure');
   status=runNode('tests/postgres/talent-asset-erasure.test.ts',{
    ...process.env,DATABASE_URL_TD2_TEST:sharedProof,ALLOW_TD2_DB_TESTS:'yes'
   },240000);
  }
  if(status===0){
   const historyErasure=await fresh('once_test_td2_history_erasure_','Talent 2 historical identity erasure');
   status=runNode('tests/postgres/merge-history-erasure.test.ts',{...process.env,DATABASE_URL_TD2_TEST:historyErasure,ALLOW_TD2_DB_TESTS:'yes'},240000);
  }
  if(status===0){
   const source=await fresh('once_test_td2_erased_history_','Erased history transfer source'),target=await fresh('once_rebuild_erased_history_','Erased history transfer target');
   status=runNode('tests/postgres/merge-erasure-transfer.test.ts',{...process.env,DATABASE_URL_TD2_TEST:source,DATABASE_URL_TALENT_REBUILD_TEST:target,ALLOW_TD2_DB_TESTS:'yes'},240000);
  }
  if(status===0){
   const source=await fresh('once_test_td2_erased_origin_','Historical source clearance source'),target=await fresh('once_rebuild_erased_origin_','Historical source clearance target');
   status=runNode('tests/postgres/merge-erasure-transfer.test.ts',{...process.env,DATABASE_URL_TD2_TEST:source,DATABASE_URL_TALENT_REBUILD_TEST:target,ALLOW_TD2_DB_TESTS:'yes',TEST_ERASE_HISTORY_ORIGIN:'yes'},240000);
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
   const retainedSource=await fresh('once_test_td2_retained_','Talent 2 retained-origin source');
   const retainedTarget=await fresh('once_rebuild_retained_','Talent 2 retained-origin target');
   status=runNode('tests/postgres/retained-origin-transfer.test.ts',{
    ...process.env,DATABASE_URL_TD2_TEST:retainedSource,DATABASE_URL_TALENT_REBUILD_TEST:retainedTarget,ALLOW_TD2_DB_TESTS:'yes'
   },240000);
  }
  if(status===0){
   const identitySource=await fresh('once_test_td2_identity_origin_','Talent 2 retained identity source');
   const identityTarget=await fresh('once_rebuild_identity_origin_','Talent 2 retained identity target');
   status=runNode('tests/postgres/identity-origin-transfer.test.ts',{...process.env,DATABASE_URL_TD2_TEST:identitySource,DATABASE_URL_TALENT_REBUILD_TEST:identityTarget,ALLOW_TD2_DB_TESTS:'yes'},240000);
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
  if(status===0){
   const historySource=await fresh('once_test_td2_history_','Merge history source');
   const historyTarget=await fresh('once_rebuild_history_','Merge history target');
   status=runNode('tests/postgres/merge-history-transfer.test.ts',{
    ...process.env,DATABASE_URL_TD2_TEST:historySource,DATABASE_URL_TALENT_REBUILD_TEST:historyTarget,ALLOW_TD2_DB_TESTS:'yes'
   },240000);
  }
  process.exitCode=status;
 }catch(error){console.error(error instanceof Error?error.message:'Could not create a fresh isolated sibling database.');process.exitCode=1;}
 finally{await admin.$disconnect();}
}
