import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ResourceRun} from '../../scripts/resource-run.mjs';
import {RecoveryOps} from '../../packages/core/src/recovery.ts';
import {hashSecret} from '../../packages/core/src/crypto.ts';
import {digest} from '../../packages/core/src/json.ts';
import {AppError} from '../../packages/core/src/errors.ts';
import type {CommandReceipt} from '../../packages/core/src/model.ts';
import type {RecoveryApprovalEvidence,RecoveryCheckReport,RecoveryRun} from '../../packages/core/src/recovery-model.ts';
import {MemoryStore} from '../support/memory-store.ts';
import {authFixture,loginTalent} from '../support/talent-auth.ts';
import {FakeClock} from '../support/fixtures.ts';

// No PostgreSQL, filesystem journal, network, or real credentials are used. Each
// mutation is a deliberate post-inspection change to this test's own MemoryStore.
// These checks cannot prove that a restore was complete before inspection.
const resource=new ResourceRun();
after(async t=>{resource.record.outcome='TESTS_COMPLETED';const result=await resource.cleanup();assert.equal(result.status,'ZERO_RESIDUE');t.diagnostic('ResourceRun '+resource.id+': '+result.status);});
const meta=()=>({requestId:randomUUID(),ip:'synthetic'});
const HOLD='RECOVERY_TRUST_EVIDENCE_UNAVAILABLE';
const emptyDigest=digest([]);
const external=()=>({migrationDigest:'d'.repeat(64),migrationMatch:true,media:{provider:'disabled' as const,identityDigest:emptyDigest,backupIdentityDigest:emptyDigest,expectedAssetIds:[],verifiedAssetIds:[],missingAssetIds:[],mismatchAssetIds:[]}});

function approvalEvidence(run:RecoveryRun,report:RecoveryCheckReport):RecoveryApprovalEvidence{
 const sequence=7,head='e'.repeat(64);
 const deltaResolution={schemaVersion:'once-recovery-delta-v1' as const,backupSequence:sequence,currentSequence:sequence,postBackupEntries:0,resolved:0,unresolved:0,items:[]};
 return {schemaVersion:'once-recovery-approval-v1',backupId:randomUUID(),backupManifestDigest:'a'.repeat(64),databaseSha256:'b'.repeat(64),recoveryEpochDigest:run.sourceEpochDigest,contactKeyDigest:report.contactKeyDigest,migrationDigest:report.migrationDigest,mediaIdentityDigest:report.media.backupIdentityDigest,reportDigest:run.reportDigest!,deltaResolutionDigest:digest(deltaResolution),deltaResolution,safetyJournal:{journalId:randomUUID(),backupSequence:sequence,backupHeadHash:head,currentSequence:sequence,currentHeadHash:head,postBackupEntries:0}};
}

