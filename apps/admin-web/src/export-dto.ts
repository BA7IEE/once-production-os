import type { ExportFieldCode, ExportSubjectKind } from '../../../packages/core/src/export-model.ts';

export interface UsePermissionDto {
    id: string;
    sourceId: string;
    subjectKind: ExportSubjectKind;
    subjectId: string;
    fields: ExportFieldCode[];
    validFrom: string;
    validUntil: string;
    status: 'ACTIVE' | 'REVOKED';
    revision: number;
    evidenceNote?: string;
    reviewerId?: string;
}
export interface ExportSummary {
    id: string;
    state: 'QUEUED' | 'READY' | 'STALE' | 'FAILED' | 'ERASED';
    format: 'JSON';
    schemaVersion: 'once-export-v1';
    fields: ExportFieldCode[];
    createdAt: string;
    expiresAt: string;
    revision: number;
    payloadDigest: string | null;
}
export interface ExportDetail extends ExportSummary {
    effectiveState: 'QUEUED' | 'READY' | 'STALE' | 'FAILED' | 'ERASED';
    contentChanged: boolean;
    downloadable: boolean;
    blockedReason: string | null;
}
export interface ExportDownload {
    fileName: string;
    sha256: string | null;
    payload: unknown;
}
