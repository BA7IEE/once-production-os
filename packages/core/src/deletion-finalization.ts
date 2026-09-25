import { randomUUID } from 'node:crypto';
import type { Clock, Config } from './model.ts';
import type { Store, Tx } from './store.ts';
import type { DeletionItem, DeletionRequest } from './deletion-model.ts';
import { AppError, invariant, missing } from './errors.ts';
import { audit, touch, workspaceRow } from './helpers.ts';
import { digest } from './json.ts';

const LEASE_MS = 30000;
const MAX_ATTEMPTS = 3;
const ZERO_HASH = '0'.repeat(64);
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export interface MediaFinalizationTask { mediaId: string; }

export class DeletionFinalization {
    store: Store;
    clock: Clock;
    config: Config;
    constructor(store: Store, clock: Clock, config: Config) { this.store = store; this.clock = clock; this.config = config; }

    private async enabled(tx: Tx, workspaceId: string) {
        const workspace = await tx.get('workspaces', workspaceId);
        invariant(this.config.accessMode === 'INTERNAL' && this.config.dataCleanupMode === 'INTERNAL_APPROVED'
            && workspace?.recoveryEpoch === this.config.recoveryEpoch,
            'CLEANUP_DISABLED', '当前环境未批准不可逆清理', 503);
    }

    private async owned(tx: Tx, claim: DeletionRequest) {
        const row = await workspaceRow(tx, 'deletionRequests', claim.id, claim.workspaceId);
        invariant(row && row.state === 'CLEANING' && row.finalizationLeaseToken === claim.finalizationLeaseToken
            && !!row.finalizationLeaseUntil && Date.parse(row.finalizationLeaseUntil) > this.clock.now().getTime(),
            'LEASE_LOST', '最终化任务租约已失效', 409);
        return row;
    }

    async claim(): Promise<DeletionRequest | null> {
        if (this.config.accessMode !== 'INTERNAL' || this.config.dataCleanupMode !== 'INTERNAL_APPROVED') return null;
        return this.store.transaction(async tx => {
            const now = this.clock.now().getTime();
            const rows = (await tx.find('deletionRequests')).filter(row => row.state === 'CLEANING')
                .sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
            for (const row of rows) {
                await this.enabled(tx, row.workspaceId);
                if (row.cleanupLeaseUntil && Date.parse(row.cleanupLeaseUntil) > now) continue;
                if (row.finalizationLeaseUntil && Date.parse(row.finalizationLeaseUntil) > now) continue;
                const items = await tx.find('deletionItems', { workspaceId: row.workspaceId, requestId: row.id });
                if (items.some(item => item.cleanupState === 'PENDING' || (item.cleanupState === 'FAILED' && item.cleanupAttempts < 3)))
                    continue;
                if (items.some(item => item.cleanupState === 'FAILED' && item.cleanupAttempts >= 3)) {
                    await tx.replace('deletionRequests', { ...touch(row, this.clock), state: 'FAILED',
                        finalizationAttempts: 3, finalizationErrorCode: 'DEPENDENCY_CLEANUP_FAILED',
                        finalizationLeaseToken: null, finalizationLeaseUntil: null });
                    continue;
                }
                if (row.finalizationAttempts >= MAX_ATTEMPTS) {
                    await tx.replace('deletionRequests', { ...touch(row, this.clock), state: 'FAILED',
                        finalizationAttempts: MAX_ATTEMPTS, finalizationErrorCode: row.finalizationErrorCode ?? 'FINALIZATION_ATTEMPTS_EXHAUSTED',
                        finalizationLeaseToken: null, finalizationLeaseUntil: null });
                    continue;
                }
                const next: DeletionRequest = { ...touch(row, this.clock), finalizationAttempts: row.finalizationAttempts + 1,
                    finalizationLeaseToken: randomUUID(), finalizationLeaseUntil: new Date(now + LEASE_MS).toISOString(),
                    finalizationErrorCode: null };
                await tx.replace('deletionRequests', next);
                return next;
            }
            return null;
        });
    }

    async mediaTasks(claim: DeletionRequest): Promise<MediaFinalizationTask[]> {
        return this.store.transaction(async tx => {
            const row = await this.owned(tx, claim);
            const ids = new Set<string>();
            for (const item of await tx.find('deletionItems', { workspaceId: row.workspaceId, requestId: row.id }))
                if (item.cleanupState === 'WAITING_EXTERNAL' && item.cleanupErrorCode === 'MEDIA_PURGE_REQUIRED'
                    && (item.resourceKind === 'asset' || item.resourceKind === 'upload'))
                    ids.add(item.resourceId);
            if (row.targetKind === 'ASSET') ids.add(row.targetId);
            return [...ids].sort().map(mediaId => ({ mediaId }));
        });
    }

