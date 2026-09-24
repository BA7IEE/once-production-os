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
    state: 'DRAFT';
    impactCount: number;
    reviewRequiredCount: number;
    createdAt: string;
    revision: number;
}
export interface DeletionRequestDetail extends DeletionRequestSummary {
    targetRevision: number;
    reason: string;
    previewDigest: string;
    unresolvedCount: number;
    executionAvailable: false;
    executionNote: string;
}
