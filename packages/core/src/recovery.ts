import type { Actor, Clock, Config, Source } from './model.ts';
import type { Tx } from './store.ts';
import type { RecoveryCheckReport, RecoveryExternalCheck, RecoveryPrepareSummary, RecoveryRun } from './recovery-model.ts';
import { AppError, invariant } from './errors.ts';
import { audit, base, touch, unique, workspaceRow } from './helpers.ts';
import { decryptContact, hashSecret } from './crypto.ts';
import { digest } from './json.ts';
import { uuid } from './validation.ts';
import { permissionsFor } from './policy.ts';
import { appendSourceHistory } from './source-history.ts';

type RecoveryConfig = Pick<Config, 'accessMode' | 'dataEgressMode' | 'dataCleanupMode' | 'dataMergeMode' | 'recoveryEpoch'> & { contactKey?: Buffer };

const RECOVERY_ERROR = 'RESTORE_REVIEW_REQUIRED';

export class RecoveryOps {
    clock: Clock;
    config: RecoveryConfig;
    constructor(clock: Clock, config: RecoveryConfig) { this.clock = clock; this.config = config; }

    private gates() {
        invariant(this.config.accessMode === 'MAINTENANCE', 'RECOVERY_MAINTENANCE_REQUIRED',
            '恢复准备只允许在 MAINTENANCE 模式执行', 503);
        invariant(this.config.dataEgressMode === 'DISABLED'
            && this.config.dataCleanupMode === 'DISABLED'
            && this.config.dataMergeMode === 'DISABLED',
            'RECOVERY_GATES_NOT_CLOSED', '恢复准备前必须关闭导出、清理与合并执行闸门', 503);
        invariant(/^[A-Za-z0-9_-]{32,128}$/.test(this.config.recoveryEpoch),
            'RECOVERY_EPOCH_INVALID', '部署侧新 recovery epoch 格式无效', 503);
    }

    async actorFromRestoredTarget(tx: Tx, loginName: string): Promise<Actor> {
        this.gates();
        const workspaces = await tx.find('workspaces');
        invariant(workspaces.length === 1 && workspaces[0], 'RECOVERY_INSTALLATION_INVALID',
            '恢复目标必须只有一个工作空间', 409);
        const users = await tx.find('users', { workspaceId: workspaces[0]!.id, loginName });
        invariant(users.length === 1 && users[0]?.status === 'ACTIVE', 'RECOVERY_ACTOR_INVALID',
            '恢复维护账号不存在或不是 ACTIVE', 403);
        const user = users[0]!;
        const memberships = await tx.find('memberships', { workspaceId: user.workspaceId, userId: user.id });
        invariant(memberships.length === 1 && memberships[0]?.status === 'ACTIVE' && memberships[0]?.role === 'ADMIN',
            'RECOVERY_ADMIN_REQUIRED', '恢复维护账号必须是 ACTIVE ADMIN', 403);
        const member = memberships[0]!;
        return {
            userId: user.id, membershipId: member.id, workspaceId: user.workspaceId,
            role: member.role, permissions: permissionsFor(member), displayName: user.displayName,
            userEpoch: user.sessionEpoch, sessionId: 'recovery-cli'
        };
    }

