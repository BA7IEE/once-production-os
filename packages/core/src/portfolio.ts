import type { Actor, Clock } from './model.ts';
import type { Tx } from './store.ts';
import type { Work } from './production-model.ts';
import { PRODUCTION_LIMITS as L } from './production-model.ts';
import { ProductionSchemas as S } from './production-validation.ts';
import { workFor, projectFor, visibleOrNull, readyAsset, creditPerson, checkRole, editable, workHeader, projectHeader } from './production-policy.ts';
import { base, cas, page, patchDefined, touch, workspaceRow } from './helpers.ts';
import { invariant, missing } from './errors.ts';
import { requirePermission, sourceFor } from './policy.ts';
import type { Talent } from './talent.ts';
/** Owns Works and their ordered media and credits. It never writes Project participation. */
export class Portfolio {
    clock: Clock;
    talent: Talent;
    constructor(clock: Clock, talent: Talent) { this.clock = clock; this.talent = talent; }
    async create(tx: Tx, actor: Actor, input: unknown) {
        requirePermission(actor, 'records.write');
        const d = S.workCreate.parse(input);
        invariant(!!d.sourceId !== !!d.inlineSource, 'SOURCE_REQUIRED', '请选择来源或填写内联来源，不能同时提供', 400);
        const s = d.sourceId ? await sourceFor(tx, actor, d.sourceId, this.clock) : await this.talent.createSource(tx, actor, d.inlineSource);
        const w: Work = { ...base(actor.workspaceId, this.clock), sourceId: s.id, scopeId: s.scopeId, maintainerId: actor.membershipId,
            title: d.title.trim(), description: d.description ?? '', origin: d.origin ?? 'UNKNOWN', originNote: d.originNote ?? '', status: 'DRAFT', coverEntryId: null };
        this.checkHeader(w);
        await tx.insert('works', w);
        return w;
    }
    private checkHeader(w: Work) {
        invariant(w.title.length > 0, 'TITLE_REQUIRED', '作品标题不能为空', 422);
        invariant(w.origin !== 'ONCE' || w.originNote.trim().length >= 4, 'ORIGIN_BASIS_REQUIRED', '标记 ONCE 制作需说明真实制作依据；不会自动核验', 422);
    }
    async update(tx: Tx, actor: Actor, id: string, input: unknown) {
        requirePermission(actor, 'records.write');
        const d = S.workPatch.parse(input), w = await workFor(tx, actor, id, this.clock);
        cas(w, d.expectedRevision);
        if (w.status === 'ARCHIVED')
            invariant(d.status === 'DRAFT' && Object.keys(d).length === 2, 'RECORD_ARCHIVED', '归档作品只能单独恢复为草稿', 409);
        const { expectedRevision: _, ...patch } = d;
        const n = patchDefined(touch(w, this.clock), patch);
        n.title = n.title.trim();
        this.checkHeader(n);
        if (n.status === 'ACTIVE') {
            requirePermission(actor, 'assets.read');
            const entries = await tx.find('workAssets', { workspaceId: actor.workspaceId, workId: id });
            invariant(entries.length > 0 && entries.some(e => e.id === n.coverEntryId), 'WORK_INCOMPLETE', '使用中作品至少需要一张图片和有效封面', 422);
            for (const e of entries)
                await readyAsset(tx, actor, e.assetId, this.clock);
        }
        await tx.replace('works', n);
        return n;
    }
    async list(tx: Tx, actor: Actor, query: Record<string, string>) {
        requirePermission(actor, 'records.read');
        page([], query, ['q', 'origin', 'status']);
        invariant((query.q?.length ?? 0) <= 160 && (!query.origin || ['ONCE', 'EXTERNAL', 'UNKNOWN'].includes(query.origin)) && (!query.status || ['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(query.status)), 'QUERY_INVALID', '作品筛选条件不正确', 400);
        const rows = [];
        for (const w of await tx.find('works', { workspaceId: actor.workspaceId })) {
            if (query.q && !w.title.toLocaleLowerCase().includes(query.q.toLocaleLowerCase()))
                continue;
            if (query.origin && w.origin !== query.origin || query.status && w.status !== query.status)
                continue;
            if (await visibleOrNull(() => workFor(tx, actor, w.id, this.clock)))
                rows.push(workHeader(w));
        }
        return page(rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)), query, ['q', 'origin', 'status']);
    }
    async get(tx: Tx, actor: Actor, id: string) {
        requirePermission(actor, 'records.read');
        const w = await workFor(tx, actor, id, this.clock);
        const items = [];
        for (const e of (await tx.find('workAssets', { workspaceId: actor.workspaceId, workId: id })).sort((a, b) => a.position - b.position)) {
            const a = actor.permissions.includes('assets.read') ? await visibleOrNull(() => readyAsset(tx, actor, e.assetId, this.clock)) : null;
            items.push({ id: e.id, position: e.position, isCover: e.id === w.coverEntryId,
                asset: a ? { id: a.id, fileName: a.fileName, width: a.width, height: a.height, revision: a.revision } : null });
        }
        const credits = [];
        for (const c of await tx.find('workCredits', { workspaceId: actor.workspaceId, workId: id })) {
            const person = await visibleOrNull(() => creditPerson(tx, actor, c.personId, this.clock));
            credits.push({ id: c.id, person, roleCode: person ? c.roleCode : null, note: person ? c.note : null });
        }
        const projects = [];
        for (const link of await tx.find('projectWorks', { workspaceId: actor.workspaceId, workId: id })) {
            const p = await visibleOrNull(() => projectFor(tx, actor, link.projectId, this.clock));
            if (p)
                projects.push({ ...projectHeader(p), relation: link.relation });
        }
        return { ...workHeader(w), sourceId: w.sourceId, scopeId: w.scopeId, maintainerId: w.maintainerId,
            description: w.description, originNote: w.originNote, items, credits: credits.sort((a, b) => a.id.localeCompare(b.id)), projects,
            canEdit: actor.permissions.includes('records.write') && w.status !== 'ARCHIVED' };
    }
    private async edit(tx: Tx, actor: Actor, id: string, expected: number) {
        requirePermission(actor, 'records.write');
        const w = await workFor(tx, actor, id, this.clock);
        cas(w, expected);
        editable(w);
        return w;
    }
    async addAsset(tx: Tx, actor: Actor, id: string, input: unknown) {
        const d = S.workAsset.parse(input), w = await this.edit(tx, actor, id, d.expectedRevision);
        requirePermission(actor, 'assets.read');
        await readyAsset(tx, actor, d.assetId, this.clock);
        const all = await tx.find('workAssets', { workspaceId: actor.workspaceId, workId: id });
        invariant(all.length < L.assets, 'WORK_ITEM_LIMIT', '单个作品最多30张图片', 422);
        invariant(!all.some(e => e.assetId === d.assetId), 'DUPLICATE_LINK', '这张图片已在作品中', 409);
        const e = { ...base(actor.workspaceId, this.clock), workId: id, assetId: d.assetId, position: all.length };
        await tx.insert('workAssets', e);
        const n = { ...touch(w, this.clock), coverEntryId: w.coverEntryId ?? e.id };
        await tx.replace('works', n);
        return n;
    }
    async removeAsset(tx: Tx, actor: Actor, id: string, input: unknown) {
        const d = S.remove.parse(input), w = await this.edit(tx, actor, id, d.expectedRevision);
        const e = await workspaceRow(tx, 'workAssets', d.entryId, actor.workspaceId);
        if (!e || e.workId !== id)
            missing();
        const rest = (await tx.find('workAssets', { workspaceId: actor.workspaceId, workId: id })).filter(x => x.id !== e.id).sort((a, b) => a.position - b.position);
        // Cover is a deferred composite FK. Removing a local link never deletes the underlying Asset.
        const n = { ...touch(w, this.clock), coverEntryId: w.coverEntryId === e.id ? rest[0]?.id ?? null : w.coverEntryId };
        if (rest.length === 0 && n.status === 'ACTIVE')
            n.status = 'DRAFT';
        await tx.replace('works', n);
        await tx.remove('workAssets', e.id);
        for (let i = 0; i < rest.length; i++)
            await tx.replace('workAssets', { ...touch(rest[i]!, this.clock), position: i });
        return n;
    }
    async reorder(tx: Tx, actor: Actor, id: string, input: unknown) {
        const d = S.order.parse(input), w = await this.edit(tx, actor, id, d.expectedRevision);
        const all = await tx.find('workAssets', { workspaceId: actor.workspaceId, workId: id });
        invariant(d.entryIds.length === all.length && new Set(d.entryIds).size === all.length && d.entryIds.every(x => all.some(e => e.id === x)), 'ORDER_MISMATCH', '排序必须完整包含本作品当前条目，请刷新', 409);
        invariant(all.length === 0 ? d.coverEntryId === null : d.coverEntryId !== null && d.entryIds.includes(d.coverEntryId), 'COVER_INVALID', '封面必须属于本作品', 422);
        if (d.coverEntryId && d.coverEntryId !== w.coverEntryId) {
            requirePermission(actor, 'assets.read');
            await readyAsset(tx, actor, all.find(e => e.id === d.coverEntryId)!.assetId, this.clock);
        }
        for (let i = 0; i < d.entryIds.length; i++) {
            const e = all.find(e => e.id === d.entryIds[i])!;
            if (e.position !== i)
                await tx.replace('workAssets', { ...touch(e, this.clock), position: i });
        }
        const n = { ...touch(w, this.clock), coverEntryId: d.coverEntryId };
        await tx.replace('works', n);
        return n;
    }
    async addCredit(tx: Tx, actor: Actor, id: string, input: unknown) {
        const d = S.credit.parse(input), w = await this.edit(tx, actor, id, d.expectedRevision);
        await creditPerson(tx, actor, d.personId, this.clock);
        await checkRole(tx, actor, d.roleCode);
        const all = await tx.find('workCredits', { workspaceId: actor.workspaceId, workId: id });
        invariant(all.length < L.credits, 'CREDIT_LIMIT', '单个作品最多50条署名', 422);
        invariant(!all.some(c => c.personId === d.personId && c.roleCode === d.roleCode), 'DUPLICATE_LINK', '此人员角色已记录', 409);
        await tx.insert('workCredits', { ...base(actor.workspaceId, this.clock), workId: id, personId: d.personId, roleCode: d.roleCode, note: d.note });
        const n = touch(w, this.clock);
        await tx.replace('works', n);
        return n;
    }
    async removeCredit(tx: Tx, actor: Actor, id: string, input: unknown) {
        const d = S.remove.parse(input), w = await this.edit(tx, actor, id, d.expectedRevision), c = await workspaceRow(tx, 'workCredits', d.entryId, actor.workspaceId);
        if (!c || c.workId !== id)
            missing();
        await tx.remove('workCredits', c.id);
        const n = touch(w, this.clock);
        await tx.replace('works', n);
        return n;
    }
}
