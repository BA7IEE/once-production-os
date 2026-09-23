import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Application } from '../../packages/core/src/api.ts';
import { AppError } from '../../packages/core/src/errors.ts';
import type { Actor } from '../../packages/core/src/model.ts';
import type { Store, Tx } from '../../packages/core/src/store.ts';
import { LIMITS } from '../../packages/core/src/model.ts';
import { permissionsFor, personVisible } from '../../packages/core/src/policy.ts';
import { loadVisibility } from '../../packages/core/src/visibility.ts';
import { base } from '../../packages/core/src/helpers.ts';
import { fixture, member, createPerson, sourceInput, result, Client } from '../support/fixtures.ts';
import { FaultStore } from '../support/fault-store.ts';

type Fixture = Awaited<ReturnType<typeof fixture>>;
async function grantSensitive(f: Fixture) {
    const m = f.store.rows('memberships').find(m => m.id === f.membershipId)!;
    if (m.extraPermissions.includes('sensitive.read') && m.extraPermissions.includes('sensitive.write')) return;
    assert.equal((await f.owner.cmd('PATCH', '/memberships/' + m.id + '/permissions', {
        expectedRevision: m.revision, role: 'ADMIN', extraPermissions: ['sensitive.read', 'sensitive.write'] })).status, 200);
    await f.owner.login();
}
async function queued(f: Fixture, client = f.owner) {
    const s = await f.owner.cmd('POST', '/sources', sourceInput());
    assert.equal(s.status, 201);
    const sourceId = result(s).resourceId as string;
    const p = await client.cmd('POST', '/imports/preview', { sourceId, rows: [
        { displayName: '复核导入甲', roles: ['model'] }, { displayName: '复核导入乙', roles: ['editor'] }] });
    assert.equal(p.status, 201);
    const batchId = result(p).resourceId as string;
    const c = await client.cmd('POST', '/imports/' + batchId + '/commit', { expectedRevision: 1, selectedRows: [0, 1] });
    assert.equal(c.status, 202);
    return { sourceId, batchId, jobId: result(c).resourceId as string };
}
async function partialFailure(f: Fixture, client = f.owner, code = 'STORE_BUSY') {
    const ids = await queued(f, client);
    const faults = new FaultStore(f.store);
    let failed = false;
    faults.afterInsert = (t, row) => {
        if (t === 'people' && 'displayName' in row && row.displayName === '复核导入乙' && !failed) {
            failed = true; throw new AppError(503, code, 'synthetic rollback');
        }
    };
    const worker = new Application(faults, f.app.config, f.clock);
    const claim = await worker.imports.claim(); assert.ok(claim);
    await worker.imports.process(claim);
    assert.ok(failed);
    assert.equal(f.store.rows('people').length, 1);
    assert.equal(f.store.rows('jobs')[0]!.state, 'FAILED');
    return { ...ids, claim, worker, faults };
}
const job = async (f: Fixture, id: string, client = f.owner) => result(await client.raw('GET', '/jobs/' + id));

