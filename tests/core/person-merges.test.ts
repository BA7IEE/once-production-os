import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, member, createPerson, sourceInput, result, type Client } from '../support/fixtures.ts';

type F = Awaited<ReturnType<typeof fixture>>;

async function ok(p: ReturnType<Client['raw']>, status = 200) {
    const r = await p;
    assert.equal(r.status, status, JSON.stringify(r.body));
    return result(r);
}
async function person(f: F, id: string) {
    return ok(f.owner.raw('GET', '/people/' + id));
}
async function preview(f: F, canonicalId: string, duplicateId: string) {
    const canonical = await person(f, canonicalId);
    const duplicate = await person(f, duplicateId);
    return ok(f.owner.raw('POST', '/people/merge-preview', {
        canonicalId,
        duplicateId,
        expectedCanonicalRevision: canonical.revision,
        expectedDuplicateRevision: duplicate.revision
    }));
}
function executeInput(p: Record<string, any>, reason = '合成测试：人工确认两条档案属于同一人才') {
    return {
        canonicalId: p.canonical.id,
        duplicateId: p.duplicate.id,
        expectedCanonicalRevision: p.canonical.revision,
        expectedDuplicateRevision: p.duplicate.revision,
        previewDigest: p.previewDigest,
        fieldDecisions: p.fieldConflicts.map((x: any) => ({ field: x.field, choice: 'CANONICAL' })),
        collisionDecisions: p.collisions.map((x: any) => ({ collisionId: x.id, choice: 'KEEP_CANONICAL' })),
        acknowledgeRevocations: true,
        acknowledgeMediaDetach: true,
        reason
    };
}

test('DEV-07G merge preview is zero-write and same-name people remain distinct until explicit execution', async () => {
    const f = await fixture();
    const canonicalId = await createPerson(f.owner, '同名受控合并');
    const duplicateId = await createPerson(f.owner, '同名受控合并');
    assert.notEqual(canonicalId, duplicateId);

    const before = {
        merges: f.store.rows('personMerges').length,
        aliases: f.store.rows('personAliases').length,
        receipts: f.store.rows('receipts').length,
        audits: f.store.rows('audits').length
    };
    const p = await preview(f, canonicalId, duplicateId);
    assert.equal(p.complete, true);
    assert.equal(p.canonical.id, canonicalId);
    assert.equal(p.duplicate.id, duplicateId);
    assert.equal(f.store.rows('personMerges').length, before.merges);
    assert.equal(f.store.rows('personAliases').length, before.aliases);
    assert.equal(f.store.rows('receipts').length, before.receipts);
    assert.equal(f.store.rows('audits').length, before.audits);
    assert.equal(result(await f.owner.raw('GET', '/people?q=' + encodeURIComponent('同名受控合并'))).total, 2);
});

test('DEV-07G merge preview needs data.merge and never exposes restricted contact plaintext', async () => {
    const f = await fixture();
    const canonicalId = await createPerson(f.owner, '主档案');
    const duplicateId = await createPerson(f.owner, '重复档案');
    let duplicate = await person(f, duplicateId);
    const secret = 'merge-secret@example.invalid';
    await ok(f.owner.cmd('PUT', '/people/' + duplicateId + '/contacts', {
        expectedRevision: duplicate.revision,
        contacts: [{ kind: 'EMAIL', value: secret, sourceId: duplicate.sourceId }]
    }));
    duplicate = await person(f, duplicateId);
    const canonical = await person(f, canonicalId);

    const plain = await member(f, 'merge_plain_editor', 'EDITOR');
    const denied = await plain.client.raw('POST', '/people/merge-preview', {
        canonicalId, duplicateId,
        expectedCanonicalRevision: canonical.revision,
        expectedDuplicateRevision: duplicate.revision
    });
    assert.equal(denied.status, 403);

    const merger = await member(f, 'merge_limited_editor', 'EDITOR', ['data.merge']);
    const visible = await merger.client.raw('POST', '/people/merge-preview', {
        canonicalId, duplicateId,
        expectedCanonicalRevision: canonical.revision,
        expectedDuplicateRevision: duplicate.revision
    });
    assert.equal(visible.status, 200, JSON.stringify(visible.body));
    const body = result(visible);
    assert.equal(body.contactsToReencrypt, null);
    assert.equal(body.complete, false);
    assert.ok(body.blockers.some((x: any) => x.code === 'SENSITIVE_WRITE_REQUIRED'));
    assert.equal(body.revocations.usePermissions, null);
    assert.equal(JSON.stringify(body).includes(secret), false);
    assert.equal(JSON.stringify(body).includes('merge-secret'), false);
});