type FixtureScenario='none'|'same-account'|'other-account'|'replay'|'nonstandard-key'|'bad-request-digest'|'bad-owner'|'bad-resource'|'bad-result-target'|'bad-state'|'bad-revision'|'bad-operation-id';
async function inspectedFixture(collision:FixtureScenario='none'){
 const store=new MemoryStore(),f=await authFixture(store),a=await loginTalent(f,'synthetic-a@example.invalid'),b=await loginTalent(f,'synthetic-b@example.invalid');
 f.app.config.portalCommandStopEnabled=true;
 const originalKey=randomUUID();
 if(collision==='same-account'){
  const original=await a.client.raw('POST','/portal/auth/revoke-other-sessions',{}, {'x-once-talent-account':a.accountId,'idempotency-key':originalKey});
  assert.equal(original.status,200,'synthetic original command must commit before the stop');
 }
 const key=collision==='nonstandard-key'?'a'.repeat(36):randomUUID(),headers={'x-once-talent-account':a.accountId,'idempotency-key':key};
 const response=await a.client.raw('POST','/portal/commands/'+key+'/stop',{},headers);
 assert.equal(response.status,200,'synthetic portal stop must commit through the real command path');
 if(collision==='replay'){
  const replay=await a.client.raw('POST','/portal/commands/'+key+'/stop',{},headers);
  assert.equal(replay.status,200);assert.equal((replay.body as {replayed?:boolean}).replayed,true);
 }
 if(collision==='same-account'){
  const original=store.rows('receipts').find(row=>row.talentAccountId===a.accountId&&row.commandKey===originalKey&&row.operation==='portal.sessions.revoke');assert.ok(original);
  // Simulate a restore or old writer which allowed a same-principal same-key collision.
  await store.transaction(tx=>tx.insert('receipts',{...original,id:randomUUID(),commandKey:key}));
 }
 if(collision==='other-account'){
  const original=await b.client.raw('POST','/portal/auth/revoke-other-sessions',{}, {'x-once-talent-account':b.accountId,'idempotency-key':key});
  assert.equal(original.status,200,'different talent principal may legitimately reuse the key');
 }
 const stops=store.rows('receipts').filter(row=>row.operation==='portal.command.stop'&&row.commandKey===key);
 assert.equal(stops.length,1);let stop=stops[0]!;
 assert.equal(stop.principalKind,'TALENT');assert.equal(stop.talentAccountId,a.accountId);assert.equal(stop.resourceId,a.accountId);
 if(collision.startsWith('bad-')){
  const changed:CommandReceipt=collision==='bad-request-digest'?{...stop,requestDigest:stop.requestDigest==='f'.repeat(64)?'e'.repeat(64):'f'.repeat(64)}
   :collision==='bad-owner'?{...stop,talentAccountId:b.accountId}
   :collision==='bad-resource'?{...stop,resourceId:b.accountId}
   :collision==='bad-result-target'?{...stop,result:{...stop.result,resourceId:b.accountId}}
   :collision==='bad-state'?{...stop,result:{...stop.result,state:'ACCEPTED'}}
   :collision==='bad-revision'?{...stop,result:{...stop.result,revision:0}}
   :{...stop,result:{...stop.result,operationId:'not-a-uuid'}};
  await store.transaction(tx=>tx.replace('receipts',changed));stop=changed;
 }
 assert.equal(store.rows('assets').length,0);
 const ops=new RecoveryOps(f.clock,{accessMode:'MAINTENANCE',dataEgressMode:'DISABLED',dataCleanupMode:'DISABLED',dataMergeMode:'DISABLED',recoveryEpoch:'R'.repeat(48),contactKey:f.app.config.contactKey});
 const actor=await store.transaction(tx=>ops.actorFromRestoredTarget(tx,'owner'));
 const workspace=store.rows('workspaces')[0]!;
 const run=await store.transaction(tx=>ops.prepare(tx,actor,hashSecret(workspace.recoveryEpoch),meta()));
 const check=await store.transaction(tx=>ops.check(tx,actor,run.id,external()));
 const report=await store.transaction(tx=>ops.inspect(tx,actor,run.id,external(),meta()));
 assert.ok(check.blockers.includes(HOLD));assert.ok(report.blockers.includes(HOLD));
 if(collision==='same-account'){assert.ok(check.blockers.includes('PORTAL_STOP_RECEIPT_AMBIGUOUS'));assert.ok(report.blockers.includes('PORTAL_STOP_RECEIPT_AMBIGUOUS'));}
 else if(collision.startsWith('bad-')){assert.ok(check.blockers.includes('PORTAL_STOP_RECEIPT_INVALID'));assert.ok(report.blockers.includes('PORTAL_STOP_RECEIPT_INVALID'));}
 else{assert.deepEqual(check.blockers,[HOLD]);assert.deepEqual(report.blockers,[HOLD]);}
 assert.equal(report.databaseStateDigest,check.databaseStateDigest,'recording inspection must preserve the checked state');
 const inspected=store.rows('recoveryRuns').find(row=>row.id===run.id)!;assert.equal(inspected.state,'INSPECTED');
 assert.deepEqual(store.rows('receipts').filter(row=>row.id===stop.id),[stop],'recovery preparation must retain the fence');
 return {f,store,ops,actor,run:inspected,report,stop,accountB:b.accountId,oldEpoch:workspace.recoveryEpoch};
}