test('R1 resume uses the same checkpoints; replay and two workers create exactly two people', async () => {
    const f = await fixture(); const q = await partialFailure(f);
    const state = await job(f, q.jobId);
    assert.equal(state.importedCount, 1); assert.equal(state.selectedCount, 2); assert.equal(state.canResume, true);
    const key = randomUUID(); const input = { expectedRevision: state.revision };
    const responses = await Promise.all(Array.from({ length: 4 }, () => f.owner.cmd('POST', '/jobs/' + q.jobId + '/resume', input, key)));
    assert.ok(responses.every(r => r.status === 202));
    assert.ok(responses.every(r => result(r).state === 'ACCEPTED'));
    assert.equal(f.store.rows('jobs').length, 1);
    assert.equal(f.store.rows('receipts').filter(r => r.operation === 'job.resume').length, 1);
    assert.equal(f.store.rows('audits').filter(r => r.action === 'job.resume').length, 1);
    assert.equal((await f.owner.cmd('POST', '/jobs/' + q.jobId + '/resume', input)).status, 409);
    await f.app.imports.process(q.claim); // Old lease cannot write to requeued job.
    assert.equal(f.store.rows('people').length, 1);
    const claims = await Promise.all([f.app.imports.claim(), q.worker.imports.claim()]);
    assert.equal(claims.filter(Boolean).length, 1);
    await f.app.imports.process(claims.find(Boolean)!);
    assert.equal(f.store.rows('people').length, 2);
    assert.equal(new Set(f.store.rows('people').map(p => p.displayName)).size, 2);
    assert.equal((await job(f, q.jobId)).state, 'SUCCEEDED');
    const replay = await f.owner.cmd('POST', '/jobs/' + q.jobId + '/resume', input, key);
    assert.equal(replay.status, 202); assert.equal(result(replay).replayed, true);
    assert.equal((await job(f, q.jobId)).state, 'SUCCEEDED');
    assert.equal(await f.app.imports.claim(), null);
});

test('R1 resume rejects changed payload under an existing command key', async () => {
    const f = await fixture(); const q = await partialFailure(f);
    const key = randomUUID(); const revision = (await job(f, q.jobId)).revision;
    assert.equal((await f.owner.cmd('POST', '/jobs/' + q.jobId + '/resume', { expectedRevision: revision }, key)).status, 202);
    const conflict = await f.owner.cmd('POST', '/jobs/' + q.jobId + '/resume', { expectedRevision: revision + 1 }, key);
    assert.equal(result(conflict).error.code, 'IDEMPOTENCY_KEY_CONFLICT');
});

for (const denial of ['suspended', 'source-revision', 'preview-expired', 'maintenance', 'scope-revoked'] as const) {
    test('R1 resume rechecks ' + denial, async () => {
        const f = await fixture(); const editor = await member(f, 'editor');
        const q = await partialFailure(f, editor.client);
        const before = f.store.rows('jobs')[0]!;
        if (denial === 'suspended') await f.owner.cmd('POST', '/sources/' + q.sourceId + '/suspend', { expectedRevision: 1, reason: '合成暂停说明' });
        if (denial === 'source-revision') await f.owner.cmd('PATCH', '/sources/' + q.sourceId, { expectedRevision: 1, title: '新来源版本' });
        if (denial === 'preview-expired') { f.clock.advance(LIMITS.importMs + 1); await editor.client.login('editor'); }
        if (denial === 'maintenance') f.app.config.accessMode = 'MAINTENANCE';
        if (denial === 'scope-revoked') {
            const s = await f.owner.cmd('POST', '/scopes', { name: '仅管理人', membershipIds: [f.membershipId] });
            await f.owner.cmd('PATCH', '/records/source/' + q.sourceId + '/scope', { expectedRevision: 1, scopeId: result(s).resourceId });
        }
        const denied = await editor.client.cmd('POST', '/jobs/' + q.jobId + '/resume', { expectedRevision: before.revision });
        assert.ok([403, 404, 409, 503].includes(denied.status), JSON.stringify(denied));
        assert.equal(f.store.rows('jobs')[0]!.state, 'FAILED');
        assert.equal(f.store.rows('jobs')[0]!.revision, before.revision);
        assert.equal(f.store.rows('people').length, 1);
    });
}

