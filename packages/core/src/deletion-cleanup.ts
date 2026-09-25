import { randomUUID } from 'node:crypto';
import type { Actor, Clock, Config, Table } from './model.ts';
import type { Store, Tx } from './store.ts';
import type { DeletionItem, DeletionRequest, DeletionResolvedAction } from './deletion-model.ts';
import { executionPlan, frozenDeletionPlan, resolveDeletionAction } from './deletion-model.ts';
import { DeletionSchemas as S } from './deletion-validation.ts';
import { AppError, invariant, missing } from './errors.ts';
import { audit, cas, touch, workspaceRow } from './helpers.ts';
import { digest } from './json.ts';
import { requirePermission, sourceCurrent } from './policy.ts';

const LEASE_MS = 30000;
const MAX_ATTEMPTS = 3;
const relationTable: Record<string, Table> = {
    workAsset: 'workAssets',
    workCredit: 'workCredits',
    projectParticipant: 'projectParticipants',
    projectWork: 'projectWorks',
    shortlistItemAsset: 'shortlistItemAssets',
    shortlistItem: 'shortlistItems'
};
const actionPriority = (item: DeletionItem) => {
    if (item.resourceKind === 'shortlistItemAsset') return 10;
    if (item.resolvedAction === 'REMOVE_RELATION') return item.resourceKind === 'shortlistItem' ? 30 : 20;
    if (item.resolvedAction === 'REVOKE_PERMISSION') return 40;
    if (item.resolvedAction === 'ERASE_DERIVATIVE') return item.resourceKind === 'export' ? 50 : 60;
    if (item.resolvedAction === 'ERASE_PAYLOAD') return 70;
    if (item.resolvedAction === 'RETAIN_MINIMAL_HEADER') return 80;
    return 90;
};

type CleanupResult = { outcome: 'DONE' } | { outcome: 'WAITING_EXTERNAL'; code: string };

export class DeletionCleanup {
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

    private async validateRetentionSources(tx: Tx, items: DeletionItem[]) {
        for (const item of items) {
            if (item.decision !== 'RETAIN_WITH_BASIS') continue;
            invariant(!!item.retentionSourceId && !!item.retentionSourceRevision && !!item.retentionSourceProtectionEpoch,
                'RETENTION_BASIS_MISSING', '保留依据快照不完整', 409);
            const source = await tx.get('sources', item.retentionSourceId);
            invariant(source && source.basisMode === 'INTERNAL_USE' && sourceCurrent(source, this.clock)
                && source.revision === item.retentionSourceRevision
                && source.protectionEpoch === item.retentionSourceProtectionEpoch,
                'RETENTION_BASIS_CHANGED', '保留依据已经变化，禁止启动清理', 409);
        }
    }

    async start(tx: Tx, actor: Actor, id: string, input: unknown): Promise<DeletionRequest> {
        requirePermission(actor, 'data.delete');
        await this.enabled(tx, actor.workspaceId);
        const d = S.cleanupStart.parse(input);
        const row = await workspaceRow(tx, 'deletionRequests', id, actor.workspaceId);
        if (!row) missing();
        cas(row, d.expectedRevision);
        invariant(row.state === 'BLOCKED_FOR_USE' && !!row.planDigest, 'DELETION_PLAN_REQUIRED', '必须先完成阻断和清理计划冻结', 409);
        invariant(d.planDigest === row.planDigest, 'DELETION_PLAN_STALE', '提交的清理计划摘要与冻结计划不一致', 409);
        invariant(d.acknowledgeIrreversible === true, 'CLEANUP_ACK_REQUIRED', '请明确确认将开始不可逆依赖清理', 400);
        const items = await tx.find('deletionItems', { workspaceId: actor.workspaceId, requestId: row.id });
        invariant(items.length === row.impactCount && items.every(item => item.decision !== 'PENDING'), 'DELETION_PLAN_INCOMPLETE', '清理计划不完整', 409);
        invariant(digest(frozenDeletionPlan(row, items)) === row.planDigest, 'DELETION_PLAN_STALE', '冻结计划内容已经变化', 409);
        await this.validateRetentionSources(tx, items);

        const prepared = items.map(item => ({ ...item, resolvedAction: resolveDeletionAction(item) as DeletionResolvedAction,
            cleanupState: 'PENDING' as const, cleanupAttempts: 0, cleanupEvidenceDigest: null,
            cleanupErrorCode: null, cleanedAt: null }));
        const executionPlanDigest = digest(executionPlan(row, prepared));
        for (const item of prepared) await tx.replace('deletionItems', item);
        const next: DeletionRequest = { ...touch(row, this.clock), state: 'CLEANING', executionPlanDigest,
            cleanupStartedAt: this.clock.now().toISOString(), cleanupStartedById: actor.membershipId,
            cleanupLeaseToken: null, cleanupLeaseUntil: null, dependencyCleanupCompletedAt: null, cleanupErrorCode: null };
        await tx.replace('deletionRequests', next);
        return next;
    }

