import {v,uuid,revision,dateIso,type Parsed} from './validation.ts';
import {LocaleDependencySchema,LocaleBasisSchema,importedLocaleBasisValid} from './locale-provenance.ts';
import {localeStructureValid} from './locale-basis.ts';
import type {LocaleText,LocaleDependency} from './locale-model.ts';
export const LOCALE_HISTORY_LIMIT=20;
const snapshot=v.object({id:uuid,workspaceId:uuid,createdAt:dateIso,updatedAt:dateIso,revision,
 personId:uuid,workId:v.nullable(uuid),projectId:v.nullable(uuid),locale:v.enum(['zh','en']),text:v.string(10000,1),state:v.enum(['DRAFT','REVIEWED']),sourceDigest:v.string(64,64,/^[a-f0-9]{64}$/),
 reviewedBy:v.nullable(uuid),reviewedAt:v.nullable(dateIso),originalReviewWorkspaceId:v.nullable(uuid),originalReviewMembershipId:v.nullable(uuid),originalReviewedAt:v.nullable(dateIso),originalReviewTextDigest:v.nullable(v.string(64,64,/^[a-f0-9]{64}$/)),importedBasis:v.nullable(LocaleBasisSchema),dependencies:v.array(LocaleDependencySchema,21,2)
});
export const LocaleHistorySchema=v.array(snapshot,LOCALE_HISTORY_LIMIT);
export type LocaleHistory=Parsed<typeof LocaleHistorySchema>;
export function localeHistorySnapshot(row:LocaleText,deps:LocaleDependency[]):LocaleHistory[number]{
 const {mergeHistory,...rest}=row;
 return snapshot.parse({...rest,originalReviewWorkspaceId:row.originalReviewWorkspaceId??null,originalReviewMembershipId:row.originalReviewMembershipId??null,originalReviewedAt:row.originalReviewedAt??null,originalReviewTextDigest:row.originalReviewTextDigest??null,importedBasis:row.importedBasis??null,dependencies:deps});
}
export function localeHistoryDependencies(row:Pick<LocaleText,'mergeHistory'>){return (row.mergeHistory??[]).flatMap(s=>[...s.dependencies,...s.importedBasis?.dependencies??[]]);}
export function localeHistoryValid(row:LocaleText){
 try{
  const history=LocaleHistorySchema.parse(row.mergeHistory??[]);
  if(row.state==='ERASED')return history.length===0;
  if(history.length&&(!row.personId||row.workId||row.projectId))return false;
  return new Set(history.map(s=>s.workspaceId+':'+s.id+':'+s.revision)).size===history.length&&history.every(s=>Date.parse(s.createdAt)<=Date.parse(s.updatedAt)&&(!s.reviewedAt||Date.parse(s.reviewedAt)>=Date.parse(s.createdAt)&&Date.parse(s.reviewedAt)<=Date.parse(s.updatedAt))&&(!s.originalReviewedAt||Date.parse(s.originalReviewedAt)<=Date.parse(s.updatedAt))&&s.locale===row.locale&&s.workId===null&&s.projectId===null&&localeStructureValid(s,s.dependencies)&&importedLocaleBasisValid(s)&&[s.originalReviewWorkspaceId,s.originalReviewMembershipId,s.originalReviewedAt,s.originalReviewTextDigest].filter(Boolean).length%4===0);
 }catch{return false;}
}
