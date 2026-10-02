import {createHmac} from 'node:crypto';
import type {Actor,Clock,Config,RequestMeta} from './model.ts';
import type {Tx} from './store.ts';
import type {MediaUpload} from './media-model.ts';
import type {MachineSubmission} from './talent-maintenance-model.ts';
import {MEDIA_LIMITS as L,MEDIA_ADMISSION_DEFAULTS,mediaByteLimit,terminalUpload} from './media-model.ts';
import {v,uuid,revision,RevisionOnly} from './validation.ts';
import {base,touch,cas,audit,workspaceRow} from './helpers.ts';
import {Ingestion} from './ingestion.ts';
import {invariant,missing} from './errors.ts';
import {deletionBlocked,personAliasFor} from './policy.ts';
import {equalSecret,randomSecret} from './crypto.ts';
import {syncMediaRetention} from './media-adoption.ts';

/** Ceilings only, never implicit MACHINE budgets. Operators must configure all seven. */
export const AGENT_MEDIA_CEILINGS=Object.freeze({workspaceActiveUploads:20,principalActiveUploads:3,hourlyUploads:100,submissionFiles:50,submissionBytes:500000000,principalRetainedBytes:1000000000,workspaceRetainedBytes:2000000000});
export type AgentMediaAdmission={-readonly [K in keyof typeof AGENT_MEDIA_CEILINGS]:number};
const itemKey=v.string(100,1,/^[a-zA-Z0-9_-]+$/);
export const AgentMediaSchemas={
 create:v.object({context:v.object({kind:v.enum(['AGENT_SUBMISSION']),submissionId:uuid}),expectedSubmissionRevision:revision,clientItemKey:itemKey,roleCandidateKey:v.optional(itemKey),
  fileName:v.string(160,1,/^[^\x00-\x1f\x7f/\\]+$/),mime:v.enum(['image/jpeg','image/png','image/webp','application/pdf','video/mp4']),expectedBytes:v.number(1,L.videoBytes),sha256:v.string(64,64,/^[a-f0-9]{64}$/)}),
 authorization:RevisionOnly,
 mediaItem:v.object({assetId:uuid,sha256:v.string(64,64,/^[a-f0-9]{64}$/),roleCandidateKey:v.nullable(itemKey)})
};
export function agentMediaEnabled(config:Config){invariant(config.ingestionEnabled===true&&config.agentMediaEnabled===true&&config.mediaEnabled===true,'AGENT_MEDIA_DISABLED','机器媒体摄取尚未启用',503);invariant(config.agentMediaAdmission,'AGENT_MEDIA_QUOTA_REQUIRED','机器媒体额度尚未配置',503);return config.agentMediaAdmission;}
export async function agentMediaBudget(tx:Tx,workspaceId:string,principalId:string,submissionId:string,clock:Clock,config:Config,extra=0){
 const q=agentMediaEnabled(config),all=await tx.find('uploads',{workspaceId}),machines=all.filter(u=>u.principalKind==='MACHINE'),own=machines.filter(u=>u.servicePrincipalId===principalId),batch=own.filter(u=>u.submissionId===submissionId&&!u.purgedAt),active=machines.filter(u=>!terminalUpload(u.state)),additional=extra>0?1:0;
 invariant(all.length<L.records&&own.filter(u=>Date.parse(u.createdAt)>clock.now().getTime()-3600000).length+additional<=q.hourlyUploads,'UPLOAD_RATE_LIMIT','机器上传频率已达到额度',429);
 invariant(active.length+additional<=q.workspaceActiveUploads&&active.filter(u=>u.servicePrincipalId===principalId).length+additional<=q.principalActiveUploads,'UPLOAD_LIMIT','机器同时上传额度已满',429);
 invariant(batch.length+additional<=q.submissionFiles&&batch.reduce((n,u)=>n+u.expectedBytes,0)+extra<=q.submissionBytes,'SUBMISSION_MEDIA_LIMIT','本批文件数量或字节额度已满',429);
 invariant(own.filter(u=>!u.purgedAt).reduce((n,u)=>n+u.expectedBytes,0)+extra<=q.principalRetainedBytes,'MACHINE_MEDIA_BUDGET','机器保留容量已满',429);
 invariant(machines.filter(u=>!u.purgedAt).reduce((n,u)=>n+u.expectedBytes,0)+extra<=q.workspaceRetainedBytes,'MACHINE_WORKSPACE_BUDGET','工作空间机器保留容量已满',429);
 const global=config.mediaAdmission??MEDIA_ADMISSION_DEFAULTS;
 invariant(all.filter(u=>!u.purgedAt).reduce((n,u)=>n+u.expectedBytes,0)+extra<=global.workspaceBytes,'MEDIA_STORAGE_BUDGET','工作空间物理存储准入已满',429);
 invariant(all.filter(u=>!terminalUpload(u.state)).length+additional<=global.workspaceActive&&all.filter(u=>!terminalUpload(u.state)).reduce((n,u)=>n+u.expectedBytes,0)+extra<=global.workspaceActiveBytes,'UPLOAD_BUDGET','工作空间暂存额度已满',429);
}
/** No credential/keyVersion check: token rotation preserves the stable uploader. */
export async function machineUploadContext(tx:Tx,u:MediaUpload,clock:Clock,config:Config,processing=true){
 agentMediaEnabled(config);
 invariant(u.contextKind==='AGENT_SUBMISSION'&&u.principalKind==='MACHINE'&&u.servicePrincipalId&&u.submissionId&&!u.actorId&&!u.talentAccountId&&!u.sourceId&&!u.personId&&!u.personRoleId,'MEDIA_CONTEXT_CHANGED','机器上传归属不匹配',409);
 const raw=await workspaceRow(tx,'talentSubmissions',u.submissionId,u.workspaceId);if(!raw||raw.principalKind!=='MACHINE')missing();const s=raw as MachineSubmission;
 const p=(await new Ingestion(clock,config).currentPrincipal(tx,u.servicePrincipalId,u.workspaceId,s)).p;
 invariant(p.permissionCodes.includes('ingestion.media.upload')&&s.servicePrincipalId===u.servicePrincipalId&&u.servicePrincipalAuthorizationEpoch===s.servicePrincipalAuthorizationEpoch&&u.actorEpoch===s.servicePrincipalAuthorizationEpoch&&u.recoveryEpoch===s.recoveryEpoch&&u.scopeId===s.scopeId&&u.scopeRevision===s.intakeScopeRevision,'MEDIA_CONTEXT_CHANGED','机器上传授权已变化',409);
 invariant(Date.parse(s.expiresAt)>clock.now().getTime(),'SUBMISSION_EXPIRED','投稿已过期',409);
 invariant(processing?s.state==='DRAFT':['DRAFT','SUBMITTED','APPROVED','PARTIALLY_APPROVED','REJECTED'].includes(s.state),'SUBMISSION_IMMUTABLE','已提交或撤回的材料不能新增或继续处理',409);
 if(processing)invariant(Date.parse(u.expiresAt)>clock.now().getTime(),'UPLOAD_EXPIRED','上传已过期',409);
 if(s.proposedPersonId){const person=await tx.get('people',s.proposedPersonId);invariant(person&&person.status!=='ERASED'&&person.status!=='ARCHIVED'&&!await personAliasFor(tx,u.workspaceId,person.id)&&!await deletionBlocked(tx,u.workspaceId,'PERSON',person.id),'TARGET_REBASE_REQUIRED','候选目标已合并或删除，请重新提交',409);}
 if(await deletionBlocked(tx,u.workspaceId,'ASSET',u.id))missing();
 await agentMediaBudget(tx,u.workspaceId,u.servicePrincipalId,s.id,clock,config);
 return s;
}
export async function createAgentUpload(tx:Tx,actor:Actor,input:unknown,clock:Clock,config:Config):Promise<MediaUpload>{
 agentMediaEnabled(config);invariant(actor.actorKind==='MACHINE'&&actor.servicePrincipalId,'MACHINE_REQUIRED','仅限机器上传',403);
 const d=AgentMediaSchemas.create.parse(input),ingestion=new Ingestion(clock,config),s=await ingestion.access(tx,actor,d.context.submissionId);cas(s,d.expectedSubmissionRevision);
 invariant(s.state==='DRAFT'&&Date.parse(s.expiresAt)>clock.now().getTime(),'SUBMISSION_IMMUTABLE','本批材料已冻结或过期',409);
 const {p,scope}=await ingestion.currentPrincipal(tx,actor.servicePrincipalId,actor.workspaceId,s);invariant(p.permissionCodes.includes('ingestion.media.upload'),'FORBIDDEN','机器无媒体上传权限',403);
 invariant(d.expectedBytes<=mediaByteLimit(d.mime),'MEDIA_SIZE_INVALID','文件超过格式限制',400);
 const prior=await tx.find('uploads',{workspaceId:actor.workspaceId,submissionId:s.id}),items=await ingestion.itemsFor(tx,s);
 invariant(!prior.some(u=>u.clientItemKey===d.clientItemKey)&&!items.some(i=>i.clientItemKey===d.clientItemKey),'MEDIA_ITEM_KEY_EXISTS','本批材料键已使用；请读取原上传',409);
 invariant(items.filter(i=>i.kind!=='MEDIA').length+prior.filter(u=>!u.purgedAt).length<50,'ITEM_LIMIT','本批候选和文件最多50项',429);
 if(d.roleCandidateKey)invariant(items.some(i=>i.kind==='ROLE'&&i.clientItemKey===d.roleCandidateKey),'ROLE_CANDIDATE_REQUIRED','请先保存本批职业候选',422);
 await agentMediaBudget(tx,actor.workspaceId,p.id,s.id,clock,config,d.expectedBytes);
 const u:MediaUpload={...base(actor.workspaceId,clock),contextKind:'AGENT_SUBMISSION',principalKind:'MACHINE',actorId:null,talentAccountId:null,servicePrincipalId:p.id,submissionId:s.id,servicePrincipalAuthorizationEpoch:s.servicePrincipalAuthorizationEpoch,clientItemKey:d.clientItemKey,roleCandidateKey:d.roleCandidateKey??null,receiveAuthorizationHash:null,receiveAuthorizationUntil:null,grantEpoch:null,recoveryEpoch:s.recoveryEpoch,actorRevision:p.revision,actorEpoch:s.servicePrincipalAuthorizationEpoch,
  sourceId:null,sourceRevision:null,sourceEpoch:null,scopeId:scope.id,scopeRevision:scope.revision,personId:null,personRoleId:null,personEpoch:null,personScopeId:null,personScopeRevision:null,fileName:d.fileName,mime:d.mime,expectedBytes:d.expectedBytes,expectedHash:d.sha256,state:'OPEN',expiresAt:new Date(Math.min(clock.now().getTime()+L.uploadMs,Date.parse(s.expiresAt))).toISOString(),renewals:0,attempts:0,receiveToken:null,leaseToken:null,leaseUntil:null,errorCode:null,purgedAt:null};
 await machineUploadContext(tx,u,clock,config);await tx.insert('uploads',u);
 const next={...touch(s,clock),expiresAt:new Date(Math.min(Date.parse(s.expiresAt),Date.parse(ingestion.until(config.mediaRetention?.draft??90)))).toISOString()};await tx.replace('talentSubmissions',next);await syncMediaRetention(tx,next,clock);return u;
}
const receiveHash=(token:string,config:Config)=>createHmac('sha256',config.csrfKey).update('once-machine-receive-v1:'+token).digest('hex');
export async function authorizeAgentReceive(tx:Tx,actor:Actor,u:MediaUpload,input:unknown,clock:Clock,config:Config,meta:RequestMeta){
 cas(u,AgentMediaSchemas.authorization.parse(input).expectedRevision);await machineUploadContext(tx,u,clock,config);
 invariant(u.state==='OPEN','UPLOAD_NOT_OPEN','该上传已经开始接收或结束',409);
 const token=randomSecret(),expiresAt=new Date(Math.min(clock.now().getTime()+L.receiveMs,Date.parse(u.expiresAt))).toISOString(),next={...touch(u,clock),receiveAuthorizationHash:receiveHash(token,config),receiveAuthorizationUntil:expiresAt};
 await tx.replace('uploads',next);await audit(tx,actor,u.workspaceId,'ingestion.upload.receive-authorize','upload',u.id,[],meta,clock);
 return {uploadId:u.id,revision:next.revision,method:'PUT',path:'/api/v1/ingestion/uploads/'+u.id+'/content',expiresAt,receiveToken:token,expectedBytes:u.expectedBytes};
}
export function checkAgentReceive(u:MediaUpload,token:string|undefined,clock:Clock,config:Config){invariant(typeof token==='string'&&token.length===43&&u.receiveAuthorizationHash&&u.receiveAuthorizationUntil&&Date.parse(u.receiveAuthorizationUntil)>clock.now().getTime()&&equalSecret(receiveHash(token,config),u.receiveAuthorizationHash),'RECEIVE_AUTHORIZATION_INVALID','接收授权已失效，请核对上传后重新授权',403);}
