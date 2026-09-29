import {localeHistoryValid,localeHistoryDependencies} from './locale-history.ts';
import {digest} from './json.ts';
import type {Actor,Clock} from './model.ts';
import type {Tx} from './store.ts';
import type {LocaleText,LocaleDependency} from './locale-model.ts';
import {localeSubject} from './locale-model.ts';
import type {LocaleTransfer} from './locale-transfer.ts';
import {localeBasisDigest,localeStructureValid} from './locale-basis.ts';
import {importedLocaleBasisValid} from './locale-provenance.ts';
import {invariant} from './errors.ts';
import {workspaceRow} from './helpers.ts';
type Subject={id:string;sourceId:string;revision:number};
type Inputs={people:Subject[];works:Subject[];projects:Subject[];sources:Array<{id:string;revision:number}>};
export function validateLocaleRebuild(bundle:LocaleTransfer,inputs:Inputs,clock:Clock){
 const ids=new Set<string>(),owners=new Set<string>(),sources=new Map(inputs.sources.map(s=>[s.id,s]));
 invariant(new Set(bundle.texts.map(t=>t.workspaceId)).size<=1,'LOCALE_REBUILD_WORKSPACE','一次语言迁移只能来自同一原空间',422);
 for(const text of bundle.texts){
  const subject=localeSubject(text),target=(subject.kind==='PERSON'?inputs.people:subject.kind==='WORK'?inputs.works:inputs.projects).find(r=>r.id===subject.id);
  invariant(!!target,'LOCALE_REBUILD_OWNER_MISSING','内部文本所属档案必须同时重建',422);
  const row:LocaleText={...text,reviewedBy:text.state==='REVIEWED'?text.originalReview?.membershipId??null:null,reviewedAt:text.state==='REVIEWED'?text.originalReview?.reviewedAt??null:null};
  invariant(localeStructureValid(row,text.dependencies)&&importedLocaleBasisValid(row)&&localeHistoryValid(row),'LOCALE_REBUILD_GRAPH_INVALID','内部文本依赖或依据摘要不完整',422);
  invariant(!ids.has(text.id)&&!owners.has(subject.kind+subject.id+text.locale),'LOCALE_REBUILD_DUPLICATE','内部文本编号或所属语言重复',422);ids.add(text.id);owners.add(subject.kind+subject.id+text.locale);
  invariant(Date.parse(text.createdAt)<=Date.parse(text.updatedAt)&&Date.parse(text.updatedAt)<=clock.now().getTime(),'LOCALE_REBUILD_TIME','内部文本时间不合法',422);
  invariant(text.state!=='DRAFT'||text.needsReview,'LOCALE_REBUILD_REVIEW_STATE','草稿不能声明已经完成复核',422);
  invariant(text.state!=='REVIEWED'||(text.originalReview?.workspaceId===text.workspaceId&&text.originalReview?.textDigest===digest(text.text)),'LOCALE_REBUILD_REVIEW_TEXT','原复核不对应这份正文',422);
  const review=text.originalReview,priorReview=review&&text.mergeHistory.some(h=>{
   const original=h.reviewedBy?{workspaceId:h.workspaceId,membershipId:h.reviewedBy,reviewedAt:h.reviewedAt,textDigest:digest(h.text)}:{workspaceId:h.originalReviewWorkspaceId,membershipId:h.originalReviewMembershipId,reviewedAt:h.originalReviewedAt,textDigest:h.originalReviewTextDigest};
   return digest(original)===digest(review);
  });
  invariant(!review||(Date.parse(review.reviewedAt)>=Date.parse(text.createdAt)||priorReview)&&Date.parse(review.reviewedAt)<=Date.parse(text.updatedAt),'LOCALE_REBUILD_REVIEW_TIME','原复核时间不合法',422);
  for(const dep of text.dependencies){
   invariant(!ids.has(dep.id),'LOCALE_REBUILD_DUPLICATE','内部文本依赖编号重复',422);ids.add(dep.id);
   invariant(dep.localeTextId===text.id&&dep.workspaceId===text.workspaceId,'LOCALE_REBUILD_WORKSPACE','内部文本依赖必须属于原空间和原文本',422);
   const source=sources.get(dep.sourceId);invariant(!!source&&dep.sourceRevision<=source.revision,'LOCALE_REBUILD_SOURCE_MISSING','内部文本依赖的来源或来源版本未包含在重建清单中',422);
   if(dep.kind!=='SOURCE')invariant(dep.sourceId===target.sourceId&&dep.resourceRevision<=target.revision,'LOCALE_REBUILD_ROOT_INVALID','内部文本归属快照与档案不符',422);
   else invariant(dep.resourceRevision===dep.sourceRevision&&dep.resourceProtectionEpoch===dep.sourceProtectionEpoch&&dep.resourceScopeId===dep.sourceScopeId&&dep.resourceScopeRevision===dep.sourceScopeRevision,'LOCALE_REBUILD_SOURCE_SNAPSHOT','内部文本来源快照不一致',422);
   invariant(Date.parse(dep.createdAt)<=Date.parse(dep.updatedAt)&&Date.parse(dep.updatedAt)<=clock.now().getTime(),'LOCALE_REBUILD_TIME','内部文本依赖时间不合法',422);
  }
  for(const saved of text.mergeHistory)invariant(Date.parse(saved.createdAt)<=Date.parse(saved.updatedAt)&&Date.parse(saved.updatedAt)<=clock.now().getTime(),'LOCALE_REBUILD_HISTORY_TIME','合并历史时间不合法',422);
  for(const dep of localeHistoryDependencies(row))invariant(text.dependencies.some(d=>d.kind==='SOURCE'&&d.sourceId===dep.sourceId),'LOCALE_REBUILD_HISTORY_SOURCE_MISSING','合并历史来源不得从当前依据中移除',422);
  for(const dep of [...text.importedBasis?.dependencies??[],...localeHistoryDependencies(row)])invariant(sources.has(dep.sourceId)&&dep.sourceRevision<=sources.get(dep.sourceId)!.revision,'LOCALE_REBUILD_HISTORY_SOURCE_MISSING','原迁移依据的来源须同时包含',422);
 }
}
export async function applyLocaleRebuild(tx:Tx,actor:Actor,clock:Clock,bundle:LocaleTransfer){
 for(const text of bundle.texts){
  const subject=localeSubject(text),target=await workspaceRow(tx,subject.kind==='PERSON'?'people':subject.kind==='WORK'?'works':'projects',subject.id,actor.workspaceId);invariant(!!target,'LOCALE_REBUILD_OWNER_MISSING','内部文本所属档案不存在',422);
  const deps:LocaleDependency[]=[];
  for(const old of text.dependencies){
   const resource=old.kind==='SOURCE'?await workspaceRow(tx,'sources',old.sourceId,actor.workspaceId):target;invariant(!!resource,'LOCALE_REBUILD_SOURCE_MISSING','内部文本来源不存在',422);
   const source=await workspaceRow(tx,'sources',old.sourceId,actor.workspaceId),scope=await workspaceRow(tx,'scopes',resource.scopeId,actor.workspaceId);invariant(!!source&&!!scope,'LOCALE_REBUILD_SOURCE_MISSING','内部文本来源范围不存在',422);
   const sourceScope=await workspaceRow(tx,'scopes',source.scopeId,actor.workspaceId);invariant(!!sourceScope,'LOCALE_REBUILD_SOURCE_MISSING','内部文本来源范围不存在',422);
   deps.push({...old,workspaceId:actor.workspaceId,sourceRevision:source.revision,sourceProtectionEpoch:source.protectionEpoch,sourceScopeId:source.scopeId,sourceScopeRevision:sourceScope.revision,resourceRevision:resource.revision,resourceProtectionEpoch:'protectionEpoch' in resource?resource.protectionEpoch:null,resourceScopeId:resource.scopeId,resourceScopeRevision:scope.revision});
  }
  const row:LocaleText={id:text.id,workspaceId:actor.workspaceId,createdAt:text.createdAt,updatedAt:clock.now().toISOString(),revision:text.revision,personId:text.personId,workId:text.workId,projectId:text.projectId,locale:text.locale,text:text.text,state:'DRAFT',sourceDigest:localeBasisDigest(deps),reviewedBy:null,reviewedAt:null,
   originalReviewWorkspaceId:text.originalReview?.workspaceId??null,originalReviewMembershipId:text.originalReview?.membershipId??null,originalReviewedAt:text.originalReview?.reviewedAt??null,originalReviewTextDigest:text.originalReview?.textDigest??null,
   mergeHistory:text.mergeHistory,importedBasis:text.importedBasis??{workspaceId:text.workspaceId,sourceDigest:text.sourceDigest,textDigest:digest(text.text),dependencies:text.dependencies}};
  await tx.insert('localeTexts',row);for(const dep of deps)await tx.insert('localeDependencies',dep);
 }
}
