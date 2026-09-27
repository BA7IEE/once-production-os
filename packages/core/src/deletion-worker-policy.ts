import type { Actor } from './model.ts';
import type { Tx } from './store.ts';
import type { DeletionRequest } from './deletion-model.ts';
import { invariant } from './errors.ts';
import { workspaceRow } from './helpers.ts';
import { permissionsFor, requirePermission, requireScope } from './policy.ts';

/** A frozen decision is not a permanent authorization for a disabled or de-scoped requester. */
export async function deletionWorkerActor(tx: Tx, request: DeletionRequest): Promise<Actor> {
    const membership = request.cleanupStartedById ? await workspaceRow(tx, 'memberships', request.cleanupStartedById, request.workspaceId) : null;
    const user = membership ? await workspaceRow(tx, 'users', membership.userId, request.workspaceId) : null;
    invariant(membership?.status === 'ACTIVE' && user?.status === 'ACTIVE', 'ACTOR_DISABLED', '清理任务发起者已失去资格', 403);
    const actor: Actor = { userId: user.id, membershipId: membership.id, workspaceId: request.workspaceId,
        role: membership.role, permissions: permissionsFor(membership), displayName: user.displayName, userEpoch: user.sessionEpoch, sessionId: 'deletion-worker' };
    requirePermission(actor, 'data.delete');
    const table = { SOURCE: 'sources', PERSON: 'people', WORK: 'works', PROJECT: 'projects', ASSET: 'assets' } as const;
    const root = await workspaceRow(tx, table[request.targetKind], request.targetId, request.workspaceId);
    invariant(!!root, 'DELETION_TARGET_MISSING', '清理目标已不可用', 409);
    await requireScope(tx, actor, root.scopeId);
    const source = await workspaceRow(tx, 'sources', request.targetSourceId, request.workspaceId);
    invariant(!!source, 'DELETION_SOURCE_MISSING', '清理来源已不可用', 409);
    await requireScope(tx, actor, source.scopeId);
    return actor;
}
