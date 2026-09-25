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

test('DEV-07D pending review decisions block plan freeze; safe review slots expose no underlying resource ids', async () => {
    const f = await fixture(), pid = await createPerson(f.owner, '保留决策候选');
    const person = await get(f.owner, '/people/' + pid);
    const workId = (await ok(f.owner.cmd('POST', '/works', { title: '带备注关系作品', inlineSource: sourceInput() }), 201)).resourceId as string;
    const credit = await ok(f.owner.cmd('POST', '/works/' + workId + '/credits', {
        expectedRevision: 1, personId: pid, roleCode: 'model', note: '这条关系有业务备注，需要人工判断'
    }));
    const p = await preview(f, 'PERSON', pid, person.revision);
    const created = await ok(f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'PERSON', targetId: pid, expectedRevision: person.revision,
        previewDigest: p.previewDigest, reason: '合成测试：先阻断，再做保留决定'
    }), 201);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/block', {
        expectedRevision: 1, previewDigest: p.previewDigest, acknowledgeBlock: true
    }));
    const slots = await get(f.owner, '/deletion-requests/' + created.resourceId + '/items');
    const pending = slots.items.find((x: any) => x.evidenceState === 'REVIEW_REQUIRED');
    assert.ok(pending);
    const encoded = JSON.stringify(slots);
    assert.ok(!encoded.includes(workId));
    assert.ok(!encoded.includes(credit.resourceId));
    assert.ok(!encoded.includes(person.sourceId));
    const freeze = await f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/plan/freeze', {
        expectedRevision: 2, acknowledgePlan: true
    });
    assert.equal(freeze.status, 409);
    assert.equal(result(freeze).error.code, 'DELETION_DECISIONS_PENDING');
});

test('DEV-07D manual proposed-action decision completes and freezes a non-executing cleanup plan', async () => {
    const f = await fixture(), pid = await createPerson(f.owner, '按建议处置候选');
    const person = await get(f.owner, '/people/' + pid);
    const workId = (await ok(f.owner.cmd('POST', '/works', { title: '人工判断作品', inlineSource: sourceInput() }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/works/' + workId + '/credits', {
        expectedRevision: 1, personId: pid, roleCode: 'model', note: '人工判断后按建议移除关系'
    }));
    const creditId = f.store.rows('workCredits').find(x => x.workId === workId && x.personId === pid)!.id;
    const p = await preview(f, 'PERSON', pid, person.revision);
    const created = await ok(f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'PERSON', targetId: pid, expectedRevision: person.revision,
        previewDigest: p.previewDigest, reason: '合成测试：冻结清理计划但不执行'
    }), 201);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/block', {
        expectedRevision: 1, previewDigest: p.previewDigest, acknowledgeBlock: true
    }));
    const slots = await get(f.owner, '/deletion-requests/' + created.resourceId + '/items');
    const pending = slots.items.find((x: any) => x.decision === 'PENDING');
    assert.ok(pending);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/decisions', {
        expectedRevision: 2, entryId: pending.id, decision: 'APPLY_PROPOSED',
        decisionReason: '已核对关系备注，不存在独立保留依据'
    }));
    const frozen = await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/plan/freeze', {
        expectedRevision: 3, acknowledgePlan: true
    }));
    assert.equal(frozen.revision, 4);
    const detail = await get(f.owner, '/deletion-requests/' + created.resourceId);
    assert.equal(detail.state, 'BLOCKED_FOR_USE');
    assert.equal(detail.planFrozen, true);
    assert.equal(detail.planDigest.length, 64);
    assert.equal(detail.cleanupAvailable, false);
    assert.equal(f.store.rows('workCredits').some(x => x.id === creditId), true);
    assert.equal(f.store.rows('people').some(x => x.id === pid), true);
    const again = await f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/decisions', {
        expectedRevision: 4, entryId: pending.id, decision: 'APPLY_PROPOSED',
        decisionReason: '冻结后不得再改'
    });
    assert.equal(again.status, 409);
    assert.equal(result(again).error.code, 'DELETION_PLAN_FROZEN');
});

