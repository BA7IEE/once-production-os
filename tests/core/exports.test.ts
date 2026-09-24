/** DEV-07A internal JSON export and dependency safety. MemoryStore only; PostgreSQL constraints are separate. */
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
async function permission(f: F, kind: 'SOURCE' | 'PERSON' | 'WORK' | 'PROJECT' | 'ASSET', id: string, sourceId: string, fields: string[]) {
    const r = await ok(f.owner.cmd('POST', '/use-permissions', {
        sourceId, subjectKind: kind, subjectId: id, fields,
        validUntil: '2026-10-15T00:00:00.000Z',
        evidenceNote: '合成测试：明确批准本次内部JSON导出字段'
    }), 201);
    return r.resourceId as string;
}
async function exportJob(f: F, body: Record<string, unknown>, c = f.owner) {
    const r = await ok(c.cmd('POST', '/exports', body), 202);
    return r.resourceId as string;
}
async function runExport(f: F, id: string) {
    const claim = await f.app.exports.claim();
    assert.ok(claim);
    assert.equal(claim.id, id);
    await f.app.exports.process(claim);
    return get(f.owner, '/exports/' + id);
}

test('DEV-07A export needs explicit action permission and deployment egress gate', async () => {
    const f = await fixture(), editor = await member(f, 'export_no_permission', 'EDITOR');
    const body = { format: 'JSON', selectedIds: { people: [randomUUID()], works: [], projects: [] },
        fields: ['person.displayName'], usePermissionRefs: [randomUUID()] };
    assert.equal((await editor.client.cmd('POST', '/exports', body)).status, 403);
    f.app.config.dataEgressMode = 'DISABLED';
    const disabled = await f.owner.cmd('POST', '/exports', body);
    assert.equal(disabled.status, 503);
    assert.equal(result(disabled).error.code, 'EGRESS_DISABLED');
    assert.equal(f.store.rows('exports').length, 0);
});

test('DEV-07A export-only member can read minimal permission summaries without gaining source-read access', async () => {
    const f = await fixture(), personId = await createPerson(f.owner, '最小许可摘要');
    const person = f.store.rows('people').find(x => x.id === personId)!;
    const permit = await permission(f, 'PERSON', personId, person.sourceId, ['person.displayName']);
    const viewer = await member(f, 'export_only_viewer', 'VIEWER', ['data.export']);
    assert.equal((await viewer.client.raw('GET', '/sources')).status, 403);
    const list = await ok(viewer.client.raw('GET', '/use-permissions?pageSize=100'));
    assert.ok(list.items.some((x: any) => x.id === permit && x.subjectId === personId));
    assert.ok(!JSON.stringify(list).includes('evidenceNote'));
});

test('DEV-07A TEMP_ORGANIZE never becomes INTERNAL_EXPORT permission', async () => {
    const f = await fixture(), pid = await createPerson(f.owner, '临时整理候选', true);
    const person = f.store.rows('people').find(x => x.id === pid)!;
    const response = await f.owner.cmd('POST', '/use-permissions', {
        sourceId: person.sourceId, subjectKind: 'PERSON', subjectId: pid, fields: ['person.displayName'],
        validUntil: new Date(f.clock.now().getTime() + 3600000).toISOString(),
        evidenceNote: '合成测试：不应把临时整理变成导出许可'
    });
    assert.equal(response.status, 422);
    assert.equal(f.store.rows('usePermissions').length, 0);
});

test('DEV-07A frozen JSON excludes unselected/sensitive fields and survives ordinary content edits', async () => {
    const f = await fixture();
    const sourceId = (await ok(f.owner.cmd('POST', '/sources', { ...sourceInput(), textPayload: 'PRIVATE_SOURCE_TEXT_SHOULD_NOT_EXPORT' }), 201)).resourceId as string;
    const personId = (await ok(f.owner.cmd('POST', '/people', {
        displayName: '导出候选甲', roles: ['model'], cityCode: 'shenzhen', intro: '原始简介', sourceId
    }), 201)).resourceId as string;
    let person = await get(f.owner, '/people/' + personId);
    await ok(f.owner.cmd('PUT', '/people/' + personId + '/contacts', { expectedRevision: person.revision,
        contacts: [{ kind: 'PHONE', value: '13800138000', sourceId }] }));
    person = await get(f.owner, '/people/' + personId);
    const permit = await permission(f, 'PERSON', personId, sourceId, ['person.displayName', 'person.cityCode']);
    const id = await exportJob(f, { format: 'JSON', selectedIds: { people: [personId], works: [], projects: [] },
        fields: ['person.displayName', 'person.cityCode'], usePermissionRefs: [permit] });
    let state = await runExport(f, id);
    assert.equal(state.effectiveState, 'READY');
    const first = await ok(f.owner.raw('POST', '/exports/' + id + '/download', {}));
    const encoded = JSON.stringify(first.payload);
    assert.ok(encoded.includes('导出候选甲'));
    assert.ok(!encoded.includes('原始简介'));
    assert.ok(!encoded.includes('13800138000'));
    assert.ok(!encoded.includes('PRIVATE_SOURCE_TEXT_SHOULD_NOT_EXPORT'));
    assert.ok(!encoded.includes('passwordHash'));
    assert.ok(!encoded.includes('textPayload'));
    assert.ok(!encoded.includes('objectToken'));

    await ok(f.owner.cmd('PATCH', '/people/' + personId, { expectedRevision: person.revision, displayName: '导出候选甲·后来改名' }));
    state = await get(f.owner, '/exports/' + id);
    assert.equal(state.effectiveState, 'READY');
    assert.equal(state.contentChanged, true);
    const second = await ok(f.owner.raw('POST', '/exports/' + id + '/download', {}));
    assert.ok(JSON.stringify(second.payload).includes('导出候选甲'));
    assert.ok(!JSON.stringify(second.payload).includes('导出候选甲·后来改名'));
    f.app.config.dataEgressMode = 'DISABLED';
    state = await get(f.owner, '/exports/' + id);
    assert.equal(state.effectiveState, 'READY');
    assert.equal(state.downloadable, false);
    assert.equal(state.blockedReason, 'EGRESS_DISABLED');
    assert.equal((await f.owner.raw('POST', '/exports/' + id + '/download', {})).status, 503);
});

