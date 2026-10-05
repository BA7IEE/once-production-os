import type { Actor, Clock, Config } from './model.ts';
import type { Tx } from './store.ts';
import { v, revision, uuid, code, type Schema } from './validation.ts';
import { cas } from './helpers.ts';
import { invariant } from './errors.ts';
import { TalentV2 } from './talent-v2.ts';
import { TALENT_SCHEMA_VERSION } from './talent-v2-model.ts';
import { valuesSchema, type FactTable } from './talent-v2-schema.ts';
import { DEMOGRAPHIC_FIELDS, MODEL_ROLE_FIELDS } from './talent-demographics.ts';
import { requirePermission } from './policy.ts';
const basis=v.object({sourceId:uuid,sourceRevision:revision,recordId:v.optional(uuid),expectedRevision:v.optional(revision)});
export const DirectoryUpdateSchema=v.object({schemaVersion:v.enum(['once-talent-experience-v1']),expectedRevision:revision,sourceId:uuid,sourceRevision:revision,
 bases:v.optional(v.object({profile:v.optional(basis),model:v.optional(basis),location:v.optional(basis),measurement:v.optional(basis)})),
 profile:v.optional(valuesSchema('talentProfiles',true)),model:v.optional(valuesSchema('personRoles',true)),
 locationCode:v.optional(v.nullable(v.string(60,1))),measurement:v.optional(valuesSchema('measurementSets')),confirmMeasurement:v.optional(v.boolean())});
/** Core composition, one command/receipt/audit transaction. Existing single-fact commands remain available. */
export async function updateTalentDirectory(tx:Tx,actor:Actor,id:string,input:unknown,clock:Clock,config:Config){
 invariant(actor.actorKind!=='MACHINE','MACHINE_OPERATION_FORBIDDEN','主详情维护仅对内部成员开放',403);requirePermission(actor,'records.write');
 const d=DirectoryUpdateSchema.parse(input),service=new TalentV2(clock,config);let person=await service.parent(tx,actor,id,d.expectedRevision);if(!d.bases)await service.source(tx,actor,d.sourceId,d.sourceRevision);
 const facts=async(table:FactTable)=>(await tx.find(table,{workspaceId:actor.workspaceId,personId:id})).filter(r=>!('supersededById' in r&&r.supersededById));
 const selected=<T extends {id:string}>(rows:T[],group:'profile'|'model'|'location')=>{const key=d.bases?.[group]?.recordId;if(!key)return rows[0];const row=rows.find(r=>r.id===key);invariant(row,'FACT_SELECTION_CHANGED','原选择的资料已变化，请刷新后核对',409);return row;};
 const apply=async(table:FactTable,values:Record<string,unknown>,existing:{id:string;revision:number}|undefined,group:'profile'|'model'|'location'|'measurement')=>{
  const fieldBasis=d.bases?.[group],selected=fieldBasis??(!d.bases?d:null);invariant(selected,'FIELD_BASIS_REQUIRED','请核对本次修改对应的来源',422);
  if(d.bases&&existing){invariant(fieldBasis?.recordId===existing.id,'FACT_SELECTION_CHANGED','该项资料已变化，请刷新后核对',409);invariant(fieldBasis.expectedRevision!==undefined,'FACT_REVISION_REQUIRED','请核对该项资料版本',422);cas(existing,fieldBasis.expectedRevision);}
  const common={schemaVersion:TALENT_SCHEMA_VERSION,expectedPersonRevision:person.revision,sourceId:selected.sourceId,sourceRevision:selected.sourceRevision,values};
  const result=existing?await service.patchFact(tx,actor,table,existing.id,{...common,expectedRevision:existing.revision}):await service.createFact(tx,actor,table,id,common);
  person=(await tx.get('people',id))!;return result;
 };
 invariant(d.profile||d.model||d.locationCode!==undefined||d.measurement,'EMPTY_UPDATE','没有需要保存的资料',400);
 if(d.profile){invariant(Object.keys(d.profile).every(k=>(DEMOGRAPHIC_FIELDS as readonly string[]).includes(k)),'DIRECTORY_FIELD_INVALID','请在高级管理维护状态和内部摘要',422);await apply('talentProfiles',d.profile,selected((await facts('talentProfiles')).filter(r=>'status' in r&&r.status==='ACTIVE'),'profile'),'profile');}
 if(d.model){invariant(Object.keys(d.model).every(k=>(MODEL_ROLE_FIELDS as readonly string[]).includes(k)),'DIRECTORY_FIELD_INVALID','职业变更请使用同档职业维护',422);const model=selected((await facts('personRoles')).filter(r=>'roleCode' in r&&r.roleCode==='model'&&r.status==='ACTIVE'),'model');invariant(!!model,'MODEL_ROLE_REQUIRED','请先在同一档案添加模特职业',422);await apply('personRoles',d.model,model,'model');}
 if(d.locationCode!==undefined){const old=selected((await facts('talentLocations')).filter(r=>'relationCode' in r&&r.relationCode==='BASE'&&r.status==='ACTIVE'),'location');if(d.locationCode)await apply('talentLocations',{locationCode:d.locationCode,relationCode:'BASE',status:'ACTIVE'},old,'location');else if(old)await apply('talentLocations',{status:'INACTIVE'},old,'location');}
 invariant(!d.confirmMeasurement||!!d.measurement,'MEASUREMENT_REQUIRED','确认量尺须同时提供本次结果',422);
 if(d.measurement){const casting=(await facts('castingProfiles'))[0];if(!casting)await apply('castingProfiles',{},undefined,'measurement');const measurement=await apply('measurementSets',d.measurement,undefined,'measurement');if(d.confirmMeasurement){await service.confirm(tx,actor,'measurementSets',measurement.id,{schemaVersion:TALENT_SCHEMA_VERSION,expectedRevision:measurement.revision,expectedPersonRevision:person.revision,sourceRevision:d.bases?.measurement?.sourceRevision??d.sourceRevision});person=(await tx.get('people',id))!;}}
 return person;
}

