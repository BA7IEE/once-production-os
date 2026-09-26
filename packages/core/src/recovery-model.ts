import type { Base } from './model.ts';

export type RecoveryState = 'PREPARED' | 'INSPECTED' | 'APPROVED';

export interface RecoveryMediaCheck {
    provider: 'disabled' | 'local';
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
    contactCount: number;
    contactDecryptFailures: number;
    media: RecoveryMediaCheck;
    blockers: string[];
}

export interface RecoveryExternalCheck {
    migrationDigest: string;
    media: RecoveryMediaCheck;
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
