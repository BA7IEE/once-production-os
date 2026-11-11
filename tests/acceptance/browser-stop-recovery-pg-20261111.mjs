/**
 * Isolated PostgreSQL stop/restore exercise. No browser or provider is used.
 * The filename lets the existing ownedPostgres browser-flow supervisor launch it.
 * It never drops a database: the registered ephemeral container owns every sibling.
 */
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {closeSync,mkdirSync,openSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {basename,dirname,isAbsolute,join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PrismaClient} from '@prisma/client';
import {registeredTemp} from '../../scripts/registered-temp.mjs';

// ownedPostgres launches a normal node process; source fixtures need Node 22's
// explicit type stripping. The child remains in the supervisor's process group.
if (process.argv[2] !== '--owned-case') {
  const child=spawnSync(process.execPath,['--experimental-strip-types',fileURLToPath(import.meta.url),'--owned-case'],
    {stdio:'inherit',env:process.env,timeout:165000});
  if(child.error || child.status!==0) process.exitCode=1;
} else {
  await main();
}

async function main() {
  let phase='preflight', evidenceFile, owned, sourceClient, admin;
  const restoreClients=[];
  const observations={};
  const baseline='89744a2ca4a49dde6f5202c65f82ba209fc0fabe';
  let executionHead='NOT_RUN', scopedWorktreeDirty=true;
  const commands=[];
  const paths=[
    'tests/acceptance/browser-stop-recovery-pg-20261111.mjs','scripts/test-stop-recovery-pg-20261111.mjs',
    'scripts/test-postgres-owned.mjs','scripts/resource-run.mjs','scripts/registered-temp.mjs',
    'tests/support/media-staging.ts','tests/support/talent-maintenance.ts','tests/support/talent-auth.ts',
    'tests/support/fixtures.ts','tests/support/fault-store.ts',
    'packages/core/src/api.ts','packages/core/src/commands.ts','packages/core/src/talent-portal.ts',
    'packages/core/src/recovery.ts','packages/core/src/recovery-model.ts','apps/api/src/prisma-store.ts',
    'apps/api/src/recovery/safety-journal.ts','apps/api/src/recovery/delta-resolution.ts',
    'scripts/recovery-backup.ts','scripts/recovery-prepare.ts','scripts/recovery-check.ts','scripts/recovery-approve.ts'
  ];
  function writeResult(status,extra={}) {
    if(!evidenceFile) return;
    const hashes=Object.fromEntries(paths.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
    writeFileSync(evidenceFile,JSON.stringify({status,head:executionHead,baseline,scopedWorktreeDirty,
      subject:scopedWorktreeDirty?'source plus scoped uncommitted changes':'checked-in source',
      environment:'registered disposable PostgreSQL; synthetic Core Application and PrismaStore; local SafetyJournal',
      boundaries:{realNest:'NOT_RUN',realProviders:'NOT_RUN',mixedVersion:'NOT_RUN; separate evaluation only',
        restoredApplication:'MAINTENANCE with new epoch only',cleanup:'requires ResourceRun ZERO_RESIDUE journal'},
      sourceHashes:hashes,commands,observations,...extra},null,2)+'\n',{mode:0o600});
  }
  function mark(name,details) {observations[name]=details;writeResult('IN_PROGRESS');}
  // Never print subprocess output: CLI results may include identifiers and paths.
  function command(program,args,env,expected=[0],options={}) {
    const result=spawnSync(program,args,{env,encoding:'utf8',timeout:options.timeout??120000,
      stdio:options.stdio??['ignore','pipe','pipe']});
    assert.ok(!result.error && expected.includes(result.status),`${phase}: subprocess failed`);
    return result;
  }
  function json(result) {return JSON.parse(result.stdout);}
  try {
    assert.equal(process.env.ALLOW_DB_TESTS,'yes');
    const runDir=process.env.ONCE_RESOURCE_RUN_DIR;
    assert.ok(runDir && isAbsolute(runDir) && resolve(runDir)===runDir);
    const record=JSON.parse(readFileSync(join(runDir,'run.json'),'utf8'));
    assert.match(record.id,/^[a-f0-9]{24}$/);
    assert.equal(runDir,join(resolve('data/local-resource-runs'),record.id));
    assert.equal(record.containers.length,1);
    const expectedContainer=`once-os-test-pg-${record.id}`;
    const expectedLabel=`io.once.test-run=${record.id}`;
    assert.deepEqual(record.containers[0],{name:expectedContainer,label:expectedLabel,creation:'CONFIRMED'});
    const raw=process.env.DATABASE_URL_TEST;assert.ok(raw);
    const source=new URL(raw);
    assert.ok(['postgres:','postgresql:'].includes(source.protocol));
    assert.equal(source.hostname,'127.0.0.1');assert.ok(/^\d+$/.test(source.port));
    assert.equal(source.username,'once_test');assert.ok(source.password);
    assert.equal(source.pathname,`/once_test_${record.id}`);assert.equal(source.search,'');assert.equal(source.hash,'');
    executionHead=command('git',['rev-parse','HEAD'],process.env).stdout.trim();
    assert.match(executionHead,/^[a-f0-9]{40}$/);
    command('git',['merge-base','--is-ancestor',baseline,executionHead],process.env);
    scopedWorktreeDirty=!!command('git',['status','--porcelain=v1','--untracked-files=all','--',...paths],process.env).stdout.trim();

    // A name or a loopback URL alone is not ownership. Cross-check this exact
    // registered container, both labels, its state, and the published DB port.
    const inspect=command('docker',['inspect','--format',
      '{{ index .Config.Labels "io.once.test-run" }}|{{ index .Config.Labels "io.once.lifecycle" }}|{{ .State.Running }}',expectedContainer],process.env).stdout.trim();
    assert.equal(inspect,`${record.id}|temporary|true`);
    assert.equal(command('docker',['port',expectedContainer,'5432/tcp'],process.env).stdout.trim(),`127.0.0.1:${source.port}`);

    const evidenceRoot=process.env.ONCE_ACCEPTANCE_EVIDENCE_DIR;
    assert.ok(evidenceRoot && isAbsolute(evidenceRoot) && resolve(evidenceRoot)===evidenceRoot);
    mkdirSync(evidenceRoot,{recursive:true,mode:0o700});
    const resultDir=join(evidenceRoot,`stop-recovery-${record.id}`);
    mkdirSync(resultDir,{mode:0o700});evidenceFile=join(resultDir,'result.json');
    owned=registeredTemp({short:true});const temp=owned.path;
    const backupDir=join(temp,'backup'),binDir=join(temp,'bin');
    mkdirSync(backupDir,{mode:0o700});mkdirSync(binDir,{mode:0o700});
    const journal=join(temp,'safety.jsonl');
    const oldEpochFile=join(temp,'old-epoch'),newEpochFile=join(temp,'new-epoch'),contactFile=join(temp,'contact');
    const newEpoch=randomBytes(24).toString('hex');
    const pgPassword=decodeURIComponent(source.password);
    const baseEnv={PATH:process.env.PATH??'/usr/local/bin:/usr/bin:/bin',
      ...(process.env.HOME?{HOME:process.env.HOME}:{}),
      ...(process.env.LANG?{LANG:process.env.LANG}:{}),
      ...(process.env.TMPDIR?{TMPDIR:process.env.TMPDIR}:{}),
      DATABASE_URL:raw,DATABASE_URL_TEST:raw};

    // The backup CLI calls pg_dump on PATH. This private adapter invokes the
    // real matching PG16 binary in the already-registered container and streams
    // its custom dump into an exclusively created file in this run's temp dir.
    // No password appears in an argument, log, script, or result file.
    assert.ok(!/[\r\n\s]/.test(process.execPath));
    const adapter=`#!${process.execPath}\n`+
      `const {spawnSync}=require('node:child_process');\n`+
      `const {openSync,closeSync}=require('node:fs');\n`+
      `const {dirname,resolve,basename}=require('node:path');\n`+
      `const args=process.argv.slice(2), root=${JSON.stringify(backupDir)}, container=${JSON.stringify(expectedContainer)}, db=${JSON.stringify(source.pathname.slice(1))};\n`+
      `if(args.length!==5||args[0]!=='--format=custom'||args[1]!=='--no-owner'||args[2]!=='--no-privileges'||args[3]!=='--file'||resolve(dirname(args[4]))!==root||!/^[0-9a-f-]{36}\\.dump$/.test(basename(args[4]))||process.env.PGDATABASE!==db||process.env.PGUSER!=='once_test'||!process.env.PGPASSWORD)process.exit(2);\n`+
      `let fd;try{fd=openSync(args[4],'wx',0o600);const r=spawnSync('docker',['exec','-i','-e','PGPASSWORD','-e','PGUSER=once_test','-e','PGHOST=127.0.0.1','-e','PGPORT=5432',container,'pg_dump','--format=custom','--no-owner','--no-privileges','--dbname',db],{env:process.env,stdio:['ignore',fd,'pipe'],timeout:120000});if(r.error||r.status!==0)process.exitCode=1;}catch{process.exitCode=1;}finally{if(fd!==undefined)closeSync(fd);}\n`;
    writeFileSync(join(binDir,'pg_dump'),adapter,{mode:0o700,flag:'wx'});

    phase='migrate-empty-source';
    sourceClient=new PrismaClient({datasources:{db:{url:raw}},log:[]});
    assert.equal((await sourceClient.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).length,0);
    command('pnpm',['db:deploy'],baseEnv);commands.push('pnpm db:deploy (fresh owned source)');
    const {PrismaStore}=await import('../../apps/api/src/prisma-store.ts');
    const {FaultStore}=await import('../support/fault-store.ts');
    const {stagingFixture}=await import('../support/media-staging.ts');
    const {Client,result}=await import('../support/fixtures.ts');
    const {Application}=await import('../../packages/core/src/api.ts');
    const {SafetyJournalWriter,readSafetyJournal}=await import('../../apps/api/src/recovery/safety-journal.ts');
    const {analyzeSafetyDeltas}=await import('../../apps/api/src/recovery/delta-resolution.ts');
    const store=new PrismaStore(sourceClient),faultStore=new FaultStore(store);
    const f=await stagingFixture(faultStore,false);
    f.app.config.portalCommandStopEnabled=true;
    const account=f.a.accountId,submission=f.submissionId;
    const accountRow=await sourceClient.talentAccount.findUniqueOrThrow({where:{id:account}});
    const oldEpoch=f.app.config.recoveryEpoch;
    writeFileSync(oldEpochFile,oldEpoch+'\n',{mode:0o600,flag:'wx'});
    writeFileSync(newEpochFile,newEpoch+'\n',{mode:0o600,flag:'wx'});
    writeFileSync(contactFile,f.app.config.contactKey.toString('hex')+'\n',{mode:0o600,flag:'wx'});
    const writer=await SafetyJournalWriter.open(journal),captured=[];
    const sink={async writeAhead(intent){captured.push({...intent});await writer.writeAhead(intent);},
      committed:(intent,id)=>writer.committed(intent,id),aborted:(intent,proof)=>writer.aborted(intent,proof)};
    f.app.safetyIntent=sink;f.app.portal.sink=sink;
    const stop=key=>f.a.client.raw('POST',`/portal/commands/${key}/stop`,{},f.headers(key));
    const status=key=>f.a.client.raw('GET',`/portal/commands/${key}/stop`,undefined,f.headers(key));
    const rows=(client,key)=>client.commandReceipt.findMany({where:{workspaceId:accountRow.workspaceId,
      talentAccountId:account,operation:'portal.command.stop',commandKey:key}});

    phase='stop-before-backup';
    const stopKey=randomUUID(),first=await stop(stopKey);
    assert.equal(first.status,200);assert.equal(result(first).resourceId,account);
    const firstRows=await rows(sourceClient,stopKey);assert.equal(firstRows.length,1);
    assert.equal(firstRows[0].resourceId,account);assert.equal(firstRows[0].result.state,'SUCCEEDED');
    assert.equal((await status(stopKey)).status,200);
    mark('synthetic_talent_stop_before_backup',{stopHttp:first.status,receiptCount:firstRows.length,receiptMatchesAccount:true});

    // Real DB rollback after an inserted audit, with a real write-ahead intent.
    // It is deliberately retried after the backup with the exact same key/body.
    phase='failed-attempt-before-backup';
    const blindKey=randomUUID();let faultFired=false;
    faultStore.afterInsert=(table,row)=>{if(table==='audits'&&row.action==='portal.command.stop'){
      faultFired=true;throw new Error('synthetic transaction rollback');}};
    const failed=await stop(blindKey);faultStore.afterInsert=null;
    const failedReceipts=await rows(sourceClient,blindKey),beforeAttempt=captured.at(-1);
    const failedAuditCount=beforeAttempt?.requestId?await sourceClient.auditEvent.count({where:{workspaceId:accountRow.workspaceId,
      action:'portal.command.stop',resourceId:account,requestId:beforeAttempt.requestId}}):null;
    const failureCode=result(failed).error?.code;
    mark('first_attempt_diagnostics',{responseStatus:failed.status,
      errorCode:typeof failureCode==='string'&&/^[A-Z0-9_]+$/.test(failureCode)?failureCode:'OTHER',
      faultFired,stopReceipts:failedReceipts.length,stopAudits:failedAuditCount});
    // PrismaStore deliberately maps an injected ordinary transaction error to
    // STORE_UNAVAILABLE, unlike MemoryStore's uncaught generic 500.
    assert.equal(failed.status,503);assert.equal(failureCode,'STORE_UNAVAILABLE');
    assert.equal(faultFired,true);assert.equal(failedReceipts.length,0);assert.equal(failedAuditCount,0);
    assert.equal(beforeAttempt?.operation,'portal.command.stop');
    const beforeJournal=await readSafetyJournal(journal);
    assert.ok(beforeJournal.entries.some(e=>e.auditId===beforeAttempt.intentId));
    assert.ok(!beforeJournal.entries.some(e=>e.auditId==='commit:'+beforeAttempt.intentId.slice(7)));
    mark('first_attempt_rolled_back_before_backup',{responseStatus:failed.status,transactionFaultFired:faultFired,
      stopReceipts:0,realWriteAheadRecorded:true});

    phase='backup';
    assert.equal(await sourceClient.mediaUpload.count({where:{state:{in:['OPEN','RECEIVING','UPLOADED','QUEUED','PROCESSING']}}}),0);
    assert.equal(await sourceClient.durableJob.count({where:{state:{in:['QUEUED','RUNNING']}}}),0);
    const backupEnv={...baseEnv,PATH:binDir+':'+baseEnv.PATH,DATABASE_URL_BACKUP:raw,
      SAFETY_JOURNAL_FILE:journal,CONTACT_KEY_FILE:contactFile,RECOVERY_EPOCH_FILE:oldEpochFile,
      BACKUP_QUIESCED:'yes',ACCESS_MODE:'MAINTENANCE',DATA_EGRESS_MODE:'DISABLED',
      DATA_CLEANUP_MODE:'DISABLED',DATA_MERGE_MODE:'DISABLED',MEDIA_PROVIDER:'disabled'};
    const backup=json(command(process.execPath,['--experimental-strip-types','scripts/recovery-backup.ts','--output-dir',backupDir],backupEnv));
    commands.push('recovery:backup; PG16 pg_dump --format=custom in registered container');
    assert.equal(dirname(backup.dumpPath),backupDir);assert.equal(dirname(backup.manifestPath),backupDir);
    assert.ok(statSync(backup.dumpPath).size>0);
    const manifest=JSON.parse(readFileSync(backup.manifestPath,'utf8'));
    const anchor=manifest.safetyJournal.sequence;
    assert.equal((await readSafetyJournal(journal)).snapshot.sequence,anchor);
    mark('real_quiesced_backup',{physicalDumpBytes:statSync(backup.dumpPath).size,backupAnchorRecorded:true,mediaProvider:'disabled'});

    // Model a lost completion *after* PostgreSQL committed. The journal writer
    // remains real; only its completion call is fault-injected for this attempt.
    phase='same-key-post-backup-commit-with-lost-completion';
    f.app.portal.sink={...sink,async committed(){throw new Error('synthetic completion loss');}};
    const retried=await stop(blindKey);f.app.portal.sink=sink;
    const retryIntent=captured.at(-1);
    assert.equal(retried.status,500);assert.notEqual(retryIntent.intentId,beforeAttempt.intentId);
    assert.notEqual(retryIntent.requestId,beforeAttempt.requestId);
    const blindRows=await rows(sourceClient,blindKey);
    assert.equal(blindRows.length,1);assert.equal(blindRows[0].resourceId,account);
    assert.equal(await sourceClient.auditEvent.count({where:{workspaceId:accountRow.workspaceId,
      action:'portal.command.stop',resourceId:account,requestId:retryIntent.requestId}}),1);
    assert.equal((await status(blindKey)).status,200);
    const unsynced=await readSafetyJournal(journal);
    assert.ok(unsynced.snapshot.sequence>anchor);
    assert.ok(unsynced.entries.some(e=>e.seq>anchor&&e.auditId===retryIntent.intentId));
    assert.ok(!unsynced.entries.some(e=>e.auditId==='commit:'+retryIntent.intentId.slice(7)));
    const retryDelta=analyzeSafetyDeltas(unsynced,anchor);
    assert.ok(retryDelta.items.some(i=>i.key===retryIntent.intentId.slice(7)&&i.operation==='portal.command.stop'
      &&i.state==='UNRESOLVED'&&i.resolution==='BLOCKER'&&i.reasonCode==='MISSING_COMPLETION_MARKER'));
    mark('same_key_real_commit_completion_lost',{firstAttemptStatus:failed.status,retryStatus:retried.status,
      distinctAttemptIntents:true,realDatabaseStopReceipts:blindRows.length,realDatabaseAuditCount:1,
      retryIntentAfterAnchor:true,retryCompletionMissing:true,deltaAnalyzerUnresolved:retryDelta.unresolved,
      journalAuditSyncAfterCommit:'NOT_RUN'});

    phase='create-owned-restore-databases';
    const adminUrl=new URL(raw);adminUrl.pathname='/postgres';
    admin=new PrismaClient({datasources:{db:{url:adminUrl.href}},log:[]});
    const oldHeaders=key=>({'x-once-talent-account':account,'idempotency-key':key});
    async function physicalRestore(label){
      assert.ok(['retry','later'].includes(label));
      const targetName=`once_restore_stop_${record.id}_${label}`,target=new URL(raw);target.pathname='/'+targetName;
      assert.match(targetName,/^once_restore_stop_[a-f0-9]{24}_(retry|later)$/);
      const existing=await admin.$queryRawUnsafe('SELECT datname FROM pg_database WHERE datname = $1',targetName);
      assert.equal(existing.length,0,'refuse existing target');
      const dbRecord=join(runDir,`database-${targetName}.json`);
      writeFileSync(dbRecord,JSON.stringify({name:targetName,container:expectedContainer,status:'CREATE_ATTEMPTED',cleanup:'OWNING_CONTAINER'}),{mode:0o600,flag:'wx'});
      await admin.$executeRawUnsafe(`CREATE DATABASE "${targetName}"`);
      writeFileSync(dbRecord,JSON.stringify({name:targetName,container:expectedContainer,status:'CREATED',cleanup:'OWNING_CONTAINER'}),{mode:0o600});
      const client=new PrismaClient({datasources:{db:{url:target.href}},log:[]});restoreClients.push(client);
      assert.equal((await client.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).length,0);
      const input=openSync(backup.dumpPath,'r');
      try{command('docker',['exec','-i','-e','PGPASSWORD','-e','PGUSER=once_test','-e','PGHOST=127.0.0.1','-e','PGPORT=5432',
        expectedContainer,'pg_restore','--exit-on-error','--no-owner','--no-privileges','--dbname',targetName],
        {...baseEnv,PGPASSWORD:pgPassword},[0],{stdio:[input,'pipe','pipe']});}
      finally{closeSync(input);}
      commands.push(`PG16 pg_restore --exit-on-error into registered ${label} database`);
      const saved=await rows(client,stopKey);assert.equal(saved.length,1);
      assert.equal(saved[0].resourceId,firstRows[0].resourceId);assert.deepEqual(saved[0].result,firstRows[0].result);
      assert.equal((await rows(client,blindKey)).length,0);
      return {client,target};
    }
    async function prepareAndInspect({client,target},label){
      const recoveryEnv={...baseEnv,DATABASE_URL_RECOVERY:target.href,RECOVERY_EPOCH_FILE:newEpochFile,
        CONTACT_KEY_FILE:contactFile,ACCESS_MODE:'MAINTENANCE',DATA_EGRESS_MODE:'DISABLED',
        DATA_CLEANUP_MODE:'DISABLED',DATA_MERGE_MODE:'DISABLED',MEDIA_PROVIDER:'disabled'};
      assert.equal((await client.workspace.findFirstOrThrow()).recoveryEpoch,oldEpoch);assert.notEqual(newEpoch,oldEpoch);
      // This is the first and only Application built for the restored database.
      const isolatedApp=new Application(new PrismaStore(client),{...f.app.config,accessMode:'MAINTENANCE',
        dataEgressMode:'DISABLED',dataCleanupMode:'DISABLED',dataMergeMode:'DISABLED',recoveryEpoch:newEpoch},f.clock);
      const isolatedClient=new Client(isolatedApp);isolatedClient.jar={...f.a.client.jar};isolatedClient.csrf=f.a.client.csrf;
      const before=await client.talentSubmission.findUniqueOrThrow({where:{id:submission}});
      const deniedBefore=await isolatedClient.raw('POST',`/portal/submissions/${submission}/withdraw`,
        {expectedRevision:before.revision},oldHeaders(randomUUID()));
      assert.equal(deniedBefore.status,503);
      const preview=json(command(process.execPath,['--experimental-strip-types','scripts/recovery-prepare.ts','--actor-login','owner'],recoveryEnv));
      const prepared=json(command(process.execPath,['--experimental-strip-types','scripts/recovery-prepare.ts','--actor-login','owner',
        '--expected-source-sha256',preview.sourceEpochDigest,'--apply'],{...recoveryEnv,ALLOW_RECOVERY_PREPARE:'yes'}));
      assert.equal(prepared.state,'PREPARED');
      const deniedAfter=await isolatedClient.raw('POST',`/portal/submissions/${submission}/withdraw`,
        {expectedRevision:before.revision},oldHeaders(randomUUID()));
      assert.equal(deniedAfter.status,503);
      assert.equal(await client.talentSession.count({where:{talentAccountId:account,revokedAt:null}}),0);
      assert.equal((await rows(client,stopKey)).length,1);
      assert.equal((await client.workspace.findFirstOrThrow()).recoveryEpoch,oldEpoch);
      const checked=json(command(process.execPath,['--experimental-strip-types','scripts/recovery-check.ts','--actor-login','owner',
        '--recovery-run-id',prepared.id,'--record'],{...recoveryEnv,ALLOW_RECOVERY_CHECK:'yes'}));
      assert.deepEqual(checked.blockers,[]);
      commands.push(`recovery:prepare CHECK and --apply; recovery:check --record (${label})`);
      mark(`restored_${label}_isolated`,{beforePrepareHttp:deniedBefore.status,afterPrepareHttp:deniedAfter.status,
        activeTalentSessions:0,preBackupStopReceiptStillPresent:true,sourceEpochRemainsUnapproved:true,
        stoppedKeyBusinessReplay:'NOT_RUN: restore target remains in maintenance'});
      const approveArgs=['--experimental-strip-types','scripts/recovery-approve.ts','--actor-login','owner',
        '--recovery-run-id',prepared.id,'--backup-manifest',backup.manifestPath,'--database-dump',backup.dumpPath];
      return {client,recoveryEnv,prepared,approveArgs};
    }

    phase='restore-retry-snapshot';
    const retryRestore=await physicalRestore('retry');
    const retryPrepared=await prepareAndInspect(retryRestore,'retry');
    mark('physical_restore_preserves_stop',{beforeBackupStopReceipts:1,blindRetryStopReceipts:0,
      originalStopReceiptMatches:true});

    // CHECK only: a demonstration must not approve a known unsafe branch.
    phase='blind-window-approval-check';
    // This is the actual current source journal, not an older copied branch.
    const stillCurrent=await readSafetyJournal(journal);
    assert.equal(stillCurrent.snapshot.headHash,unsynced.snapshot.headHash);
    assert.equal(stillCurrent.snapshot.sequence,unsynced.snapshot.sequence);
    const blindRun=command(process.execPath,retryPrepared.approveArgs,{...retryPrepared.recoveryEnv,SAFETY_JOURNAL_FILE:journal},[3]);
    const blindCheck=json(blindRun);
    commands.push('recovery:approve CHECK against actual current unsynced journal');
    assert.equal(blindCheck.eligible,false);
    assert.ok(blindCheck.blockers.includes('SAFETY_JOURNAL_DELTA_UNRESOLVED'));
    assert.ok(blindCheck.blockers.includes('SAFETY_JOURNAL_ANCHOR_STOP_UNRESOLVED'));
    assert.ok(blindCheck.deltaResolution.items.some(i=>i.key===retryIntent.intentId.slice(7)
      &&i.operation==='portal.command.stop'&&i.state==='UNRESOLVED'&&i.resolution==='BLOCKER'
      &&i.reasonCode==='MISSING_COMPLETION_MARKER'));
    mark('lost_completion_approval_check',{cliStatus:blindRun.status,eligible:blindCheck.eligible,
      journalPostBackupEntries:blindCheck.deltaResolution.postBackupEntries,
      journalUnresolved:blindCheck.deltaResolution.unresolved,specificRetryBlocks:true,preAnchorFailedStopBlocks:true});

    phase='stop-after-backup';
    const laterKey=randomUUID(),later=await stop(laterKey),laterIntent=captured.at(-1);
    assert.equal(later.status,200);assert.equal((await rows(sourceClient,laterKey)).length,1);
    const laterState=await readSafetyJournal(journal),delta=analyzeSafetyDeltas(laterState,anchor);
    assert.ok(delta.items.some(i=>i.key===laterIntent.intentId.slice(7)&&i.operation==='portal.command.stop'
      &&i.state==='COMMITTED'&&i.resolution==='BLOCKER'));
    mark('stop_after_backup_journal_delta',{stopHttp:later.status,sourceStopReceiptCount:1,
      deltaContainsSpecificCommittedStop:true,unresolved:delta.unresolved});

    phase='restore-later-snapshot';
    const laterRestore=await physicalRestore('later');
    assert.equal((await rows(laterRestore.client,laterKey)).length,0);
    const laterPrepared=await prepareAndInspect(laterRestore,'later');

    phase='post-backup-stop-approval-block';
    const blockedRun=command(process.execPath,laterPrepared.approveArgs,
      {...laterPrepared.recoveryEnv,SAFETY_JOURNAL_FILE:journal},[3]);
    const blocked=json(blockedRun);
    commands.push('recovery:approve CHECK against real post-backup stop journal');
    assert.equal(blocked.eligible,false);
    assert.ok(blocked.blockers.includes('SAFETY_JOURNAL_DELTA_UNRESOLVED'));
    assert.ok(blocked.blockers.includes('SAFETY_JOURNAL_ANCHOR_STOP_UNRESOLVED'));
    assert.ok(blocked.deltaResolution.items.some(i=>i.key===laterIntent.intentId.slice(7)
      &&i.operation==='portal.command.stop'&&i.state==='COMMITTED'&&i.resolution==='BLOCKER'));
    assert.equal((await laterRestore.client.workspace.findFirstOrThrow()).recoveryEpoch,oldEpoch);
    assert.equal((await laterRestore.client.recoveryRun.findUniqueOrThrow({where:{id:laterPrepared.prepared.id}})).state,'INSPECTED');
    mark('post_backup_stop_blocks_approval',{cliStatus:blockedRun.status,eligible:false,
      specificStopBlocks:true,preAnchorFailedStopBlocks:true,restoredStopReceiptCount:0,
      oldEpochUnchanged:true,recoveryRunState:'INSPECTED'});

    phase='complete';
    writeResult('PASS');
    console.log(JSON.stringify({status:'PASS',checks:Object.keys(observations).length}));
  } catch(error) {
    try{writeResult('HARNESS_FAILURE',{phase,errorType:error?.name??'Error'});}catch{}
    console.error('Stop recovery scenario did not finish; inspect redacted evidence.');process.exitCode=1;
  } finally {
    try{for(const client of restoreClients)await client.$disconnect();}finally{
      try{await admin?.$disconnect();}finally{
        try{await sourceClient?.$disconnect();}finally{owned?.cleanup();}
      }
    }
  }
}
