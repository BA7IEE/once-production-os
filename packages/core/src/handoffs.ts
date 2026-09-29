import type { Actor, Clock, RecordHandoff } from './model.ts';
import { LIMITS } from './model.ts';
import type { Tx } from './store.ts';
import { base, cas, page, touch, workspaceRow } from './helpers.ts';
import { invariant, missing } from './errors.ts';
import { requirePermission, personFor, personVisible } from './policy.ts';
import { currentMember, handoffCurrent, recipientEligible } from './handoff-policy.ts';
import { Schemas, v } from './validation.ts';

export async function handoffParticipant(tx: Tx, actor: Actor, id: string): Promise<RecordHandoff> {
    const h = await workspaceRow(tx, 'handoffs', id, actor.workspaceId);
    if (!h || (h.senderId !== actor.membershipId && h.recipientId !== actor.membershipId)) missing();
    return h;
}
export class Handoffs {
    private readonly clock: Clock;
    constructor(clock: Clock) { this.clock = clock; }
    private async ownedPair(tx: Tx, actor: Actor, id: string) {
        requirePermission(actor, 'records.write');
        requirePermission(actor, 'sources.write');
        const person = await personFor(tx, actor, id, this.clock); // Native only; ADMIN is not an override.
        const source = (await workspaceRow(tx, 'sources', person.sourceId, actor.workspaceId))!;
        invariant(person.maintainerId === actor.membershipId && source.maintainerId === actor.membershipId,
            'HANDOFF_OWNER_REQUIRED', '仅档案及其来源的共同维护人可以发起交接', 403);
        invariant(person.status !== 'ARCHIVED', 'HANDOFF_ARCHIVED', '归档资料不能发起交接', 409);
        return { person, source };
    }
    async recipients(tx: Tx, actor: Actor, id: string, query: Record<string, string>): Promise<unknown> {
        await this.ownedPair(tx, actor, id);
        page([], query, ['purpose', 'q']);
        const purpose = v.enum(['EDIT', 'REVIEW']).parse(query.purpose);
        const q = v.string(120).parse(query.q ?? '').toLocaleLowerCase();
        const result = [];
        for (const member of await tx.find('memberships', { workspaceId: actor.workspaceId, status: 'ACTIVE' })) {
            if (member.id === actor.membershipId || !recipientEligible(member, purpose)) continue;
            const user = await workspaceRow(tx, 'users', member.userId, actor.workspaceId);
            if (user?.status !== 'ACTIVE' || (q && !user.displayName.toLocaleLowerCase().includes(q))) continue;
            result.push({ membershipId: member.id, displayName: user.displayName });
        }
        result.sort((a, b) => a.membershipId.localeCompare(b.membershipId));
        return page(result, query, ['purpose', 'q']);
    }
    async create(tx: Tx, actor: Actor, id: string, input: unknown): Promise<RecordHandoff> {
        const data = Schemas.handoffCreate.parse(input);
        const { person, source } = await this.ownedPair(tx, actor, id);
        cas(person, data.expectedRevision); cas(source, data.expectedSourceRevision);
        invariant(data.acknowledgeLimitedAccess, 'HANDOFF_ACK_REQUIRED', '请确认只交接该档案的基本资料，不含联系方式与原始证据', 400);
        invariant(data.recipientId !== actor.membershipId, 'HANDOFF_SELF', '不能向本人发起交接', 400);
        const recipient = await currentMember(tx, actor.workspaceId, data.recipientId);
        if (!recipient) missing();
        invariant(recipientEligible(recipient, data.purpose), 'HANDOFF_RECIPIENT_INELIGIBLE', '接收人当前不具备所选处理能力', 422);
        const end = Date.parse(data.expiresAt), now = this.clock.now().getTime();
        invariant(end > now && end <= Math.min(Date.parse(source.validUntil), now + LIMITS.handoffMs),
            'HANDOFF_EXPIRY_INVALID', '交接期限必须在来源有效期内，最长 7 天', 422);
        // Global authorization lock serializes different request keys too. Do not remove it
        // without replacing the duplicate/admission checks with database-enforced equivalents.
        const all = await tx.find('handoffs', { workspaceId: actor.workspaceId });
        let openSender = 0, openRecipient = 0;
        for (const prior of all) {
            if (!['PENDING', 'ACCEPTED'].includes(prior.state) || Date.parse(prior.expiresAt) <= now) continue;
            if (prior.senderId === actor.membershipId) openSender++;
            if (prior.recipientId === recipient.id) openRecipient++;
            if (prior.personId === id && prior.recipientId === recipient.id && prior.purpose === data.purpose
                && await handoffCurrent(tx, prior, this.clock))
                invariant(false, 'HANDOFF_ALREADY_OPEN', '已有同用途的有效交接，请查看原交接', 409);
        }
        invariant(openSender < LIMITS.maxOpenHandoffs && openRecipient < LIMITS.maxOpenHandoffs,
            'HANDOFF_LIMIT', '未结束的交接过多，请先撤销不用的交接', 429);
        const sender = await currentMember(tx, actor.workspaceId, actor.membershipId);
        if (!sender) missing();
        const ps = (await tx.get('scopes', person.scopeId))!, ss = (await tx.get('scopes', source.scopeId))!;
        const row: RecordHandoff = { ...base(actor.workspaceId, this.clock), personId: id, sourceId: source.id,
            senderId: sender.id, recipientId: recipient.id, senderRevision: sender.revision, recipientRevision: recipient.revision,
            personRevision: person.revision, sourceRevision: source.revision, personEpoch: person.protectionEpoch,
            sourceEpoch: source.protectionEpoch, personScopeId: ps.id, sourceScopeId: ss.id,
            personScopeRevision: ps.revision, sourceScopeRevision: ss.revision,
            purpose: data.purpose, state: 'PENDING', expiresAt: data.expiresAt,
            acceptedAt: null, closedAt: null, closedById: null };
        await tx.insert('handoffs', row);
        return row;
    }
    async act(tx: Tx, actor: Actor, id: string, input: unknown, action: 'accept' | 'decline' | 'revoke'): Promise<RecordHandoff> {
        const data = Schemas.revision.parse(input);
        const h = await handoffParticipant(tx, actor, id);
        cas(h, data.expectedRevision);
        if (action !== 'revoke' && h.recipientId !== actor.membershipId) missing();
        invariant(action === 'revoke' ? ['PENDING', 'ACCEPTED'].includes(h.state) : h.state === 'PENDING',
            'HANDOFF_STATE_CONFLICT', '交接状态已变化，请刷新', 409);
        const now = this.clock.now().toISOString();
        if (action === 'accept') {
            invariant(await handoffCurrent(tx, h, this.clock), 'HANDOFF_INVALIDATED', '交接已过期或资料、成员资格发生变化，请原维护人重新发起', 409);
            const next: RecordHandoff = { ...touch(h, this.clock), state: 'ACCEPTED', acceptedAt: now };
            await tx.replace('handoffs', next); return next;
        }
        // Revocation/decline may still close an expired/invalidated invitation. It grants no access.
        const next: RecordHandoff = { ...touch(h, this.clock), state: action === 'decline' ? 'DECLINED' : 'REVOKED',
            closedAt: now, closedById: actor.membershipId };
        await tx.replace('handoffs', next); return next;
    }
    private async dto(tx: Tx, actor: Actor, h: RecordHandoff): Promise<unknown> {
        const current = await handoffCurrent(tx, h, this.clock);
        const closed = ['DECLINED', 'REVOKED'].includes(h.state);
        const effectiveState = closed ? h.state : Date.parse(h.expiresAt) <= this.clock.now().getTime()
            ? 'EXPIRED' : current ? h.state : 'INVALIDATED';
        const person = await workspaceRow(tx, 'people', h.personId, actor.workspaceId);
        const native = person ? await personVisible(tx, actor, person, this.clock) : false;
        const readable = native || (current && h.state === 'ACCEPTED' && actor.membershipId === h.recipientId);
        const other = await workspaceRow(tx, 'memberships', actor.membershipId === h.senderId ? h.recipientId : h.senderId, actor.workspaceId);
        const user = other ? await workspaceRow(tx, 'users', other.userId, actor.workspaceId) : null;
        return { id: h.id, counterpart: user?.displayName ?? '不可用成员', revision: h.revision, purpose: h.purpose, state: h.state, effectiveState,
            direction: actor.membershipId === h.senderId ? 'SENT' : 'RECEIVED',
            person: readable && person ? { id: person.id, displayName: person.displayName } : null,
            expiresAt: h.expiresAt, createdAt: h.createdAt, acceptedAt: h.acceptedAt, closedAt: h.closedAt,
            canAccept: h.state === 'PENDING' && current && actor.membershipId === h.recipientId,
            canDecline: h.state === 'PENDING' && actor.membershipId === h.recipientId,
            canRevoke: !closed };
    }
    async list(tx: Tx, actor: Actor, query: Record<string, string>): Promise<unknown> {
        page([], query, ['direction']);
        const direction = v.enum(['SENT', 'RECEIVED']).parse(query.direction ?? 'RECEIVED');
        const rows = await tx.find('handoffs', { workspaceId: actor.workspaceId,
            ...(direction === 'SENT' ? { senderId: actor.membershipId } : { recipientId: actor.membershipId }) });
        rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
        const selected = page(rows, query, ['direction']);
        const items = [];
        for (const h of selected.items) items.push(await this.dto(tx, actor, h));
        return { ...selected, items };
    }
    async get(tx: Tx, actor: Actor, id: string): Promise<unknown> {
        return this.dto(tx, actor, await handoffParticipant(tx, actor, id));
    }
}