test('DEV-07D retain-with-basis requires independent current source and freezes its revision/epoch', async () => {
    const f = await fixture(), pid = await createPerson(f.owner, '独立依据保留候选');
    const person = f.store.rows('people').find(x => x.id === pid)!;
    const workId = (await ok(f.owner.cmd('POST', '/works', { title: '待保留关系作品', inlineSource: sourceInput() }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/works/' + workId + '/credits', {
        expectedRevision: 1, personId: pid, roleCode: 'model', note: '存在另一份独立依据，可保留关系'
    }));
    const current = await get(f.owner, '/people/' + pid);
    const p = await preview(f, 'PERSON', pid, current.revision);
    const created = await ok(f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'PERSON', targetId: pid, expectedRevision: current.revision,
        previewDigest: p.previewDigest, reason: '合成测试：有独立来源时保留'
    }), 201);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/block', {
        expectedRevision: 1, previewDigest: p.previewDigest, acknowledgeBlock: true
    }));
    const slot = (await get(f.owner, '/deletion-requests/' + created.resourceId + '/items')).items.find((x: any) => x.decision === 'PENDING');
    assert.ok(slot);
    const same = await f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/decisions', {
        expectedRevision: 2, entryId: slot.id, decision: 'RETAIN_WITH_BASIS',
        decisionReason: '不能用目标原来源自证保留', retentionSourceId: person.sourceId
    });
    assert.equal(same.status, 422);
    assert.equal(result(same).error.code, 'RETENTION_BASIS_REQUIRED');

    const basisId = (await ok(f.owner.cmd('POST', '/sources', { ...sourceInput(), title: '独立保留依据' }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/decisions', {
        expectedRevision: 2, entryId: slot.id, decision: 'RETAIN_WITH_BASIS',
        decisionReason: '已核对另一份当前有效的正式内部依据', retentionSourceId: basisId
    }));
    const basis = await get(f.owner, '/sources/' + basisId);
    await ok(f.owner.cmd('PATCH', '/sources/' + basisId, { expectedRevision: basis.revision, title: '独立保留依据·已更新' }));
    const stale = await f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/plan/freeze', {
        expectedRevision: 3, acknowledgePlan: true
    });
    assert.equal(stale.status, 409);
    assert.equal(result(stale).error.code, 'RETENTION_BASIS_CHANGED');

    const basis2 = await get(f.owner, '/sources/' + basisId);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/decisions', {
        expectedRevision: 3, entryId: slot.id, decision: 'RETAIN_WITH_BASIS',
        decisionReason: '重新核对更新后的正式内部依据', retentionSourceId: basisId
    }));
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/plan/freeze', {
        expectedRevision: 4, acknowledgePlan: true
    }));
    const stored = f.store.rows('deletionItems').find(x => x.id === slot.id)!;
    assert.equal(stored.retentionSourceId, basisId);
    assert.equal(stored.retentionSourceRevision, basis2.revision);
    assert.ok(stored.retentionSourceProtectionEpoch);
});

test('DEV-07D delete-only member may apply proposed action but cannot authorize retain-with-basis', async () => {
    const f = await fixture(), reviewer = await member(f, 'delete_only_reviewer', 'EDITOR', ['data.delete']);
    const pid = await createPerson(f.owner, '删除评估员目标');
    const person = await get(f.owner, '/people/' + pid);
    const workId = (await ok(f.owner.cmd('POST', '/works', { title: '删除评估员作品', inlineSource: sourceInput() }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/works/' + workId + '/credits', {
        expectedRevision: 1, personId: pid, roleCode: 'model', note: '需要人工决定的关系'
    }));
    const p = await preview(f, 'PERSON', pid, person.revision);
    const created = await ok(f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'PERSON', targetId: pid, expectedRevision: person.revision,
        previewDigest: p.previewDigest, reason: '合成测试：区分删除评估与来源审核权限'
    }), 201);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/block', {
        expectedRevision: 1, previewDigest: p.previewDigest, acknowledgeBlock: true
    }));
    const slot = (await get(reviewer.client, '/deletion-requests/' + created.resourceId + '/items')).items.find((x: any) => x.decision === 'PENDING');
    assert.ok(slot);
    const basisId = (await ok(f.owner.cmd('POST', '/sources', { ...sourceInput(), title: '保留依据' }), 201)).resourceId as string;
    const retain = await reviewer.client.cmd('POST', '/deletion-requests/' + created.resourceId + '/decisions', {
        expectedRevision: 2, entryId: slot.id, decision: 'RETAIN_WITH_BASIS',
        decisionReason: '我没有来源审核权限，不能批准保留', retentionSourceId: basisId
    });
    assert.equal(retain.status, 403);
    await ok(reviewer.client.cmd('POST', '/deletion-requests/' + created.resourceId + '/decisions', {
        expectedRevision: 2, entryId: slot.id, decision: 'APPLY_PROPOSED',
        decisionReason: '按冻结影响清单中的建议动作处理'
    }));
});

