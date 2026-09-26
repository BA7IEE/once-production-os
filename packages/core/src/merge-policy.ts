import type { Actor, Clock } from './model.ts';
import type { Tx } from './store.ts';
import { workspaceRow } from './helpers.ts';
import { missing } from './errors.ts';
import { personAliasFor, personFor, requireScope } from './policy.ts';

export async function resolvePersonReadId(tx: Tx, actor: Actor, id: string, clock: Clock) {
    const alias = await personAliasFor(tx, actor.workspaceId, id);
    if (!alias)
        return { id, resolvedFromId: null as string | null };
    const old = await workspaceRow(tx, 'people', id, actor.workspaceId);
    if (!old)
        missing();
    // Resolving an old identifier must not widen the original identity's scope.
    await requireScope(tx, actor, old.scopeId);
    await personFor(tx, actor, alias.canonicalPersonId, clock);
    return { id: alias.canonicalPersonId, resolvedFromId: id };
}
