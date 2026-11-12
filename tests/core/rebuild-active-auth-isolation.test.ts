import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { JsonRebuild } from '../../packages/core/src/rebuild.ts';
import { REBUILD_EMPTY_TABLES } from '../../packages/core/src/rebuild-model.ts';
import { AppError } from '../../packages/core/src/errors.ts';
import { MemoryStore } from '../support/memory-store.ts';
import { authFixture, loginTalent } from '../support/talent-auth.ts';

// Deliberately independent of the production table list, to catch an omitted table.
const talentAuthTables = [
    'talentAccounts', 'talentIdentities', 'talentSessions',
    'talentAuthContexts', 'talentAuthChallenges', 'talentAuthDeliveries'
] as const;

function payload() {
    const sourceId = randomUUID();
    return {
        schemaVersion: 'once-export-v1', exportId: randomUUID(), frozenAt: '2026-09-23T07:30:00.000Z',
        manifest: {
            schemaVersion: 'once-export-v1', frozenAt: '2026-09-23T07:30:00.000Z',
            sources: [{ id: sourceId, revision: 1, protectionEpoch: 1, data: { title: '合成来源', type: 'MANUAL', providerClaim: '合成提供方', basisMode: 'INTERNAL_USE', basisDescription: '仅供隔离测试的合成依据', validFrom: '2026-09-01T00:00:00.000Z', validUntil: '2026-12-31T00:00:00.000Z', status: 'CONFIRMED' } }],
            people: [{ id: randomUUID(), sourceId, revision: 1, data: { displayName: '合成迁移对象', roles: ['model'], status: 'DRAFT' } }],
            works: [], projects: [], media: [], relations: { workCredits: [], projectParticipants: [], projectWorks: [] }
        }
    };
}

function fingerprint(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isIsolationError(error: unknown) {
    return error instanceof AppError && error.status === 409 && error.code === 'REBUILD_TARGET_NOT_ISOLATED';
}

async function makeTarget() {
    const store = new MemoryStore();
    const f = await authFixture(store);
    const rebuild = new JsonRebuild(f.clock);
    const actor = await store.transaction(tx => rebuild.actorFromTarget(tx, 'owner'));
    const input = payload();
    return {
        store, f,
        check: () => store.transaction(tx => rebuild.preview(tx, actor, input)),
        apply: () => store.transaction(tx => rebuild.apply(tx, actor, input, { requestId: randomUUID(), ip: 'CLI' }))
    };
}

test('empty talent-auth target still supports CHECK and APPLY after internal catalog preparation', async () => {
    const t = await makeTarget();
    const catalog = await t.f.owner.cmd('POST', '/catalog/items', {
        namespace: 'industry', code: 'rebuild_auth_control', labelZh: '合成行业', labelEn: 'Synthetic industry'
    });
    assert.equal(catalog.status, 201);
    assert.ok(t.store.rows('receipts').some(row => row.principalKind === 'INTERNAL'));
    for (const table of talentAuthTables) assert.equal(t.store.rows(table).length, 0, table);
    assert.equal((await t.check()).counts.people, 1);
    assert.equal((await t.apply()).counts.people, 1);
    assert.equal(t.store.rows('people').length, 1);
    for (const table of talentAuthTables) assert.equal(t.store.rows(table).length, 0, table);
});

test('each populated talent-auth table independently blocks CHECK and APPLY without altering records', async t => {
    const donor = await makeTarget();
    await loginTalent(donor.f, 'rebuild-isolation-synthetic@example.com');

    for (const table of talentAuthTables) {
        await t.test(table, async () => {
            const target = await makeTarget();
            const workspaceId = target.store.rows('workspaces')[0]!.id;
            const donorRows = donor.store.rows(table);
            assert.equal(donorRows.length, 1);
            // MemoryStore intentionally does not enforce PostgreSQL foreign keys. Isolating a
            // child row this way exercises each check independently, not a valid PG fixture.
            await target.store.transaction(tx => tx.insert(table, { ...donorRows[0]!, workspaceId } as never));
            for (const other of talentAuthTables) assert.equal(target.store.rows(other).length, other === table ? 1 : 0, other);
            for (const business of REBUILD_EMPTY_TABLES) assert.equal(target.store.rows(business).length, 0, business);
            const before = fingerprint(target.store.rows(table));
            await assert.rejects(target.check(), isIsolationError);
            await assert.rejects(target.apply(), isIsolationError);
            assert.equal(fingerprint(target.store.rows(table)), before);
            for (const business of REBUILD_EMPTY_TABLES) assert.equal(target.store.rows(business).length, 0, business);
        });
    }
});

test('a live talent login created after CHECK blocks APPLY and remains usable', async () => {
    const t = await makeTarget();
    assert.equal((await t.check()).counts.people, 1);
    const talent = await loginTalent(t.f, 'rebuild-isolation-live@example.com');
    assert.equal((await talent.client.raw('GET', '/portal/me')).status, 200);
    assert.equal(t.store.rows('talentAccounts').filter(row => row.status === 'ACTIVE').length, 1);
    assert.equal(t.store.rows('talentIdentities').length, 1);
    assert.equal(t.store.rows('talentSessions').filter(row => !row.revokedAt).length, 1);
    for (const business of REBUILD_EMPTY_TABLES) assert.equal(t.store.rows(business).length, 0, business);
    const before = fingerprint(talentAuthTables.map(table => t.store.rows(table)));
    await assert.rejects(t.check(), isIsolationError);
    await assert.rejects(t.apply(), isIsolationError);
    assert.equal(fingerprint(talentAuthTables.map(table => t.store.rows(table))), before);
    assert.equal((await talent.client.raw('GET', '/portal/me')).status, 200);
    assert.equal(t.store.rows('people').length, 0);
});