test('DEV-07D source reviewer may approve retention and delete-only operator may freeze the completed plan', async () => {
    const f = await fixture(), cleaner = await member(f, 'delete_plan_cleaner', 'EDITOR', ['data.delete']);
    const pid = await createPerson(f.owner, '分权保留计划候选');
    const person = await get(f.owner, '/people/' + pid);
    const workId = (await ok(f.owner.cmd('POST', '/works', { title: '分权保留作品', inlineSource: sourceInput() }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/works/' + workId + '/credits', {
        expectedRevision: 1, personId: pid, roleCode: 'model', note: '保留由来源审核者批准，计划由清理负责人冻结'
    }));
    const p = await preview(f, 'PERSON', pid, person.revision);
    const created = await ok(f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'PERSON', targetId: pid, expectedRevision: person.revision,
        previewDigest: p.previewDigest, reason: '合成测试：审核与清理职责分离'
    }), 201);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/block', {
        expectedRevision: 1, previewDigest: p.previewDigest, acknowledgeBlock: true
    }));
    const slot = (await get(f.owner, '/deletion-requests/' + created.resourceId + '/items')).items.find((x: any) => x.decision === 'PENDING');
    assert.ok(slot);
    const basisId = (await ok(f.owner.cmd('POST', '/sources', { ...sourceInput(), title: '独立正式保留依据' }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/decisions', {
        expectedRevision: 2, entryId: slot.id, decision: 'RETAIN_WITH_BASIS',
        decisionReason: '来源审核者确认独立正式依据成立', retentionSourceId: basisId
    }));
    await ok(cleaner.client.cmd('POST', '/deletion-requests/' + created.resourceId + '/plan/freeze', {
        expectedRevision: 3, acknowledgePlan: true
    }));
    const detail = await get(cleaner.client, '/deletion-requests/' + created.resourceId);
    assert.equal(detail.planFrozen, true);
    assert.equal(detail.cleanupAvailable, false);
});

test('DEV-07E cleanup gate is independent and disabled mode cannot enter CLEANING', async () => {
    const f = await fixture(), pid = await createPerson(f.owner, '清理闸门候选');
    const person = await get(f.owner, '/people/' + pid);
    const p = await preview(f, 'PERSON', pid, person.revision);
    const created = await ok(f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'PERSON', targetId: pid, expectedRevision: person.revision,
        previewDigest: p.previewDigest, reason: '合成测试：不可逆清理必须有部署闸门'
    }), 201);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/block', {
        expectedRevision: 1, previewDigest: p.previewDigest, acknowledgeBlock: true
    }));
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/plan/freeze', {
        expectedRevision: 2, acknowledgePlan: true
    }));
    const detail = await get(f.owner, '/deletion-requests/' + created.resourceId);
    f.app.config.dataCleanupMode = 'DISABLED';
    const response = await f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/cleaning/start', {
        expectedRevision: detail.revision, planDigest: detail.planDigest, acknowledgeIrreversible: true
    });
    assert.equal(response.status, 503);
    assert.equal(result(response).error.code, 'CLEANUP_DISABLED');
    assert.equal(f.store.rows('deletionRequests').find(x => x.id === created.resourceId)!.state, 'BLOCKED_FOR_USE');
});

