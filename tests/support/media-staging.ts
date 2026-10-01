import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import type {Store} from '../../packages/core/src/store.ts';
import type {TalentActor} from '../../packages/core/src/talent-auth-model.ts';
import {maintenanceFixture} from './talent-maintenance.ts';
import {result} from './fixtures.ts';
import {loadTalentGraph} from '../../packages/core/src/talent-v2-graph.ts';
import {transferFormalAsset} from '../../packages/core/src/media-transfer.ts';
import {readyAsset} from '../../packages/core/src/production-policy.ts';
import {MEDIA_CONSENT_VERSION} from '../../packages/core/src/media-validation.ts';
export async function stagingFixture(store:Store,bound=true){
 const f=await maintenanceFixture(store);f.app.config.mediaEnabled=true;f.app.media.config.mediaEnabled=true;
 const expect=async(p:Promise<any>,status=200)=>{const r=await p;assert.equal(r.status,status,JSON.stringify(r.body));return result(r);};
 const headers=(key=randomUUID())=>({'x-once-talent-account':f.a.accountId,'idempotency-key':key});
 const invite=await expect(f.owner.cmd('POST','/talent-invitations',{purpose:bound?'CLAIM':'ENROLL',...(bound?{targetPersonId:f.personId}:{}),scopeId:f.scopeId,exposureFields:[]}));
 const issued=await expect(f.owner.raw('POST','/talent-invitations/'+invite.resourceId+'/issue',{expectedRevision:1}));
 const params=new URLSearchParams(new URL(issued.url).hash.slice(1));const ctx=await expect(f.a.client.raw('POST','/portal/invitations/exchange',{invitationId:invite.resourceId,token:params.get('t')},{'x-once-portal':'1'}));
 const claim=await expect(f.a.client.raw('POST','/portal/claims',{contextId:ctx.contextId,relation:'SELF',applicantKey:'SELF',adultDeclared:true},headers()));
 let grantId:string|undefined;
 if(bound){await expect(f.owner.cmd('POST','/talent-claims/'+claim.resourceId+'/decide',{expectedRevision:1,decision:'APPROVE',ownershipBasis:'合成媒体本人归属确认',guardianConfirmed:false}));grantId=(await store.transaction(tx=>tx.find('talentAccessGrants',{talentAccountId:f.a.accountId})))[0]!.id;}
 const items=[{clientItemKey:'name',field:'displayName',text:'Anna media',dependencyGroup:'identity',dependsOn:[]},{clientItemKey:'aliases',field:'aliases',aliases:[],dependencyGroup:'identity',dependsOn:[]},{clientItemKey:'intro',field:'intro',text:'本人媒体提交',dependencyGroup:'identity',dependsOn:[]}];
 const draft=await expect(f.a.client.raw('POST','/portal/submissions',{schemaVersion:'once-talent-text-v1',...(grantId?{grantId}:{claimId:claim.resourceId}),consentTextVersion:'internal-directory-2026-10-v1',consentAccepted:true,items},headers()));
 await expect(f.a.client.raw('POST','/portal/submissions/'+draft.resourceId+'/media-consent',{expectedRevision:1,textVersion:MEDIA_CONSENT_VERSION,accepted:true},headers()));
 const actor:TalentActor={actorKind:'TALENT',workspaceId:(await store.transaction(tx=>tx.find('workspaces')))[0]!.id,talentAccountId:f.a.accountId,sessionId:'',sessionEpoch:1};
 const revision=async()=> (await store.transaction(tx=>tx.get('talentSubmissions',draft.resourceId)))!.revision;
 const create=async(extra={})=>expect(f.a.client.raw('POST','/portal/uploads',{context:{kind:'TALENT_SUBMISSION',submissionId:draft.resourceId},expectedSubmissionRevision:await revision(),fileName:'owned.jpg',mime:'image/jpeg',expectedBytes:100,sha256:'a'.repeat(64),...extra},headers()));
 return {...f,expect,headers,actor,grantId,claimId:claim.resourceId,submissionId:draft.resourceId,revision,create};
}
/** Core lifecycle unit driver; real byte decoding and asynchronous worker are separate acceptance tests. */
export const unitOriginal=Buffer.alloc(100,1),unitPreview=Buffer.alloc(50,2);
const unitHash=createHash('sha256').update(unitOriginal).digest('hex'),unitPreviewHash=createHash('sha256').update(unitPreview).digest('hex');
export async function unitReady(f:Awaited<ReturnType<typeof stagingFixture>>,extra:Record<string,unknown>={}){
 const upload=await f.create({sha256:unitHash,...extra}),id=upload.resourceId;
 const receiving=await f.store.transaction(tx=>f.app.media.beginReceive(tx,f.actor,id,100));
 await f.store.transaction(tx=>f.app.media.finishReceive(tx,f.actor,id,receiving.receiveToken!,100,unitHash));
 const row=(await f.store.transaction(tx=>tx.get('uploads',id)))!;
 await f.expect(f.a.client.raw('POST','/portal/uploads/'+id+'/complete',{expectedRevision:row.revision},f.headers()));
 const claim=await f.app.media.claim();assert.equal(claim?.id,id);
 await f.app.media.finish(claim!,{bytes:100,sha256:unitHash,mime:'image/jpeg',width:10,height:10,previewBytes:50,previewHash:unitPreviewHash});
 return id;
}
export async function stagingScenario(store:Store,bound=true){
 const f=await stagingFixture(store,bound),role=bound?(await store.transaction(tx=>tx.find('personRoles',{personId:f.personId,status:'ACTIVE'})))[0]:null;
 const id=await unitReady(f,role?{context:{kind:'TALENT_SUBMISSION',submissionId:f.submissionId,personRoleId:role.id}}:{}),checks:string[]=[];
 const a=(await store.transaction(tx=>tx.get('assets',id)))!,u=(await store.transaction(tx=>tx.get('uploads',id)))!;
 assert.equal(a.state,'READY');assert.equal(a.usageState,'STAGED');assert.equal(a.sourceId,null);assert.equal(u.actorId,null);assert.equal(u.talentAccountId,f.a.accountId);checks.push('real-principal-and-ready-staged-orthogonal');
 await store.transaction(tx=>f.app.media.staged(tx,f.actor,id));
 await assert.rejects(store.transaction(tx=>f.app.media.staged(tx,{...f.actor,talentAccountId:f.b.accountId},id)));checks.push('cross-account-staged-read-denied');
 assert.equal((await f.owner.raw('GET','/assets/'+id)).status,404);assert.ok(!(await f.expect(f.owner.raw('GET','/assets'))).items.some((a:any)=>a.id===id));checks.push('staged-hidden-from-ordinary-assets');
 const detail=await f.expect(f.owner.raw('GET','/td2/people/'+f.personId)),directory=await f.expect(f.owner.raw('POST','/directory/talents/search',{}));assert.ok(!JSON.stringify(detail).includes(id));assert.ok(!JSON.stringify(directory).includes(id));
 await store.transaction(async tx=>{const actor=await f.app.identity.authenticate(tx,f.owner.jar.once_session!);assert.equal((await loadTalentGraph(tx,actor,f.clock)).assetReadable(id),false);await assert.rejects(readyAsset(tx,actor,id,f.clock));await assert.rejects(transferFormalAsset(tx,a));});checks.push('staged-hidden-from-td2-directory-work-candidate-policy-and-business-transfer');
 await f.expect(f.a.client.raw('POST','/portal/submissions/'+f.submissionId+'/submit',{expectedRevision:await f.revision()},f.headers()));
 const late=await f.a.client.raw('POST','/portal/uploads',{context:{kind:'TALENT_SUBMISSION',submissionId:f.submissionId},expectedSubmissionRevision:await f.revision(),fileName:'late.jpg',mime:'image/jpeg',expectedBytes:100,sha256:'a'.repeat(64)},f.headers());assert.equal(late.status,409);assert.equal((late.body as any).error.code,'SUBMISSION_IMMUTABLE');checks.push('submitted-freezes-media-membership');
 const body={expectedRevision:await f.revision(),acceptedKeys:['name','aliases','intro','media_'+id],publicReason:'采纳本批资料',...(!bound?{createPerson:true,ownershipBasis:'合成加入独立归属确认',guardianConfirmed:false}:{})};
 await f.expect(f.owner.cmd('POST','/talent-submissions/'+f.submissionId+'/decide',body));
 const adopted=(await store.transaction(tx=>tx.get('assets',id)))!,relation=(await store.transaction(tx=>tx.find('personMedia',{assetId:id})))[0]!;
 assert.equal(adopted.usageState,'ADOPTED');assert.equal(adopted.sha256,a.sha256);assert.equal(adopted.sourceId,null);assert.equal(relation.usageState,'ADOPTED');assert.equal(relation.personRoleId,role?.id??null);assert.ok(relation.sourceId);assert.ok(relation.personId);assert.equal((await store.transaction(tx=>tx.get('uploads',id)))!.talentAccountId,u.talentAccountId);checks.push('atomic-adoption-preserves-asset-id-hash-uploader-origin');
 const dto=await f.expect(f.owner.raw('GET','/assets/'+id));assert.equal(dto.sourceId,relation.sourceId);assert.equal(dto.originSourceId,null);assert.equal(dto.personId,relation.personId);checks.push('formal-source-relation-allows-multi-source');
 return {f,id,checks,relation};
}
import {FaultStore} from './fault-store.ts';
import {AppError} from '../../packages/core/src/errors.ts';
import {revokePersonMaintenance} from '../../packages/core/src/talent-maintenance-lifecycle.ts';
import {isolateTalentAuth} from '../../packages/core/src/talent-auth.ts';
export async function stagingSecurityScenario(inner:Store){
 const store=new FaultStore(inner),f=await stagingFixture(store),id=await unitReady(f),checks:string[]=[];
 const bad=await f.a.client.raw('POST','/portal/uploads',{context:{kind:'TALENT_SUBMISSION',submissionId:f.submissionId},expectedSubmissionRevision:await f.revision(),fileName:'reference.jpg',mime:'image/jpeg',expectedBytes:100,sha256:'a'.repeat(64),assetId:id},f.headers());assert.equal(bad.status,400);checks.push('unknown-fields-no-existing-asset-reference');
 const employee=await f.expect(f.owner.raw('POST','/memberships',{loginName:'media-reviewer',displayName:'合成无范围审核人',role:'REVIEWER',extraPermissions:['talent.review']}),201);
 const {Client}=await import('./fixtures.ts'),reviewer=new Client(f.app,'192.0.2.90');await f.expect(reviewer.activate(employee.activationToken));await f.expect(reviewer.login('media-reviewer'));
 // Scope is not implied by the reviewer role.
 const readAs=()=>f.app.authenticated({method:'GET',url:'/api/v1/talent-staged-assets/'+id+'/preview',ip:'test',headers:{cookie:Object.entries(reviewer.jar).map(([k,v])=>k+'='+v).join('; ')}},'assets.read',(tx,actor)=>f.app.media.staged(tx,actor,id));
 await assert.rejects(readAs());checks.push('review-permission-does-not-bypass-intake-scope');
 await f.expect(f.a.client.raw('POST','/portal/submissions/'+f.submissionId+'/submit',{expectedRevision:await f.revision()},f.headers()));
 const body={expectedRevision:await f.revision(),acceptedKeys:['media_'+id],publicReason:'仅采纳媒体'},key=randomUUID();
 const snapshot=()=>store.transaction(async tx=>({assets:await tx.find('assets'),relations:await tx.find('personMedia'),sources:await tx.find('sources'),submissions:await tx.find('talentSubmissions'),items:await tx.find('talentSubmissionItems'),audits:await tx.find('audits'),receipts:await tx.find('receipts')}));
 const before=await snapshot();let fired=false;store.afterInsert=(table,row)=>{if(table==='audits'&&'action' in row&&row.action==='talent.submission.decide'){fired=true;throw new AppError(503,'SYNTHETIC_AUDIT_FAILURE','synthetic media audit rollback');}};
 assert.equal((await f.owner.cmd('POST','/talent-submissions/'+f.submissionId+'/decide',body,key)).status,503);assert.ok(fired);assert.deepEqual(await snapshot(),before);store.afterInsert=null;
 await f.expect(f.owner.cmd('POST','/talent-submissions/'+f.submissionId+'/decide',body,key));checks.push('adoption-audit-failure-rolls-back-source-relation-state-receipt');
 const relation=(await store.transaction(tx=>tx.find('personMedia',{assetId:id})))[0]!,source=(await store.transaction(tx=>tx.get('sources',relation.sourceId!)))!;
 await f.expect(f.owner.raw('GET','/assets/'+id));await f.expect(f.owner.cmd('POST','/sources/'+source.id+'/suspend',{expectedRevision:source.revision,reason:'合成：独立媒体来源撤回'}));assert.equal((await f.owner.raw('GET','/assets/'+id)).status,404);await f.expect(f.owner.raw('GET','/people/'+f.personId));checks.push('media-source-B-revoked-person-primary-A-remains-readable');
 // A second batch is legal; revoked grant must terminate subsequent worker claims and staged reads.
 const draft=await f.expect(f.a.client.raw('POST','/portal/submissions',{schemaVersion:'once-talent-text-v1',grantId:f.grantId,consentTextVersion:'internal-directory-2026-10-v1',consentAccepted:true,items:[{clientItemKey:'intro',field:'intro',text:'新材料',dependencyGroup:'intro',dependsOn:[]}]},f.headers()));
 await f.expect(f.a.client.raw('POST','/portal/submissions/'+draft.resourceId+'/media-consent',{expectedRevision:1,textVersion:MEDIA_CONSENT_VERSION,accepted:true},f.headers()));
 const queued=await f.expect(f.a.client.raw('POST','/portal/uploads',{context:{kind:'TALENT_SUBMISSION',submissionId:draft.resourceId},expectedSubmissionRevision:2,fileName:'queued.jpg',mime:'image/jpeg',expectedBytes:100,sha256:'a'.repeat(64)},f.headers()));
 const receive=await store.transaction(tx=>f.app.media.beginReceive(tx,f.actor,queued.resourceId,100));await store.transaction(tx=>f.app.media.finishReceive(tx,f.actor,receive.id,receive.receiveToken!,100,'a'.repeat(64)));
 const uploaded=(await store.transaction(tx=>tx.get('uploads',receive.id)))!;await f.expect(f.a.client.raw('POST','/portal/uploads/'+receive.id+'/complete',{expectedRevision:uploaded.revision},f.headers()));
 const grant=(await store.transaction(tx=>tx.get('talentAccessGrants',f.grantId!)))!;await f.expect(f.owner.cmd('POST','/talent-grants/'+grant.id+'/revoke',{expectedRevision:grant.revision}));assert.equal(await f.app.media.claim(),null);assert.equal((await store.transaction(tx=>tx.get('uploads',receive.id)))!.state,'FAILED');assert.equal(await store.transaction(tx=>tx.get('assets',receive.id)),null);checks.push('grant-revocation-stops-real-worker-claim-before-asset');
 await assert.rejects(store.transaction(tx=>f.app.media.staged(tx,f.actor,id)));checks.push('grant-revocation-denies-self-read');
 return {f,checks,id};
}
export async function exportStagingScenario(f:Awaited<ReturnType<typeof stagingFixture>>,assetId:string){
 const relation=(await f.store.transaction(tx=>tx.find('personMedia',{assetId})))[0]!,person=(await f.store.transaction(tx=>tx.get('people',relation.personId!)))!;
 const sourceFields=['source.title','source.type','source.providerClaim','source.basisMode','source.basisDescription','source.validFrom','source.validUntil','source.status'],personFields=['person.displayName','person.aliases','person.intro','person.status','person.td2.talentProfiles','person.td2.personRoles','person.identityEvidence'],refs:string[]=[];
 for(const sourceId of new Set([person.sourceId,relation.sourceId!]))refs.push((await f.expect(f.owner.cmd('POST','/use-permissions',{subjectKind:'SOURCE',subjectId:sourceId,sourceId,fields:[...sourceFields,...personFields.filter(x=>x!=='person.status'),'media.originals'],validUntil:'2026-10-15T00:00:00.000Z',evidenceNote:'合成多来源媒体合法导出验证'}),201)).resourceId);
 refs.push((await f.expect(f.owner.cmd('POST','/use-permissions',{subjectKind:'PERSON',subjectId:person.id,sourceId:person.sourceId,fields:personFields,validUntil:'2026-10-15T00:00:00.000Z',evidenceNote:'合成人物正式资料导出验证'}),201)).resourceId);
 refs.push((await f.expect(f.owner.cmd('POST','/use-permissions',{subjectKind:'ASSET',subjectId:assetId,sourceId:relation.sourceId,fields:['media.originals'],validUntil:'2026-10-15T00:00:00.000Z',evidenceNote:'合成正式媒体原件导出验证'}),201)).resourceId);
 const created=await f.expect(f.owner.cmd('POST','/exports',{format:'JSON',selectedIds:{people:[person.id],works:[],projects:[]},fields:[...sourceFields,...personFields,'media.originals'],usePermissionRefs:refs}),202);
 const claim=await f.app.exports.claim();assert.ok(claim);await f.app.exports.process(claim);const download=await f.expect(f.owner.raw('POST','/exports/'+created.resourceId+'/download',{}));
 assert.equal(download.payload.manifest.talent.assets.length,1);assert.equal(download.payload.manifest.talent.assets[0].relation.origin.talentAccountId,f.a.accountId);assert.equal(download.payload.manifest.talent.assets[0].sourceId,relation.sourceId);return download.payload;
}
import {mergePreview,mergeInput} from './talent-v2-merge.ts';
export async function stagingLifecycleScenario(store:Store,kind:'merge'|'adopted-merge'|'delete'|'expiry'){
 const f=await stagingFixture(store,kind!=='expiry'),id=await unitReady(f),before=(await store.transaction(tx=>tx.get('assets',id)))!;
 if(kind==='adopted-merge'){await f.expect(f.a.client.raw('POST','/portal/submissions/'+f.submissionId+'/submit',{expectedRevision:await f.revision()},f.headers()));await f.expect(f.owner.cmd('POST','/talent-submissions/'+f.submissionId+'/decide',{expectedRevision:await f.revision(),acceptedKeys:['name','aliases','intro','media_'+id],publicReason:'采纳后核对合并'}));}
 if(kind==='merge'||kind==='adopted-merge'){
  const canonical=await f.expect(f.owner.cmd('POST','/td2/people',{schemaVersion:'once-talent-v2.1.0',displayName:'合成主档案',originSourceId:f.sourceId,sourceRevision:1}),201);
  const preview=await mergePreview(store,f.owner,canonical.resourceId,f.personId);assert.equal(preview.complete,true,JSON.stringify(preview));await f.expect(f.owner.cmd('POST','/people/merge',mergeInput(preview)));
  const relation=(await store.transaction(tx=>tx.find('personMedia',{assetId:id})))[0]!;assert.equal(relation.personId,kind==='merge'?f.personId:canonical.resourceId);assert.equal(relation.usageState,kind==='merge'?'STAGED':'ADOPTED');if(kind==='adopted-merge'){await f.expect(f.owner.raw('GET','/assets/'+id));assert.equal((await store.transaction(tx=>tx.get('uploads',id)))!.personId,f.personId);}assert.equal((await store.transaction(tx=>tx.get('assets',id)))!.sha256,before.sha256);await assert.rejects(store.transaction(tx=>f.app.media.staged(tx,f.actor,id)));return {f,id,checks:[kind==='merge'?'actual-merge-keeps-staged-origin-does-not-transfer-to-canonical':'actual-merge-moves-only-adopted-formal-relation-preserves-upload-origin']};
 }
 if(kind==='delete'){
  const p=(await store.transaction(tx=>tx.get('people',f.personId)))!,input={targetKind:'PERSON',targetId:p.id,expectedRevision:p.revision};const preview=await f.expect(f.owner.raw('POST','/deletion-requests/preview',input));assert.equal(preview.complete,true,JSON.stringify(preview.unresolved));
  const r=await f.expect(f.owner.cmd('POST','/deletion-requests',{...input,previewDigest:preview.previewDigest,reason:'合成：删除阻断本人暂存访问'}),201);await f.expect(f.owner.cmd('POST','/deletion-requests/'+r.resourceId+'/block',{expectedRevision:1,previewDigest:preview.previewDigest,acknowledgeBlock:true}));await assert.rejects(store.transaction(tx=>f.app.media.staged(tx,f.actor,id)));assert.equal((await store.transaction(tx=>tx.get('uploads',id)))!.purgedAt,null);return {f,id,checks:['actual-person-deletion-block-denies-own-staged-bytes-capacity-not-released']};
 }
 f.clock.advance(7*86400000+1);await assert.rejects(store.transaction(tx=>f.app.media.staged(tx,f.actor,id)));const upload=await f.store.transaction(tx=>tx.get('uploads',id));assert.equal(upload!.purgedAt,null);return {f,id,checks:['expired-enroll-claim-denies-staged-read-without-faking-physical-cleanup']};
}

