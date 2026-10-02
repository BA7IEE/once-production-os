import {mediaConsentVersion} from './media-validation.ts';
import {formalRelationReadable} from './formal-media-policy.ts';
import {loadVisibility} from './visibility.ts';
import type {Actor,Clock,Config} from './model.ts';
import type {CommandPrincipal,TalentActor} from './talent-auth-model.ts';
import type {MediaUpload,MediaAsset} from './media-model.ts';
import type {Tx} from './store.ts';
import {mediaUsage} from './media-model.ts';
import {TalentMaintenance} from './talent-maintenance.ts';
import {workspaceRow} from './helpers.ts';
import {invariant,missing} from './errors.ts';
import {deletionBlocked,requireScope,sourceFor,sourceCurrent} from './policy.ts';
import {periodCurrent} from './talent-v2-graph.ts';

export function ownsUpload(actor:CommandPrincipal,u:MediaUpload){
 return actor.actorKind==='TALENT'?u.principalKind==='TALENT'&&u.talentAccountId===actor.talentAccountId:
 actor.actorKind==='MACHINE'?u.principalKind==='MACHINE'&&u.servicePrincipalId===actor.servicePrincipalId:(!u.principalKind||u.principalKind==='INTERNAL')&&u.actorId===actor.membershipId;
}
export function uploaderKey(u:MediaUpload){return `${u.principalKind??'INTERNAL'}:${u.talentAccountId??u.servicePrincipalId??u.actorId}`;}
/** Re-evaluated at every receive/worker stage. A frozen batch can finish no additional file. */
export async function talentUploadContext(tx:Tx,actor:TalentActor,u:MediaUpload,clock:Clock,config:Config,processing=true){
 invariant(ownsUpload(actor,u)&&u.contextKind==='TALENT_SUBMISSION'&&u.submissionId,'MEDIA_CONTEXT_CHANGED','上传主体或提交已变化',409);
 const maintenance=new TalentMaintenance(clock,config),account=await maintenance.account(tx,u.workspaceId,actor.talentAccountId);
 invariant(account.sessionEpoch===u.actorEpoch&&u.recoveryEpoch===config.recoveryEpoch,'MEDIA_CONTEXT_CHANGED','上传资格已变化',409);
 const s=await maintenance.submissionAccess(tx,actor,u.submissionId,true);
 const consent=await tx.get('talentConsents',s.consentId);
 invariant(consent?.talentAccountId===actor.talentAccountId&&consent.state==='ACTIVE'&&mediaConsentVersion(consent.textVersion)&&consent.fieldScope.includes('media')&&consent.validUntil>clock.now().toISOString(),'MEDIA_CONSENT_REQUIRED','媒体使用同意已失效',409);
 const grant=s.grantId?await tx.get('talentAccessGrants',s.grantId):null;const intakeClaim=await tx.get('talentClaims',(grant?.claimId??s.claimId)!);
 invariant(s.recoveryEpoch===config.recoveryEpoch&&(s.personId===u.personId||!processing&&!u.personId&&intakeClaim?.kind==='ENROLL'&&intakeClaim.state==='APPROVED'&&intakeClaim.targetPersonId===s.personId)&&intakeClaim?.scopeId===u.scopeId,'MEDIA_CONTEXT_CHANGED','提交保护范围已变化',409);
 if(processing)invariant(s.state==='DRAFT','SUBMISSION_IMMUTABLE','已提交内容不能新增或替换文件',409);
 else invariant(['DRAFT','SUBMITTED','PARTIALLY_APPROVED','REJECTED','APPROVED'].includes(s.state),'SUBMISSION_CLOSED','提交已终结或撤回',409);
 const scope=await tx.get('scopes',u.scopeId);
 invariant(scope?.revision===u.scopeRevision,'MEDIA_CONTEXT_CHANGED','审核范围已变化',409);
 if(s.personId){
  const p=await maintenance.person(tx,u.workspaceId,s.personId),g=await maintenance.grant(tx,u.workspaceId,actor.talentAccountId,s.grantId!);
  const ps=await tx.get('scopes',p.scopeId);
  invariant(!u.personId||(g.authorizationEpoch===u.grantEpoch&&p.protectionEpoch===u.personEpoch&&p.scopeId===u.personScopeId&&ps?.revision===u.personScopeRevision),'MEDIA_CONTEXT_CHANGED','人物授权已变化',409);
  if(u.personRoleId){const r=await workspaceRow(tx,'personRoles',u.personRoleId,u.workspaceId);invariant(r?.personId===p.id&&r.status==='ACTIVE'&&periodCurrent(r as unknown as Record<string,unknown>,clock),'MEDIA_CONTEXT_CHANGED','职业已失效',409);const source=await workspaceRow(tx,'sources',r.sourceId,u.workspaceId);invariant(source&&sourceCurrent(source,clock)&&!await deletionBlocked(tx,u.workspaceId,'SOURCE',source.id),'MEDIA_CONTEXT_CHANGED','职业依据已失效',409);}
 }else {const claim=await maintenance.ownClaim(tx,actor,s.claimId!,true);invariant(claim.kind==='ENROLL'&&!u.personRoleId,'ENROLL_REQUIRED','未绑定者仅可上传自己的新材料',409);}
 if(await deletionBlocked(tx,u.workspaceId,'ASSET',u.id))missing();
 return s;
}
/** The source on an asset is immutable origin; adopted source lives on the explicit relation. */
export async function formalMediaSource(tx:Tx,a:MediaAsset):Promise<string|null>{
 if(mediaUsage(a)!=='ADOPTED')return null;
 const relation=(await tx.find('personMedia',{workspaceId:a.workspaceId,assetId:a.id,usageState:'ADOPTED'}))[0];
 return relation?.sourceId??a.sourceId;
}
export async function adoptedMediaFor(tx:Tx,actor:Actor,a:MediaAsset,clock:Clock){
 if(mediaUsage(a)!=='ADOPTED')missing();
 const r=(await tx.find('personMedia',{workspaceId:a.workspaceId,assetId:a.id,usageState:'ADOPTED'}))[0];
 if(!r){
  await requireScope(tx,actor,a.scopeId);
  if(await deletionBlocked(tx,a.workspaceId,'ASSET',a.id)||!a.sourceId)missing();
  await sourceFor(tx,actor,a.sourceId,clock);return;
 }
 const visibility=await loadVisibility(tx,actor,clock);
 const person=r.personId?await tx.get('people',r.personId):null,role=r.personRoleId?await tx.get('personRoles',r.personRoleId):null;
 const personAliased=!!r.personId&&(await tx.find('personAliases',{workspaceId:actor.workspaceId,oldPersonId:r.personId})).length>0;
 if(!formalRelationReadable(a,r,{workspaceId:actor.workspaceId,clock,person,role,personAliased,...visibility}))missing();
}
export function uploadContext(u:MediaUpload):import('./media-model.ts').UploadContext{
 if((u.contextKind??'INTERNAL_SOURCE')==='INTERNAL_SOURCE'){
  invariant((u.principalKind??'INTERNAL')==='INTERNAL'&&u.actorId&&u.sourceId&&!u.talentAccountId&&!u.servicePrincipalId&&!u.submissionId,'MEDIA_CONTEXT_CHANGED','内部上传归属无效',409);
  return {kind:'INTERNAL_SOURCE',membershipId:u.actorId,sourceId:u.sourceId,personId:u.personId};
 }
 if(u.contextKind==='TALENT_SUBMISSION'){
  invariant(u.principalKind==='TALENT'&&u.talentAccountId&&u.submissionId&&!u.actorId&&!u.servicePrincipalId&&!u.sourceId,'MEDIA_CONTEXT_CHANGED','本人上传归属无效',409);
  return {kind:'TALENT_SUBMISSION',talentAccountId:u.talentAccountId,submissionId:u.submissionId,personId:u.personId,personRoleId:u.personRoleId??null};
 }
 invariant(u.contextKind==='AGENT_SUBMISSION'&&u.principalKind==='MACHINE'&&u.servicePrincipalId&&u.submissionId&&!u.actorId&&!u.talentAccountId&&!u.sourceId,'MEDIA_CONTEXT_CHANGED','机器上传归属无效',409);
 return {kind:'AGENT_SUBMISSION',servicePrincipalId:u.servicePrincipalId,submissionId:u.submissionId,personId:u.personId,personRoleId:u.personRoleId??null};
}
