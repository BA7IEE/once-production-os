import type { Actor, Clock } from './model.ts';
import type { Tx } from './store.ts';
import { personAliasFor, personFor } from './policy.ts';

export async function resolvePersonReadId(tx: Tx, actor: Actor, id: string, clock: Clock) {
    const alias = await personAliasFor(tx, actor.workspaceId, id);
    if (!alias)
        return { id, resolvedFromId: null as string | null };
    await personFor(tx, actor, alias.canonicalPersonId, clock);
    return { id: alias.canonicalPersonId, resolvedFromId: id };
}
