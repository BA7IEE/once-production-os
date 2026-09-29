import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, member, createPerson, result, Client } from '../support/fixtures.ts';
import type { Role } from '../../packages/core/src/model.ts';
import { Application } from '../../packages/core/src/api.ts';
import { FaultStore } from '../support/fault-store.ts';

async function setup(role: Role = 'EDITOR', extras: string[] = []) {
    const f = await fixture();
    const sender = await member(f, 'sender');
    const receiver = await member(f, 'receiver', role, extras);
    const personId = await createPerson(sender.client, '仅限本次交接的合成人物', true);
    const person = f.store.rows('people').find(p => p.id === personId)!;
    const source = f.store.rows('sources').find(s => s.id === person.sourceId)!;
    const input = { expectedRevision: person.revision, expectedSourceRevision: source.revision,
        recipientId: receiver.id, purpose: role === 'REVIEWER' ? 'REVIEW' : 'EDIT',
        expiresAt: new Date(f.clock.now().getTime() + 3600000).toISOString(), acknowledgeLimitedAccess: true };
    return { ...f, sender, receiver, person, source, input };
}
async function offer(f: Awaited<ReturnType<typeof setup>>, override: object = {}) {
    const r = await f.sender.client.cmd('POST', '/people/' + f.person.id + '/handoffs', { ...f.input, ...override });
    assert.equal(r.status, 201, JSON.stringify(r.body)); return String(result(r).resourceId);
}
async function accept(f: Awaited<ReturnType<typeof setup>>, id: string) {
    const r = await f.receiver.client.cmd('POST', '/handoffs/' + id + '/accept', { expectedRevision: 1 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
}
const forbiddenPayload = (value: unknown, text: string) => assert.ok(!JSON.stringify(value).includes(text));

test('H1 pending invitations reveal no profile; acceptance grants only the exact basic profile', async () => {
    const f = await setup(); const h = await offer(f);
    assert.equal((await f.receiver.client.raw('GET', '/people/' + f.person.id)).status, 404);
    assert.equal(result(await f.receiver.client.raw('GET', '/people')).total, 0);
    const invite = result(await f.receiver.client.raw('GET', '/handoffs/' + h));
    assert.equal(invite.person, null); assert.equal(invite.effectiveState, 'PENDING');
    forbiddenPayload(invite, f.person.displayName); forbiddenPayload(invite, f.source.title);
    const scopes = f.store.rows('scopeMembers'), people = f.store.rows('people'), sources = f.store.rows('sources');
    await accept(f, h);
    const view = result(await f.receiver.client.raw('GET', '/people/' + f.person.id));
    assert.equal(view.access.mode, 'HANDOFF'); assert.equal(view.access.canEdit, true);
    assert.equal(view.access.canOffer, false); assert.equal(view.access.canReadSource, false);
    assert.equal(result(await f.receiver.client.raw('GET', '/people')).total, 1);
    assert.deepEqual(f.store.rows('scopeMembers'), scopes); assert.deepEqual(f.store.rows('people'), people);
    assert.deepEqual(f.store.rows('sources'), sources);
});
test('H1 delegated edit changes basic fields, not ownership, status or private permissions', async () => {
    const f = await setup(); const h = await offer(f); await accept(f, h);
    const r = await f.receiver.client.cmd('PATCH', '/people/' + f.person.id, { expectedRevision: 1, intro: '接收人整理后的基本简介' });
    assert.equal(r.status, 200);
    assert.equal(f.store.rows('people')[0]!.maintainerId, f.sender.id);
    assert.equal(f.store.rows('sources')[0]!.maintainerId, f.sender.id);
    assert.equal((await f.receiver.client.cmd('PATCH', '/people/' + f.person.id, { expectedRevision: 2, status: 'ARCHIVED' })).status, 403);
    assert.equal((await f.receiver.client.cmd('PATCH', '/people/' + f.person.id, { expectedRevision: 2, maintainerId: f.receiver.id })).status, 400);
});
test('H1 grant of one record never reveals sibling people from the same source', async () => {
    const f = await setup();
    const sibling = await f.sender.client.cmd('POST', '/people', { displayName: '另一份不可见档案', roles: ['model'], sourceId: f.source.id });
    assert.equal(sibling.status, 201);
    const h = await offer(f); await accept(f, h);
    const list = result(await f.receiver.client.raw('GET', '/people'));
    assert.equal(list.total, 1); forbiddenPayload(list, '另一份不可见档案');
    assert.equal((await f.receiver.client.raw('GET', '/people/' + result(sibling).resourceId)).status, 404);
});
test('H1 even a sensitive ADMIN recipient gains no contacts, raw source, history or scope authority', async () => {
    const f = await setup('ADMIN', ['sensitive.read', 'sensitive.write']);
    const h = await offer(f); await accept(f, h);
    for (const path of ['/sources/' + f.source.id, '/sources/' + f.source.id + '/history', '/people/' + f.person.id + '/contacts'])
        assert.equal((await f.receiver.client.raw('GET', path)).status, 404, path);
    assert.equal((await f.receiver.client.cmd('PUT', '/people/' + f.person.id + '/contacts', { expectedRevision: 1, contacts: [] })).status, 404);
    assert.equal((await f.receiver.client.cmd('PATCH', '/records/person/' + f.person.id + '/scope', { expectedRevision: 1, scopeId: f.person.scopeId })).status, 404);
    assert.equal((await f.receiver.client.cmd('POST', '/sources/' + f.source.id + '/review', { expectedRevision: 1, basisDescription: '不得通过交接核准来源', validUntil: f.source.validUntil })).status, 404);
});
test('H1 received access cannot be delegated again or used to import extra people from the source', async () => {
    const f = await setup(); const h = await offer(f); await accept(f, h);
    assert.equal((await f.receiver.client.raw('GET', '/people/' + f.person.id + '/handoff-recipients?purpose=EDIT')).status, 404);
    assert.equal((await f.receiver.client.cmd('POST', '/people/' + f.person.id + '/handoffs', { ...f.input, recipientId: f.sender.id })).status, 404);
    assert.equal((await f.receiver.client.cmd('POST', '/imports/preview', { sourceId: f.source.id, rows: [{ displayName: '禁止扩散', roles: ['model'] }] })).status, 404);
});
test('H1 unscoped ADMIN cannot offer or accept someone else\'s private handoff', async () => {
    const f = await setup(); const h = await offer(f);
    assert.equal((await f.owner.cmd('POST', '/people/' + f.person.id + '/handoffs', f.input)).status, 404);
    assert.equal((await f.owner.raw('GET', '/handoffs/' + h)).status, 404);
    assert.equal((await f.owner.cmd('POST', '/handoffs/' + h + '/accept', { expectedRevision: 1 })).status, 404);
    assert.ok(!result(await f.owner.raw('GET', '/audit-events')).items.some((a: any) => a.resourceKind === 'handoff'));
});
test('H1 only the joint person/source maintainer may offer; native scope alone is insufficient', async () => {
    const f = await setup();
    await f.store.transaction(async tx => { const s = (await tx.get('sources', f.source.id))!; await tx.replace('sources', { ...s, maintainerId: f.membershipId }); });
    assert.equal((await f.sender.client.cmd('POST', '/people/' + f.person.id + '/handoffs', f.input)).status, 403);
});
test('H1 REVIEW access cannot write basic profile even when target globally has records.write', async () => {
    const f = await setup('ADMIN'); const h = await offer(f, { purpose: 'REVIEW' }); await accept(f, h);
    assert.equal(result(await f.receiver.client.raw('GET', '/people/' + f.person.id)).access.canEdit, false);
    assert.equal((await f.receiver.client.cmd('PATCH', '/people/' + f.person.id, { expectedRevision: 1, intro: '错误写入' })).status, 404);
});
test('H1 field review still needs an independently readable evidence source; no raw-source shortcut', async () => {
    const f = await setup('REVIEWER'); const h = await offer(f); await accept(f, h);
    const evidence = { personId: f.person.id, expectedRevision: 1, fieldPath: 'displayName', sourceId: f.source.id, sourceRevision: 1 };
    assert.equal((await f.receiver.client.cmd('POST', '/field-evidence', evidence)).status, 404);
    const shared = await f.owner.cmd('POST', '/sources', { title: '独立可读证据', type: 'MANUAL', providerClaim: '合成', basisMode: 'INTERNAL_USE', basisDescription: '供字段核验的合成证据', validUntil: f.source.validUntil });
    assert.equal(shared.status, 201);
    assert.equal((await f.receiver.client.cmd('POST', '/field-evidence', { ...evidence, sourceId: result(shared).resourceId })).status, 200);
    assert.equal(f.store.rows('evidence').length, 1);
    assert.equal(result(await f.receiver.client.raw('GET', '/people/' + f.person.id)).evidence.length, 1);
});
test('H1 EDIT does not confer field review when target has reviewer permission by another role', async () => {
    const f = await setup('ADMIN'); const h = await offer(f); await accept(f, h);
    const shared = await f.owner.cmd('POST', '/sources', { title: '独立证据', type: 'MANUAL', providerClaim: '合成', basisMode: 'INTERNAL_USE', basisDescription: '仅供测试的依据', validUntil: f.source.validUntil });
    const r = await f.receiver.client.cmd('POST', '/field-evidence', { personId: f.person.id, expectedRevision: 1, fieldPath: 'displayName', sourceId: result(shared).resourceId, sourceRevision: 1 });
    assert.equal(r.status, 404);
});
test('H1 revoke removes access on next read/write/list, but retains minimal participant receipt', async () => {
    const f = await setup(); const h = await offer(f); await accept(f, h);
    const key = randomUUID(), input = { expectedRevision: 1, intro: '先前成功的编辑' };
    assert.equal((await f.receiver.client.cmd('PATCH', '/people/' + f.person.id, input, key)).status, 200);
    const revoke = await f.sender.client.cmd('POST', '/handoffs/' + h + '/revoke', { expectedRevision: 2 }); assert.equal(revoke.status, 200);
    assert.equal((await f.receiver.client.cmd('PATCH', '/people/' + f.person.id, input, key)).status, 404);
    assert.equal(result(await f.receiver.client.raw('GET', '/people')).total, 0);
    assert.equal(result(await f.receiver.client.raw('GET', '/handoffs/' + h)).person, null);
    assert.equal((await f.receiver.client.raw('GET', '/people/' + f.person.id)).status, 404);
});
test('H1 recipient can decline pending or release accepted access without changing original records', async () => {
    const f = await setup(); const h = await offer(f);
    assert.equal((await f.receiver.client.cmd('POST', '/handoffs/' + h + '/decline', { expectedRevision: 1 })).status, 200);
    assert.equal((await f.receiver.client.cmd('POST', '/handoffs/' + h + '/accept', { expectedRevision: 2 })).status, 409);
    const next = await offer(f); await accept(f, next);
    assert.equal((await f.receiver.client.cmd('POST', '/handoffs/' + next + '/revoke', { expectedRevision: 2 })).status, 200);
    assert.equal(f.store.rows('people')[0]!.revision, 1);
});
test('H1 immutable invite identity: malformed, self, excessive expiry and missing acknowledgment rejected', async () => {
    const f = await setup();
    for (const extra of [{ recipientId: f.sender.id }, { acknowledgeLimitedAccess: false }, { expiresAt: '2027-01-01T00:00:00.000Z' }, { state: 'ACCEPTED' }, { workspaceId: f.workspaceId }]) {
        const r = await f.sender.client.cmd('POST', '/people/' + f.person.id + '/handoffs', { ...f.input, ...extra });
        assert.ok([400, 422].includes(r.status), JSON.stringify(r.body));
    }
    assert.equal(f.store.rows('handoffs').length, 0);
});
test('H1 directory is scoped to an owned record and reveals only eligible active member labels', async () => {
    const f = await setup(); await member(f, 'viewer', 'VIEWER');
    const r = await f.sender.client.raw('GET', '/people/' + f.person.id + '/handoff-recipients?purpose=EDIT');
    assert.equal(r.status, 200); assert.equal(result(r).items.length, 2); // bootstrap admin + receiver
    for (const item of result(r).items) assert.deepEqual(Object.keys(item).sort(), ['displayName', 'membershipId']);
    assert.equal((await f.receiver.client.raw('GET', '/people/' + f.person.id + '/handoff-recipients?purpose=EDIT')).status, 404);
});
test('H1 same-key creation/accept replays; different-key duplicate and stale accept fail', async () => {
    const f = await setup(); const key = randomUUID();
    const create = () => f.sender.client.cmd('POST', '/people/' + f.person.id + '/handoffs', f.input, key);
    const pair = await Promise.all([create(), create()]); assert.ok(pair.every(r => r.status === 201));
    assert.equal(f.store.rows('handoffs').length, 1);
    assert.equal((await f.sender.client.cmd('POST', '/people/' + f.person.id + '/handoffs', f.input)).status, 409);
    const h = result(pair[0]!).resourceId; const ak = randomUUID();
    const a = () => f.receiver.client.cmd('POST', '/handoffs/' + h + '/accept', { expectedRevision: 1 }, ak);
    assert.equal((await a()).status, 200); assert.equal(result(await a()).replayed, true);
    assert.equal((await f.receiver.client.cmd('POST', '/handoffs/' + h + '/accept', { expectedRevision: 1 })).status, 409);
    assert.equal((await f.sender.client.cmd('POST', '/people/' + f.person.id + '/handoffs', { ...f.input, purpose: 'REVIEW' }, key)).status, 409);
});
for (const change of ['person-before-accept', 'source-before-accept', 'source-after-accept', 'scope-after-accept', 'archive-after-accept', 'recipient-role', 'sender-role', 'expiry'] as const) {
    test('H1 current facts invalidate access: ' + change, async () => {
        const f = await setup(); const h = await offer(f);
        const before = change.endsWith('before-accept'); if (!before) await accept(f, h);
        if (change === 'person-before-accept') await f.sender.client.cmd('PATCH', '/people/' + f.person.id, { expectedRevision: 1, intro: '发起后已改稿' });
        if (change.startsWith('source-')) await f.sender.client.cmd('PATCH', '/sources/' + f.source.id, { expectedRevision: 1, title: '来源已变更' });
        if (change === 'scope-after-accept') await f.store.transaction(async tx => { const p = (await tx.get('people', f.person.id))!; await tx.replace('people', { ...p, protectionEpoch: p.protectionEpoch + 1 }); });
        if (change === 'archive-after-accept') await f.sender.client.cmd('PATCH', '/people/' + f.person.id, { expectedRevision: 1, status: 'ARCHIVED' });
        if (change === 'recipient-role') { await f.owner.cmd('PATCH', '/memberships/' + f.receiver.id + '/permissions', { expectedRevision: 1, role: 'VIEWER', extraPermissions: [] }); await f.receiver.client.login('receiver'); }
        if (change === 'sender-role') await f.owner.cmd('PATCH', '/memberships/' + f.sender.id + '/permissions', { expectedRevision: 1, role: 'VIEWER', extraPermissions: [] });
        if (change === 'expiry') f.clock.advance(3600000);
        if (change === 'expiry') await f.receiver.client.login('receiver');
        if (before) assert.equal((await f.receiver.client.cmd('POST', '/handoffs/' + h + '/accept', { expectedRevision: 1 })).status, 409);
        assert.equal((await f.receiver.client.raw('GET', '/people/' + f.person.id)).status, 404);
        const state = result(await f.receiver.client.raw('GET', '/handoffs/' + h));
        assert.ok(['INVALIDATED', 'EXPIRED'].includes(state.effectiveState)); assert.equal(state.person, null);
    });
}
test('H1 roles restored later do not resurrect a previously invalidated grant', async () => {
    const f = await setup(); const h = await offer(f); await accept(f, h);
    await f.owner.cmd('PATCH', '/memberships/' + f.receiver.id + '/permissions', { expectedRevision: 1, role: 'VIEWER', extraPermissions: [] });
    await f.owner.cmd('PATCH', '/memberships/' + f.receiver.id + '/permissions', { expectedRevision: 2, role: 'EDITOR', extraPermissions: [] });
    await f.receiver.client.login('receiver');
    assert.equal((await f.receiver.client.raw('GET', '/people/' + f.person.id)).status, 404);
});
test('H1 grant never reduces independently held native access after revocation', async () => {
    const f = await setup();
    const native = await createPerson(f.owner, '原本工作空间可见', false);
    assert.equal((await f.receiver.client.raw('GET', '/people/' + native)).status, 200);
    const h = await offer(f); await accept(f, h);
    await f.receiver.client.cmd('POST', '/handoffs/' + h + '/revoke', { expectedRevision: 2 });
    assert.equal((await f.receiver.client.raw('GET', '/people/' + native)).status, 200);
});
test('H1 handoff insert/audit/receipt faults roll back completely; same key then succeeds', async () => {
    const f = await setup(); const counts = () => ['handoffs', 'audits', 'receipts'].map(t => f.store.rows(t as 'handoffs').length);
    const before = counts(); const faults = new FaultStore(f.store); let fired = false;
    faults.afterInsert = t => { if (t === 'receipts' && !fired) { fired = true; throw new Error('after real receipt insert'); } };
    const app = new Application(faults, f.app.config, f.clock); const c = new Client(app); c.jar = { ...f.sender.client.jar }; c.csrf = f.sender.client.csrf;
    const key = randomUUID();
    assert.equal((await c.cmd('POST', '/people/' + f.person.id + '/handoffs', f.input, key)).status, 500);
    assert.ok(fired); assert.deepEqual(counts(), before);
    assert.equal((await c.cmd('POST', '/people/' + f.person.id + '/handoffs', f.input, key)).status, 201);
    assert.deepEqual(counts(), before.map(n => n + 1));
});
test('H1 sender and recipient concurrent close/accept cannot both apply stale revisions', async () => {
    const f = await setup(); const h = await offer(f);
    const r = await Promise.all([f.sender.client.cmd('POST', '/handoffs/' + h + '/revoke', { expectedRevision: 1 }),
        f.receiver.client.cmd('POST', '/handoffs/' + h + '/accept', { expectedRevision: 1 })]);
    assert.deepEqual(r.map(x => x.status).sort(), [200, 409]);
});
