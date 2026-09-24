import { randomUUID } from 'node:crypto';
import type { Actor, Clock, Config, RequestMeta } from './model.ts';
import type { Store, Tx } from './store.ts';
import { MEDIA_LIMITS as L, terminalUpload } from './media-model.ts';
import type { MediaUpload, MediaAsset, MediaResult } from './media-model.ts';
import { audit, base, cas, page, touch, workspaceRow } from './helpers.ts';
import { AppError, invariant, missing } from './errors.ts';
import { deletionBlocked, permissionsFor, personFor, requirePermission, requireScope, sourceFor } from './policy.ts';
import { loadVisibility } from './visibility.ts';
import { MediaSchemas } from './media-validation.ts';
export async function uploadFor(tx: Tx, actor: Actor, id: string): Promise<MediaUpload> {
    const u = await workspaceRow(tx, 'uploads', id, actor.workspaceId);
    if (!u || u.actorId !== actor.membershipId)
        missing();
    return u; // Own status only; not a grant to read bytes, sources or a current person.
}
export async function assetFor(tx: Tx, actor: Actor, id: string, clock: Clock): Promise<MediaAsset> {
    const a = await workspaceRow(tx, 'assets', id, actor.workspaceId);
    if (!a)
        missing();
    await requireScope(tx, actor, a.scopeId);
    if (await deletionBlocked(tx, actor.workspaceId, 'ASSET', a.id)) missing();
    await sourceFor(tx, actor, a.sourceId, clock);
    if (a.personId) {
        const p = await personFor(tx, actor, a.personId, clock);
        if (p.sourceId !== a.sourceId)
            missing();
    }
    return a; // Deliberately never consumes H1 basic-profile delegation.
}
export function assetDto(a: MediaAsset) {
    return { id: a.id, sourceId: a.sourceId, personId: a.personId, fileName: a.fileName, mime: a.mime,
        bytes: a.bytes, width: a.width, height: a.height, state: a.state, revision: a.revision, createdAt: a.createdAt };
}
export function uploadDto(u: MediaUpload) {
    return { id: u.id, fileName: u.fileName, expectedBytes: u.expectedBytes, mime: u.mime, state: u.state,
        revision: u.revision, expiresAt: u.expiresAt, renewals: u.renewals, attempts: u.attempts, errorCode: u.errorCode,
        assetId: u.state === 'READY' ? u.id : null };
}
export class Media {
    store: Store;
    clock: Clock;
    config: Config;
    constructor(store: Store, clock: Clock, config: Config) { this.store = store; this.clock = clock; this.config = config; }
    enabled() { invariant(this.config.mediaEnabled === true, 'MEDIA_DISABLED', '私有图片存储尚未启用', 503); }
    async context(tx: Tx, actor: Actor, u: MediaUpload): Promise<void> {
        requirePermission(actor, 'assets.upload');
        invariant(u.actorId === actor.membershipId && u.actorEpoch === actor.userEpoch, 'MEDIA_CONTEXT_CHANGED', '上传人资格已经变化', 409);
        const m = await workspaceRow(tx, 'memberships', actor.membershipId, actor.workspaceId);
        invariant(m?.revision === u.actorRevision, 'MEDIA_CONTEXT_CHANGED', '上传人权限已经变化', 409);
        const s = await sourceFor(tx, actor, u.sourceId, this.clock);
        const scope = await workspaceRow(tx, 'scopes', u.scopeId, u.workspaceId);
        invariant(s.revision === u.sourceRevision && s.protectionEpoch === u.sourceEpoch && s.scopeId === u.scopeId && scope?.revision === u.scopeRevision, 'MEDIA_CONTEXT_CHANGED', '资料来源或访问范围已经变化，请重新核对后上传', 409);
        if (u.personId) {
            const p = await personFor(tx, actor, u.personId, this.clock);
            const ps = await workspaceRow(tx, 'scopes', p.scopeId, u.workspaceId);
            invariant(p.sourceId === u.sourceId && p.scopeId === u.personScopeId && p.protectionEpoch === u.personEpoch && ps?.revision === u.personScopeRevision, 'MEDIA_CONTEXT_CHANGED', '人才档案的保护范围已经变化', 409);
        }
        invariant(Date.parse(u.expiresAt) > this.clock.now().getTime(), 'UPLOAD_EXPIRED', '上传或处理期限已过，请重新建立上传', 409);
    }
    async create(tx: Tx, actor: Actor, input: unknown): Promise<MediaUpload> {
        this.enabled();
        requirePermission(actor, 'assets.upload');
        const d = MediaSchemas.create.parse(input), s = await sourceFor(tx, actor, d.sourceId, this.clock);
        cas(s, d.expectedSourceRevision);
        const p = d.personId ? await personFor(tx, actor, d.personId, this.clock) : null;
        invariant(!p || p.sourceId === s.id, 'MEDIA_SOURCE_MISMATCH', '本次图片必须使用所选人才的主来源', 422);
        const all = await tx.find('uploads', { workspaceId: actor.workspaceId });
        invariant(all.length < L.records && all.filter(u => u.actorId === actor.membershipId && Date.parse(u.createdAt) > this.clock.now().getTime() - 3600000).length < L.actorHourly, 'UPLOAD_RATE_LIMIT', '上传创建次数已达到当前限制，请稍后再试', 429);
        const active = all.filter(u => !terminalUpload(u.state));
        // Expired but not cleaned uploads continue consuming capacity. Never pretend disk was freed.
        invariant(active.filter(u => u.actorId === actor.membershipId).length < L.actorActive && active.length < L.workspaceActive, 'UPLOAD_LIMIT', '同时上传数量已满，请完成、取消或等待过期任务清理', 429);
        invariant(active.reduce((n, u) => n + u.expectedBytes, 0) + d.expectedBytes <= L.activeBytes, 'UPLOAD_BUDGET', '暂存上传额度已满', 429);
        invariant(all.filter(u => !u.purgedAt).reduce((n, u) => n + u.expectedBytes, 0) + d.expectedBytes <= L.retainedBytes, 'MEDIA_STORAGE_BUDGET', '当前存储准入额度已满，请联系维护人员', 429);
        const m = (await tx.get('memberships', actor.membershipId))!, scope = (await tx.get('scopes', s.scopeId))!;
        const ps = p ? (await tx.get('scopes', p.scopeId))! : null;
        const u: MediaUpload = { ...base(actor.workspaceId, this.clock), actorId: actor.membershipId, actorRevision: m.revision, actorEpoch: actor.userEpoch,
            sourceId: s.id, sourceRevision: s.revision, sourceEpoch: s.protectionEpoch, scopeId: s.scopeId, scopeRevision: scope.revision,
            personId: p?.id ?? null, personEpoch: p?.protectionEpoch ?? null, personScopeId: p?.scopeId ?? null, personScopeRevision: ps?.revision ?? null,
            fileName: d.fileName, mime: d.mime, expectedBytes: d.expectedBytes, expectedHash: d.sha256, state: 'OPEN',
            expiresAt: new Date(Math.min(this.clock.now().getTime() + L.uploadMs, Date.parse(s.validUntil))).toISOString(),
            renewals: 0, attempts: 0, receiveToken: null, leaseToken: null, leaseUntil: null, errorCode: null, purgedAt: null };
        await tx.insert('uploads', u);
        return u;
    }
    async get(tx: Tx, actor: Actor, id: string) { return uploadDto(await uploadFor(tx, actor, id)); }
    async listUploads(tx: Tx, actor: Actor, query: Record<string, string>) {
        const rows = await tx.find('uploads', { workspaceId: actor.workspaceId, actorId: actor.membershipId });
        return page(rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)).map(uploadDto), query);
    }
    async renew(tx: Tx, actor: Actor, id: string, input: unknown) {
        this.enabled();
        const d = MediaSchemas.revision.parse(input), u = await uploadFor(tx, actor, id);
        cas(u, d.expectedRevision);
        await this.context(tx, actor, u);
        invariant(u.state === 'OPEN' && u.renewals < L.renewals, 'UPLOAD_NOT_RENEWABLE', '只能延长未开始传输且未超过续期次数的上传', 409);
        const s = (await tx.get('sources', u.sourceId))!;
        const n: MediaUpload = { ...touch(u, this.clock), renewals: u.renewals + 1,
            expiresAt: new Date(Math.min(this.clock.now().getTime() + L.uploadMs, Date.parse(s.validUntil))).toISOString() };
        await tx.replace('uploads', n);
        return n;
    }
    async beginReceive(tx: Tx, actor: Actor, id: string, bytes: number) {
        this.enabled();
        const u = await uploadFor(tx, actor, id);
        await this.context(tx, actor, u);
        invariant(u.state === 'OPEN', 'UPLOAD_NOT_OPEN', '请核对上传状态；不能覆盖已经收到的文件', 409);
        invariant(bytes === u.expectedBytes, 'UPLOAD_SIZE_MISMATCH', '请求长度与声明大小不一致', 422);
        const token = randomUUID();
        const n: MediaUpload = { ...touch(u, this.clock), state: 'RECEIVING', receiveToken: token,
            leaseToken: token, leaseUntil: new Date(this.clock.now().getTime() + L.receiveLeaseMs).toISOString() };
        await tx.replace('uploads', n);
        return n;
    }
    async finishReceive(tx: Tx, actor: Actor, id: string, token: string, bytes: number, sha256: string) {
        const u = await uploadFor(tx, actor, id);
        await this.context(tx, actor, u);
        invariant(u.state === 'RECEIVING' && u.leaseToken === token && Date.parse(u.leaseUntil!) > this.clock.now().getTime(), 'UPLOAD_LEASE_LOST', '上传状态已经变化', 409);
        invariant(bytes === u.expectedBytes && sha256 === u.expectedHash, 'UPLOAD_DIGEST_MISMATCH', '文件大小或校验值不匹配', 422);
        const n: MediaUpload = { ...touch(u, this.clock), state: 'UPLOADED', leaseToken: null, leaseUntil: null };
        await tx.replace('uploads', n);
        return uploadDto(n);
    }
    async failReceive(id: string, token: string): Promise<void> {
        await this.store.transaction(async (tx) => {
            const u = await tx.get('uploads', id);
            if (u?.state === 'RECEIVING' && u.leaseToken === token)
                await tx.replace('uploads', { ...touch(u, this.clock), state: 'FAILED', leaseToken: null, leaseUntil: null, errorCode: 'UPLOAD_INTERRUPTED' });
        });
    }
    async complete(tx: Tx, actor: Actor, id: string, input: unknown) {
        this.enabled();
        const d = MediaSchemas.revision.parse(input), u = await uploadFor(tx, actor, id);
        cas(u, d.expectedRevision);
        await this.context(tx, actor, u);
        invariant(u.state === 'UPLOADED', 'UPLOAD_NOT_RECEIVED', '文件尚未完整收到或已经提交处理', 409);
        const s = (await tx.get('sources', u.sourceId))!;
        const n: MediaUpload = { ...touch(u, this.clock), state: 'QUEUED',
            expiresAt: new Date(Math.min(this.clock.now().getTime() + L.processingMs, Date.parse(s.validUntil))).toISOString() };
        await tx.replace('uploads', n);
        return n;
    }
    async cancel(tx: Tx, actor: Actor, id: string, input: unknown) {
        const d = MediaSchemas.revision.parse(input), u = await uploadFor(tx, actor, id);
        cas(u, d.expectedRevision);
        invariant(!terminalUpload(u.state), 'UPLOAD_TERMINAL', '该上传已结束，不能再次取消', 409);
        const n: MediaUpload = { ...touch(u, this.clock), state: 'CANCELLED', leaseToken: null, leaseUntil: null };
        await tx.replace('uploads', n);
        return n;
    }
    async listAssets(tx: Tx, actor: Actor, query: Record<string, string>) {
        requirePermission(actor, 'assets.read');
        const d = MediaSchemas.query.parse(Object.fromEntries(Object.entries(query).filter(([k]) => !['page', 'pageSize'].includes(k))));
        const rows = await tx.find('assets', { workspaceId: actor.workspaceId, ...(d.personId ? { personId: d.personId } : {}), ...(d.sourceId ? { sourceId: d.sourceId } : {}) });
        // Reuse the existing native-scope batch index; never multiply permission queries by image count.
        const visibleIndex = await loadVisibility(tx, actor, this.clock);
        const people = new Map((await tx.find('people', { workspaceId: actor.workspaceId })).map(p => [p.id, p]));
        const visible = rows.filter(a => visibleIndex.scopeVisible(a.scopeId) && visibleIndex.sourceVisible(a.sourceId) && (!a.personId || (() => { const p = people.get(a.personId!); return !!p && p.sourceId === a.sourceId && visibleIndex.personVisible(p); })()));
        return page(visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)).map(assetDto), query, ['personId', 'sourceId']);
    }
    async getAsset(tx: Tx, actor: Actor, id: string) { requirePermission(actor, 'assets.read'); return assetDto(await assetFor(tx, actor, id, this.clock)); }
    async quarantine(tx: Tx, actor: Actor, id: string, input: unknown) {
        requirePermission(actor, 'sources.review');
        const d = MediaSchemas.revision.parse(input), a = await assetFor(tx, actor, id, this.clock);
        cas(a, d.expectedRevision);
        invariant(a.state === 'READY', 'ASSET_NOT_READY', '素材已隔离', 409);
        const n: MediaAsset = { ...touch(a, this.clock), state: 'QUARANTINED' };
        await tx.replace('assets', n);
        return n;
    }
    async preview(tx: Tx, actor: Actor, id: string, meta: RequestMeta): Promise<MediaAsset> {
        requirePermission(actor, 'assets.read');
        const a = await assetFor(tx, actor, id, this.clock);
        if (a.state !== 'READY')
            missing();
        await audit(tx, actor, actor.workspaceId, 'asset.preview', 'asset', a.id, [], meta, this.clock);
        return a;
    }
    async maintenanceGuard(tx: Tx, workspaceId: string): Promise<void> {
        this.enabled();
        const w = await tx.get('workspaces', workspaceId);
        invariant(this.config.accessMode === 'INTERNAL' && w?.recoveryEpoch === this.config.recoveryEpoch, 'MAINTENANCE', '恢复隔离中', 503);
    }
    private async workerActor(tx: Tx, u: MediaUpload): Promise<Actor> {
        const w = await tx.get('workspaces', u.workspaceId), m = await workspaceRow(tx, 'memberships', u.actorId, u.workspaceId);
        const user = m ? await workspaceRow(tx, 'users', m.userId, u.workspaceId) : null;
        invariant(this.config.accessMode === 'INTERNAL' && w?.recoveryEpoch === this.config.recoveryEpoch, 'MAINTENANCE', '恢复隔离中', 503);
        invariant(m?.status === 'ACTIVE' && user?.status === 'ACTIVE', 'MEDIA_CONTEXT_CHANGED', '上传人已停用', 409);
        return { userId: user.id, membershipId: m.id, workspaceId: u.workspaceId, role: m.role, permissions: permissionsFor(m), displayName: user.displayName, userEpoch: user.sessionEpoch, sessionId: '' };
    }
    async claim(): Promise<MediaUpload | null> {
        this.enabled();
        return this.store.transaction(async (tx) => {
            const rows = (await tx.find('uploads')).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
            for (const u of rows) {
                const now = this.clock.now().getTime();
                if (u.state !== 'QUEUED' && !(u.state === 'PROCESSING' && Date.parse(u.leaseUntil!) <= now))
                    continue;
                try {
                    const a = await this.workerActor(tx, u);
                    await this.context(tx, a, u);
                    invariant(u.attempts < L.attempts, 'MEDIA_ATTEMPTS_EXHAUSTED', '处理次数已达到上限', 409);
                }
                catch (e) {
                    if (!(e instanceof AppError) || e.status >= 500)
                        throw e;
                    await tx.replace('uploads', { ...touch(u, this.clock), state: 'FAILED', errorCode: e.code, leaseToken: null, leaseUntil: null });
                    continue;
                }
                const n: MediaUpload = { ...touch(u, this.clock), state: 'PROCESSING', attempts: u.attempts + 1, leaseToken: randomUUID(), leaseUntil: new Date(now + L.leaseMs).toISOString() };
                await tx.replace('uploads', n);
                return n;
            }
            return null;
        });
    }
    async lease(tx: Tx, claim: MediaUpload): Promise<MediaUpload> {
        const u = await tx.get('uploads', claim.id);
        invariant(u && u.state === 'PROCESSING' && u.leaseToken === claim.leaseToken && Date.parse(u.leaseUntil!) > this.clock.now().getTime(), 'MEDIA_LEASE_LOST', '处理租约已经失效', 409);
        const a = await this.workerActor(tx, u);
        await this.context(tx, a, u);
        return u;
    }
    async heartbeat(claim: MediaUpload) {
        await this.store.transaction(async (tx) => { const u = await this.lease(tx, claim); await tx.replace('uploads', { ...u, leaseUntil: new Date(this.clock.now().getTime() + L.leaseMs).toISOString() }); });
    }
    async finish(claim: MediaUpload, r: MediaResult) {
        await this.store.transaction(async (tx) => {
            const u = await this.lease(tx, claim);
            invariant(r.bytes === u.expectedBytes && r.sha256 === u.expectedHash && r.mime === u.mime && Number.isInteger(r.width) && Number.isInteger(r.height)
                && r.width > 0 && r.height > 0 && r.width * r.height <= L.pixels && Number.isInteger(r.previewBytes) && r.previewBytes > 0 && r.previewBytes <= L.previewBytes && /^[a-f0-9]{64}$/.test(r.previewHash), 'MEDIA_RESULT_INVALID', '图片检查未通过', 422);
            const a: MediaAsset = { ...base(u.workspaceId, this.clock), id: u.id, uploadId: u.id, sourceId: u.sourceId, scopeId: u.scopeId, personId: u.personId,
                fileName: u.fileName, mime: u.mime, bytes: r.bytes, sha256: r.sha256, width: r.width, height: r.height, previewBytes: r.previewBytes, previewHash: r.previewHash, objectToken: u.leaseToken!, state: 'READY' };
            await tx.insert('assets', a);
            await tx.replace('uploads', { ...touch(u, this.clock), state: 'READY', leaseToken: null, leaseUntil: null, errorCode: null });
            await audit(tx, null, u.workspaceId, 'asset.ready', 'asset', a.id, ['state'], { requestId: randomUUID(), ip: 'worker' }, this.clock);
        });
    }
    async fail(claim: MediaUpload, code: string) {
        await this.store.transaction(async (tx) => {
            const u = await tx.get('uploads', claim.id);
            if (u?.state === 'PROCESSING' && u.leaseToken === claim.leaseToken && Date.parse(u.leaseUntil!) > this.clock.now().getTime())
                await tx.replace('uploads', { ...touch(u, this.clock), state: 'FAILED', leaseToken: null, leaseUntil: null, errorCode: code });
        });
    }
    async expire() {
        return this.store.transaction(async (tx) => {
            const now = this.clock.now().getTime();
            for (const u of await tx.find('uploads')) {
                await this.maintenanceGuard(tx, u.workspaceId);
                if (terminalUpload(u.state))
                    continue;
                if (Date.parse(u.expiresAt) <= now || (u.state === 'RECEIVING' && Date.parse(u.leaseUntil!) <= now))
                    await tx.replace('uploads', { ...touch(u, this.clock), state: 'FAILED', leaseToken: null, leaseUntil: null, errorCode: 'UPLOAD_EXPIRED' });
            }
            return (await tx.find('uploads')).filter(u => ['FAILED', 'CANCELLED'].includes(u.state) && !u.purgedAt && Date.parse(u.updatedAt) + L.cleanupMs <= now);
        });
    }
    async purgeAllowed(id: string) {
        await this.store.transaction(async (tx) => {
            const u = await tx.get('uploads', id);
            invariant(u && ['FAILED', 'CANCELLED'].includes(u.state) && !u.purgedAt && Date.parse(u.updatedAt) + L.cleanupMs <= this.clock.now().getTime() && !(await tx.get('assets', id)), 'MEDIA_PURGE_DENIED', '对象尚不能清理', 409);
            await this.maintenanceGuard(tx, u.workspaceId);
        });
    }
    async markPurged(id: string) {
        await this.store.transaction(async (tx) => {
            const u = await tx.get('uploads', id);
            invariant(u && ['FAILED', 'CANCELLED'].includes(u.state) && !(await tx.get('assets', id)), 'MEDIA_PURGE_DENIED', '仅清理未生成资产的失败上传', 409);
            await this.maintenanceGuard(tx, u.workspaceId);
            if (!u.purgedAt)
                await tx.replace('uploads', { ...u, purgedAt: this.clock.now().toISOString() });
        });
    }
}