test('R1 another administrator cannot resume someone else\'s job', async () => {
    const f = await fixture(); const q = await partialFailure(f);
    const other = await member(f, 'admin2', 'ADMIN');
    assert.equal((await other.client.cmd('POST', '/jobs/' + q.jobId + '/resume', { expectedRevision: 3 })).status, 404);
});
test('R1 role revocation prevents resuming and also old receipt replay', async () => {
    const f = await fixture(); const e = await member(f, 'editor'); const q = await partialFailure(f, e.client);
    const input = { expectedRevision: (await job(f, q.jobId, e.client)).revision }; const key = randomUUID();
    assert.equal((await e.client.cmd('POST', '/jobs/' + q.jobId + '/resume', input, key)).status, 202);
    const m = f.store.rows('memberships').find(m => m.id === e.id)!;
    assert.equal((await f.owner.cmd('PATCH', '/memberships/' + m.id + '/permissions', { expectedRevision: m.revision, role: 'VIEWER', extraPermissions: [] })).status, 200);
    assert.equal((await e.client.cmd('POST', '/jobs/' + q.jobId + '/resume', input, key)).status, 401);
    await e.client.login('editor');
    assert.equal((await e.client.cmd('POST', '/jobs/' + q.jobId + '/resume', input, key)).status, 403);
    const claim = await f.app.imports.claim(); assert.ok(claim); await f.app.imports.process(claim);
    assert.equal(f.store.rows('people').length, 1);
});
test('R1 non-transient failure is not blindly resumable', async () => {
    const f = await fixture(); const q = await partialFailure(f, f.owner, 'UNIQUE_CONFLICT');
    const s = await job(f, q.jobId); assert.equal(s.canResume, false);
    const denied = await f.owner.cmd('POST', '/jobs/' + q.jobId + '/resume', { expectedRevision: s.revision });
    assert.equal(result(denied).error.code, 'JOB_NOT_RETRYABLE');
});
test('R1 explicit resume preserves the lifetime attempt cap', async () => {
    const f = await fixture(); const q = await partialFailure(f);
    q.faults.afterInsert = (t, row) => { if (t === 'people' && 'displayName' in row && row.displayName === '复核导入乙') throw new AppError(503, 'STORE_BUSY', 'synthetic'); };
    for (let n = 1; n < LIMITS.jobMaxAttempts; n++) {
        const s = await job(f, q.jobId);
        assert.equal((await f.owner.cmd('POST', '/jobs/' + q.jobId + '/resume', { expectedRevision: s.revision })).status, 202);
        const c = await q.worker.imports.claim(); assert.ok(c); await q.worker.imports.process(c);
    }
    const final = await job(f, q.jobId);
    assert.equal(final.attempts, LIMITS.jobMaxAttempts); assert.equal(final.canResume, false);
    assert.equal(final.resumeBlockedReason, 'ATTEMPTS_EXHAUSTED');
    assert.equal(f.store.rows('people').length, 1);
});
test('R1 resume requires CSRF and an idempotency key', async () => {
    const f = await fixture(); const q = await partialFailure(f);
    const input = { expectedRevision: (await job(f, q.jobId)).revision };
    assert.equal((await f.owner.raw('POST', '/jobs/' + q.jobId + '/resume', input)).status, 400);
    assert.equal((await f.owner.raw('POST', '/jobs/' + q.jobId + '/resume', input, { 'x-csrf-token': 'bad', 'idempotency-key': randomUUID() })).status, 403);
    assert.equal(f.store.rows('jobs')[0]!.state, 'FAILED');
});

