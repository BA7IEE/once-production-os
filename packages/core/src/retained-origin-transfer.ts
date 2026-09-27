import type {TalentTransfer} from './talent-transfer.ts';
import type {Clock} from './model.ts';
import {TD2_FACTS,type FactTable} from './talent-v2-schema.ts';
import {v,uuid,revision} from './validation.ts';
import {invariant} from './errors.ts';
import {digest} from './json.ts';
export const IDENTITY_ORIGIN_VERSION='once-talent-transfer-v13' as const;
export const RETAINED_ORIGIN_VERSION='once-talent-transfer-v12' as const;
export const RetainedOriginSchema=v.object({id:uuid,revision,protectionEpoch:revision,status:v.enum(['ERASED'])});
export interface RetainedOrigin {id:string;revision:number;protectionEpoch:number;status:'ERASED'}
type CurrentSource={id:string;revision:number;data:{status:string;validFrom:string;validUntil:string}};
/** A deleted origin carries only an identity header. Every retained field needs an independent current source. */
export function validateRetainedOrigins(bundle:TalentTransfer,sources:CurrentSource[],clock:Clock,people:Array<{id:string;sourceId:string;data:Record<string,unknown>}>=[]) {
 const origins=bundle.retainedOrigins??[],ids=new Set(origins.map(s=>s.id));
 invariant(ids.size===origins.length&&!origins.some(o=>sources.some(s=>s.id===o.id)),'TD2_RETAINED_ORIGIN_DUPLICATE','已删来源编号重复或与当前来源冲突',422);
 const used=new Set<string>(),now=clock.now().getTime();
 const current=new Map(sources.filter(s=>s.data.status==='CONFIRMED'&&Date.parse(s.data.validFrom)<=now&&Date.parse(s.data.validUntil)>now).map(s=>[s.id,s]));
 for(const person of people)if(ids.has(person.sourceId)){
  invariant(bundle.schemaVersion===IDENTITY_ORIGIN_VERSION,'TD2_RETAINED_IDENTITY_VERSION','保留身份的最初来源需要 v13 迁移格式',422);used.add(person.sourceId);
  for(const field of ['displayName','aliases','intro'])invariant(bundle.identityFields?.includes('person.'+field)&&Object.hasOwn(person.data,field)&&(bundle.identityEvidence??[]).some(e=>e.personId===person.id&&e.fieldPath===field&&e.valueDigest===digest(person.data[field])&&current.get(e.sourceId)?.revision===e.sourceRevision),'TD2_RETAINED_IDENTITY_BASIS','保留身份必须包含全部身份字段及当前同值的独立依据',422);
 }
 for(const [table,rows] of Object.entries(bundle.tables))for(const row of rows)if(ids.has(row.sourceId)) {
  used.add(row.sourceId);const fields=TD2_FACTS[table as FactTable]?.fields;
  invariant(fields,'TD2_RETAINED_ORIGIN_OWNER','已删来源只允许作为已登记专业事实的历史编号',422);
  invariant(!row.data.identifierCiphertext&&!(table==='personCredentials'&&row.data.status==='VERIFIED')&&!(table==='adultEligibilities'&&row.data.state==='VERIFIED_ADULT'),'TD2_RETAINED_ORIGIN_PROOF','已删来源的敏感编号或有效核验资格须先完成专门保留处置',422);
  for(const field of Object.keys(fields))invariant((bundle.evidence??[]).some(e=>e.ownerKind===table&&e.ownerId===row.id&&e.fieldPath===field&&e.valueDigest===digest(row.data[field]??null)&&current.get(e.sourceId)?.revision===e.sourceRevision),
   'TD2_RETAINED_ORIGIN_BASIS','保留资料的每个字段都必须包含独立、当前、同值的已登记字段依据',422);
 }
 invariant(origins.every(o=>used.has(o.id)),'TD2_RETAINED_ORIGIN_UNUSED','已删来源头没有被所选专业资料引用',422);
 for(const row of [...bundle.evidence??[],...bundle.identityEvidence??[],...bundle.assets??[],...bundle.organizations??[]])invariant(!ids.has(row.sourceId),'TD2_RETAINED_ORIGIN_OWNER','已删来源不能充当现行证据、原件或机构来源',422);
 if(bundle.mergeHistory)for(const row of [...bundle.mergeHistory.people,...bundle.mergeHistory.talentProfiles,...bundle.mergeHistory.castingProfiles,...bundle.mergeHistory.evidence])invariant(!ids.has(row.sourceId),'TD2_RETAINED_ORIGIN_OWNER','合并保留历史的已删来源须另行处置',422);
}