test('DEV-07G explicit merge creates one decision, hides duplicate from lists and resolves old id read-only', async () => {
    const f = await fixture();
    const canonicalId = await createPerson(f.owner, '主档案 Alice');
    const duplicateId = await createPerson(f.owner, '重复档案 Alice');
    const p = await preview(f, canonicalId, duplicateId);
    assert.equal(p.complete, true);
    assert.deepEqual(p.fieldConflicts.find((x: any) => x.field === 'displayName')?.choices, ['CANONICAL']);

    const key = randomUUID();
    const input = executeInput(p);
    const first = await f.owner.cmd('POST', '/people/merge', input, key);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const receipt = result(first);
    assert.equal(receipt.replayed, false);

    assert.equal(f.store.rows('personMerges').length, 1);
    assert.equal(f.store.rows('personAliases').length, 1);
    assert.equal(f.store.rows('personAliases')[0]!.oldPersonId, duplicateId);
    assert.equal(f.store.rows('personAliases')[0]!.canonicalPersonId, canonicalId);
    assert.equal(f.store.rows('people').find(x => x.id === duplicateId)!.status, 'ARCHIVED');

    const oldRead = await ok(f.owner.raw('GET', '/people/' + duplicateId));
    assert.equal(oldRead.id, canonicalId);
    assert.equal(oldRead.resolvedFromId, duplicateId);
    assert.equal(oldRead.aliases.includes('重复档案 Alice'), false);

    const list = result(await f.owner.raw('GET', '/people?q=' + encodeURIComponent('重复档案 Alice')));
    assert.equal(list.total, 0, 'a name supported only by another Source must not be copied into canonical aliases');

    const writeOld = await f.owner.cmd('PATCH', '/people/' + duplicateId, {
        expectedRevision: f.store.rows('people').find(x => x.id === duplicateId)!.revision,
        intro: '旧 ID 不得继续写入'
    });
    assert.ok([404, 409].includes(writeOld.status), JSON.stringify(writeOld.body));

    const replay = await f.owner.cmd('POST', '/people/merge', input, key);
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.equal(result(replay).resourceId, receipt.resourceId);
    assert.equal(result(replay).replayed, true);
    assert.equal(f.store.rows('personMerges').length, 1);
    assert.equal(f.store.rows('personAliases').length, 1);
    assert.equal(f.store.rows('audits').filter(x => x.action === 'person.merge').length, 1);
});

test('DEV-07G same-source merge may explicitly adopt duplicate values or union arrays without losing provenance', async () => {
    const f = await fixture();
    const source = await ok(f.owner.cmd('POST', '/sources', sourceInput()), 201);
    const sourceId = source.resourceId as string;
    const canonical = await ok(f.owner.cmd('POST', '/people', {
        displayName: '同源主档案', roles: ['model'], sourceId
    }), 201);
    const duplicate = await ok(f.owner.cmd('POST', '/people', {
        displayName: '同源重复档案', roles: ['photographer'], sourceId
    }), 201);
    const canonicalId = canonical.resourceId as string, duplicateId = duplicate.resourceId as string;
    const p = await preview(f, canonicalId, duplicateId);
    assert.deepEqual(p.fieldConflicts.find((x: any) => x.field === 'displayName')?.choices, ['CANONICAL','DUPLICATE']);
    assert.deepEqual(p.fieldConflicts.find((x: any) => x.field === 'roles')?.choices, ['CANONICAL','DUPLICATE','UNION']);

    const input = executeInput(p);
    input.fieldDecisions = p.fieldConflicts.map((x: any) => ({
        field: x.field,
        choice: x.field === 'displayName' ? 'DUPLICATE' : x.field === 'roles' ? 'UNION' : 'CANONICAL'
    }));
    const merged = await f.owner.cmd('POST', '/people/merge', input);
    assert.equal(merged.status, 200, JSON.stringify(merged.body));

    const current = await ok(f.owner.raw('GET', '/people/' + canonicalId));
    assert.equal(current.displayName, '同源重复档案');
    assert.deepEqual([...current.roles].sort(), ['model','photographer']);
    assert.ok(current.aliases.includes('同源主档案'));
    assert.equal(current.sourceId, sourceId);
});