function approvalState(f:Awaited<ReturnType<typeof inspectedFixture>>){
 return {workspaces:f.store.rows('workspaces'),runs:f.store.rows('recoveryRuns'),
  audits:f.store.rows('audits'),receipts:f.store.rows('receipts')};
}
async function assertTrustHoldWithoutWrite(f:Awaited<ReturnType<typeof inspectedFixture>>,evidence:RecoveryApprovalEvidence){
 const before=approvalState(f);
 await assert.rejects(f.store.transaction(tx=>f.ops.approve(tx,f.actor,f.run.id,external(),evidence,meta())),
  (error:unknown)=>error instanceof AppError&&error.code===HOLD&&error.status===409);
 assert.deepEqual(approvalState(f),before,'refusal must not write even when local checks are clean');
 assert.equal(f.store.rows('workspaces')[0]!.recoveryEpoch,f.oldEpoch);
 assert.equal(f.store.rows('recoveryRuns').find(row=>row.id===f.run.id)?.state,'INSPECTED');
 assert.equal(f.store.rows('audits').some(row=>row.action==='recovery.approve'),false);
}

type Mutation={name:string;approvalError:'RECOVERY_CHECK_STALE'|'RECOVERY_BLOCKERS_PRESENT';apply:(f:Awaited<ReturnType<typeof inspectedFixture>>)=>Promise<void>};
const mutations:Mutation[]=[
 {name:'delete a stop receipt',approvalError:'RECOVERY_CHECK_STALE',apply:async f=>{await f.store.transaction(tx=>tx.remove('receipts',f.stop.id));}},
 {name:'change the stopped command key consistently',approvalError:'RECOVERY_CHECK_STALE',apply:async f=>{const key=randomUUID();await f.store.transaction(tx=>tx.replace('receipts',{...f.stop,commandKey:key,requestDigest:digest({operation:'portal.command.stop',targetId:key,input:{}})}));}},
 {name:'change the owning talent account consistently',approvalError:'RECOVERY_CHECK_STALE',apply:async f=>{await f.store.transaction(tx=>tx.replace('receipts',{...f.stop,talentAccountId:f.accountB,resourceId:f.accountB,result:{...f.stop.result,resourceId:f.accountB}}));}},
 {name:'change the stop request digest inconsistently',approvalError:'RECOVERY_BLOCKERS_PRESENT',apply:async f=>{await f.store.transaction(tx=>tx.replace('receipts',{...f.stop,requestDigest:f.stop.requestDigest==='f'.repeat(64)?'e'.repeat(64):'f'.repeat(64)}));}},
 {name:'change the stop result identity inconsistently',approvalError:'RECOVERY_BLOCKERS_PRESENT',apply:async f=>{await f.store.transaction(tx=>tx.replace('receipts',{...f.stop,result:{...f.stop.result,resourceId:f.accountB}}));}},
 {name:'change the result operation ID to another valid value',approvalError:'RECOVERY_CHECK_STALE',apply:async f=>{await f.store.transaction(tx=>tx.replace('receipts',{...f.stop,result:{...f.stop.result,operationId:randomUUID()}}));}},
 {name:'change the result revision to another positive value',approvalError:'RECOVERY_CHECK_STALE',apply:async f=>{await f.store.transaction(tx=>tx.replace('receipts',{...f.stop,result:{...f.stop.result,revision:f.stop.result.revision+1}}));}},
 {name:'change stop metadata',approvalError:'RECOVERY_CHECK_STALE',apply:async f=>{await f.store.transaction(tx=>tx.replace('receipts',{...f.stop,updatedAt:new Date(Date.parse(f.stop.updatedAt)+1000).toISOString()}));}},
 {name:'insert another stop receipt',approvalError:'RECOVERY_CHECK_STALE',apply:async f=>{const key=randomUUID();await f.store.transaction(tx=>tx.insert('receipts',{...f.stop,id:randomUUID(),commandKey:key,requestDigest:digest({operation:'portal.command.stop',targetId:key,input:{}}),result:{...f.stop.result,operationId:randomUUID()}}));}}
];

