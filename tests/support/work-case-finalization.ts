import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Store} from '../../packages/core/src/store.ts';
import {AppError} from '../../packages/core/src/errors.ts';
import {WORK_CONSENT_VERSION} from '../../packages/core/src/work-consent.ts';
import {MEDIA_CONSENT_VERSION} from '../../packages/core/src/media-validation.ts';
import {workCaseScenario} from './work-cases.ts';
import {unitReady} from './media-staging.ts';
export async function workFinalizationScenario(inner:Store,legacy:boolean){
 const {f,store,asset,plan}=await workCaseScenario(inner);
 const created=await f.expect(f.owner.cmd('POST','/works',{title:'员工先建立的共享案例',sourceId:f.sourceId,description:'不能被本人稿件覆盖',origin:'EXTERNAL'}),201);
 let revision=(await f.expect(f.owner.cmd('POST','/works/'+created.resourceId+'/assets',{expectedRevision:1,assetId:asset}))).revision;
 revision=(await f.expect(f.owner.cmd('POST','/works/'+created.resourceId+'/credits',{expectedRevision:revision,personId:f.personId,roleCode:'model',note:'员工核实的原始署名说明'}))).revision;
 revision=(await f.expect(f.owner.cmd('PATCH','/works/'+created.resourceId,{expectedRevision:revision,status:'ACTIVE'}))).revision;
 const old=(await inner.transaction(tx=>tx.find('workCredits',{workId:created.resourceId})))[0]!,role=(await inner.transaction(tx=>tx.get('personRoles',plan.personRoleId!)))!;
 const upgrade=async()=>{
  const source=(await inner.transaction(tx=>tx.get('sources',f.sourceId)))!,current=(await inner.transaction(tx=>tx.get('works',created.resourceId)))!;
  const input={expectedRevision:current.revision,creditId:old.id,expectedCreditRevision:old.revision,personRoleId:role.id,expectedRoleRevision:role.revision,sourceId:source.id,sourceRevision:source.revision},key=randomUUID();
  await f.expect(f.owner.cmd('POST','/works/'+created.resourceId+'/credits/upgrade',{...input,personRoleId:randomUUID()}),404);
  store.afterInsert=t=>{if(t==='audits'){store.afterInsert=null;throw new AppError(503,'AUDIT_FAULT','synthetic');}};
  await f.expect(f.owner.cmd('POST','/works/'+created.resourceId+'/credits/upgrade',input,key),503);assert.deepEqual(await inner.transaction(tx=>tx.get('workCredits',old.id)),old);
  await f.expect(f.owner.cmd('POST','/works/'+created.resourceId+'/credits/upgrade',input,key));assert.equal((await f.expect(f.owner.cmd('POST','/works/'+created.resourceId+'/credits/upgrade',input,key))).replayed,true);
  const exact=(await inner.transaction(tx=>tx.get('workCredits',old.id)))!;assert.equal(exact.note,old.note);assert.equal(exact.personRoleId,role.id);assert.equal(exact.sourceId,source.id);
 };
 if(!legacy)await upgrade();
 // Revoking the new capability after submit must also block review, before any formal writes.
 const deniedDraft=await f.expect(f.a.client.raw('POST','/portal/submissions',{schemaVersion:'once-talent-text-v1',grantId:f.grantId,consentTextVersion:'internal-directory-2026-10-v1',consentAccepted:true,items:[]},f.headers()));
 await f.expect(f.a.client.raw('POST','/portal/submissions/'+deniedDraft.resourceId+'/media-consent',{expectedRevision:1,textVersion:WORK_CONSENT_VERSION,accepted:true},f.headers()));
 await f.expect(f.a.client.raw('POST','/portal/submissions/'+deniedDraft.resourceId+'/works',{expectedRevision:2,works:[{...plan,items:[{referenceKind:'EXISTING_ADOPTED_ASSET_REFERENCE',assetId:asset}]}]},f.headers()));
 await f.expect(f.a.client.raw('POST','/portal/submissions/'+deniedDraft.resourceId+'/submit',{expectedRevision:3},f.headers()));
 const deniedSub=(await inner.transaction(tx=>tx.get('talentSubmissions',deniedDraft.resourceId)))!,deniedConsent=(await inner.transaction(tx=>tx.get('talentConsents',deniedSub.consentId)))!;
 await f.expect(f.a.client.raw('POST','/portal/consents/'+deniedConsent.id+'/revoke',{expectedRevision:deniedConsent.revision},f.headers()));
 const count=(await inner.transaction(tx=>tx.find('works'))).length;
 assert.equal((await f.expect(f.owner.cmd('POST','/talent-submissions/'+deniedDraft.resourceId+'/decide',{expectedRevision:4,acceptedKeys:['case'],publicReason:'已撤回的同意不能继续采纳',workDecisions:[{clientItemKey:'case',decision:'CREATE_NEW',targetWorkId:null,expectedWorkRevision:null,basis:'拒绝撤回同意后的审核'}]}),409)).error.code,'WORK_CONSENT_REQUIRED');
 assert.equal((await inner.transaction(tx=>tx.find('works'))).length,count);

 const draft=await f.expect(f.a.client.raw('POST','/portal/submissions',{schemaVersion:'once-talent-text-v1',grantId:f.grantId,consentTextVersion:'internal-directory-2026-10-v1',consentAccepted:true,items:[]},f.headers()));
 const sid=draft.resourceId,sub=async()=>(await inner.transaction(tx=>tx.get('talentSubmissions',sid)))!,rev=async()=>(await sub()).revision;
 const consent=async(version:string)=>f.expect(f.a.client.raw('POST','/portal/submissions/'+sid+'/media-consent',{expectedRevision:await rev(),textVersion:version,accepted:true},f.headers()));
 await consent(MEDIA_CONSENT_VERSION);
 const b=await unitReady(f,{context:{kind:'TALENT_SUBMISSION',submissionId:sid},expectedSubmissionRevision:await rev(),fileName:'new-independent-B.jpg'});
 const proposal={...plan,mode:'LINK_EXISTING_WORK',targetWorkId:null,expectedWorkRevision:null,title:'本人不同公共事实',creditNote:'不得覆盖原署名',coverAssetId:b,items:[{referenceKind:'SUBMISSION_STAGED_ASSET',assetId:b}]};
 const save=async(status=200)=>f.expect(f.a.client.raw('POST','/portal/submissions/'+sid+'/works',{expectedRevision:await rev(),works:[proposal]},f.headers()),status);
 assert.equal((await save(409)).error.code,'WORK_CONSENT_REQUIRED');const mediaConsentId=(await sub()).consentId,mediaOnly=(await inner.transaction(tx=>tx.get('talentConsents',mediaConsentId)))!;assert.equal(mediaOnly.fieldScope.includes('work'),false);
 await consent(WORK_CONSENT_VERSION);await save();await consent(MEDIA_CONSENT_VERSION);
 assert.equal((await f.expect(f.a.client.raw('POST','/portal/submissions/'+sid+'/submit',{expectedRevision:await rev()},f.headers()),409)).error.code,'WORK_CONSENT_REQUIRED');
 await consent(WORK_CONSENT_VERSION);await f.expect(f.a.client.raw('POST','/portal/submissions/'+sid+'/submit',{expectedRevision:await rev()},f.headers()));
 const body=async()=>({expectedRevision:await rev(),acceptedKeys:['media_'+b,'case'],publicReason:'明确核对已有本人署名，只开放本人查看',workDecisions:[{clientItemKey:'case',decision:'LINK_EXISTING',targetWorkId:created.resourceId,expectedWorkRevision:(await inner.transaction(tx=>tx.get('works',created.resourceId)))!.revision,basis:'独立核实本人职业，保留原案例及署名，媒体单独采纳'}]});
 if(legacy){assert.equal((await f.expect(f.owner.cmd('POST','/talent-submissions/'+sid+'/decide',await body()),409)).error.code,'WORK_CREDIT_UPGRADE_REQUIRED');assert.equal((await inner.transaction(tx=>tx.get('assets',b)))!.usageState,'STAGED');await upgrade();}
 const beforeWork=await inner.transaction(tx=>tx.get('works',created.resourceId)),beforeAssets=await inner.transaction(tx=>tx.find('workAssets',{workId:created.resourceId})),beforeCredit=await inner.transaction(tx=>tx.get('workCredits',old.id));assert.ok(!beforeAssets.some(e=>e.assetId===b));
 const input=await body(),key=randomUUID();store.afterInsert=t=>{if(t==='audits'){store.afterInsert=null;throw new AppError(503,'AUDIT_FAULT','synthetic');}};
 await f.expect(f.owner.cmd('POST','/talent-submissions/'+sid+'/decide',input,key),503);assert.equal((await inner.transaction(tx=>tx.get('assets',b)))!.usageState,'STAGED');
 await f.expect(f.owner.cmd('POST','/talent-submissions/'+sid+'/decide',input,key));assert.equal((await f.expect(f.owner.cmd('POST','/talent-submissions/'+sid+'/decide',input,key))).replayed,true);
 assert.deepEqual(await inner.transaction(tx=>tx.get('works',created.resourceId)),beforeWork);assert.deepEqual(await inner.transaction(tx=>tx.find('workAssets',{workId:created.resourceId})),beforeAssets);assert.deepEqual(await inner.transaction(tx=>tx.get('workCredits',old.id)),beforeCredit);assert.equal((await inner.transaction(tx=>tx.find('workCredits',{workId:created.resourceId}))).length,1);assert.equal((await inner.transaction(tx=>tx.get('assets',b)))!.usageState,'ADOPTED');
 const own=async()=>f.expect(f.a.client.raw('GET','/portal/profiles/'+f.personId+'/works',undefined,{'x-once-talent-account':f.a.accountId}));assert.ok((await own()).works.some((w:any)=>w.id===created.resourceId));
 const finalConsentId=(await sub()).consentId,c=(await inner.transaction(tx=>tx.get('talentConsents',finalConsentId)))!;
 await f.expect(f.a.client.raw('POST','/portal/consents/'+c.id+'/revoke',{expectedRevision:c.revision},f.headers()));assert.equal((await own()).works.some((w:any)=>w.id===created.resourceId),false);assert.deepEqual(await inner.transaction(tx=>tx.get('workCredits',old.id)),beforeCredit);assert.deepEqual(await inner.transaction(tx=>tx.get('works',created.resourceId)),beforeWork);
 return {checks:['media-consent-does-not-authorize-work-save-or-submit','exact-credit-takeover-preserves-id-source-note','LINK-new-B-never-changes-work-assets-cover-facts','independent-B-adopted','review-and-upgrade-audit-rollback-and-exact-replay','grant-work-exposure-revoked-with-consent',...(legacy?['legacy-explicit-upgrade-required-and-internal-upgrade']:[])]};
}
