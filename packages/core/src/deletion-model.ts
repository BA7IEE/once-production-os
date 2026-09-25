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
export type DeletionResolvedAction =
    | 'ERASE_PAYLOAD'
    | 'REMOVE_RELATION'
    | 'REVOKE_PERMISSION'
    | 'ERASE_DERIVATIVE'
    | 'RETAIN_MINIMAL_HEADER'
    | 'RETAIN_WITH_BASIS';
export type DeletionCleanupState = 'NOT_STARTED' | 'PENDING' | 'DONE' | 'WAITING_EXTERNAL' | 'FAILED';

export interface DeletionRequest extends Base {
    actorId: string;
    targetKind: DeletionTargetKind;
    targetId: string;
    targetSourceId: string;
    targetRevision: number;
    targetProtectionEpoch: number | null;
    state: 'DRAFT' | 'BLOCKED_FOR_USE' | 'CLEANING';
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
    executionPlanDigest: string | null;
    cleanupStartedAt: string | null;
    cleanupStartedById: string | null;
    cleanupLeaseToken: string | null;
    cleanupLeaseUntil: string | null;
    dependencyCleanupCompletedAt: string | null;
    cleanupErrorCode: string | null;
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
    resolvedAction: DeletionResolvedAction | null;
    cleanupState: DeletionCleanupState;
    cleanupAttempts: number;
    cleanupEvidenceDigest: string | null;
    cleanupErrorCode: string | null;
    cleanedAt: string | null;
}

export const DELETION_LIMITS = Object.freeze({
    impacts: 1000,
    reason: 2000
});

export function resolveDeletionAction(item: Pick<DeletionItem, 'decision' | 'proposedAction'>): DeletionResolvedAction {
    if (item.decision === 'RETAIN_WITH_BASIS') return 'RETAIN_WITH_BASIS';
    if (item.proposedAction === 'REVIEW_RETENTION') return 'ERASE_PAYLOAD';
    return item.proposedAction;
}
export function executionPlan(request: Pick<DeletionRequest, 'id' | 'targetKind' | 'targetId' | 'previewDigest' | 'planDigest'>, items: DeletionItem[]) {
    return {
        requestId: request.id, targetKind: request.targetKind, targetId: request.targetId,
        previewDigest: request.previewDigest, planDigest: request.planDigest,
        items: [...items].sort((a,b)=>a.id.localeCompare(b.id)).map(item => ({
            itemId: item.id, dependencyKind: item.dependencyKind, resourceKind: item.resourceKind,
            resourceId: item.resourceId, decision: item.decision, resolvedAction: resolveDeletionAction(item),
            retentionSourceId: item.retentionSourceId, retentionSourceRevision: item.retentionSourceRevision,
            retentionSourceProtectionEpoch: item.retentionSourceProtectionEpoch
        }))
    };
}

export function frozenDeletionPlan(request: Pick<DeletionRequest, 'id' | 'targetKind' | 'targetId' | 'previewDigest'>, items: DeletionItem[]) {
    return {
        requestId: request.id,
        targetKind: request.targetKind,
        targetId: request.targetId,
        previewDigest: request.previewDigest,
        items: [...items].sort((a, b) => a.id.localeCompare(b.id)).map(item => ({
            itemId: item.id,
            dependencyKind: item.dependencyKind,
            proposedAction: item.proposedAction,
            evidenceState: item.evidenceState,
            decision: item.decision,
            decisionReason: item.decisionReason,
            retentionSourceId: item.retentionSourceId,
            retentionSourceRevision: item.retentionSourceRevision,
            retentionSourceProtectionEpoch: item.retentionSourceProtectionEpoch
        }))
    };
}