    private async markDone(tx: Tx, request: DeletionRequest, item: DeletionItem, mode: string) {
        if (item.cleanupState === 'DONE') return;
        const cleanedAt = this.clock.now().toISOString();
        const evidence = digest({ schemaVersion: 'once-finalization-item-v1', requestId: request.id, itemId: item.id,
            resourceKind: item.resourceKind, resourceId: item.resourceId, resolvedAction: item.resolvedAction, mode, cleanedAt });
        await tx.replace('deletionItems', { ...touch(item, this.clock), cleanupState: 'DONE',
            cleanupEvidenceDigest: evidence, cleanupErrorCode: null, cleanedAt });
        await audit(tx, null, request.workspaceId, 'deletion.finalize-item', 'deletion', request.id,
            [item.resourceKind, mode], { requestId: randomUUID(), ip: 'worker' }, this.clock);
    }

    private erasedUpload(row: any) {
        return { ...touch(row, this.clock), fileName: '[ERASED]', expectedHash: ZERO_HASH, expectedBytes: 0,
            state: 'ERASED' as const, personId: null, personScopeId: null, personEpoch: null, personScopeRevision: null,
            receiveToken: null, leaseToken: null, leaseUntil: null, errorCode: 'ERASED_BY_DELETION',
            purgedAt: row.purgedAt ?? this.clock.now().toISOString() };
    }
    private erasedAsset(row: any) {
        return { ...touch(row, this.clock), fileName: '[ERASED]', sha256: ZERO_HASH, previewHash: ZERO_HASH,
            bytes: 0, width: 0, height: 0, previewBytes: 0, objectToken: ZERO_UUID, personId: null, state: 'ERASED' as const };
    }

    async completeMediaPurge(claim: DeletionRequest, mediaId: string): Promise<void> {
        await this.store.transaction(async tx => {
            await this.enabled(tx, claim.workspaceId);
            const request = await this.owned(tx, claim);
            const upload = await tx.get('uploads', mediaId);
            const asset = await tx.get('assets', mediaId);
            if (upload && upload.state !== 'ERASED') await tx.replace('uploads', this.erasedUpload(upload));
            if (asset && asset.state !== 'ERASED') await tx.replace('assets', this.erasedAsset(asset));
            for (const item of await tx.find('deletionItems', { workspaceId: request.workspaceId, requestId: request.id })) {
                if (item.resourceId === mediaId && item.cleanupState === 'WAITING_EXTERNAL'
                    && item.cleanupErrorCode === 'MEDIA_PURGE_REQUIRED' && (item.resourceKind === 'asset' || item.resourceKind === 'upload'))
                    await this.markDone(tx, request, item, 'MEDIA_PURGED');
            }
            await tx.replace('deletionRequests', { ...touch(request, this.clock),
                finalizationLeaseUntil: new Date(this.clock.now().getTime() + LEASE_MS).toISOString() });
        });
    }

    private async tombstone(tx: Tx, kind: DeletionRequest['targetKind'], id: string): Promise<Record<string, unknown>> {
        if (kind === 'SOURCE') {
            const row = await tx.get('sources', id); if (!row) missing();
            const next = { ...touch(row, this.clock), title: '[ERASED]', type: 'MANUAL' as const, providerClaim: '', textPayload: '',
                basisMode: 'INTERNAL_USE' as const, basisDescription: '[ERASED]', status: 'ERASED' as const,
                protectionEpoch: row.protectionEpoch + 1, reviewedBy: null, reviewedAt: null };
            await tx.replace('sources', next);
            return { kind, id, revision: next.revision, status: next.status, protectionEpoch: next.protectionEpoch };
        }
        if (kind === 'PERSON') {
            const row = await tx.get('people', id); if (!row) missing();
            const next = { ...touch(row, this.clock), displayName: '[ERASED]', aliases: [], roles: ['erased'], cityCode: null,
                languageCodes: [], skillCodes: [], heightCm: null, intro: '', status: 'ERASED' as const,
                protectionEpoch: row.protectionEpoch + 1 };
            await tx.replace('people', next);
            return { kind, id, revision: next.revision, status: next.status, protectionEpoch: next.protectionEpoch };
        }
        if (kind === 'WORK') {
            const row = await tx.get('works', id); if (!row) missing();
            const next = { ...touch(row, this.clock), title: '[ERASED]', description: '', industryCode: null, workTypeCodes: [],
                origin: 'UNKNOWN' as const, originNote: '', status: 'ERASED' as const, coverEntryId: null };
            await tx.replace('works', next);
            return { kind, id, revision: next.revision, status: next.status };
        }
        if (kind === 'PROJECT') {
            const row = await tx.get('projects', id); if (!row) missing();
            const next = { ...touch(row, this.clock), title: '[ERASED]', brief: '', locationNote: '', dateNote: '', reviewNote: '',
                status: 'ERASED' as const };
            await tx.replace('projects', next);
            return { kind, id, revision: next.revision, status: next.status };
        }
        const asset = await tx.get('assets', id);
        const upload = await tx.get('uploads', id);
        invariant(asset?.state === 'ERASED' && upload?.state === 'ERASED', 'MEDIA_PURGE_REQUIRED', '素材必须先完成物理清理', 409);
        return { kind, id, revision: asset.revision, status: asset.state };
    }

