import type { DeletionAction, DeletionEvidenceState, DeletionTargetKind } from '../../../packages/core/src/deletion-model.ts';

export interface DeletionImpact {
    resourceKind: string;
    resourceId: string;
    dependencyKind: string;
    proposedAction: DeletionAction;
    evidenceState: DeletionEvidenceState;
    detailCode: string;
}
export interface DeletionPreview {
    target: {
        kind: DeletionTargetKind;
        id: string;
        sourceId: string;
        revision: number;
        protectionEpoch: number | null;
    };
    complete: boolean;
    impactCount: number;
    reviewRequiredCount: number;
    unresolvedCount: number;
    summary: Array<{
        dependencyKind: string;
        proposedAction: string;
        evidenceState: string;
        count: number;
    }>;
    items: DeletionImpact[];
    unresolved: Array<{ code: string; count: number }>;
    previewDigest: string;
}
export interface DeletionRequestSummary {
    id: string;
    targetKind: DeletionTargetKind;
    targetId: string;
    state: 'DRAFT' | 'BLOCKED_FOR_USE' | 'CLEANING' | 'COMPLETED' | 'RETAINED_WITH_BASIS';
    impactCount: number;
    reviewRequiredCount: number;
    planFrozen?: boolean;
    createdAt: string;
    revision: number;
}
export interface DeletionRequestDetail extends DeletionRequestSummary {
    targetRevision: number;
    reason: string;
    previewDigest: string;
    unresolvedCount: number;
    pendingDecisionCount: number;
    blockAvailable: boolean;
    planFrozen: boolean;
    planDigest: string | null;
    planFrozenAt: string | null;
    cleanupStartAvailable: boolean;
    cleanupDoneCount: number;
    cleanupWaitingCount: number;
    cleanupFailedCount: number;
    dependencyCleanupCompletedAt: string | null;
    cleanupErrorCode: string | null;
    rootFinalizedAt: string | null;
    rootFinalizationEvidenceDigest: string | null;
    cleanupAvailable: false;
    executionAvailable: false;
    executionNote: string;
}
export interface DeletionDecisionItem {
    id: string;
    dependencyKind: string;
    proposedAction: DeletionAction;
    evidenceState: DeletionEvidenceState;
    detailCode: string;
    decision: 'PENDING' | 'APPLY_PROPOSED' | 'RETAIN_WITH_BASIS';
    decisionReason: string;
    retentionBasisPresent: boolean;
    decidedAt: string | null;
}
