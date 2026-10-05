import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Application} from '../../packages/core/src/api.ts';
import {AppError} from '../../packages/core/src/errors.ts';
import type {Store} from '../../packages/core/src/store.ts';
import {Client,result} from './fixtures.ts';
import {FaultStore} from './fault-store.ts';
import {testAuthConfig} from './talent-auth.ts';
import {aiBusinessFixture} from './ai-business.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';

type Context={app:Application;store:Store;owner:Client};
const schemaVersion='once-talent-v2.1.0';

/** Real ENROLL, consent and review commands; no invented typed-source/grant rows. */
export async function seedSelfOrigin(f:Context,displayName='本人建档合成人才'){
 f.app.config.talentAuth??=testAuthConfig();let code='';
 f.app.portal.auth.provider={async send(input){code=input.code;return 'ACCEPTED';}};
 const client=new Client(f.app),context=ok(await client.raw('POST','/portal/auth/context',{purpose:'LOGIN'},{'x-once-portal':'1'}),200);client.csrf=context.csrfToken;
 const challenge=ok(await client.raw('POST','/portal/auth/challenges',{contextId:context.contextId,purpose:'LOGIN',kind:'EMAIL',identity:randomUUID()+'@example.test'}),200);
 const login=ok(await client.raw('POST','/portal/auth/verify',{contextId:context.contextId,challengeId:challenge.id,purpose:'LOGIN',code}),200);client.csrf=login.csrfToken;
 const headers=()=>({'x-once-talent-account':login.talentAccountId,'idempotency-key':randomUUID()});
 const member=ok(await f.owner.raw('GET','/me'),200),scope=ok(await f.owner.cmd('POST','/scopes',{name:'合成身份审核 '+randomUUID().slice(0,8),membershipIds:[member.membershipId]}));
 const invitation=ok(await f.owner.cmd('POST','/talent-invitations',{purpose:'ENROLL',scopeId:scope.resourceId,exposureFields:[],maxUses:1}),200);
 const issued=ok(await f.owner.raw('POST',`/talent-invitations/${invitation.resourceId}/issue`,{expectedRevision:1}),200),token=new URLSearchParams(new URL(issued.url).hash.slice(1)).get('t');
 const exchange=ok(await client.raw('POST','/portal/invitations/exchange',{invitationId:invitation.resourceId,token},{'x-once-portal':'1'}),200);
 const claim=ok(await client.raw('POST','/portal/claims',{contextId:exchange.contextId,relation:'SELF',applicantKey:'SELF',adultDeclared:true},headers()),200);
 const items=[{clientItemKey:'name',field:'displayName',text:displayName,dependencyGroup:'identity',dependsOn:[]},{clientItemKey:'aliases',field:'aliases',aliases:['本人原别名'],dependencyGroup:'identity',dependsOn:[]},{clientItemKey:'intro',field:'intro',text:'本人原简介',dependencyGroup:'intro',dependsOn:[]}];
 const submission=ok(await client.raw('POST','/portal/submissions',{schemaVersion:'once-talent-text-v1',claimId:claim.resourceId,consentTextVersion:'internal-directory-2026-10-v1',consentAccepted:true,items},headers()),200);
 ok(await client.raw('POST',`/portal/submissions/${submission.resourceId}/submit`,{expectedRevision:1},headers()),200);
 ok(await f.owner.cmd('POST',`/talent-submissions/${submission.resourceId}/decide`,{expectedRevision:2,acceptedKeys:['name','aliases','intro'],publicReason:'合成建档审核',createPerson:true,ownershipBasis:'合成独立归属确认',guardianConfirmed:false}),200);
 const grant=(await f.store.transaction(tx=>tx.find('talentAccessGrants',{claimId:claim.resourceId})))[0]!;
 const person=(await f.store.transaction(tx=>tx.get('people',grant.personId)))!;
 assert.ok((await f.store.transaction(tx=>tx.get('sources',person.sourceId)))!.internalUseUntil);
 return {person,grant,client,headers};
}

