import {v,uuid,revision,dateIso,type Schema} from './validation.ts';
import {fieldSchema,TD2_FACTS} from './talent-v2-schema.ts';
import {invariant} from './errors.ts';
export const INGESTION_VERSION='once-agent-ingestion-v1';
export const INGESTION_INPUT_VERSION='once-talent-experience-v1';
const fields=(table:'talentProfiles'|'personRoles'|'measurementSets',keys:string[])=>v.object(Object.fromEntries(keys.map(k=>[k,v.optional(fieldSchema((TD2_FACTS[table].fields as Record<string,string>)[k]!,k))])));
const variants={
 IDENTITY_TEXT:v.object({field:v.enum(['displayName','aliases','intro']),value:v.unknown()}),
 ROLE:fields('personRoles',['roleCode','castingMarketCode','experienceCode','styleCodes','serviceCodes']),
 PROFILE:fields('talentProfiles',['genderCode','birthPrecision','birthDate','birthYear','minAgeYears','maxAgeYears','ageAsOfDate','nationalityCodes']),
 MEASUREMENT:fields('measurementSets',['heightCm','bustCm','waistCm','hipsCm','measuredOn','datePrecision','shoeSizeValue','shoeSizeSystem','clothingSizeValue','clothingSizeSystem'])
};
export type CandidateKind=keyof typeof variants;
export const candidateValues:Schema<Record<string,unknown>>={json:{oneOf:Object.values(variants).map(x=>x.json)},parse:x=>{invariant(typeof x==='object'&&x!==null&&!Array.isArray(x),'VALIDATION_FAILED','候选内容必须为对象',400);return x as Record<string,unknown>;}};
const item=v.object({clientItemKey:v.string(100,1,/^[a-zA-Z0-9_-]+$/),kind:v.enum(['IDENTITY_TEXT','ROLE','PROFILE','MEASUREMENT']),values:candidateValues,dependencyGroup:v.string(100,1),dependsOn:v.array(v.string(100,1),50)});
// The discriminator selects an exact schema; unknown fields never pass through to storage.
export function parseCandidate(x:ReturnType<typeof item.parse>){const values:Record<string,unknown>=variants[x.kind].parse(x.values);if(x.kind==='IDENTITY_TEXT'){const f=String(values.field);values.value=(f==='aliases'?v.array(v.string(120,1),20):v.string(f==='intro'?5000:120,f==='displayName'?1:0)).parse(values.value);if(f==='displayName')invariant(String(values.value).trim().length>0,'NAME_REQUIRED','姓名不能仅为空白',422);}
 invariant(Object.keys(values).length>0,'EMPTY_CANDIDATE','候选事实不能为空',422);if(x.kind==='ROLE')invariant(typeof values.roleCode==='string','ROLE_REQUIRED','职业候选必须注明职业代码',422);return {...x,values};}
const declaration=v.object({title:v.string(120,1),providerClaim:v.string(200,1),materialDescription:v.string(2000,4)});
export const IngestionSchemas={
 create:v.object({schemaVersion:v.enum([INGESTION_INPUT_VERSION]),externalSubmissionKey:v.string(128,1,/^[a-zA-Z0-9._:-]+$/),proposedPersonId:v.nullable(uuid),sourceDeclaration:declaration}),
 items:v.object({expectedRevision:revision,items:v.array(item,50,1)}),
 revision:v.object({expectedRevision:revision}),
 fork:v.object({expectedRevision:revision,externalSubmissionKey:v.string(128,1,/^[a-zA-Z0-9._:-]+$/)}),
 review:v.object({expectedRevision:revision,acceptedKeys:v.array(v.string(100,1),50),decision:v.enum(['CREATE_NEW','LINK_EXISTING','REJECT']),targetPersonId:v.optional(uuid),formalScopeId:v.optional(uuid),reviewBasis:v.string(2000,4),validUntil:dateIso,publicReason:v.string(500)})
};
