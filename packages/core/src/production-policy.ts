import type { Actor, Clock } from './model.ts';
import type { Tx } from './store.ts';
import type { Work, Project } from './production-model.ts';
import { AppError, invariant, missing } from './errors.ts';
import { sourceFor, requireScope, personFor } from './policy.ts';
import { workspaceRow } from './helpers.ts';
import { assetFor } from './media.ts';
export async function workFor(tx: Tx, actor: Actor, id: string, clock: Clock): Promise<Work> {
    const w = await workspaceRow(tx, 'works', id, actor.workspaceId);
    if (!w)
        missing();
    await requireScope(tx, actor, w.scopeId);
    await sourceFor(tx, actor, w.sourceId, clock);
    return w;
}
export async function projectFor(tx: Tx, actor: Actor, id: string, clock: Clock): Promise<Project> {
    const p = await workspaceRow(tx, 'projects', id, actor.workspaceId);
    if (!p)
        missing();
    await requireScope(tx, actor, p.scopeId);
    await sourceFor(tx, actor, p.sourceId, clock);
    return p;
}
/** Only missing/hidden dependencies become placeholders. Storage failures must still fail the request. */
export async function visibleOrNull<T>(read: () => Promise<T>): Promise<T | null> {
    try {
        return await read();
    }
    catch (e) {
        if (e instanceof AppError && e.status === 404)
            return null;
        throw e;
    }
}
export async function readyAsset(tx: Tx, actor: Actor, id: string, clock: Clock) {
    const a = await assetFor(tx, actor, id, clock);
    if (a.state !== 'READY')
        missing();
    return a;
}
export async function creditPerson(tx: Tx, actor: Actor, id: string, clock: Clock) {
    const p = await personFor(tx, actor, id, clock); // Deliberately not profileAccess/H1 delegation.
    return { id: p.id, displayName: p.displayName };
}
export async function checkRole(tx: Tx, actor: Actor, roleCode: string) {
    const item = (await tx.find('dictionary', { workspaceId: actor.workspaceId, namespace: 'role', code: roleCode, status: 'ACTIVE' }))[0];
    invariant(!!item, 'ROLE_UNAVAILABLE', '请选择当前启用的贡献角色', 422);
}
export function editable(row: Work | Project) { invariant(row.status !== 'ARCHIVED', 'RECORD_ARCHIVED', '请先恢复为草稿再修改内容', 409); }
export function workHeader(w: Work) { return { id: w.id, title: w.title, origin: w.origin, status: w.status, revision: w.revision, updatedAt: w.updatedAt }; }
export function projectHeader(p: Project) { return { id: p.id, title: p.title, status: p.status, revision: p.revision, updatedAt: p.updatedAt }; }