test('zero stop receipts preserve the 89744a2 recovery safety digest',async()=>{
 const store=new MemoryStore(),clock=new FakeClock(),workspaceId='11111111-1111-4111-8111-111111111111',userId='22222222-2222-4222-8222-222222222222',membershipId='33333333-3333-4333-8333-333333333333',createdAt=clock.now().toISOString();
 await store.transaction(async tx=>{
  await tx.insert('workspaces',{id:workspaceId,name:'synthetic',createdAt,recoveryEpoch:'S'.repeat(48)});
  await tx.insert('users',{id:userId,workspaceId,createdAt,updatedAt:createdAt,revision:1,loginName:'owner',displayName:'synthetic',passwordHash:null,status:'ACTIVE',sessionEpoch:1});
  await tx.insert('memberships',{id:membershipId,workspaceId,createdAt,updatedAt:createdAt,revision:1,userId,role:'ADMIN',extraPermissions:[],status:'ACTIVE'});
 });
 const ops=new RecoveryOps(clock,{accessMode:'MAINTENANCE',dataEgressMode:'DISABLED',dataCleanupMode:'DISABLED',dataMergeMode:'DISABLED',recoveryEpoch:'R'.repeat(48),contactKey:Buffer.alloc(32,9)});
 const actor=await store.transaction(tx=>ops.actorFromRestoredTarget(tx,'owner'));
 const run=await store.transaction(tx=>ops.prepare(tx,actor,hashSecret('S'.repeat(48)),meta()));
 assert.equal(store.rows('receipts').length,0);
 const report=await store.transaction(tx=>ops.check(tx,actor,run.id,external()));assert.deepEqual(report.blockers,[HOLD]);
 assert.equal(report.databaseStateDigest,'2ee5e1b7ea6ca4fc7ec0eafdfb3313ebc16de7e2418b62c8855792aea2fb799f');
});

test('a preexisting same-principal same-key stop and original block recovery approval',async()=>{
 const f=await inspectedFixture('same-account'),evidence=approvalEvidence(f.run,f.report);
 assert.ok(f.report.blockers.includes('PORTAL_STOP_RECEIPT_AMBIGUOUS'));
 assert.ok(!JSON.stringify(f.report).includes(f.stop.commandKey));assert.ok(!JSON.stringify(f.report).includes(f.stop.requestDigest));
 await assert.rejects(f.store.transaction(tx=>f.ops.approve(tx,f.actor,f.run.id,external(),evidence,meta())),
  (error:unknown)=>error instanceof AppError&&error.code==='RECOVERY_BLOCKERS_PRESENT');
 assert.equal(f.store.rows('workspaces')[0]!.recoveryEpoch,f.oldEpoch);assert.equal(f.store.rows('recoveryRuns').find(row=>row.id===f.run.id)?.state,'INSPECTED');
});

test('a different talent principal reusing the key does not create a false collision but remains held',async()=>{
 const f=await inspectedFixture('other-account'),evidence=approvalEvidence(f.run,f.report);
 assert.deepEqual(f.report.blockers,[HOLD]);
 await assertTrustHoldWithoutWrite(f,evidence);
});

for(const scenario of ['bad-request-digest','bad-owner','bad-resource','bad-result-target','bad-state','bad-revision','bad-operation-id'] as const){
 test('a preexisting structurally invalid stop ('+scenario+') blocks check and approval',async()=>{
  const f=await inspectedFixture(scenario),evidence=approvalEvidence(f.run,f.report);
  assert.ok(f.report.blockers.includes('PORTAL_STOP_RECEIPT_INVALID'));
  assert.ok(!JSON.stringify(f.report).includes(f.stop.commandKey));
  await assert.rejects(f.store.transaction(tx=>f.ops.approve(tx,f.actor,f.run.id,external(),evidence,meta())),
   (error:unknown)=>error instanceof AppError&&error.code==='RECOVERY_BLOCKERS_PRESENT');
  assert.equal(f.store.rows('workspaces')[0]!.recoveryEpoch,f.oldEpoch);assert.equal(f.store.rows('recoveryRuns').find(row=>row.id===f.run.id)?.state,'INSPECTED');
 });
}