test('DEV-07E worker irreversibly cleans registered DB dependencies but preserves blocked root', async () => {
    const f = await fixture();
    const personId = await createPerson(f.owner, '依赖清理候选');
    let person = await get(f.owner, '/people/' + personId);
    const sourceId = person.sourceId as string;

    await ok(f.owner.cmd('PUT', '/people/' + personId + '/contacts', {
        expectedRevision: person.revision,
        contacts: [{ kind: 'PHONE', value: '13800138000', sourceId }]
    }));
    person = await get(f.owner, '/people/' + personId);
    await ok(f.owner.cmd('POST', '/field-evidence', {
        personId, expectedRevision: person.revision, fieldPath: 'cityCode',
        sourceId, sourceRevision: person.source.revision
    }));
    person = await get(f.owner, '/people/' + personId);

    const workId = (await ok(f.owner.cmd('POST', '/works', {
        title: '清理关系作品', inlineSource: sourceInput()
    }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/works/' + workId + '/credits', {
        expectedRevision: 1, personId, roleCode: 'model', note: ''
    }));
    const creditId = f.store.rows('workCredits').find(x => x.workId === workId && x.personId === personId)!.id;

    const permit = (await ok(f.owner.cmd('POST', '/use-permissions', {
        sourceId, subjectKind: 'PERSON', subjectId: personId,
        fields: ['person.displayName'], validUntil: '2026-10-15T00:00:00.000Z',
        evidenceNote: '合成测试：清理前合法内部导出'
    }), 201)).resourceId as string;
    const exportId = (await ok(f.owner.cmd('POST', '/exports', {
        format: 'JSON', selectedIds: { people: [personId], works: [], projects: [] },
        fields: ['person.displayName'], usePermissionRefs: [permit]
    }), 202)).resourceId as string;
    const exportClaim = await f.app.exports.claim(); assert.ok(exportClaim); await f.app.exports.process(exportClaim);
    assert.equal(f.store.rows('exports').find(x => x.id === exportId)!.state, 'READY');

    const current = await get(f.owner, '/people/' + personId);
    const p = await preview(f, 'PERSON', personId, current.revision);
    const created = await ok(f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'PERSON', targetId: personId, expectedRevision: current.revision,
        previewDigest: p.previewDigest, reason: '合成测试：执行冻结计划中的数据库依赖清理'
    }), 201);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/block', {
        expectedRevision: 1, previewDigest: p.previewDigest, acknowledgeBlock: true
    }));
    let detail = await get(f.owner, '/deletion-requests/' + created.resourceId);
    const slots = await get(f.owner, '/deletion-requests/' + created.resourceId + '/items');
    for (const item of slots.items.filter((x: any) => x.decision === 'PENDING')) {
        await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/decisions', {
            expectedRevision: detail.revision, entryId: item.id, decision: 'APPLY_PROPOSED',
            decisionReason: '合成测试：无独立保留依据，按建议进入清理'
        }));
        detail = await get(f.owner, '/deletion-requests/' + created.resourceId);
    }
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/plan/freeze', {
        expectedRevision: detail.revision, acknowledgePlan: true
    }));
    detail = await get(f.owner, '/deletion-requests/' + created.resourceId);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/cleaning/start', {
        expectedRevision: detail.revision, planDigest: detail.planDigest, acknowledgeIrreversible: true
    }));
    assert.equal((await f.owner.raw('GET', '/people/' + personId)).status, 404);
    assert.ok(!(await get(f.owner, '/people')).items.some((x: any) => x.id === personId));
    assert.equal((await get(f.owner, '/talent-search?q=' + encodeURIComponent('依赖清理候选'))).total, 0);

    const cleanupClaim = await f.app.deletionCleanup.claim(); assert.ok(cleanupClaim);
    assert.equal(cleanupClaim.id, created.resourceId);
    await f.app.deletionCleanup.process(cleanupClaim);

    const request = f.store.rows('deletionRequests').find(x => x.id === created.resourceId)!;
    assert.equal(request.state, 'CLEANING');
    assert.ok(request.executionPlanDigest?.length === 64);
    assert.ok(request.dependencyCleanupCompletedAt);
    assert.equal(request.cleanupErrorCode, null);
    assert.equal(f.store.rows('people').some(x => x.id === personId), true);
    assert.equal(f.store.rows('workCredits').some(x => x.id === creditId), false);
    assert.equal(f.store.rows('contacts').some(x => x.personId === personId), false);
    assert.equal(f.store.rows('evidence').some(x => x.personId === personId), false);
    assert.equal(f.store.rows('usePermissions').find(x => x.id === permit)!.status, 'REVOKED');
    const erasedExport = f.store.rows('exports').find(x => x.id === exportId)!;
    assert.equal(erasedExport.state, 'ERASED');
    assert.deepEqual(erasedExport.fields, []);
    assert.deepEqual(erasedExport.usePermissionRefs, []);
    assert.equal(erasedExport.payload, null);
    assert.equal(erasedExport.payloadDigest, null);
    assert.deepEqual(erasedExport.recordManifest, { schemaVersion: 'once-export-v1', erased: true });
    assert.equal(f.store.rows('exportDependencies').some(x => x.exportId === exportId), false);
    const cleanupItems = f.store.rows('deletionItems').filter(x => x.requestId === created.resourceId);
    assert.ok(cleanupItems.every(x => x.cleanupState === 'DONE'));
    assert.ok(cleanupItems.every(x => x.cleanupEvidenceDigest?.length === 64));
});

