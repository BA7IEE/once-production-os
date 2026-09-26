import type { Base } from './model.ts';

export type RecoveryState = 'PREPARED' | 'INSPECTED' | 'APPROVED';

export interface RecoveryMediaCheck {
    provider: 'disabled' | 'local';
    identityDigest: string;
    backupIdentityDigest: string;
    expectedAssetIds: string[];
    verifiedAssetIds: string[];
    missingAssetIds: string[];
    mismatchAssetIds: string[];
}

export interface RecoveryCheckReport {
    schemaVersion: 'once-recovery-check-v1';
    recoveryRunId: string;
    workspaceId: string;
    targetEpochDigest: string;
    checkedAt: string;
    databaseStateDigest: string;
    migrationDigest: string;
    migrationMatch: boolean;
    contactKeyDigest: string;
    contactCount: number;
    contactDecryptFailures: number;
    media: RecoveryMediaCheck;
    blockers: string[];
}

export interface RecoveryExternalCheck {
    migrationDigest: string;
    migrationMatch: boolean;
    media: RecoveryMediaCheck;
}


export const RECOVERY_PREPARE_CONTAINED_OPERATIONS = [
    'source.suspend',
    'handoff.decline',
    'handoff.revoke',
    'usePermission.revoke',
    'asset.quarantine',
    'upload.cancel'
] as const;

export type RecoveryDeltaState = 'ABORTED' | 'COMMITTED' | 'UNRESOLVED' | 'AUDIT_ONLY';
export type RecoveryDeltaResolution = 'NO_COMMIT' | 'CONTAINED_BY_PREPARE' | 'SUPPLEMENTAL_AUDIT' | 'BLOCKER';

export interface RecoveryDeltaItem {
    key: string;
    operation: string;
    resourceId: string;
    state: RecoveryDeltaState;
    resolution: RecoveryDeltaResolution;
    reasonCode: string;
    evidenceSeqs: number[];
}
export interface RecoveryDeltaResolutionReport {
    schemaVersion: 'once-recovery-delta-v1';
    backupSequence: number;
    currentSequence: number;
    postBackupEntries: number;
    resolved: number;
    unresolved: number;
    items: RecoveryDeltaItem[];
}

export interface RecoveryApprovalEvidence {
    schemaVersion: 'once-recovery-approval-v1';
    backupId: string;
    backupManifestDigest: string;
    databaseSha256: string;
    recoveryEpochDigest: string;
    contactKeyDigest: string;
    migrationDigest: string;
    mediaIdentityDigest: string;
    reportDigest: string;
    deltaResolutionDigest: string;
    deltaResolution: RecoveryDeltaResolutionReport;
    safetyJournal: {
        journalId: string;
        backupSequence: number;
        backupHeadHash: string;
        currentSequence: number;
        currentHeadHash: string;
        postBackupEntries: number;
    };
}

export interface RecoveryRun extends Base {
    actorId: string;
    sourceEpochDigest: string;
    targetEpochDigest: string;
    state: RecoveryState;
    preparedAt: string;
    checkedAt: string | null;
    approvedAt: string | null;
    reportDigest: string | null;
    report: RecoveryCheckReport | Record<string, never>;
    approvalDigest: string | null;
    approval: RecoveryApprovalEvidence | Record<string, never>;
    revokedSessions: number;
    consumedActivations: number;
    disabledUsers: number;
    disabledMemberships: number;
    revokedHandoffs: number;
    revokedUsePermissions: number;
    invalidatedExports: number;
    failedJobs: number;
    failedUploads: number;
    quarantinedAssets: number;
    suspendedSources: number;
}

export interface RecoveryPrepareSummary {
    workspaceId: string;
    sourceEpochDigest: string;
    targetEpochDigest: string;
    alreadyPrepared: boolean;
    counts: {
        sessions: number;
        activations: number;
        usersToDisable: number;
        membershipsToDisable: number;
        handoffs: number;
        usePermissions: number;
        exports: number;
        jobs: number;
        uploads: number;
        assets: number;
        sources: number;
    };
}
