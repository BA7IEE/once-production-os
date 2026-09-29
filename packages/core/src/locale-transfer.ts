import {LocaleHistorySchema} from './locale-history.ts';
import {digest} from './json.ts';
import type {Actor,Clock} from './model.ts';
import type {Tx} from './store.ts';
import {v,uuid,revision,dateIso,type Parsed} from './validation.ts';
import {LocaleDependencySchema,LocaleBasisSchema,LocaleReviewSchema} from './locale-provenance.ts';
import {LocaleTexts} from './locale.ts';
import {localeSubject} from './locale-model.ts';
import {invariant} from './errors.ts';
export const LOCALE_EXPORT_VERSION='once-export-v3-locale' as const;
export const LOCALE_TRANSFER_CODES=['person.localeTexts','work.localeTexts','project.localeTexts'] as const;
export type LocaleTransferCode=typeof LOCALE_TRANSFER_CODES[number];
export const isLocaleCode=(value:string):value is LocaleTransferCode=>LOCALE_TRANSFER_CODES.includes(value as LocaleTransferCode);
export const localeTransferCode=(kind:'PERSON'|'WORK'|'PROJECT'):LocaleTransferCode=>kind==='PERSON'?'person.localeTexts':kind==='WORK'?'work.localeTexts':'project.localeTexts';
const text=v.object({id:uuid,workspaceId:uuid,createdAt:dateIso,updatedAt:dateIso,revision,
 personId:v.nullable(uuid),workId:v.nullable(uuid),projectId:v.nullable(uuid),locale:v.enum(['zh','en']),text:v.string(10000,1),
 state:v.enum(['DRAFT','REVIEWED']),needsReview:v.boolean(),sourceDigest:v.string(64,64,/^[a-f0-9]{64}$/),
 mergeHistory:LocaleHistorySchema,originalReview:v.nullable(LocaleReviewSchema),importedBasis:v.nullable(LocaleBasisSchema),dependencies:v.array(LocaleDependencySchema,21,2)
});
export const LocaleTransferSchema=v.object({schemaVersion:v.enum(['once-locale-transfer-v1']),texts:v.array(text,320)});
export type LocaleTransfer=Parsed<typeof LocaleTransferSchema>;
export type LocaleSelection={people:string[];works:string[];projects:string[]};
export async function collectLocaleTransfer(tx:Tx,actor:Actor,clock:Clock,selection:LocaleSelection,codes:string[]):Promise<LocaleTransfer>{
 const texts:LocaleTransfer['texts']=[],domain=new LocaleTexts(clock);
 for(const row of (await tx.find('localeTexts',{workspaceId:actor.workspaceId})).sort((a,b)=>a.id.localeCompare(b.id))){
  if(row.state==='ERASED')continue;const subject=localeSubject(row),selected=(subject.kind==='PERSON'?selection.people:subject.kind==='WORK'?selection.works:selection.projects).includes(subject.id);if(!selected)continue;
  invariant(codes.includes(localeTransferCode(subject.kind)),'LOCALE_FIELDS_REQUIRED','所选档案含内部文本，请明确选择对应语言文本及其来源许可',422);
  const access=await domain.access(tx,actor,row.id);invariant(!access.securityChanged,'LOCALE_TEXT_RESTRICTED','内部文本依据范围已变化，请先人工复核再导出',409);
  texts.push({id:row.id,workspaceId:row.workspaceId,createdAt:row.createdAt,updatedAt:row.updatedAt,revision:row.revision,personId:row.personId,workId:row.workId,projectId:row.projectId,locale:row.locale,text:row.text,state:row.state,needsReview:access.needsReview,sourceDigest:row.sourceDigest,
   originalReview:row.reviewedBy?{workspaceId:row.workspaceId,membershipId:row.reviewedBy,reviewedAt:row.reviewedAt!,textDigest:digest(row.text)}:row.originalReviewWorkspaceId?{workspaceId:row.originalReviewWorkspaceId,membershipId:row.originalReviewMembershipId!,reviewedAt:row.originalReviewedAt!,textDigest:row.originalReviewTextDigest!}:null,
   mergeHistory:row.mergeHistory??[],importedBasis:row.importedBasis??null,dependencies:[...access.deps].sort((a,b)=>a.id.localeCompare(b.id))});
  invariant(texts.length<=320,'LOCALE_TRANSFER_LIMIT','单次最多迁移320份内部文本',422);
 }
 return LocaleTransferSchema.parse({schemaVersion:'once-locale-transfer-v1',texts});
}