    private async owned(tx: Tx, claim: DeletionRequest) {
        const row = await workspaceRow(tx, 'deletionRequests', claim.id, claim.workspaceId);
        invariant(row && row.state === 'CLEANING' && row.cleanupLeaseToken === claim.cleanupLeaseToken
            && !!row.cleanupLeaseUntil && Date.parse(row.cleanupLeaseUntil) > this.clock.now().getTime(),
            'LEASE_LOST', '清理任务租约已失效', 409);
        invariant(row.executionPlanDigest === claim.executionPlanDigest, 'CLEANUP_PLAN_CHANGED', '执行计划发生变化', 409);
        return row;
    }

    async claim(): Promise<DeletionRequest | null> {
        if (this.config.accessMode !== 'INTERNAL' || this.config.dataCleanupMode !== 'INTERNAL_APPROVED') return null;
        return this.store.transaction(async tx => {
            const now = this.clock.now().getTime();
            const rows = (await tx.find('deletionRequests')).filter(row => row.state === 'CLEANING' && !row.dependencyCleanupCompletedAt)
                .sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
            for (const row of rows) {
                await this.enabled(tx, row.workspaceId);
                if (row.cleanupLeaseUntil && Date.parse(row.cleanupLeaseUntil) > now) continue;
                const items = await tx.find('deletionItems', { workspaceId: row.workspaceId, requestId: row.id });
                const unfinished = items.filter(item => item.cleanupState !== 'DONE');
                if (!unfinished.length) {
                    await tx.replace('deletionRequests', { ...touch(row, this.clock), dependencyCleanupCompletedAt: this.clock.now().toISOString(),
                        cleanupLeaseToken: null, cleanupLeaseUntil: null, cleanupErrorCode: null });
                    continue;
                }
                const processable = unfinished.filter(item => (item.cleanupState === 'PENDING' || item.cleanupState === 'FAILED') && item.cleanupAttempts < MAX_ATTEMPTS);
                if (!processable.length) {
                    const waiting = unfinished.some(item => item.cleanupState === 'WAITING_EXTERNAL');
                    await tx.replace('deletionRequests', { ...touch(row, this.clock), cleanupLeaseToken: null, cleanupLeaseUntil: null,
                        cleanupErrorCode: waiting ? 'WAITING_EXTERNAL_CLEANUP' : 'CLEANUP_ITEM_FAILED' });
                    continue;
                }
                const next: DeletionRequest = { ...touch(row, this.clock), cleanupLeaseToken: randomUUID(),
                    cleanupLeaseUntil: new Date(now + LEASE_MS).toISOString(), cleanupErrorCode: null };
                await tx.replace('deletionRequests', next);
                return next;
            }
            return null;
        });
    }