test('DEV-07G preview digest becomes stale when a relation appears after preview', async () => {
    const f = await fixture();
    const canonicalId = await createPerson(f.owner, '关系主档案');
    const duplicateId = await createPerson(f.owner, '关系重复档案');
    const p = await preview(f, canonicalId, duplicateId);

    const workId = (await ok(f.owner.cmd('POST', '/works', {
        title: '预览之后新增的作品关系',
        inlineSource: sourceInput()
    }), 201)).resourceId as string;
    await ok(f.owner.cmd('POST', '/works/' + workId + '/credits', {
        expectedRevision: 1,
        personId: duplicateId,
        roleCode: 'photographer',
        note: '预览后才出现'
    }));

    const merged = await f.owner.cmd('POST', '/people/merge', executeInput(p));
    assert.equal(merged.status, 409, JSON.stringify(merged.body));
    assert.equal(result(merged).error.code, 'MERGE_PREVIEW_STALE');
    assert.equal(f.store.rows('personMerges').length, 0);
    assert.equal(f.store.rows('personAliases').length, 0);
});

test('DEV-07G merge audit failure rolls the entire merge back and exact retry succeeds', async () => {
    const f = await fixture();
    const canonicalId = await createPerson(f.owner, '回滚主档案');
    const duplicateId = await createPerson(f.owner, '回滚重复档案');
    const p = await preview(f, canonicalId, duplicateId);
    const input = executeInput(p);
    const key = randomUUID();

    const beforeCanonical = structuredClone(f.store.rows('people').find(x => x.id === canonicalId)!);
    const beforeDuplicate = structuredClone(f.store.rows('people').find(x => x.id === duplicateId)!);
    f.store.failNextAudit = true;
    const failed = await f.owner.cmd('POST', '/people/merge', input, key);
    assert.equal(failed.status, 500);
    assert.equal(f.store.rows('personMerges').length, 0);
    assert.equal(f.store.rows('personAliases').length, 0);
    assert.deepEqual(f.store.rows('people').find(x => x.id === canonicalId), beforeCanonical);
    assert.deepEqual(f.store.rows('people').find(x => x.id === duplicateId), beforeDuplicate);

    const retried = await f.owner.cmd('POST', '/people/merge', input, key);
    assert.equal(retried.status, 200, JSON.stringify(retried.body));
    assert.equal(f.store.rows('personMerges').length, 1);
    assert.equal(f.store.rows('personAliases').length, 1);
});

test('DEV-07G active purpose permission is revoked, never transferred to the canonical identity', async () => {
    const f = await fixture();
    const canonicalId = await createPerson(f.owner, '许可主档案');
    const duplicateId = await createPerson(f.owner, '许可重复档案');
    const duplicate = await person(f, duplicateId);
    const permit = await ok(f.owner.cmd('POST', '/use-permissions', {
        sourceId: duplicate.sourceId,
        subjectKind: 'PERSON',
        subjectId: duplicateId,
        fields: ['person.displayName'],
        validUntil: '2026-10-15T00:00:00.000Z',
        evidenceNote: '合成测试：旧身份用途许可不可自动扩张'
    }), 201);

    const p = await preview(f, canonicalId, duplicateId);
    assert.equal(p.revocations.usePermissions, 1);
    const merged = await f.owner.cmd('POST', '/people/merge', executeInput(p));
    assert.equal(merged.status, 200, JSON.stringify(merged.body));

    const old = f.store.rows('usePermissions').find(x => x.id === permit.resourceId)!;
    assert.equal(old.status, 'REVOKED');
    assert.equal(old.subjectPersonId, duplicateId);
    assert.equal(f.store.rows('usePermissions').some(x => x.subjectPersonId === canonicalId && x.status === 'ACTIVE'), false);
});

