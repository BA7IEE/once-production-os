/** DEV-07B deletion impact preview and draft request safety. No cleanup execution in this slice. */
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
async function preview(f: F, targetKind: string, targetId: string, expectedRevision: number) {
    return ok(f.owner.raw('POST', '/deletion-requests/preview', { targetKind, targetId, expectedRevision }));
}

test('DEV-07B preview is zero-write and DRAFT request does not block the target', async () => {
    const f = await fixture(), pid = await createPerson(f.owner, '删除预览候选');
    const person = await get(f.owner, '/people/' + pid);
    const before = {
        requests: f.store.rows('deletionRequests').length,
        items: f.store.rows('deletionItems').length,
        audits: f.store.rows('audits').length,
        receipts: f.store.rows('receipts').length
    };
    const p = await preview(f, 'PERSON', pid, person.revision);
    assert.equal(p.target.id, pid);
    assert.equal(p.complete, true);
    assert.equal(f.store.rows('deletionRequests').length, before.requests);
    assert.equal(f.store.rows('deletionItems').length, before.items);
    assert.equal(f.store.rows('audits').length, before.audits);
    assert.equal(f.store.rows('receipts').length, before.receipts);

    const created = await ok(f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'PERSON', targetId: pid, expectedRevision: person.revision,
        previewDigest: p.previewDigest, reason: '合成测试：冻结删除影响清单，暂不执行清理'
    }), 201);
    const request = await get(f.owner, '/deletion-requests/' + created.resourceId);
    assert.equal(request.state, 'DRAFT');
    assert.equal(request.executionAvailable, false);
    assert.equal((await f.owner.raw('GET', '/people/' + pid)).status, 200);
    const stored = f.store.rows('deletionRequests').find(x => x.id === created.resourceId)!;
    assert.equal(stored.targetRevision, person.revision);
    assert.equal(stored.previewDigest, p.previewDigest);
});

test('DEV-07B stale preview is rejected when a new dependency appears', async () => {
    const f = await fixture(), pid = await createPerson(f.owner, '删除图变化候选');
    const person = await get(f.owner, '/people/' + pid);
    const p = await preview(f, 'PERSON', pid, person.revision);
    const workId = (await ok(f.owner.cmd('POST', '/works', { title: '后来新增的依赖', inlineSource: sourceInput() }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/works/' + workId + '/credits', {
        expectedRevision: 1, personId: pid, roleCode: 'model', note: '预览后新增关系'
    }));
    const create = await f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'PERSON', targetId: pid, expectedRevision: person.revision,
        previewDigest: p.previewDigest, reason: '合成测试：旧预览不应被接受'
    });
    assert.equal(create.status, 409);
    assert.equal(result(create).error.code, 'DELETION_PREVIEW_STALE');
    assert.equal(f.store.rows('deletionRequests').length, 0);
});

test('DEV-07B hidden dependency is counted but not enumerated, and request creation is refused', async () => {
    const f = await fixture(), pid = await createPerson(f.owner, '跨范围依赖候选');
    const person = await get(f.owner, '/people/' + pid);
    const editor = await member(f, 'delete_hidden_editor');
    const workId = (await ok(editor.client.cmd('POST', '/works', {
        title: '仅编辑可见的私有作品', inlineSource: sourceInput(true)
    }), 201)).resourceId as string;
    await ok(editor.client.cmd('POST', '/works/' + workId + '/credits', {
        expectedRevision: 1, personId: pid, roleCode: 'model', note: '私有关系'
    }));
    const p = await preview(f, 'PERSON', pid, person.revision);
    assert.equal(p.complete, false);
    assert.ok(p.unresolved.some((x: any) => x.code === 'HIDDEN_WORK_DEPENDENCY'));
    assert.ok(!JSON.stringify(p).includes(workId));
    const create = await f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'PERSON', targetId: pid, expectedRevision: person.revision,
        previewDigest: p.previewDigest, reason: '合成测试：隐藏依赖时不得创建申请'
    });
    assert.equal(create.status, 409);
    assert.equal(result(create).error.code, 'DELETION_IMPACT_UNRESOLVED');
});