test('DEV-07E source cleanup stops at explicit external/specialized work instead of claiming completion', async () => {
    const f = await fixture();
    const sourceId = (await ok(f.owner.cmd('POST', '/sources', sourceInput()), 201)).resourceId as string;
    const source = await get(f.owner, '/sources/' + sourceId);
    const p = await preview(f, 'SOURCE', sourceId, source.revision);
    const created = await ok(f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'SOURCE', targetId: sourceId, expectedRevision: source.revision,
        previewDigest: p.previewDigest, reason: '合成测试：来源历史必须走专用保留/擦除过程'
    }), 201);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/block', {
        expectedRevision: 1, previewDigest: p.previewDigest, acknowledgeBlock: true
    }));
    let detail = await get(f.owner, '/deletion-requests/' + created.resourceId);
    const slots = await get(f.owner, '/deletion-requests/' + created.resourceId + '/items');
    for (const item of slots.items.filter((x: any) => x.decision === 'PENDING')) {
        await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/decisions', {
            expectedRevision: detail.revision, entryId: item.id, decision: 'APPLY_PROPOSED',
            decisionReason: '合成测试：无独立保留依据'
        }));
        detail = await get(f.owner, '/deletion-requests/' + created.resourceId);
    }
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/plan/freeze', {
        expectedRevision: detail.revision, acknowledgePlan: true
    }));
    detail = await get(f.owner, '/deletion-requests/' + created.resourceId);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/cleaning/start', {
        expectedRevision: detail.revision, planDigest: detail.planDigest, acknowledgeIrreversible: true
    }));
    const claim = await f.app.deletionCleanup.claim(); assert.ok(claim); await f.app.deletionCleanup.process(claim);
    const request = f.store.rows('deletionRequests').find(x => x.id === created.resourceId)!;
    assert.equal(request.state, 'CLEANING');
    assert.equal(request.dependencyCleanupCompletedAt, null);
    assert.equal(request.cleanupErrorCode, 'WAITING_EXTERNAL_CLEANUP');
    const historyItems = f.store.rows('deletionItems').filter(x => x.requestId === created.resourceId && x.resourceKind === 'sourceHistory');
    assert.ok(historyItems.length > 0);
    assert.ok(historyItems.every(x => x.cleanupState === 'WAITING_EXTERNAL' && x.cleanupErrorCode === 'SOURCE_HISTORY_RETENTION_PROCEDURE_REQUIRED'));
    assert.ok(f.store.rows('sourceHistory').some(x => x.sourceId === sourceId));
});

