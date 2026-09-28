import type {LocaleText,LocaleDependency} from './locale-model.ts';
import type {Tx} from './store.ts';
import {digest} from './json.ts';
export function localeBasisDigest(rows:LocaleDependency[]){
 return digest(rows.map(({id,localeTextId,createdAt,updatedAt,revision,...row})=>row).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
export function localeStructureValid(row:LocaleText,deps:LocaleDependency[]){
 const roots=deps.filter(d=>d.kind!=='SOURCE'),sources=deps.filter(d=>d.kind==='SOURCE');
 if(row.state==='ERASED')return row.text===''&&deps.length===0&&row.reviewedBy===null&&row.reviewedAt===null;
 return [row.personId,row.workId,row.projectId].filter(Boolean).length===1&&['zh','en'].includes(row.locale)&&['DRAFT','REVIEWED'].includes(row.state)&&row.text.length>0&&row.text.length<=10000&&
  (row.state==='REVIEWED'?!!row.reviewedBy&&!!row.reviewedAt:row.reviewedBy===null&&row.reviewedAt===null)&&
  roots.length===1&&sources.length>=1&&sources.length<=20&&new Set(sources.map(d=>d.sourceId)).size===sources.length&&deps.every(d=>d.workspaceId===row.workspaceId&&d.localeTextId===row.id)&&
  roots.every(d=>d.personId===row.personId&&d.workId===row.workId&&d.projectId===row.projectId&&d.sourceSubjectId===null&&d.kind===(row.personId?'PERSON':row.workId?'WORK':'PROJECT'))&&
  sources.every(d=>d.sourceSubjectId===d.sourceId&&d.personId===null&&d.workId===null&&d.projectId===null)&&row.sourceDigest===localeBasisDigest(deps);
}
export async function inspectLocaleIntegrity(tx:Tx,workspaceId:string){
 const texts=await tx.find('localeTexts',{workspaceId}),deps=await tx.find('localeDependencies',{workspaceId});let relationFailures=0;
 const exists=async(table:'people'|'works'|'projects'|'sources'|'scopes'|'memberships',id:string|null)=>!id||(await tx.get(table,id))?.workspaceId===workspaceId;
 for(const row of texts){
  if(!localeStructureValid(row,deps.filter(d=>d.localeTextId===row.id)))relationFailures++;
  for(const [table,id] of [['people',row.personId],['works',row.workId],['projects',row.projectId],['memberships',row.reviewedBy]] as const)if(!await exists(table,id))relationFailures++;
 }
 for(const dep of deps){
  if(!texts.some(r=>r.id===dep.localeTextId))relationFailures++;
  for(const [table,id] of [['people',dep.personId],['works',dep.workId],['projects',dep.projectId],['sources',dep.sourceSubjectId],['sources',dep.sourceId],['scopes',dep.sourceScopeId],['scopes',dep.resourceScopeId]] as const)if(!await exists(table,id))relationFailures++;
  if(![dep.revision,dep.sourceRevision,dep.sourceProtectionEpoch,dep.sourceScopeRevision,dep.resourceRevision,dep.resourceScopeRevision].every(v=>Number.isInteger(v)&&v>0)||(dep.resourceProtectionEpoch!==null&&(!Number.isInteger(dep.resourceProtectionEpoch)||dep.resourceProtectionEpoch<1)))relationFailures++;
 }
 const sorted=<T extends {id:string}>(rows:T[])=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
 return {textCount:texts.length,dependencyCount:deps.length,relationFailures,graphDigest:digest({texts:sorted(texts),dependencies:sorted(deps)}),blockers:relationFailures?['LOCALE_GRAPH_INVALID']:[]};
}
