import type { Actor, Clock, Membership, Permission, Person, Role, Source } from './model.ts';
import type { Tx } from './store.ts';
import { fail, invariant, missing } from './errors.ts';
import { workspaceRow } from './helpers.ts';
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
    ADMIN: ['assets.read', 'assets.upload', 'records.read', 'records.write', 'sources.read', 'sources.write', 'sources.review', 'members.manage', 'catalog.manage', 'audit.read', 'data.export', 'data.delete'],
    EDITOR: ['assets.read', 'assets.upload', 'records.read', 'records.write', 'sources.read', 'sources.write'],
    REVIEWER: ['assets.read', 'records.read', 'sources.read', 'sources.review'], VIEWER: ['assets.read', 'records.read']
};
export const permissionsFor = (member: Membership): Permission[] => [...new Set([...ROLE_PERMISSIONS[member.role], ...member.extraPermissions])];
export async function deletionBlocked(tx: Tx, workspaceId: string, kind: 'SOURCE' | 'PERSON' | 'WORK' | 'PROJECT' | 'ASSET', id: string): Promise<boolean> {
    return (await tx.find('deletionRequests', { workspaceId, targetKind: kind, targetId: id })).some(row => row.state !== 'DRAFT');
}
export function requirePermission(actor: Actor, permission: Permission): void {
    if (!actor.permissions.includes(permission))
        fail(403, 'FORBIDDEN', '当前账号没有执行此操作的权限');
}
export async function scopeVisible(tx: Tx, actor: Actor, scopeId: string): Promise<boolean> {
    const scope = await workspaceRow(tx, 'scopes', scopeId, actor.workspaceId);
    if (!scope)
        return false;
    if (scope.mode === 'WORKSPACE')
        return true;
    return (await tx.find('scopeMembers', { workspaceId: actor.workspaceId, scopeId, membershipId: actor.membershipId })).length > 0;
}
export async function requireScope(tx: Tx, actor: Actor, scopeId: string): Promise<void> {
    if (!(await scopeVisible(tx, actor, scopeId)))
        missing();
}
export function sourceCurrent(source: Source, clock: Clock): boolean {
    const now = clock.now().getTime();
    return source.status !== 'SUSPENDED' && Date.parse(source.validFrom) <= now && now < Date.parse(source.validUntil)
        && (source.basisMode === 'TEMP_ORGANIZE' || source.status === 'CONFIRMED');
}
export async function sourceVisible(tx: Tx, actor: Actor, source: Source, clock: Clock): Promise<boolean> {
    return source.workspaceId === actor.workspaceId && !(await deletionBlocked(tx, actor.workspaceId, 'SOURCE', source.id))
        && sourceCurrent(source, clock) && await scopeVisible(tx, actor, source.scopeId);
}
export async function sourceFor(tx: Tx, actor: Actor, id: string, clock: Clock, active = true, allowBlocked = false): Promise<Source> {
    const source = await workspaceRow(tx, 'sources', id, actor.workspaceId);
    if (!source)
        missing();
    await requireScope(tx, actor, source.scopeId);
    if (!allowBlocked && await deletionBlocked(tx, actor.workspaceId, 'SOURCE', source.id))
        missing();
    if (active && !sourceCurrent(source, clock))
        missing();
    return source;
}
export async function personVisible(tx: Tx, actor: Actor, person: Person, clock: Clock): Promise<boolean> {
    if (person.workspaceId !== actor.workspaceId || await deletionBlocked(tx, actor.workspaceId, 'PERSON', person.id) || !(await scopeVisible(tx, actor, person.scopeId)))
        return false;
    const source = await workspaceRow(tx, 'sources', person.sourceId, actor.workspaceId);
    return !!source && await sourceVisible(tx, actor, source, clock);
}
export async function personFor(tx: Tx, actor: Actor, id: string, clock: Clock, activeSource = true): Promise<Person> {
    const person = await workspaceRow(tx, 'people', id, actor.workspaceId);
    if (!person)
        missing();
    await requireScope(tx, actor, person.scopeId);
    if (await deletionBlocked(tx, actor.workspaceId, 'PERSON', person.id)) missing();
    await sourceFor(tx, actor, person.sourceId, clock, activeSource);
    return person;
}
export async function validateScopeMembers(tx: Tx, actor: Actor, ids: string[]): Promise<void> {
    invariant(new Set(ids).size === ids.length, 'DUPLICATE_MEMBER', '范围成员不能重复', 400);
    for (const id of ids) {
        const member = await workspaceRow(tx, 'memberships', id, actor.workspaceId);
        if (!member || member.status !== 'ACTIVE')
            missing();
    }
}
