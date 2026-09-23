/** Real PostgreSQL tests. NOT executed in the offline development environment.
 * This suite deliberately leaves its synthetic records in a disposable database.
 * It never deletes, truncates, drops or restores a database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaStore } from '../../apps/api/src/prisma-store.ts';
import { Application } from '../../packages/core/src/api.ts';
import type { Config } from '../../packages/core/src/model.ts';
import { LIMITS } from '../../packages/core/src/model.ts';
import { FakeClock, Client, SYNTHETIC_PASSWORD, sourceInput, result } from '../support/fixtures.ts';
function testUrl(): string {
    assert.equal(process.env.ALLOW_DB_TESTS, 'yes', 'Set ALLOW_DB_TESTS=yes only for a fresh disposable local database.');
    const raw = process.env.DATABASE_URL_TEST;
    assert.ok(raw, 'DATABASE_URL_TEST is required; DATABASE_URL is intentionally not used.');
    const url = new URL(raw);
    assert.ok(['postgresql:', 'postgres:'].includes(url.protocol));
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Only loopback PostgreSQL is permitted.');
    assert.match(url.pathname, /^\/once_test_[a-z0-9_]+$/);
    assert.equal(url.search, '', 'Connection query parameters are disabled in this safety profile.');
    assert.ok(url.username && url.password, 'Use explicit test credentials.');
    return raw;
}
test('fresh disposable PostgreSQL: constraints, real transactions and independent workers', async (t) => {
    const url = testUrl();
    const a = new PrismaClient({ datasources: { db: { url } }, log: [] });
    const b = new PrismaClient({ datasources: { db: { url } }, log: [] });
    const storeA = new PrismaStore(a);
    const storeB = new PrismaStore(b);
    try {
        await a.$connect();
        await b.$connect();
        assert.equal(await a.workspace.count(), 0, 'Test database must be empty. Create a new database; never clear an existing one automatically.');
        const clock = new FakeClock();
        const config: Config = { origin: 'https://postgres.test.invalid', secureCookies: true,
            contactKey: randomBytes(32), csrfKey: randomBytes(32), recoveryEpoch: randomBytes(24).toString('hex'),
            accessMode: 'INTERNAL', environment: 'test' };
        const appA = new Application(storeA, config, clock);
        const appB = new Application(storeB, config, clock);
        const identity = await appA.identity.bootstrap('owner', '仅限合成测试管理员', SYNTHETIC_PASSWORD);
        const ownerA = new Client(appA);
        const ownerB = new Client(appB, '192.0.2.77');
        assert.equal((await ownerA.login()).status, 200);
        assert.equal((await ownerB.login()).status, 200);
        let personId = '';
        await t.test('two independent clients serialize the same command into one source/person/receipt', async () => {
            const key = randomUUID();
            const body = { displayName: 'PG合成人物', roles: ['model'], inlineSource: sourceInput() };
            const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? ownerA : ownerB).cmd('POST', '/people', body, key)));
            assert.ok(responses.every(r => r.status === 201), JSON.stringify(responses.map(r => r.body)));
            personId = String(result(responses[0]!).resourceId);
            assert.equal(new Set(responses.map(r => result(r).resourceId)).size, 1);
            assert.equal(await a.person.count(), 1);
            assert.equal(await a.sourceRecord.count(), 1);
            assert.equal(await a.commandReceipt.count(), 1);
        });
        await t.test('actual PostgreSQL rollback includes domain rows and audit', async () => {
            const before = await a.person.findUniqueOrThrow({ where: { id: personId } });
            const auditCount = await a.auditEvent.count();
            await assert.rejects(storeA.transaction(async (tx) => {
                const row = await tx.get('people', personId);
                assert.ok(row);
                await tx.replace('people', { ...row, intro: 'must roll back', revision: row.revision + 1 });
                throw new Error('synthetic injected failure');
            }));
            const after = await a.person.findUniqueOrThrow({ where: { id: personId } });
            assert.equal(after.intro, before.intro);
            assert.equal(after.revision, before.revision);
            assert.equal(await a.auditEvent.count(), auditCount);
        });
        await t.test('database itself rejects cross-workspace scope membership', async () => {
            const secondWorkspace = randomUUID();
            const foreignScope = randomUUID();
            const now = clock.now();
            await a.workspace.create({ data: { id: secondWorkspace, name: '隔离合成空间', createdAt: now, recoveryEpoch: config.recoveryEpoch } });
            await a.accessScope.create({ data: { id: foreignScope, workspaceId: secondWorkspace, name: '跨域反例', mode: 'RESTRICTED', revision: 1, createdAt: now, updatedAt: now } });
            await assert.rejects(a.scopeMember.create({ data: { id: randomUUID(), workspaceId: identity.workspaceId,
                    scopeId: foreignScope, membershipId: identity.membershipId, revision: 1, createdAt: now, updatedAt: now } }));
            assert.equal(await a.scopeMember.count({ where: { workspaceId: identity.workspaceId, scopeId: foreignScope } }), 0);
        });
        await t.test('two stale CAS writes cannot both succeed', async () => {
            const existing = result(await ownerA.raw('GET', '/people/' + personId));
            const requests = await Promise.all([ownerA, ownerB].map((c, i) => c.cmd('PATCH', '/people/' + personId, { expectedRevision: existing.revision, intro: `concurrent-${i}` })));
            assert.deepEqual(requests.map(r => r.status).sort(), [200, 409]);
        });
        await t.test('two workers claim once; expired owner cannot modify replacement lease', async () => {
            const source = await ownerA.cmd('POST', '/sources', sourceInput());
            assert.equal(source.status, 201);
            const preview = await ownerA.cmd('POST', '/imports/preview', { sourceId: result(source).resourceId,
                rows: [{ displayName: 'PG导入甲', roles: ['model'] }, { displayName: 'PG导入乙', roles: ['editor'] }] });
            assert.equal(preview.status, 201);
            const committed = await ownerA.cmd('POST', `/imports/${result(preview).resourceId}/commit`, { expectedRevision: 1, selectedRows: [0, 1] });
            assert.equal(committed.status, 202);
            assert.equal(result(committed).state, 'ACCEPTED');
            const before = await a.person.count();
            const claims = await Promise.all([appA.imports.claim(), appB.imports.claim()]);
            assert.equal(claims.filter(Boolean).length, 1);
            const old = claims.find(Boolean)!;
            clock.advance(LIMITS.jobLeaseMs);
            const current = await appB.imports.claim();
            assert.ok(current);
            await appA.imports.process(old);
            assert.equal(await a.person.count(), before);
            await appB.imports.process(current);
            assert.equal(await a.person.count(), before + 2);
            assert.equal(result(await ownerA.raw('GET', `/jobs/${result(committed).resourceId}`)).state, 'SUCCEEDED');
        });
    }
    finally {
        await Promise.all([storeA.close(), storeB.close()]);
    }
});