test('R1 source edit/review/pause/re-review preserve distinct immutable versions and decision reasons', async () => {
    const f = await fixture(); await grantSensitive(f);
    const c = await f.owner.cmd('POST', '/sources', { ...sourceInput(), type: 'TEXT', textPayload: 'synthetic raw version one' });
    const id = result(c).resourceId;
    assert.equal((await f.owner.cmd('PATCH', '/sources/' + id, { expectedRevision: 1, textPayload: 'synthetic raw version two' })).status, 200);
    assert.equal((await f.owner.cmd('POST', '/sources/' + id + '/review', { expectedRevision: 2, basisDescription: 'second legitimate claim', validUntil: '2026-12-31T00:00:00.000Z' })).status, 200);
    assert.equal((await f.owner.cmd('POST', '/sources/' + id + '/suspend', { expectedRevision: 3, reason: 'distinct pause reason' })).status, 200);
    assert.equal(f.store.rows('sources')[0]!.basisDescription, 'second legitimate claim');
    const during = await f.owner.raw('GET', '/sources/' + id + '/history'); assert.equal(during.status, 200);
    assert.equal(result(during).items[0].decisionReason, 'distinct pause reason');
    assert.equal(result(await f.owner.raw('GET', '/sources/' + id)).basisDescription, '');
    assert.equal((await f.owner.cmd('POST', '/sources/' + id + '/review', { expectedRevision: 4, basisDescription: 'third legitimate claim', validUntil: '2026-12-31T00:00:00.000Z' })).status, 200);
    const versions = f.store.rows('sourceHistory');
    assert.deepEqual(versions.map(v => v.sourceRevision), [1, 2, 3, 4, 5]);
    assert.deepEqual(versions.map(v => v.action), ['CREATED', 'EDITED', 'REVIEWED', 'SUSPENDED', 'REVIEWED']);
    assert.equal(versions[0]!.snapshot.textPayload, 'synthetic raw version one');
    assert.equal(versions[3]!.snapshot.basisDescription, 'second legitimate claim');
    assert.equal(versions[3]!.decisionReason, 'distinct pause reason');
    assert.equal(versions[4]!.decisionReason, null);
    assert.ok(!JSON.stringify(f.store.rows('receipts')).includes('distinct pause reason'));
    assert.ok(!JSON.stringify(f.store.rows('audits')).includes('synthetic raw version one'));
});

