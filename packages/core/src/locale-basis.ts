import type {LocaleText,LocaleDependency} from './locale-model.ts';
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
  sources.every(d=>d.sourceSubjectId===d.sourceId&&d.personId===null&&d.workId===null&&d.projectId===null&&d.resourceRevision===d.sourceRevision&&d.resourceProtectionEpoch===d.sourceProtectionEpoch&&d.resourceScopeId===d.sourceScopeId&&d.resourceScopeRevision===d.sourceScopeRevision)&&
  roots.every(d=>d.kind==='PERSON'?d.resourceProtectionEpoch!==null:d.resourceProtectionEpoch===null)&&row.sourceDigest===localeBasisDigest(deps);
}