/** Shared MemoryStore/PostgreSQL transaction and provenance acceptance. */
export async function verifyBusinessIdentity(f:Context){
 const t=await aiBusinessFixture(f),self=await seedSelfOrigin(f),id=self.person.id,path=`/td2/people/${id}`;
 const person=()=>f.store.transaction(tx=>tx.get('people',id));
 const originalSource=(await f.store.transaction(tx=>tx.get('sources',self.person.sourceId)))!;
 assert.equal(ok(await f.owner.raw('GET',`/sources/${originalSource.id}`),200).allowsInternalAuthoring,false);
 for(const [url,input] of [[path,{schemaVersion,expectedRevision:1,intro:'不得直接覆写'}],[`/people/${id}`,{expectedRevision:1,intro:'不得直接覆写'}]] as const){const r=await f.owner.cmd('PATCH',url,input);assert.equal(r.status,409);assert.equal(result(r).error.code,'TALENT_BASIS_SCOPED');}
 const proposal=ok(await f.owner.cmd('POST','/td2/proposals',{schemaVersion,ownerKind:'person',ownerId:id,fieldPath:'intro',expectedRevision:1,sourceId:t.source,sourceRevision:1,proposedValue:'员工独立材料简介'}));
 assert.equal((await person())!.intro,'本人原简介');
 ok(await f.owner.cmd('POST',`/td2/proposals/${proposal.resourceId}/decide`,{schemaVersion,expectedRevision:1,decision:'APPLY'}),200);
 assert.equal((await person())!.intro,'员工独立材料简介');
 assert.ok((await f.store.transaction(tx=>tx.find('evidence',{personId:id,sourceId:t.source,fieldPath:'intro'}))).some(e=>!!e.reviewedAt&&!!e.reviewerId));
 const job=await t.create({...t.input,subjectId:id,expectedRevision:2});
 await t.dispatch(job,[{field:'displayName',value:'独立 AI 建议姓名',evidence:t.evidence},{field:'intro',value:'独立 AI 建议简介',evidence:t.evidence},{field:'aliases',value:['未选的 AI 别名'],evidence:t.evidence}]);
 const task=ok(await f.owner.raw('GET',`/ai-jobs/${job}`),200),body={expectedRevision:task.revision,selectedFields:['displayName','intro']},key=randomUUID();
 const snapshot=()=>f.store.transaction(async tx=>({person:await tx.get('people',id),evidence:await tx.find('evidence',{personId:id}),task:await tx.get('aiTasks',job),receipts:await tx.find('receipts',{commandKey:key})}));
 const before=await snapshot(),fault=new FaultStore(f.store),originalApp=f.owner.app;
 fault.afterInsert=table=>{if(table==='audits'){fault.afterInsert=null;throw new AppError(503,'AUDIT_FAULT','synthetic identity audit failure');}};
 f.owner.app=new Application(fault,f.app.config,f.app.clock);
 try{
  assert.equal((await f.owner.cmd('POST',`/proposals/${job}/apply`,body,key)).status,503);
  assert.deepEqual(await snapshot(),before,'identity, field evidence, task and receipt roll back together');
  ok(await f.owner.cmd('POST',`/proposals/${job}/apply`,body,key),200);
  assert.equal(ok(await f.owner.cmd('POST',`/proposals/${job}/apply`,body,key),200).replayed,true);
 }finally{f.owner.app=originalApp;}
 const adopted=(await person())!;assert.equal(adopted.revision,3);assert.equal(adopted.sourceId,originalSource.id);assert.equal(adopted.displayName,'独立 AI 建议姓名');assert.equal(adopted.intro,'独立 AI 建议简介');assert.deepEqual(adopted.aliases,['本人原别名']);
 const evidence=await f.store.transaction(tx=>tx.find('evidence',{personId:id,sourceId:t.source}));
 assert.equal(evidence.filter(e=>!e.reviewedAt&&!e.reviewerId).length,2,'AI adoption is not source review');
 assert.equal((await f.store.transaction(tx=>tx.find('audits',{resourceId:job,action:'ai.apply'}))).length,1);
 assert.deepEqual(await f.store.transaction(tx=>tx.get('sources',originalSource.id)),originalSource);
 const archive={schemaVersion,expectedRevision:3,status:'ARCHIVED'};ok(await f.owner.cmd('PATCH',path,archive),200);
 const archived=(await person())!;assert.equal(archived.protectionEpoch,adopted.protectionEpoch+1);
 assert.equal(ok(await f.owner.raw('GET',path),200).canEdit,true);
 assert.equal((await self.client.raw('GET',`/portal/profiles/${id}`,undefined,self.headers())).status,404);
 assert.deepEqual(await f.store.transaction(tx=>tx.get('talentAccessGrants',self.grant.id)),self.grant,'archiving does not revoke the grant');
 for(const extra of [{status:'DRAFT'},{status:'ACTIVE',intro:'不能混入修改'}])assert.equal((await f.owner.cmd('PATCH',path,{schemaVersion,expectedRevision:4,...extra})).status,409);
 assert.equal((await f.owner.cmd('PATCH',`/people/${id}`,{expectedRevision:4,status:'ACTIVE',intro:'不能混入修改'})).status,409);
 assert.equal((await f.owner.cmd('PATCH',path,{schemaVersion,expectedRevision:3,status:'ACTIVE'})).status,409);
 const restoreKey=randomUUID(),restore={schemaVersion,expectedRevision:4,status:'ACTIVE'};
 fault.afterInsert=table=>{if(table==='audits'){fault.afterInsert=null;throw new AppError(503,'AUDIT_FAULT','synthetic restore audit failure');}};f.owner.app=new Application(fault,f.app.config,f.app.clock);
 try{assert.equal((await f.owner.cmd('PATCH',path,restore,restoreKey)).status,503);assert.deepEqual(await person(),archived);ok(await f.owner.cmd('PATCH',path,restore,restoreKey),200);assert.equal(ok(await f.owner.cmd('PATCH',path,restore,restoreKey),200).replayed,true);}finally{f.owner.app=originalApp;}
 const restored=(await person())!;assert.equal(restored.status,'ACTIVE');assert.equal(restored.revision,5);assert.equal(restored.protectionEpoch,adopted.protectionEpoch+2,'never reset the media protection epoch');
 assert.deepEqual(await f.store.transaction(tx=>tx.get('talentAccessGrants',self.grant.id)),self.grant);
 assert.deepEqual(await f.store.transaction(tx=>tx.get('sources',originalSource.id)),originalSource);
 ok(await self.client.raw('GET',`/portal/profiles/${id}`,undefined,self.headers()),200);
 ok(await f.owner.cmd('PATCH',path,{schemaVersion,expectedRevision:5,status:'ARCHIVED'}),200);
 ok(await f.owner.cmd('POST',`/talent-grants/${self.grant.id}/revoke`,{expectedRevision:self.grant.revision}),200);
 const revoked=await f.store.transaction(tx=>tx.get('talentAccessGrants',self.grant.id));
 ok(await f.owner.cmd('PATCH',path,{schemaVersion,expectedRevision:6,status:'ACTIVE'}),200);
 assert.deepEqual(await f.store.transaction(tx=>tx.get('talentAccessGrants',self.grant.id)),revoked,'restoring never revives an explicitly revoked grant');
 assert.equal((await self.client.raw('GET',`/portal/profiles/${id}`,undefined,self.headers())).status,404);
 ok(await f.owner.cmd('PATCH',path,{schemaVersion,expectedRevision:7,status:'ARCHIVED'}),200);
 ok(await f.owner.cmd('POST',`/sources/${originalSource.id}/suspend`,{expectedRevision:1,reason:'合成恢复前来源失效'}),200);
 assert.equal((await f.owner.cmd('PATCH',path,{schemaVersion,expectedRevision:8,status:'ACTIVE'})).status,404);assert.equal((await person())!.status,'ARCHIVED');
 f.app.config.mediaEnabled=true;
 const upload=ok(await f.owner.cmd('POST','/uploads',{sourceId:t.source,expectedSourceRevision:1,personId:t.person,fileName:'synthetic-epoch.png',mime:'image/png',expectedBytes:12,sha256:'a'.repeat(64)}));
 ok(await f.owner.cmd('PATCH',`/td2/people/${t.person}`,{schemaVersion,expectedRevision:1,status:'ARCHIVED'}),200);
 ok(await f.owner.cmd('PATCH',`/people/${t.person}`,{expectedRevision:2,status:'ACTIVE'}),200);
 const oldUpload=await f.owner.cmd('POST',`/uploads/${upload.resourceId}/renew`,{expectedRevision:1});assert.equal(oldUpload.status,409);assert.equal(result(oldUpload).error.code,'MEDIA_CONTEXT_CHANGED');
 return ['typed-origin-direct-patch-denied-independent-reviewed-field-proposal','typed-origin-ai-selected-fields-one-revision-unreviewed-evidence-original-source-retained','ai-audit-fault-rollback-and-same-key-replay','archive-narrow-restore-cas-rollback-replay-grant-source-preserved-protection-epoch-monotonic','restore-never-revives-revoked-grant','suspended-source-cannot-restore','legacy-narrow-restore-rejects-old-upload-epoch'];
}