    private async apply(tx: Tx, request: DeletionRequest, item: DeletionItem): Promise<CleanupResult> {
        const action = item.resolvedAction;
        invariant(action, 'CLEANUP_ACTION_MISSING', '清理项没有冻结执行动作', 409);
        if (action === 'RETAIN_WITH_BASIS') {
            await this.validateRetentionSources(tx, [item]);
            return { outcome: 'DONE' };
        }
        if (action === 'REBIND_SOURCE') {
            await this.validateRetentionSources(tx, [item]);
            invariant(!!item.retentionSourceId && !!item.retentionSourceRevision && !!item.retentionSourceProtectionEpoch,
                'RETENTION_BASIS_MISSING', '重绑来源缺少冻结依据', 409);
            if (item.resourceKind === 'person') {
                const row = await tx.get('people', item.resourceId);
                if (row) await tx.replace('people', { ...touch(row, this.clock), sourceId: item.retentionSourceId });
                return { outcome: 'DONE' };
            }
            if (item.resourceKind === 'work') {
                const row = await tx.get('works', item.resourceId);
                if (row) await tx.replace('works', { ...touch(row, this.clock), sourceId: item.retentionSourceId });
                return { outcome: 'DONE' };
            }
            if (item.resourceKind === 'project') {
                const row = await tx.get('projects', item.resourceId);
                if (row) await tx.replace('projects', { ...touch(row, this.clock), sourceId: item.retentionSourceId });
                return { outcome: 'DONE' };
            }
            if (item.resourceKind === 'evidence') {
                const row = await tx.get('evidence', item.resourceId);
                if (row) await tx.replace('evidence', { ...touch(row, this.clock), sourceId: item.retentionSourceId, sourceRevision: item.retentionSourceRevision });
                return { outcome: 'DONE' };
            }
            throw new AppError(409, 'CLEANUP_ACTION_UNSUPPORTED', '来源重绑对象类型尚未注册');
        }
        if (action === 'DETACH_PERSON') {
            await this.validateRetentionSources(tx, [item]);
            if (item.resourceKind === 'asset') {
                const row = await tx.get('assets', item.resourceId);
                if (row) await tx.replace('assets', { ...touch(row, this.clock), personId: null });
                return { outcome: 'DONE' };
            }
            if (item.resourceKind === 'upload') {
                const row = await tx.get('uploads', item.resourceId);
                if (row) await tx.replace('uploads', { ...touch(row, this.clock), personId: null, personScopeId: null,
                    personEpoch: null, personScopeRevision: null });
                return { outcome: 'DONE' };
            }
            throw new AppError(409, 'CLEANUP_ACTION_UNSUPPORTED', '人物解绑对象类型尚未注册');
        }
        if (action === 'REMOVE_RELATION') {
            const table = relationTable[item.resourceKind];
            invariant(table, 'CLEANUP_ACTION_UNSUPPORTED', '关系清理类型尚未注册', 409);
            if (await tx.get(table as never, item.resourceId)) await tx.remove(table as never, item.resourceId);
            return { outcome: 'DONE' };
        }
        if (action === 'REVOKE_PERMISSION') {
            invariant(item.resourceKind === 'usePermission', 'CLEANUP_ACTION_UNSUPPORTED', '用途许可清理对象不正确', 409);
            const row = await tx.get('usePermissions', item.resourceId);
            if (row && row.status !== 'REVOKED') await tx.replace('usePermissions', { ...touch(row, this.clock), status: 'REVOKED' });
            return { outcome: 'DONE' };
        }
        if (action === 'ERASE_DERIVATIVE') {
            if (item.resourceKind === 'exportDependency') {
                if (await tx.get('exportDependencies', item.resourceId)) await tx.remove('exportDependencies', item.resourceId);
                return { outcome: 'DONE' };
            }
            if (item.resourceKind === 'export') {
                const row = await tx.get('exports', item.resourceId);
                if (row && row.state !== 'ERASED') await tx.replace('exports', { ...touch(row, this.clock), state: 'ERASED',
                    recordManifest: { schemaVersion: row.schemaVersion, erased: true }, fields: [], usePermissionRefs: [],
                    payload: null, payloadDigest: null, errorCode: 'ERASED_BY_DELETION', leaseToken: null, leaseUntil: null });
                return { outcome: 'DONE' };
            }
            throw new AppError(409, 'CLEANUP_ACTION_UNSUPPORTED', '派生物清理类型尚未注册');
        }
        if (action === 'RETAIN_MINIMAL_HEADER') {
            invariant(item.resourceKind === 'handoff', 'CLEANUP_ACTION_UNSUPPORTED', '最小头保留类型尚未注册', 409);
            const row = await tx.get('handoffs', item.resourceId);
            if (row && row.state !== 'REVOKED') await tx.replace('handoffs', { ...touch(row, this.clock), state: 'REVOKED',
                closedAt: row.closedAt ?? this.clock.now().toISOString(), closedById: row.closedById ?? request.cleanupStartedById });
            return { outcome: 'DONE' };
        }
        if (action === 'ERASE_PAYLOAD') {
            if (item.resourceKind === 'contact') {
                if (await tx.get('contacts', item.resourceId)) await tx.remove('contacts', item.resourceId);
                return { outcome: 'DONE' };
            }
            if (item.resourceKind === 'evidence') {
                if (await tx.get('evidence', item.resourceId)) await tx.remove('evidence', item.resourceId);
                return { outcome: 'DONE' };
            }
            if (item.resourceKind === 'import') {
                const row = await tx.get('imports', item.resourceId);
                if (row) await tx.replace('imports', { ...touch(row, this.clock), rows: [] });
                return { outcome: 'DONE' };
            }
            if (['upload','asset'].includes(item.resourceKind)) return { outcome: 'WAITING_EXTERNAL', code: 'MEDIA_PURGE_REQUIRED' };
            if (item.resourceKind === 'sourceHistory') return { outcome: 'WAITING_EXTERNAL', code: 'SOURCE_HISTORY_RETENTION_PROCEDURE_REQUIRED' };
            if (['person','work','project'].includes(item.resourceKind)) return { outcome: 'WAITING_EXTERNAL', code: 'ROOT_ENTITY_FINALIZATION_REQUIRED' };
            return { outcome: 'WAITING_EXTERNAL', code: 'SPECIALIZED_PAYLOAD_CLEANUP_REQUIRED' };
        }
        throw new AppError(409, 'CLEANUP_ACTION_UNSUPPORTED', '清理动作尚未注册');
    }

