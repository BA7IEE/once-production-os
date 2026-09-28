import {localeHistoryDependencies} from './locale-history.ts';
import type {Actor,Clock} from './model.ts';
import type {Tx} from './store.ts';
import type {DeletionItem,DeletionTargetKind} from './deletion-model.ts';
import {localeSubject} from './locale-model.ts';
import {digest} from './json.ts';
import {invariant,missing} from './errors.ts';
import {requirePermission,requireScope} from './policy.ts';
import {touch,workspaceRow} from './helpers.ts';
export type LocaleTargets=Array<[DeletionTargetKind,Set<string>]>;
export async function affectedLocales(tx:Tx,workspaceId:string,targets:LocaleTargets){
 const selected=new Map(targets),ids=new Set<string>();
 for(const d of await tx.find('localeDependencies',{workspaceId}))if(selected.get('SOURCE')?.has(d.sourceId)||selected.get('SOURCE')?.has(d.sourceSubjectId??'')||selected.get('PERSON')?.has(d.personId??'')||selected.get('WORK')?.has(d.workId??'')||selected.get('PROJECT')?.has(d.projectId??''))ids.add(d.localeTextId);
 for(const row of await tx.find('localeTexts',{workspaceId}))if(row.state!=='ERASED'){
  const subject=localeSubject(row);if(selected.get(subject.kind)?.has(subject.id))ids.add(row.id);
  for(const dep of [...row.importedBasis?.dependencies??[],...localeHistoryDependencies(row)])if(selected.get('SOURCE')?.has(dep.sourceId)||selected.get('PERSON')?.has(dep.personId??'')||selected.get('WORK')?.has(dep.workId??'')||selected.get('PROJECT')?.has(dep.projectId??''))ids.add(row.id);
 }
 return [...ids].sort();
}
export async function localeErasureSnapshot(tx:Tx,actor:Actor,id:string){
 requirePermission(actor,'records.read');const row=await workspaceRow(tx,'localeTexts',id,actor.workspaceId);if(!row||row.state==='ERASED')missing();
 const deps=(await tx.find('localeDependencies',{workspaceId:actor.workspaceId,localeTextId:id})).sort((a,b)=>a.id.localeCompare(b.id)),subject=localeSubject(row),table=subject.kind==='PERSON'?'people':subject.kind==='WORK'?'works':'projects';
 const target=await workspaceRow(tx,table,subject.id,actor.workspaceId);if(!target)missing();const scopeIds=new Set([target.scopeId]);
 for(const d of deps){
  const source=await workspaceRow(tx,'sources',d.sourceId,actor.workspaceId);if(!source)missing();scopeIds.add(source.scopeId);scopeIds.add(d.resourceScopeId);scopeIds.add(d.sourceScopeId);
 }
 for(const dep of localeHistoryDependencies(row))if(dep.workspaceId===actor.workspaceId){scopeIds.add(dep.sourceScopeId);scopeIds.add(dep.resourceScopeId);}
 const scopes=[];for(const id of [...scopeIds].sort()){await requireScope(tx,actor,id);const scope=await workspaceRow(tx,'scopes',id,actor.workspaceId);if(!scope)missing();scopes.push(scope);}
 return {row,deps,detailCode:'LOCALE_TEXT_'+digest({row,deps,scopes})};
}
export async function validateLocaleErasurePlan(tx:Tx,actor:Actor,items:DeletionItem[]){
 for(const item of items)if(item.resourceKind==='localeText'&&item.cleanupState!=='DONE'){
  invariant(item.decision==='APPLY_PROPOSED','LOCALE_RETENTION_REQUIRES_NEW_TEXT','依赖被删除的内部文本需要清除，不能仅更换来源保留',409);
  const current=await localeErasureSnapshot(tx,actor,item.resourceId);invariant(current.detailCode===item.detailCode,'LOCALE_ERASURE_STALE','内部语言文本或依据范围已变化，请重新核对清理计划',409);
 }
}
export async function eraseLocale(tx:Tx,actor:Actor,item:DeletionItem,clock:Clock){
 const row=await workspaceRow(tx,'localeTexts',item.resourceId,actor.workspaceId);if(!row||row.state==='ERASED')return;
 await validateLocaleErasurePlan(tx,actor,[item]);for(const d of await tx.find('localeDependencies',{workspaceId:actor.workspaceId,localeTextId:row.id}))await tx.remove('localeDependencies',d.id);
 await tx.replace('localeTexts',{...touch(row,clock),state:'ERASED',text:'',reviewedBy:null,reviewedAt:null,originalReviewWorkspaceId:null,originalReviewMembershipId:null,originalReviewedAt:null,originalReviewTextDigest:null,importedBasis:null,mergeHistory:null});
}
export async function assertLocaleFinalizationClean(tx:Tx,workspaceId:string,kind:DeletionTargetKind,id:string){
 const remaining=await affectedLocales(tx,workspaceId,[[kind,new Set([id])]]);invariant(remaining.length===0,'LOCALE_DEPENDENCIES_REMAIN','内部语言文本的依赖尚未清理，不能完成删除',409);
}
