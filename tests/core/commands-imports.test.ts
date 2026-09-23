import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, member, createPerson, sourceInput, result } from '../support/fixtures.ts';
import { LIMITS } from '../../packages/core/src/model.ts';
async function preview(f: Awaited<ReturnType<typeof fixture>>, rows: unknown[] = [{ displayName: '导入甲', roles: ['model'] }, { displayName: '导入乙', roles: ['editor'] }]) {
    const s = await f.owner.cmd('POST', '/sources', sourceInput());
    const p = await f.owner.cmd('POST', '/imports/preview', { sourceId: result(s).resourceId, rows });
    assert.equal(p.status, 201);
    return { id: result(p).resourceId as string, sourceId: result(s).resourceId as string };
}
async function enqueue(f: Awaited<ReturnType<typeof fixture>>) { const p = await preview(f); const c = await f.owner.cmd('POST', '/imports/' + p.id + '/commit', { expectedRevision: 1, selectedRows: [0, 1] }); assert.equal(c.status, 202); return { ...p, jobId: result(c).resourceId as string }; }
test('ten concurrent same-key creates produce one identity, source and receipt', async () => {
    const f = await fixture();
    const key = randomUUID();
    const payload = { displayName: '并发创建', roles: ['model'], inlineSource: sourceInput() };
    const responses = await Promise.all(Array.from({ length: 10 }, () => f.owner.cmd('POST', '/people', payload, key)));
    assert.ok(responses.every(r => r.status === 201));
    assert.equal(new Set(responses.map(r => result(r).resourceId)).size, 1);
    assert.equal(f.store.rows('people').length, 1);
    assert.equal(f.store.rows('sources').length, 1);
    assert.equal(f.store.rows('receipts').length, 1);
});
test('same key plus different request or target returns conflict', async () => {
    const f = await fixture();
    const id = await createPerson(f.owner);
    const other = await createPerson(f.owner);
    const key = randomUUID();
    await f.owner.cmd('PATCH', '/people/' + id, { expectedRevision: 1, intro: 'first' }, key);
    assert.equal((await f.owner.cmd('PATCH', '/people/' + id, { expectedRevision: 1, intro: 'second' }, key)).status, 409);
    assert.equal((await f.owner.cmd('PATCH', '/people/' + other, { expectedRevision: 1, intro: 'first' }, key)).status, 409);
});
test('exact replay is checked before original CAS, and never reapplies old write', async () => {
    const f = await fixture();
    const id = await createPerson(f.owner);
    const key = randomUUID();
    const p = { expectedRevision: 1, intro: '旧提交' };
    await f.owner.cmd('PATCH', '/people/' + id, p, key);
    await f.owner.cmd('PATCH', '/people/' + id, { expectedRevision: 2, intro: '后续更新' });
    const replay = await f.owner.cmd('PATCH', '/people/' + id, p, key);
    assert.equal(replay.status, 200);
    assert.equal(result(replay).replayed, true);
    assert.equal(result(replay).revision, 2);
    assert.equal(result(await f.owner.raw('GET', '/people/' + id)).intro, '后续更新');
});
test('current record scope is checked before returning even minimal old receipt', async () => {
    const f = await fixture();
    const e = await member(f, 'editor');
    const id = await createPerson(f.owner);
    const key = randomUUID();
    const payload = { expectedRevision: 1, intro: '编辑记录' };
    await e.client.cmd('PATCH', '/people/' + id, payload, key);
    const scope = await f.owner.cmd('POST', '/scopes', { name: '缩小', membershipIds: [f.membershipId] });
    await f.owner.cmd('PATCH', '/records/person/' + id + '/scope', { expectedRevision: 2, scopeId: result(scope).resourceId });
    assert.equal((await e.client.cmd('PATCH', '/people/' + id, payload, key)).status, 404);
});
test('command without idempotency key does not write', async () => {
    const f = await fixture();
    assert.equal((await f.owner.raw('POST', '/people', { displayName: '无键', roles: ['model'], inlineSource: sourceInput() })).status, 400);
    assert.equal(f.store.rows('people').length, 0);
});
test('audit failure rolls back source, person and receipt, then same key may succeed', async () => {
    const f = await fixture();
    const key = randomUUID();
    const input = { displayName: '原子性', roles: ['model'], inlineSource: sourceInput() };
    f.store.failNextAudit = true;
    assert.equal((await f.owner.cmd('POST', '/people', input, key)).status, 500);
    assert.equal(f.store.rows('people').length, 0);
    assert.equal(f.store.rows('sources').length, 0);
    assert.equal(f.store.rows('receipts').length, 0);
    assert.equal((await f.owner.cmd('POST', '/people', input, key)).status, 201);
});
test('receipt schema contains only operation metadata, not person text', async () => {
    const f = await fixture();
    await createPerson(f.owner, '唯一测试文本XYZ');
    const serialized = JSON.stringify(f.store.rows('receipts'));
    assert.ok(!serialized.includes('唯一测试文本XYZ'));
    for (const r of f.store.rows('receipts'))
        assert.deepEqual(Object.keys(r.result).sort(), ['operationId', 'resourceId', 'revision', 'state'].sort());
});
test('preview reports errors per row and never creates people', async () => {
    const f = await fixture();
    const p = await preview(f, [{ displayName: '有效', roles: ['model'] }, { displayName: '错角色', roles: ['wrong'] }, { displayName: '越界', roles: ['model'], phone: 'secret' }, null]);
    const rows = result(await f.owner.raw('GET', '/imports/' + p.id)).rows;
    assert.deepEqual(rows.map((r: any) => r.state), ['VALID', 'INVALID', 'INVALID', 'INVALID']);
    assert.equal(f.store.rows('people').length, 0);
    assert.ok(!JSON.stringify(f.store.rows('imports')).includes('secret'));
});
test('preview rejects over 100 rows and duplicate selected indices', async () => {
    const f = await fixture();
    const p = await preview(f);
    assert.equal((await f.owner.cmd('POST', '/imports/' + p.id + '/commit', { expectedRevision: 1, selectedRows: [0, 0] })).status, 400);
    assert.equal((await f.owner.cmd('POST', '/imports/preview', { sourceId: p.sourceId, rows: Array.from({ length: 101 }, () => ({ displayName: 'x', roles: ['model'] })) })).status, 400);
});
test('preview is private to initiating member, including other administrators', async () => {
    const f = await fixture();
    const p = await preview(f);
    const a = await member(f, 'admin', 'ADMIN');
    assert.equal((await a.client.raw('GET', '/imports/' + p.id)).status, 404);
});
test('commit only enqueues; worker creates selected people with row-level result', async () => {
    const f = await fixture();
    const p = await enqueue(f);
    assert.equal(f.store.rows('people').length, 0);
    const job = await f.app.imports.claim();
    assert.ok(job);
    await f.app.imports.process(job);
    assert.equal(f.store.rows('people').length, 2);
    assert.equal(result(await f.owner.raw('GET', '/jobs/' + p.jobId)).state, 'SUCCEEDED');
    assert.ok(result(await f.owner.raw('GET', '/imports/' + p.id)).rows.every((r: any) => r.state === 'IMPORTED' && r.personId));
});
test('exact commit replay returns original job; new key cannot change selected rows', async () => {
    const f = await fixture();
    const p = await preview(f);
    const key = randomUUID();
    const input = { expectedRevision: 1, selectedRows: [0] };
    const a = await f.owner.cmd('POST', '/imports/' + p.id + '/commit', input, key);
    const b = await f.owner.cmd('POST', '/imports/' + p.id + '/commit', input, key);
    assert.equal(result(a).resourceId, result(b).resourceId);
    assert.equal(b.status, 202);
    assert.equal((await f.owner.cmd('POST', '/imports/' + p.id + '/commit', { expectedRevision: 1, selectedRows: [1] })).status, 409);
});
test('source revision change between preview and commit blocks stale batch', async () => {
    const f = await fixture();
    const p = await preview(f);
    await f.owner.cmd('PATCH', '/sources/' + p.sourceId, { expectedRevision: 1, title: '来源已变更' });
    assert.equal((await f.owner.cmd('POST', '/imports/' + p.id + '/commit', { expectedRevision: 1, selectedRows: [0] })).status, 409);
    assert.equal(f.store.rows('jobs').length, 0);
});
test('source suspension after enqueue stops worker without importing', async () => {
    const f = await fixture();
    const p = await enqueue(f);
    await f.owner.cmd('POST', '/sources/' + p.sourceId + '/suspend', { expectedRevision: 1, reason: '停止本批资料使用' });
    const job = await f.app.imports.claim();
    assert.ok(job);
    await f.app.imports.process(job);
    assert.equal(f.store.rows('people').length, 0);
    assert.equal(f.store.rows('jobs')[0]!.state, 'FAILED');
});
test('worker rechecks initiating member role after enqueue', async () => {
    const f = await fixture();
    const e = await member(f, 'editor');
    const s = await f.owner.cmd('POST', '/sources', sourceInput());
    const p = await e.client.cmd('POST', '/imports/preview', { sourceId: result(s).resourceId, rows: [{ displayName: '测试', roles: ['model'] }] });
    await e.client.cmd('POST', '/imports/' + result(p).resourceId + '/commit', { expectedRevision: 1, selectedRows: [0] });
    await f.owner.cmd('PATCH', '/memberships/' + e.id + '/permissions', { expectedRevision: 1, role: 'VIEWER', extraPermissions: [] });
    const job = await f.app.imports.claim();
    assert.ok(job);
    await f.app.imports.process(job);
    assert.equal(f.store.rows('people').length, 0);
    assert.equal(f.store.rows('jobs')[0]!.state, 'FAILED');
});
test('expired claim cannot write or mark a newly claimed job successful', async () => {
    const f = await fixture();
    await enqueue(f);
    const old = await f.app.imports.claim();
    assert.ok(old);
    f.clock.advance(LIMITS.jobLeaseMs);
    const current = await f.app.imports.claim();
    assert.ok(current);
    assert.notEqual(old.leaseToken, current.leaseToken);
    await f.app.imports.process(old);
    assert.equal(f.store.rows('people').length, 0);
    assert.equal(f.store.rows('jobs')[0]!.state, 'RUNNING');
    await f.app.imports.process(current);
    assert.equal(f.store.rows('people').length, 2);
});
test('concurrent claims have one owner', async () => {
    const f = await fixture();
    await enqueue(f);
    const claims = await Promise.all([f.app.imports.claim(), f.app.imports.claim(), f.app.imports.claim()]);
    assert.equal(claims.filter(Boolean).length, 1);
});
test('job audit failure cannot leave unaccounted person', async () => {
    const f = await fixture();
    await enqueue(f);
    const claim = await f.app.imports.claim();
    assert.ok(claim);
    f.store.failNextAudit = true;
    await f.app.imports.process(claim);
    assert.equal(f.store.rows('people').length, 0);
    assert.equal(f.store.rows('jobs')[0]!.state, 'FAILED');
    assert.equal(f.store.rows('imports')[0]!.rows[0]!.state, 'VALID');
});
test('import preview expiry is enforced at access boundary', async () => {
    const f = await fixture();
    const p = await preview(f);
    f.clock.advance(LIMITS.importMs);
    await f.owner.login();
    assert.equal((await f.owner.raw('GET', '/imports/' + p.id)).status, 404);
});
test('three abandoned leases exhaust retry budget', async () => {
    const f = await fixture();
    await enqueue(f);
    for (let i = 0; i < 3; i++) {
        assert.ok(await f.app.imports.claim());
        f.clock.advance(LIMITS.jobLeaseMs);
    }
    assert.equal(await f.app.imports.claim(), null);
    assert.equal(f.store.rows('jobs')[0]!.errorCode, 'ATTEMPTS_EXHAUSTED');
});
test('202 import receipt is ACCEPTED, never confused with job completion', async () => {
    const f = await fixture();
    const p = await preview(f);
    const r = await f.owner.cmd('POST', '/imports/' + p.id + '/commit', { expectedRevision: 1, selectedRows: [0] });
    assert.equal(r.status, 202);
    assert.equal(result(r).state, 'ACCEPTED');
    assert.equal(f.store.rows('jobs')[0]!.state, 'QUEUED');
    assert.equal(f.store.rows('people').length, 0);
});
test('an expired preview receipt cannot revive preview access even when source remains valid', async () => { const f = await fixture(); const s = await f.owner.cmd('POST', '/sources', sourceInput()); const key = randomUUID(); const input = { sourceId: result(s).resourceId, rows: [{ displayName: '过期预览', roles: ['model'] }] }; assert.equal((await f.owner.cmd('POST', '/imports/preview', input, key)).status, 201); f.clock.advance(LIMITS.importMs); await f.owner.login(); assert.equal((await f.owner.cmd('POST', '/imports/preview', input, key)).status, 404); assert.equal(f.store.rows('people').length, 0); });