    private evidence(request: DeletionRequest, item: DeletionItem, cleanedAt: string) {
        return digest({ schemaVersion: 'once-cleanup-evidence-v1', requestId: request.id, itemId: item.id,
            resourceKind: item.resourceKind, resourceId: item.resourceId, resolvedAction: item.resolvedAction, cleanedAt });
    }

    private async processItem(claim: DeletionRequest, itemId: string): Promise<'DONE'|'WAITING_EXTERNAL'|'FAILED'> {
        try {
            return await this.store.transaction(async tx => {
                await this.enabled(tx, claim.workspaceId);
                const request = await this.owned(tx, claim);
                const item = await workspaceRow(tx, 'deletionItems', itemId, claim.workspaceId);
                if (!item || item.requestId !== request.id) missing();
                if (item.cleanupState === 'DONE') return 'DONE';
                invariant((item.cleanupState === 'PENDING' || item.cleanupState === 'FAILED') && item.cleanupAttempts < MAX_ATTEMPTS,
                    'CLEANUP_ITEM_NOT_PROCESSABLE', '清理项当前不能执行', 409);
                const result = await this.apply(tx, request, item);
                const attempts = item.cleanupAttempts + 1;
                const leaseUntil = new Date(this.clock.now().getTime() + LEASE_MS).toISOString();
                if (result.outcome === 'WAITING_EXTERNAL') {
                    await tx.replace('deletionItems', { ...touch(item, this.clock), cleanupState: 'WAITING_EXTERNAL', cleanupAttempts: attempts,
                        cleanupEvidenceDigest: null, cleanupErrorCode: result.code, cleanedAt: null });
                    await tx.replace('deletionRequests', { ...touch(request, this.clock), cleanupLeaseUntil: leaseUntil });
                    return 'WAITING_EXTERNAL';
                }
                const cleanedAt = this.clock.now().toISOString();
                await tx.replace('deletionItems', { ...touch(item, this.clock), cleanupState: 'DONE', cleanupAttempts: attempts,
                    cleanupEvidenceDigest: this.evidence(request, item, cleanedAt), cleanupErrorCode: null, cleanedAt });
                await audit(tx, null, request.workspaceId, 'deletion.cleanup-item', 'deletion', request.id,
                    [item.resourceKind, item.resolvedAction!], { requestId: randomUUID(), ip: 'worker' }, this.clock);
                await tx.replace('deletionRequests', { ...touch(request, this.clock), cleanupLeaseUntil: leaseUntil });
                return 'DONE';
            });
        }
        catch (error) {
            if (error instanceof AppError && error.code === 'LEASE_LOST') return 'FAILED';
            await this.store.transaction(async tx => {
                const request = await workspaceRow(tx, 'deletionRequests', claim.id, claim.workspaceId);
                const item = await workspaceRow(tx, 'deletionItems', itemId, claim.workspaceId);
                if (!request || !item || request.cleanupLeaseToken !== claim.cleanupLeaseToken || item.requestId !== request.id || item.cleanupState === 'DONE') return;
                const attempts = Math.min(MAX_ATTEMPTS, item.cleanupAttempts + 1);
                await tx.replace('deletionItems', { ...touch(item, this.clock), cleanupState: 'FAILED', cleanupAttempts: attempts,
                    cleanupEvidenceDigest: null, cleanupErrorCode: error instanceof AppError ? error.code : 'CLEANUP_FAILED', cleanedAt: null });
                await tx.replace('deletionRequests', { ...touch(request, this.clock), cleanupLeaseUntil: new Date(this.clock.now().getTime()+LEASE_MS).toISOString(),
                    cleanupErrorCode: attempts >= MAX_ATTEMPTS ? 'CLEANUP_ITEM_FAILED' : null });
            });
            return 'FAILED';
        }
    }

