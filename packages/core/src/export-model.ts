import type { Base } from './model.ts';

export const EXPORT_FIELD_CODES = [
    'person.displayName', 'person.aliases', 'person.roles', 'person.cityCode', 'person.languageCodes', 'person.skillCodes', 'person.heightCm', 'person.intro', 'person.status',
    'work.title', 'work.description', 'work.industryCode', 'work.workTypeCodes', 'work.origin', 'work.originNote', 'work.status', 'work.relations',
    'project.title', 'project.brief', 'project.locationNote', 'project.dateNote', 'project.reviewNote', 'project.status', 'project.relations',
    'source.title', 'source.type', 'source.providerClaim', 'source.basisMode', 'source.basisDescription', 'source.validFrom', 'source.validUntil', 'source.status',
    'media.identity'
] as const;
export type ExportFieldCode = typeof EXPORT_FIELD_CODES[number];
export type ExportSubjectKind = 'SOURCE' | 'PERSON' | 'WORK' | 'PROJECT' | 'ASSET';

export interface UsePermission extends Base {
    sourceId: string;
    subjectKind: ExportSubjectKind;
    subjectId: string;
    purpose: 'INTERNAL_EXPORT';
    fields: ExportFieldCode[];
    validFrom: string;
    validUntil: string;
    status: 'ACTIVE' | 'REVOKED';
    evidenceNote: string;
    reviewerId: string;
    subjectPersonId: string | null;
    subjectWorkId: string | null;
    subjectProjectId: string | null;
    subjectAssetId: string | null;
    subjectSourceId: string | null;
}

export interface ExportJob extends Base {
    actorId: string;
    format: 'JSON';
    schemaVersion: 'once-export-v1';
    state: 'QUEUED' | 'READY' | 'STALE' | 'FAILED' | 'ERASED';
    recordManifest: unknown;
    fields: ExportFieldCode[];
    usePermissionRefs: string[];
    payload: unknown | null;
    payloadDigest: string | null;
    expiresAt: string;
    errorCode: string | null;
    leaseToken: string | null;
    leaseUntil: string | null;
    attempts: number;
}

export interface ExportDependency extends Base {
    exportId: string;
    kind: ExportSubjectKind;
    sourceId: string;
    sourceRevision: number;
    sourceProtectionEpoch: number;
    resourceRevision: number;
    resourceProtectionEpoch: number | null;
    fields: ExportFieldCode[];
    usePermissionId: string;
    usePermissionRevision: number;
    validUntil: string;
    personId: string | null;
    workId: string | null;
    projectId: string | null;
    assetId: string | null;
    sourceSubjectId: string | null;
}

export const EXPORT_LIMITS = Object.freeze({
    people: 100,
    works: 30,
    projects: 30,
    fields: EXPORT_FIELD_CODES.length,
    permissionRefs: 1000,
    ttlMs: 24 * 60 * 60000
});
