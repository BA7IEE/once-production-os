import { randomUUID } from 'node:crypto';
import type { Actor, Clock, Config, DurableJob, ImportBatch, ImportRow } from './model.ts';
import { LIMITS } from './model.ts';
import type { Store, Tx } from './store.ts';
import { AppError, invariant, missing } from './errors.ts';
import { audit, base, cas, touch, unique, workspaceRow, page } from './helpers.ts';
import { requirePermission, sourceFor, permissionsFor } from './policy.ts';
import { PersonImportRow, Schemas } from './validation.ts';
import { Talent } from './talent.ts';
export class Imports {
    store: Store;
    clock: Clock;
    config: Config;
    talent: Talent;
    constructor(store: Store, clock: Clock, config: Config, talent: Talent) { this.store = store; this.clock = clock; this.config = config; this.talent = talent; }
    async preview(tx: Tx, actor: Actor, input: unknown): Promise<ImportBatch> {
        requirePermission(actor, 'records.write');
        const data = Schemas.importPreview.parse(input);
        const source = await sourceFor(tx, actor, data.sourceId, this.clock);
        const rows: ImportRow[] = [];
        for (let index = 0; index < data.rows.length; index++) {
            try {
                const row = PersonImportRow.parse(data.rows[index]);
                await this.talent.validateCatalog(tx, actor.workspaceId, 'role', row.roles);
                if (row.cityCode)
                    await this.talent.validateCatalog(tx, actor.workspaceId, 'city', [row.cityCode]);
                // Same-name candidates are advisory only and filtered by the same query boundary.
                const candidates = await this.talent.listPeople(tx, actor, { q: row.displayName, pageSize: '5' }) as {
                    items: {
                        displayName: string;
                    }[];
                };
                const duplicateName = candidates.items.some(p => p.displayName === row.displayName) || rows.some(p => p.displayName === row.displayName);
                rows.push({ index, displayName: row.displayName, roles: row.roles, cityCode: row.cityCode ?? null, state: 'VALID',
                    issues: duplicateName ? ['同名仅提示：提交仍会创建独立档案，不自动合并'] : [], personId: null });
            }
            catch (e) {
                rows.push({ index, displayName: '', roles: [], cityCode: null, state: 'INVALID', issues: [e instanceof AppError ? e.message : '本行格式无效'], personId: null });
            }
        }
        const batch: ImportBatch = { ...base(actor.workspaceId, this.clock), actorId: actor.membershipId, sourceId: source.id, sourceRevision: source.revision,
            scopeId: source.scopeId, rows, expiresAt: new Date(Math.min(Date.parse(source.validUntil), this.clock.now().getTime() + LIMITS.importMs)).toISOString() };
        await tx.insert('imports', batch);
        return batch;
    }
    async batchFor(tx: Tx, actor: Actor, id: string): Promise<ImportBatch> {
        requirePermission(actor, 'records.write');
        const batch = await workspaceRow(tx, 'imports', id, actor.workspaceId);
        if (!batch || batch.actorId !== actor.membershipId)
            missing();
        await sourceFor(tx, actor, batch.sourceId, this.clock);
        if (Date.parse(batch.expiresAt) <= this.clock.now().getTime())
            missing();
        return batch;
    }
    async get(tx: Tx, actor: Actor, id: string): Promise<unknown> {
        const batch = await this.batchFor(tx, actor, id);
        const job = (await tx.find('jobs', { workspaceId: actor.workspaceId, aggregateId: id }))[0];
        // The preview DTO does not contain contact values or entire source text.
        return { id: batch.id, sourceId: batch.sourceId, revision: batch.revision, rows: batch.rows, expiresAt: batch.expiresAt,
            job: job ? { id: job.id, state: job.state, errorCode: job.errorCode } : null };
    }
    async commit(tx: Tx, actor: Actor, id: string, input: unknown): Promise<DurableJob> {
        const data = Schemas.importCommit.parse(input);
        const batch = await this.batchFor(tx, actor, id);
        const existing = (await tx.find('jobs', { workspaceId: actor.workspaceId, aggregateId: batch.id }))[0];
        invariant(!existing, 'BATCH_ALREADY_COMMITTED', '该批次已经提交；请查看原任务，不能更换已提交的行集合', 409);
        cas(batch, data.expectedRevision);
        const source = await sourceFor(tx, actor, batch.sourceId, this.clock);
        cas(source, batch.sourceRevision);
        invariant(unique(data.selectedRows).length === data.selectedRows.length, 'DUPLICATE_ROW', '选择的导入行不能重复', 400);
        for (const index of data.selectedRows)
            invariant(batch.rows[index]?.state === 'VALID', 'IMPORT_ROW_INVALID', '只能选择已通过预览检查的行');
        const job: DurableJob = { ...base(actor.workspaceId, this.clock), type: 'IMPORT_PEOPLE', actorId: actor.membershipId, aggregateId: batch.id,
            selectedRows: data.selectedRows, state: 'QUEUED', leaseToken: null, leaseUntil: null, attempts: 0, errorCode: null };
        await tx.insert('jobs', job);
        await tx.replace('imports', touch(batch, this.clock));
        return job;
    }
    async actorForJob(tx: Tx, job: DurableJob): Promise<Actor> {
        const member = await workspaceRow(tx, 'memberships', job.actorId, job.workspaceId);
        const user = member ? await workspaceRow(tx, 'users', member.userId, job.workspaceId) : null;
        const workspace = await tx.get('workspaces', job.workspaceId);
        invariant(member?.status === 'ACTIVE' && user?.status === 'ACTIVE', 'ACTOR_DISABLED', '任务发起者已失去资格', 403);
        invariant(this.config.accessMode === 'INTERNAL' && workspace?.recoveryEpoch === this.config.recoveryEpoch, 'MAINTENANCE', '当前运行环境尚未解除隔离', 503);
        const actor: Actor = { userId: user.id, membershipId: member.id, workspaceId: job.workspaceId, role: member.role, permissions: permissionsFor(member),
            displayName: user.displayName, userEpoch: user.sessionEpoch, sessionId: 'worker' };
        requirePermission(actor, 'records.write');
        return actor;
    }
    async claim(): Promise<DurableJob | null> {
        if (this.config.accessMode !== 'INTERNAL')
            return null;
        return this.store.transaction(async (tx) => {
            const jobs = (await tx.find('jobs')).filter(j => j.state === 'QUEUED' || (j.state === 'RUNNING' && Date.parse(j.leaseUntil ?? '') <= this.clock.now().getTime()))
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
            for (const row of jobs) {
                const workspace = await tx.get('workspaces', row.workspaceId);
                if (workspace?.recoveryEpoch !== this.config.recoveryEpoch)
                    continue;
                if (row.attempts >= 3) {
                    await tx.replace('jobs', { ...touch(row, this.clock), state: 'FAILED', errorCode: 'ATTEMPTS_EXHAUSTED', leaseToken: null, leaseUntil: null });
                    continue;
                }
                const next: DurableJob = { ...touch(row, this.clock), state: 'RUNNING', leaseToken: randomUUID(), leaseUntil: new Date(this.clock.now().getTime() + LIMITS.jobLeaseMs).toISOString(), attempts: row.attempts + 1 };
                await tx.replace('jobs', next);
                return next;
            }
            return null;
        });
    }
    private async owned(tx: Tx, claim: DurableJob): Promise<DurableJob> {
        const job = await workspaceRow(tx, 'jobs', claim.id, claim.workspaceId);
        invariant(job && job.state === 'RUNNING' && job.leaseToken === claim.leaseToken && Date.parse(job.leaseUntil ?? '') > this.clock.now().getTime(), 'LEASE_LOST', '任务租约已失效', 409);
        return job;
    }
    async process(claim: DurableJob): Promise<void> {
        try {
            for (const index of claim.selectedRows) {
                await this.store.transaction(async (tx) => {
                    const job = await this.owned(tx, claim);
                    const actor = await this.actorForJob(tx, job);
                    const batch = await this.batchFor(tx, actor, job.aggregateId);
                    const source = await sourceFor(tx, actor, batch.sourceId, this.clock);
                    cas(source, batch.sourceRevision);
                    const row = batch.rows[index];
                    invariant(row, 'ROW_MISSING', '导入行已不存在', 409);
                    if (row.state !== 'IMPORTED') {
                        invariant(row.state === 'VALID', 'ROW_INVALID', '导入行无法继续处理', 409);
                        const person = await this.talent.createPerson(tx, actor, { displayName: row.displayName, roles: row.roles, cityCode: row.cityCode, sourceId: batch.sourceId });
                        const rows = [...batch.rows];
                        rows[index] = { ...row, personId: person.id, state: 'IMPORTED' };
                        await tx.replace('imports', { ...touch(batch, this.clock), rows });
                        await audit(tx, actor, job.workspaceId, 'import.row-created', 'person', person.id, ['created'], { requestId: job.id, ip: 'WORKER' }, this.clock);
                    }
                    await tx.replace('jobs', { ...job, leaseUntil: new Date(this.clock.now().getTime() + LIMITS.jobLeaseMs).toISOString() });
                });
            }
            await this.store.transaction(async (tx) => { const job = await this.owned(tx, claim); await tx.replace('jobs', { ...touch(job, this.clock), state: 'SUCCEEDED', leaseToken: null, leaseUntil: null }); });
        }
        catch (error) {
            if (error instanceof AppError && error.code === 'LEASE_LOST')
                return;
            await this.store.transaction(async (tx) => {
                const row = await tx.get('jobs', claim.id);
                if (row?.state === 'RUNNING' && row.leaseToken === claim.leaseToken && Date.parse(row.leaseUntil ?? '') > this.clock.now().getTime())
                    await tx.replace('jobs', { ...touch(row, this.clock), state: 'FAILED', leaseToken: null, leaseUntil: null, errorCode: error instanceof AppError ? error.code : 'JOB_FAILED' });
            });
        }
    }
    async listJobs(tx: Tx, actor: Actor, query: Record<string, string>): Promise<unknown> {
        requirePermission(actor, 'records.write');
        const rows = await tx.find('jobs', { workspaceId: actor.workspaceId, actorId: actor.membershipId });
        rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
        return page(rows.map(j => ({ id: j.id, type: j.type, aggregateId: j.aggregateId, state: j.state, attempts: j.attempts,
            errorCode: j.errorCode, revision: j.revision, createdAt: j.createdAt })), query);
    }
    async getJob(tx: Tx, actor: Actor, id: string): Promise<unknown> {
        requirePermission(actor, 'records.write');
        const job = await workspaceRow(tx, 'jobs', id, actor.workspaceId);
        if (!job || job.actorId !== actor.membershipId)
            missing();
        // Only safe operation metadata is available after the source expires; batch contents stay blocked.
        return { id: job.id, type: job.type, aggregateId: job.aggregateId, state: job.state, attempts: job.attempts, errorCode: job.errorCode, revision: job.revision };
    }
}
