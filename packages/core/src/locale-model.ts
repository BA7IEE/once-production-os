import type {ImportedLocaleBasis} from './locale-provenance.ts';
import type {Base} from './model.ts';
export type LocaleSubjectKind='PERSON'|'WORK'|'PROJECT';
export interface LocaleText extends Base {
 personId:string|null;workId:string|null;projectId:string|null;
 locale:'zh'|'en';text:string;state:'DRAFT'|'REVIEWED'|'ERASED';sourceDigest:string;
 reviewedBy:string|null;reviewedAt:string|null;
 originalReviewWorkspaceId?:string|null;originalReviewMembershipId?:string|null;originalReviewedAt?:string|null;originalReviewTextDigest?:string|null;importedBasis?:ImportedLocaleBasis|null;
}
/** These are references to declared inputs, not copies of the source text. */
export interface LocaleDependency extends Base {
 localeTextId:string;kind:LocaleSubjectKind|'SOURCE';
 personId:string|null;workId:string|null;projectId:string|null;sourceSubjectId:string|null;
 sourceId:string;sourceRevision:number;sourceProtectionEpoch:number;sourceScopeId:string;sourceScopeRevision:number;
 resourceRevision:number;resourceProtectionEpoch:number|null;resourceScopeId:string;resourceScopeRevision:number;
}
export function localeSubject(row:Pick<LocaleText,'personId'|'workId'|'projectId'>):{kind:LocaleSubjectKind;id:string}{
 if(row.personId)return {kind:'PERSON',id:row.personId};if(row.workId)return {kind:'WORK',id:row.workId};if(row.projectId)return {kind:'PROJECT',id:row.projectId};throw new Error('Invalid locale subject');
}
