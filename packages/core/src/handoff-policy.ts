import type { Actor, Clock, Membership, Person, RecordHandoff } from './model.ts';
import type { Tx } from './store.ts';
import { workspaceRow } from './helpers.ts';
import { AppError, missing } from './errors.ts';
import { deletionBlocked, personAliasFor, permissionsFor, personVisible, requireScope, sourceCurrent, scopeVisible } from './policy.ts';

export type ProfileAction = 'read' | 'edit' | 'review';
export function recipientEligible(member: Membership, purpose: RecordHandoff['purpose']): boolean {
    const codes = permissionsFor(member);
    return member.status === 'ACTIVE' && codes.includes('records.read')
        && codes.includes(purpose === 'EDIT' ? 'records.write' : 'sources.review');
}
export async function currentMember(tx: Tx, workspaceId: string, id: string): Promise<Membership | null> {
    const member = await workspaceRow(tx, 'memberships', id, workspaceId);
    const user = member ? await workspaceRow(tx, 'users', member.userId, workspaceId) : null;
    return member?.status === 'ACTIVE' && user?.status === 'ACTIVE' ? member : null;
}

/** Purely current authorization. Never catch infrastructure errors as business denials.
 * Called within the same short authorization-sensitive Store transaction as each read/write.
 * Native scope checks deliberately do not consume another handoff: grants cannot be re-delegated.
 */
export async function handoffCurrent(tx: Tx, h: RecordHandoff, clock: Clock): Promise<boolean> {
    if (!['PENDING', 'ACCEPTED'].includes(h.state) || Date.parse(h.expiresAt) <= clock.now().getTime()) return false;
    const person = await workspaceRow(tx, 'people', h.personId, h.workspaceId);
    const source = await workspaceRow(tx, 'sources', h.sourceId, h.workspaceId);
    if (!person || !source || await personAliasFor(tx, h.workspaceId, person.id) || person.sourceId !== source.id || person.status === 'ARCHIVED' || !sourceCurrent(source, clock)
        || await deletionBlocked(tx, h.workspaceId, 'PERSON', person.id) || await deletionBlocked(tx, h.workspaceId, 'SOURCE', source.id)) return false;
    if (person.maintainerId !== h.senderId || source.maintainerId !== h.senderId
        || person.protectionEpoch !== h.personEpoch || source.protectionEpoch !== h.sourceEpoch
        || person.scopeId !== h.personScopeId || source.scopeId !== h.sourceScopeId
        || source.revision !== h.sourceRevision || (h.state === 'PENDING' && person.revision !== h.personRevision)) return false;
    const personScope = await workspaceRow(tx, 'scopes', person.scopeId, h.workspaceId);
    const sourceScope = await workspaceRow(tx, 'scopes', source.scopeId, h.workspaceId);
    if (personScope?.revision !== h.personScopeRevision || sourceScope?.revision !== h.sourceScopeRevision) return false;
    const sender = await currentMember(tx, h.workspaceId, h.senderId);
    const recipient = await currentMember(tx, h.workspaceId, h.recipientId);
    if (!sender || !recipient || sender.revision !== h.senderRevision || recipient.revision !== h.recipientRevision
        || !permissionsFor(sender).includes('records.write') || !permissionsFor(sender).includes('sources.write')
        || !recipientEligible(recipient, h.purpose)) return false;
    const senderActor: Actor = { workspaceId: h.workspaceId, membershipId: sender.id, userId: sender.userId,
        role: sender.role, permissions: permissionsFor(sender), displayName: '', userEpoch: 0, sessionId: 'handoff-policy' };
    return await scopeVisible(tx, senderActor, person.scopeId) && await scopeVisible(tx, senderActor, source.scopeId);
}

export async function handoffForAction(tx: Tx, actor: Actor, personId: string, clock: Clock,
    action: ProfileAction): Promise<RecordHandoff | null> {
    const grants = await tx.find('handoffs', { workspaceId: actor.workspaceId, personId,
        recipientId: actor.membershipId, state: 'ACCEPTED' });
    for (const grant of grants) {
        if (action === 'edit' && grant.purpose !== 'EDIT') continue;
        if (action === 'review' && grant.purpose !== 'REVIEW') continue;
        if (await handoffCurrent(tx, grant, clock)) return grant;
    }
    return null;
}

/** Basic profile only. Contacts, source contents/history, source writes, scope changes and
 * exports must continue using policy.personFor/sourceFor and MUST NOT call this helper. */
export async function profileAccess(tx: Tx, actor: Actor, id: string, clock: Clock, action: ProfileAction = 'read') {
    const person = await workspaceRow(tx, 'people', id, actor.workspaceId);
    if (!person) missing();
    const alias = await personAliasFor(tx, actor.workspaceId, id);
    if (alias) {
        // An old identity is never writable/delegable. Check its original scope first so the
        // alias itself cannot be discovered by members who could not see that identity.
        await requireScope(tx, actor, person.scopeId);
        throw new AppError(409, 'MERGED_ID_READ_ONLY', '该人才ID已合并，只允许通过详情只读解析到主档案');
    }
    if (await personVisible(tx, actor, person, clock)) return { person, native: true, handoff: null };
    const handoff = await handoffForAction(tx, actor, id, clock, action);
    if (!handoff) missing();
    return { person, native: false, handoff };
}

/** Only visits actual received grants, never a handoff check per unrelated talent row. */
export async function delegatedPeople(tx: Tx, actor: Actor, clock: Clock): Promise<Person[]> {
    const grants = await tx.find('handoffs', { workspaceId: actor.workspaceId, recipientId: actor.membershipId, state: 'ACCEPTED' });
    const result = new Map<string, Person>();
    for (const grant of grants) {
        if (result.has(grant.personId)) continue;
        if (await handoffCurrent(tx, grant, clock)) {
            const person = await workspaceRow(tx, 'people', grant.personId, actor.workspaceId);
            if (person) result.set(person.id, person);
        }
    }
    return [...result.values()];
}