test('DEV-07B visible source does not enumerate child records whose own scope is hidden', async () => {
    const f = await fixture(), other = await member(f, 'hidden_child_member');
    const sourceId = (await ok(f.owner.cmd('POST', '/sources', sourceInput()), 201)).resourceId as string;
    const workId = (await ok(f.owner.cmd('POST', '/works', { title: '同源但后来收窄的作品', sourceId }), 201)).resourceId as string;
    const hiddenScopeId = randomUUID(), now = f.clock.now().toISOString();
    await f.store.transaction(async tx => {
        await tx.insert('scopes', { id: hiddenScopeId, workspaceId: f.workspaceId, createdAt: now, updatedAt: now, revision: 1, name: '仅其他成员', mode: 'RESTRICTED' });
        await tx.insert('scopeMembers', { id: randomUUID(), workspaceId: f.workspaceId, createdAt: now, updatedAt: now, revision: 1, scopeId: hiddenScopeId, membershipId: other.membershipId });
        const work = await tx.get('works', workId);
        assert.ok(work);
        await tx.replace('works', { ...work, scopeId: hiddenScopeId, revision: work.revision + 1, updatedAt: now });
    });
    const source = await get(f.owner, '/sources/' + sourceId);
    const p = await preview(f, 'SOURCE', sourceId, source.revision);
    assert.equal(p.complete, false);
    assert.ok(p.unresolved.some((x: any) => x.code === 'HIDDEN_WORK_DEPENDENCY'));
    assert.ok(!JSON.stringify(p).includes(workId));
    const create = await f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'SOURCE', targetId: sourceId, expectedRevision: source.revision,
        previewDigest: p.previewDigest, reason: '合成测试：隐藏子对象存在时不能冻结删除申请'
    });
    assert.equal(create.status, 409);
    assert.equal(result(create).error.code, 'DELETION_IMPACT_UNRESOLVED');
});