test('DEV-07E cleanup start rechecks retained-basis revision after plan freeze', async () => {
    const f = await fixture(), pid = await createPerson(f.owner, '清理前保留依据变化');
    const person = await get(f.owner, '/people/' + pid);
    const workId = (await ok(f.owner.cmd('POST', '/works', { title: '保留依据关系', inlineSource: sourceInput() }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/works/' + workId + '/credits', {
        expectedRevision: 1, personId: pid, roleCode: 'model', note: '需要独立依据保留'
    }));
    const p = await preview(f, 'PERSON', pid, person.revision);
    const created = await ok(f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'PERSON', targetId: pid, expectedRevision: person.revision,
        previewDigest: p.previewDigest, reason: '合成测试：执行前再次核验保留依据'
    }), 201);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/block', {
        expectedRevision: 1, previewDigest: p.previewDigest, acknowledgeBlock: true
    }));
    const slot = (await get(f.owner, '/deletion-requests/' + created.resourceId + '/items')).items.find((x: any) => x.decision === 'PENDING');
    const basisId = (await ok(f.owner.cmd('POST', '/sources', { ...sourceInput(), title: '执行前保留依据' }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/decisions', {
        expectedRevision: 2, entryId: slot.id, decision: 'RETAIN_WITH_BASIS',
        decisionReason: '合成测试：另一份正式来源支持保留', retentionSourceId: basisId
    }));
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/plan/freeze', {
        expectedRevision: 3, acknowledgePlan: true
    }));
    let detail = await get(f.owner, '/deletion-requests/' + created.resourceId);
    const basis = await get(f.owner, '/sources/' + basisId);
    await ok(f.owner.cmd('PATCH', '/sources/' + basisId, { expectedRevision: basis.revision, title: '执行前保留依据·已变化' }));
    const response = await f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/cleaning/start', {
        expectedRevision: detail.revision, planDigest: detail.planDigest, acknowledgeIrreversible: true
    });
    assert.equal(response.status, 409);
    assert.equal(result(response).error.code, 'RETENTION_BASIS_CHANGED');
    assert.equal(f.store.rows('deletionRequests').find(x => x.id === created.resourceId)!.state, 'BLOCKED_FOR_USE');
});

test('DEV-07F Person root becomes ERASED minimal header after dependency cleanup', async () => {
    const f = await fixture(), pid = await createPerson(f.owner, '最终擦除人才');
    const beforeEpoch = f.store.rows('people').find(x => x.id === pid)!.protectionEpoch;
    const before = await get(f.owner, '/people/' + pid);
    const p = await preview(f, 'PERSON', pid, before.revision);
    const created = await ok(f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'PERSON', targetId: pid, expectedRevision: before.revision,
        previewDigest: p.previewDigest, reason: '合成测试：依赖清理后终结人才最小头'
    }), 201);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/block', {
        expectedRevision: 1, previewDigest: p.previewDigest, acknowledgeBlock: true
    }));
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/plan/freeze', {
        expectedRevision: 2, acknowledgePlan: true
    }));
    let detail = await get(f.owner, '/deletion-requests/' + created.resourceId);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/cleaning/start', {
        expectedRevision: detail.revision, planDigest: detail.planDigest, acknowledgeIrreversible: true
    }));
    assert.equal(await f.app.deletionCleanup.claim(), null, 'empty dependency set should be marked complete without a worker claim');
    const finalized = await f.app.deletionCleanup.finalizeNext();
    assert.ok(finalized);
    assert.equal(finalized.id, created.resourceId);
    assert.equal(finalized.state, 'COMPLETED');
    assert.equal(finalized.rootFinalizationEvidenceDigest?.length, 64);

    const erased = f.store.rows('people').find(x => x.id === pid)!;
    assert.equal(erased.status, 'ERASED');
    assert.equal(erased.displayName, '[ERASED]');
    assert.deepEqual(erased.aliases, []);
    assert.deepEqual(erased.roles, []);
    assert.equal(erased.cityCode, null);
    assert.deepEqual(erased.languageCodes, []);
    assert.deepEqual(erased.skillCodes, []);
    assert.equal(erased.heightCm, null);
    assert.equal(erased.intro, '');
    assert.equal(erased.protectionEpoch, beforeEpoch + 2);
    assert.equal((await f.owner.raw('GET', '/people/' + pid)).status, 404);
    detail = await get(f.owner, '/deletion-requests/' + created.resourceId);
    assert.equal(detail.state, 'COMPLETED');
    assert.ok(detail.rootFinalizedAt);
    assert.equal(detail.rootFinalizationEvidenceDigest.length, 64);
});