test('R1 history is denied without BOTH review and sensitive-read, even to ADMIN', async () => {
    const f = await fixture(); const c = await f.owner.cmd('POST', '/sources', sourceInput()); const id = result(c).resourceId;
    const plainAdmin = await member(f, 'plainadmin', 'ADMIN');
    assert.equal((await plainAdmin.client.raw('GET', '/sources/' + id + '/history')).status, 403);
    const editor = await member(f, 'sensitiveeditor', 'EDITOR', ['sensitive.read']);
    assert.equal((await editor.client.raw('GET', '/sources/' + id + '/history')).status, 403);
    await grantSensitive(f);
    assert.equal((await f.owner.raw('GET', '/sources/' + id + '/history')).status, 200);
});
test('R1 history widening does not expose previously restricted snapshots', async () => {
    const f = await fixture(); await grantSensitive(f);
    const c = await f.owner.cmd('POST', '/sources', sourceInput(true)); const id = result(c).resourceId;
    const other = await member(f, 'reviewer', 'REVIEWER', ['sensitive.read']);
    assert.equal((await other.client.raw('GET', '/sources/' + id + '/history')).status, 404);
    const shared = await f.owner.cmd('POST', '/scopes', { name: '后来共享', membershipIds: [f.membershipId, other.id] });
    await f.owner.cmd('PATCH', '/records/source/' + id + '/scope', { expectedRevision: 1, scopeId: result(shared).resourceId });
    const h = result(await other.client.raw('GET', '/sources/' + id + '/history'));
    assert.equal(h.total, 1); assert.equal(h.items[0].action, 'SCOPE_CHANGED');
    assert.equal(result(await f.owner.raw('GET', '/sources/' + id + '/history')).total, 2);
});
test('R1 historical review is audited and source-history cannot be overwritten or removed through Store', async () => {
    const f = await fixture(); await grantSensitive(f);
    const c = await f.owner.cmd('POST', '/sources', sourceInput());
    await f.owner.raw('GET', '/sources/' + result(c).resourceId + '/history');
    assert.equal(f.store.rows('audits').filter(a => a.action === 'source.history-read').length, 1);
    const h = f.store.rows('sourceHistory')[0]!;
    await assert.rejects(f.store.transaction(tx => tx.replace('sourceHistory', { ...h, decisionReason: 'overwrite' })), /来源历史只允许追加/);
    await assert.rejects(f.store.transaction(tx => tx.remove('sourceHistory', h.id)), /来源历史只允许追加/);
});
test('R1 baseline flags never present old overwritten pause text as verified original basis', async () => {
    const f = await fixture(); await grantSensitive(f);
    // Synthetic representation of the additive SQL backfill; SQL itself has a separate DB test.
    const c = await f.owner.cmd('POST', '/sources', sourceInput());
    const source = f.store.rows('sources')[0]!;
    await f.store.transaction(async tx => {
        const legacy = { ...source, revision: 2, status: 'SUSPENDED' as const, basisDescription: 'old pause reason' };
        await tx.replace('sources', legacy);
        await tx.insert('sourceHistory', { ...base(f.workspaceId, f.clock), sourceId: source.id, sourceRevision: 2,
            scopeId: source.scopeId, actorId: null, action: 'BASELINE', decisionReason: null, baselineOnly: true, basisAmbiguous: true, snapshot: legacy });
    });
    const h = result(await f.owner.raw('GET', '/sources/' + result(c).resourceId + '/history')).items[0];
    assert.equal(h.baselineOnly, true); assert.equal(h.legacyBasisAmbiguous, true);
    const scope = await f.owner.cmd('POST', '/scopes', { name: '迁移后范围', membershipIds: [f.membershipId] });
    assert.equal((await f.owner.cmd('PATCH', '/records/source/' + source.id + '/scope', { expectedRevision: 2, scopeId: result(scope).resourceId })).status, 200);
    const moved = result(await f.owner.raw('GET', '/sources/' + source.id + '/history')).items[0];
    assert.equal(moved.baselineOnly, false); assert.equal(moved.legacyBasisAmbiguous, true);
    assert.equal((await f.owner.cmd('POST', '/sources/' + source.id + '/review', { expectedRevision: 3, basisDescription: '新提供并重新核验的依据', validUntil: '2026-12-31T00:00:00.000Z' })).status, 200);
    const reviewed = result(await f.owner.raw('GET', '/sources/' + source.id + '/history')).items;
    assert.equal(reviewed[0].legacyBasisAmbiguous, false);
    assert.equal(reviewed[1].legacyBasisAmbiguous, true);
});
test('R1 command replay and failed audit never duplicate or orphan source history', async () => {
    const f = await fixture(); const key = randomUUID(); const input = sourceInput();
    f.store.failNextAudit = true;
    assert.equal((await f.owner.cmd('POST', '/sources', input, key)).status, 500);
    assert.equal(f.store.rows('sourceHistory').length, 0);
    assert.equal((await f.owner.cmd('POST', '/sources', input, key)).status, 201);
    assert.equal((await f.owner.cmd('POST', '/sources', input, key)).status, 201);
    assert.equal(f.store.rows('sourceHistory').length, 1);
});

test('R1 field evidence becomes stale after a new source version, history remains', async () => {
    const f = await fixture(); const id = await createPerson(f.owner); const source = f.store.rows('sources')[0]!;
    assert.equal((await f.owner.cmd('POST', '/field-evidence', { personId: id, expectedRevision: 1, fieldPath: 'displayName', sourceId: source.id, sourceRevision: 1 })).status, 200);
    assert.equal((await f.owner.cmd('PATCH', '/sources/' + source.id, { expectedRevision: 1, title: 'new source title' })).status, 200);
    assert.equal(result(await f.owner.raw('GET', '/people/' + id)).evidence[0].state, 'STALE');
    assert.equal(f.store.rows('sourceHistory').length, 2);
});

