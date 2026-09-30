import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {RecoveryOps} from '../../packages/core/src/recovery.ts';
import {hashSecret} from '../../packages/core/src/crypto.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import {MAINTENANCE_TABLES} from '../../packages/core/src/talent-maintenance-lifecycle.ts';
import {authFixture} from '../support/talent-auth.ts';
import {exportMaintenance,maintenanceMergeDelete,maintenanceReviewBoundaries,maintenanceGuardianBoundaries} from '../support/talent-maintenance.ts';
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {verifyTalentMaintenance,reviewRollbackScenario} from '../support/talent-maintenance.ts';
import {writeFile,mkdir} from 'node:fs/promises';
const url=process.env.DATABASE_URL_TALENT_MAINTENANCE_TEST;
assert.ok(process.env.ALLOW_TALENT_MAINTENANCE_DB_TESTS==='yes'&&url&&new URL(url).pathname.includes('test'),'fresh disposable test database required');
const db=new PrismaClient({datasources:{db:{url}},log:[]}),store=new PrismaStore(db);
try{assert.equal(await db.person.count(),0);const {checks,f,grantId,items}=await verifyTalentMaintenance(store);
 const rollback=await reviewRollbackScenario(f,grantId,items,async()=>{await db.$executeRawUnsafe(`CREATE FUNCTION once_maintenance_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='talent.submission.decide' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END; $$`);await db.$executeRawUnsafe(`CREATE TRIGGER once_maintenance_audit_fail BEFORE INSERT ON audits FOR EACH ROW EXECUTE FUNCTION once_maintenance_audit_fail()`);},async()=>{await db.$executeRawUnsafe(`DROP TRIGGER once_maintenance_audit_fail ON audits`);await db.$executeRawUnsafe(`DROP FUNCTION once_maintenance_audit_fail()`);});checks.push('postgres-real-audit-failure-rolls-back-source-evidence-adoption-and-receipt');
 const grant=await db.talentAccessGrant.findFirstOrThrow();await assert.rejects(db.talentAccessGrant.create({data:{...grant,id:crypto.randomUUID()}}));checks.push('postgres-active-self-unique');
 await assert.rejects(db.talentInvitation.update({where:{id:(await db.talentInvitation.findFirstOrThrow()).id},data:{reservedCount:10000}}));checks.push('postgres-quota-check');
 await assert.rejects(db.talentAccessGrant.update({where:{id:grant.id},data:{personId:crypto.randomUUID()}}));checks.push('postgres-grant-person-fk');

 const other=(await db.talentAccount.findFirstOrThrow({where:{id:{not:grant.talentAccountId}}}));
 await assert.rejects(db.talentAccessGrant.update({where:{id:grant.id},data:{talentAccountId:other.id}}));checks.push('postgres-grant-claim-account-compound-fk');
 const submission=await db.talentSubmission.findFirstOrThrow({where:{state:'APPROVED'}});await assert.rejects(db.talentSubmission.update({where:{id:submission.id},data:{talentAccountId:other.id===submission.talentAccountId?grant.talentAccountId:other.id}}));checks.push('postgres-submission-consent-grant-account-compound-fk');
 const item=await db.talentSubmissionItem.findFirstOrThrow({where:{submissionId:submission.id}});await assert.rejects(db.talentSubmissionItem.update({where:{id:item.id},data:{values:{field:'intro',value:'illegal changed frozen text'}}}));checks.push('postgres-submitted-item-immutable-trigger');
 const attribution=await db.sourceAttribution.findFirstOrThrow();await assert.rejects(db.sourceAttribution.update({where:{id:attribution.id},data:{talentAccountId:attribution.talentAccountId===other.id?grant.talentAccountId:other.id}}));checks.push('postgres-attribution-submission-account-compound-fk');
 const payload=await exportMaintenance(f);const rebuildUrl=process.env.DATABASE_URL_TALENT_MAINTENANCE_REBUILD_TEST,restoreUrl=process.env.DATABASE_URL_TALENT_MAINTENANCE_RESTORE_TEST;assert.ok(rebuildUrl&&restoreUrl&&rebuildUrl!==url&&restoreUrl!==url&&rebuildUrl!==restoreUrl);for(const candidate of [rebuildUrl,restoreUrl]){const u=new URL(candidate);assert.ok(['127.0.0.1','localhost'].includes(u.hostname)&&u.pathname.includes('test'));}
 const rebuilt=new PrismaStore(new PrismaClient({datasources:{db:{url:rebuildUrl}},log:[]}));try{assert.equal(await rebuilt.client.workspace.count(),0);const target=await authFixture(rebuilt);target.clock.value=f.clock.value;const rebuild=new JsonRebuild(target.clock),actor=await rebuilt.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));await rebuilt.transaction(tx=>rebuild.apply(tx,actor,payload,{requestId:randomUUID(),ip:'test'}));assert.equal(await rebuilt.client.talentAccount.count(),0);assert.equal(await rebuilt.client.talentAccessGrant.count(),0);assert.equal((await rebuilt.client.sourceUseBasis.findFirstOrThrow()).consentId,null);assert.ok((await rebuilt.client.sourceRecord.findFirstOrThrow()).internalUseUntil);checks.push('postgres-json-rebuild-keeps-purpose-and-original-attribution-without-auth-grants');}finally{await rebuilt.close();}
 const restored=new PrismaStore(new PrismaClient({datasources:{db:{url:restoreUrl}},log:[]})),root=mkdtempSync(join(tmpdir(),'once-maint-restore-'));try{assert.equal((await restored.client.$queryRawUnsafe<any[]>("SELECT tablename FROM pg_tables WHERE schemaname='public'")).length,0);const env=(raw:string)=>{const u=new URL(raw);return {...process.env,PGHOST:u.hostname,PGPORT:u.port,PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:u.pathname.slice(1)};},file=join(root,'backup.dump');let run=spawnSync('pg_dump',['--format=custom','--file',file],{env:env(url!),encoding:'utf8',timeout:120000});assert.equal(run.status,0,run.stderr);run=spawnSync('pg_restore',['--no-owner','--no-acl','--dbname',new URL(restoreUrl).pathname.slice(1),file],{env:env(restoreUrl),encoding:'utf8',timeout:120000});assert.equal(run.status,0,run.stderr);for(const table of MAINTENANCE_TABLES){const sort=(rows:Array<{id:string}>)=>rows.sort((a,b)=>a.id.localeCompare(b.id));assert.deepEqual(sort(await restored.transaction(tx=>tx.find(table))),sort(await store.transaction(tx=>tx.find(table))),table);}
 const config={...f.app.config,accessMode:'MAINTENANCE' as const,dataEgressMode:'DISABLED' as const,dataCleanupMode:'DISABLED' as const,dataMergeMode:'DISABLED' as const,recoveryEpoch:randomBytes(24).toString('hex')},ops=new RecoveryOps(f.clock,config);await restored.transaction(async tx=>{const actor=await ops.actorFromRestoredTarget(tx,'owner');await ops.prepare(tx,actor,hashSecret(f.app.config.recoveryEpoch),{requestId:randomUUID(),ip:'test'});});assert.equal(await restored.client.talentAccessGrant.count({where:{state:'ACTIVE'}}),0);assert.equal(await restored.client.talentInvitation.count({where:{tokenHash:{not:null}}}),0);assert.equal(await restored.client.talentClaim.count({where:{reserved:true}}),0);checks.push('postgres-physical-backup-all-nine-entities-and-real-recovery-prepare');}finally{await restored.close();rmSync(root,{recursive:true,force:true});}
 checks.push(...await maintenanceReviewBoundaries(f,grantId,rollback.a));
 checks.push(...await maintenanceGuardianBoundaries(f));
 checks.push(...await maintenanceMergeDelete(f));
 await mkdir('artifacts/talent-experience-pr02b',{recursive:true});await writeFile('artifacts/talent-experience-pr02b/postgres.json',JSON.stringify({database:await db.$queryRaw`SELECT version()`,checks},null,2)+'\n');console.log(JSON.stringify({checks}));
}finally{await store.close();}