test('DEV-07B source preview reaches owned records, relations, permissions and frozen exports', async () => {
    const f = await fixture();
    const sourceId = (await ok(f.owner.cmd('POST', '/sources', sourceInput()), 201)).resourceId as string;
    const personId = (await ok(f.owner.cmd('POST', '/people', { displayName: '源删除人才', roles: ['model'], sourceId }), 201)).resourceId as string;
    const workId = (await ok(f.owner.cmd('POST', '/works', { title: '源删除作品', sourceId }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/works/' + workId + '/credits', { expectedRevision: 1, personId, roleCode: 'model', note: '需审阅的关系备注' }));
    const permit = (await ok(f.owner.cmd('POST', '/use-permissions', {
        sourceId, subjectKind: 'PERSON', subjectId: personId, fields: ['person.displayName'],
        validUntil: '2026-10-15T00:00:00.000Z', evidenceNote: '合成测试：内部导出许可'
    }), 201)).resourceId as string;
    const exportId = (await ok(f.owner.cmd('POST', '/exports', {
        format: 'JSON', selectedIds: { people: [personId], works: [], projects: [] },
        fields: ['person.displayName'], usePermissionRefs: [permit]
    }), 202)).resourceId as string;
    const claim = await f.app.exports.claim(); assert.ok(claim); await f.app.exports.process(claim);
    const source = await get(f.owner, '/sources/' + sourceId);
    const p = await preview(f, 'SOURCE', sourceId, source.revision);
    assert.equal(p.complete, true);
    assert.ok(p.items.some((x: any) => x.resourceKind === 'person' && x.resourceId === personId));
    assert.ok(p.items.some((x: any) => x.resourceKind === 'work' && x.resourceId === workId));
    assert.ok(p.items.some((x: any) => x.resourceKind === 'usePermission' && x.resourceId === permit));
    assert.ok(p.items.some((x: any) => x.resourceKind === 'export' && x.resourceId === exportId && x.proposedAction === 'ERASE_DERIVATIVE'));
    assert.ok(p.reviewRequiredCount > 0);
});

test('DEV-07B persisted request returns only summary, not frozen dependency ids', async () => {
    const f = await fixture(), pid = await createPerson(f.owner, '删除摘要候选');
    const person = await get(f.owner, '/people/' + pid);
    const workId = (await ok(f.owner.cmd('POST', '/works', { title: '摘要关系作品', inlineSource: sourceInput() }), 201)).resourceId as string;
    const credit = await ok(f.owner.cmd('POST', '/works/' + workId + '/credits', {
        expectedRevision: 1, personId: pid, roleCode: 'model', note: '摘要关系备注'
    }));
    const p = await preview(f, 'PERSON', pid, person.revision);
    const created = await ok(f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'PERSON', targetId: pid, expectedRevision: person.revision,
        previewDigest: p.previewDigest, reason: '合成测试：持久化后只看摘要'
    }), 201);
    const detail = await get(f.owner, '/deletion-requests/' + created.resourceId);
    const encoded = JSON.stringify(detail);
    assert.ok(!encoded.includes(workId));
    assert.ok(!encoded.includes(credit.resourceId));
    assert.equal(detail.impactCount, p.impactCount);
    assert.equal(detail.reviewRequiredCount, p.reviewRequiredCount);
});

test('DEV-07B non-delete member cannot preview or enumerate draft deletion requests', async () => {
    const f = await fixture(), editor = await member(f, 'delete_forbidden_editor', 'EDITOR');
    const pid = await createPerson(f.owner, '不可被普通编辑预览删除');
    const person = await get(f.owner, '/people/' + pid);
    assert.equal((await editor.client.raw('POST', '/deletion-requests/preview', { targetKind: 'PERSON', targetId: pid, expectedRevision: person.revision })).status, 403);
    assert.equal((await editor.client.raw('GET', '/deletion-requests')).status, 403);
});

test('DEV-07C blocking a person removes normal reads/search/handoff but preserves underlying data', async () => {
    const f = await fixture();
    const sender = await member(f, 'block_sender', 'EDITOR', ['data.delete']);
    const personId = await createPerson(sender.client, '待阻断人才', true);
    const person = f.store.rows('people').find(x => x.id === personId)!;
    const source = f.store.rows('sources').find(x => x.id === person.sourceId)!;

    const offer = await ok(sender.client.cmd('POST', '/people/' + personId + '/handoffs', {
        expectedRevision: person.revision, expectedSourceRevision: source.revision,
        recipientId: f.membershipId, purpose: 'EDIT',
        expiresAt: new Date(f.clock.now().getTime() + 3600000).toISOString(),
        acknowledgeLimitedAccess: true
    }), 201);
    await ok(f.owner.cmd('POST', '/handoffs/' + offer.resourceId + '/accept', { expectedRevision: 1 }));

    const before = await get(sender.client, '/people/' + personId);
    const p = await ok(sender.client.raw('POST', '/deletion-requests/preview', {
        targetKind: 'PERSON', targetId: personId, expectedRevision: before.revision
    }));
    const created = await ok(sender.client.cmd('POST', '/deletion-requests', {
        targetKind: 'PERSON', targetId: personId, expectedRevision: before.revision,
        previewDigest: p.previewDigest, reason: '合成测试：确认停止该人才的一切正常使用'
    }), 201);
    await ok(sender.client.cmd('POST', '/deletion-requests/' + created.resourceId + '/block', {
        expectedRevision: 1, previewDigest: p.previewDigest, acknowledgeBlock: true
    }));

    const stored = f.store.rows('people').find(x => x.id === personId)!;
    assert.equal(stored.protectionEpoch, person.protectionEpoch + 1);
    assert.ok(f.store.rows('handoffs').some(x => x.id === offer.resourceId));
    assert.equal((await sender.client.raw('GET', '/people/' + personId)).status, 404);
    assert.equal((await f.owner.raw('GET', '/people/' + personId)).status, 404);
    assert.ok(!(await get(sender.client, '/people')).items.some((x: any) => x.id === personId));
    assert.equal((await get(sender.client, '/talent-search?q=' + encodeURIComponent('待阻断人才'))).total, 0);
    assert.equal((await get(f.owner, '/handoffs/' + offer.resourceId)).effectiveState, 'INVALIDATED');

    const request = await get(sender.client, '/deletion-requests/' + created.resourceId);
    assert.equal(request.state, 'BLOCKED_FOR_USE');
    assert.equal(request.blockAvailable, false);
    assert.equal(request.cleanupAvailable, false);
    assert.equal(f.store.rows('people').some(x => x.id === personId), true);
});

test('DEV-07C blocking a source cascades to normal source/person/work reads and appends protected history', async () => {
    const f = await fixture();
    const sourceId = (await ok(f.owner.cmd('POST', '/sources', sourceInput()), 201)).resourceId as string;
    const personId = (await ok(f.owner.cmd('POST', '/people', { displayName: '来源阻断人才', roles: ['model'], sourceId }), 201)).resourceId as string;
    const workId = (await ok(f.owner.cmd('POST', '/works', { title: '来源阻断作品', sourceId }), 201)).resourceId as string;
    const source = await get(f.owner, '/sources/' + sourceId);
    const p = await preview(f, 'SOURCE', sourceId, source.revision);
    assert.equal(p.complete, true);
    const created = await ok(f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'SOURCE', targetId: sourceId, expectedRevision: source.revision,
        previewDigest: p.previewDigest, reason: '合成测试：来源停止正常使用但暂不物理擦除'
    }), 201);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/block', {
        expectedRevision: 1, previewDigest: p.previewDigest, acknowledgeBlock: true
    }));

    const stored = f.store.rows('sources').find(x => x.id === sourceId)!;
    assert.equal(stored.protectionEpoch, source.protectionEpoch + 1);
    assert.equal((await f.owner.raw('GET', '/sources/' + sourceId)).status, 404);
    assert.equal((await f.owner.raw('GET', '/people/' + personId)).status, 404);
    assert.equal((await f.owner.raw('GET', '/works/' + workId)).status, 404);
    assert.ok(!(await get(f.owner, '/sources')).items.some((x: any) => x.id === sourceId));
    assert.ok(!(await get(f.owner, '/people')).items.some((x: any) => x.id === personId));
    assert.ok(!(await get(f.owner, '/works')).items.some((x: any) => x.id === workId));
    assert.ok(f.store.rows('sourceHistory').some(x => x.sourceId === sourceId && x.action === 'DELETION_BLOCKED'
        && x.decisionReason.includes('来源停止正常使用')));
    assert.ok(f.store.rows('people').some(x => x.id === personId));
    assert.ok(f.store.rows('works').some(x => x.id === workId));
});