for(const scenario of ['replay','nonstandard-key'] as const){
 test('a legitimate stop ('+scenario+') retains its receipt and remains held',async()=>{
  const f=await inspectedFixture(scenario),evidence=approvalEvidence(f.run,f.report);
  assert.deepEqual(f.report.blockers,[HOLD]);
  await assertTrustHoldWithoutWrite(f,evidence);
 });
}

// A valid synthetic zero-delta case is locally well formed but cannot prove an
// independent latest witness or authorize the actual recovery approval.
test('unchanged inspected stop remains held even with synthetic zero-delta evidence',async()=>{
 const f=await inspectedFixture(),evidence=approvalEvidence(f.run,f.report);
 await assertTrustHoldWithoutWrite(f,evidence);
 assert.equal(f.store.rows('receipts').filter(row=>row.id===f.stop.id).length,1);
});

test('catching the trust refusal inside a committed transaction cannot preserve approval writes',async()=>{
 const f=await inspectedFixture(),evidence=approvalEvidence(f.run,f.report),before=approvalState(f);
 let refused=false;
 await f.store.transaction(async tx=>{
  try{await f.ops.approve(tx,f.actor,f.run.id,external(),evidence,meta());assert.fail('approval unexpectedly succeeded');}
  catch(error){assert.ok(error instanceof AppError);assert.equal(error.code,HOLD);assert.equal(error.status,409);refused=true;}
 });
 assert.equal(refused,true);
 assert.deepEqual(approvalState(f),before,'a caller swallowing the error must not commit any approval mutation');
 assert.equal(f.store.rows('workspaces')[0]!.recoveryEpoch,f.oldEpoch);
 assert.equal(f.store.rows('recoveryRuns').find(row=>row.id===f.run.id)?.state,'INSPECTED');
 assert.equal(f.store.rows('audits').some(row=>row.action==='recovery.approve'),false);
});

for(const mutation of mutations){
 test('post-inspection '+mutation.name+' changes the safety state digest',async()=>{
  const f=await inspectedFixture();await mutation.apply(f);
  const changed=await f.store.transaction(tx=>f.ops.check(tx,f.actor,f.run.id,external()));
  assert.notEqual(changed.databaseStateDigest,f.report.databaseStateDigest,'the checked stop-fence state must bind the recorded digest');
  assert.ok(changed.blockers.includes(HOLD));
  if(mutation.approvalError==='RECOVERY_BLOCKERS_PRESENT')assert.ok(changed.blockers.includes('PORTAL_STOP_RECEIPT_INVALID'));
  else assert.deepEqual(changed.blockers,[HOLD]);
  assert.equal(f.store.rows('recoveryRuns').find(row=>row.id===f.run.id)?.state,'INSPECTED');
 });
 test('post-inspection '+mutation.name+' rejects approval with '+mutation.approvalError,async()=>{
  const f=await inspectedFixture(),evidence=approvalEvidence(f.run,f.report);await mutation.apply(f);
  await assert.rejects(f.store.transaction(tx=>f.ops.approve(tx,f.actor,f.run.id,external(),evidence,meta())),
   (error:unknown)=>error instanceof AppError&&error.code===mutation.approvalError,'mutated stop receipt must invalidate old approval evidence');
  assert.equal(f.store.rows('workspaces')[0]!.recoveryEpoch,f.oldEpoch);assert.equal(f.store.rows('recoveryRuns').find(row=>row.id===f.run.id)?.state,'INSPECTED');
  assert.equal(f.store.rows('audits').some(row=>row.action==='recovery.approve'),false);
 });
}
