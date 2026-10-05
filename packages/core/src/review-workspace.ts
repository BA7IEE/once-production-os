import type {Actor,Clock,Config,RequestMeta} from './model.ts';
import type {Tx} from './store.ts';
import type {TalentClaim,TalentInvitation} from './talent-maintenance-model.ts';
import {ReviewQuerySchema} from './admin-ux-schema.ts';
import {AppError,missing} from './errors.ts';
import {page,workspaceRow} from './helpers.ts';
import {requirePermission,requireScope,scopeVisible} from './policy.ts';
import {loadTalentGraph,td2PersonFor} from './talent-v2-graph.ts';
import {TalentMaintenance} from './talent-maintenance.ts';
import {SourceReviews} from './source-review.ts';
import {Ingestion} from './ingestion.ts';
type Kind='CLAIM'|'SUBMISSION'|'SOURCE_REVIEW'|'INGESTION';
type Task={id:string;kind:Kind;title:string;state:string;updatedAt:string;view:'TODO'|'SENT'|'DONE';description:string};
const hidden=(e:unknown)=>e instanceof AppError&&[403,404].includes(e.status);
function claimState(c:TalentClaim,clock:Clock,config:Config,inv:TalentInvitation|undefined,accountStatus:string|undefined,workspaceEpoch:string|undefined){
 if(c.state!=='PENDING')return c.state;
 if(Date.parse(c.admissionUntil)<=clock.now().getTime()||inv&&Date.parse(inv.expiresAt)<=clock.now().getTime())return 'EXPIRED';
 if(!inv||inv.state!=='ACTIVE'||inv.recoveryEpoch!==config.recoveryEpoch||c.recoveryEpoch!==config.recoveryEpoch||c.kind==='ENROLL'&&!c.reserved||accountStatus!=='ACTIVE'||config.accessMode!=='INTERNAL'||workspaceEpoch!==config.recoveryEpoch)return 'INVALIDATED';
 return 'PENDING';
}
async function name(tx:Tx,actor:Actor,id:string|null,clock:Clock,graph?:Awaited<ReturnType<typeof loadTalentGraph>>){if(!id)return null;try {const p=await td2PersonFor(tx,actor,id),g=graph??await loadTalentGraph(tx,actor,clock,[id]);return g.fieldReadable('person',p as unknown as Record<string,unknown>,'displayName')?p.displayName:null;}catch(e){if(hidden(e))return null;throw e;}}
export async function reviewTasks(tx:Tx,actor:Actor,input:unknown,clock:Clock,config:Config){
 requirePermission(actor,'records.read');const d=ReviewQuerySchema.parse(input),out:Task[]=[];
 const m=new TalentMaintenance(clock,config),reviews=new SourceReviews(clock,config),ingestion=new Ingestion(clock,config);
 if(actor.permissions.includes('talent.review')){
  const claims=await tx.find('talentClaims',{workspaceId:actor.workspaceId}),submissions=await tx.find('talentSubmissions',{workspaceId:actor.workspaceId}),ids=[...new Set([...claims.map(c=>c.targetPersonId),...submissions.map(s=>s.personId)].filter((id):id is string=>!!id))],graph=await loadTalentGraph(tx,actor,clock,ids);
  const invitations=new Map((await tx.find('talentInvitations',{workspaceId:actor.workspaceId})).map(i=>[i.id,i])),accounts=new Map((await tx.find('talentAccounts',{workspaceId:actor.workspaceId})).map(a=>[a.id,a.status])),workspace=await tx.get('workspaces',actor.workspaceId);
  for(const c of claims){
   if(!await scopeVisible(tx,actor,c.scopeId))continue;
   try {if(c.targetPersonId)await td2PersonFor(tx,actor,c.targetPersonId);}catch(e){if(hidden(e))continue;throw e;}
   const title=await name(tx,actor,c.targetPersonId,clock,graph),state=claimState(c,clock,config,invitations.get(c.invitationId),accounts.get(c.talentAccountId),workspace?.recoveryEpoch),pending=state==='PENDING';
   out.push({id:c.id,kind:'CLAIM',title:title?title+' · 归属申请':'人才归属申请',state,updatedAt:c.updatedAt,view:pending?'TODO':'DONE',description:c.kind==='CLAIM'?'确认本人、监护人或代理人的独立归属依据':'加入申请；提交资料后再决定建立或绑定档案'});
  }
  for(const s of submissions){
   if(s.state==='DRAFT'||s.state==='WITHDRAWN')continue;
   try {if(s.principalKind==='MACHINE'){if(!config.ingestionEnabled)continue;await ingestion.reviewAccess(tx,actor,s.id);}else await m.internalSubmission(tx,actor,s.id);}catch(e){if(hidden(e)||s.principalKind==='MACHINE'&&e instanceof AppError&&e.code==='INGESTION_AUTHORIZATION_CHANGED')continue;throw e;}
   const pending=s.state==='SUBMITTED'&&(s.principalKind==='MACHINE'||Date.parse(s.expiresAt)>clock.now().getTime()),title=await name(tx,actor,s.personId,clock,graph);
   const items=await tx.find('talentSubmissionItems',{workspaceId:actor.workspaceId,submissionId:s.id});
   out.push({id:s.id,kind:s.principalKind==='MACHINE'?'INGESTION':'SUBMISSION',title:title?title+' · 资料更新':s.principalKind==='MACHINE'?'外部材料投稿':'本人资料提交',state:pending?'SUBMITTED':s.state==='SUBMITTED'?'EXPIRED':s.state,updatedAt:s.updatedAt,view:pending?'TODO':'DONE',description:`${items.length} 项修改，采纳资料与资格核验分别处理`});
  }
 }
 for(const r of await tx.find('sourceReviews',{workspaceId:actor.workspaceId})){
  if(![r.senderId,r.reviewerId,r.publisherId].includes(actor.membershipId))continue;
  let dto;try{dto=await reviews.get(tx,actor,r.id);}catch(e){if(hidden(e))continue;throw e;}
  const active=['PENDING','ACCEPTED','REVIEWED'].includes(dto.effectiveState),canAct=dto.canAccept||dto.canReview||dto.canPublish;
  out.push({id:r.id,kind:'SOURCE_REVIEW',title:dto.person?dto.person.displayName+' · 团队核验':'团队核验与共享',state:dto.effectiveState,updatedAt:r.updatedAt,view:!active?'DONE':canAct?'TODO':'SENT',description:dto.canAccept||dto.canReview?`${dto.senderName} 发起，等待 ${dto.reviewerName} 核验`:dto.canPublish?`等待 ${dto.publisherName} 确认共享范围`:dto.effectiveState==='REVIEWED'?`等待 ${dto.publisherName} 确认共享`:`等待 ${dto.reviewerName} 核验`});
 }
 const rows=out.filter(t=>t.view===d.view&&(d.kind==='ALL'||t.kind===d.kind)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));
 return {...page(rows,{page:String(d.page),pageSize:String(d.pageSize)}),counts:{TODO:out.filter(t=>t.view==='TODO').length,SENT:out.filter(t=>t.view==='SENT').length,DONE:out.filter(t=>t.view==='DONE').length}};
}
export async function reviewTask(tx:Tx,actor:Actor,kind:string,id:string,clock:Clock,config:Config,meta:RequestMeta){
 requirePermission(actor,'records.read');const m=new TalentMaintenance(clock,config);
 if(kind==='SOURCE_REVIEW')return new SourceReviews(clock,config).get(tx,actor,id,meta);
 if(kind==='SUBMISSION')return m.submissionDto(tx,await m.internalSubmission(tx,actor,id),actor);
 if(kind==='INGESTION'){const ingestion=new Ingestion(clock,config);return ingestion.dto(tx,await ingestion.reviewAccess(tx,actor,id),actor);}
 if(kind==='CLAIM'){requirePermission(actor,'talent.review');const c=await workspaceRow(tx,'talentClaims',id,actor.workspaceId);if(!c)missing();await requireScope(tx,actor,c.scopeId);if(c.targetPersonId)await td2PersonFor(tx,actor,c.targetPersonId);const inv=await workspaceRow(tx,'talentInvitations',c.invitationId,actor.workspaceId),account=await workspaceRow(tx,'talentAccounts',c.talentAccountId,actor.workspaceId),workspace=await tx.get('workspaces',actor.workspaceId),state=claimState(c,clock,config,inv??undefined,account?.status,workspace?.recoveryEpoch);return {id:c.id,revision:c.revision,state,canApprove:state==='PENDING'&&c.kind==='CLAIM',canReject:c.state==='PENDING',admissionUntil:c.admissionUntil,kind:c.kind,relation:c.relation,adultDeclared:c.adultDeclared,targetName:await name(tx,actor,c.targetPersonId,clock)};}
 missing();
}
