/** DEV-07 deletion-impact preview. Read-only planning only; no records are erased here. */
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
async function impact(c: Client, kind: string, id: string) {
    return ok(c.raw('GET', '/maintenance/deletion-impact?kind=' + encodeURIComponent(kind) + '&id=' + encodeURIComponent(id)));
}
function workspaceScope(f: F) { return f.store.rows('scopes').find(s => s.mode === 'WORKSPACE')!.id; }

test('DEV-07 person impact reports visible work/project/shortlist dependencies without deleting anything', async () => {
    const f = await fixture(), pid = await createPerson(f.owner, '影响预览人才');
    const workId = (await ok(f.owner.cmd('POST', '/works', { title: '影响预览作品', inlineSource: sourceInput() }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/works/' + workId + '/credits', { expectedRevision: 1, personId: pid, roleCode: 'photographer', note: '合成贡献' }));
    const projectId = (await ok(f.owner.cmd('POST', '/projects', { title: '影响预览项目', inlineSource: sourceInput() }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/projects/' + projectId + '/participants', { expectedRevision: 1, personId: pid, roleCode: 'photographer', state: 'ACTUAL', note: '合成实际参与' }));
    const shortlistId = (await ok(f.owner.cmd('POST', '/shortlists', { title: '影响预览清单', brief: '', scopeId: workspaceScope(f) }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/shortlists/' + shortlistId + '/items', { expectedRevision: 1, personId: pid, workAssetIds: [], note: '' }));

    const before = {
        people: f.store.rows('people').length, works: f.store.rows('works').length, projects: f.store.rows('projects').length,
        shortlists: f.store.rows('shortlists').length, credits: f.store.rows('workCredits').length, participants: f.store.rows('projectParticipants').length
    };
    const view = await impact(f.owner, 'person', pid);
    assert.equal(view.target.id, pid);
    assert.equal(view.impactComplete, true);
    assert.equal(view.hasHiddenDependencies, false);
    assert.equal(view.deletionImplemented, false);
    assert.equal(view.retainedSystemHistory, true);
    assert.ok(view.visibleDependencies.some((x: any) => x.relation === 'workCredit' && x.resource.id === workId));
    assert.ok(view.visibleDependencies.some((x: any) => x.relation === 'projectParticipant' && x.resource.id === projectId));
    assert.ok(view.visibleDependencies.some((x: any) => x.relation === 'shortlistItem' && x.resource.id === shortlistId));
    assert.deepEqual({
        people: f.store.rows('people').length, works: f.store.rows('works').length, projects: f.store.rows('projects').length,
        shortlists: f.store.rows('shortlists').length, credits: f.store.rows('workCredits').length, participants: f.store.rows('projectParticipants').length
    }, before);
    assert.ok(f.store.rows('audits').some(a => a.action === 'maintenance.impact-read' && a.resourceId === pid));
});

test('DEV-07 hidden dependency blocks a complete plan without leaking its kind, id, title or count', async () => {
    const f = await fixture(), pid = await createPerson(f.owner, '公开目标人才'), editor = await member(f, 'impact_editor');
    const privateWorkId = (await ok(editor.client.cmd('POST', '/works', { title: 'HIDDEN_WORK_TITLE', inlineSource: sourceInput(true) }), 201)).resourceId as string;
    await ok(editor.client.cmd('POST', '/works/' + privateWorkId + '/credits', { expectedRevision: 1, personId: pid, roleCode: 'photographer', note: 'PRIVATE_RELATION_NOTE' }));
    const view = await impact(f.owner, 'person', pid);
    assert.equal(view.hasHiddenDependencies, true);
    assert.equal(view.impactComplete, false);
    const serialized = JSON.stringify(view);
    for (const secret of [privateWorkId, 'HIDDEN_WORK_TITLE', 'PRIVATE_RELATION_NOTE', 'workCredit'])
        assert.ok(!serialized.includes(secret), 'hidden dependency leaked: ' + secret);
    assert.match(view.note, /无法完整检查/);
});

test('DEV-07 suspended sources and their blocked dependants remain inspectable for authorized cleanup planning', async () => {
    const f = await fixture(), pid = await createPerson(f.owner, '待清理人才');
    const person = f.store.rows('people').find(p => p.id === pid)!;
    const source = f.store.rows('sources').find(s => s.id === person.sourceId)!;
    await ok(f.owner.cmd('POST', '/sources/' + source.id + '/suspend', { expectedRevision: source.revision, reason: '合成测试准备清理' }));
    assert.equal((await f.owner.raw('GET', '/people/' + pid)).status, 404, 'normal fresh read stays blocked');
    const personImpact = await impact(f.owner, 'person', pid);
    assert.equal(personImpact.target.id, pid);
    assert.equal(personImpact.target.state, 'DRAFT');
    const sourceImpact = await impact(f.owner, 'source', source.id);
    assert.equal(sourceImpact.target.id, source.id);
    assert.ok(sourceImpact.visibleDependencies.some((x: any) => x.relation === 'person' && x.resource.id === pid));
});

test('DEV-07 source impact requires review authority and H1 delegation never grants maintenance scope', async () => {
    const f = await fixture(), editor = await member(f, 'impact_source_editor');
    const sourceId = (await ok(editor.client.cmd('POST', '/sources', sourceInput(true)), 201)).resourceId as string;
    assert.equal((await editor.client.raw('GET', '/maintenance/deletion-impact?kind=source&id=' + sourceId)).status, 403);

    const privatePerson = await createPerson(editor.client, 'H1维护不可见', true);
    const person = f.store.rows('people').find(p => p.id === privatePerson)!, source = f.store.rows('sources').find(s => s.id === person.sourceId)!;
    const offer = await ok(editor.client.cmd('POST', '/people/' + privatePerson + '/handoffs', {
        expectedRevision: person.revision, expectedSourceRevision: source.revision, recipientId: f.membershipId,
        purpose: 'EDIT', expiresAt: new Date(f.clock.now().getTime() + 3600000).toISOString(), acknowledgeLimitedAccess: true
    }), 201);
    await ok(f.owner.cmd('POST', '/handoffs/' + offer.resourceId + '/accept', { expectedRevision: 1 }));
    assert.equal((await f.owner.raw('GET', '/people/' + privatePerson)).status, 200, 'basic H1 profile remains readable');
    assert.equal((await f.owner.raw('GET', '/maintenance/deletion-impact?kind=person&id=' + privatePerson)).status, 404,
        'maintenance requires native scope, not H1 delegation');
});

test('DEV-07 unowned asset can be inspected without inventing a person scope dependency', async () => {
    const f = await fixture();
    const sourceId = (await ok(f.owner.cmd('POST', '/sources', sourceInput()), 201)).resourceId as string;
    const source = f.store.rows('sources').find(s => s.id === sourceId)!;
    const assetId = randomUUID(), now = f.clock.now().toISOString();
    f.store.data.assets.set(assetId, {
        id: assetId, workspaceId: source.workspaceId, createdAt: now, updatedAt: now, revision: 1,
        uploadId: randomUUID(), sourceId, scopeId: source.scopeId, objectToken: randomUUID(), personId: null,
        fileName: 'unowned-synthetic.png', mime: 'image/png', sha256: 'a'.repeat(64), previewHash: 'b'.repeat(64),
        state: 'READY', bytes: 12, width: 2, height: 3, previewBytes: 10
    });
    const view = await impact(f.owner, 'asset', assetId);
    assert.equal(view.target.id, assetId);
    assert.equal(view.target.label, 'unowned-synthetic.png');
    assert.equal(view.impactComplete, true);
});

test('DEV-07 impact rejects unknown target kinds and malformed ids without scanning dependencies', async () => {
    const f = await fixture();
    for (const path of [
        '/maintenance/deletion-impact?kind=account&id=00000000-0000-4000-8000-000000000000',
        '/maintenance/deletion-impact?kind=person&id=not-a-uuid',
        '/maintenance/deletion-impact?kind=person'
    ])
        assert.equal((await f.owner.raw('GET', path)).status, 400);
});
