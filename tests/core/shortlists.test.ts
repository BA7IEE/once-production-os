/** DEV-06 internal search/shortlist regression. MemoryStore only; PostgreSQL FK coverage is separate. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, member, createPerson, sourceInput, result, Client } from '../support/fixtures.ts';

type F = Awaited<ReturnType<typeof fixture>>;
async function ok(p: ReturnType<Client['raw']>, status = 200) {
    const r = await p;
    assert.equal(r.status, status, JSON.stringify(r.body));
    return result(r);
}
async function get(c: Client, path: string) { return ok(c.raw('GET', path)); }
function workspaceScope(f: F) { return f.store.rows('scopes').find(s => s.mode === 'WORKSPACE')!.id; }
async function person(f: F, name: string, extra: Record<string, unknown> = {}) {
    const id = (await ok(f.owner.cmd('POST', '/people', { displayName: name, roles: ['model'], cityCode: 'shenzhen',
        languageCodes: ['en'], skillCodes: ['fashion'], inlineSource: sourceInput(), ...extra }), 201)).resourceId as string;
    const d = await get(f.owner, '/people/' + id);
    await ok(f.owner.cmd('PATCH', '/people/' + id, { expectedRevision: d.revision, status: 'ACTIVE' }));
    return id;
}
async function shortlist(f: F, c = f.owner, title = '合成候选清单') {
    return (await ok(c.cmd('POST', '/shortlists', { title, brief: '只用于内部合成测试', scopeId: workspaceScope(f) }), 201)).resourceId as string;
}
async function add(c: Client, listId: string, personId: string, more: Record<string, unknown> = {}) {
    const d = await get(c, '/shortlists/' + listId);
    return ok(c.cmd('POST', '/shortlists/' + listId + '/items', { expectedRevision: d.revision, personId,
        workAssetIds: [], note: 'PRIVATE_SHORTLIST_NOTE', ...more }));
}

test('DEV-06 structured search combines deterministic facts and visible ACTUAL participation without scores', async () => {
    const f = await fixture();
    const a = await person(f, '候选甲');
    await person(f, '候选乙', { cityCode: 'guangzhou', skillCodes: ['commercial'] });
    const projectId = (await ok(f.owner.cmd('POST', '/projects', { title: '合成实际项目', inlineSource: sourceInput() }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/projects/' + projectId + '/participants', {
        expectedRevision: 1, personId: a, roleCode: 'model', state: 'ACTUAL', note: '合成测试：实际完成模特拍摄'
    }));
    const q = await get(f.owner, '/talent-search?role=model&cityCode=shenzhen&languageCode=en&skillCode=fashion&status=ACTIVE&actualProject=true');
    assert.equal(q.total, 1);
    assert.equal(q.items[0].id, a);
    assert.equal(q.items[0].actualProjectCount, 1);
    assert.ok(q.items[0].match.some((m: any) => m.field === 'actualProject'));
    assert.equal('score' in q.items[0], false);
    assert.deepEqual(q.capabilities.unsupported, ['quote', 'availability']);
    assert.equal((await f.owner.raw('GET', '/talent-search?quote=1000')).status, 400);
});

test('DEV-06 industry and work type come only from current visible credited works', async () => {
    const f = await fixture();
    for (const item of [
        { namespace: 'industry', code: 'furniture', labelZh: '家具', labelEn: 'Furniture' },
        { namespace: 'workType', code: 'product_photo', labelZh: '产品摄影', labelEn: 'Product photography' }
    ])
        await ok(f.owner.cmd('POST', '/catalog/items', item), 201);
    const visiblePerson = await person(f, '可见作品候选');
    const hiddenFactPerson = await person(f, '隐藏作品候选');
    const visibleWork = (await ok(f.owner.cmd('POST', '/works', { title: '可见家具作品', industryCode: 'furniture',
        workTypeCodes: ['product_photo'], inlineSource: sourceInput() }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/works/' + visibleWork + '/credits', { expectedRevision: 1, personId: visiblePerson, roleCode: 'model', note: '合成署名' }));
    const editor = await member(f, 'fact_editor');
    const hiddenWork = (await ok(editor.client.cmd('POST', '/works', { title: '私有家具作品', industryCode: 'furniture',
        workTypeCodes: ['product_photo'], inlineSource: sourceInput(true) }), 201)).resourceId as string;
    await ok(editor.client.cmd('POST', '/works/' + hiddenWork + '/credits', { expectedRevision: 1, personId: hiddenFactPerson, roleCode: 'model', note: '私有合成署名' }));
    let q = await get(f.owner, '/talent-search?industryCode=furniture&workTypeCode=product_photo&status=ACTIVE');
    assert.equal(q.total, 1);
    assert.equal(q.items[0].id, visiblePerson);
    assert.deepEqual(q.items[0].industryCodes, ['furniture']);
    assert.deepEqual(q.items[0].workTypeCodes, ['product_photo']);
    assert.ok(q.items[0].match.some((m: any) => m.field === 'industryCode'));
    assert.ok(q.items[0].match.some((m: any) => m.field === 'workTypeCode'));
    assert.deepEqual(q.facets.industries, [{ code: 'furniture', count: 1 }]);
    assert.deepEqual(q.facets.workTypes, [{ code: 'product_photo', count: 1 }]);
    const source = f.store.rows('sources').find(s => s.id === f.store.rows('works').find(w => w.id === visibleWork)!.sourceId)!;
    await ok(f.owner.cmd('POST', '/sources/' + source.id + '/suspend', { expectedRevision: source.revision, reason: '合成测试停止作品依据' }));
    q = await get(f.owner, '/talent-search?industryCode=furniture&workTypeCode=product_photo&status=ACTIVE');
    assert.equal(q.total, 0);
});

test('DEV-06 verification freshness uses current field evidence and never treats unknown as a match', async () => {
    const f = await fixture(), id = await person(f, '核验候选');
    let d = await get(f.owner, '/people/' + id);
    await ok(f.owner.cmd('POST', '/field-evidence', { personId: id, expectedRevision: d.revision, fieldPath: 'cityCode',
        sourceId: d.sourceId, sourceRevision: d.source.revision }));
    let q = await get(f.owner, '/talent-search?verifiedWithinDays=30&status=ACTIVE');
    assert.equal(q.total, 1);
    assert.equal(q.items[0].verification.state, 'CURRENT');
    f.clock.advance(31 * 86400000);
    assert.equal((await f.owner.login()).status, 200, 'session expiry remains enforced after advancing 31 days');
    q = await get(f.owner, '/talent-search?verifiedWithinDays=30&status=ACTIVE');
    assert.equal(q.total, 0);
});

test('DEV-06 shortlist is CAS-owned, supports notes/order and rejects wrong-parent child IDs', async () => {
    const f = await fixture(), p1 = await person(f, '清单甲'), p2 = await person(f, '清单乙');
    const a = await shortlist(f, f.owner, 'A'), b = await shortlist(f, f.owner, 'B');
    await add(f.owner, a, p1);
    await add(f.owner, a, p2, { note: 'SECOND_NOTE' });
    const d = await get(f.owner, '/shortlists/' + a), ids = d.items.map((x: any) => x.id);
    assert.equal(d.revision, 3);
    assert.equal((await f.owner.cmd('POST', '/shortlists/' + b + '/items/update', { expectedRevision: 1, entryId: ids[0], note: 'wrong parent' })).status, 404);
    assert.equal((await f.owner.cmd('POST', '/shortlists/' + a + '/items/update', { expectedRevision: 2, entryId: ids[0], note: 'stale' })).status, 409);
    await ok(f.owner.cmd('POST', '/shortlists/' + a + '/items/reorder', { expectedRevision: 3, entryIds: ids.slice().reverse() }));
    const after = await get(f.owner, '/shortlists/' + a);
    assert.deepEqual(after.items.map((x: any) => x.id), ids.slice().reverse());
    assert.equal(after.items[0].note, 'SECOND_NOTE');
});

test('DEV-06 shortlist work must actually credit the candidate and changed facts are flagged', async () => {
    const f = await fixture(), pid = await person(f, '作品候选'), listId = await shortlist(f);
    const credited = (await ok(f.owner.cmd('POST', '/works', { title: '本人署名作品', inlineSource: sourceInput() }), 201)).resourceId as string;
    const unrelated = (await ok(f.owner.cmd('POST', '/works', { title: '无关作品', inlineSource: sourceInput() }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/works/' + credited + '/credits', { expectedRevision: 1, personId: pid, roleCode: 'model', note: '合成署名' }));
    await add(f.owner, listId, pid, { workId: credited });
    let d = await get(f.owner, '/shortlists/' + listId);
    assert.equal(d.items[0].work.id, credited);
    const pd = await get(f.owner, '/people/' + pid);
    await ok(f.owner.cmd('PATCH', '/people/' + pid, { expectedRevision: pd.revision, intro: '档案发生变化' }));
    d = await get(f.owner, '/shortlists/' + listId);
    assert.equal(d.items[0].updatedSinceAdded, true);
    assert.equal((await f.owner.cmd('POST', '/shortlists/' + listId + '/items', { expectedRevision: d.revision, personId: pid,
        workId: unrelated, workAssetIds: [], note: '' })).status, 422);
});

test('DEV-06 source loss redacts the whole shortlist item but list-authorized member can remove placeholder', async () => {
    const f = await fixture(), pid = await person(f, '需要隐藏的人才'), listId = await shortlist(f);
    await add(f.owner, listId, pid);
    const before = await get(f.owner, '/shortlists/' + listId), entryId = before.items[0].id;
    const source = f.store.rows('sources').find(s => s.id === f.store.rows('people').find(p => p.id === pid)!.sourceId)!;
    await ok(f.owner.cmd('POST', '/sources/' + source.id + '/suspend', { expectedRevision: source.revision, reason: '合成测试停止使用' }));
    const hidden = await get(f.owner, '/shortlists/' + listId);
    assert.deepEqual(hidden.items[0], { id: entryId, position: 0, unavailable: true });
    for (const secret of [pid, '需要隐藏的人才', 'PRIVATE_SHORTLIST_NOTE'])
        assert.ok(!JSON.stringify(hidden).includes(secret));
    await ok(f.owner.cmd('POST', '/shortlists/' + listId + '/items/remove', { expectedRevision: hidden.revision, entryId }));
    assert.equal((await get(f.owner, '/shortlists/' + listId)).items.length, 0);
});

test('DEV-06 H1 profile handoff never expands into candidate search or shortlist association', async () => {
    const f = await fixture(), sender = await member(f, 'shortlist_sender');
    const pid = await createPerson(sender.client, '交接可看但不可候选', true);
    const p = f.store.rows('people').find(x => x.id === pid)!, s = f.store.rows('sources').find(x => x.id === p.sourceId)!;
    const listId = await shortlist(f, sender.client, '共享根清单');
    await add(sender.client, listId, pid);
    const offer = await ok(sender.client.cmd('POST', '/people/' + pid + '/handoffs', { recipientId: f.membershipId, purpose: 'EDIT',
        expectedRevision: p.revision, expectedSourceRevision: s.revision, expiresAt: new Date(f.clock.now().getTime() + 3600000).toISOString(),
        acknowledgeLimitedAccess: true }), 201);
    await ok(f.owner.cmd('POST', '/handoffs/' + offer.resourceId + '/accept', { expectedRevision: 1 }));
    assert.equal((await f.owner.raw('GET', '/people/' + pid)).status, 200);
    assert.equal((await get(f.owner, '/talent-search?q=' + encodeURIComponent('交接可看但不可候选'))).total, 0);
    const view = await get(f.owner, '/shortlists/' + listId);
    assert.equal(view.items[0].unavailable, true);
    assert.ok(!JSON.stringify(view).includes(pid));
    const own = await shortlist(f, f.owner, '接收人自己的清单');
    assert.equal((await f.owner.cmd('POST', '/shortlists/' + own + '/items', { expectedRevision: 1, personId: pid, workAssetIds: [], note: '' })).status, 404);
});