/** Legacy scalar and bounded OR-array share one strict contract. Duplicate codes are rejected. */
function selection<T extends string>(item:Schema<T>):Schema<T|T[]>{
 const list=v.array(item,20,1);return {json:{anyOf:[item.json,{...list.json,uniqueItems:true}]},parse(value,path){if(!Array.isArray(value))return item.parse(value,path);const parsed=list.parse(value,path);invariant(new Set(parsed).size===parsed.length,'DUPLICATE_FILTER_CODE','同一筛选维度不能重复选项',400);return parsed;}};
}
export const DirectoryQuerySchema=v.object({q:v.optional(v.string(160)),mode:v.optional(v.enum(['ALL','TALENT','CONTACT'])),role:v.optional(selection(code)),gender:v.optional(selection(v.enum(['FEMALE','MALE','NON_BINARY','OTHER','UNKNOWN']))),nationality:v.optional(selection(v.string(2,2,/^[A-Z]{2}$/))),market:v.optional(selection(v.enum(['DOMESTIC','INTERNATIONAL','UNCLASSIFIED']))),experience:v.optional(selection(v.enum(['AMATEUR','PROFESSIONAL','UNSPECIFIED']))),style:v.optional(selection(code)),service:v.optional(selection(code)),location:v.optional(selection(code)),language:v.optional(selection(code)),industryCode:v.optional(selection(code)),workTypeCode:v.optional(selection(code)),status:v.optional(v.enum(['DRAFT','ACTIVE','ARCHIVED'])),ageMin:v.optional(v.number(0,130)),ageMax:v.optional(v.number(0,130)),ageUnknown:v.optional(v.boolean()),heightMin:v.optional(v.number(40,260,false)),heightMax:v.optional(v.number(40,260,false)),page:v.optional(v.number(1,100000)),pageSize:v.optional(v.number(1,100))});
