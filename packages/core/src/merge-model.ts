import type { Base } from './model.ts';

export const PERSON_MERGE_FIELDS = [
    'displayName','aliases','roles','cityCode','languageCodes','skillCodes','heightCm','intro'
] as const;
export type PersonMergeField = typeof PERSON_MERGE_FIELDS[number];
export type PersonMergeFieldChoice = 'CANONICAL' | 'DUPLICATE' | 'UNION';
export type PersonMergeCollisionKind = 'WORK_CREDIT' | 'PROJECT_PARTICIPANT' | 'SHORTLIST_ITEM';
export type PersonMergeCollisionChoice = 'KEEP_CANONICAL' | 'KEEP_DUPLICATE';

export interface PersonMergeDecision extends Base {
    actorId: string;
    canonicalPersonId: string;
    duplicatePersonId: string;
    canonicalRevisionBefore: number;
    duplicateRevisionBefore: number;
    canonicalRevisionAfter: number;
    canonicalSourceId: string;
    duplicateSourceId: string;
    canonicalSourceRevision: number;
    duplicateSourceRevision: number;
    canonicalSourceEpoch: number;
    duplicateSourceEpoch: number;
    previewDigest: string;
    decisionManifest: unknown;
    revokedHandoffCount: number;
    revokedUsePermissionCount: number;
    detachedMediaCount: number;
    resultDigest: string;
    completedAt: string;
}

export interface PersonAlias extends Base {
    oldPersonId: string;
    canonicalPersonId: string;
    mergeDecisionId: string;
}

export const MERGE_LIMITS = Object.freeze({
    conflicts: 100,
    collisions: 500,
    reason: 2000
});
