import type { Base } from './model.ts';
export const MEDIA_LIMITS = Object.freeze({ imageBytes: 30000000, pdfBytes: 50000000, videoBytes: 200000000, pixels: 60000000, previewBytes: 5000000,
    actorActive: 3, workspaceActive: 20, actorHourly: 100, records: 50000, activeBytes: 1000000000, retainedBytes: 2000000000,
    uploadMs: 5 * 60000, renewals: 2, processingMs: 60 * 60000, leaseMs: 30000,
    receiveMs: 60000, receiveLeaseMs: 90000, parseMs: 60000, attempts: 3, cleanupMs: 24 * 60 * 60000 });
export const MEDIA_MIMES = ['image/jpeg','image/png','image/webp','application/pdf','video/mp4'] as const;
export type MediaMime = typeof MEDIA_MIMES[number];
export function mediaByteLimit(mime:string){return mime==='application/pdf'?MEDIA_LIMITS.pdfBytes:mime==='video/mp4'?MEDIA_LIMITS.videoBytes:MEDIA_LIMITS.imageBytes;}
export type UploadState = 'OPEN' | 'RECEIVING' | 'UPLOADED' | 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED' | 'CANCELLED' | 'ERASED';
export interface MediaUpload extends Base {
    /** Null for external principals; never an employee surrogate. */
    actorId: string | null;
    contextKind?: UploadContext['kind'];
    principalKind?: 'INTERNAL' | 'TALENT' | 'MACHINE';
    talentAccountId?: string | null;
    servicePrincipalId?: string | null;
    submissionId?: string | null;
    personRoleId?: string | null;
    grantEpoch?: number | null;
    recoveryEpoch?: string | null;
    actorRevision: number;
    actorEpoch: number;
    sourceId: string | null;
    sourceRevision: number | null;
    sourceEpoch: number | null;
    scopeId: string;
    scopeRevision: number;
    personId: string | null;
    personEpoch: number | null;
    personScopeId: string | null;
    personScopeRevision: number | null;
    fileName: string;
    mime: MediaMime;
    expectedBytes: number;
    expectedHash: string;
    state: UploadState;
    expiresAt: string;
    renewals: number;
    attempts: number;
    receiveToken: string | null;
    leaseToken: string | null;
    leaseUntil: string | null;
    errorCode: string | null;
    purgedAt: string | null;
}
export interface MediaAsset extends Base {
    uploadId: string;
    sourceId: string | null;
    scopeId: string;
    personId: string | null;
    fileName: string;
    mime: MediaMime;
    bytes: number;
    sha256: string;
    width: number;
    height: number;
    previewBytes: number;
    previewHash: string;
    objectToken: string;
    state: 'READY' | 'QUARANTINED' | 'ERASED';
    usageState?: MediaUsageState;
    protectionEpoch?: number;
}
export interface MediaResult {
    mime: MediaMime;
    sha256: string;
    bytes: number;
    width: number;
    height: number;
    previewBytes: number;
    previewHash: string;
}
export const terminalUpload = (state: UploadState) => ['READY', 'FAILED', 'CANCELLED', 'ERASED'].includes(state);

export type UploadContext =
    | {kind:'INTERNAL_SOURCE'; membershipId:string; sourceId:string; personId:string|null}
    | {kind:'TALENT_SUBMISSION'; talentAccountId:string; submissionId:string; personId:string|null; personRoleId:string|null}
    | {kind:'AGENT_SUBMISSION'; servicePrincipalId:string; submissionId:string; personId:string|null; personRoleId:string|null};
export type MediaUsageState = 'STAGED' | 'ADOPTED' | 'RETIRED';
/** Formal relation is separate from immutable upload/asset origin. */
export interface PersonMedia extends Base {
    personId:string|null;
    personRoleId:string|null;
    assetId:string;
    sourceId:string|null;
    submissionId:string|null;
    usageState:MediaUsageState;
    purpose:'SUBMITTED_MATERIAL';
    importedOrigin?:Record<string,unknown>|null;
    protectionEpoch:number;
    retainUntil:string|null;
    retiredAt:string|null;
    purgedAt:string|null;
}
export const mediaUsage = (a:MediaAsset):MediaUsageState => a.usageState ?? 'ADOPTED';

export const MEDIA_ADMISSION_DEFAULTS=Object.freeze({talentBytes:2000000000,enrollBytes:200000000,workspaceBytes:MEDIA_LIMITS.retainedBytes,workspaceActiveBytes:MEDIA_LIMITS.activeBytes,actorActive:MEDIA_LIMITS.actorActive,workspaceActive:MEDIA_LIMITS.workspaceActive,actorHourly:MEDIA_LIMITS.actorHourly});
export type MediaAdmission={ -readonly [K in keyof typeof MEDIA_ADMISSION_DEFAULTS]:number };
