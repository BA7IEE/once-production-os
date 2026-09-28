import type { Actor, Clock, RequestMeta } from './model.ts';
import type { Tx } from './store.ts';
import type { DeletionItem } from './deletion-model.ts';
import type { LocaleTargets } from './locale-maintenance.ts';
import { workspaceRow, touch } from './helpers.ts';
import { requirePermission, requireScope } from './policy.ts';
import { missing, invariant } from './errors.ts';
import { digest } from './json.ts';
import { AiLedger } from './ai-ledger.ts';
export async function affectedAi(tx: Tx, workspaceId: string, targets: LocaleTargets) {
    const selected = new Map(targets), ids = new Set<string>();
    for (const d of await tx.find('aiDependencies', { workspaceId }))
        if (selected.get('SOURCE')?.has(d.sourceId))
            ids.add(d.taskId);
    const tasks = (await tx.find('aiTasks', { workspaceId })).filter(t => t.proposalState !== 'ERASED' && (ids.has(t.id) || selected.get('PERSON')?.has(t.personId ?? '') || selected.get('WORK')?.has(t.workId ?? '') || selected.get('PROJECT')?.has(t.projectId ?? ''))).map(t => ({ resourceKind: 'aiTask' as const, resourceId: t.id }));
    const grants = (await tx.find('aiGrants', { workspaceId })).filter(g => selected.get('SOURCE')?.has(g.sourceId) && (g.status !== 'REVOKED' || g.evidenceNote !== '')).map(g => ({ resourceKind: 'aiGrant' as const, resourceId: g.id }));
    return [...tasks, ...grants];
}
export async function aiErasureSnapshot(tx: Tx, actor: Actor, kind: 'aiTask' | 'aiGrant', id: string) {
    requirePermission(actor, 'data.delete');
    const row = await workspaceRow(tx, kind === 'aiTask' ? 'aiTasks' : 'aiGrants', id, actor.workspaceId);
    if (!row)
        missing();
    const deps = kind === 'aiTask' ? await tx.find('aiDependencies', { workspaceId: actor.workspaceId, taskId: id }) : [];
    const scopeIds = new Set(deps.map(d => d.scopeId));
    if ('scopeId' in row)
        scopeIds.add(row.scopeId);
    if ('targetScopeId' in row && row.targetScopeId)
        scopeIds.add(row.targetScopeId);
    const sourceIds = new Set(deps.map(d => d.sourceId));
    if ('sourceId' in row)
        sourceIds.add(row.sourceId);
    for (const sourceId of sourceIds) {
        const source = await workspaceRow(tx, 'sources', sourceId, actor.workspaceId);
        if (!source)
            missing();
        scopeIds.add(source.scopeId);
    }
    if ('personId' in row)
        for (const [table, ref] of [['people', row.personId], ['works', row.workId], ['projects', row.projectId]] as const)
            if (ref) {
                const root = await workspaceRow(tx, table, ref, actor.workspaceId);
                if (!root)
                    missing();
                scopeIds.add(root.scopeId);
            }
    const scopes = [];
    for (const id of [...scopeIds].sort()) {
        await requireScope(tx, actor, id);
        scopes.push(await tx.get('scopes', id));
    }
    return { row, deps, detailCode: 'AI_ERASURE_' + digest({ row, deps: deps.sort((a, b) => a.id.localeCompare(b.id)), scopes }) };
}
export async function validateAiErasure(tx: Tx, actor: Actor, items: DeletionItem[]) { for (const item of items)
    if (['aiTask', 'aiGrant'].includes(item.resourceKind) && item.cleanupState !== 'DONE') {
        invariant(item.decision === 'APPLY_PROPOSED', 'AI_RETENTION_UNSUPPORTED', '关联 AI 内容需要清除，不能仅更换来源', 409);
        const current = await aiErasureSnapshot(tx, actor, item.resourceKind as 'aiTask' | 'aiGrant', item.resourceId);
        invariant(current.detailCode === item.detailCode, 'AI_ERASURE_STALE', 'AI 任务或许可已变化，请重新检查清理计划', 409);
    } }
export async function eraseAi(tx: Tx, actor: Actor, item: DeletionItem, clock: Clock, meta: RequestMeta) {
    await validateAiErasure(tx, actor, [item]);
    if (item.resourceKind === 'aiGrant') {
        const row = await workspaceRow(tx, 'aiGrants', item.resourceId, actor.workspaceId);
        if (row)
            await tx.replace('aiGrants', { ...touch(row, clock), status: 'REVOKED', evidenceNote: '' });
        return;
    }
    const row = await workspaceRow(tx, 'aiTasks', item.resourceId, actor.workspaceId);
    if (!row)
        return;
    await new AiLedger(clock).cancel(tx, actor.workspaceId, row.runId, meta);
    await tx.replace('aiTasks', { ...touch(row, clock), proposalState: 'ERASED', inputSpec: {}, oldValues: {}, output: {}, selectedFields: [], discardedFields: [] });
    for (const d of await tx.find('aiDependencies', { workspaceId: actor.workspaceId, taskId: row.id }))
        await tx.remove('aiDependencies', d.id);
}
export async function isolateAi(tx: Tx, workspaceId: string, clock: Clock, meta: RequestMeta) {
    for(const row of await tx.find('aiApprovals',{workspaceId,enabled:true}))await tx.replace('aiApprovals',{...touch(row,clock),enabled:false});
    const ledger = new AiLedger(clock);
    for (const row of await tx.find('aiGrants', { workspaceId }))
        if (row.status === 'ACTIVE')
            await tx.replace('aiGrants', { ...touch(row, clock), status: 'REVOKED' });
    for (const run of await tx.find('aiRuns', { workspaceId }))
        await ledger.cancel(tx, workspaceId, run.id, meta);
    for (const task of await tx.find('aiTasks', { workspaceId })) {
        if (task.proposalState === 'PENDING')
            await tx.replace('aiTasks', { ...touch(task, clock), proposalState: 'REJECTED' });
    }
    for (const attempt of await tx.find('aiAttempts', { workspaceId }))
        if (attempt.state === 'MAY_HAVE_EXECUTED')
            await ledger.unknown(tx, workspaceId, attempt.id, meta);
}
