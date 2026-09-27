import type {Actor,Clock,Person,FieldEvidence} from './model.ts';
import type {Tx} from './store.ts';
import type {DeletionItem} from './deletion-model.ts';
import {digest} from './json.ts';
import {invariant} from './errors.ts';
import {sourceCurrent,scopeVisible,deletionBlocked,requirePermission} from './policy.ts';
export const IDENTITY_RETENTION='SOURCE_ORIGIN_PERSON';
export const IDENTITY_FIELDS=['displayName','aliases','intro'] as const;
export const PERSON_PAYLOAD_FIELDS=[...IDENTITY_FIELDS,'roles','languageCodes','skillCodes','cityCode','heightCm'] as const;
export function requiredIdentityFields(person:Person){return PERSON_PAYLOAD_FIELDS.filter(field=>IDENTITY_FIELDS.includes(field as typeof IDENTITY_FIELDS[number])||(Array.isArray(person[field])?(person[field] as unknown[]).length>0:person[field]!==null));}
export function identitySupported(person:Person,records:FieldEvidence[],currentRevision:(id:string)=>number|undefined){return requiredIdentityFields(person).every(field=>records.some(e=>e.personId===person.id&&e.sourceId!==person.sourceId&&e.fieldPath===field&&e.valueDigest===digest(person[field])&&currentRevision(e.sourceId)===e.sourceRevision));}
export function identityContent(person:Person){
 const {revision,updatedAt,...content}=person;return digest(content);
}
export function identityItemCode(person:Person){return `TD2_SOURCE_PERSON:${identityContent(person)}`;}
/** Retention preserves the original source UUID. Only existing matching evidence can support it. */
export async function validateIdentityRetention(tx:Tx,actor:Actor,person:Person,basisId:string,clock:Clock,item?:DeletionItem,review=true){
 if(review)requirePermission(actor,'sources.review');
 invariant(!item||identityItemCode(person)===item.detailCode,'TD2_ERASURE_GRAPH_STALE','人物身份内容已变化，请重新检查删除计划',409);
 invariant(person.workspaceId===actor.workspaceId&&person.status!=='ERASED'&&await scopeVisible(tx,actor,person.scopeId),'TD2_SOURCE_OWNER_UNAVAILABLE','人物身份当前不可用',409);
 const records=await tx.find('evidence',{workspaceId:actor.workspaceId,personId:person.id});
 const allowed=new Map<string,number>();
 for(const source of await tx.find('sources',{workspaceId:actor.workspaceId}))if(source.id!==person.sourceId&&sourceCurrent(source,clock)&&source.basisMode==='INTERNAL_USE'&&await scopeVisible(tx,actor,source.scopeId)&&!await deletionBlocked(tx,actor.workspaceId,'SOURCE',source.id))allowed.set(source.id,source.revision);
 invariant(allowed.has(basisId),'RETENTION_BASIS_CHANGED','身份保留依据当前不可用',409);
 for(const field of requiredIdentityFields(person))invariant(records.some(e=>e.fieldPath===field&&e.valueDigest===digest(person[field])&&allowed.get(e.sourceId)===e.sourceRevision),'TD2_IDENTITY_BASIS_INCOMPLETE','身份字段和仍存的旧专业值均需当前同值的独立依据，姓名、别名和简介的空值也须核对',409);
 invariant(records.some(e=>IDENTITY_FIELDS.includes(e.fieldPath as typeof IDENTITY_FIELDS[number])&&e.sourceId===basisId&&e.sourceRevision===allowed.get(basisId)&&e.valueDigest===digest(person[e.fieldPath as typeof IDENTITY_FIELDS[number]])),'TD2_IDENTITY_BASIS_MISMATCH','所选来源尚未登记为当前身份字段依据',409);
}
export const IDENTITY_DEPENDENCY='SOURCE_IDENTITY_DEPENDENCY';
export const IDENTITY_DEPENDENCY_TABLES={contact:'contacts',upload:'uploads',asset:'assets',workCredit:'workCredits',projectParticipant:'projectParticipants',shortlistItem:'shortlistItems',shortlistItemAsset:'shortlistItemAssets'} as const;
export async function validateIdentityDependency(tx:Tx,actor:Actor,sourceId:string,item:DeletionItem,items:DeletionItem[],clock:Clock){
 const table=IDENTITY_DEPENDENCY_TABLES[item.resourceKind as keyof typeof IDENTITY_DEPENDENCY_TABLES];
 invariant(table,'TD2_IDENTITY_DEPENDENCY_UNKNOWN','身份关联保留类型未登记',409);
 const row=await tx.get(table,item.resourceId);invariant(row,'TD2_IDENTITY_DEPENDENCY_MISSING','身份关联已变化',409);
 let personId='personId' in row?row.personId:null;
 if(table==='shortlistItemAssets'){const candidate=await tx.get('shortlistItems',(row as import('./model.ts').TableMap['shortlistItemAssets']).itemId);personId=candidate?.personId??null;invariant(candidate&&items.every(i=>i.resourceKind!=='shortlistItem'||i.resourceId!==candidate.id||i.decision==='RETAIN_WITH_BASIS'),'TD2_IDENTITY_PARENT_ERASED','不能保留已决定删除的候选图片',409);}
 const personItem=items.find(i=>i.resourceKind==='person'&&i.resourceId===personId);
 invariant(personItem?.decision==='RETAIN_WITH_BASIS'&&item.retentionSourceId,'TD2_IDENTITY_PARENT_ERASED','关联保留需要人物身份也明确有据保留',409);
 invariant(!items.some(i=>i.id!==item.id&&i.resourceKind===item.resourceKind&&i.resourceId===item.resourceId&&i.decision!=='RETAIN_WITH_BASIS'),'TD2_IDENTITY_DEPENDENCY_ERASED','该关联还属于另一项明确删除对象，不能只凭人物保留',409);
 let origin='sourceId' in row?row.sourceId:null;
 if('assetId' in row){const asset=await tx.get('assets',row.assetId);invariant(asset&&asset.state==='READY'&&await scopeVisible(tx,actor,asset.scopeId)&&items.every(i=>i.resourceKind!=='asset'||i.resourceId!==asset.id||i.decision==='RETAIN_WITH_BASIS'),'TD2_IDENTITY_PARENT_ERASED','选图原件已删除、不可用或不在当前范围',409);origin=asset.sourceId;}
 if('shortlistId' in row){const list=await tx.get('shortlists',row.shortlistId);invariant(list&&await scopeVisible(tx,actor,list.scopeId),'TD2_HIDDEN_DEPENDENCY','候选清单不在当前范围',409);}
 let owner:{scopeId:string;sourceId?:string}|null=null;
 if('workId' in row&&row.workId){owner=await tx.get('works',row.workId);invariant(owner&&items.every(i=>i.resourceKind!=='work'||i.resourceId!==row.workId||i.decision==='RETAIN_WITH_BASIS'),'TD2_IDENTITY_PARENT_ERASED','作品已决定删除，不能保留其人物关联',409);origin=owner.sourceId??null;}
 if('projectId' in row){owner=await tx.get('projects',row.projectId);invariant(owner&&items.every(i=>i.resourceKind!=='project'||i.resourceId!==row.projectId||i.decision==='RETAIN_WITH_BASIS'),'TD2_IDENTITY_PARENT_ERASED','项目已决定删除，不能保留其人物关联',409);origin=owner.sourceId??null;}
 if('scopeId' in row)invariant(await scopeVisible(tx,actor,row.scopeId),'TD2_HIDDEN_DEPENDENCY','关联不在当前范围',409);
 if(owner)invariant(await scopeVisible(tx,actor,owner.scopeId),'TD2_HIDDEN_DEPENDENCY','关联不在当前范围',409);
 if(origin){const source=await tx.get('sources',origin);invariant(source&&origin!==sourceId&&source.id===item.retentionSourceId&&sourceCurrent(source,clock)&&await scopeVisible(tx,actor,source.scopeId)&&!await deletionBlocked(tx,actor.workspaceId,'SOURCE',origin),'TD2_IDENTITY_DEPENDENCY_BASIS','独立关联须保留其自己的当前来源，不能更换出处',409);}
 else invariant(item.retentionSourceId===personItem.retentionSourceId,'TD2_IDENTITY_DEPENDENCY_BASIS','内部候选关系须沿用本次人物身份的保留依据',409);
}
