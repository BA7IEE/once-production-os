/** DEV-09C actual pg_dump -> pg_restore -> recovery approve drill. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { PrismaStore } from '../../apps/api/src/prisma-store.ts';
import { Application } from '../../packages/core/src/api.ts';
import { Client, FakeClock, SYNTHETIC_PASSWORD, result, sourceInput } from '../support/fixtures.ts';
import { LocalMediaProvider } from '../../apps/api/src/media/local-provider.ts';
import { base } from '../../packages/core/src/helpers.ts';

function url(name: string) {
    const raw=process.env[name];assert.ok(raw,name+' required');
    const u=new URL(raw);
    assert.ok(['postgres:','postgresql:'].includes(u.protocol));
    assert.ok(['127.0.0.1','localhost','[::1]'].includes(u.hostname));
    assert.ok(u.username&&u.password);
    return raw;
}
function pgEnv(raw: string) {
    const u=new URL(raw);
    return {
        PGHOST:u.hostname.replace(/^\[|\]$/g,''),PGPORT:u.port||'5432',
        PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),
        PGDATABASE:decodeURIComponent(u.pathname.slice(1))
    };
}
function run(command: string,args: string[],env: NodeJS.ProcessEnv,expected=0) {
    const r=spawnSync(command,args,{encoding:'utf8',timeout:300000,env});
    assert.equal(r.status,expected,command+' '+args.join(' ')+'\nstdout:\n'+(r.stdout??'')+'\nstderr:\n'+(r.stderr??''));
    return r;
}

test('DEV-09C real backup/restore approves only zero post-backup safety deltas',async()=>{
    assert.equal(process.env.ALLOW_RECOVERY_APPROVAL_TESTS,'yes');
    const sourceUrl=url('DATABASE_URL_BACKUP_APPROVAL_TEST');
    const restoreUrl=url('DATABASE_URL_RECOVERY_APPROVAL_TEST');
    assert.match(new URL(sourceUrl).pathname,/^\/once_backup_[a-z0-9_]+$/);
    assert.match(new URL(restoreUrl).pathname,/^\/once_restore_approval_[a-z0-9_]+$/);

    const sourceClient=new PrismaClient({datasources:{db:{url:sourceUrl}},log:[]});
    const sourceStore=new PrismaStore(sourceClient);
    const restoreClient=new PrismaClient({datasources:{db:{url:restoreUrl}},log:[]});
    const restoreStore=new PrismaStore(restoreClient);
    const tmp=mkdtempSync(join(tmpdir(),'once-recovery-approval-'));chmodSync(tmp,0o700);
    const backupDir=join(tmp,'backup');mkdirSync(backupDir,{mode:0o700});
    const sourceMediaRoot=join(tmp,'source-media');
    const restoredMediaRoot=join(tmp,'restored-media');
    const journal=join(tmp,'safety.jsonl'),deltaJournal=join(tmp,'safety-delta.jsonl');
    const oldEpoch='old_approval_epoch_20260926_aaaaaaaaaaaaaaaaaaaa';
    const newEpoch='new_approval_epoch_20260926_bbbbbbbbbbbbbbbbbbbb';
    const contactKey=randomBytes(32),csrfKey=randomBytes(32);
    const oldEpochFile=join(tmp,'old.epoch'),newEpochFile=join(tmp,'new.epoch'),contactFile=join(tmp,'contact.hex');
    writeFileSync(oldEpochFile,oldEpoch+'\n',{mode:0o600});
    writeFileSync(newEpochFile,newEpoch+'\n',{mode:0o600});
    writeFileSync(contactFile,contactKey.toString('hex')+'\n',{mode:0o600});

    try{
        await sourceClient.$connect();
        const clock=new FakeClock();
        const sourceApp=new Application(sourceStore,{
            origin:'https://backup-source.test.invalid',secureCookies:true,contactKey,csrfKey,recoveryEpoch:oldEpoch,
            accessMode:'INTERNAL',environment:'test',mediaEnabled:false,
            dataEgressMode:'INTERNAL_APPROVED',dataCleanupMode:'INTERNAL_APPROVED',dataMergeMode:'INTERNAL_APPROVED'
        },clock);
        await sourceApp.identity.bootstrap('owner','备份源管理员',SYNTHETIC_PASSWORD);
        const owner=new Client(sourceApp);assert.equal((await owner.login()).status,200);
        const sourceCreated=await owner.cmd('POST','/sources',sourceInput());
        assert.equal(sourceCreated.status,201,JSON.stringify(sourceCreated.body));
        const sourceId=result(sourceCreated).resourceId as string;
        const personCreated=await owner.cmd('POST','/people',{
            displayName:'备份恢复审批人才',roles:['model'],sourceId
        });
        assert.equal(personCreated.status,201);
        const personId=result(personCreated).resourceId as string;
        assert.equal((await owner.cmd('PUT','/people/'+personId+'/contacts',{
            expectedRevision:1,contacts:[{kind:'EMAIL',value:'approval@example.invalid',sourceId}]
        })).status,200);

        const provider=await LocalMediaProvider.create(sourceMediaRoot);
        const sourceRow=await sourceClient.sourceRecord.findUniqueOrThrow({where:{id:sourceId}});
        const personRow=await sourceClient.person.findUniqueOrThrow({where:{id:personId}});
        const ownerMembership=await sourceClient.membership.findFirstOrThrow({where:{workspaceId:personRow.workspaceId,userId:{not:''}}});
        const workspaceScope=await sourceClient.accessScope.findFirstOrThrow({where:{workspaceId:personRow.workspaceId,mode:'WORKSPACE'}});
        const uploadId=randomUUID(),objectToken=randomUUID();
        const originalBody=Buffer.from('DEV-09D-private-media-original');
        const previewBody=Buffer.from('DEV-09D-private-media-preview');
        const originalHash=createHash('sha256').update(originalBody).digest('hex');
        const previewHash=createHash('sha256').update(previewBody).digest('hex');
        await sourceStore.transaction(async tx=>{
            await tx.insert('uploads',{
                ...base(personRow.workspaceId,clock),id:uploadId,actorId:ownerMembership.id,
                actorRevision:ownerMembership.revision,actorEpoch:1,
                sourceId,sourceRevision:sourceRow.revision,sourceEpoch:sourceRow.protectionEpoch,
                scopeId:sourceRow.scopeId,scopeRevision:workspaceScope.revision,
                personId,personEpoch:personRow.protectionEpoch,personScopeId:personRow.scopeId,
                personScopeRevision:workspaceScope.revision,fileName:'backup-media.png',mime:'image/png',
                expectedBytes:originalBody.length,expectedHash:originalHash,state:'READY',
                expiresAt:new Date(clock.now().getTime()+86400000).toISOString(),renewals:0,attempts:1,
                receiveToken:randomUUID(),leaseToken:null,leaseUntil:null,errorCode:null,purgedAt:null
            });
            await tx.insert('assets',{
                ...base(personRow.workspaceId,clock),id:uploadId,uploadId,sourceId,scopeId:sourceRow.scopeId,personId,
                fileName:'backup-media.png',mime:'image/png',bytes:originalBody.length,sha256:originalHash,width:2,height:3,
                previewBytes:previewBody.length,previewHash,objectToken,state:'READY'
            });
        });
        const work=provider.work(uploadId,objectToken);
        mkdirSync(work,{recursive:true,mode:0o700});
        writeFileSync(join(work,'original.bin'),originalBody,{mode:0o400});
        writeFileSync(join(work,'preview.jpg'),previewBody,{mode:0o400});
        await provider.verifyAsset({
            id:uploadId,workspaceId:personRow.workspaceId,createdAt:clock.now().toISOString(),updatedAt:clock.now().toISOString(),
            revision:1,uploadId,sourceId,scopeId:sourceRow.scopeId,personId,fileName:'backup-media.png',mime:'image/png',
            bytes:originalBody.length,sha256:originalHash,width:2,height:3,previewBytes:previewBody.length,previewHash,
            objectToken,state:'READY'
        });

        const backup=run('pnpm',['--silent','recovery:backup','--','--output-dir',backupDir],{
            ...process.env,DATABASE_URL_BACKUP:sourceUrl,SAFETY_JOURNAL_FILE:journal,
            CONTACT_KEY_FILE:contactFile,RECOVERY_EPOCH_FILE:oldEpochFile,
            BACKUP_QUIESCED:'yes',ACCESS_MODE:'MAINTENANCE',
            DATA_EGRESS_MODE:'DISABLED',DATA_CLEANUP_MODE:'DISABLED',DATA_MERGE_MODE:'DISABLED',
            MEDIA_PROVIDER:'local',MEDIA_ROOT:sourceMediaRoot
        });
        const backupResult=JSON.parse(backup.stdout);
        const dumpPath=backupResult.dumpPath as string,manifestPath=backupResult.manifestPath as string;
        const mediaPath=backupResult.mediaPath as string;
        assert.ok(readFileSync(dumpPath).length>0);
        const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
        assert.equal(manifest.schemaVersion,'once-backup-manifest-v2');
        assert.equal(manifest.safetyJournal.sequence,backupResult.safetyJournal.sequence);
        assert.equal(manifest.media.provider,'local');
        assert.equal(manifest.media.assetCount,1);
        assert.equal(manifest.media.assets[0].id,uploadId);

        // Same journal id, one real post-backup safety action -> approval must block.
        copyFileSync(journal,deltaJournal);chmodSync(deltaJournal,0o600);
        const currentSource=await sourceClient.sourceRecord.findUniqueOrThrow({where:{id:sourceId}});
        const suspended=await owner.cmd('POST','/sources/'+sourceId+'/suspend',{
            expectedRevision:currentSource.revision,reason:'post backup safety change for recovery approval test'
        });
        assert.equal(suspended.status,200,JSON.stringify(suspended.body));
        const sync=run('pnpm',['--silent','safety-journal'],{
            ...process.env,DATABASE_URL_JOURNAL:sourceUrl,SAFETY_JOURNAL_FILE:deltaJournal
        });
        assert.ok(JSON.parse(sync.stdout).sequence>manifest.safetyJournal.sequence);

        // Restore the actual custom pg_dump into a different fresh database.
        const restored=run('pg_restore',['--no-owner','--no-privileges','--dbname',decodeURIComponent(new URL(restoreUrl).pathname.slice(1)),dumpPath],{
            ...process.env,...pgEnv(restoreUrl)
        });
        assert.equal(restored.status,0);
        await restoreClient.$connect();
        assert.equal((await restoreClient.workspace.findFirstOrThrow()).recoveryEpoch,oldEpoch);
        assert.equal((await restoreClient.sourceRecord.findUniqueOrThrow({where:{id:sourceId}})).status,'CONFIRMED',
            'restored DB must reflect the pre-delta backup snapshot');

        const restoredMedia=run('pnpm',['--silent','recovery:restore-media','--',
            '--backup-manifest',manifestPath,'--media-bundle',mediaPath,'--target-root',restoredMediaRoot],process.env);
        assert.equal(JSON.parse(restoredMedia.stdout).assetCount,1);

        const common={
            ...process.env,DATABASE_URL_RECOVERY:restoreUrl,DATABASE_URL:'postgresql://ignored:ignored@127.0.0.1:1/ignored',
            RECOVERY_EPOCH_FILE:newEpochFile,CONTACT_KEY_FILE:contactFile,
            ACCESS_MODE:'MAINTENANCE',DATA_EGRESS_MODE:'DISABLED',DATA_CLEANUP_MODE:'DISABLED',DATA_MERGE_MODE:'DISABLED',
            MEDIA_PROVIDER:'local',MEDIA_ROOT:restoredMediaRoot
        };
        const preparedCheck=run('pnpm',['--silent','recovery:prepare','--','--actor-login','owner'],common);
        const preparePreview=JSON.parse(preparedCheck.stdout);
        const prepared=run('pnpm',['--silent','recovery:prepare','--','--actor-login','owner',
            '--expected-source-sha256',preparePreview.sourceEpochDigest,'--apply'],{
            ...common,ALLOW_RECOVERY_PREPARE:'yes'
        });
        const preparedRow=JSON.parse(prepared.stdout);
        assert.equal(preparedRow.state,'PREPARED');

        const inspected=run('pnpm',['--silent','recovery:check','--','--actor-login','owner',
            '--recovery-run-id',preparedRow.id,'--record'],{
            ...common,ALLOW_RECOVERY_CHECK:'yes'
        });
        const report=JSON.parse(inspected.stdout);
        assert.deepEqual(report.blockers,[]);
        assert.equal(report.contactDecryptFailures,0);
        assert.equal(report.media.verifiedAssetIds[0],uploadId);
        assert.equal(report.media.backupIdentityDigest,manifest.media.identityDigest);

        const deltaApproval=run('pnpm',['--silent','recovery:approve','--',
            '--actor-login','owner','--recovery-run-id',preparedRow.id,
            '--backup-manifest',manifestPath,'--database-dump',dumpPath],{
            ...common,SAFETY_JOURNAL_FILE:deltaJournal
        },3);
        const blocked=JSON.parse(deltaApproval.stdout);
        assert.equal(blocked.eligible,false);
        assert.ok(blocked.blockers.includes('SAFETY_JOURNAL_DELTA_UNRESOLVED'));
        assert.equal((await restoreClient.workspace.findFirstOrThrow()).recoveryEpoch,oldEpoch);

        const eligible=run('pnpm',['--silent','recovery:approve','--',
            '--actor-login','owner','--recovery-run-id',preparedRow.id,
            '--backup-manifest',manifestPath,'--database-dump',dumpPath],{
            ...common,SAFETY_JOURNAL_FILE:journal
        });
        assert.equal(JSON.parse(eligible.stdout).eligible,true);

        const approved=run('pnpm',['--silent','recovery:approve','--',
            '--actor-login','owner','--recovery-run-id',preparedRow.id,
            '--backup-manifest',manifestPath,'--database-dump',dumpPath,'--apply'],{
            ...common,SAFETY_JOURNAL_FILE:journal,ALLOW_RECOVERY_APPROVE:'yes'
        });
        const approvedResult=JSON.parse(approved.stdout);
        assert.equal(approvedResult.state,'APPROVED');
        assert.match(approvedResult.approvalDigest,/^[a-f0-9]{64}$/);

        const workspace=await restoreClient.workspace.findFirstOrThrow();
        assert.equal(workspace.recoveryEpoch,newEpoch);
        const runRow=await restoreClient.recoveryRun.findUniqueOrThrow({where:{id:preparedRow.id}});
        assert.equal(runRow.state,'APPROVED');
        assert.equal((runRow.approval as any).backupId,manifest.backupId);
        assert.equal((runRow.approval as any).safetyJournal.postBackupEntries,0);
        assert.equal((await restoreClient.sourceRecord.findUniqueOrThrow({where:{id:sourceId}})).status,'SUSPENDED');
        assert.equal((await restoreClient.auditEvent.findFirstOrThrow({where:{action:'recovery.approve'}})).resourceId,preparedRow.id);

        // Approval synchronizes the DB epoch only. Operator explicitly chooses INTERNAL afterwards.
        const restoredApp=new Application(restoreStore,{
            origin:'https://restore-approved.test.invalid',secureCookies:true,contactKey,csrfKey,recoveryEpoch:newEpoch,
            accessMode:'INTERNAL',environment:'test',mediaEnabled:false,
            dataEgressMode:'DISABLED',dataCleanupMode:'DISABLED',dataMergeMode:'DISABLED'
        },clock);
        const restoredOwner=new Client(restoredApp);
        assert.equal((await restoredOwner.login()).status,200);
        const hidden=await restoredOwner.raw('GET','/people/'+personId);
        assert.equal(hidden.status,404,'suspended source remains restricted after recovery approval');

        console.log('PASS DEV-09D pg_dump/pg_restore+media: DB and private media restore together; zero journal delta approves; post-backup safety delta blocks');
    }finally{
        await sourceStore.close();
        await restoreStore.close();
        rmSync(tmp,{recursive:true,force:true});
    }
});
