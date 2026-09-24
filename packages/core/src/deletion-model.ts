import type { Base } from './model.ts';

export type DeletionTargetKind = 'SOURCE' | 'PERSON' | 'WORK' | 'PROJECT' | 'ASSET';
export type DeletionEvidenceState = 'PROVEN' | 'REVIEW_REQUIRED';
export type DeletionAction =
    | 'ERASE_PAYLOAD'
    | 'REMOVE_RELATION'
    | 'REVOKE_PERMISSION'
    | 'ERASE_DERIVATIVE'
    | 'REVIEW_RETENTION'
    | 'RETAIN_MINIMAL_HEADER';

export interface DeletionRequest extends Base {
    actorId: string;
    targetKind: DeletionTargetKind;
    targetId: string;
    targetSourceId: string;
    targetRevision: number;
    targetProtectionEpoch: number | null;
    state: 'DRAFT' | 'BLOCKED_FOR_USE' | 'CLEANING' | 'COMPLETED' | 'RETAINED_WITH_BASIS' | 'FAILED';
    reason: string;
    previewDigest: string;
    impactCount: number;
    reviewRequiredCount: number;
    unresolvedCount: number;
    targetPersonId: string | null;
    targetWorkId: string | null;
    targetProjectId: string | null;
    targetAssetId: string | null;
    targetSourceSubjectId: string | null;
    planDigest: string | null;
    planFrozenAt: string | null;
    planFrozenById: string | null;
    cleanupLeaseToken: string | null;
    cleanupLeaseUntil: string | null;
    cleanupAttempts: number;
    cleanupErrorCode: string | null;
    cleanupStartedAt: string | null;
    cleanupCompletedAt: string | null;
}

export interface DeletionItem extends Base {
    requestId: string;
    resourceKind: string;
    resourceId: string;
    dependencyKind: string;
    proposedAction: DeletionAction;
    evidenceState: DeletionEvidenceState;
    detailCode: string;
    decision: 'PENDING' | 'APPLY_PROPOSED' | 'RETAIN_WITH_BASIS';
    decisionReason: string;
    retentionSourceId: string | null;
    retentionSourceRevision: number | null;
    retentionSourceProtectionEpoch: number | null;
    decidedById: string | null;
    decidedAt: string | null;
    cleanupState: 'PENDING' | 'DONE' | 'RETAINED' | 'DEFERRED' | 'FAILED';
    cleanupCode: string | null;
    cleanedAt: string | null;
}

export const DELETION_LIMITS = Object.freeze({
    impacts: 1000,
    reason: 2000,
    cleanupBatch: 50,
    cleanupLeaseMs: 30000,
    cleanupAttempts: 3
});
