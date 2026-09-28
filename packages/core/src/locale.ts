import type {Actor,Clock,Person,TableMap} from './model.ts';
import type {Tx} from './store.ts';
import {AppError,invariant,missing} from './errors.ts';
import {base,cas,page,touch,workspaceRow} from './helpers.ts';
import {localeBasisDigest,localeStructureValid} from './locale-integrity.ts';
import {personFor,requirePermission,sourceFor} from './policy.ts';
import {workFor,projectFor} from './production-policy.ts';
import {localeSubject,type LocaleSubjectKind,type LocaleText,type LocaleDependency} from './locale-model.ts';
import {LocaleSchemas as S,localeSubjectKind} from './locale-validation.ts';
import {uuid} from './validation.ts';
const human=(actor:Actor)=>invariant(actor.actorKind!=='MACHINE','HUMAN_TEXT_REQUIRED','内部语言文本需要成员维护',403);
export async function localeTarget(tx:Tx,actor:Actor,kind:LocaleSubjectKind,id:string,clock:Clock){
 requirePermission(actor,'records.read');const row=kind==='PERSON'?await personFor(tx,actor,id,clock):kind==='WORK'?await workFor(tx,actor,id,clock):await projectFor(tx,actor,id,clock);if(row.status==='ERASED')missing();return row;
}
export class LocaleTexts{
 readonly clock:Clock;
 constructor(clock:Clock){this.clock=clock;}
 private async dependencies(tx:Tx,actor:Actor,kind:LocaleSubjectKind,id:string,expectedRevision:number,refs:Array<{id:string;expectedRevision:number}>,localeTextId:string){
  const target=await localeTarget(tx,actor,kind,id,this.clock);cas(target,expectedRevision);invariant(target.status!=='ARCHIVED','RECORD_ARCHIVED','请先恢复档案再维护语言文本',409);
  invariant(new Set(refs.map(r=>r.id)).size===refs.length,'DUPLICATE_SOURCE_REF','依据来源不能重复',400);
  // The parent source remains an explicit dependency. A retained identity alone
  // does not authorize reusing text derived from its erased original source.
  const snapshots:LocaleDependency[]=[];
  const capture=async(k:LocaleDependency['kind'],row:Person|TableMap['works']|TableMap['projects']|TableMap['sources'],source:TableMap['sources'])=>{
   const scope=(await workspaceRow(tx,'scopes',row.scopeId,actor.workspaceId)),sourceScope=(await workspaceRow(tx,'scopes',source.scopeId,actor.workspaceId));if(!scope||!sourceScope)missing();
   snapshots.push({...base(actor.workspaceId,this.clock),localeTextId,kind:k,personId:k==='PERSON'?row.id:null,workId:k==='WORK'?row.id:null,projectId:k==='PROJECT'?row.id:null,sourceSubjectId:k==='SOURCE'?row.id:null,sourceId:source.id,sourceRevision:source.revision,sourceProtectionEpoch:source.protectionEpoch,sourceScopeId:source.scopeId,sourceScopeRevision:sourceScope.revision,resourceRevision:row.revision,resourceProtectionEpoch:'protectionEpoch' in row?row.protectionEpoch:null,resourceScopeId:row.scopeId,resourceScopeRevision:scope.revision});
  };
  const origin=await sourceFor(tx,actor,target.sourceId,this.clock);await capture(kind,target,origin);
  for(const ref of [...refs].sort((a,b)=>a.id.localeCompare(b.id))){const source=await sourceFor(tx,actor,ref.id,this.clock);cas(source,ref.expectedRevision);await capture('SOURCE',source,source);}
  return snapshots;
 }
 async access(tx:Tx,actor:Actor,id:string){
  human(actor);requirePermission(actor,'records.read');const row=await workspaceRow(tx,'localeTexts',id,actor.workspaceId);if(!row||row.state==='ERASED')missing();const subject=localeSubject(row),target=await localeTarget(tx,actor,subject.kind,subject.id,this.clock);
  const deps=await tx.find('localeDependencies',{workspaceId:actor.workspaceId,localeTextId:id});invariant(localeStructureValid(row,deps),'LOCALE_DEPENDENCIES_MISSING','语言文本依据不完整，需要维护检查',409);
  let needsReview=row.state!=='REVIEWED',securityChanged=false;
  for(const dep of deps){
   const current=dep.kind==='SOURCE'?await sourceFor(tx,actor,dep.sourceSubjectId!,this.clock):await localeTarget(tx,actor,dep.kind,(dep.personId??dep.workId??dep.projectId)!,this.clock);
   const source=dep.kind==='SOURCE'?current as TableMap['sources']:await sourceFor(tx,actor,('sourceId' in current?current.sourceId:''),this.clock);if(!source)missing();
   const resourceScope=await workspaceRow(tx,'scopes',current.scopeId,actor.workspaceId),sourceScope=await workspaceRow(tx,'scopes',source.scopeId,actor.workspaceId);if(!resourceScope||!sourceScope)missing();
   needsReview ||= current.revision!==dep.resourceRevision||source.revision!==dep.sourceRevision;
   securityChanged ||= source.id!==dep.sourceId||source.protectionEpoch!==dep.sourceProtectionEpoch||source.scopeId!==dep.sourceScopeId||sourceScope.revision!==dep.sourceScopeRevision||current.scopeId!==dep.resourceScopeId||resourceScope.revision!==dep.resourceScopeRevision||('protectionEpoch' in current?current.protectionEpoch:null)!==dep.resourceProtectionEpoch;
  }
  return {row,subject,target,deps,needsReview:needsReview||securityChanged,securityChanged};
 }
 async get(tx:Tx,actor:Actor,id:string){
  const {row,subject,target,deps,needsReview,securityChanged}=await this.access(tx,actor,id);
  return {id:row.id,revision:row.revision,subjectKind:subject.kind,subjectId:subject.id,subjectRevision:target.revision,locale:row.locale,text:securityChanged?'':row.text,state:row.state,needsReview,textRestricted:securityChanged,reviewedAt:row.reviewedAt,reviewedBy:row.reviewedBy,updatedAt:row.updatedAt,canEdit:actor.permissions.includes('records.write')&&target.status!=='ARCHIVED',sources:deps.filter(d=>d.kind==='SOURCE').map(d=>({id:d.sourceId,revision:d.sourceRevision})),note:'内部语言文本的人工确认，不代表原事实已经核验。'};
 }
 async list(tx:Tx,actor:Actor,query:Record<string,string>){
  human(actor);page([],query,['subjectKind','subjectId']);const kind=localeSubjectKind.parse(query.subjectKind),id=uuid.parse(query.subjectId);await localeTarget(tx,actor,kind,id,this.clock);
  const key=kind==='PERSON'?'personId':kind==='WORK'?'workId':'projectId',result=[];
  for(const row of await tx.find('localeTexts',{workspaceId:actor.workspaceId,[key]:id}))if(row.state!=='ERASED'){
   try{result.push(await this.get(tx,actor,row.id));}catch(e){if(!(e instanceof AppError&&e.status===404))throw e;}
  }
  result.sort((a,b)=>a.locale.localeCompare(b.locale)||a.id.localeCompare(b.id));return page(result,query,['subjectKind','subjectId']);
 }
 async create(tx:Tx,actor:Actor,input:unknown){
  human(actor);requirePermission(actor,'records.write');const d=S.create.parse(input),key=d.subjectKind==='PERSON'?'personId':d.subjectKind==='WORK'?'workId':'projectId';
  const row:LocaleText={...base(actor.workspaceId,this.clock),personId:null,workId:null,projectId:null,[key]:d.subjectId,locale:d.locale,text:d.text,state:d.confirmCurrentBasis?'REVIEWED':'DRAFT',sourceDigest:'',reviewedBy:d.confirmCurrentBasis?actor.membershipId:null,reviewedAt:d.confirmCurrentBasis?this.clock.now().toISOString():null};
  const deps=await this.dependencies(tx,actor,d.subjectKind,d.subjectId,d.expectedSubjectRevision,d.sourceRefs,row.id);
  invariant(!(await tx.find('localeTexts',{workspaceId:actor.workspaceId,[key]:d.subjectId,locale:d.locale})).some(r=>r.state!=='ERASED'),'LOCALE_EXISTS','该语言已有内部文本，请编辑已有版本',409);
  row.sourceDigest=localeBasisDigest(deps);await tx.insert('localeTexts',row);for(const dep of deps)await tx.insert('localeDependencies',dep);return row;
 }
 async update(tx:Tx,actor:Actor,id:string,input:unknown){
  human(actor);requirePermission(actor,'records.write');const d=S.update.parse(input);
  // Recheck the entire old graph first: hidden sources or broken dependencies
  // cannot be removed by replacing the text and submitting different sources.
  const {row,subject}=await this.access(tx,actor,id);cas(row,d.expectedRevision);
  const deps=await this.dependencies(tx,actor,subject.kind,subject.id,d.expectedSubjectRevision,d.sourceRefs,id),next={...touch(row,this.clock),text:d.text,state:d.confirmCurrentBasis?'REVIEWED' as const:'DRAFT' as const,sourceDigest:localeBasisDigest(deps),reviewedBy:d.confirmCurrentBasis?actor.membershipId:null,reviewedAt:d.confirmCurrentBasis?this.clock.now().toISOString():null};
  for(const dep of await tx.find('localeDependencies',{workspaceId:actor.workspaceId,localeTextId:id}))await tx.remove('localeDependencies',dep.id);for(const dep of deps)await tx.insert('localeDependencies',dep);await tx.replace('localeTexts',next);return next;
 }
}