    private async databaseSpecials(tx: Tx, request: DeletionRequest) {
        const items = await tx.find('deletionItems', { workspaceId: request.workspaceId, requestId: request.id });
        for (const item of items) {
            if (item.cleanupState !== 'WAITING_EXTERNAL') continue;
            if (item.cleanupErrorCode === 'SOURCE_HISTORY_RETENTION_PROCEDURE_REQUIRED' && item.resourceKind === 'sourceHistory') {
                await tx.redactSourceHistory(item.resourceId, this.clock.now().toISOString());
                await this.markDone(tx, request, item, 'SOURCE_HISTORY_REDACTED');
                continue;
            }
            if (item.cleanupErrorCode === 'ROOT_ENTITY_FINALIZATION_REQUIRED' && ['person','work','project'].includes(item.resourceKind)) {
                const kind = item.resourceKind === 'person' ? 'PERSON' : item.resourceKind === 'work' ? 'WORK' : 'PROJECT';
                await this.tombstone(tx, kind, item.resourceId);
                await this.markDone(tx, request, item, 'ROOT_TOMBSTONED');
                continue;
            }
            throw new AppError(409, 'SPECIALIZED_CLEANUP_UNRESOLVED', '仍有未注册的专用清理步骤');
        }
    }

    private async redactAllTargetSourceHistory(tx: Tx, request: DeletionRequest) {
        if (request.targetKind !== 'SOURCE') return;
        for (const row of await tx.find('sourceHistory', { workspaceId: request.workspaceId, sourceId: request.targetId }))
            await tx.redactSourceHistory(row.id, this.clock.now().toISOString());
    }

    async finish(claim: DeletionRequest): Promise<void> {
        try {
            await this.store.transaction(async tx => {
                await this.enabled(tx, claim.workspaceId);
                const request = await this.owned(tx, claim);
                await this.databaseSpecials(tx, request);
                // Deletion blocking itself may append history after the original impact preview.
                // Final SOURCE erasure must redact the complete current history chain.
                await this.redactAllTargetSourceHistory(tx, request);
                const items = await tx.find('deletionItems', { workspaceId: request.workspaceId, requestId: request.id });
                invariant(items.every(item => item.cleanupState === 'DONE'), 'SPECIALIZED_CLEANUP_UNRESOLVED', '仍有专用清理未完成', 409);
                const root = await this.tombstone(tx, request.targetKind, request.targetId);
                const finalizedAt = this.clock.now().toISOString();
                const finalizationDigest = digest({ schemaVersion: 'once-finalization-v1', requestId: request.id,
                    targetKind: request.targetKind, targetId: request.targetId, root,
                    items: items.sort((a,b)=>a.id.localeCompare(b.id)).map(item => ({ id: item.id, evidence: item.cleanupEvidenceDigest })) });
                const retained = items.some(item => item.decision === 'RETAIN_WITH_BASIS');
                const state = retained ? 'RETAINED_WITH_BASIS' as const : 'COMPLETED' as const;
                await tx.replace('deletionRequests', { ...touch(request, this.clock), state, finalizationDigest, finalizedAt,
                    finalizationLeaseToken: null, finalizationLeaseUntil: null, finalizationErrorCode: null,
                    cleanupLeaseToken: null, cleanupLeaseUntil: null, cleanupErrorCode: null,
                    dependencyCleanupCompletedAt: request.dependencyCleanupCompletedAt ?? finalizedAt });
                await audit(tx, null, request.workspaceId, 'deletion.finalized', 'deletion', request.id,
                    [state, request.targetKind], { requestId: randomUUID(), ip: 'worker' }, this.clock);
            });
        } catch (error) {
            if (error instanceof AppError && error.code === 'LEASE_LOST') return;
            await this.fail(claim, error instanceof AppError ? error.code : 'FINALIZATION_FAILED');
        }
    }

    async fail(claim: DeletionRequest, code: string): Promise<void> {
        await this.store.transaction(async tx => {
            const row = await workspaceRow(tx, 'deletionRequests', claim.id, claim.workspaceId);
            if (!row || row.state !== 'CLEANING' || row.finalizationLeaseToken !== claim.finalizationLeaseToken) return;
            const exhausted = row.finalizationAttempts >= MAX_ATTEMPTS;
            await tx.replace('deletionRequests', { ...touch(row, this.clock),
                state: exhausted ? 'FAILED' : 'CLEANING',
                finalizationLeaseToken: null, finalizationLeaseUntil: null,
                finalizationErrorCode: code,
                ...(exhausted ? { cleanupErrorCode: code } : {}) });
        });
    }
}
