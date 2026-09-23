import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, member, createPerson, sourceInput, result } from '../support/fixtures.ts';
async function detail(f: Awaited<ReturnType<typeof fixture>>, id: string) { return result(await f.owner.raw('GET', '/people/' + id)); }
test('minimal talent journey: no media file, one identity and multiple roles', async () => {
    const f = await fixture();
    const id = await createPerson(f.owner);
    const p = await detail(f, id);
    assert.equal(p.displayName, '合成摄影师');
    assert.deepEqual(p.roles, ['photographer', 'editor']);
    assert.equal(p.heightCm, null);
    assert.equal(f.store.rows('sources').length, 1);
    assert.equal(f.store.rows('people').length, 1);
    assert.equal(p.source.status, 'CONFIRMED');
});
test('ordinary editor receives temporary self-only source, not permanent permission', async () => {
    const f = await fixture();
    const e = await member(f, 'editor');
    const id = await createPerson(e.client, '临时人才', true);
    assert.equal((await e.client.raw('GET', '/people/' + id)).status, 200);
    assert.equal((await f.owner.raw('GET', '/people/' + id)).status, 404);
    assert.equal(result(await f.owner.raw('GET', '/people')).total, 0);
    assert.equal((await e.client.cmd('POST', '/sources', sourceInput())).status, 403);
});
test('temporary source cannot exceed 7 days or use workspace scope', async () => {
    const f = await fixture();
    const scope = f.store.rows('scopes')[0]!;
    assert.equal((await f.owner.cmd('POST', '/sources', { ...sourceInput(true), validUntil: '2026-12-31T00:00:00.000Z' })).status, 422);
    assert.equal((await f.owner.cmd('POST', '/sources', { ...sourceInput(true), scopeId: scope.id })).status, 422);
});
test('expiry blocks person read and search without a worker', async () => {
    const f = await fixture();
    const id = await createPerson(f.owner, '过期资料', true);
    f.clock.advance(7 * 24 * 60 * 60000);
    await f.owner.login();
    assert.equal((await f.owner.raw('GET', '/people/' + id)).status, 404);
    assert.equal(result(await f.owner.raw('GET', '/people')).total, 0);
    const source = result(await f.owner.raw('GET', '/sources/' + f.store.rows('people')[0]!.sourceId));
    assert.equal(source.current, false);
    assert.equal(source.basisDescription, '');
});
test('suspension immediately blocks dependent person and replay', async () => {
    const f = await fixture();
    const key = randomUUID();
    const input = { displayName: '可撤回', roles: ['model'], inlineSource: sourceInput() };
    const created = await f.owner.cmd('POST', '/people', input, key);
    const source = f.store.rows('sources')[0]!;
    assert.equal((await f.owner.cmd('POST', '/sources/' + source.id + '/suspend', { expectedRevision: source.revision, reason: '测试主动暂停使用' })).status, 200);
    assert.equal((await f.owner.raw('GET', '/people/' + result(created).resourceId)).status, 404);
    assert.equal((await f.owner.cmd('POST', '/people', input, key)).status, 404);
});
test('source review requires current revision and does not automatically widen scope', async () => {
    const f = await fixture();
    const id = await createPerson(f.owner, '核验对象', true);
    const source = f.store.rows('sources')[0]!;
    const r = await f.owner.cmd('POST', '/sources/' + source.id + '/review', { expectedRevision: 1, basisDescription: '重新核对本人提供的资料', validUntil: '2026-12-31T00:00:00.000Z' });
    assert.equal(r.status, 200);
    assert.equal(f.store.rows('sources')[0]!.scopeId, source.scopeId);
    const viewer = await member(f, 'viewer', 'VIEWER');
    assert.equal((await viewer.client.raw('GET', '/people/' + id)).status, 404);
});
test('unknown source, simultaneous source inputs and missing source are rejected', async () => {
    const f = await fixture();
    for (const extra of [{}, { sourceId: randomUUID() }, { sourceId: randomUUID(), inlineSource: sourceInput() }]) {
        const r = await f.owner.cmd('POST', '/people', { displayName: '测试', roles: ['model'], ...extra });
        assert.ok([400, 404].includes(r.status));
    }
    assert.equal(f.store.rows('people').length, 0);
});
test('invalid dictionary code rolls back inline source and person together', async () => {
    const f = await fixture();
    const r = await f.owner.cmd('POST', '/people', { displayName: '测试', roles: ['does-not-exist'], inlineSource: sourceInput() });
    assert.equal(r.status, 422);
    assert.equal(f.store.rows('sources').length, 0);
    assert.equal(f.store.rows('people').length, 0);
});
test('duplicate role is rejected, not silently multiplied', async () => {
    const f = await fixture();
    assert.equal((await f.owner.cmd('POST', '/people', { displayName: '测试', roles: ['model', 'model'], inlineSource: sourceInput() })).status, 400);
});
test('same-name people remain separate identities', async () => {
    const f = await fixture();
    const a = await createPerson(f.owner, '同名');
    const b = await createPerson(f.owner, '同名');
    assert.notEqual(a, b);
    assert.equal(result(await f.owner.raw('GET', '/people?q=同名')).total, 2);
});
test('partial update preserves omitted fields and can explicitly clear optional height', async () => {
    const f = await fixture();
    const id = await createPerson(f.owner);
    await f.owner.cmd('PATCH', '/people/' + id, { expectedRevision: 1, heightCm: 168, intro: '简介' });
    const r = await f.owner.cmd('PATCH', '/people/' + id, { expectedRevision: 2, heightCm: null });
    assert.equal(r.status, 200);
    const p = await detail(f, id);
    assert.equal(p.intro, '简介');
    assert.deepEqual(p.roles, ['photographer', 'editor']);
    assert.equal(p.heightCm, null);
});
test('CAS conflict rejects stale write and empty patch', async () => {
    const f = await fixture();
    const id = await createPerson(f.owner);
    await f.owner.cmd('PATCH', '/people/' + id, { expectedRevision: 1, intro: '已更新' });
    assert.equal((await f.owner.cmd('PATCH', '/people/' + id, { expectedRevision: 1, intro: '旧表单' })).status, 409);
    assert.equal((await f.owner.cmd('PATCH', '/people/' + id, { expectedRevision: 2 })).status, 400);
    assert.equal((await detail(f, id)).intro, '已更新');
});
test('contacts stored encrypted, never included in person or generic receipt', async () => {
    const f = await fixture();
    const id = await createPerson(f.owner);
    const p = await detail(f, id);
    const secret = 'synthetic-contact@example.invalid';
    const r = await f.owner.cmd('PUT', '/people/' + id + '/contacts', { expectedRevision: 1, contacts: [{ kind: 'EMAIL', value: secret, sourceId: p.sourceId }] });
    assert.equal(r.status, 200);
    assert.ok(!JSON.stringify(f.store.rows('contacts')).includes(secret));
    assert.ok(!JSON.stringify(f.store.rows('receipts')).includes(secret));
    assert.ok(!JSON.stringify(await detail(f, id)).includes(secret));
    assert.equal(result(await f.owner.raw('GET', '/people/' + id + '/contacts')).items[0].value, secret);
    assert.ok(f.store.rows('audits').some(a => a.action === 'contact.read'));
    assert.ok(!JSON.stringify(f.store.rows('audits')).includes(secret));
});
test('ordinary editor can edit profile but cannot read or replace contacts', async () => {
    const f = await fixture();
    const id = await createPerson(f.owner);
    const e = await member(f, 'editor');
    assert.equal((await e.client.raw('GET', '/people/' + id)).status, 200);
    assert.equal((await e.client.raw('GET', '/people/' + id + '/contacts')).status, 403);
    assert.equal((await e.client.cmd('PUT', '/people/' + id + '/contacts', { expectedRevision: 1, contacts: [] })).status, 403);
});
test('sensitive text is absent from list and requires explicit read/write permission', async () => {
    const f = await fixture();
    const secret = 'synthetic private source text';
    const s = await f.owner.cmd('POST', '/sources', { ...sourceInput(), type: 'TEXT', textPayload: secret });
    const id = result(s).resourceId;
    assert.ok(!JSON.stringify(result(await f.owner.raw('GET', '/sources'))).includes(secret));
    const e = await member(f, 'editor');
    const dto = result(await e.client.raw('GET', '/sources/' + id));
    assert.equal(dto.textPayload, undefined);
    assert.equal(dto.textRestricted, true);
    assert.equal((await e.client.cmd('PATCH', '/sources/' + id, { expectedRevision: 1, textPayload: 'overwrite' })).status, 403);
    assert.equal(result(await f.owner.raw('GET', '/sources/' + id)).textPayload, secret);
});
test('field evidence binds exact value and becomes stale when value changes', async () => {
    const f = await fixture();
    const id = await createPerson(f.owner);
    const p = await detail(f, id);
    const r = await f.owner.cmd('POST', '/field-evidence', { personId: id, expectedRevision: 1, fieldPath: 'displayName', sourceId: p.sourceId, sourceRevision: 1 });
    assert.equal(r.status, 200);
    assert.equal((await detail(f, id)).evidence[0].state, 'VERIFIED');
    await f.owner.cmd('PATCH', '/people/' + id, { expectedRevision: 2, displayName: '名字已更新' });
    assert.equal((await detail(f, id)).evidence[0].state, 'STALE');
});
test('evidence also becomes stale after source text revision changes', async () => {
    const f = await fixture();
    const id = await createPerson(f.owner);
    const p = await detail(f, id);
    await f.owner.cmd('POST', '/field-evidence', { personId: id, expectedRevision: 1, fieldPath: 'roles', sourceId: p.sourceId, sourceRevision: 1 });
    await f.owner.cmd('PATCH', '/sources/' + p.sourceId, { expectedRevision: 1, title: '来源更正' });
    assert.equal((await detail(f, id)).evidence[0].state, 'STALE');
});
test('inactive dictionary retains old references but rejects new use', async () => {
    const f = await fixture();
    const id = await createPerson(f.owner);
    const code = f.store.rows('dictionary').find(d => d.namespace === 'role' && d.code === 'editor')!;
    await f.owner.cmd('PATCH', '/catalog/items/' + code.id, { expectedRevision: 1, status: 'INACTIVE' });
    assert.equal((await f.owner.cmd('PATCH', '/people/' + id, { expectedRevision: 1, roles: ['photographer', 'editor'], intro: '保留旧角色' })).status, 200);
    assert.equal((await f.owner.cmd('POST', '/people', { displayName: '新人', roles: ['editor'], inlineSource: sourceInput() })).status, 422);
});
test('catalog cannot mutate stable code, duplicate namespace+code denied', async () => {
    const f = await fixture();
    const code = f.store.rows('dictionary')[0]!;
    assert.equal((await f.owner.cmd('PATCH', '/catalog/items/' + code.id, { expectedRevision: 1, code: 'another' })).status, 400);
    assert.equal((await f.owner.cmd('POST', '/catalog/items', { namespace: code.namespace, code: code.code, labelZh: '重复', labelEn: 'Duplicate' })).status, 409);
});
test('scope shrink hides detail, rows and count from other members', async () => {
    const f = await fixture();
    const id = await createPerson(f.owner);
    const e = await member(f, 'editor');
    const scope = await f.owner.cmd('POST', '/scopes', { name: '仅管理员可见', membershipIds: [f.membershipId] });
    await f.owner.cmd('PATCH', '/records/person/' + id + '/scope', { expectedRevision: 1, scopeId: result(scope).resourceId });
    assert.equal((await e.client.raw('GET', '/people/' + id)).status, 404);
    assert.equal(result(await e.client.raw('GET', '/people')).total, 0);
});
test('source and person scopes intersect, never union', async () => {
    const f = await fixture();
    const e = await member(f, 'editor');
    const id = await createPerson(f.owner);
    const source = f.store.rows('sources')[0]!;
    const scope = await f.owner.cmd('POST', '/scopes', { name: '来源限定', membershipIds: [f.membershipId] });
    await f.owner.cmd('PATCH', '/records/source/' + source.id + '/scope', { expectedRevision: 1, scopeId: result(scope).resourceId });
    assert.equal((await e.client.raw('GET', '/people/' + id)).status, 404);
    assert.equal((await f.owner.raw('GET', '/people/' + id)).status, 200);
});
test('inaccessible source cannot be smuggled into new profile', async () => {
    const f = await fixture();
    const id = await createPerson(f.owner, '私有', true);
    const source = f.store.rows('people').find(p => p.id === id)!.sourceId;
    const e = await member(f, 'editor');
    assert.equal((await e.client.cmd('POST', '/people', { displayName: '试图绑定', roles: ['model'], sourceId: source })).status, 404);
});
test('pagination caps, duplicate filters and malformed URI reject', async () => {
    const f = await fixture();
    for (const path of ['/people?pageSize=101', '/people?page=0', '/people?page=one', '/people?scopeId=x', '/people?q=a&q=b', '/people/%E0%A4%A'])
        assert.equal((await f.owner.raw('GET', path)).status, 400, path);
});
test('contact ciphertext cannot be transplanted between people', async () => {
    const f = await fixture();
    const a = await createPerson(f.owner, 'A');
    const b = await createPerson(f.owner, 'B');
    for (const id of [a, b])
        await f.owner.cmd('PUT', '/people/' + id + '/contacts', { expectedRevision: 1, contacts: [{ kind: 'EMAIL', value: id + '@example.invalid', sourceId: (await detail(f, id)).sourceId }] });
    await f.store.transaction(async (tx) => { const rows = await tx.find('contacts'); await tx.replace('contacts', { ...rows[1]!, ciphertext: rows[0]!.ciphertext }); });
    assert.equal((await f.owner.raw('GET', '/people/' + b + '/contacts')).status, 503);
});
test('later field confirmation does not overwrite previous confirmation evidence', async () => {
    const f = await fixture();
    const id = await createPerson(f.owner);
    const p = await detail(f, id);
    await f.owner.cmd('POST', '/field-evidence', { personId: id, expectedRevision: 1, fieldPath: 'displayName', sourceId: p.sourceId, sourceRevision: 1 });
    await f.owner.cmd('PATCH', '/people/' + id, { expectedRevision: 2, displayName: '确认的新名' });
    await f.owner.cmd('POST', '/field-evidence', { personId: id, expectedRevision: 3, fieldPath: 'displayName', sourceId: p.sourceId, sourceRevision: 1 });
    assert.equal(f.store.rows('evidence').length, 2);
    assert.deepEqual((await detail(f, id)).evidence.map((e: any) => e.state), ['STALE', 'VERIFIED']);
});
test('editor and reviewer complete internal review through an explicitly assigned restricted scope', async () => {
    const f = await fixture();
    const editor = await member(f, 'scope-editor');
    const reviewer = await member(f, 'scope-reviewer', 'REVIEWER');
    const s = await f.owner.cmd('POST', '/scopes', { name: '资料初审', membershipIds: [f.membershipId, editor.id, reviewer.id] });
    const created = await editor.client.cmd('POST', '/people', { displayName: '待核验人才', roles: ['model'], inlineSource: { ...sourceInput(true), scopeId: result(s).resourceId } });
    assert.equal(created.status, 201);
    const person = result(await reviewer.client.raw('GET', '/people/' + result(created).resourceId));
    assert.equal((await reviewer.client.cmd('POST', '/sources/' + person.sourceId + '/review', { expectedRevision: 1, basisDescription: '合成来源已人工核验内部使用', validUntil: '2026-12-31T00:00:00.000Z' })).status, 200);
    assert.equal(result(await editor.client.raw('GET', '/people/' + person.id)).source.basisMode, 'INTERNAL_USE');
});
