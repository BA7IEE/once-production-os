import type { Base } from './model.ts';

export type RecoveryState = 'PREPARED' | 'APPROVED';

export interface RecoveryRun extends Base {
    actorId: string;
    sourceEpochDigest: string;
    targetEpochDigest: string;
    state: RecoveryState;
    preparedAt: string;
    approvedAt: string | null;
    reportDigest: string | null;
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
