import type {Person} from './model.ts';
import type {TalentQueryRow} from './search-query-model.ts';
import {digest} from './json.ts';
import {asRow} from './talent-v2-graph.ts';
import {OWNER_KEYS,type FactTable} from './talent-v2-schema.ts';
import {professionallyManaged,legacyProfessionalProjection,LEGACY_PROFESSIONAL_FIELDS,type TalentGraph} from './talent-legacy-projection.ts';

/** Phase C mixed datasets use the same bounded, current permission snapshot as TD2.
 * Entirely legacy datasets retain their existing SQL query/aggregation path. */
export function compatibleTalentSearch(graph:TalentGraph,query:Record<string,string>){
 if(!graph.rows('people').some(p=>p.status!=='ERASED'&&professionallyManaged(p,graph)))return null;
 const rows:TalentQueryRow[]=[],latestByPerson=new Map<string,string>();
 const q=query.q?.toLocaleLowerCase()??'';
 for(const person of graph.rows('people')){
  // Preserve the old search's native basic-source boundary; handoffs do not grant this endpoint.
  if(!graph.visibility.personVisible(person))continue;
  const projection=legacyProfessionalProjection(person,graph),p:Person={...person,...projection};
  if(q&&![p.displayName,...p.aliases].some(value=>value.toLocaleLowerCase().includes(q)))continue;
  if(query.role&&!p.roles.includes(query.role)||query.cityCode&&p.cityCode!==query.cityCode||query.languageCode&&!p.languageCodes.includes(query.languageCode)||query.skillCode&&!p.skillCodes.includes(query.skillCode)||query.status&&p.status!==query.status)continue;
  const workIds=new Set(graph.rows('workCredits').filter(c=>c.personId===p.id&&(!query.role||c.roleCode===query.role)).map(c=>c.workId));
  const works=graph.rows('works').filter(w=>workIds.has(w.id)&&w.status!=='ERASED'&&graph.visibility.scopeVisible(w.scopeId)&&graph.sourceUsable(w.sourceId)&&!graph.visibility.blocked('WORK',w.id));
  if((query.industryCode||query.workTypeCode)&&!works.some(w=>(!query.industryCode||w.industryCode===query.industryCode)&&(!query.workTypeCode||w.workTypeCodes.includes(query.workTypeCode))))continue;
  const projectIds=new Set(graph.rows('projectParticipants').filter(r=>r.personId===p.id&&r.state==='ACTUAL'&&(!query.role||r.roleCode===query.role)).map(r=>r.projectId));
  const projects=graph.rows('projects').filter(r=>projectIds.has(r.id)&&r.status!=='ERASED'&&graph.visibility.scopeVisible(r.scopeId)&&graph.sourceUsable(r.sourceId)&&!graph.visibility.blocked('PROJECT',r.id));
  if(query.actualProject&&!projects.length)continue;
  rows.push({person:p,actualProjectCount:projects.length,industryCodes:[...new Set(works.map(w=>w.industryCode).filter((v):v is string=>!!v))].sort(),workTypeCodes:[...new Set(works.flatMap(w=>w.workTypeCodes))].sort()});
 }
 const selected=new Map(rows.map(r=>[r.person.id,r.person]));
 for(const evidence of graph.rows('evidence')){
  const source=graph.source(evidence.sourceId);if(!evidence.reviewedAt||!source||!graph.sourceUsable(source.id)||source.revision!==evidence.sourceRevision)continue;
  const owner=Object.entries(OWNER_KEYS).find(([,key])=>typeof asRow(evidence)[key]==='string');if(!owner)continue;
  let personId:string,value:unknown;
  if(owner[0]==='person'){
   personId=String(asRow(evidence)[owner[1]]);const person=graph.rows('people').find(p=>p.id===personId);if(!person||!selected.has(personId))continue;
   if(professionallyManaged(person,graph)&&(LEGACY_PROFESSIONAL_FIELDS as readonly string[]).includes(evidence.fieldPath))continue;
   value=asRow(person)[evidence.fieldPath];
  }else{
   const table=owner[0] as FactTable,fact=graph.fact(table,String(asRow(evidence)[owner[1]]));if(!fact||!selected.has(fact.personId))continue;
   const view=graph.project(table,fact);if(!view||view.usable!==true||!Object.hasOwn(view,evidence.fieldPath))continue;
   personId=fact.personId;value=fact[evidence.fieldPath];
  }
  if(digest(value??null)!==evidence.valueDigest)continue;
  const previous=latestByPerson.get(personId);if(!previous||previous<evidence.reviewedAt)latestByPerson.set(personId,evidence.reviewedAt);
 }
 rows.sort((a,b)=>b.person.updatedAt.localeCompare(a.person.updatedAt)||a.person.id.localeCompare(b.person.id));
 return {rows,latestByPerson};
}
