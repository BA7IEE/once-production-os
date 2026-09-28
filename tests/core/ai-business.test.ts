import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, result } from '../support/fixtures.ts';
import { aiBusinessFixture, verifyAiBusiness } from '../support/ai-business.ts';
test('AI extraction produces a reviewable proposal and applies selected fields exactly once', async () => { await verifyAiBusiness(await fixture()); });
test('AI strict source permission and minimum input checks precede reservation', async () => {
    const f = await fixture(), t = await aiBusinessFixture(f);
    for (const extra of [{ confirmMinimizedInput: false }, { queryText: 'unexpected' }, { taskType: 'suggest_tags' }, { sources: [{ ...t.input.sources[0], end: 99999 }] }])
        assert.ok((await f.owner.cmd('POST', '/ai-jobs', { ...t.input, ...extra })).status >= 400);
    assert.equal(f.store.rows('aiRuns').length, 0);
    assert.equal((await f.owner.cmd('POST', '/ai-grants/' + t.grant + '/revoke', { expectedRevision: 1 })).status, 200);
    assert.equal((await f.owner.cmd('POST', '/ai-jobs', t.input)).status, 409);
});
test('AI source changes prevent dispatch and stale proposals cannot write facts', async () => {
    const f = await fixture(), t = await aiBusinessFixture(f), id = await t.create();
    await t.dispatch(id, [{ field: 'intro', value: 'proposal', evidence: t.evidence }]);
    await f.store.transaction(async (tx) => { const source = await tx.get('sources', t.source); await tx.replace('sources', { ...source!, revision: source!.revision + 1 }); });
    const detail = result(await f.owner.raw('GET', '/ai-jobs/' + id));
    assert.equal(detail.stale, true);
    assert.equal((await f.owner.cmd('POST', '/proposals/' + id + '/apply', { expectedRevision: detail.revision, selectedFields: ['intro'] })).status, 409);
});
test('AI parse search confirms a restricted filter object and never writes facts', async () => {
    const f = await fixture(), t = await aiBusinessFixture(f), id = await t.create({ taskType: 'parse_search', subjectKind: 'NONE', subjectId: null, expectedRevision: null, locale: null, sources: [], queryText: 'Find photographers', confirmMinimizedInput: true });
    await t.dispatch(id, [{ field: 'filters', value: { role: 'photographer' }, evidence: [] }]);
    assert.equal((await f.owner.raw('GET', '/ai-jobs/' + id + '/results')).status, 409);
    const detail = result(await f.owner.raw('GET', '/ai-jobs/' + id));
    assert.equal((await f.owner.cmd('POST', '/proposals/' + id + '/apply', { expectedRevision: detail.revision, selectedFields: ['filters'] })).status, 200);
    assert.equal((await f.owner.raw('GET', '/ai-jobs/' + id + '/results')).status, 200);
});
test('AI locale creates an unreviewed draft and work tags stay within the approved dictionary', async () => {
    const f = await fixture(), t = await aiBusinessFixture(f);
    const localeId = await t.create({ ...t.input, taskType: 'draft_locale', locale: 'en' });
    assert.equal((await t.dispatch(localeId, [{ field: 'text', value: 'Internal English draft', evidence: t.evidence }])).state, 'SETTLED');
    const proposal = result(await f.owner.raw('GET', '/ai-jobs/' + localeId));
    assert.equal((await f.owner.cmd('POST', '/proposals/' + localeId + '/apply', { expectedRevision: proposal.revision, selectedFields: ['text'] })).status, 200);
    assert.equal(f.store.rows('localeTexts')[0]!.state, 'DRAFT');
    assert.equal(f.store.rows('localeTexts')[0]!.reviewedBy, null);
    const work = result(await f.owner.cmd('POST', '/works', { title: 'Test work', sourceId: t.source })).resourceId;
    await f.owner.cmd('POST', '/catalog/items', { namespace: 'workType', code: 'portrait', labelZh: '人像', labelEn: 'Portrait' });
    const type = f.store.rows('dictionary').find(d => d.namespace === 'workType' && d.status === 'ACTIVE')!;
    const tags = await t.create({ ...t.input, taskType: 'suggest_tags', subjectKind: 'WORK', subjectId: work });
    assert.equal((await t.dispatch(tags, [{ field: 'workTypeCodes', value: [type.code], evidence: t.evidence }])).state, 'SETTLED');
    const tagProposal = result(await f.owner.raw('GET', '/ai-jobs/' + tags));
    assert.equal((await f.owner.cmd('POST', '/proposals/' + tags + '/apply', { expectedRevision: tagProposal.revision, selectedFields: ['workTypeCodes'] })).status, 200);
    assert.deepEqual(f.store.rows('works')[0]!.workTypeCodes, [type.code]);
});
test('AI selected fields and proposal state roll back together on audit failure', async () => {
    const f = await fixture(), t = await aiBusinessFixture(f), id = await t.create();
    await t.dispatch(id, [{ field: 'intro', value: 'New intro', evidence: t.evidence }, { field: 'displayName', value: 'New name', evidence: t.evidence }]);
    const detail = result(await f.owner.raw('GET', '/ai-jobs/' + id)), input = { expectedRevision: detail.revision, selectedFields: ['intro'] };
    f.store.failNextAudit = true;
    assert.equal((await f.owner.cmd('POST', '/proposals/' + id + '/apply', input)).status, 500);
    assert.equal(f.store.rows('aiTasks')[0]!.proposalState, 'PENDING');
    assert.equal(f.store.rows('people')[0]!.intro, '');
    assert.equal((await f.owner.cmd('POST', '/proposals/' + id + '/apply', input)).status, 200);
    assert.deepEqual(f.store.rows('aiTasks')[0]!.discardedFields, ['displayName']);
    assert.equal(f.store.rows('people')[0]!.displayName, 'Original artist');
});
test('AI malformed output and invented quotations never become proposals or verified facts', async () => {
    for (const changes of [[{ field: 'verified', value: true, evidence: [] }], [{ field: 'intro', value: 'New', evidence: [{ sourceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', start: 0, end: 3, quote: 'bad' }] }]]) {
        const f = await fixture(), t = await aiBusinessFixture(f), id = await t.create();
        assert.equal((await t.dispatch(id, changes)).state, 'UNKNOWN');
        assert.equal(f.store.rows('aiTasks')[0]!.proposalState, 'NONE');
        assert.equal(f.store.rows('aiBudgets')[0]!.reservedUnits, 50);
    }
});
test('AI source-linked proposals and grant evidence erase together without releasing unknown fees', async () => {
    const { affectedAi, aiErasureSnapshot, eraseAi } = await import('../../packages/core/src/ai-maintenance.ts');
    const { JsonRebuild } = await import('../../packages/core/src/rebuild.ts');
    const f = await fixture(), t = await aiBusinessFixture(f), id = await t.create();
    await t.dispatch(id, [{ field: 'intro', value: 'Derived words', evidence: t.evidence }]);
    const actor = await f.store.transaction(tx => new JsonRebuild(f.clock).actorFromTarget(tx, 'owner'));
    const refs = await f.store.transaction(tx => affectedAi(tx, f.workspaceId, [['SOURCE', new Set([t.source])]]));
    assert.equal(refs.length, 2);
    await f.store.transaction(async (tx) => { for (const ref of refs) {
        const snapshot = await aiErasureSnapshot(tx, actor, ref.resourceKind, ref.resourceId);
        await eraseAi(tx, actor, { ...ref, decision: 'APPLY_PROPOSED', cleanupState: 'PENDING', detailCode: snapshot.detailCode } as any, f.clock, { requestId: id, ip: 'test' });
    } });
    assert.equal(f.store.rows('aiTasks')[0]!.proposalState, 'ERASED');
    assert.deepEqual(f.store.rows('aiTasks')[0]!.output, {});
    assert.equal(f.store.rows('aiGrants')[0]!.evidenceNote, '');
    assert.equal((await f.owner.raw('GET', '/ai-jobs/' + id)).status, 404);
});
test('AI explicit permission and current source scope govern content, counts and replay', async () => {
    const f = await fixture(), t = await aiBusinessFixture(f), id = await t.create();
    const current = f.store.rows('memberships')[0]!;
    await f.store.transaction(tx => tx.replace('memberships', { ...current, role: 'VIEWER' }));
    assert.equal((await f.owner.raw('GET', '/ai-jobs/' + id)).status, 403);
    await f.store.transaction(tx => tx.replace('memberships', { ...current, extraPermissions: current.extraPermissions.filter(p => p !== 'ai.use') }));
    assert.equal((await f.owner.raw('GET', '/ai-jobs')).status, 403);
    await f.store.transaction(tx => tx.replace('memberships', current));
    const source = f.store.rows('sources')[0]!;
    await f.store.transaction(tx => tx.replace('sources', { ...source, status: 'SUSPENDED', protectionEpoch: 2 }));
    assert.equal((await f.owner.raw('GET', '/ai-jobs/' + id)).status, 404);
    assert.equal(result(await f.owner.raw('GET', '/ai-jobs')).total, 0);
});
test('AI recovery revokes grants, rejects pending proposals and retains unresolved charges', async () => {
    const { isolateAi } = await import('../../packages/core/src/ai-maintenance.ts'), { AiLedger } = await import('../../packages/core/src/ai-ledger.ts');
    const f = await fixture(), t = await aiBusinessFixture(f), id = await t.create();
    const run = f.store.rows('aiTasks')[0]!.runId;
    await f.store.transaction(tx => new AiLedger(f.clock).begin(tx, f.workspaceId, run, f.app.config.ai!, { requestId: id, ip: 'test' }));
    await f.store.transaction(tx => isolateAi(tx, f.workspaceId, f.clock, { requestId: id, ip: 'test' }));
    assert.equal(f.store.rows('aiGrants')[0]!.status, 'REVOKED');
    assert.equal(f.store.rows('aiRuns')[0]!.state, 'UNKNOWN');
    assert.equal(f.store.rows('aiRuns')[0]!.cancelRequested, true);
    assert.equal(f.store.rows('aiBudgets')[0]!.reservedUnits, 50);
});
test('AI person deletion uses the normal impact, decision, freeze and cleanup workflow', async () => {
    const f = await fixture(), t = await aiBusinessFixture(f), id = await t.create();
    await t.dispatch(id, [{ field: 'intro', value: 'Sensitive derivative', evidence: t.evidence }]);
    const input = { targetKind: 'PERSON', targetId: t.person, expectedRevision: 1 }, preview = result(await f.owner.raw('POST', '/deletion-requests/preview', input));
    assert.equal(preview.complete, true);
    const created = await f.owner.cmd('POST', '/deletion-requests', { ...input, previewDigest: preview.previewDigest, reason: 'Synthetic person and AI erasure' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const requestId = result(created).resourceId;
    const request = () => f.store.rows('deletionRequests').find(r => r.id === requestId)!;
    assert.equal((await f.owner.cmd('POST', `/deletion-requests/${requestId}/block`, { expectedRevision: 1, previewDigest: preview.previewDigest, acknowledgeBlock: true })).status, 200);
    const items = f.store.rows('deletionItems').filter(i => i.requestId === requestId);
    assert.ok(items.some(i => i.resourceKind === 'aiTask'));
    for (const item of items)
        if (item.decision === 'PENDING')
            assert.equal((await f.owner.cmd('POST', `/deletion-requests/${requestId}/decisions`, { expectedRevision: request().revision, entryId: item.id, decision: 'APPLY_PROPOSED', decisionReason: 'Clear source derived proposal' })).status, 200);
    for (const [path, body] of [['plan/freeze', { expectedRevision: request().revision, acknowledgePlan: true }]] as const)
        assert.equal((await f.owner.cmd('POST', `/deletion-requests/${requestId}/${path}`, body)).status, 200);
    const started = await f.owner.cmd('POST', `/deletion-requests/${requestId}/cleaning/start`, { expectedRevision: request().revision, planDigest: request().planDigest, acknowledgeIrreversible: true });
    assert.equal(started.status, 200, JSON.stringify(started.body));
    const claim = await f.app.deletionCleanup.claim();
    assert.ok(claim);
    await f.app.deletionCleanup.process(claim);
    assert.equal(f.store.rows('aiTasks')[0]!.proposalState, 'ERASED');
    assert.deepEqual(f.store.rows('aiTasks')[0]!.oldValues, {});
    const final = await f.app.deletionFinalization.claim();
    assert.ok(final);
    await f.app.deletionFinalization.finish(final);
    assert.equal(request().state, 'COMPLETED');
});
