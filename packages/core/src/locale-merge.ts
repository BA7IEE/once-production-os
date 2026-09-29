import type {Actor,Clock} from './model.ts';
import type {Tx} from './store.ts';
import type {LocaleText,LocaleDependency} from './locale-model.ts';
import {LocaleTexts} from './locale.ts';
import {localeHistorySnapshot,LOCALE_HISTORY_LIMIT,type LocaleHistory} from './locale-history.ts';
import {digest} from './json.ts';
import {AppError,invariant} from './errors.ts';
import {sourceFor} from './policy.ts';
import {touch,workspaceRow} from './helpers.ts';
export type LocaleMergeChoice={locale:'zh'|'en';selectedTextId:string};
type Entry={row:LocaleText;deps:LocaleDependency[]};
export type LocaleMergePlan={entries:Entry[];digest:string;blockers:string[];preview:Array<{locale:'zh'|'en';options:Array<{id:string;personId:string;text:string;state:string}>}>};
export async function scanLocaleMerge(tx:Tx,actor:Actor,clock:Clock,canonicalId:string,duplicateId:string):Promise<LocaleMergePlan>{
 const rows=(await tx.find('localeTexts',{workspaceId:actor.workspaceId})).filter(r=>r.state!=='ERASED'&&(r.personId===canonicalId||r.personId===duplicateId)).sort((a,b)=>a.id.localeCompare(b.id));
 const canonicalPerson=(await tx.get('people',canonicalId))!,canonicalSource=canonicalPerson.sourceId;
 const domain=new LocaleTexts(clock),entries:Entry[]=[],blockers:string[]=[];
 for(const row of rows)try{const access=await domain.access(tx,actor,row.id);if(access.securityChanged){blockers.push('LOCALE_MERGE_RESTRICTED');continue;}entries.push({row,deps:[...access.deps].sort((a,b)=>a.id.localeCompare(b.id))});}catch(e){if(e instanceof AppError&&(e.status===403||e.status===404)){blockers.push('LOCALE_MERGE_RESTRICTED');continue;}throw e;}
 for(const lang of ['zh','en'] as const){
  const group=entries.filter(e=>e.row.locale===lang),history=group.flatMap(e=>[...e.row.mergeHistory??[],localeHistorySnapshot(e.row,e.deps)]);
  if(history.length>LOCALE_HISTORY_LIMIT||new Set([canonicalSource,...history.flatMap(s=>[...s.dependencies,...s.importedBasis?.dependencies??[]]).map(d=>d.sourceId)]).size>20)blockers.push('LOCALE_MERGE_LIMIT');
 }
 const sourceIds=new Set(entries.flatMap(e=>e.deps.map(d=>d.sourceId))),sources=[],scopes=[];
 const scopeIds=new Set([canonicalPerson.scopeId,...entries.flatMap(e=>e.deps.map(d=>d.resourceScopeId))]);
 for(const id of [...sourceIds].sort()){const source=await sourceFor(tx,actor,id,clock);sources.push(source);scopeIds.add(source.scopeId);}
 for(const id of [...scopeIds].sort())scopes.push(await tx.get('scopes',id));
 return {entries,digest:digest({entries,sources,scopes}),blockers,preview:blockers.length?[]:(['zh','en'] as const).flatMap(locale=>{const options=entries.filter(e=>e.row.locale===locale).map(({row})=>({id:row.id,personId:row.personId!,text:row.text,state:row.state}));return options.length?[{locale,options}]:[];})};
}
export async function applyLocaleMerge(tx:Tx,actor:Actor,clock:Clock,plan:LocaleMergePlan,canonicalId:string,duplicateId:string,choices:LocaleMergeChoice[]){
 invariant(choices.length===plan.preview.length&&new Set(choices.map(c=>c.locale)).size===choices.length&&plan.preview.every(g=>choices.some(c=>c.locale===g.locale&&g.options.some(o=>o.id===c.selectedTextId))),'LOCALE_MERGE_DECISIONS_INCOMPLETE','请逐种语言选择合并后使用的文本',422);
 const domain=new LocaleTexts(clock),results=[];
 const canonical=await workspaceRow(tx,'people',canonicalId,actor.workspaceId);invariant(!!canonical,'LOCALE_MERGE_PERSON_MISSING','主档案不存在',409);
 for(const choice of choices){
  const entries=plan.entries.filter(e=>e.row.locale===choice.locale),selected=entries.find(e=>e.row.id===choice.selectedTextId)!,existing=entries.find(e=>e.row.personId===canonicalId);
  const history:LocaleHistory=entries.flatMap(e=>[...e.row.mergeHistory??[],localeHistorySnapshot(e.row,e.deps)]);
  invariant(history.length<=LOCALE_HISTORY_LIMIT,'LOCALE_MERGE_LIMIT','合并保留文本超过当前上限',422);
  const sourceIds=new Set([canonical.sourceId,...history.flatMap(s=>[...s.dependencies,...s.importedBasis?.dependencies??[]]).map(d=>d.sourceId)]);
  invariant(sourceIds.size<=20,'LOCALE_MERGE_LIMIT','合并文本引用来源超过当前上限',422);
  const sourceRefs=[];for(const id of [...sourceIds].sort()){const source=await sourceFor(tx,actor,id,clock);sourceRefs.push({id,expectedRevision:source.revision});}
  // Called after parent revisions change. The preview already checked the entire old graph.
  let next=existing?await domain.replaceAfterMerge(tx,actor,existing.row,{text:selected.row.text,expectedSubjectRevision:canonical.revision,sourceRefs,confirmCurrentBasis:false}):await domain.create(tx,actor,{subjectKind:'PERSON',subjectId:canonicalId,locale:choice.locale,text:selected.row.text,expectedSubjectRevision:canonical.revision,sourceRefs,confirmCurrentBasis:false});
  next={...next,mergeHistory:history,importedBasis:selected.row.personId===canonicalId?selected.row.importedBasis??null:null,
   originalReviewWorkspaceId:selected.row.reviewedBy?selected.row.workspaceId:selected.row.originalReviewWorkspaceId??null,
   originalReviewMembershipId:selected.row.reviewedBy??selected.row.originalReviewMembershipId??null,
   originalReviewedAt:selected.row.reviewedAt??selected.row.originalReviewedAt??null,
   originalReviewTextDigest:selected.row.reviewedBy?digest(selected.row.text):selected.row.originalReviewTextDigest??null};
  await tx.replace('localeTexts',next);
  for(const {row} of entries)if(row.personId===duplicateId){for(const d of await tx.find('localeDependencies',{workspaceId:actor.workspaceId,localeTextId:row.id}))await tx.remove('localeDependencies',d.id);await tx.replace('localeTexts',{...touch(row,clock),state:'ERASED',text:'',reviewedBy:null,reviewedAt:null,originalReviewWorkspaceId:null,originalReviewMembershipId:null,originalReviewedAt:null,originalReviewTextDigest:null,importedBasis:null,mergeHistory:null});}
  results.push({locale:choice.locale,selectedTextId:choice.selectedTextId,resultTextId:next.id,retainedTextCount:history.length});
 }
 return results;
}
