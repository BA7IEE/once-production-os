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
    actorId: string;
    actorRevision: number;
    actorEpoch: number;
    sourceId: string;
    sourceRevision: number;
    sourceEpoch: number;
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
    sourceId: string;
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
