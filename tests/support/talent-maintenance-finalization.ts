import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Application} from '../../packages/core/src/api.ts';
import {AppError} from '../../packages/core/src/errors.ts';
import {Client,result,sourceInput} from './fixtures.ts';
import {FaultStore} from './fault-store.ts';
import {loginTalent} from './talent-auth.ts';
import type {maintenanceFixture} from './talent-maintenance.ts';

type Fixture=Awaited<ReturnType<typeof maintenanceFixture>>;
type TalentLogin=Awaited<ReturnType<typeof loginTalent>>;
const version='once-talent-text-v1';
const consentVersion='internal-directory-2026-10-v1';
const items=[
 {clientItemKey:'name',field:'displayName',text:'Anna self',dependencyGroup:'name',dependsOn:[]},
 {clientItemKey:'intro',field:'intro',text:'finalization approved self text',dependencyGroup:'intro',dependsOn:[]}
];
const expect=async(response:ReturnType<Client['raw']>,status=200)=>{const r=await response;assert.equal(r.status,status,JSON.stringify(r.body));return result(r);};
const error=async(response:ReturnType<Client['raw']>,code:string)=>{const r=await expect(response,409);assert.equal(r.error.code,code);};
const headers=(a:TalentLogin)=>({'x-once-talent-account':a.accountId,'idempotency-key':randomUUID()});

