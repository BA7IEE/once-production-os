import type {Person} from './model.ts';
import type {FactTable,FactRow} from './talent-v2-schema.ts';
import type {loadTalentGraph} from './talent-v2-graph.ts';
export const LEGACY_PROFESSIONAL_FIELDS=['roles','cityCode','languageCodes','skillCodes','heightCm'] as const;
export type TalentGraph=Awaited<ReturnType<typeof loadTalentGraph>>;
/** Legacy-only records remain readable during Phase C. Enrolled records and ordinary TD2
 * contacts never fall back to stale flat facts, including after a typed fact is revoked. */
export function professionallyManaged(person:Person,graph:TalentGraph):boolean{
 return person.roles.length===0 || graph.rows('talentProfiles').some(row=>row.personId===person.id);
}
export function legacyProfessionalProjection(person:Person,graph:TalentGraph){
 if(!professionallyManaged(person,graph))return {professionalManaged:false,roles:person.roles,cityCode:person.cityCode,languageCodes:person.languageCodes,skillCodes:person.skillCodes,heightCm:person.heightCm};
 const current=(table:FactTable)=>graph.rows(table).filter(row=>row.personId===person.id).map(row=>graph.project(table,row as unknown as FactRow)).filter((row):row is Record<string,unknown>=>!!row&&row.usable===true);
 const codes=(table:FactTable,key:string)=>[...new Set(current(table).map(row=>row[key]).filter((value):value is string=>typeof value==='string'))];
 const casting=current('castingProfiles')[0],measurement=casting?current('measurementSets').find(row=>row.id===casting.currentMeasurementSetId):undefined;
 return {professionalManaged:true,roles:codes('personRoles','roleCode'),cityCode:current('talentLocations').find(row=>row.relationCode==='BASE')?.locationCode??null,languageCodes:codes('personLanguages','languageCode'),skillCodes:codes('personCapabilities','capabilityCode'),heightCm:typeof measurement?.heightCm==='number'?measurement.heightCm:null};
}
