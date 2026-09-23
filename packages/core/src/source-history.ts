import type { Actor, Clock, RequestMeta, Source, SourceHistory } from './model.ts';
import type { Tx } from './store.ts';
import { invariant } from './errors.ts';
import { audit, base, page } from './helpers.ts';
import { requirePermission, scopeVisible, sourceFor } from './policy.ts';

/** Explicit allowlist. Never serialize a Prisma object or arbitrary request into evidence. */
export function sourceSnapshot(source: Source): Source {
    return { id: source.id, workspaceId: source.workspaceId, createdAt: source.createdAt,
        updatedAt: source.updatedAt, revision: source.revision, scopeId: source.scopeId,
        maintainerId: source.maintainerId, title: source.title, type: source.type,
        providerClaim: source.providerClaim, textPayload: source.textPayload,
        basisMode: source.basisMode, basisDescription: source.basisDescription,
        validFrom: source.validFrom, validUntil: source.validUntil, status: source.status,
        protectionEpoch: source.protectionEpoch, reviewedBy: source.reviewedBy, reviewedAt: source.reviewedAt };
}
export async function appendSourceHistory(tx: Tx, actor: Actor, source: Source,
    action: Exclude<SourceHistory['action'], 'BASELINE'>, clock: Clock, decisionReason: string | null = null): Promise<void> {
    const previous = action === 'CREATED' ? null : (await tx.find('sourceHistory', {
        workspaceId: source.workspaceId, sourceId: source.id, sourceRevision: source.revision - 1 }))[0];
    invariant(action === 'CREATED' || previous, 'HISTORY_BASELINE_MISSING', '来源历史存在缺口，请先核对迁移和旧版本进程', 409);
    // A legacy pause reason must not turn into a reliable basis merely through a title/scope edit.
    const basisAmbiguous = action === 'CREATED' || action === 'REVIEWED' ? false : previous!.basisAmbiguous;
    await tx.insert('sourceHistory', { ...base(source.workspaceId, clock), sourceId: source.id,
        sourceRevision: source.revision, scopeId: source.scopeId, actorId: actor.membershipId,
        action, decisionReason, baselineOnly: false, basisAmbiguous, snapshot: sourceSnapshot(source) });
}

/** Separate, audited reviewer evidence surface. Suspension still blocks ordinary content reads.
 * History requires sensitive-read + review + BOTH current and historical scope membership.
 * No generic admin bypass; widening today's scope never reveals yesterday's restricted text. */
export async function readSourceHistory(tx: Tx, actor: Actor, id: string, query: Record<string, string>,
    clock: Clock, meta: RequestMeta): Promise<unknown> {
    requirePermission(actor, 'sources.read');
    requirePermission(actor, 'sources.review');
    requirePermission(actor, 'sensitive.read');
    page([], query);
    await sourceFor(tx, actor, id, clock, false);
    const rows = await tx.find('sourceHistory', { workspaceId: actor.workspaceId, sourceId: id });
    const visible = [];
    const scopes = new Map<string, boolean>(); // Request/transaction only; never a shared cache.
    for (const row of rows) {
        if (!scopes.has(row.scopeId)) scopes.set(row.scopeId, await scopeVisible(tx, actor, row.scopeId));
        if (!scopes.get(row.scopeId)) continue;
        visible.push({ id: row.id, sourceRevision: row.sourceRevision, action: row.action,
            actorId: row.actorId, recordedAt: row.createdAt, decisionReason: row.decisionReason,
            baselineOnly: row.baselineOnly,
            legacyBasisAmbiguous: row.basisAmbiguous,
            snapshot: sourceSnapshot(row.snapshot) });
    }
    visible.sort((a, b) => b.sourceRevision - a.sourceRevision);
    await audit(tx, actor, actor.workspaceId, 'source.history-read', 'source', id, [], meta, clock);
    return page(visible, query);
}
