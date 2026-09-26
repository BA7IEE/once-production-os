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

    private external(input: RecoveryExternalCheck): RecoveryExternalCheck {
        invariant(input && typeof input === 'object', 'RECOVERY_CHECK_INVALID', '恢复外部检查结果格式无效', 400);
        invariant(/^[a-f0-9]{64}$/.test(input.migrationDigest), 'RECOVERY_CHECK_INVALID', '迁移摘要格式无效', 400);
        invariant(typeof input.migrationMatch === 'boolean', 'RECOVERY_CHECK_INVALID', '迁移匹配状态无效', 400);
        const media = input.media;
        invariant(media && ['disabled','local'].includes(media.provider), 'RECOVERY_CHECK_INVALID', '媒体检查模式无效', 400);
        invariant(/^[a-f0-9]{64}$/.test(media.identityDigest), 'RECOVERY_CHECK_INVALID', '媒体身份摘要格式无效', 400);
        const arrays = [media.expectedAssetIds, media.verifiedAssetIds, media.missingAssetIds, media.mismatchAssetIds];
        invariant(arrays.every(Array.isArray), 'RECOVERY_CHECK_INVALID', '媒体检查清单格式无效', 400);
        for (const rows of arrays) for (const id of rows) uuid.parse(id);
        invariant(arrays.every(rows => unique(rows).length === rows.length), 'RECOVERY_CHECK_INVALID', '媒体检查清单包含重复 ID', 400);
        const expected = [...media.expectedAssetIds].sort();
        const partition = [...media.verifiedAssetIds, ...media.missingAssetIds, ...media.mismatchAssetIds].sort();
        invariant(partition.length === expected.length && partition.every((id, i) => id === expected[i]),
            'RECOVERY_CHECK_INVALID', '媒体验证结果必须完整覆盖预期对象且不能交叉重复', 400);
        if (media.provider === 'disabled')
            invariant(media.verifiedAssetIds.length === 0, 'RECOVERY_CHECK_INVALID', '禁用媒体提供方不能声称已验证文件', 400);
        return {
            migrationDigest: input.migrationDigest,
            migrationMatch: input.migrationMatch,
            media: {
                provider: media.provider,
                identityDigest: media.identityDigest,
                expectedAssetIds: expected,
                verifiedAssetIds: [...media.verifiedAssetIds].sort(),
                missingAssetIds: [...media.missingAssetIds].sort(),
                mismatchAssetIds: [...media.mismatchAssetIds].sort()
            }
        };
    }

    private async safetyState(tx: Tx, actor: Actor) {
        const byId = <T extends { id: string }>(rows: T[]) => rows.sort((a,b) => a.id.localeCompare(b.id));
        const workspace = (await tx.find('workspaces'))[0]!;
        const users = byId(await tx.find('users', { workspaceId: actor.workspaceId }));
        const memberships = byId(await tx.find('memberships', { workspaceId: actor.workspaceId }));
        const sessions = byId(await tx.find('sessions', { workspaceId: actor.workspaceId }));
        const activations = byId(await tx.find('activations', { workspaceId: actor.workspaceId }));
        const sources = byId(await tx.find('sources', { workspaceId: actor.workspaceId }));
        const contacts = byId(await tx.find('contacts', { workspaceId: actor.workspaceId }));
        const handoffs = byId(await tx.find('handoffs', { workspaceId: actor.workspaceId }));
        const usePermissions = byId(await tx.find('usePermissions', { workspaceId: actor.workspaceId }));
        const exports = byId(await tx.find('exports', { workspaceId: actor.workspaceId }));
        const jobs = byId(await tx.find('jobs', { workspaceId: actor.workspaceId }));
        const uploads = byId(await tx.find('uploads', { workspaceId: actor.workspaceId }));
        const assets = byId(await tx.find('assets', { workspaceId: actor.workspaceId }));
        const deletions = byId(await tx.find('deletionRequests', { workspaceId: actor.workspaceId }));
        const compact = {
            workspace: { id: workspace.id, recoveryEpoch: workspace.recoveryEpoch },
            users: users.map(x => [x.id,x.revision,x.status,x.sessionEpoch]),
            memberships: memberships.map(x => [x.id,x.revision,x.status,x.role,[...x.extraPermissions].sort()]),
            sessions: sessions.map(x => [x.id,x.revision,x.membershipId,x.userEpoch,x.recoveryEpoch,x.revokedAt]),
            activations: activations.map(x => [x.id,x.revision,x.userId,x.expiresAt,x.consumedAt]),
            sources: sources.map(x => [x.id,x.revision,x.status,x.protectionEpoch,x.validFrom,x.validUntil]),
            contacts: contacts.map(x => [x.id,x.revision,x.personId,x.sourceId,x.ciphertext]),
            handoffs: handoffs.map(x => [x.id,x.revision,x.state,x.personId,x.sourceId]),
            usePermissions: usePermissions.map(x => [x.id,x.revision,x.status,x.subjectKind,x.subjectId,x.sourceId]),
            exports: exports.map(x => [x.id,x.revision,x.state,x.payloadDigest,x.errorCode]),
            jobs: jobs.map(x => [x.id,x.revision,x.state,x.errorCode]),
            uploads: uploads.map(x => [x.id,x.revision,x.state,x.errorCode,x.expectedHash]),
            assets: assets.map(x => [x.id,x.revision,x.state,x.sha256,x.previewHash,x.objectToken]),
            deletions: deletions.map(x => [x.id,x.revision,x.state,x.executionPlanDigest,x.cleanupErrorCode,x.finalizationDigest,x.finalizationErrorCode])
        };
        return { workspace, users, memberships, sessions, activations, sources, contacts, handoffs, usePermissions, exports, jobs, uploads, assets, deletions,
            databaseStateDigest: digest(compact) };
    }

    private async inspection(tx: Tx, actor: Actor, recoveryRunId: string,
        externalInput: RecoveryExternalCheck): Promise<{ run: RecoveryRun; report: RecoveryCheckReport }> {
        this.gates();
        uuid.parse(recoveryRunId);
        const run = await workspaceRow(tx, 'recoveryRuns', recoveryRunId, actor.workspaceId);
        invariant(run && ['PREPARED','INSPECTED'].includes(run.state), 'RECOVERY_RUN_NOT_PREPARED',
            '恢复批次尚未准备或已经批准', 409);
        invariant(run.actorId === actor.membershipId, 'RECOVERY_ACTOR_MISMATCH', '只能由执行恢复准备的维护管理员继续检查', 403);
        invariant(hashSecret(this.config.recoveryEpoch) === run.targetEpochDigest, 'RECOVERY_TARGET_EPOCH_CHANGED',
            '部署侧 recovery epoch 已变化，请重新开始恢复流程', 409);
        invariant(this.config.contactKey?.length === 32, 'RECOVERY_CONTACT_KEY_REQUIRED',
            'restore-check 必须加载恢复后的 CONTACT_KEY_FILE', 503);
        const external = this.external(externalInput);
        const state = await this.safetyState(tx, actor);
        const currentAssets = state.assets.filter(x => x.state !== 'ERASED');
        const expectedAssetIds = currentAssets.map(x => x.id).sort();
        const currentMediaIdentityDigest = digest(currentAssets.map(x => ({
            id: x.id, uploadId: x.uploadId, sourceId: x.sourceId, scopeId: x.scopeId, personId: x.personId,
            revision: x.revision, fileName: x.fileName, mime: x.mime, bytes: x.bytes, sha256: x.sha256,
            width: x.width, height: x.height, previewBytes: x.previewBytes, previewHash: x.previewHash,
            objectToken: x.objectToken, state: x.state
        })).sort((a,b) => a.id.localeCompare(b.id)));
        invariant(currentMediaIdentityDigest === external.media.identityDigest,
            'RECOVERY_EXTERNAL_EVIDENCE_STALE', '媒体检查证据与当前数据库身份信息不一致，请重新检查', 409);
        invariant(expectedAssetIds.length === external.media.expectedAssetIds.length
            && expectedAssetIds.every((id, i) => id === external.media.expectedAssetIds[i]),
            'RECOVERY_EXTERNAL_EVIDENCE_STALE', '媒体检查对象与当前恢复数据库不一致，请重新检查', 409);

        const blockers: string[] = [];
        const block = (condition: boolean, code: string) => { if (condition) blockers.push(code); };
        block(hashSecret(state.workspace.recoveryEpoch) !== run.sourceEpochDigest, 'SOURCE_EPOCH_CHANGED');
        block(state.sessions.some(x => !x.revokedAt), 'ACTIVE_SESSION');
        block(state.activations.some(x => !x.consumedAt), 'PENDING_ACTIVATION');
        block(state.users.some(x => x.id !== actor.userId && x.status !== 'DISABLED'), 'OLD_USER_ACTIVE');
        block(state.memberships.some(x => x.id !== actor.membershipId && x.status !== 'DISABLED'), 'OLD_MEMBERSHIP_ACTIVE');
        block(state.handoffs.some(x => x.state === 'PENDING' || x.state === 'ACCEPTED'), 'HANDOFF_ACTIVE');
        block(state.usePermissions.some(x => x.status === 'ACTIVE'), 'USE_PERMISSION_ACTIVE');
        block(state.exports.some(x => x.state === 'READY' || x.state === 'QUEUED'), 'EXPORT_ACTIVE');
        block(state.jobs.some(x => x.state === 'QUEUED' || x.state === 'RUNNING'), 'JOB_RUNNABLE');
        block(state.uploads.some(x => ['OPEN','RECEIVING','UPLOADED','QUEUED','PROCESSING'].includes(x.state)), 'UPLOAD_RUNNABLE');
        block(state.assets.some(x => x.state === 'READY'), 'ASSET_NOT_QUARANTINED');
        block(state.sources.some(x => x.status === 'RECEIVED' || x.status === 'CONFIRMED'), 'SOURCE_NOT_REVIEWED');
        block(state.deletions.some(x => x.state === 'CLEANING'), 'DELETION_IN_FLIGHT');
        block(!external.migrationMatch, 'MIGRATION_MISMATCH');
        block(external.media.provider === 'disabled' && expectedAssetIds.length > 0, 'MEDIA_PROVIDER_REQUIRED');
        block(external.media.missingAssetIds.length > 0, 'MEDIA_MISSING');
        block(external.media.mismatchAssetIds.length > 0, 'MEDIA_DIGEST_MISMATCH');

        let contactDecryptFailures = 0;
        for (const row of state.contacts) {
            try {
                decryptContact(row.ciphertext, this.config.contactKey,
                    row.workspaceId + ':' + row.personId + ':' + row.id);
            } catch { contactDecryptFailures++; }
        }
        block(contactDecryptFailures > 0, 'CONTACT_KEY_MISMATCH');

        const report: RecoveryCheckReport = {
            schemaVersion: 'once-recovery-check-v1',
            recoveryRunId: run.id,
            workspaceId: actor.workspaceId,
            targetEpochDigest: run.targetEpochDigest,
            checkedAt: this.clock.now().toISOString(),
            databaseStateDigest: state.databaseStateDigest,
            migrationDigest: external.migrationDigest,
            migrationMatch: external.migrationMatch,
            contactKeyDigest: hashSecret(this.config.contactKey.toString('hex')),
            contactCount: state.contacts.length,
            contactDecryptFailures,
            media: external.media,
            blockers: unique(blockers).sort()
        };
        return { run, report };
    }

    async check(tx: Tx, actor: Actor, recoveryRunId: string,
        externalInput: RecoveryExternalCheck): Promise<RecoveryCheckReport> {
        return (await this.inspection(tx, actor, recoveryRunId, externalInput)).report;
    }

    async inspect(tx: Tx, actor: Actor, recoveryRunId: string, externalInput: RecoveryExternalCheck,
        meta: { requestId: string; ip: string }): Promise<RecoveryCheckReport> {
        const { run, report } = await this.inspection(tx, actor, recoveryRunId, externalInput);
        const next: RecoveryRun = {
            ...touch(run, this.clock), state: 'INSPECTED', checkedAt: report.checkedAt,
            approvedAt: null, reportDigest: digest(report), report
        };
        await tx.replace('recoveryRuns', next);
        await audit(tx, actor, actor.workspaceId, 'recovery.inspect', 'recovery', run.id,
            ['reportDigest','databaseStateDigest','migrationDigest','contacts','media','blockers'], meta, this.clock);
        return report;
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
            state: 'PREPARED', preparedAt: now, checkedAt: null, approvedAt: null, reportDigest: null, report: {},
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
