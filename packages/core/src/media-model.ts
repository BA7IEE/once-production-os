import type { Base } from './model.ts';
export const MEDIA_LIMITS = Object.freeze({ imageBytes: 30000000, pixels: 60000000, previewBytes: 5000000,
    actorActive: 3, workspaceActive: 20, actorHourly: 100, records: 50000, activeBytes: 1000000000, retainedBytes: 2000000000,
    uploadMs: 5 * 60000, renewals: 2, processingMs: 60 * 60000, leaseMs: 30000,
    receiveMs: 60000, receiveLeaseMs: 90000, parseMs: 60000, attempts: 3, cleanupMs: 24 * 60 * 60000 });
export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
export type UploadState = 'OPEN' | 'RECEIVING' | 'UPLOADED' | 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED' | 'CANCELLED';
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
    mime: ImageMime;
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
    mime: ImageMime;
    bytes: number;
    sha256: string;
    width: number;
    height: number;
    previewBytes: number;
    previewHash: string;
    objectToken: string;
    state: 'READY' | 'QUARANTINED';
}
export interface MediaResult {
    mime: ImageMime;
    sha256: string;
    bytes: number;
    width: number;
    height: number;
    previewBytes: number;
    previewHash: string;
}
export const terminalUpload = (state: UploadState) => ['READY', 'FAILED', 'CANCELLED'].includes(state);
