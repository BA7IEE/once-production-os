import type {LocaleText,LocaleDependency} from './locale-model.ts';
import type {Tx} from './store.ts';
import {digest} from './json.ts';
export {localeBasisDigest,localeStructureValid} from './locale-basis.ts';
import {localeStructureValid} from './locale-basis.ts';
import {importedLocaleBasisValid,LocaleReviewSchema} from './locale-provenance.ts';
export async function inspectLocaleIntegrity(tx:Tx,workspaceId:string){
 const texts=await tx.find('localeTexts',{workspaceId}),deps=await tx.find('localeDependencies',{workspaceId});let relationFailures=0;
 const exists=async(table:'people'|'works'|'projects'|'sources'|'scopes'|'memberships',id:string|null)=>!id||(await tx.get(table,id))?.workspaceId===workspaceId;
 for(const row of texts){
  if(!localeStructureValid(row,deps.filter(d=>d.localeTextId===row.id))||!importedLocaleBasisValid(row))relationFailures++;
  const origin=[row.originalReviewWorkspaceId,row.originalReviewMembershipId,row.originalReviewedAt,row.originalReviewTextDigest].filter(Boolean);if(origin.length!==0&&origin.length!==4)relationFailures++;
  if(row.state==='ERASED'&&(origin.length||row.importedBasis))relationFailures++;
  if(origin.length===4)try{LocaleReviewSchema.parse({workspaceId:row.originalReviewWorkspaceId,membershipId:row.originalReviewMembershipId,reviewedAt:row.originalReviewedAt,textDigest:row.originalReviewTextDigest});}catch{relationFailures++;}
  for(const dep of row.importedBasis?.dependencies??[])if(!await exists('sources',dep.sourceId))relationFailures++;
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