test('DEV-07F Work finalization safely clears a blocked cover relation before ERASED header', async () => {
    const f = await fixture();
    const workId = (await ok(f.owner.cmd('POST', '/works', { title: '最终擦除作品', inlineSource: sourceInput() }), 201)).resourceId as string;
    const entryId = randomUUID(), fakeAssetId = randomUUID();
    await f.store.transaction(async tx => {
        const work = await tx.get('works', workId); assert.ok(work);
        await tx.insert('workAssets', {
            id: entryId, workspaceId: work.workspaceId, createdAt: f.clock.now().toISOString(), updatedAt: f.clock.now().toISOString(),
            revision: 1, workId, assetId: fakeAssetId, position: 0
        });
        await tx.replace('works', { ...work, revision: work.revision + 1, updatedAt: f.clock.now().toISOString(), coverEntryId: entryId });
    });
    const work = f.store.rows('works').find(x => x.id === workId)!;
    const p = await preview(f, 'WORK', workId, work.revision);
    const created = await ok(f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'WORK', targetId: workId, expectedRevision: work.revision,
        previewDigest: p.previewDigest, reason: '合成测试：封面关系先清理再终结作品'
    }), 201);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/block', {
        expectedRevision: 1, previewDigest: p.previewDigest, acknowledgeBlock: true
    }));
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/plan/freeze', {
        expectedRevision: 2, acknowledgePlan: true
    }));
    let detail = await get(f.owner, '/deletion-requests/' + created.resourceId);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/cleaning/start', {
        expectedRevision: detail.revision, planDigest: detail.planDigest, acknowledgeIrreversible: true
    }));
    const claim = await f.app.deletionCleanup.claim(); assert.ok(claim); await f.app.deletionCleanup.process(claim);
    assert.equal(f.store.rows('workAssets').some(x => x.id === entryId), false);
    const afterDependency = f.store.rows('works').find(x => x.id === workId)!;
    assert.equal(afterDependency.coverEntryId, null);
    assert.equal(afterDependency.revision, work.revision + 1);
    const finalized = await f.app.deletionCleanup.finalizeNext(); assert.ok(finalized);
    assert.equal(finalized.state, 'COMPLETED');
    const erased = f.store.rows('works').find(x => x.id === workId)!;
    assert.equal(erased.status, 'ERASED');
    assert.equal(erased.title, '[ERASED]');
    assert.equal(erased.description, '');
    assert.equal(erased.industryCode, null);
    assert.deepEqual(erased.workTypeCodes, []);
    assert.equal(erased.origin, 'UNKNOWN');
    assert.equal(erased.originNote, '');
    assert.equal(erased.coverEntryId, null);
});

test('DEV-07F Project root finalizes only after all project relations are cleaned', async () => {
    const f = await fixture(), pid = await createPerson(f.owner, '项目终结参与者');
    const projectId = (await ok(f.owner.cmd('POST', '/projects', { title: '最终擦除项目', inlineSource: sourceInput() }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/projects/' + projectId + '/participants', {
        expectedRevision: 1, personId: pid, roleCode: 'model', state: 'NOMINATED', note: ''
    }));
    const project = f.store.rows('projects').find(x => x.id === projectId)!;
    const p = await preview(f, 'PROJECT', projectId, project.revision);
    const created = await ok(f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'PROJECT', targetId: projectId, expectedRevision: project.revision,
        previewDigest: p.previewDigest, reason: '合成测试：关系清理完成后终结项目'
    }), 201);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/block', {
        expectedRevision: 1, previewDigest: p.previewDigest, acknowledgeBlock: true
    }));
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/plan/freeze', {
        expectedRevision: 2, acknowledgePlan: true
    }));
    let detail = await get(f.owner, '/deletion-requests/' + created.resourceId);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/cleaning/start', {
        expectedRevision: detail.revision, planDigest: detail.planDigest, acknowledgeIrreversible: true
    }));
    const claim = await f.app.deletionCleanup.claim(); assert.ok(claim); await f.app.deletionCleanup.process(claim);
    assert.equal(f.store.rows('projectParticipants').some(x => x.projectId === projectId), false);
    const finalized = await f.app.deletionCleanup.finalizeNext(); assert.ok(finalized);
    assert.equal(finalized.state, 'COMPLETED');
    const erased = f.store.rows('projects').find(x => x.id === projectId)!;
    assert.equal(erased.status, 'ERASED');
    assert.equal(erased.title, '[ERASED]');
    assert.equal(erased.brief, '');
    assert.equal(erased.locationNote, '');
    assert.equal(erased.dateNote, '');
    assert.equal(erased.reviewNote, '');
});

