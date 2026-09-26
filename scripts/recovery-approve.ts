/** DEV-09C recovery approval CLI.
 * Default mode only checks eligibility. --apply changes only workspace.recoveryEpoch + RecoveryRun evidence.
 * Deployment ACCESS_MODE remains MAINTENANCE; opening INTERNAL is a later operator action. */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaStore } from '../apps/api/src/prisma-store.ts';
import { RecoveryOps } from '../packages/core/src/recovery.ts';
import { collectRecoveryExternalCheck } from '../apps/api/src/recovery/external-check.ts';
import { readBackupManifest, sha256File } from '../apps/api/src/recovery/backup-manifest.ts';
import { readSafetyJournal, safetyJournalHashAt } from '../apps/api/src/recovery/safety-journal.ts';
import { analyzeSafetyDeltas } from '../apps/api/src/recovery/delta-resolution.ts';
import { digest } from '../packages/core/src/json.ts';
import { AppError } from '../packages/core/src/errors.ts';

function usage(): never {
    console.error('Usage: pnpm recovery:approve -- --actor-login <login> --recovery-run-id <uuid> --backup-manifest <path> --database-dump <path> [--apply]');
    process.exit(2);
}
function args() {
    const out: { actorLogin?: string; recoveryRunId?: string; backupManifest?: string; databaseDump?: string; apply: boolean } = { apply: false };
    const list=process.argv.slice(2);
    for(let i=0;i<list.length;i++){
        const arg=list[i]; if(arg==='--') continue;
        if(arg==='--apply') out.apply=true;
        else if(arg==='--actor-login') out.actorLogin=list[++i];
        else if(arg==='--recovery-run-id') out.recoveryRunId=list[++i];
        else if(arg==='--backup-manifest') out.backupManifest=list[++i];
        else if(arg==='--database-dump') out.databaseDump=list[++i];
        else usage();
    }
    if(!out.actorLogin||!out.recoveryRunId||!out.backupManifest||!out.databaseDump) usage();
    if(!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(out.actorLogin)
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(out.recoveryRunId))
        usage();
    return out as { actorLogin:string; recoveryRunId:string; backupManifest:string; databaseDump:string; apply:boolean };
}
function targetUrl() {
    const raw=process.env.DATABASE_URL_RECOVERY;
    if(!raw){console.error('DATABASE_URL_RECOVERY is required. DATABASE_URL is intentionally ignored.');process.exit(2);}
    let url:URL;try{url=new URL(raw);}catch{console.error('DATABASE_URL_RECOVERY is invalid.');process.exit(2);}
    if(!['postgresql:','postgres:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)
        || !/^\/once_restore_[a-z0-9_]+$/.test(url.pathname)||url.search||url.hash||!url.username||!url.password){
        console.error('Only an explicit loopback once_restore_* PostgreSQL database is permitted by recovery approval.');
        process.exit(2);
    }
    return raw;
}
function config() {
    const recoveryFile=process.env.RECOVERY_EPOCH_FILE,contactFile=process.env.CONTACT_KEY_FILE;
    if(!recoveryFile||!contactFile){console.error('RECOVERY_EPOCH_FILE and CONTACT_KEY_FILE are required.');process.exit(2);}
    const recoveryEpoch=readFileSync(recoveryFile,'utf8').trim(),contactHex=readFileSync(contactFile,'utf8').trim();
    if(!/^[A-Za-z0-9_-]{32,128}$/.test(recoveryEpoch)||!/^[a-f0-9]{64}$/i.test(contactHex)){
        console.error('Recovery epoch or contact key file is malformed.');process.exit(2);
    }
    if(process.env.ACCESS_MODE!=='MAINTENANCE'
        ||(process.env.DATA_EGRESS_MODE??'DISABLED')!=='DISABLED'
        ||(process.env.DATA_CLEANUP_MODE??'DISABLED')!=='DISABLED'
        ||(process.env.DATA_MERGE_MODE??'DISABLED')!=='DISABLED'){
        console.error('Recovery approval requires ACCESS_MODE=MAINTENANCE and all data execution gates DISABLED.');
        process.exit(2);
    }
    return {accessMode:'MAINTENANCE' as const,dataEgressMode:'DISABLED' as const,dataCleanupMode:'DISABLED' as const,
        dataMergeMode:'DISABLED' as const,recoveryEpoch,contactKey:Buffer.from(contactHex,'hex')};
}

const input=args();
if(input.apply&&process.env.ALLOW_RECOVERY_APPROVE!=='yes'){
    console.error('Apply requires ALLOW_RECOVERY_APPROVE=yes. Recovery epoch was not changed.');
    process.exit(2);
}
const journalPath=process.env.SAFETY_JOURNAL_FILE;
if(!journalPath){console.error('SAFETY_JOURNAL_FILE is required for recovery approval.');process.exit(2);}
const client=new PrismaClient({datasources:{db:{url:targetUrl()}},log:[]});
const store=new PrismaStore(client);
const recovery=new RecoveryOps({now:()=>new Date()},config());

try{
    const manifest=await readBackupManifest(input.backupManifest);
    const dump=await sha256File(input.databaseDump);
    if(dump.bytes!==manifest.database.bytes||dump.sha256!==manifest.database.sha256){
        console.error('RECOVERY_BACKUP_DUMP_MISMATCH: database dump does not match backup manifest.');
        process.exitCode=1;
    }else{
        const journal=await readSafetyJournal(journalPath);
        if(journal.header.journalId!==manifest.safetyJournal.journalId
            || manifest.safetyJournal.sequence>journal.snapshot.sequence
            || safetyJournalHashAt(journal,manifest.safetyJournal.sequence)!==manifest.safetyJournal.headHash){
            console.error('RECOVERY_JOURNAL_ANCHOR_MISMATCH: safety journal does not contain the backup anchor.');
            process.exitCode=1;
        }else{
            await client.$connect();
            const external=await collectRecoveryExternalCheck(client);
            const actor=await store.transaction(tx=>recovery.actorFromRestoredTarget(tx,input.actorLogin));
            const run=await store.transaction(tx=>tx.get('recoveryRuns',input.recoveryRunId));
            if(!run||run.state!=='INSPECTED'||!run.reportDigest){
                console.error('RECOVERY_NOT_INSPECTED: record a clean restore-check before approval.');
                process.exitCode=1;
            }else{
                const report=await store.transaction(tx=>recovery.check(tx,actor,input.recoveryRunId,external));
                const deltaResolution=analyzeSafetyDeltas(journal,manifest.safetyJournal.sequence);
                const postBackupEntries=deltaResolution.postBackupEntries;
                const blockers=[...report.blockers];
                if(deltaResolution.unresolved!==0) blockers.push('SAFETY_JOURNAL_DELTA_UNRESOLVED');
                if(manifest.recoveryEpochDigest!==run.sourceEpochDigest) blockers.push('BACKUP_EPOCH_MISMATCH');
                if(manifest.contactKeyDigest!==(run.report as any).contactKeyDigest) blockers.push('BACKUP_CONTACT_KEY_MISMATCH');
                if(manifest.migrationDigest!==(run.report as any).migrationDigest) blockers.push('BACKUP_MIGRATION_MISMATCH');
                if(manifest.media.identityDigest!==(run.report as any).media.backupIdentityDigest) blockers.push('BACKUP_MEDIA_MISMATCH');

                const evidence={
                    schemaVersion:'once-recovery-approval-v1' as const,
                    backupId:manifest.backupId,
                    backupManifestDigest:manifest.manifestDigest,
                    databaseSha256:manifest.database.sha256,
                    recoveryEpochDigest:manifest.recoveryEpochDigest,
                    contactKeyDigest:manifest.contactKeyDigest,
                    migrationDigest:manifest.migrationDigest,
                    mediaIdentityDigest:manifest.media.identityDigest,
                    reportDigest:run.reportDigest,
                    deltaResolutionDigest:digest(deltaResolution),
                    deltaResolution,
                    safetyJournal:{
                        journalId:journal.header.journalId,
                        backupSequence:manifest.safetyJournal.sequence,
                        backupHeadHash:manifest.safetyJournal.headHash,
                        currentSequence:journal.snapshot.sequence,
                        currentHeadHash:journal.snapshot.headHash,
                        postBackupEntries
                    }
                };
                if(!input.apply){
                    console.log(JSON.stringify({mode:'CHECK',eligible:blockers.length===0,blockers,
                        deltaResolution:{resolved:deltaResolution.resolved,unresolved:deltaResolution.unresolved,
                            postBackupEntries:deltaResolution.postBackupEntries,items:deltaResolution.items},
                        evidence},null,2));
                    if(blockers.length) process.exitCode=3;
                }else if(blockers.length){
                    console.log(JSON.stringify({mode:'APPLY',eligible:false,blockers,
                        deltaResolution:{resolved:deltaResolution.resolved,unresolved:deltaResolution.unresolved,
                            postBackupEntries:deltaResolution.postBackupEntries,items:deltaResolution.items},
                        evidence},null,2));
                    process.exitCode=3;
                }else{
                    const approved=await store.transaction(tx=>recovery.approve(tx,actor,input.recoveryRunId,external,evidence,
                        {requestId:randomUUID(),ip:'CLI'}));
                    console.log(JSON.stringify({
                        mode:'APPLY',eligible:true,recoveryRunId:approved.id,state:approved.state,
                        approvedAt:approved.approvedAt,approvalDigest:approved.approvalDigest,
                        note:'Database recovery epoch approved. Deployment ACCESS_MODE is still MAINTENANCE; do not open INTERNAL until operator review is complete.'
                    },null,2));
                }
            }
        }
    }
}catch(error){
    if(error instanceof AppError) console.error(error.code+': '+error.message);
    else console.error('RECOVERY_APPROVAL_FAILED: recovery remains isolated.');
    process.exitCode=1;
}finally{await store.close();}
