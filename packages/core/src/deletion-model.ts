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
    state: 'DRAFT';
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
}

export interface DeletionItem extends Base {
    requestId: string;
    resourceKind: string;
    resourceId: string;
    dependencyKind: string;
    proposedAction: DeletionAction;
    evidenceState: DeletionEvidenceState;
    detailCode: string;
}

export const DELETION_LIMITS = Object.freeze({
    impacts: 1000,
    reason: 2000
});
