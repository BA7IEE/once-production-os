import {loadTalentGraph} from './talent-v2-graph.ts';
import type {Actor,Clock,FieldEvidence} from './model.ts';
import type {Tx} from './store.ts';
import {v,uuid,revision,dateIso} from './validation.ts';
import {invariant} from './errors.ts';
import {personFor,sourceFor,requirePermission} from './policy.ts';
import {TALENT_OWNER_EMPTY} from './talent-v2-model.ts';

export const IDENTITY_EVIDENCE_CODE='person.identityEvidence' as const;
export const IDENTITY_FIELDS=['person.displayName','person.aliases','person.intro'] as const;
export const identityField=(field:string):field is typeof IDENTITY_FIELDS[number]=>(IDENTITY_FIELDS as readonly string[]).includes(field);
export const IdentityEvidenceSchema=v.object({id:uuid,revision,createdAt:dateIso,updatedAt:dateIso,personId:uuid,fieldPath:v.enum(['displayName','aliases','intro']),valueDigest:v.string(64,64,/^[a-f0-9]{64}$/),sourceId:uuid,sourceRevision:revision,originalReview:v.nullable(v.object({workspaceId:uuid,membershipId:uuid,reviewedAt:dateIso}))});
export type IdentityEvidence=ReturnType<typeof IdentityEvidenceSchema.parse>;
export async function collectIdentityEvidence(tx:Tx,actor:Actor,clock:Clock,peopleIds:string[],fields:string[]):Promise<IdentityEvidence[]> {
 requirePermission(actor,'sources.review');
 invariant(fields.length>0&&fields.every(identityField)&&new Set(fields).size===fields.length,'IDENTITY_TRANSFER_FIELDS','身份依据必须随已选的身份字段导出',422);
 const graph=await loadTalentGraph(tx,actor,clock);
 for(const id of peopleIds){const person=await personFor(tx,actor,id,clock);for(const field of fields)invariant(graph.fieldReadable('person',person as unknown as Record<string,unknown>,field.slice(7)),'IDENTITY_FIELD_RESTRICTED','所选身份字段缺少当前可用依据，不能导出',409);}
 const rows=await tx.find('evidence',{workspaceId:actor.workspaceId}),result:IdentityEvidence[]=[];
 for(const e of rows)if(e.personId&&peopleIds.includes(e.personId)&&fields.some(f=>f==='person.'+e.fieldPath)) {
  invariant(Object.keys(TALENT_OWNER_EMPTY).filter(k=>(e as unknown as Record<string,unknown>)[k]!=null).length===1,'IDENTITY_EVIDENCE_OWNER','身份依据必须只有一个归属',422);
  const source=await sourceFor(tx,actor,e.sourceId,clock);
  invariant(e.sourceRevision<=source.revision,'IDENTITY_EVIDENCE_SOURCE','身份依据引用了不存在的来源版本',422);
  result.push(IdentityEvidenceSchema.parse({id:e.id,revision:e.revision,createdAt:e.createdAt,updatedAt:e.updatedAt,personId:e.personId,fieldPath:e.fieldPath,valueDigest:e.valueDigest,sourceId:e.sourceId,sourceRevision:e.sourceRevision,originalReview:e.reviewerId?{workspaceId:actor.workspaceId,membershipId:e.reviewerId,reviewedAt:e.reviewedAt}:e.originalReviewWorkspaceId?{workspaceId:e.originalReviewWorkspaceId,membershipId:e.originalReviewMembershipId,reviewedAt:e.originalReviewedAt}:null}));
  invariant(result.length<=500,'IDENTITY_EVIDENCE_LIMIT','单次身份依据最多500条',422);
 }
 return result.sort((a,b)=>a.id.localeCompare(b.id));
}
export function validateIdentityEvidence(clock:Clock,evidence:IdentityEvidence[],fields:string[],people:Array<{id:string;data:Record<string,unknown>}>,sources:Array<{id:string;revision:number}>,otherEvidenceIds:string[]) {
 invariant(fields.length>0&&fields.every(identityField)&&new Set(fields).size===fields.length,'IDENTITY_TRANSFER_FIELDS','身份依据字段不合法',422);
 const ids=new Set(otherEvidenceIds);
 for(const e of evidence) {
  invariant(!ids.has(e.id),'IDENTITY_EVIDENCE_DUPLICATE','身份依据 ID 重复',422);ids.add(e.id);
  const person=people.find(p=>p.id===e.personId);
  invariant(person&&fields.some(f=>f==='person.'+e.fieldPath)&&Object.hasOwn(person.data,e.fieldPath),'IDENTITY_EVIDENCE_OWNER','身份依据必须引用本次选择的人物及身份字段',422);
  invariant(e.sourceRevision<=(sources.find(s=>s.id===e.sourceId)?.revision??0),'IDENTITY_EVIDENCE_SOURCE','身份依据来源或版本缺失',422);
  invariant(Date.parse(e.createdAt)<=Date.parse(e.updatedAt)&&Date.parse(e.updatedAt)<=clock.now().getTime(),'IDENTITY_EVIDENCE_TIME','身份依据时间不合法',422);
  invariant(!e.originalReview||Date.parse(e.originalReview.reviewedAt)>=Date.parse(e.createdAt)&&Date.parse(e.originalReview.reviewedAt)<=Date.parse(e.updatedAt),'IDENTITY_EVIDENCE_TIME','原身份核验时间不合法',422);
 }
}
export async function applyIdentityEvidence(tx:Tx,actor:Actor,evidence:IdentityEvidence[]) {
 for(const e of evidence) {
  const {originalReview,...row}=e;
  await tx.insert('evidence',{...TALENT_OWNER_EMPTY,...row,workspaceId:actor.workspaceId,reviewerId:null,reviewedAt:null,originalReviewWorkspaceId:originalReview?.workspaceId??null,originalReviewMembershipId:originalReview?.membershipId??null,originalReviewedAt:originalReview?.reviewedAt??null} as FieldEvidence);
 }
}
