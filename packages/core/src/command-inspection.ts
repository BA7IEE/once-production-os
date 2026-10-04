import type { Actor, Clock, Config, CommandReceipt } from './model.ts';
import type { Tx } from './store.ts';
import {CommandInspectionSchema} from './admin-ux-schema.ts';
import { AppError, invariant } from './errors.ts';
import { page } from './helpers.ts';
import { requirePermission } from './policy.ts';
import { authorizeReceipt } from './replay-policy.ts';
import { ROUTES } from './routes.ts';

async function allowed(tx: Tx, actor: Actor, row: CommandReceipt, clock: Clock, config: Config) {
    invariant(actor.actorKind !== 'MACHINE' && row.actorId === actor.membershipId && !row.servicePrincipalId && !row.talentAccountId,
        'REPLAY_FORBIDDEN', '当前账号不能读取此提交结果', 403);
    const route = ROUTES.find(r => r.operation === row.operation && r.mode === 'COMMAND');
    invariant(route, 'REPLAY_FORBIDDEN', '当前无法核对这类提交', 403);
    if (route.permission) requirePermission(actor, route.permission);
    await authorizeReceipt(tx, actor, row, clock, config);
}

/** Does not apply/replay any command. Missing receipt is never proof of nonexecution. */
export async function inspectCommand(tx: Tx, actor: Actor, input: unknown, clock: Clock, config: Config) {
    requirePermission(actor, 'records.read');
    const d = CommandInspectionSchema.parse(input);
    const row = (await tx.find('receipts', { workspaceId: actor.workspaceId, actorId: actor.membershipId,
        operation: d.operation, commandKey: d.commandKey })).find(r => !r.servicePrincipalId && !r.talentAccountId);
    if (!row) return { found: false as const };
    await allowed(tx, actor, row, clock, config);
    return { found: true as const, result: { ...row.result, replayed: false } };
}

export async function recentCommands(tx: Tx, actor: Actor, query: Record<string, string>, clock: Clock, config: Config) {
    requirePermission(actor, 'records.read');
    const visible = [];
    for (const row of (await tx.find('receipts', { workspaceId: actor.workspaceId, actorId: actor.membershipId }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))) {
        try { await allowed(tx, actor, row, clock, config); }
        catch (error) { if (error instanceof AppError && [403, 404].includes(error.status)) continue; throw error; }
        visible.push({ operation: row.operation, resourceKind: row.resourceKind, createdAt: row.createdAt, result: row.result });
    }
    return page(visible, query);
}