    private async plan(tx: Tx, actor: Actor): Promise<RecoveryPrepareSummary> {
        this.gates();
        invariant(actor.role === 'ADMIN', 'RECOVERY_ADMIN_REQUIRED', '恢复准备只能由管理员执行', 403);
        const workspaces = await tx.find('workspaces');
        invariant(workspaces.length === 1 && workspaces[0]?.id === actor.workspaceId,
            'RECOVERY_INSTALLATION_INVALID', '恢复目标必须只有当前管理员所在的一个工作空间', 409);
        const workspace = workspaces[0]!;
        const sourceEpochDigest = hashSecret(workspace.recoveryEpoch);
        const targetEpochDigest = hashSecret(this.config.recoveryEpoch);
        invariant(sourceEpochDigest !== targetEpochDigest, 'RECOVERY_EPOCH_NOT_ROTATED',
            '恢复必须使用部署侧新生成的 recovery epoch；不能沿用备份中的旧值', 409);

        const existing = (await tx.find('recoveryRuns', { workspaceId: actor.workspaceId, targetEpochDigest }))[0] ?? null;
        if (existing) {
            return {
                workspaceId: actor.workspaceId, sourceEpochDigest, targetEpochDigest, alreadyPrepared: true,
                counts: {
                    sessions: existing.revokedSessions, activations: existing.consumedActivations,
                    usersToDisable: existing.disabledUsers, membershipsToDisable: existing.disabledMemberships,
                    handoffs: existing.revokedHandoffs, usePermissions: existing.revokedUsePermissions,
                    exports: existing.invalidatedExports, jobs: existing.failedJobs, uploads: existing.failedUploads,
                    assets: existing.quarantinedAssets, sources: existing.suspendedSources
                }
            };
        }

        const sessions = (await tx.find('sessions', { workspaceId: actor.workspaceId })).filter(x => !x.revokedAt);
        const activations = (await tx.find('activations', { workspaceId: actor.workspaceId })).filter(x => !x.consumedAt);
        const users = (await tx.find('users', { workspaceId: actor.workspaceId }))
            .filter(x => x.id !== actor.userId && x.status !== 'DISABLED');
        const memberships = (await tx.find('memberships', { workspaceId: actor.workspaceId }))
            .filter(x => x.id !== actor.membershipId && x.status !== 'DISABLED');
        const handoffs = (await tx.find('handoffs', { workspaceId: actor.workspaceId }))
            .filter(x => x.state === 'PENDING' || x.state === 'ACCEPTED');
        const usePermissions = (await tx.find('usePermissions', { workspaceId: actor.workspaceId }))
            .filter(x => x.status === 'ACTIVE');
        const exports = (await tx.find('exports', { workspaceId: actor.workspaceId }))
            .filter(x => x.state !== 'ERASED');
        const jobs = (await tx.find('jobs', { workspaceId: actor.workspaceId }))
            .filter(x => x.state === 'QUEUED' || x.state === 'RUNNING');
        const uploads = (await tx.find('uploads', { workspaceId: actor.workspaceId }))
            .filter(x => !['READY','FAILED','CANCELLED','ERASED'].includes(x.state));
        const assets = (await tx.find('assets', { workspaceId: actor.workspaceId }))
            .filter(x => x.state === 'READY');
        const sources = (await tx.find('sources', { workspaceId: actor.workspaceId }))
            .filter(x => x.status === 'RECEIVED' || x.status === 'CONFIRMED');

        return {
            workspaceId: actor.workspaceId, sourceEpochDigest, targetEpochDigest, alreadyPrepared: false,
            counts: {
                sessions: sessions.length, activations: activations.length,
                usersToDisable: users.length, membershipsToDisable: memberships.length,
                handoffs: handoffs.length, usePermissions: usePermissions.length,
                exports: exports.length, jobs: jobs.length, uploads: uploads.length,
                assets: assets.length, sources: sources.length
            }
        };
    }

    async preview(tx: Tx, actor: Actor): Promise<RecoveryPrepareSummary> {
        return this.plan(tx, actor);
    }

