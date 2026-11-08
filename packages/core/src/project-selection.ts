import type {Actor,Clock,Config} from './model.ts';
import type {Tx} from './store.ts';
import type {ProjectRequirement,SelectionContext} from './project-selection-model.ts';
import type {ShortlistItem} from './shortlist-model.ts';
import {ProjectSelectionSchemas as S} from './project-selection-schema.ts';
import {base,cas,touch,workspaceRow} from './helpers.ts';
import {requirePermission,sourceFor,requireScope} from './policy.ts';
import {projectFor,checkRole,editable} from './production-policy.ts';
import {shortlistFor,Shortlists} from './shortlists.ts';
import {queryTalentDirectory,evaluateDirectoryCandidates} from './talent-directory-query.ts';
import {invariant,missing} from './errors.ts';
import {encryptDraftPayload,decryptDraftPayload} from './private-draft-payload.ts';
import {parseStrictJson} from './json.ts';

const validDay=(s:string|null)=>!s||Number.isFinite(Date.parse(s+'T00:00:00.000Z'))&&new Date(s+'T00:00:00.000Z').toISOString().slice(0,10)===s;
function queryFor(r:Pick<ProjectRequirement,'roleCode'|'locationCodes'>,filter:Record<string,unknown>){
 invariant(!['role','mode','page','pageSize','status'].some(k=>Object.hasOwn(filter,k)),'REQUIREMENT_QUERY_CONTEXT','岗位职业、状态和分页由当前需求确定，请只填写筛选条件',422);
 const professional=filter.professional as Record<string,unknown>|undefined;
 invariant(!professional?.roleCode||professional.roleCode===r.roleCode,'REQUIREMENT_ROLE_MISMATCH','专业条件必须属于本岗位职业',422);
 return {...filter,mode:'TALENT',role:r.roleCode,...(r.locationCodes.length?{location:r.locationCodes}:{}),...(professional?{professional:{...professional,roleCode:r.roleCode}}:{})};
}
export class ProjectSelection {
 readonly clock:Clock;readonly config:Config;
 constructor(clock:Clock,config:Config){this.clock=clock;this.config=config;}
 contextKey(item:ShortlistItem){return `project-selection:${item.workspaceId}:${item.shortlistId}:${item.id}`;}
 decode(item:ShortlistItem):SelectionContext|null{return item.selectionCiphertext?parseStrictJson(decryptDraftPayload(item.selectionCiphertext,this.config.contactKey,this.contextKey(item))) as SelectionContext:null;}
 async requirement(tx:Tx,actor:Actor,projectId:string,id:string){const p=await projectFor(tx,actor,projectId,this.clock),r=await workspaceRow(tx,'projectRequirements',id,actor.workspaceId);if(!r||r.projectId!==p.id||r.status==='ERASED')missing();const source=await sourceFor(tx,actor,r.sourceId,this.clock);if(source.revision!==r.sourceRevision)missing();return {p,r};}
 async list(tx:Tx,actor:Actor,projectId:string){requirePermission(actor,'records.read');const p=await projectFor(tx,actor,projectId,this.clock),s=await sourceFor(tx,actor,p.sourceId,this.clock);return {projectId:p.id,projectRevision:p.revision,items:(await tx.find('projectRequirements',{workspaceId:actor.workspaceId,projectId:p.id})).filter(r=>r.status!=='ERASED'&&r.sourceRevision===s.revision).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))};}
 async save(tx:Tx,actor:Actor,projectId:string,input:unknown){requirePermission(actor,'records.write');const d=S.save.parse(input),p=await projectFor(tx,actor,projectId,this.clock);cas(p,d.expectedRevision);editable(p);await checkRole(tx,actor,d.roleCode);
  const s=await sourceFor(tx,actor,p.sourceId,this.clock);invariant(validDay(d.startsOn)&&validDay(d.endsOn)&&(!d.startsOn||!d.endsOn||d.startsOn<=d.endsOn),'REQUIREMENT_DATES','日期范围无效',422);
  invariant(new Set(d.locationCodes).size===d.locationCodes.length,'REQUIREMENT_LOCATIONS','地点不能重复',422);for(const code of d.locationCodes)invariant((await tx.find('dictionary',{workspaceId:actor.workspaceId,namespace:'city',code,status:'ACTIVE'})).length>0,'UNKNOWN_FILTER_CODE','岗位地点不可用',422);
  for(const filter of [d.necessary,d.preferred])await evaluateDirectoryCandidates(tx,actor,this.clock,queryFor(d,filter),[]);
  const all=await tx.find('projectRequirements',{workspaceId:actor.workspaceId,projectId}),old=d.requirementId?all.find(r=>r.id===d.requirementId):null;
  if(d.requirementId){if(!old||old.status==='ERASED')missing();invariant(d.expectedRequirementRevision!==undefined,'REVISION_REQUIRED','请刷新岗位版本',400);cas(old,d.expectedRequirementRevision);}else invariant(all.filter(r=>r.status!=='ERASED').length<30,'REQUIREMENT_LIMIT','每个项目最多30个岗位需求',422);
  const {expectedRevision,requirementId,expectedRequirementRevision,...values}=d;
  const r:ProjectRequirement={...(old?touch(old,this.clock):base(actor.workspaceId,this.clock)),...values,projectId,sourceId:s.id,sourceRevision:s.revision};
  if(old)await tx.replace('projectRequirements',r);else await tx.insert('projectRequirements',r);
  const n=touch(p,this.clock);await tx.replace('projects',n);return n;
 }
 async search(tx:Tx,actor:Actor,projectId:string,input:unknown){requirePermission(actor,'records.read');const d=S.search.parse(input),{r}=await this.requirement(tx,actor,projectId,d.requirementId);cas(r,d.expectedRequirementRevision);invariant(r.status==='ACTIVE','REQUIREMENT_ARCHIVED','请先恢复岗位需求',409);
  const result=await queryTalentDirectory(tx,actor,this.clock,{...queryFor(r,r.necessary),page:d.page??1,pageSize:d.pageSize??20});
  const preferred=Object.keys(r.preferred).length?await evaluateDirectoryCandidates(tx,actor,this.clock,queryFor(r,r.preferred),result.items.map(p=>String(p.id))):[],byId=new Map<string,string[]>(preferred.map(p=>[String(p.id),p.matchingRoleIds as string[]]));
  return {...result,requirementId:r.id,requirementRevision:r.revision,items:result.items.map(p=>({...p,selectionEvidence:{requiredRole:r.roleCode,matchedBy:p.matchedBy??[],works:(p.roleSummaries as any[]??[]).flatMap(s=>s.works),preferredMatch:Object.keys(r.preferred).length?byId.get(String(p.id))?.some(id=>(p.matchingRoleIds as string[]).includes(id))??false:null,questions:r.questions,price:'UNCONFIRMED',availability:'UNCONFIRMED'}}))};
 }
 async link(tx:Tx,actor:Actor,id:string,input:unknown){requirePermission(actor,'records.write');const d=S.link.parse(input),l=await shortlistFor(tx,actor,id,this.clock);cas(l,d.expectedRevision);if(d.projectId){const p=await projectFor(tx,actor,d.projectId,this.clock);editable(p);invariant(p.scopeId===l.scopeId,'PROJECT_LIST_SCOPE_MISMATCH','项目与清单必须使用相同访问范围',422);}
  invariant(!(await tx.find('shortlistItems',{workspaceId:actor.workspaceId,shortlistId:id})).some(i=>!!i.selectionCiphertext)||l.projectId===d.projectId,'PROJECT_CONTEXT_EXISTS','请先明确清理本次候选条件后再变更项目关联',409);
  const n={...touch(l,this.clock),projectId:d.projectId};await tx.replace('shortlists',n);return n;
 }
 async getContext(tx:Tx,actor:Actor,id:string){const list=await new Shortlists(this.clock).get(tx,actor,id),root=(await tx.get('shortlists',id))!;const requirements=root.projectId?await this.list(tx,actor,root.projectId):null,items=[];
  for(const visible of list.items){if(visible.unavailable){items.push({id:visible.id,unavailable:true});continue;}const item=(await tx.get('shortlistItems',visible.id))!,context=this.decode(item),r=requirements?.items.find(r=>r.id===item.requirementId);
   if(context&&!r){items.push({id:item.id,unavailable:true});continue;}
   items.push({id:item.id,revision:item.revision,personRoleId:item.personRoleId,requirementId:item.requirementId??null,requirementRevision:item.requirementRevision??null,stale:!!context&&(!r||r.revision!==item.requirementRevision||r.status!=='ACTIVE'||r.roleCode!==visible.roleCode),context:context?{...context,price:actor.permissions.includes('sensitive.read')?context.price:null,priceRestricted:!!context.price&&!actor.permissions.includes('sensitive.read')}:null});
  }return {canSensitiveWrite:actor.permissions.includes('sensitive.write'),projectId:root.projectId??null,requirements:requirements?.items??[],items};
 }
 async nominate(tx:Tx,actor:Actor,id:string,input:unknown){const d=S.nominate.parse(input),l=await shortlistFor(tx,actor,id,this.clock);if(!l.projectId)missing();const {r}=await this.requirement(tx,actor,l.projectId,d.requirementId);cas(r,d.expectedRequirementRevision);const matches=await evaluateDirectoryCandidates(tx,actor,this.clock,queryFor(r,r.necessary),[d.personId]);invariant(matches.some(p=>p.id===d.personId&&(p.matchingRoleIds as string[]).includes(d.personRoleId)),'CANDIDATE_NO_LONGER_MATCHES','候选人与本次必要条件不符，请重新筛选',409);
 const root=await new Shortlists(this.clock).addItem(tx,actor,id,{expectedRevision:d.expectedRevision,personId:d.personId,personRoleId:d.personRoleId,personRoleRevision:d.personRoleRevision,workId:d.workId,workAssetIds:d.workAssetIds,note:''}),items=await tx.find('shortlistItems',{workspaceId:actor.workspaceId,shortlistId:id}),item=items.find(i=>i.personId===d.personId&&i.personRoleId===d.personRoleId&&i.workId===(d.workId??null))!;
 return this.saveContext(tx,actor,id,{expectedRevision:root.revision,entryId:item.id,expectedItemRevision:item.revision,requirementId:r.id,expectedRequirementRevision:r.revision,recommendation:d.recommendation,questions:r.questions,outcome:'PENDING',availability:null});
 }
 async clearContext(tx:Tx,actor:Actor,id:string,input:unknown){requirePermission(actor,'records.write');const d=S.clear.parse(input),list=await shortlistFor(tx,actor,id,this.clock);cas(list,d.expectedRevision);const item=await workspaceRow(tx,'shortlistItems',d.entryId,actor.workspaceId);if(!item||item.shortlistId!==id)missing();cas(item,d.expectedItemRevision);if(this.decode(item)?.price)requirePermission(actor,'sensitive.write');await tx.replace('shortlistItems',{...touch(item,this.clock),requirementId:null,requirementRevision:null,selectionCiphertext:null});const n=touch(list,this.clock);await tx.replace('shortlists',n);return n;}
 async saveContext(tx:Tx,actor:Actor,id:string,input:unknown){requirePermission(actor,'records.write');const d=S.context.parse(input),list=await shortlistFor(tx,actor,id,this.clock);cas(list,d.expectedRevision);if(!list.projectId)missing();const {r,p}=await this.requirement(tx,actor,list.projectId,d.requirementId);editable(p);cas(r,d.expectedRequirementRevision);invariant(r.status==='ACTIVE','REQUIREMENT_ARCHIVED','岗位已归档',409);
  const visible=await new Shortlists(this.clock).get(tx,actor,id),v=visible.items.find(i=>i.id===d.entryId);if(!v||v.unavailable)missing();const item=(await tx.get('shortlistItems',d.entryId))!;cas(item,d.expectedItemRevision);invariant(item.personRoleId&&v.roleCode===r.roleCode,'REQUIREMENT_ROLE_MISMATCH','候选人的具体职业与岗位不符',422);
  const old=this.decode(item);if(d.price!==undefined)requirePermission(actor,'sensitive.write');invariant(!old?.price||item.requirementId===r.id&&item.requirementRevision===r.revision||d.price!==undefined,'SCOPED_PRICE_RESET_REQUIRED','岗位已变化，请有敏感写权限的成员明确清理或重新确认本次价格',409);
  invariant(!old?.availability||item.requirementId===r.id&&item.requirementRevision===r.revision||d.availability!==undefined,'SCOPED_TIME_RESET_REQUIRED','岗位已变化，请明确清理或重新确认本次时间',409);
  invariant(!d.availability||validDay(d.availability.startsOn)&&validDay(d.availability.endsOn)&&d.availability.startsOn<=d.availability.endsOn,'AVAILABILITY_DATES','本次时间确认范围无效',422);
  const now=this.clock.now().toISOString(),context:SelectionContext={recommendation:d.recommendation,questions:d.questions,outcome:d.outcome,price:d.price===undefined?old?.price??null:d.price?{amountMinor:d.price.amountMinor,currency:d.price.currency,unit:d.price.unit,scope:d.price.scope,confirmedAt:now,confirmedById:actor.membershipId}:null,availability:d.availability===undefined?old?.availability??null:d.availability?{startsOn:d.availability.startsOn,endsOn:d.availability.endsOn,state:d.availability.state,note:d.availability.note,confirmedAt:now,confirmedById:actor.membershipId}:null,updatedAt:now,updatedById:actor.membershipId};
  await tx.replace('shortlistItems',{...touch(item,this.clock),requirementId:r.id,requirementRevision:r.revision,selectionCiphertext:encryptDraftPayload(JSON.stringify(context),this.config.contactKey,this.contextKey(item))});const n=touch(list,this.clock);await tx.replace('shortlists',n);return n;
 }
}
