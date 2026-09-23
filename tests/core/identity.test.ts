import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, newSystem, Client, member, result, SYNTHETIC_PASSWORD, createPerson } from '../support/fixtures.ts';
import { LIMITS } from '../../packages/core/src/model.ts';
test('bootstrap is CLI-only and rejects a second initialization', async () => { const f = await fixture(); assert.equal(f.store.rows('users').length, 1); await assert.rejects(() => f.app.identity.bootstrap('another', 'B', SYNTHETIC_PASSWORD)); assert.equal((await f.owner.raw('POST', '/bootstrap', {})).status, 404); });
test('failed bootstrap audit rolls the entire installation back', async () => { const f = newSystem(); f.store.failNextAudit = true; await assert.rejects(() => f.app.identity.bootstrap('owner', 'A', SYNTHETIC_PASSWORD)); assert.equal(f.store.rows('workspaces').length, 0); assert.equal(f.store.rows('users').length, 0); });
test('anonymous business reads rejected', async () => { const f = await fixture(); assert.equal((await new Client(f.app).raw('GET', '/people')).status, 401); });
test('login cookie is host-only Secure HttpOnly SameSite', async () => { const f = await fixture(); const r = await f.owner.login(); const s = r.cookies.find(c => c.startsWith('once_session='))!; assert.match(s, /Secure/); assert.match(s, /HttpOnly/); assert.match(s, /SameSite=Strict/); assert.ok(!s.includes('Domain=')); assert.ok(!('token' in result(r))); });
test('login requires server-issued preauth token', async () => { const f = await fixture(); const c = new Client(f.app); const r = await c.raw('POST', '/auth/login', { loginName: 'owner', password: SYNTHETIC_PASSWORD }); assert.equal(r.status, 403); });
test('cross-origin writes rejected even with a valid session and CSRF', async () => { const f = await fixture(); assert.equal((await f.owner.raw('POST', '/scopes', { name: 'X', membershipIds: [f.membershipId] }, { origin: 'https://evil.test' })).status, 403); });
test('missing CSRF rejected', async () => { const f = await fixture(); assert.equal((await f.owner.raw('POST', '/auth/logout', {}, { 'x-csrf-token': '' })).status, 403); });
test('non-JSON write rejected', async () => { const f = await fixture(); assert.equal((await f.owner.raw('POST', '/sources', {}, { 'content-type': 'text/plain' })).status, 415); });
test('invalid login is uniform and eventually rate-limited', async () => {
    const f = await fixture();
    const c = new Client(f.app, '192.0.2.99');
    let last;
    for (let i = 0; i < 9; i++)
        last = await c.login('nonexistent', 'bad');
    assert.equal(last!.status, 429);
    assert.equal(f.store.rows('sessions').length, 1);
});
test('activation is single-use and secret is never recoverable from list', async () => { const f = await fixture(); const r = await f.owner.raw('POST', '/memberships', { loginName: 'one', displayName: '合成成员', role: 'VIEWER', extraPermissions: [] }); const c = new Client(f.app); assert.equal((await c.activate(result(r).activationToken)).status, 200); assert.equal((await c.activate(result(r).activationToken)).status, 401); const listing = await f.owner.raw('GET', '/memberships'); assert.ok(!JSON.stringify(listing.body).includes(result(r).activationToken)); assert.ok(!JSON.stringify(f.store.rows('activations')).includes(result(r).activationToken)); });
test('activation expires at the exact boundary', async () => { const f = await fixture(); const r = await f.owner.raw('POST', '/memberships', { loginName: 'one', displayName: '合成成员', role: 'VIEWER', extraPermissions: [] }); f.clock.advance(LIMITS.activationMs); assert.equal((await new Client(f.app).activate(result(r).activationToken)).status, 401); });
test('reset invalidates the previous activation and active sessions', async () => { const f = await fixture(); const m = await member(f, 'resetuser'); const reset = await f.owner.raw('POST', `/memberships/${m.id}/reset-access`, { expectedRevision: 1 }); assert.equal(reset.status, 200); assert.equal((await m.client.raw('GET', '/me')).status, 401); assert.equal((await m.client.activate(result(m.created).activationToken)).status, 401); assert.equal((await m.client.activate(result(reset).activationToken)).status, 200); });
test('self-reset is refused in favor of password change', async () => { const f = await fixture(); assert.equal((await f.owner.raw('POST', `/memberships/${f.membershipId}/reset-access`, { expectedRevision: 1 })).status, 409); });
test('pending admin does not allow deleting last active admin', async () => { const f = await fixture(); await f.owner.raw('POST', '/memberships', { loginName: 'pendingadmin', displayName: '待激活', role: 'ADMIN', extraPermissions: [] }); assert.equal((await f.owner.cmd('POST', `/memberships/${f.membershipId}/disable`, { expectedRevision: 1 })).status, 409); });
test('VIEWER cannot write or list members', async () => { const f = await fixture(); const m = await member(f, 'viewer', 'VIEWER'); assert.equal((await m.client.raw('GET', '/memberships')).status, 403); assert.equal((await m.client.cmd('POST', '/people', { displayName: 'A', roles: ['model'] })).status, 403); });
test('permission change revokes old sessions', async () => { const f = await fixture(); const m = await member(f, 'editor'); await f.owner.cmd('PATCH', `/memberships/${m.id}/permissions`, { expectedRevision: 1, role: 'VIEWER', extraPermissions: [] }); assert.equal((await m.client.raw('GET', '/me')).status, 401); await m.client.login('editor'); assert.equal(result(await m.client.raw('GET', '/me')).role, 'VIEWER'); });
test('disabled member cannot replay a previously valid command', async () => { const f = await fixture(); const m = await member(f, 'editor'); await createPerson(m.client, '自己的草稿', true); await f.owner.cmd('POST', `/memberships/${m.id}/disable`, { expectedRevision: 1 }); assert.equal((await m.client.raw('GET', '/people')).status, 401); });
test('idle timeout is checked without a worker', async () => { const f = await fixture(); f.clock.advance(LIMITS.idleMs); assert.equal((await f.owner.raw('GET', '/me')).status, 401); });
test('absolute expiry is not extended by activity', async () => {
    const f = await fixture();
    for (let i = 0; i < 36; i++) {
        f.clock.advance(20 * 60000);
        const r = await f.owner.raw('GET', '/me');
        assert.equal(r.status, i === 35 ? 401 : 200);
    }
});
test('password change invalidates all previous sessions', async () => { const f = await fixture(); const other = new Client(f.app, '192.0.2.90'); await other.login(); const r = await f.owner.raw('POST', '/auth/change-password', { oldPassword: SYNTHETIC_PASSWORD, newPassword: 'Another-synthetic-password!' }); assert.equal(r.status, 200); assert.equal((await other.raw('GET', '/me')).status, 401); });
test('recovery epoch mismatch isolates old sessions', async () => { const f = await fixture(); f.app.config.recoveryEpoch = 'changed-recovery-epoch-123'; assert.equal((await f.owner.raw('GET', '/me')).status, 503); assert.equal((await f.owner.login()).status, 503); });
test('maintenance mode blocks business and claims', async () => { const f = await fixture(); f.app.config.accessMode = 'MAINTENANCE'; assert.equal((await f.owner.raw('GET', '/people')).status, 503); assert.equal(await f.app.imports.claim(), null); });
test('pending administrator can be disabled without removing the sole active administrator', async () => {
    const f = await fixture();
    const created = await f.owner.raw('POST', '/memberships', { loginName: 'pending-admin', displayName: '待激活管理员', role: 'ADMIN', extraPermissions: [] });
    const disabled = await f.owner.cmd('POST', '/memberships/' + result(created).membershipId + '/disable', { expectedRevision: 1 });
    assert.equal(disabled.status, 200);
    assert.equal((await f.owner.raw('GET', '/me')).status, 200);
});
test('recovery isolation also blocks activation rather than only ordinary API reads', async () => {
    const f = await fixture();
    const created = await f.owner.raw('POST', '/memberships', { loginName: 'pending-user', displayName: '待激活', role: 'VIEWER', extraPermissions: [] });
    f.app.config.recoveryEpoch = 'different_external_recovery_epoch';
    const c = new Client(f.app);
    assert.equal((await c.activate(result(created).activationToken)).status, 503);
    assert.equal(f.store.rows('activations')[0]!.consumedAt, null);
});
test('access reset has a per-member issuance rate limit', async () => {
    const f = await fixture();
    const created = await f.owner.raw('POST', '/memberships', { loginName: 'rate-reset', displayName: '合成限流', role: 'VIEWER', extraPermissions: [] });
    const id = result(created).membershipId;
    for (let i = 1; i <= 5; i++)
        assert.equal((await f.owner.raw('POST', '/memberships/' + id + '/reset-access', { expectedRevision: i })).status, 200);
    assert.equal((await f.owner.raw('POST', '/memberships/' + id + '/reset-access', { expectedRevision: 6 })).status, 429);
});
