import type {Actor,Clock,Config,Membership,RequestMeta,Source,Base,Table} from './model.ts';
import type {Tx} from './store.ts';
import {audit,base,cas,page,touch,workspaceRow} from './helpers.ts';
import {AppError,invariant,missing} from './errors.ts';
import {deletionBlocked,permissionsFor,personFor,requirePermission,scopeVisible,sourceCurrent} from './policy.ts';
import {currentMember} from './handoff-policy.ts';
import {appendSourceHistory} from './source-history.ts';
import {TALENT_FACT_TABLES,TALENT_OWNER_TABLES} from './talent-v2-model.ts';
import {v,uuid,revision,dateIso,Schemas} from './validation.ts';

export interface SourceReviewRequest extends Base {
 personId:string;sourceId:string;senderId:string;reviewerId:string;publisherId:string;targetScopeId:string;
 senderRevision:number;reviewerRevision:number;publisherRevision:number;targetScopeRevision:number;
 personRevision:number;sourceRevision:number;personEpoch:number;sourceEpoch:number;
 personScopeId:string;sourceScopeId:string;personScopeRevision:number;sourceScopeRevision:number;
 recoveryEpoch:string;expiresAt:string;state:'PENDING'|'ACCEPTED'|'REVIEWED'|'PUBLISHED'|'DECLINED'|'REVOKED';
}
export const SourceReviewSchemas={
 create:v.object({expectedRevision:revision,expectedSourceRevision:revision,reviewerId:uuid,publisherId:uuid,targetScopeId:uuid,expiresAt:dateIso,acknowledgeLimitedAccess:v.boolean()}),
 review:v.object({expectedRevision:revision,basisDescription:v.string(2000,4),validUntil:dateIso}),
 publish:v.object({expectedRevision:revision,confirmScope:v.boolean()})
};
const open=(r:SourceReviewRequest)=>['PENDING','ACCEPTED','REVIEWED'].includes(r.state);
function asActor(m:Membership):Actor{return {workspaceId:m.workspaceId,membershipId:m.id,userId:m.userId,role:m.role,permissions:permissionsFor(m),displayName:'',userEpoch:0,sessionId:'source-review-policy'};}
function eligible(m:Membership,permission:'sources.review'|'members.manage',source:Source){const p=permissionsFor(m);return p.includes('records.read')&&p.includes('sources.read')&&p.includes(permission)&&(permission!=='sources.review'||!source.textPayload||p.includes('sensitive.read'));}
export async function sourceReviewParticipant(tx:Tx,actor:Actor,id:string){requirePermission(actor,'records.read');const r=await workspaceRow(tx,'sourceReviews',id,actor.workspaceId);if(!r||![r.senderId,r.reviewerId,r.publisherId].includes(actor.membershipId))missing();return r;}

