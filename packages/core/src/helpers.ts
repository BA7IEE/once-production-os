import { randomUUID } from 'node:crypto';
import type { Actor, Base, Clock, RequestMeta, Table, TableMap } from './model.ts';
import type { Tx } from './store.ts';
import { invariant } from './errors.ts';
export function base(workspaceId: string, clock: Clock): Base { const time = clock.now().toISOString(); return { id: randomUUID(), workspaceId, revision: 1, createdAt: time, updatedAt: time }; }
export function touch<T extends Base>(row: T, clock: Clock): T { return { ...row, revision: row.revision + 1, updatedAt: clock.now().toISOString() }; }
export function cas(row: {
    revision: number;
}, expectedRevision: number): void { invariant(row.revision === expectedRevision, 'REVISION_CONFLICT', '记录已被更新，请刷新后重新检查修改', 409); }
export const unique = <T>(values: T[]): T[] => [...new Set(values)];
export async function audit(tx: Tx, actor: Actor | null, workspaceId: string, action: string, resourceKind: string, resourceId: string, changedFields: string[], meta: RequestMeta, clock: Clock): Promise<void> {
    await tx.insert('audits', { ...base(workspaceId, clock), actorId: actor?.membershipId ?? null, action, resourceKind, resourceId, changedFields: unique(changedFields).sort(), requestId: meta.requestId });
}
export async function workspaceRow<K extends Table>(tx: Tx, table: K, id: string, workspaceId: string): Promise<TableMap[K] | null> {
    const row = await tx.get(table, id);
    return row && ('workspaceId' in row ? row.workspaceId === workspaceId : row.id === workspaceId) ? row : null;
}
export function page<T>(rows: T[], query: Record<string, string>, keys: string[] = []): {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
} {
    for (const key of Object.keys(query))
        invariant(['page', 'pageSize', ...keys].includes(key), 'QUERY_INVALID', '包含不支持的筛选字段', 400);
    const index = Number(query.page ?? '1');
    const size = Number(query.pageSize ?? '20');
    invariant(Number.isSafeInteger(index) && index >= 1 && index <= 100000 && Number.isSafeInteger(size) && size >= 1 && size <= 100, 'QUERY_INVALID', '分页参数无效', 400);
    return { items: rows.slice((index - 1) * size, index * size), total: rows.length, page: index, pageSize: size };
}
/** Apply only defined, schema-validated fields. Omitted optional keys never erase stored values. */
export function patchDefined<T extends object>(row: T, patch: Partial<{
    [K in keyof T]: T[K] | undefined;
}>): T {
    const next = { ...row };
    for (const key of Object.keys(patch) as (keyof T)[]) {
        const value = patch[key];
        if (value !== undefined)
            next[key] = value as T[typeof key];
    }
    return next;
}