/** Identical domain requests/assertions run on MemoryStore and actual PostgreSQL. */
export async function verifyMaintenanceFinalization(f:Fixture,grantId:string,existing?:TalentLogin){
 await f.owner.login();const a=existing??await loginTalent(f,'Anna@example.com'),checks:string[]=[];
 const snapshot=()=>f.store.transaction(async tx=>({
  submissions:await tx.find('talentSubmissions'),items:await tx.find('talentSubmissionItems'),
  claims:await tx.find('talentClaims'),invitations:await tx.find('talentInvitations'),
  people:await tx.find('people'),sources:await tx.find('sources'),history:await tx.find('sourceHistory'),
  grants:await tx.find('talentAccessGrants'),attribution:await tx.find('sourceAttributions'),basis:await tx.find('sourceUseBases'),
  receipts:await tx.find('receipts'),audits:await tx.find('audits')
 }));
 const createdReviewer=await expect(f.owner.raw('POST','/memberships',{loginName:'final-reviewer',displayName:'合成第二审核人',role:'ADMIN',extraPermissions:[]}),201);
 const reviewer=new Client(f.app,'192.0.2.45');await expect(reviewer.activate(createdReviewer.activationToken));await expect(reviewer.login('final-reviewer'));
 let selfSourceId='';
 for(const [state,acceptedKeys] of [['APPROVED',['name','intro']],['PARTIALLY_APPROVED',['name']],['REJECTED',[]]] as const){
  const draft=await expect(a.client.raw('POST','/portal/submissions',{schemaVersion:version,grantId,consentTextVersion:consentVersion,consentAccepted:true,items},headers(a)));
  await expect(a.client.raw('POST','/portal/submissions/'+draft.resourceId+'/submit',{expectedRevision:1},headers(a)));
  const path='/talent-submissions/'+draft.resourceId+'/decide',key=randomUUID(),body={expectedRevision:2,acceptedKeys:[...acceptedKeys],publicReason:'合成终态审核验证'};
  const first=await expect(f.owner.cmd('POST',path,body,key));assert.equal(first.replayed,false);
  const current=(await f.store.transaction(tx=>tx.get('talentSubmissions',draft.resourceId)))!;assert.equal(current.state,state);
  const before=await snapshot();const replay=await expect(f.owner.cmd('POST',path,body,key));assert.deepEqual(replay,{...first,replayed:true});
  await error(f.owner.cmd('POST',path,body),'SUBMISSION_CLOSED');
  await error(f.owner.cmd('POST',path,{...body,expectedRevision:current.revision,acceptedKeys:acceptedKeys.length?[]:['name','intro'],publicReason:'合成不同决定'}),'SUBMISSION_CLOSED');
  await error(f.owner.cmd('POST',path,{...body,publicReason:'同键不同请求'},key),'IDEMPOTENCY_KEY_CONFLICT');
  await error(reviewer.cmd('POST',path,body,key),'SUBMISSION_CLOSED');
  assert.deepEqual(await snapshot(),before,'replay and closed review cannot append receipts/audits or change business data');
  checks.push(state.toLowerCase()+'-original-key-replays-new-key-same-or-different-decision-closed');
  if(state==='APPROVED')selfSourceId=(await f.store.transaction(tx=>tx.find('sourceAttributions',{submissionId:draft.resourceId})))[0]!.sourceId;
 }
 checks.push('review-replay-bound-to-principal-and-request-digest-no-extra-success-audit');
 const self=(await f.store.transaction(tx=>tx.get('sources',selfSourceId)))!;assert.ok(self.internalUseUntil);
 const beforeSource=await snapshot();
 for(const textPayload of ['INTERNAL_MATERIAL_MUST_USE_SEPARATE_SOURCE',''])await error(f.owner.cmd('PATCH','/sources/'+self.id,{expectedRevision:self.revision,textPayload}),'TALENT_BASIS_SCOPED');
 assert.deepEqual(await snapshot(),beforeSource,'blocked raw text cannot change source/history/audit/receipt');
 const independent=await expect(f.owner.cmd('POST','/sources',sourceInput()),201);
 await expect(f.owner.cmd('PATCH','/sources/'+independent.resourceId,{expectedRevision:1,textPayload:'INTERNAL_MATERIAL_IN_INDEPENDENT_SOURCE'}));
 assert.equal((await f.store.transaction(tx=>tx.get('sources',independent.resourceId)))!.textPayload,'INTERNAL_MATERIAL_IN_INDEPENDENT_SOURCE');
 checks.push('self-submission-source-rejects-text-payload-including-empty-independent-source-allowed');

 // An approved ENROLL keeps its Claim on forked maintenance submissions. Rejecting a
 // later edit must not rewrite that already-approved ownership decision.
 const enrolled=await loginTalent(f,'Other@example.com');
 const enrolledClaim=(await f.store.transaction(tx=>tx.find('talentClaims',{talentAccountId:enrolled.accountId,state:'APPROVED',kind:'ENROLL'})))[0]!;
 const original=(await f.store.transaction(tx=>tx.find('talentSubmissions',{claimId:enrolledClaim.id,state:'APPROVED'})))[0]!;
 const fork=await expect(enrolled.client.raw('POST','/portal/submissions/'+original.id+'/fork',{expectedRevision:original.revision},headers(enrolled)));
 await expect(enrolled.client.raw('POST','/portal/submissions/'+fork.resourceId+'/submit',{expectedRevision:1},headers(enrolled)));
 await expect(f.owner.cmd('POST','/talent-submissions/'+fork.resourceId+'/decide',{expectedRevision:2,acceptedKeys:[],publicReason:'本次后续维护不予采纳'}));
 assert.deepEqual(await f.store.transaction(tx=>tx.get('talentClaims',enrolledClaim.id)),enrolledClaim);
 assert.equal((await f.store.transaction(tx=>tx.get('talentAccessGrants',original.grantId!)))!.state,'ACTIVE');
 await expect(enrolled.client.raw('GET','/portal/profiles/'+original.personId,undefined,headers(enrolled)));
 checks.push('rejected-followup-to-approved-enroll-keeps-existing-claim-and-grant');

 const applicant=await loginTalent(f,'RejectedEnroll@example.com');
 const invite=await expect(f.owner.cmd('POST','/talent-invitations',{purpose:'ENROLL',scopeId:f.scopeId,maxUses:1,exposureFields:[]}));
 const issued=await expect(f.owner.raw('POST','/talent-invitations/'+invite.resourceId+'/issue',{expectedRevision:1}));
 const fragment=new URLSearchParams(new URL(issued.url).hash.slice(1));
 const context=await expect(applicant.client.raw('POST','/portal/invitations/exchange',{invitationId:invite.resourceId,token:fragment.get('t')},{'x-once-portal':'1'}));
 const claim=await expect(applicant.client.raw('POST','/portal/claims',{contextId:context.contextId,relation:'SELF',applicantKey:'SELF',adultDeclared:true},headers(applicant)));
 const rejectedText='REJECTED_ENROLL_PRIVATE_DRAFT',ownershipBasis='合成独立核对：申请材料不足，本批全部拒绝并终结归属申请';
 const draft=await expect(applicant.client.raw('POST','/portal/submissions',{schemaVersion:version,claimId:claim.resourceId,consentTextVersion:consentVersion,consentAccepted:true,items:[{...items[0],text:rejectedText}]},headers(applicant)));
 await expect(applicant.client.raw('POST','/portal/submissions/'+draft.resourceId+'/submit',{expectedRevision:1},headers(applicant)));
 const path='/talent-submissions/'+draft.resourceId+'/decide',key=randomUUID(),body={expectedRevision:2,acceptedKeys:[],publicReason:'请重新准备资料后申请',ownershipBasis};
 const fault=new FaultStore(f.store),faultApp=new Application(fault,f.app.config,f.clock),faultOwner=new Client(faultApp);faultOwner.jar={...f.owner.jar};faultOwner.csrf=f.owner.csrf;
 fault.afterInsert=(table,row)=>{if(table==='audits'&&'action' in row&&row.action==='talent.submission.decide')throw new AppError(503,'SYNTHETIC_AUDIT_FAILURE','synthetic enrollment rejection rollback');};
 const beforeReject=await snapshot();await expect(faultOwner.cmd('POST',path,body,key),503);assert.deepEqual(await snapshot(),beforeReject);
 const first=await expect(f.owner.cmd('POST',path,body,key));
 const rejected=(await f.store.transaction(tx=>tx.get('talentClaims',claim.resourceId)))!,inv=(await f.store.transaction(tx=>tx.get('talentInvitations',invite.resourceId)))!;
 const actor=await expect(f.owner.raw('GET','/me'));
 assert.equal(rejected.state,'REJECTED');assert.equal(rejected.reserved,false);assert.equal(rejected.decidedAt,f.clock.now().toISOString());assert.equal(rejected.decidedById,actor.membershipId);assert.equal(rejected.ownershipBasis,ownershipBasis);
 assert.equal(inv.reservedCount,0);assert.equal(inv.usedCount,0);
 assert.deepEqual(await f.store.transaction(tx=>tx.find('talentAccessGrants',{claimId:rejected.id})),[]);
 assert.deepEqual(await f.store.transaction(tx=>tx.find('sourceAttributions',{submissionId:draft.resourceId})),[]);
 assert.deepEqual((await snapshot()).people,beforeReject.people,'rejected enrollment creates no Person');
 const afterReject=await snapshot();assert.deepEqual(await expect(f.owner.cmd('POST',path,body,key)),{...first,replayed:true});
 await error(f.owner.cmd('POST',path,body),'SUBMISSION_CLOSED');assert.deepEqual(await snapshot(),afterReject);
 // Released quota can be used by a new application; it does not reopen the rejected Claim.
 const next=await expect(applicant.client.raw('POST','/portal/claims',{contextId:context.contextId,relation:'SELF',applicantKey:'SELF',adultDeclared:true},headers(applicant)));assert.notEqual(next.resourceId,rejected.id);
 const fallbackDraft=await expect(applicant.client.raw('POST','/portal/submissions',{schemaVersion:version,claimId:next.resourceId,consentTextVersion:consentVersion,consentAccepted:true,items:[{...items[0],text:rejectedText}]},headers(applicant)));
 await expect(applicant.client.raw('POST','/portal/submissions/'+fallbackDraft.resourceId+'/submit',{expectedRevision:1},headers(applicant)));
 await expect(f.owner.cmd('POST','/talent-submissions/'+fallbackDraft.resourceId+'/decide',{expectedRevision:2,acceptedKeys:[],publicReason:''}));
 const fallback=(await f.store.transaction(tx=>tx.get('talentClaims',next.resourceId)))!;assert.equal(fallback.state,'REJECTED');assert.equal(fallback.decidedById,actor.membershipId);assert.ok(fallback.decidedAt);assert.ok(fallback.ownershipBasis.includes(fallbackDraft.resourceId));assert.equal((await f.store.transaction(tx=>tx.get('talentInvitations',invite.resourceId)))!.reservedCount,0);
 checks.push('enroll-total-rejection-atomic-claim-decision-provenance-and-reservation-release');
 checks.push('enroll-rejection-audit-failure-rolls-back-claim-quota-submission-and-receipt');
 checks.push('enroll-rejection-without-optional-basis-records-linked-internal-decision');
 return {checks,enrolled,rejectedClaim:rejected,rejectedSubmissionId:draft.resourceId,rejectedText,ownershipBasis};
}