test('DEV-07G scope mismatch blocks execution and keeps both identities intact', async () => {
    const f = await fixture();
    const canonicalId = await createPerson(f.owner, '工作空间主档案');
    const duplicateId = await createPerson(f.owner, '受限范围重复档案', true);
    const p = await preview(f, canonicalId, duplicateId);
    assert.equal(p.complete, false);
    assert.ok(p.blockers.some((x: any) => x.code === 'SCOPE_MISMATCH'));

    const attempted = await f.owner.cmd('POST', '/people/merge', executeInput(p));
    assert.equal(attempted.status, 409, JSON.stringify(attempted.body));
    assert.equal(result(attempted).error.code, 'MERGE_BLOCKED');
    assert.equal(f.store.rows('personAliases').length, 0);
    assert.equal(result(await f.owner.raw('GET', '/people')).total, 2);
});


test('DEV-07G shortlist rebind uses canonical pre-merge baseline so identity change is never reported as unchanged', async () => {
    const f = await fixture();
    const canonicalId = await createPerson(f.owner, '候选主档案');
    const duplicateId = await createPerson(f.owner, '候选重复档案');
    const canonicalBefore = await person(f, canonicalId);
    const scopeId = f.store.rows('scopes')[0]!.id;

    const shortlist = await ok(f.owner.cmd('POST', '/shortlists', {
        title: '合并候选清单', brief: '验证旧身份关系迁移后的更新标记', scopeId
    }), 201);
    await ok(f.owner.cmd('POST', '/shortlists/' + shortlist.resourceId + '/items', {
        expectedRevision: 1, personId: duplicateId, workAssetIds: [], note: '重复档案加入时的候选备注'
    }));

    const p = await preview(f, canonicalId, duplicateId);
    assert.equal(p.complete, true);
    assert.equal(p.moves.shortlistItems, 1);
    const merged = await f.owner.cmd('POST', '/people/merge', executeInput(p));
    assert.equal(merged.status, 200, JSON.stringify(merged.body));

    const stored = f.store.rows('shortlistItems').find(x => x.shortlistId === shortlist.resourceId)!;
    assert.equal(stored.personId, canonicalId);
    assert.equal(stored.addedPersonRevision, canonicalBefore.revision);
    assert.equal(stored.addedPersonSourceRevision, canonicalBefore.source.revision);

    const detail = result(await f.owner.raw('GET', '/shortlists/' + shortlist.resourceId));
    assert.equal(detail.items.length, 1);
    assert.equal(detail.items[0].person.id, canonicalId);
    assert.equal(detail.items[0].updatedSinceAdded, true);
});


test('DEV-07G merged-id resolution does not reveal an alias outside the old identity scope', async () => {
    const f = await fixture();
    const scope = await ok(f.owner.cmd('POST', '/scopes', {
        name: '仅管理员可见的合并范围', membershipIds: [f.membershipId]
    }), 201);
    const inline = { ...sourceInput(), scopeId: scope.resourceId };
    const a = await ok(f.owner.cmd('POST', '/people', {
        displayName: '受限主档案', roles: ['model'], inlineSource: inline
    }), 201);
    const b = await ok(f.owner.cmd('POST', '/people', {
        displayName: '受限重复档案', roles: ['model'], inlineSource: inline
    }), 201);
    const p = await preview(f, a.resourceId, b.resourceId);
    assert.equal(p.complete, true);
    assert.equal((await f.owner.cmd('POST', '/people/merge', executeInput(p))).status, 200);

    const outsider = await member(f, 'merge_scope_outsider', 'EDITOR');
    assert.equal((await outsider.client.raw('GET', '/people/' + b.resourceId)).status, 404);
    const old = f.store.rows('people').find(x => x.id === b.resourceId)!;
    const write = await outsider.client.cmd('PATCH', '/people/' + b.resourceId, {
        expectedRevision: old.revision, intro: '不应借错误码探测旧ID'
    });
    assert.equal(write.status, 404);
    assert.equal(result(write).error.code, 'NOT_FOUND');

    const ownerRead = await ok(f.owner.raw('GET', '/people/' + b.resourceId));
    assert.equal(ownerRead.id, a.resourceId);
    assert.equal(ownerRead.resolvedFromId, b.resourceId);
});
