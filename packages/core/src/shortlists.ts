import type { Actor, Clock, Person } from './model.ts';
import type { Tx } from './store.ts';
import type { Shortlist, ShortlistItem } from './shortlist-model.ts';
import { SHORTLIST_LIMITS as L } from './shortlist-model.ts';
import { ShortlistSchemas as S } from './shortlist-validation.ts';
import { AppError, invariant, missing } from './errors.ts';
import { base, cas, page, patchDefined, touch, workspaceRow } from './helpers.ts';
import { personFor, requirePermission, requireScope, sourceFor } from './policy.ts';
import { readyAsset, workFor, workHeader } from './production-policy.ts';

export async function shortlistFor(tx: Tx, actor: Actor, id: string): Promise<Shortlist> {
    const row = await workspaceRow(tx, 'shortlists', id, actor.workspaceId);
    if (!row)
        missing();
    await requireScope(tx, actor, row.scopeId);
    return row;
}

function header(row: Shortlist) {
    return { id: row.id, title: row.title, brief: row.brief, scopeId: row.scopeId, maintainerId: row.maintainerId,
        revision: row.revision, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

function unavailable(error: unknown): boolean {
    return error instanceof AppError && error.status === 404;
}

/** Internal collaboration list only. It never creates share links, bookings, public snapshots or client state. */
export class Shortlists {
    clock: Clock;
    constructor(clock: Clock) { this.clock = clock; }

    async create(tx: Tx, actor: Actor, input: unknown): Promise<Shortlist> {
        requirePermission(actor, 'records.write');
        const d = S.create.parse(input);
        await requireScope(tx, actor, d.scopeId);
        const row: Shortlist = { ...base(actor.workspaceId, this.clock), scopeId: d.scopeId, maintainerId: actor.membershipId,
            title: d.title.trim(), brief: d.brief ?? '' };
        invariant(row.title.length > 0, 'TITLE_REQUIRED', '候选清单标题不能为空', 422);
        await tx.insert('shortlists', row);
        return row;
    }

    async update(tx: Tx, actor: Actor, id: string, input: unknown): Promise<Shortlist> {
        requirePermission(actor, 'records.write');
        const d = S.patch.parse(input), row = await shortlistFor(tx, actor, id);
        cas(row, d.expectedRevision);
        invariant(Object.keys(d).length > 1, 'EMPTY_UPDATE', '没有需要保存的修改', 400);
        const { expectedRevision: _, ...patch } = d;
        const next = patchDefined(touch(row, this.clock), patch);
        next.title = next.title.trim();
        invariant(next.title.length > 0, 'TITLE_REQUIRED', '候选清单标题不能为空', 422);
        await tx.replace('shortlists', next);
        return next;
    }

    async list(tx: Tx, actor: Actor, query: Record<string, string>) {
        requirePermission(actor, 'records.read');
        page([], query, ['q']);
        invariant((query.q?.length ?? 0) <= 160, 'QUERY_INVALID', '关键词过长', 400);
        const q = query.q?.toLocaleLowerCase() ?? '';
        const rows = [];
        for (const row of await tx.find('shortlists', { workspaceId: actor.workspaceId })) {
            try {
                await requireScope(tx, actor, row.scopeId);
            }
            catch (e) {
                if (unavailable(e))
                    continue;
                throw e;
            }
            if (q && ![row.title, row.brief].some(v => v.toLocaleLowerCase().includes(q)))
                continue;
            rows.push(header(row));
        }
        rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
        return page(rows, query, ['q']);
    }

    private async visibleItem(tx: Tx, actor: Actor, item: ShortlistItem) {
        try {
            const person = await personFor(tx, actor, item.personId, this.clock);
            const personSource = await sourceFor(tx, actor, person.sourceId, this.clock);
            let work = null;
            let workSourceRevision: number | null = null;
            if (item.workId) {
                const full = await workFor(tx, actor, item.workId, this.clock);
                const source = await sourceFor(tx, actor, full.sourceId, this.clock);
                work = workHeader(full);
                workSourceRevision = source.revision;
            }
            const selected = [];
            const links = (await tx.find('shortlistItemAssets', { workspaceId: actor.workspaceId, itemId: item.id })).sort((a, b) => a.position - b.position);
            for (const link of links) {
                invariant(!!item.workId && link.workId === item.workId, 'SHORTLIST_RELATION_INVALID', '候选清单图片关系损坏，请联系维护人员', 503);
                const workAsset = await workspaceRow(tx, 'workAssets', link.workAssetId, actor.workspaceId);
                invariant(!!workAsset && workAsset.workId === item.workId && workAsset.assetId === link.assetId, 'SHORTLIST_RELATION_INVALID', '候选清单图片关系损坏，请联系维护人员', 503);
                const asset = await readyAsset(tx, actor, link.assetId, this.clock);
                selected.push({ id: link.id, workAssetId: link.workAssetId, asset: { id: asset.id, fileName: asset.fileName, width: asset.width, height: asset.height, revision: asset.revision } });
            }
            return {
                id: item.id,
                position: item.position,
                unavailable: false as const,
                note: item.note,
                person: { id: person.id, displayName: person.displayName, roles: person.roles, cityCode: person.cityCode,
                    languageCodes: person.languageCodes, skillCodes: person.skillCodes, revision: person.revision },
                work,
                selectedAssets: selected,
                updatedSinceAdded: person.revision !== item.addedPersonRevision || personSource.revision !== item.addedPersonSourceRevision
                    || (!!item.workId && (work?.revision !== item.addedWorkRevision || workSourceRevision !== item.addedWorkSourceRevision))
            };
        }
        catch (e) {
            if (unavailable(e))
                return { id: item.id, position: item.position, unavailable: true as const };
            throw e;
        }
    }

    async get(tx: Tx, actor: Actor, id: string) {
        requirePermission(actor, 'records.read');
        const row = await shortlistFor(tx, actor, id);
        const items = [];
        for (const item of (await tx.find('shortlistItems', { workspaceId: actor.workspaceId, shortlistId: id })).sort((a, b) => a.position - b.position))
            items.push(await this.visibleItem(tx, actor, item));
        return { ...header(row), items, canEdit: actor.permissions.includes('records.write') };
    }

    private async edit(tx: Tx, actor: Actor, id: string, expectedRevision: number) {
        requirePermission(actor, 'records.write');
        const row = await shortlistFor(tx, actor, id);
        cas(row, expectedRevision);
        return row;
    }

    private async bump(tx: Tx, row: Shortlist) {
        const next = touch(row, this.clock);
        await tx.replace('shortlists', next);
        return next;
    }

    private async ensurePair(tx: Tx, actor: Actor, personId: string, workId?: string) {
        const person = await personFor(tx, actor, personId, this.clock);
        invariant(person.status !== 'ARCHIVED', 'PERSON_ARCHIVED', '已归档人才不能新增到候选清单', 409);
        const personSource = await sourceFor(tx, actor, person.sourceId, this.clock);
        if (!workId)
            return { person, personSource, work: null, workSource: null };
        const work = await workFor(tx, actor, workId, this.clock);
        invariant(work.status !== 'ARCHIVED', 'WORK_ARCHIVED', '已归档作品不能新增到候选清单', 409);
        const credits = await tx.find('workCredits', { workspaceId: actor.workspaceId, workId, personId });
        invariant(credits.length > 0, 'WORK_PERSON_MISMATCH', '选择的作品没有该候选人的署名记录', 422);
        const workSource = await sourceFor(tx, actor, work.sourceId, this.clock);
        return { person, personSource, work, workSource };
    }

    async addItem(tx: Tx, actor: Actor, id: string, input: unknown) {
        const d = S.itemAdd.parse(input), root = await this.edit(tx, actor, id, d.expectedRevision);
        invariant(new Set(d.workAssetIds).size === d.workAssetIds.length, 'DUPLICATE_LINK', '候选图片不能重复', 400);
        invariant(!!d.workId || d.workAssetIds.length === 0, 'WORK_REQUIRED', '选择作品图片时必须先选择对应作品', 422);
        const pair = await this.ensurePair(tx, actor, d.personId, d.workId);
        const all = await tx.find('shortlistItems', { workspaceId: actor.workspaceId, shortlistId: id });
        invariant(all.length < L.items, 'SHORTLIST_ITEM_LIMIT', '单个候选清单最多100条', 422);
        invariant(!all.some(x => x.personId === d.personId && x.workId === (d.workId ?? null)), 'DUPLICATE_LINK', '该候选人与作品组合已在清单中', 409);
        const item: ShortlistItem = { ...base(actor.workspaceId, this.clock), shortlistId: id, personId: d.personId, workId: d.workId ?? null,
            position: all.length, note: d.note, addedPersonRevision: pair.person.revision, addedPersonSourceRevision: pair.personSource.revision,
            addedWorkRevision: pair.work?.revision ?? null, addedWorkSourceRevision: pair.workSource?.revision ?? null };
        const selected = [];
        for (const workAssetId of d.workAssetIds) {
            const entry = await workspaceRow(tx, 'workAssets', workAssetId, actor.workspaceId);
            if (!entry || entry.workId !== d.workId)
                missing();
            await readyAsset(tx, actor, entry.assetId, this.clock);
            selected.push(entry);
        }
        await tx.insert('shortlistItems', item);
        for (let i = 0; i < selected.length; i++) {
            const entry = selected[i]!;
            await tx.insert('shortlistItemAssets', { ...base(actor.workspaceId, this.clock), itemId: item.id, assetId: entry.assetId,
                workId: entry.workId, workAssetId: entry.id, position: i });
        }
        return this.bump(tx, root);
    }

    async updateItem(tx: Tx, actor: Actor, id: string, input: unknown) {
        const d = S.itemPatch.parse(input), root = await this.edit(tx, actor, id, d.expectedRevision);
        const item = await workspaceRow(tx, 'shortlistItems', d.entryId, actor.workspaceId);
        if (!item || item.shortlistId !== id)
            missing();
        const visible = await this.visibleItem(tx, actor, item);
        if (visible.unavailable)
            missing();
        await tx.replace('shortlistItems', { ...touch(item, this.clock), note: d.note });
        return this.bump(tx, root);
    }

    async removeItem(tx: Tx, actor: Actor, id: string, input: unknown) {
        const d = S.remove.parse(input), root = await this.edit(tx, actor, id, d.expectedRevision);
        const item = await workspaceRow(tx, 'shortlistItems', d.entryId, actor.workspaceId);
        if (!item || item.shortlistId !== id)
            missing();
        for (const link of await tx.find('shortlistItemAssets', { workspaceId: actor.workspaceId, itemId: item.id }))
            await tx.remove('shortlistItemAssets', link.id);
        await tx.remove('shortlistItems', item.id);
        const rest = (await tx.find('shortlistItems', { workspaceId: actor.workspaceId, shortlistId: id })).sort((a, b) => a.position - b.position);
        for (let i = 0; i < rest.length; i++)
            if (rest[i]!.position !== i)
                await tx.replace('shortlistItems', { ...touch(rest[i]!, this.clock), position: i });
        return this.bump(tx, root);
    }

    async reorder(tx: Tx, actor: Actor, id: string, input: unknown) {
        const d = S.order.parse(input), root = await this.edit(tx, actor, id, d.expectedRevision);
        const all = await tx.find('shortlistItems', { workspaceId: actor.workspaceId, shortlistId: id });
        invariant(d.entryIds.length === all.length && new Set(d.entryIds).size === all.length && d.entryIds.every(x => all.some(i => i.id === x)),
            'ORDER_MISMATCH', '排序必须完整包含当前候选条目，请刷新后重试', 409);
        for (let i = 0; i < d.entryIds.length; i++) {
            const item = all.find(x => x.id === d.entryIds[i])!;
            if (item.position !== i)
                await tx.replace('shortlistItems', { ...touch(item, this.clock), position: i });
        }
        return this.bump(tx, root);
    }
}
