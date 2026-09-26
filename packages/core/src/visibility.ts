import type { Actor, Clock, Person, Scope, ScopeMember, Source } from './model.ts';
import type { DeletionRequest, DeletionTargetKind } from './deletion-model.ts';
import type { Tx } from './store.ts';
import type { PersonAlias } from './merge-model.ts';
import { sourceCurrent } from './policy.ts';
/** Pure equivalent of scopeVisible/personVisible, from one short transaction's batch reads.
 * Must be discarded before any write and before leaving that transaction. */
export function visibilityIndex(actor: Actor, clock: Clock, scopes: Scope[], members: ScopeMember[], sources: Source[], blocks: DeletionRequest[] = [], aliases: PersonAlias[] = []) {
    const scopeById = new Map(scopes.filter(s => s.workspaceId === actor.workspaceId).map(s => [s.id, s]));
    const granted = new Set(members.filter(m => m.workspaceId === actor.workspaceId && m.membershipId === actor.membershipId).map(m => m.scopeId));
    const scopeVisible = (id: string) => { const s = scopeById.get(id); return !!s && (s.mode === 'WORKSPACE' || granted.has(id)); };
    const sourceById = new Map(sources.filter(s => s.workspaceId === actor.workspaceId).map(s => [s.id, s]));
    const blocked = new Map<DeletionTargetKind, Set<string>>();
    for (const row of blocks)
        if (row.workspaceId === actor.workspaceId && row.state !== 'DRAFT') {
            const set = blocked.get(row.targetKind) ?? new Set<string>();
            set.add(row.targetId); blocked.set(row.targetKind, set);
        }
    const isBlocked = (kind: DeletionTargetKind, id: string) => blocked.get(kind)?.has(id) ?? false;
    const mergedOldIds = new Set(aliases.filter(a => a.workspaceId === actor.workspaceId).map(a => a.oldPersonId));
    const visibleScopeIds = [...scopeById.values()].filter(s => s.mode === 'WORKSPACE' || granted.has(s.id)).map(s => s.id);
    const visibleSourceIds = [...sourceById.values()].filter(s => !isBlocked('SOURCE', s.id) && sourceCurrent(s, clock) && scopeVisible(s.scopeId)).map(s => s.id);
    return { visibleScopeIds, visibleSourceIds, blocked: isBlocked, source(id: string): Source | null { return sourceById.get(id) ?? null; }, scopeVisible,
        sourceVisible(id: string): boolean { const s = sourceById.get(id); return !!s && !isBlocked('SOURCE', s.id) && sourceCurrent(s, clock) && scopeVisible(s.scopeId); },
        personVisible(person: Person): boolean {
            const source = sourceById.get(person.sourceId);
            return person.workspaceId === actor.workspaceId && !mergedOldIds.has(person.id) && !isBlocked('PERSON', person.id) && scopeVisible(person.scopeId)
                && !!source && !isBlocked('SOURCE', source.id) && sourceCurrent(source, clock) && scopeVisible(source.scopeId);
        } };
}
export async function loadVisibility(tx: Tx, actor: Actor, clock: Clock) {
    // All three reads use the existing authorization-sensitive transaction lock.
    const scopes = await tx.find('scopes', { workspaceId: actor.workspaceId });
    const members = await tx.find('scopeMembers', { workspaceId: actor.workspaceId, membershipId: actor.membershipId });
    const sources = await tx.find('sources', { workspaceId: actor.workspaceId });
    const blocks = (await tx.find('deletionRequests', { workspaceId: actor.workspaceId })).filter(row => row.state !== 'DRAFT');
    const aliases = await tx.find('personAliases', { workspaceId: actor.workspaceId });
    return visibilityIndex(actor, clock, scopes, members, sources, blocks, aliases);
}