test('DEV-07C block is refused when the frozen preview changed after DRAFT creation', async () => {
    const f = await fixture(), pid = await createPerson(f.owner, '阻断前依赖变化');
    const person = await get(f.owner, '/people/' + pid);
    const p = await preview(f, 'PERSON', pid, person.revision);
    const created = await ok(f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'PERSON', targetId: pid, expectedRevision: person.revision,
        previewDigest: p.previewDigest, reason: '合成测试：阻断前必须再次验证影响图'
    }), 201);
    const workId = (await ok(f.owner.cmd('POST', '/works', { title: '阻断前新增作品', inlineSource: sourceInput() }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/works/' + workId + '/credits', {
        expectedRevision: 1, personId: pid, roleCode: 'model', note: '阻断前新增依赖'
    }));
    const response = await f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/block', {
        expectedRevision: 1, previewDigest: p.previewDigest, acknowledgeBlock: true
    });
    assert.equal(response.status, 409);
    assert.equal(result(response).error.code, 'DELETION_PREVIEW_STALE');
    assert.equal(f.store.rows('deletionRequests').find(x => x.id === created.resourceId)!.state, 'DRAFT');
    assert.equal((await f.owner.raw('GET', '/people/' + pid)).status, 200);
});

test('DEV-07C blocked person invalidates old export and shortlist item while preserving their records', async () => {
    const f = await fixture(), pid = await createPerson(f.owner, '导出清单阻断人才');
    const person = f.store.rows('people').find(x => x.id === pid)!;
    const scope = f.store.rows('scopes').find(x => x.mode === 'WORKSPACE')!;
    const shortlistId = (await ok(f.owner.cmd('POST', '/shortlists', {
        title: '阻断候选清单', brief: '', scopeId: scope.id
    }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/shortlists/' + shortlistId + '/items', {
        expectedRevision: 1, personId: pid, workAssetIds: [], note: 'PRIVATE_BLOCK_NOTE'
    }));

    const permit = (await ok(f.owner.cmd('POST', '/use-permissions', {
        sourceId: person.sourceId, subjectKind: 'PERSON', subjectId: pid,
        fields: ['person.displayName'], validUntil: '2026-10-15T00:00:00.000Z',
        evidenceNote: '合成测试：阻断前合法内部导出'
    }), 201)).resourceId as string;
    const exportId = (await ok(f.owner.cmd('POST', '/exports', {
        format: 'JSON', selectedIds: { people: [pid], works: [], projects: [] },
        fields: ['person.displayName'], usePermissionRefs: [permit]
    }), 202)).resourceId as string;
    const claim = await f.app.exports.claim(); assert.ok(claim); await f.app.exports.process(claim);
    assert.equal((await get(f.owner, '/exports/' + exportId)).downloadable, true);

    const current = await get(f.owner, '/people/' + pid);
    const p = await preview(f, 'PERSON', pid, current.revision);
    const created = await ok(f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'PERSON', targetId: pid, expectedRevision: current.revision,
        previewDigest: p.previewDigest, reason: '合成测试：阻断后旧派生物必须失效'
    }), 201);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/block', {
        expectedRevision: 1, previewDigest: p.previewDigest, acknowledgeBlock: true
    }));

    const list = await get(f.owner, '/shortlists/' + shortlistId);
    assert.equal(list.items[0].unavailable, true);
    assert.ok(!JSON.stringify(list).includes('PRIVATE_BLOCK_NOTE'));
    const exported = await get(f.owner, '/exports/' + exportId);
    assert.equal(exported.downloadable, false);
    assert.equal(exported.effectiveState, 'STALE');
    assert.equal((await f.owner.raw('POST', '/exports/' + exportId + '/download', {})).status, 409);
    assert.equal(f.store.rows('shortlistItems').some(x => x.shortlistId === shortlistId && x.personId === pid), true);
    assert.equal(f.store.rows('exports').some(x => x.id === exportId), true);
});

test('DEV-07C already blocked target cannot create another deletion request', async () => {
    const f = await fixture(), pid = await createPerson(f.owner, '重复阻断目标');
    const person = await get(f.owner, '/people/' + pid);
    const p = await preview(f, 'PERSON', pid, person.revision);
    const created = await ok(f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'PERSON', targetId: pid, expectedRevision: person.revision,
        previewDigest: p.previewDigest, reason: '合成测试：首次阻断'
    }), 201);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/block', {
        expectedRevision: 1, previewDigest: p.previewDigest, acknowledgeBlock: true
    }));
    const stored = f.store.rows('people').find(x => x.id === pid)!;
    const nextPreview = await preview(f, 'PERSON', pid, stored.revision);
    const response = await f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'PERSON', targetId: pid, expectedRevision: stored.revision,
        previewDigest: nextPreview.previewDigest, reason: '合成测试：重复申请应拒绝'
    });
    assert.equal(response.status, 409);
    assert.equal(result(response).error.code, 'DELETION_ALREADY_BLOCKED');
});

