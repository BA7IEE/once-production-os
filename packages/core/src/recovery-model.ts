import type { Base } from './model.ts';

export type RecoveryState = 'PREPARED' | 'INSPECTED' | 'APPROVED';

export interface RecoveryMediaCheck {
    provider: 'disabled' | 'local';
    identityDigest: string;
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


export interface RecoveryApprovalEvidence {
    schemaVersion: 'once-recovery-approval-v1';
    backupId: string;
    backupManifestDigest: string;
    databaseSha256: string;
    recoveryEpochDigest: string;
    contactKeyDigest: string;
    migrationDigest: string;
    reportDigest: string;
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