test('DEV-07A source suspension invalidates the entire old export download', async () => {
    const f = await fixture(), personId = await createPerson(f.owner, '来源失效导出');
    const person = f.store.rows('people').find(x => x.id === personId)!;
    const permit = await permission(f, 'PERSON', personId, person.sourceId, ['person.displayName']);
    const id = await exportJob(f, { format: 'JSON', selectedIds: { people: [personId], works: [], projects: [] },
        fields: ['person.displayName'], usePermissionRefs: [permit] });
    await runExport(f, id);
    const source = f.store.rows('sources').find(x => x.id === person.sourceId)!;
    await ok(f.owner.cmd('POST', '/sources/' + source.id + '/suspend', { expectedRevision: source.revision, reason: '合成测试停止导出依据' }));
    const state = await get(f.owner, '/exports/' + id);
    assert.equal(state.effectiveState, 'STALE');
    assert.equal(state.downloadable, false);
    assert.equal((await f.owner.raw('POST', '/exports/' + id + '/download', {})).status, 409);
});

test('DEV-07A permission revocation invalidates old export and same-key create replay cannot bypass it', async () => {
    const f = await fixture(), personId = await createPerson(f.owner, '许可撤销导出');
    const person = f.store.rows('people').find(x => x.id === personId)!;
    const permit = await permission(f, 'PERSON', personId, person.sourceId, ['person.displayName']);
    const key = randomUUID();
    const body = { format: 'JSON', selectedIds: { people: [personId], works: [], projects: [] },
        fields: ['person.displayName'], usePermissionRefs: [permit] };
    const created = await ok(f.owner.cmd('POST', '/exports', body, key), 202), id = created.resourceId as string;
    await runExport(f, id);
    const p = f.store.rows('usePermissions').find(x => x.id === permit)!;
    await ok(f.owner.cmd('POST', '/use-permissions/' + permit + '/revoke', { expectedRevision: p.revision }));
    assert.equal((await f.owner.raw('POST', '/exports/' + id + '/download', {})).status, 409);
    assert.equal((await f.owner.cmd('POST', '/exports', body, key)).status, 404);
});

test('DEV-07A relations export only when both selected endpoints are explicitly included', async () => {
    const f = await fixture(), personId = await createPerson(f.owner, '关系导出人才');
    const person = f.store.rows('people').find(x => x.id === personId)!;
    const workId = (await ok(f.owner.cmd('POST', '/works', { title: '关系导出作品', inlineSource: sourceInput() }), 201)).resourceId as string;
    const work = f.store.rows('works').find(x => x.id === workId)!;
    await ok(f.owner.cmd('POST', '/works/' + workId + '/credits', { expectedRevision: 1, personId, roleCode: 'photographer', note: '不应进入关系导出正文' }));
    const personPermit = await permission(f, 'PERSON', personId, person.sourceId, ['person.displayName']);
    const workPermit = await permission(f, 'WORK', workId, work.sourceId, ['work.title', 'work.relations']);

    const onlyWork = await exportJob(f, { format: 'JSON', selectedIds: { people: [], works: [workId], projects: [] },
        fields: ['work.title', 'work.relations'], usePermissionRefs: [workPermit] });
    await runExport(f, onlyWork);
    const a = await ok(f.owner.raw('POST', '/exports/' + onlyWork + '/download', {}));
    assert.deepEqual(a.payload.manifest.relations.workCredits, []);

    const together = await exportJob(f, { format: 'JSON', selectedIds: { people: [personId], works: [workId], projects: [] },
        fields: ['person.displayName', 'work.title', 'work.relations'], usePermissionRefs: [personPermit, workPermit] });
    await runExport(f, together);
    const b = await ok(f.owner.raw('POST', '/exports/' + together + '/download', {}));
    assert.deepEqual(b.payload.manifest.relations.workCredits, [{ workId, personId, roleCode: 'photographer' }]);
    assert.ok(!JSON.stringify(b.payload).includes('不应进入关系导出正文'));
});