test('R1 batch visibility agrees with original point checks for restricted/current/expired sources', async () => {
    const f = await fixture(); const e = await member(f, 'editor');
    await createPerson(f.owner, 'workspace'); await createPerson(f.owner, 'private', true);
    const p = await createPerson(f.owner, 'paused'); const s = f.store.rows('people').find(v => v.id === p)!.sourceId;
    await f.owner.cmd('POST', '/sources/' + s + '/suspend', { expectedRevision: 1, reason: 'paused synthetic' });
    const m = f.store.rows('memberships').find(m => m.id === e.id)!;
    const actor: Actor = { userId: m.userId, membershipId: m.id, workspaceId: m.workspaceId, role: m.role,
        permissions: permissionsFor(m), displayName: 'synthetic', userEpoch: 1, sessionId: 'test-only' };
    await f.store.transaction(async tx => {
        const index = await loadVisibility(tx, actor, f.clock);
        for (const person of await tx.find('people')) assert.equal(index.personVisible(person), await personVisible(tx, actor, person, f.clock));
    });
    assert.equal(result(await e.client.raw('GET', '/people')).total, 1);
});

test('R1 100 existing people + 100 import rows use bounded Store reads, not N times M queries', async () => {
    const f = await fixture(); const first = await createPerson(f.owner, 'existing0');
    const template = f.store.rows('people').find(p => p.id === first)!;
    await f.store.transaction(async tx => {
        for (let n = 1; n < 100; n++) await tx.insert('people', { ...template, ...base(f.workspaceId, f.clock), displayName: 'existing' + n });
    });
    const original = f.store.transaction.bind(f.store); let reads = 0;
    f.store.transaction = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => original(tx => fn({ ...tx,
        get: async (t, id) => { reads++; return tx.get(t, id); }, find: async (t, where) => { reads++; return tx.find(t, where); } }));
    const res = await f.owner.cmd('POST', '/imports/preview', { sourceId: template.sourceId,
        rows: Array.from({ length: 100 }, (_, i) => ({ displayName: 'existing' + i, roles: ['model'] })) });
    assert.equal(res.status, 201); assert.ok(reads <= 20, 'Store read budget exceeded: ' + reads);
    assert.ok(f.store.rows('imports')[0]!.rows.every(r => r.issues.length === 1));
    console.log(JSON.stringify({ metric: 'R1-preview-100x100', storeReads: reads, backend: 'MemoryStore instrumentation; not PG latency' }));
});
test('R1 duplicate-name hints neither leak private names nor miss an exact match behind five prefix matches', async () => {
    const f = await fixture(); const e = await member(f, 'editor');
    await createPerson(f.owner, 'HiddenName', true);
    await createPerson(f.owner, 'ExactName');
    for (let i = 0; i < 6; i++) { f.clock.advance(1); await createPerson(f.owner, 'ExactName' + i); }
    const source = await f.owner.cmd('POST', '/sources', sourceInput());
    const p = await e.client.cmd('POST', '/imports/preview', { sourceId: result(source).resourceId, rows: [
        { displayName: 'HiddenName', roles: ['model'] }, { displayName: 'ExactName', roles: ['model'] }] });
    assert.equal(p.status, 201);
    const rows = result(await e.client.raw('GET', '/imports/' + result(p).resourceId)).rows;
    assert.deepEqual(rows[0].issues, []); assert.equal(rows[1].issues.length, 1);
});

test('R1 an old-binary history gap blocks further mutation instead of manufacturing missing evidence', async () => {
    const f = await fixture(); const c = await f.owner.cmd('POST', '/sources', sourceInput());
    const id = result(c).resourceId;
    await f.store.transaction(async tx => {
        const source = (await tx.get('sources', id))!;
        await tx.replace('sources', { ...source, revision: 2, title: 'synthetic old binary write without history' });
    });
    const denied = await f.owner.cmd('POST', '/sources/' + id + '/suspend', { expectedRevision: 2, reason: 'must not manufacture a previous version' });
    assert.equal(denied.status, 409); assert.equal(result(denied).error.code, 'HISTORY_BASELINE_MISSING');
    assert.equal(f.store.rows('sources')[0]!.status, 'CONFIRMED');
    assert.equal(f.store.rows('sourceHistory').length, 1);
});
