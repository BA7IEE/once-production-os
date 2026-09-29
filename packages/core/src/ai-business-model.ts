import type { Base } from './model.ts';
export type AiTaskType = 'extract_profile' | 'suggest_tags' | 'draft_locale' | 'parse_search';
export interface AiGrant extends Base {
    sourceId: string;
    sourceRevision: number;
    sourceProtectionEpoch: number;
    scopeId: string;
    scopeRevision: number;
    providerIdentityHash: string;
    configRevision: number;
    reviewerId: string;
    validUntil: string;
    status: 'ACTIVE' | 'REVOKED';
    evidenceNote: string;
}
export interface AiTask extends Base {
    runId: string;
    actorId: string;
    taskType: AiTaskType;
    personId: string | null;
    workId: string | null;
    projectId: string | null;
    targetRevision: number | null;
    targetProtectionEpoch: number | null;
    targetScopeId: string | null;
    targetScopeRevision: number | null;
    localeTextId: string | null;
    localeRevision: number | null;
    inputSpec: unknown;
    oldValues: unknown;
    output: unknown;
    proposalState: 'NONE' | 'PENDING' | 'APPLIED' | 'REJECTED' | 'ERASED';
    selectedFields: string[];
    discardedFields: string[];
}
export interface AiDependency extends Base {
    taskId: string;
    sourceId: string;
    grantId: string | null;
    grantRevision: number | null;
    sourceRevision: number;
    protectionEpoch: number;
    scopeId: string;
    scopeRevision: number;
}
