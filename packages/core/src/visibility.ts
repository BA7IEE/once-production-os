import type { Actor, Clock, Person, Scope, ScopeMember, Source } from './model.ts';
import type { Tx } from './store.ts';
import { sourceCurrent } from './policy.ts';
/** Pure equivalent of scopeVisible/personVisible, from one short transaction's batch reads.
 * Must be discarded before any write and before leaving that transaction. */
export function visibilityIndex(actor: Actor, clock: Clock, scopes: Scope[], members: ScopeMember[], sources: Source[]) {
    const scopeById = new Map(scopes.filter(s => s.workspaceId === actor.workspaceId).map(s => [s.id, s]));
    const granted = new Set(members.filter(m => m.workspaceId === actor.workspaceId && m.membershipId === actor.membershipId).map(m => m.scopeId));
    const scopeVisible = (id: string) => { const s = scopeById.get(id); return !!s && (s.mode === 'WORKSPACE' || granted.has(id)); };
    const sourceById = new Map(sources.filter(s => s.workspaceId === actor.workspaceId).map(s => [s.id, s]));
    return { scopeVisible, sourceVisible(id: string): boolean { const s = sourceById.get(id); return !!s && sourceCurrent(s, clock) && scopeVisible(s.scopeId); }, personVisible(person: Person): boolean {
            const source = sourceById.get(person.sourceId);
            return person.workspaceId === actor.workspaceId && scopeVisible(person.scopeId)
                && !!source && sourceCurrent(source, clock) && scopeVisible(source.scopeId);
        } };
}
export async function loadVisibility(tx: Tx, actor: Actor, clock: Clock) {
    // All three reads use the existing authorization-sensitive transaction lock.
    const scopes = await tx.find('scopes', { workspaceId: actor.workspaceId });
    const members = await tx.find('scopeMembers', { workspaceId: actor.workspaceId, membershipId: actor.membershipId });
    const sources = await tx.find('sources', { workspaceId: actor.workspaceId });
    return visibilityIndex(actor, clock, scopes, members, sources);
}