/** Grant is consumed only in this module. It never grants native source/person/contact access. */
export class SourceReviews {
 clock:Clock;config:Config;
 constructor(clock:Clock,config:Config){this.clock=clock;this.config=config;}
 private async owned(tx:Tx,actor:Actor,id:string){
  requirePermission(actor,'records.write');requirePermission(actor,'sources.write');invariant(actor.actorKind!=='MACHINE','FORBIDDEN','仅内部成员可发起核验',403);
  const person=await personFor(tx,actor,id,this.clock,false),source=(await tx.get('sources',person.sourceId))!;
  invariant(person.maintainerId===actor.membershipId&&source.maintainerId===actor.membershipId,'REVIEW_OWNER_REQUIRED','仅档案和来源的共同维护人可以发起核验',403);
  invariant(person.status!=='ARCHIVED'&&!source.internalUseUntil&&source.status!=='SUSPENDED','REVIEW_BASIS_UNSUPPORTED','当前资料须先通过原维护流程核对，不能扩大使用依据',409);
  return {person,source};
 }
 async candidates(tx:Tx,actor:Actor,query:Record<string,string>){
  requirePermission(actor,'records.write');const rows=[];
  for(const p of await tx.find('people',{workspaceId:actor.workspaceId,maintainerId:actor.membershipId}))try{const {person,source}=await this.owned(tx,actor,p.id);rows.push({id:person.id,displayName:sourceCurrent(source,this.clock)?person.displayName:'已过期草稿 · '+person.id.slice(0,8),revision:person.revision,sourceRevision:source.revision});}catch(e){if(!(e instanceof AppError)||e.status>=500)throw e;}
  return page(rows.sort((a,b)=>a.id.localeCompare(b.id)),query);
 }
 async options(tx:Tx,actor:Actor,id:string){
  const {person,source}=await this.owned(tx,actor,id),reviewers=[],publishers=[],scopes=[];
  for(const scope of await tx.find('scopes',{workspaceId:actor.workspaceId}))if(await scopeVisible(tx,actor,scope.id))scopes.push({id:scope.id,name:scope.name});
  for(const m of await tx.find('memberships',{workspaceId:actor.workspaceId,status:'ACTIVE'})){
   const member=await currentMember(tx,actor.workspaceId,m.id);if(!member)continue;const user=(await tx.get('users',m.userId))!;
   if(eligible(m,'sources.review',source))reviewers.push({id:m.id,name:user.displayName});
   if(eligible(m,'members.manage',source)){const scopeIds=[];for(const s of scopes)if(await scopeVisible(tx,asActor(m),s.id))scopeIds.push(s.id);if(scopeIds.length)publishers.push({id:m.id,name:user.displayName,scopeIds});}
  }
  return {personId:id,revision:person.revision,sourceRevision:source.revision,reviewers,publishers,scopes};
 }
 private async current(tx:Tx,r:SourceReviewRequest){
  invariant(open(r)&&Date.parse(r.expiresAt)>this.clock.now().getTime()&&r.recoveryEpoch===this.config.recoveryEpoch,'REVIEW_INVALIDATED','核验已结束、过期或环境已恢复，请重新发起',409);
  const ws=await tx.get('workspaces',r.workspaceId);invariant(ws?.recoveryEpoch===r.recoveryEpoch,'REVIEW_INVALIDATED','环境已恢复，请重新发起核验',409);
  const sender=await currentMember(tx,r.workspaceId,r.senderId),reviewer=await currentMember(tx,r.workspaceId,r.reviewerId),publisher=await currentMember(tx,r.workspaceId,r.publisherId);
  invariant(sender&&reviewer&&publisher&&sender.revision===r.senderRevision&&reviewer.revision===r.reviewerRevision&&publisher.revision===r.publisherRevision,'REVIEW_INVALIDATED','成员资格已变化，请重新发起核验',409);
  const pair=await this.owned(tx,asActor(sender),r.personId),{person,source}=pair;
  invariant(person.sourceId===r.sourceId&&person.revision===r.personRevision&&source.revision===r.sourceRevision&&person.protectionEpoch===r.personEpoch&&source.protectionEpoch===r.sourceEpoch&&person.scopeId===r.personScopeId&&source.scopeId===r.sourceScopeId,'REVIEW_INVALIDATED','资料或访问范围已变化，请重新发起核验',409);
  for(const [id,version] of [[r.personScopeId,r.personScopeRevision],[r.sourceScopeId,r.sourceScopeRevision],[r.targetScopeId,r.targetScopeRevision]] as const){const s=await workspaceRow(tx,'scopes',id,r.workspaceId);invariant(s?.revision===version,'REVIEW_INVALIDATED','访问范围已变化，请重新发起核验',409);}
  invariant(eligible(reviewer,'sources.review',source)&&eligible(publisher,'members.manage',source)&&await scopeVisible(tx,asActor(sender),r.targetScopeId)&&await scopeVisible(tx,asActor(publisher),r.targetScopeId),'REVIEW_INVALIDATED','核验或发布资格已变化',409);
  await this.exclusive(tx,r);return pair;
 }
 async create(tx:Tx,actor:Actor,id:string,input:unknown){
  const d=SourceReviewSchemas.create.parse(input),{person,source}=await this.owned(tx,actor,id);cas(person,d.expectedRevision);cas(source,d.expectedSourceRevision);
  invariant(d.acknowledgeLimitedAccess,'REVIEW_ACK_REQUIRED','须确认只授权所选核验人查看当前材料，发布另行确认',422);
  const options=await this.options(tx,actor,id);invariant(options.reviewers.some(r=>r.id===d.reviewerId)&&options.publishers.some(p=>p.id===d.publisherId&&p.scopeIds.includes(d.targetScopeId)),'REVIEW_RECIPIENT_INVALID','核验人、发布人或范围不可用',422);
  const now=this.clock.now().getTime();invariant(Date.parse(d.expiresAt)>now&&Date.parse(d.expiresAt)<=now+7*86400000,'REVIEW_EXPIRY_INVALID','核验期限最长七天',422);
  const pending=(await tx.find('sourceReviews',{workspaceId:actor.workspaceId})).filter(r=>open(r)&&Date.parse(r.expiresAt)>now);
  invariant(!pending.some(r=>r.personId===id),'REVIEW_ALREADY_OPEN','已有未结束核验，请先撤销原任务',409);
  invariant(pending.filter(r=>r.senderId===actor.membershipId||r.reviewerId===d.reviewerId).length<100,'REVIEW_LIMIT','未完成核验过多，请先处理已有任务',429);
  const sender=(await currentMember(tx,actor.workspaceId,actor.membershipId))!,reviewer=(await currentMember(tx,actor.workspaceId,d.reviewerId))!,publisher=(await currentMember(tx,actor.workspaceId,d.publisherId))!;
  const r:SourceReviewRequest={...base(actor.workspaceId,this.clock),personId:id,sourceId:source.id,senderId:sender.id,reviewerId:reviewer.id,publisherId:publisher.id,targetScopeId:d.targetScopeId,senderRevision:sender.revision,reviewerRevision:reviewer.revision,publisherRevision:publisher.revision,targetScopeRevision:(await tx.get('scopes',d.targetScopeId))!.revision,personRevision:person.revision,sourceRevision:source.revision,personEpoch:person.protectionEpoch,sourceEpoch:source.protectionEpoch,personScopeId:person.scopeId,sourceScopeId:source.scopeId,personScopeRevision:(await tx.get('scopes',person.scopeId))!.revision,sourceScopeRevision:(await tx.get('scopes',source.scopeId))!.revision,recoveryEpoch:this.config.recoveryEpoch,expiresAt:d.expiresAt,state:'PENDING'};
  await this.exclusive(tx,r);await tx.insert('sourceReviews',r);return r;
 }
 async get(tx:Tx,actor:Actor,id:string,meta?:RequestMeta){
  const r=await sourceReviewParticipant(tx,actor,id);let pair:null|Awaited<ReturnType<SourceReviews['current']>>=null;
  if(open(r))try{pair=await this.current(tx,r);}catch(e){if(!(e instanceof AppError)||e.status>=500)throw e;}
  // Minimal task status remains readable after the grant ends; raw content does not.
  const show=pair&&(actor.membershipId===r.senderId||actor.membershipId===r.reviewerId&&r.state==='ACCEPTED'||actor.membershipId===r.publisherId&&r.state==='REVIEWED');
  const raw=show&&(actor.membershipId===r.senderId||actor.membershipId===r.reviewerId&&r.state==='ACCEPTED');
  if(show&&meta)await audit(tx,actor,actor.workspaceId,'sourceReview.content-read','sourceReview',r.id,[],meta,this.clock);
  const names=[];for(const memberId of [r.senderId,r.reviewerId,r.publisherId]){const m=await workspaceRow(tx,'memberships',memberId,r.workspaceId),u=m?await workspaceRow(tx,'users',m.userId,r.workspaceId):null;names.push(u?.displayName??'不可用成员');}
  return {id:r.id,revision:r.revision,state:r.state,effectiveState:open(r)&&!pair?'INVALIDATED':r.state,expiresAt:r.expiresAt,
   senderName:names[0],reviewerName:names[1],publisherName:names[2],
   targetScope:pair?(await tx.get('scopes',r.targetScopeId))!.name:null,
   person:pair&&show?{id:pair.person.id,displayName:pair.person.displayName}:null,
   source:pair&&show?{title:pair.source.title,providerClaim:raw?pair.source.providerClaim:'',basisDescription:pair.source.basisDescription,validUntil:pair.source.validUntil,...(raw&&actor.permissions.includes('sensitive.read')?{textPayload:pair.source.textPayload}:{})}:null,
   canAccept:!!pair&&r.state==='PENDING'&&actor.membershipId===r.reviewerId,canReview:!!pair&&r.state==='ACCEPTED'&&actor.membershipId===r.reviewerId,
   canPublish:!!pair&&r.state==='REVIEWED'&&actor.membershipId===r.publisherId,
   canRevoke:open(r)&&actor.membershipId===r.senderId,canDecline:open(r)&&[r.reviewerId,r.publisherId].includes(actor.membershipId)};
 }
 async list(tx:Tx,actor:Actor,query:Record<string,string>){const rows=(await tx.find('sourceReviews',{workspaceId:actor.workspaceId})).filter(r=>[r.senderId,r.reviewerId,r.publisherId].includes(actor.membershipId)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));const selected=page(rows,query),items=[];for(const r of selected.items){const dto=await this.get(tx,actor,r.id);items.push({...dto,person:null,source:null});}return {...selected,items};}
 async act(tx:Tx,actor:Actor,id:string,input:unknown,action:'accept'|'decline'|'revoke'){
  const d=Schemas.revision.parse(input),r=await sourceReviewParticipant(tx,actor,id);cas(r,d.expectedRevision);invariant(open(r),'REVIEW_STATE_CONFLICT','核验已结束',409);
  if(action==='accept'){if(actor.membershipId!==r.reviewerId)missing();invariant(r.state==='PENDING','REVIEW_STATE_CONFLICT','核验已被接受',409);await this.current(tx,r);}
  else if(action==='revoke'?actor.membershipId!==r.senderId:![r.reviewerId,r.publisherId].includes(actor.membershipId))missing();
  const next={...touch(r,this.clock),state:action==='accept'?'ACCEPTED' as const:action==='decline'?'DECLINED' as const:'REVOKED' as const};await tx.replace('sourceReviews',next);return next;
 }
 async review(tx:Tx,actor:Actor,id:string,input:unknown){
  requirePermission(actor,'sources.review');const d=SourceReviewSchemas.review.parse(input),r=await sourceReviewParticipant(tx,actor,id);cas(r,d.expectedRevision);if(actor.membershipId!==r.reviewerId)missing();invariant(r.state==='ACCEPTED','REVIEW_STATE_CONFLICT','请先接受核验任务',409);
  const {source}=await this.current(tx,r);invariant(Date.parse(d.validUntil)>this.clock.now().getTime(),'BASIS_EXPIRY_REQUIRED','依据截止时间必须在未来',422);
  const next:Source={...touch(source,this.clock),basisDescription:d.basisDescription,validUntil:d.validUntil,validFrom:this.clock.now().toISOString(),basisMode:'INTERNAL_USE',status:'CONFIRMED',protectionEpoch:source.protectionEpoch+1,reviewedBy:actor.membershipId,reviewedAt:this.clock.now().toISOString()};
  await tx.replace('sources',next);await appendSourceHistory(tx,actor,next,'REVIEWED',this.clock);
  const done={...touch(r,this.clock),sourceRevision:next.revision,sourceEpoch:next.protectionEpoch,state:'REVIEWED' as const};await tx.replace('sourceReviews',done);return done;
 }
 /** Sharing is bounded to one identity. Shared or independent records require a separate review. */
 private async exclusive(tx:Tx,r:SourceReviewRequest){
  const reject=()=>invariant(false,'REVIEW_SHARED_SOURCE','来源还关联其他资料，不能通过单人核验直接共享；请使用独立来源或交由原范围管理员逐项处理',409);
  for(const p of await tx.find('people',{workspaceId:r.workspaceId,sourceId:r.sourceId}))if(p.id!==r.personId)reject();
  const personal:Table[]=[...TALENT_FACT_TABLES,'contacts','personMedia','uploads','assets'];
  for(const table of personal)for(const raw of await tx.find(table,{workspaceId:r.workspaceId,sourceId:r.sourceId})){const row=raw as unknown as {personId?:string};if(row.personId!==r.personId)reject();}
  for(const table of ['evidence','fieldProposals'] as const)for(const row of await tx.find(table,{workspaceId:r.workspaceId,sourceId:r.sourceId})){
   const refs=Object.entries(TALENT_OWNER_TABLES).filter(([key])=>!!(row as unknown as Record<string,unknown>)[key]);if(refs.length!==1){reject();continue;}
   const [key,ownerTable]=refs[0]!,owner=await tx.get(ownerTable,String((row as unknown as Record<string,unknown>)[key]));
   if(!owner||('personId' in owner?owner.personId:owner.id)!==r.personId)reject();
  }
  const independent:Table[]=['works','workCredits','projects','organizations','brands','imports','usePermissions','exportDependencies','sourceAttributions','sourceUseBases'];
  for(const table of independent)if((await tx.find(table,{workspaceId:r.workspaceId,sourceId:r.sourceId})).length)reject();
  if((await tx.find('usePermissions',{workspaceId:r.workspaceId,retentionBasisSourceId:r.sourceId})).length)reject();
 }
 async publish(tx:Tx,actor:Actor,id:string,input:unknown){
  requirePermission(actor,'members.manage');const d=SourceReviewSchemas.publish.parse(input),r=await sourceReviewParticipant(tx,actor,id);cas(r,d.expectedRevision);if(actor.membershipId!==r.publisherId)missing();invariant(r.state==='REVIEWED'&&d.confirmScope,'REVIEW_PUBLISH_CONFIRM_REQUIRED','请确认核验通过，并将该人才及其来源移至指定范围',422);
  const {person,source}=await this.current(tx,r);invariant(sourceCurrent(source,this.clock),'REVIEW_INVALIDATED','核验依据已失效',409);await this.exclusive(tx,r);
  await tx.replace('people',{...touch(person,this.clock),scopeId:r.targetScopeId,protectionEpoch:person.protectionEpoch+1});
  const changed={...touch(source,this.clock),scopeId:r.targetScopeId,protectionEpoch:source.protectionEpoch+1};await tx.replace('sources',changed);await appendSourceHistory(tx,actor,changed,'SCOPE_CHANGED',this.clock);
  const next={...touch(r,this.clock),state:'PUBLISHED' as const};await tx.replace('sourceReviews',next);return next;
 }
}