    private async finishCycle(claim: DeletionRequest) {
        await this.store.transaction(async tx => {
            const request = await workspaceRow(tx, 'deletionRequests', claim.id, claim.workspaceId);
            if (!request || request.state !== 'CLEANING' || request.cleanupLeaseToken !== claim.cleanupLeaseToken) return;
            const items = await tx.find('deletionItems', { workspaceId: claim.workspaceId, requestId: claim.id });
            const done = items.every(item => item.cleanupState === 'DONE');
            const waiting = items.some(item => item.cleanupState === 'WAITING_EXTERNAL');
            const exhausted = items.some(item => item.cleanupState === 'FAILED' && item.cleanupAttempts >= MAX_ATTEMPTS);
            await tx.replace('deletionRequests', { ...touch(request, this.clock),
                dependencyCleanupCompletedAt: done ? this.clock.now().toISOString() : request.dependencyCleanupCompletedAt,
                cleanupLeaseToken: null, cleanupLeaseUntil: null,
                cleanupErrorCode: done ? null : waiting ? 'WAITING_EXTERNAL_CLEANUP' : exhausted ? 'CLEANUP_ITEM_FAILED' : request.cleanupErrorCode });
        });
    }

    async process(claim: DeletionRequest): Promise<void> {
        const items = await this.store.transaction(async tx => {
            const request = await this.owned(tx, claim);
            const rows = await tx.find('deletionItems', { workspaceId: request.workspaceId, requestId: request.id });
            invariant(digest(executionPlan(request, rows)) === request.executionPlanDigest, 'CLEANUP_PLAN_CHANGED', '执行计划摘要不一致', 409);
            return rows.filter(item => (item.cleanupState === 'PENDING' || item.cleanupState === 'FAILED') && item.cleanupAttempts < MAX_ATTEMPTS)
                .sort((a,b)=>actionPriority(a)-actionPriority(b)||a.id.localeCompare(b.id)).map(item=>item.id);
        });
        for (const id of items) {
            const result = await this.processItem(claim, id);
            if (result === 'FAILED') break;
        }
        await this.finishCycle(claim);
    }
}