export async function stagingWorkerScenario(store:Store,stop:'grant'|'withdraw'|'consent'|'recovery'){
 const f=await stagingFixture(store),ready=await unitReady(f),upload=await f.create(),id=upload.resourceId;
 const r=await store.transaction(tx=>f.app.media.beginReceive(tx,f.actor,id,100));await store.transaction(tx=>f.app.media.finishReceive(tx,f.actor,id,r.receiveToken!,100,'a'.repeat(64)));
 const row=(await store.transaction(tx=>tx.get('uploads',id)))!;await f.expect(f.a.client.raw('POST','/portal/uploads/'+id+'/complete',{expectedRevision:row.revision},f.headers()));
 const claim=await f.app.media.claim();assert.ok(claim);assert.equal(claim.id,id);
 if(stop==='grant'){const g=(await store.transaction(tx=>tx.get('talentAccessGrants',f.grantId!)))!;await f.expect(f.owner.cmd('POST','/talent-grants/'+g.id+'/revoke',{expectedRevision:g.revision}));}
 if(stop==='withdraw')await f.expect(f.a.client.raw('POST','/portal/submissions/'+f.submissionId+'/withdraw',{expectedRevision:await f.revision()},f.headers()));
 if(stop==='consent'){const s=(await store.transaction(tx=>tx.get('talentSubmissions',f.submissionId)))!,c=(await store.transaction(tx=>tx.get('talentConsents',s.consentId)))!;await f.expect(f.a.client.raw('POST','/portal/consents/'+c.id+'/revoke',{expectedRevision:c.revision},f.headers()));}
 if(stop==='recovery')f.app.media.config.recoveryEpoch='synthetic-new-recovery-epoch-'+randomUUID();
 await assert.rejects(f.app.media.heartbeat(claim));await assert.rejects(f.app.media.finish(claim,{bytes:100,sha256:'a'.repeat(64),mime:'image/jpeg',width:10,height:10,previewBytes:50,previewHash:'b'.repeat(64)}));
 assert.equal(await store.transaction(tx=>tx.get('assets',id)),null);await assert.rejects(store.transaction(tx=>f.app.media.staged(tx,f.actor,ready)));assert.equal((await store.transaction(tx=>tx.get('assets',ready)))!.usageState,'STAGED');assert.equal((await store.transaction(tx=>tx.get('uploads',ready)))!.purgedAt,null);
 return {checks:[stop+'-after-worker-claim-denies-heartbeat-finish-and-existing-staged-read-without-fake-purge']};
}
export async function stagingConcurrencyScenario(store:Store){
 const f=await stagingFixture(store),body={context:{kind:'TALENT_SUBMISSION',submissionId:f.submissionId},expectedSubmissionRevision:await f.revision(),fileName:'concurrent.jpg',mime:'image/jpeg',expectedBytes:100,sha256:'a'.repeat(64)},key=randomUUID();
 const results=await Promise.all([1,2].map(()=>f.a.client.raw('POST','/portal/uploads',body,f.headers(key))));assert.ok(results.every(r=>r.status===200),JSON.stringify(results.map(r=>r.body)));assert.equal(result(results[0]!).resourceId,result(results[1]!).resourceId);assert.equal((await store.transaction(tx=>tx.find('uploads'))).length,1);
 const other={...body,expectedSubmissionRevision:await f.revision()};const raced=await Promise.all([1,2].map(()=>f.a.client.raw('POST','/portal/uploads',other,f.headers())));assert.deepEqual(raced.map(r=>r.status).sort(),[200,409]);assert.equal((await store.transaction(tx=>tx.find('uploads'))).length,2);
 return {checks:['concurrent-same-key-single-upload-replayed','concurrent-new-keys-submission-cas-prevents-double-membership']};
}