test('DEV-07F retained independent relation yields RETAINED_WITH_BASIS while Person root is erased', async () => {
    const f = await fixture(), pid = await createPerson(f.owner, '有据保留根终结人才');
    const person = await get(f.owner, '/people/' + pid);
    const workId = (await ok(f.owner.cmd('POST', '/works', { title: '有据保留关系作品', inlineSource: sourceInput() }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/works/' + workId + '/credits', {
        expectedRevision: 1, personId: pid, roleCode: 'model', note: '独立依据证明这条历史关系仍可保留'
    }));
    const creditId = f.store.rows('workCredits').find(x => x.workId === workId && x.personId === pid)!.id;
    const p = await preview(f, 'PERSON', pid, person.revision);
    const created = await ok(f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'PERSON', targetId: pid, expectedRevision: person.revision,
        previewDigest: p.previewDigest, reason: '合成测试：根个人信息擦除但独立历史关系保留'
    }), 201);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/block', {
        expectedRevision: 1, previewDigest: p.previewDigest, acknowledgeBlock: true
    }));
    const slot = (await get(f.owner, '/deletion-requests/' + created.resourceId + '/items')).items.find((x: any) => x.decision === 'PENDING');
    assert.ok(slot);
    const basisId = (await ok(f.owner.cmd('POST', '/sources', { ...sourceInput(), title: '独立保留依据·终结测试' }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/decisions', {
        expectedRevision: 2, entryId: slot.id, decision: 'RETAIN_WITH_BASIS',
        decisionReason: '另一份当前正式来源支持保留历史关系', retentionSourceId: basisId
    }));
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/plan/freeze', {
        expectedRevision: 3, acknowledgePlan: true
    }));
    let detail = await get(f.owner, '/deletion-requests/' + created.resourceId);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/cleaning/start', {
        expectedRevision: detail.revision, planDigest: detail.planDigest, acknowledgeIrreversible: true
    }));
    const claim = await f.app.deletionCleanup.claim(); assert.ok(claim); await f.app.deletionCleanup.process(claim);
    const finalized = await f.app.deletionCleanup.finalizeNext(); assert.ok(finalized);
    assert.equal(finalized.state, 'RETAINED_WITH_BASIS');
    assert.equal(f.store.rows('workCredits').some(x => x.id === creditId), true);
    assert.equal(f.store.rows('people').find(x => x.id === pid)!.status, 'ERASED');
});

test('DEV-07F unexpected blocked-root mutation prevents finalization instead of claiming completion', async () => {
    const f = await fixture();
    const projectId = (await ok(f.owner.cmd('POST', '/projects', { title: '异常改写项目', inlineSource: sourceInput() }), 201)).resourceId as string;
    const project = f.store.rows('projects').find(x => x.id === projectId)!;
    const p = await preview(f, 'PROJECT', projectId, project.revision);
    const created = await ok(f.owner.cmd('POST', '/deletion-requests', {
        targetKind: 'PROJECT', targetId: projectId, expectedRevision: project.revision,
        previewDigest: p.previewDigest, reason: '合成测试：终结前验证冻结根版本'
    }), 201);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/block', {
        expectedRevision: 1, previewDigest: p.previewDigest, acknowledgeBlock: true
    }));
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/plan/freeze', {
        expectedRevision: 2, acknowledgePlan: true
    }));
    let detail = await get(f.owner, '/deletion-requests/' + created.resourceId);
    await ok(f.owner.cmd('POST', '/deletion-requests/' + created.resourceId + '/cleaning/start', {
        expectedRevision: detail.revision, planDigest: detail.planDigest, acknowledgeIrreversible: true
    }));
    assert.equal(await f.app.deletionCleanup.claim(), null);
    await f.store.transaction(async tx => {
        const row = await tx.get('projects', projectId); assert.ok(row);
        await tx.replace('projects', { ...row, revision: row.revision + 1, updatedAt: f.clock.now().toISOString(), reviewNote: '异常后台改写' });
    });
    await assert.rejects(() => f.app.deletionCleanup.finalizeNext(), (error: any) => error?.code === 'ROOT_FINALIZATION_CHANGED');
    assert.equal(f.store.rows('deletionRequests').find(x => x.id === created.resourceId)!.state, 'CLEANING');
    assert.notEqual(f.store.rows('projects').find(x => x.id === projectId)!.status, 'ERASED');
});

