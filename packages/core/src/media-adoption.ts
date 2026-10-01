import {mediaConsentVersion} from './media-validation.ts';
import type {Tx} from './store.ts';
import type {Actor,Clock,Config,Person,Source} from './model.ts';
import type {TalentSubmission,TalentSubmissionItem} from './talent-maintenance-model.ts';
import {mediaUsage} from './media-model.ts';
import {sourceFor} from './policy.ts';
import {touch} from './helpers.ts';
import {invariant} from './errors.ts';
import {talentUploadContext} from './media-ownership.ts';
export async function checkSubmissionMedia(tx:Tx,s:TalentSubmission,clock:Clock,config:Config){
 const uploads=await tx.find('uploads',{workspaceId:s.workspaceId,submissionId:s.id});
 invariant(uploads.every(u=>['READY','FAILED','CANCELLED','ERASED'].includes(u.state)),'MEDIA_PENDING','请等待媒体处理完成或取消未完成上传',409);
 for(const u of uploads){const a=await tx.get('assets',u.id);if(a&&mediaUsage(a)==='STAGED')await talentUploadContext(tx,{actorKind:'TALENT',workspaceId:s.workspaceId,talentAccountId:s.talentAccountId,sessionId:'',sessionEpoch:u.actorEpoch},u,clock,config);}
}
export async function adoptSubmissionMedia(tx:Tx,actor:Actor,s:TalentSubmission,p:Person,source:Source,items:TalentSubmissionItem[],clock:Clock,config:Config){
 if(!items.length)return;
 const consent=await tx.get('talentConsents',s.consentId);
 invariant(consent&&mediaConsentVersion(consent.textVersion)&&consent.state==='ACTIVE'&&consent.fieldScope.includes('media'),'MEDIA_CONSENT_REQUIRED','媒体使用同意不匹配',409);
 for(const item of items){
  const a=await tx.get('assets',String(item.values.assetId)),u=a?await tx.get('uploads',a.uploadId):null;
  invariant(a&&u&&a.state==='READY'&&mediaUsage(a)==='STAGED'&&a.sha256===item.values.sha256&&u.submissionId===s.id&&u.talentAccountId===s.talentAccountId,'MEDIA_NOT_ADOPTABLE','素材未就绪或归属不匹配',409);
  await talentUploadContext(tx,{actorKind:'TALENT',workspaceId:s.workspaceId,talentAccountId:s.talentAccountId,sessionId:'',sessionEpoch:u.actorEpoch},u,clock,config,false);
  const r=(await tx.find('personMedia',{workspaceId:s.workspaceId,assetId:a.id,submissionId:s.id,usageState:'STAGED'}))[0];
  invariant(r&&!r.retiredAt&&(!r.personId||r.personId===p.id),'MEDIA_NOT_ADOPTABLE','素材关系不可采纳',409);
  if(r.personRoleId){const role=await tx.get('personRoles',r.personRoleId);invariant(role&&role.personId===p.id,'MEDIA_NOT_ADOPTABLE','职业归属已变化',409);await sourceFor(tx,actor,role.sourceId,clock);}
  await tx.replace('personMedia',{...touch(r,clock),personId:p.id,sourceId:source.id,usageState:'ADOPTED',protectionEpoch:r.protectionEpoch+1,retainUntil:null});
  await tx.replace('assets',{...touch(a,clock),usageState:'ADOPTED',protectionEpoch:(a.protectionEpoch??1)+1});
 }
}

export async function syncMediaRetention(tx:Tx,s:TalentSubmission,clock:Clock){
 for(const r of await tx.find('personMedia',{workspaceId:s.workspaceId,submissionId:s.id,usageState:'STAGED'}))await tx.replace('personMedia',{...touch(r,clock),retainUntil:s.expiresAt});
}