    async prepare(tx: Tx, actor: Actor, expectedSourceEpochDigest: string,
        meta: { requestId: string; ip: string }): Promise<RecoveryRun> {
        invariant(/^[a-f0-9]{64}$/.test(expectedSourceEpochDigest), 'RECOVERY_SOURCE_EPOCH_DIGEST_INVALID',
            '旧 recovery epoch 摘要格式无效', 400);
        const plan = await this.plan(tx, actor);
        invariant(!plan.alreadyPrepared, 'RECOVERY_ALREADY_PREPARED', '当前 recovery epoch 已经执行过准备', 409);
        invariant(plan.sourceEpochDigest === expectedSourceEpochDigest, 'RECOVERY_SOURCE_EPOCH_MISMATCH',
            '恢复数据库中的旧 recovery epoch 与预期备份摘要不一致', 409);

        const runBase = base(actor.workspaceId, this.clock);
        const now = runBase.createdAt;

        for (const row of await tx.find('sessions', { workspaceId: actor.workspaceId }))
            if (!row.revokedAt) await tx.replace('sessions', { ...touch(row, this.clock), revokedAt: now });

        for (const row of await tx.find('activations', { workspaceId: actor.workspaceId }))
            if (!row.consumedAt) await tx.replace('activations', { ...touch(row, this.clock), consumedAt: now });

        for (const row of await tx.find('users', { workspaceId: actor.workspaceId })) {
            const next = { ...touch(row, this.clock), sessionEpoch: row.sessionEpoch + 1,
                status: row.id === actor.userId ? row.status : 'DISABLED' as const };
            await tx.replace('users', next);
        }
        for (const row of await tx.find('memberships', { workspaceId: actor.workspaceId }))
            if (row.id !== actor.membershipId && row.status !== 'DISABLED')
                await tx.replace('memberships', { ...touch(row, this.clock), status: 'DISABLED' });

        for (const row of await tx.find('handoffs', { workspaceId: actor.workspaceId }))
            if (row.state === 'PENDING' || row.state === 'ACCEPTED')
                await tx.replace('handoffs', { ...touch(row, this.clock), state: 'REVOKED',
                    closedAt: now, closedById: actor.membershipId });

        for (const row of await tx.find('usePermissions', { workspaceId: actor.workspaceId }))
            if (row.status === 'ACTIVE')
                await tx.replace('usePermissions', { ...touch(row, this.clock), status: 'REVOKED' });

        for (const row of await tx.find('exports', { workspaceId: actor.workspaceId }))
            if (row.state !== 'ERASED')
                await tx.replace('exports', { ...touch(row, this.clock), state: 'STALE',
                    payload: null, payloadDigest: null, errorCode: RECOVERY_ERROR, leaseToken: null, leaseUntil: null });

        for (const row of await tx.find('jobs', { workspaceId: actor.workspaceId }))
            if (row.state === 'QUEUED' || row.state === 'RUNNING')
                await tx.replace('jobs', { ...touch(row, this.clock), state: 'FAILED',
                    errorCode: RECOVERY_ERROR, leaseToken: null, leaseUntil: null });

        for (const row of await tx.find('uploads', { workspaceId: actor.workspaceId }))
            if (!['READY','FAILED','CANCELLED','ERASED'].includes(row.state))
                await tx.replace('uploads', { ...touch(row, this.clock), state: 'FAILED',
                    errorCode: RECOVERY_ERROR, leaseToken: null, leaseUntil: null });

        for (const row of await tx.find('assets', { workspaceId: actor.workspaceId }))
            if (row.state === 'READY')
                await tx.replace('assets', { ...touch(row, this.clock), state: 'QUARANTINED' });

        for (const row of await tx.find('sources', { workspaceId: actor.workspaceId })) {
            if (row.status !== 'RECEIVED' && row.status !== 'CONFIRMED') continue;
            const next: Source = { ...touch(row, this.clock), status: 'SUSPENDED',
                protectionEpoch: row.protectionEpoch + 1 };
            await tx.replace('sources', next);
            await appendSourceHistory(tx, actor, next, 'SUSPENDED', this.clock,
                'Restore review required before the new recovery epoch may be approved.');
        }

        const run: RecoveryRun = {
            ...runBase, actorId: actor.membershipId,
            sourceEpochDigest: plan.sourceEpochDigest, targetEpochDigest: plan.targetEpochDigest,
            state: 'PREPARED', preparedAt: now, approvedAt: null, reportDigest: null,
            revokedSessions: plan.counts.sessions, consumedActivations: plan.counts.activations,
            disabledUsers: plan.counts.usersToDisable, disabledMemberships: plan.counts.membershipsToDisable,
            revokedHandoffs: plan.counts.handoffs, revokedUsePermissions: plan.counts.usePermissions,
            invalidatedExports: plan.counts.exports, failedJobs: plan.counts.jobs,
            failedUploads: plan.counts.uploads, quarantinedAssets: plan.counts.assets,
            suspendedSources: plan.counts.sources
        };
        await tx.insert('recoveryRuns', run);
        await audit(tx, actor, actor.workspaceId, 'recovery.prepare', 'recovery', run.id,
            ['sessions','activations','accounts','handoffs','usePermissions','exports','jobs','uploads','assets','sources'],
            meta, this.clock);
        return run;
    }
}
