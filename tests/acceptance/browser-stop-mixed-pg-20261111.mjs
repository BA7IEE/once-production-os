/**
 * Independent mixed-writer negative control. No browser, server or provider is
 * used. A current synthetic writer creates a stop while it is the only active
 * writer; the unchanged 2e327e0 Core then rejoins and attempts the same key.
 * Only the newly registered sibling DB in this ResourceRun may be written.
 */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,realpathSync,symlinkSync,writeFileSync} from 'node:fs';
import {isAbsolute,join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {PrismaClient} from '@prisma/client';
import {registeredTemp} from '../../scripts/registered-temp.mjs';

if(process.argv[2]!=='--owned-case'){
  const child=spawnSync(process.execPath,['--experimental-strip-types',fileURLToPath(import.meta.url),'--owned-case'],
    {stdio:'inherit',env:process.env,timeout:165000});
  if(child.error||child.status!==0)process.exitCode=1;
}else await main();

async function main(){
  const legacy='2e327e01897002ca8027095e431010583197dbc0';
  const baseline='89744a2ca4a49dde6f5202c65f82ba209fc0fabe';
  const currentPaths=['tests/acceptance/browser-stop-mixed-pg-20261111.mjs','scripts/test-stop-mixed-pg-20261111.mjs',
    'scripts/test-postgres-owned.mjs','scripts/resource-run.mjs','scripts/registered-temp.mjs',
    'tests/support/media-staging.ts','tests/support/talent-maintenance.ts','tests/support/talent-auth.ts',
    'tests/support/fixtures.ts','apps/api/src/prisma-store.ts','apps/api/src/recovery/safety-journal.ts',
    'packages/core/src/api.ts','packages/core/src/commands.ts','packages/core/src/talent-portal.ts','packages/core/src/talent-maintenance-routes.ts'];
  let phase='preflight',evidenceFile,owned,admin,client,head='NOT_RUN',dirty=true;
  const observations={},legacyHashes={};
  function result(status,extra={}){
    if(!evidenceFile)return;
    const hashes=Object.fromEntries(currentPaths.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
    writeFileSync(evidenceFile,JSON.stringify({status,head,baseline,legacyCommit:legacy,scopedWorktreeDirty:dirty,
      currentSourceHashes:hashes,legacySourceHashes:legacyHashes,observations,
      environment:'one registered disposable PostgreSQL container, separate synthetic database, two in-process Core Application objects and local SafetyJournal',
      boundaries:{legacyCore:'actual git archive; no modifications',legacyStore:'current PrismaStore reused; not a historical full deployment',
        stopCreation:'current writer alone; old writer intentionally rejoins afterwards',
        separateOsProcesses:'NOT_RUN',realNest:'NOT_RUN',realProviders:'NOT_RUN',recoveryDatabases:'NOT_USED',
        cleanup:'requires ResourceRun ZERO_RESIDUE journal'},
      ...extra},null,2)+'\n',{mode:0o600});
  }
  function command(program,args,env=process.env){
    const r=spawnSync(program,args,{env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000,maxBuffer:8*1024*1024});
    assert.ok(!r.error&&r.status===0,`${phase}: subprocess failed`);return r;
  }
  try{
    assert.equal(process.env.ALLOW_DB_TESTS,'yes');
    const runDir=process.env.ONCE_RESOURCE_RUN_DIR;
    assert.ok(runDir&&isAbsolute(runDir)&&resolve(runDir)===runDir);
    const record=JSON.parse(readFileSync(join(runDir,'run.json'),'utf8'));
    assert.match(record.id,/^[a-f0-9]{24}$/);assert.equal(runDir,join(resolve('data/local-resource-runs'),record.id));
    const container=`once-os-test-pg-${record.id}`,label=`io.once.test-run=${record.id}`;
    assert.equal(record.containers.length,1);
    assert.deepEqual(record.containers[0],{name:container,label,creation:'CONFIRMED'});
    const raw=process.env.DATABASE_URL_TEST;assert.ok(raw);const source=new URL(raw);
    assert.ok(['postgres:','postgresql:'].includes(source.protocol));assert.equal(source.hostname,'127.0.0.1');
    assert.ok(/^\d+$/.test(source.port));assert.equal(source.username,'once_test');assert.ok(source.password);
    assert.equal(source.pathname,`/once_test_${record.id}`);assert.equal(source.search,'');assert.equal(source.hash,'');
    const inspected=command('docker',['inspect','--format',
      '{{ index .Config.Labels "io.once.test-run" }}|{{ index .Config.Labels "io.once.lifecycle" }}|{{ .State.Running }}',container]).stdout.trim();
    assert.equal(inspected,`${record.id}|temporary|true`);
    assert.equal(command('docker',['port',container,'5432/tcp']).stdout.trim(),`127.0.0.1:${source.port}`);
    head=command('git',['rev-parse','HEAD']).stdout.trim();assert.match(head,/^[a-f0-9]{40}$/);
    command('git',['merge-base','--is-ancestor',baseline,head]);
    assert.equal(command('git',['rev-parse',`${legacy}^{commit}`]).stdout.trim(),legacy);
    command('git',['diff','--quiet',legacy,head,'--','prisma']);
    assert.equal(command('git',['status','--porcelain=v1','--untracked-files=all','--','prisma']).stdout.trim(),'');
    dirty=!!command('git',['status','--porcelain=v1','--untracked-files=all','--',...currentPaths]).stdout.trim();

    const evidenceRoot=process.env.ONCE_ACCEPTANCE_EVIDENCE_DIR;
    assert.ok(evidenceRoot&&isAbsolute(evidenceRoot)&&resolve(evidenceRoot)===evidenceRoot);
    mkdirSync(evidenceRoot,{recursive:true,mode:0o700});const resultDir=join(evidenceRoot,`stop-mixed-${record.id}`);
    mkdirSync(resultDir,{mode:0o700});evidenceFile=join(resultDir,'result.json');
    owned=registeredTemp({short:true});const temp=owned.path;
    const baseEnv={PATH:process.env.PATH??'/usr/local/bin:/usr/bin:/bin',
      ...(process.env.HOME?{HOME:process.env.HOME}:{}),...(process.env.LANG?{LANG:process.env.LANG}:{}),
      ...(process.env.TMPDIR?{TMPDIR:process.env.TMPDIR}:{})};

    phase='extract-unchanged-legacy-core';
    const tree=command('git',['ls-tree','-r',legacy,'--','packages/core']).stdout;
    assert.ok(tree.length>0);assert.ok(!tree.split('\n').some(line=>line.startsWith('120000 ')));
    const archive=join(temp,'legacy.tar'),legacyRoot=join(temp,'legacy');mkdirSync(legacyRoot,{mode:0o700});
    command('git',['archive','--format=tar','--output='+archive,legacy,'packages/core']);
    command('tar',['--extract','--file',archive,'--directory',legacyRoot,'--no-same-owner','--no-same-permissions'],baseEnv);
    symlinkSync(realpathSync('node_modules'),join(legacyRoot,'node_modules'),'dir');
    for(const path of ['packages/core/src/api.ts','packages/core/src/commands.ts',
      'packages/core/src/talent-portal.ts','packages/core/src/talent-maintenance-routes.ts']){
      const archived=readFileSync(join(legacyRoot,path));
      const original=command('git',['show',`${legacy}:${path}`]).stdout;
      const archivedHash=createHash('sha256').update(archived).digest('hex');
      assert.equal(archivedHash,createHash('sha256').update(original).digest('hex'));
      legacyHashes[path]=archivedHash;
    }
    observations.legacy_source={actualGitCommit:true,unchangedKeySourceFiles:true,schemaMatchesCurrentCommit:true};
    result('IN_PROGRESS');

    phase='create-owned-mixed-database';
    const targetName=`once_test_stop_mixed_${record.id}`,target=new URL(raw);target.pathname='/'+targetName;
    assert.match(targetName,/^once_test_stop_mixed_[a-f0-9]{24}$/);
    const adminUrl=new URL(raw);adminUrl.pathname='/postgres';
    admin=new PrismaClient({datasources:{db:{url:adminUrl.href}},log:[]});
    assert.equal((await admin.$queryRawUnsafe('SELECT datname FROM pg_database WHERE datname = $1',targetName)).length,0);
    const dbRecord=join(runDir,`database-${targetName}.json`);
    writeFileSync(dbRecord,JSON.stringify({name:targetName,container,status:'CREATE_ATTEMPTED',cleanup:'OWNING_CONTAINER'}),{mode:0o600,flag:'wx'});
    await admin.$executeRawUnsafe(`CREATE DATABASE "${targetName}"`);
    writeFileSync(dbRecord,JSON.stringify({name:targetName,container,status:'CREATED',cleanup:'OWNING_CONTAINER'}),{mode:0o600});
    client=new PrismaClient({datasources:{db:{url:target.href}},log:[]});
    assert.equal((await client.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).length,0);
    command('pnpm',['db:deploy'],{...baseEnv,DATABASE_URL:target.href,DATABASE_URL_TEST:target.href});

    phase='synthetic-current-stop';
    const {PrismaStore}=await import('../../apps/api/src/prisma-store.ts');
    const {SafetyJournalWriter}=await import('../../apps/api/src/recovery/safety-journal.ts');
    const {stagingFixture}=await import('../support/media-staging.ts');
    const {Client,result:body}=await import('../support/fixtures.ts');
    const store=new PrismaStore(client),f=await stagingFixture(store,false);
    // At stop creation, only the current synthetic writer exists. The old
    // writer is instantiated afterwards to model a rollback/old writer rejoin.
    f.app.config.portalCommandStopEnabled=true;
    const writer=await SafetyJournalWriter.open(join(temp,'mixed-journal.jsonl'));
    f.app.safetyIntent=writer;f.app.portal.sink=writer;
    const key=randomUUID(),account=f.a.accountId,submission=f.submissionId;
    const headers={'x-once-talent-account':account,'idempotency-key':key};
    const prior=await client.talentSubmission.findUniqueOrThrow({where:{id:submission}});
    const stop=await f.a.client.raw('POST',`/portal/commands/${key}/stop`,{},headers);
    assert.equal(stop.status,200);assert.equal(body(stop).resourceId,account);
    const current=await f.a.client.raw('POST',`/portal/submissions/${submission}/withdraw`,{expectedRevision:prior.revision},headers);
    assert.equal(current.status,409);assert.equal(body(current).error.code,'PORTAL_COMMAND_STOPPED');
    assert.equal((await client.talentSubmission.findUniqueOrThrow({where:{id:submission}})).revision,prior.revision);
    observations.current_writer={stopStatus:stop.status,lateCommandStatus:current.status,
      lateCommandCode:'PORTAL_COMMAND_STOPPED',submissionRevisionUnchanged:true};result('IN_PROGRESS');

    phase='old-writer-rejoins';
    const {Application:LegacyApplication}=await import(pathToFileURL(join(legacyRoot,'packages/core/src/api.ts')).href);
    const oldApp=new LegacyApplication(store,f.app.config,f.clock,writer);
    const oldClient=new Client(oldApp);oldClient.jar={...f.a.client.jar};oldClient.csrf=f.a.client.csrf;
    const late=await oldClient.raw('POST',`/portal/submissions/${submission}/withdraw`,{expectedRevision:prior.revision},headers);
    assert.equal(late.status,200);
    const after=await client.talentSubmission.findUniqueOrThrow({where:{id:submission}});
    assert.equal(after.state,'WITHDRAWN');assert.equal(after.revision,prior.revision+1);
    const receipts=await client.commandReceipt.findMany({where:{workspaceId:after.workspaceId,talentAccountId:account,commandKey:key}});
    assert.equal(receipts.length,2);
    assert.ok(receipts.some(r=>r.operation==='portal.command.stop'&&r.resourceId===account));
    assert.ok(receipts.some(r=>r.operation==='portal.submission.withdraw'&&r.resourceId===submission));
    const ambiguous=await f.a.client.raw('GET',`/portal/commands/${key}/stop`,undefined,headers);
    assert.equal(ambiguous.status,409);assert.equal(body(ambiguous).error.code,'PENDING_STATUS_AMBIGUOUS');
    observations.old_writer_rejoin={legacyLateCommandStatus:late.status,realDatabaseState:after.state,
      oneRevisionIncrement:true,sameAccountAndKeyReceipts:receipts.length,
      currentStatusReadHttp:ambiguous.status,currentStatusCode:'PENDING_STATUS_AMBIGUOUS'};
    result('PASS',{finding:'OLD_WRITER_CAN_EXECUTE_AFTER_STOP_IF_REINTRODUCED',
      commands:['git archive 2e327e0 packages/core','pnpm db:deploy on registered empty sibling database'],
      scope:'This negative control intentionally reintroduces an old writer after stop creation; it is not an authorized deployment configuration.'});
    console.log(JSON.stringify({status:'PASS',finding:'OLD_WRITER_CAN_EXECUTE_AFTER_STOP_IF_REINTRODUCED'}));
  }catch(error){
    try{result('HARNESS_FAILURE',{phase,errorType:error?.name??'Error'});}catch{}
    console.error('Mixed-writer scenario did not finish; inspect redacted evidence.');process.exitCode=1;
  }finally{
    try{await client?.$disconnect();}finally{try{await admin?.$disconnect();}finally{owned?.cleanup();}}
  }
}
