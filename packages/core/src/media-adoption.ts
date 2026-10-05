import {assertMediaNotPurging} from './media-purge.ts';
import {mediaConsentVersion} from './media-validation.ts';
import type {Tx} from './store.ts';
import type {Actor,Clock,Config,Person,Source} from './model.ts';
import type {TalentSubmission,TalentSubmissionItem,StoredSubmission,MachineSubmission} from './talent-maintenance-model.ts';
import {AgentMediaSchemas,machineUploadContext} from './agent-media.ts';
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
  await assertMediaNotPurging(tx,a.id);
  await talentUploadContext(tx,{actorKind:'TALENT',workspaceId:s.workspaceId,talentAccountId:s.talentAccountId,sessionId:'',sessionEpoch:u.actorEpoch},u,clock,config,false);
  const r=(await tx.find('personMedia',{workspaceId:s.workspaceId,assetId:a.id,submissionId:s.id,usageState:'STAGED'}))[0];
  invariant(r&&!r.retiredAt&&(!r.personId||r.personId===p.id),'MEDIA_NOT_ADOPTABLE','素材关系不可采纳',409);
  if(r.personRoleId){const role=await tx.get('personRoles',r.personRoleId);invariant(role&&role.personId===p.id,'MEDIA_NOT_ADOPTABLE','职业归属已变化',409);await sourceFor(tx,actor,role.sourceId,clock);}
  await tx.replace('personMedia',{...touch(r,clock),personId:p.id,sourceId:source.id,usageState:'ADOPTED',protectionEpoch:r.protectionEpoch+1,retainUntil:null});
  await tx.replace('assets',{...touch(a,clock),usageState:'ADOPTED',protectionEpoch:(a.protectionEpoch??1)+1});
 }
}

export async function syncMediaRetention(tx:Tx,s:StoredSubmission,clock:Clock,shortenOnly=false){
 for(const r of await tx.find('personMedia',{workspaceId:s.workspaceId,submissionId:s.id,usageState:'STAGED'})){
  // Rejection never renews retention or changes a purge worker's ownership.
  if(shortenOnly&&(!r.retainUntil||r.retainUntil<=s.expiresAt||r.retiredAt||r.purgedAt))continue;
  await tx.replace('personMedia',{...touch(r,clock),retainUntil:s.expiresAt});
 }
}

/** MEDIA references originate in worker.finish, never in caller-supplied candidate JSON. */
export async function checkMachineMediaItem(tx:Tx,s:MachineSubmission,item:{clientItemKey:string;values:Record<string,unknown>;dependsOn:string[]},clock:Clock,config:Config){
 const d=AgentMediaSchemas.mediaItem.parse(item.values),a=await tx.get('assets',d.assetId),u=a?await tx.get('uploads',a.uploadId):null;
 invariant(a&&u&&u.state==='READY'&&a.state==='READY'&&mediaUsage(a)==='STAGED'&&a.sha256===d.sha256&&a.sha256===u.expectedHash&&a.bytes===u.expectedBytes&&a.mime===u.mime&&u.submissionId===s.id&&u.servicePrincipalId===s.servicePrincipalId&&u.clientItemKey===item.clientItemKey&&u.roleCandidateKey===d.roleCandidateKey&&!a.personId&&!a.sourceId,'MEDIA_NOT_ADOPTABLE','素材未就绪或不属于本批机器材料',409);
 invariant(JSON.stringify(item.dependsOn)===JSON.stringify(d.roleCandidateKey?[d.roleCandidateKey]:[]),'MEDIA_DEPENDENCY_INVALID','素材职业依赖必须匹配冻结的上传声明',409);
 await machineUploadContext(tx,u,clock,config,false);await assertMediaNotPurging(tx,a.id);
 const r=(await tx.find('personMedia',{workspaceId:s.workspaceId,assetId:a.id,submissionId:s.id,usageState:'STAGED'}))[0];invariant(r&&!r.personId&&!r.personRoleId&&!r.sourceId&&!r.retiredAt&&!r.purgedAt&&r.retainUntil&&r.retainUntil>clock.now().toISOString(),'MEDIA_NOT_ADOPTABLE','暂存归属或保留期限已失效',409);
 return {a,u,r,d};
}
export async function checkMachineSubmissionMedia(tx:Tx,s:MachineSubmission,clock:Clock,config:Config){
 const uploads=await tx.find('uploads',{workspaceId:s.workspaceId,submissionId:s.id});
 invariant(uploads.every(u=>['READY','FAILED','CANCELLED','ERASED'].includes(u.state)),'MEDIA_PENDING','请等待媒体就绪，或取消未完成上传',409);
 for(const u of uploads)if(u.state==='READY')await machineUploadContext(tx,u,clock,config,false);
}
export async function adoptMachineMedia(tx:Tx,actor:Actor,s:MachineSubmission,person:Person,source:Source,items:TalentSubmissionItem[],applied:Map<string,string>,clock:Clock,config:Config){
 for(const item of items){
  const {a,r,d}=await checkMachineMediaItem(tx,s,item,clock,config);
  const roleId=d.roleCandidateKey?applied.get(d.roleCandidateKey):null;
  invariant(!d.roleCandidateKey||roleId,'ROLE_ADOPTION_REQUIRED','素材依赖的职业必须在本次采用',409);
  if(roleId){const role=await tx.get('personRoles',roleId);invariant(role&&role.personId===person.id&&role.status==='ACTIVE','MEDIA_ROLE_CHANGED','素材职业归属不匹配',409);await sourceFor(tx,actor,role.sourceId,clock);}
  await tx.replace('personMedia',{...touch(r,clock),personId:person.id,personRoleId:roleId??null,sourceId:source.id,usageState:'ADOPTED',protectionEpoch:r.protectionEpoch+1,retainUntil:null});
  await tx.replace('assets',{...touch(a,clock),usageState:'ADOPTED',protectionEpoch:(a.protectionEpoch??1)+1});applied.set(item.clientItemKey,a.id);
 }
}
