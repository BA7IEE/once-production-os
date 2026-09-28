import type {Actor,Clock,TableMap} from './model.ts';
import type {Tx} from './store.ts';
import {v,uuid,revision,dateIso,code} from './validation.ts';
import {sourceFor,personFor,requirePermission,requireScope} from './policy.ts';
import {invariant} from './errors.ts';
import {loadTalentGraph} from './talent-v2-graph.ts';
import {TD2_FACTS,fieldSchema,type FactRow} from './talent-v2-schema.ts';
import {TALENT_OWNER_EMPTY,TALENT_FACT_TABLES} from './talent-v2-model.ts';
import {PERSON_MERGE_FIELDS} from './merge-model.ts';
import type {TalentTransfer} from './talent-transfer.ts';
export const MERGE_HISTORY_CODE='person.td2.mergeHistory' as const;
export const MERGE_ERASURE_VERSION='once-talent-transfer-v14' as const;
const stamp={id:uuid,revision,createdAt:dateIso,updatedAt:dateIso};
const hash=v.string(64,64,/^[a-f0-9]{64}$/),count=v.number(0);
const originalReview=v.nullable(v.object({workspaceId:uuid,membershipId:uuid,reviewedAt:dateIso}));
const historyPerson=v.object({...stamp,sourceId:uuid,displayName:v.string(120,1),aliases:v.array(v.string(120,1),20),intro:v.string(5000),roles:v.array(code,10),cityCode:v.nullable(code),languageCodes:v.array(code,20),skillCodes:v.array(code,30),heightCm:v.nullable(v.number(50,250,false)),status:v.enum(['ARCHIVED']),protectionEpoch:revision});
const manifest=v.object({
 localeResults:v.optional(v.array(v.object({locale:v.enum(['zh','en']),selectedTextId:uuid,resultTextId:uuid,retainedTextCount:v.number(1,20)}),2)),
 professional:v.optional(v.object({moved:count,staleProposals:count,retainedProfiles:v.optional(count),deactivated:v.optional(count)})),
 professionalDecisions:v.optional(v.array(v.object({table:v.enum([...TALENT_FACT_TABLES,'mediaCollectionItems','talentMigrationReviews','fieldProposals','shortlistItems']),id:uuid,action:v.enum(['MOVE','REBIND_AGENT','STALE_PROPOSAL','RETAIN_HISTORY'])}),500)),
 professionalConflicts:v.optional(v.array(v.object({table:v.enum(['talentProfiles','castingProfiles','adultEligibilities','personRoles','personLanguages','talentLocations']),canonicalId:uuid,duplicateId:uuid,choice:v.enum(['RETAIN_DUPLICATE_HISTORY','KEEP_CANONICAL_ACTIVE','KEEP_DUPLICATE_ACTIVE'])}),100)),
 reason:v.string(2000,4),fieldDecisions:v.array(v.array(v.string(80,1),2,2),100),collisionDecisions:v.array(v.array(v.string(80,1),2,2),500),
 revokedHandoffs:count,revokedUsePermissions:count,contactsReencrypted:count,evidenceMoved:count,uploadsDetached:count,assetsReassigned:count,assetsDetached:count,
 moved:v.object({workCredits:count,projectParticipants:count,shortlistItems:count})
});
const decisionFields={...stamp,origin:v.object({workspaceId:uuid,membershipId:uuid}),canonicalPersonId:uuid,duplicatePersonId:uuid,canonicalRevisionBefore:revision,duplicateRevisionBefore:revision,canonicalRevisionAfter:revision,canonicalSourceId:uuid,duplicateSourceId:uuid,canonicalSourceRevision:revision,duplicateSourceRevision:revision,canonicalSourceEpoch:revision,duplicateSourceEpoch:revision,previewDigest:hash,decisionManifest:manifest,revokedHandoffCount:count,revokedUsePermissionCount:count,detachedMediaCount:count,resultDigest:hash,completedAt:dateIso};
const decision=v.object(decisionFields);
const alias=v.object({...stamp,oldPersonId:uuid,canonicalPersonId:uuid,mergeDecisionId:uuid});
const profileBase={...stamp,personId:uuid,sourceId:uuid,supersededById:uuid};
const talent=v.object({...profileBase,internalSummary:v.string(5000),status:v.enum(['ACTIVE','INACTIVE'])});
const casting=v.object({...profileBase,hairColorCode:fieldSchema(TD2_FACTS.castingProfiles.fields.hairColorCode,'hairColorCode'),eyeColorCode:fieldSchema(TD2_FACTS.castingProfiles.fields.eyeColorCode,'eyeColorCode'),appearanceObservedOn:fieldSchema(TD2_FACTS.castingProfiles.fields.appearanceObservedOn,'appearanceObservedOn'),currentMeasurementSetId:v.nullable(uuid),retiredCurrentMeasurementSetId:v.nullable(uuid)});
const evidence=v.object({...stamp,ownerKind:v.enum(['talentProfiles','castingProfiles']),ownerId:uuid,fieldPath:v.string(160,1),valueDigest:hash,sourceId:uuid,sourceRevision:revision,originalReview});
export const MergeHistorySchema=v.object({people:v.array(historyPerson,100),aliases:v.array(alias,100),decisions:v.array(decision,100),talentProfiles:v.array(talent,100),castingProfiles:v.array(casting,100),evidence:v.array(evidence,500)});
const erasedHistoryPerson=v.object({...stamp,sourceId:uuid,status:v.enum(['ERASED']),protectionEpoch:revision});
const anyHistoryPerson:import('./validation.ts').Schema<ReturnType<typeof historyPerson.parse>|ReturnType<typeof erasedHistoryPerson.parse>>={json:{oneOf:[historyPerson.json,erasedHistoryPerson.json]},parse(value,path){return value&&typeof value==='object'&&(value as {status?:unknown}).status==='ERASED'?erasedHistoryPerson.parse(value,path):historyPerson.parse(value,path);}};
const historyErasure=v.object({...stamp,mergeDecisionId:uuid,personId:uuid,sourceId:uuid,recordKind:v.enum(['PERSON','TALENT_PROFILE','CASTING_PROFILE']),recordStatusBefore:v.nullable(v.enum(['ARCHIVED','ERASED'])),recordId:uuid,recordRevision:revision,recordCreatedAt:dateIso,recordUpdatedAt:dateIso,supersededById:v.nullable(uuid),retiredMeasurementSetId:v.nullable(uuid),erasedAt:dateIso,origin:v.object({workspaceId:uuid,requestId:uuid,membershipId:uuid})});
export const ErasedMergeHistorySchema=v.object({people:v.array(anyHistoryPerson,100),aliases:v.array(alias,100),decisions:v.array(v.object({...decisionFields,reasonErasedAt:v.optional(v.nullable(dateIso))}),100),talentProfiles:v.array(talent,100),castingProfiles:v.array(casting,100),evidence:v.array(evidence,500),erasures:v.array(historyErasure,300)});
type LegacyMergeHistory=ReturnType<typeof MergeHistorySchema.parse>;
export type MergeHistory=Omit<LegacyMergeHistory,'people'|'decisions'>&{people:Array<ReturnType<typeof anyHistoryPerson.parse>>;decisions:Array<LegacyMergeHistory['decisions'][number]&{reasonErasedAt?:string|null}>;erasures?:Array<ReturnType<typeof historyErasure.parse>>};
export async function collectMergeHistory(tx:Tx,actor:Actor,clock:Clock,peopleIds:string[],bundle:TalentTransfer,withEvidence:boolean):Promise<MergeHistory> {
 requirePermission(actor,'data.merge');requirePermission(actor,'sources.review');
 for(const id of peopleIds)await personFor(tx,actor,id,clock);
 const graph=await loadTalentGraph(tx,actor,clock),aliases=graph.rows('personAliases').filter(a=>peopleIds.includes(a.canonicalPersonId));
 const erasures=(await tx.find('mergeHistoryErasures',{workspaceId:actor.workspaceId})).filter(e=>aliases.some(a=>a.mergeDecisionId===e.mergeDecisionId));
 const output:Record<string,unknown[]>={...(erasures.length?{erasures:[]}:{}),people:[],aliases:[],decisions:[],talentProfiles:[],castingProfiles:[],evidence:[]};
 for(const a of aliases) {
  const p=graph.rows('people').find(p=>p.id===a.oldPersonId);invariant(p&&(p.status==='ARCHIVED'||p.status==='ERASED'&&erasures.some(e=>e.recordKind==='PERSON'&&e.recordId===p.id)),'MERGE_HISTORY_IDENTITY','合并旧身份缺失或状态不合法',409);
  await requireScope(tx,actor,p.scopeId);await sourceFor(tx,actor,p.sourceId,clock,p.status!=='ERASED',p.status==='ERASED');
  invariant(!graph.rows('deletionRequests').some(d=>d.targetKind==='PERSON'&&d.targetId===p.id&&d.state!=='DRAFT'&&!(p.status==='ERASED'&&['COMPLETED','RETAINED_WITH_BASIS'].includes(d.state))),'MERGE_HISTORY_DELETION','旧身份正在删除处理中',409);
  const personSchema=p.status==='ERASED'?erasedHistoryPerson:historyPerson;
  output.people!.push(personSchema.parse(Object.fromEntries(Object.keys(personSchema.json.properties as object).map(k=>[k,(p as unknown as Record<string,unknown>)[k]]))));
  const {workspaceId,...ar}=a;output.aliases!.push(ar);
  const merge=await tx.get('personMerges',a.mergeDecisionId);invariant(merge&&merge.workspaceId===actor.workspaceId,'MERGE_HISTORY_DECISION','原合并决定缺失',409);
  await sourceFor(tx,actor,merge.canonicalSourceId,clock,false,true);await sourceFor(tx,actor,merge.duplicateSourceId,clock,p.status!=='ERASED',p.status==='ERASED');
  const {actorId,originalActorWorkspaceId,originalActorMembershipId,reasonErasedAt,workspaceId:mw,...rest}=merge;

  output.decisions!.push({...rest,...(reasonErasedAt?{reasonErasedAt}:{}),origin:actorId?{workspaceId:mw,membershipId:actorId}:{workspaceId:originalActorWorkspaceId,membershipId:originalActorMembershipId}});
  for(const table of ['talentProfiles','castingProfiles'] as const) for(const row of graph.rows(table).filter(r=>r.personId===p.id)) {
   invariant(row.supersededById&&bundle.tables[table]?.some(r=>r.id===row.supersededById&&r.personId===a.canonicalPersonId),'MERGE_HISTORY_CURRENT_REQUIRED','保留主档案必须与当前对应档案一起导出',422);
   await sourceFor(tx,actor,row.sourceId,clock);
   const projected=graph.project(table,{...row,personId:a.canonicalPersonId} as unknown as FactRow);invariant(projected&&(projected.unavailableFields as string[]).length===0,'MERGE_HISTORY_RESTRICTED','保留主档案有不可读字段',409);
   const schema=table==='talentProfiles'?talent:casting;
   output[table]!.push(schema.parse(Object.fromEntries(Object.keys(schema.json.properties as object).map(k=>[k,(row as unknown as Record<string,unknown>)[k]]))));
   const owner=TD2_FACTS[table].ownerKey,ev=graph.rows('evidence').filter(e=>(e as unknown as Record<string,unknown>)[owner]===row.id);
   invariant(!ev.length||withEvidence,'MERGE_HISTORY_EVIDENCE_REQUIRED','保留主档案的字段依据必须一同批准',422);
   for(const e of ev){await sourceFor(tx,actor,e.sourceId,clock);output.evidence!.push({id:e.id,revision:e.revision,createdAt:e.createdAt,updatedAt:e.updatedAt,ownerKind:table,ownerId:row.id,fieldPath:e.fieldPath,valueDigest:e.valueDigest,sourceId:e.sourceId,sourceRevision:e.sourceRevision,originalReview:e.reviewerId?{workspaceId:actor.workspaceId,membershipId:e.reviewerId,reviewedAt:e.reviewedAt}:e.originalReviewWorkspaceId?{workspaceId:e.originalReviewWorkspaceId,membershipId:e.originalReviewMembershipId,reviewedAt:e.originalReviewedAt}:null});}
  }
 }
 for(const e of erasures){await sourceFor(tx,actor,e.sourceId,clock,false,true);const {workspaceId,requestId,actorId,originalWorkspaceId,originalRequestId,originalActorId,...row}=e;output.erasures!.push({...row,origin:requestId?{workspaceId,requestId,membershipId:actorId}:{workspaceId:originalWorkspaceId,requestId:originalRequestId,membershipId:originalActorId}});}
 for(const rows of Object.values(output))rows.sort((a,b)=>String((a as {id:string}).id).localeCompare(String((b as {id:string}).id)));
 return erasures.length?ErasedMergeHistorySchema.parse(output):MergeHistorySchema.parse(output);
}
export function validateMergeHistory(clock:Clock,h:MergeHistory,bundle:TalentTransfer,people:Array<{id:string;sourceId:string;revision:number}>,sources:Array<{id:string;revision:number}>) {
 sources=[...sources,...bundle.retainedOrigins??[]];
 invariant((bundle.identityFields?.length??0)>0||!(bundle.identityEvidence?.length),'IDENTITY_TRANSFER_FIELDS','身份依据必须关联所选字段',422);
 const current=new Map(people.map(p=>[p.id,p])),old=new Map(h.people.map(p=>[p.id,p])),decisions=new Map(h.decisions.map(d=>[d.id,d]));
 const erasures=h.erasures??[];
 invariant(!erasures.length||bundle.schemaVersion===MERGE_ERASURE_VERSION,'MERGE_HISTORY_ERASURE_VERSION','历史清理标识必须使用 v14 格式',422);
 for(const e of erasures){
  const d=decisions.get(e.mergeDecisionId),p=old.get(e.personId);
  invariant(d&&p&&p.status==='ERASED'&&d.duplicatePersonId===p.id&&sources.some(s=>s.id===e.sourceId),'MERGE_HISTORY_ERASURE_LINEAGE','历史清理记录的原身份或来源不匹配',422);
  invariant(e.revision===1&&e.createdAt===e.updatedAt&&e.createdAt===e.erasedAt&&Date.parse(e.recordCreatedAt)<=Date.parse(e.recordUpdatedAt)&&Date.parse(e.recordUpdatedAt)<=Date.parse(e.erasedAt),'MERGE_HISTORY_ERASURE_TIME','历史清理时间或原版本不合法',422);
  invariant(erasures.filter(x=>x.recordKind===e.recordKind&&x.recordId===e.recordId).length===1,'MERGE_HISTORY_ERASURE_DUPLICATE','历史清理记录重复',422);
  if(e.recordKind==='PERSON')invariant(e.recordId===p.id&&e.sourceId===p.sourceId&&e.recordStatusBefore!==null&&e.supersededById===null&&e.retiredMeasurementSetId===null&&(e.recordStatusBefore==='ERASED'?e.recordRevision<=p.revision:e.recordRevision<p.revision),'MERGE_HISTORY_ERASURE_IDENTITY','清理身份最小头或原版本不匹配',422);
  else {const table=e.recordKind==='TALENT_PROFILE'?'talentProfiles':'castingProfiles';invariant(e.recordStatusBefore===null&&e.supersededById!==null&&e.supersededById!==e.recordId&&(table==='castingProfiles'||e.retiredMeasurementSetId===null)&&!h[table].some(r=>r.id===e.recordId)&&!bundle.tables[table]?.some(r=>r.id===e.recordId)&&d.decisionManifest.professionalConflicts?.some(c=>c.table===table&&c.duplicateId===e.recordId&&c.canonicalId===e.supersededById&&c.choice==='RETAIN_DUPLICATE_HISTORY'),'MERGE_HISTORY_ERASURE_PROFILE','已清理档案不能重新出现，原合并关系必须保留',422);}
 }
 for(const p of h.people)if(p.status==='ERASED')invariant(erasures.some(e=>e.recordKind==='PERSON'&&e.recordId===p.id),'MERGE_HISTORY_ERASURE_IDENTITY','已清理身份缺少明确清理记录',422);
 for(const d of h.decisions)if(d.reasonErasedAt)invariant(d.decisionManifest.reason==='[ERASED]'&&Date.parse(d.completedAt)<=Date.parse(d.reasonErasedAt)&&Date.parse(d.reasonErasedAt)<=Date.parse(d.updatedAt)&&erasures.some(e=>e.mergeDecisionId===d.id&&e.erasedAt===d.reasonErasedAt),'MERGE_HISTORY_ERASURE_REASON','已清理说明缺少对应清理记录',422);
 for(const d of h.decisions)if(erasures.some(e=>e.mergeDecisionId===d.id)){
  invariant(!!d.reasonErasedAt&&d.decisionManifest.reason==='[ERASED]','MERGE_HISTORY_ERASURE_REASON','历史清理必须保留说明清理标识',422);
  for(const c of d.decisionManifest.professionalConflicts??[])if(c.choice==='RETAIN_DUPLICATE_HISTORY'&&(c.table==='talentProfiles'||c.table==='castingProfiles'))invariant(h[c.table].some(r=>r.id===c.duplicateId)||erasures.some(e=>e.mergeDecisionId===d.id&&e.recordId===c.duplicateId&&e.recordKind===(c.table==='talentProfiles'?'TALENT_PROFILE':'CASTING_PROFILE')),'MERGE_HISTORY_ERASURE_PROFILE','原保留档案缺少资料或明确清理记录',422);
 }
 const seenEvidence=new Set([...(bundle.evidence??[]),...(bundle.identityEvidence??[])].map(e=>e.id));
 for(const [table,rows] of Object.entries(h)) {
  invariant(rows.length===new Set(rows.map(r=>r.id)).size,'MERGE_HISTORY_DUPLICATE','合并历史记录 ID 重复',422);
  for(const row of rows)invariant(Date.parse(row.createdAt)<=Date.parse(row.updatedAt)&&Date.parse(row.updatedAt)<=clock.now().getTime(),'MERGE_HISTORY_TIME','合并历史时间不合法',422);
 }
 invariant(h.people.every(p=>!current.has(p.id)&&sources.some(s=>s.id===p.sourceId)),'MERGE_HISTORY_IDENTITY','旧身份与当前身份重复或来源缺失',422);
 invariant(h.people.length===h.aliases.length&&h.aliases.length===h.decisions.length&&new Set(h.aliases.map(a=>a.oldPersonId)).size===h.aliases.length&&new Set(h.aliases.map(a=>a.mergeDecisionId)).size===h.aliases.length,'MERGE_HISTORY_MAPPING','旧身份、映射和合并决定必须一一对应',422);
 for(const a of h.aliases) {
  const p=old.get(a.oldPersonId),c=current.get(a.canonicalPersonId),d=decisions.get(a.mergeDecisionId);
  invariant(p&&c&&d&&d.duplicatePersonId===p.id&&d.canonicalPersonId===c.id&&d.duplicateSourceId===p.sourceId&&d.canonicalSourceId===c.sourceId,'MERGE_HISTORY_MAPPING','合并决定及原身份来源不匹配',422);
  invariant(d.canonicalSourceRevision<=(sources.find(s=>s.id===d.canonicalSourceId)?.revision??0)&&d.duplicateSourceRevision<=(sources.find(s=>s.id===d.duplicateSourceId)?.revision??0)&&d.canonicalRevisionAfter<=c.revision&&d.duplicateRevisionBefore<p.revision,'MERGE_HISTORY_REVISION','合并历史引用了不存在的版本',422);
  invariant(Date.parse(d.completedAt)>=Date.parse(p.createdAt)&&Date.parse(d.completedAt)<=Date.parse(d.updatedAt),'MERGE_HISTORY_TIME','合并完成时间不合法',422);
  for(const pair of d.decisionManifest.fieldDecisions)invariant((PERSON_MERGE_FIELDS as readonly string[]).includes(pair[0]!)&&['CANONICAL','DUPLICATE','UNION'].includes(pair[1]!), 'MERGE_HISTORY_DECISION','原字段合并决定不合法',422);
  for(const pair of d.decisionManifest.collisionDecisions){uuid.parse(pair[0]);invariant(['KEEP_CANONICAL','KEEP_DUPLICATE'].includes(pair[1]!),'MERGE_HISTORY_DECISION','原碰撞决定不合法',422);}
 }
 for(const table of ['talentProfiles','castingProfiles'] as const)for(const row of h[table]) {
  invariant(row.revision>=2,'MERGE_HISTORY_REVISION','保留主档案缺少原退休版本',422);
  const a=h.aliases.find(a=>a.oldPersonId===row.personId),target=bundle.tables[table]?.find(r=>r.id===row.supersededById);
  invariant(a&&target&&target.personId===a.canonicalPersonId&&sources.some(s=>s.id===row.sourceId)&&!bundle.tables[table]?.some(r=>r.id===row.id),'MERGE_HISTORY_PROFILE','历史主档案必须指向已选的当前主档案',422);
  invariant(h[table].filter(r=>r.personId===row.personId).length===1,'MERGE_HISTORY_DUPLICATE','旧身份的主档案不能重复',422);
  if('currentMeasurementSetId' in row)invariant(row.currentMeasurementSetId===null,'MERGE_HISTORY_MEASUREMENT','历史档案不能冒充当前量尺');
  if('retiredCurrentMeasurementSetId' in row&&row.retiredCurrentMeasurementSetId)invariant(bundle.tables.measurementSets?.some(m=>m.id===row.retiredCurrentMeasurementSetId&&m.personId===a.canonicalPersonId),'MERGE_HISTORY_MEASUREMENT','历史当前量尺必须随当前人物的量尺历史导出',422);
 }
 for(const e of h.evidence){invariant(!seenEvidence.has(e.id),'MERGE_HISTORY_DUPLICATE','历史字段证据重复',422);seenEvidence.add(e.id);invariant(h[e.ownerKind].some(r=>r.id===e.ownerId)&&Object.hasOwn(TD2_FACTS[e.ownerKind].fields,e.fieldPath),'MERGE_HISTORY_EVIDENCE','历史字段证据归属或字段不合法',422);invariant(e.sourceRevision<=(sources.find(s=>s.id===e.sourceId)?.revision??0),'MERGE_HISTORY_EVIDENCE','历史字段证据来源缺失',422);invariant(!e.originalReview||Date.parse(e.originalReview.reviewedAt)>=Date.parse(e.createdAt)&&Date.parse(e.originalReview.reviewedAt)<=Date.parse(e.updatedAt),'MERGE_HISTORY_TIME','历史字段核验时间不合法',422);}
 const size=Object.values(h).reduce((n,rows)=>n+rows.length,0)+Object.values(bundle.tables).reduce((n,rows)=>n+rows.length,0)+(bundle.evidence?.length??0)+(bundle.identityEvidence?.length??0)+(bundle.collectionItems?.length??0)+(bundle.capabilityDefinitions?.length??0)+(bundle.organizations?.length??0);
 invariant(size<=500,'MERGE_HISTORY_LIMIT','资料和合并历史合计最多500条',422);
}
export async function applyHistoryPeople(tx:Tx,actor:Actor,scopeId:string,h:MergeHistory){for(const p of h.people)await tx.insert('people',{...(p.status==='ERASED'?{displayName:'[ERASED]',aliases:[],intro:'',roles:['erased'],cityCode:null,languageCodes:[],skillCodes:[],heightCm:null}:{}),...p,workspaceId:actor.workspaceId,scopeId,maintainerId:actor.membershipId,protectionEpoch:p.protectionEpoch+1} as TableMap['people']);}
export async function applyMergeHistory(tx:Tx,actor:Actor,h:MergeHistory){
 for(const d of h.decisions){const {origin,...row}=d;await tx.insert('personMerges',{...row,workspaceId:actor.workspaceId,actorId:null,originalActorWorkspaceId:origin.workspaceId,originalActorMembershipId:origin.membershipId});}
 for(const e of h.erasures??[]){const {origin,...row}=e;await tx.insert('mergeHistoryErasures',{...row,workspaceId:actor.workspaceId,requestId:null,actorId:null,originalWorkspaceId:origin.workspaceId,originalRequestId:origin.requestId,originalActorId:origin.membershipId});}
 for(const a of h.aliases)await tx.insert('personAliases',{...a,workspaceId:actor.workspaceId});
 for(const table of ['talentProfiles','castingProfiles'] as const)for(const row of h[table]) {
  // Reconstruct the existing database retirement transition in this same transaction.
  // No intermediate row is committed; final UUID, revision, dates and facts remain original.
  const final={...row,workspaceId:actor.workspaceId};
  const before={...final,revision:row.revision-1,supersededById:null,...('retiredCurrentMeasurementSetId' in row?{currentMeasurementSetId:row.retiredCurrentMeasurementSetId,retiredCurrentMeasurementSetId:null}:{})};
  await tx.insert(table,before as TableMap[typeof table]);await tx.replace(table,final as TableMap[typeof table]);
 }
 for(const e of h.evidence){const {ownerKind,ownerId,originalReview,...row}=e;await tx.insert('evidence',{...row,...TALENT_OWNER_EMPTY,[TD2_FACTS[ownerKind].ownerKey]:ownerId,workspaceId:actor.workspaceId,reviewerId:null,reviewedAt:null,originalReviewWorkspaceId:originalReview?.workspaceId??null,originalReviewMembershipId:originalReview?.membershipId??null,originalReviewedAt:originalReview?.reviewedAt??null});}
}
