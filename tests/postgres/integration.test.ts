import { runProductionContracts } from "./production-contracts.ts";
import { runShortlistContracts } from "./shortlist-contracts.ts";
import { runSearchContracts } from "./search-contracts.ts";
/** Real PostgreSQL tests. NOT executed in the offline development environment.
 * This suite deliberately leaves its synthetic records in a disposable database.
 * It never deletes, truncates, drops or restores a database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaStore } from '../../apps/api/src/prisma-store.ts';
import { FaultStore } from '../support/fault-store.ts';
import { AppError } from '../../packages/core/src/errors.ts';
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
            accessMode: 'INTERNAL', environment: 'test', mediaEnabled: true };
        const appA = new Application(storeA, config, clock);
        const appB = new Application(storeB, config, clock);
        const identity = await appA.identity.bootstrap('owner', '仅限合成测试管理员', SYNTHETIC_PASSWORD);
        const ownerA = new Client(appA);
        const ownerB = new Client(appB, '192.0.2.77');
        assert.equal((await ownerA.login()).status, 200);
        assert.equal((await ownerB.login()).status, 200);
        // Login intentionally requires exactly one installed workspace. Establish real test
        // identities before later FK-negative fixtures add foreign workspaces; do not weaken
        // the production installation gate or ignore failed activation/login responses.
        const senderCreated = await ownerA.raw('POST', '/memberships', { loginName: 'pg_handoff_sender', displayName: 'PG交接发起人', role: 'EDITOR', extraPermissions: [] });
        const recipientCreated = await ownerA.raw('POST', '/memberships', { loginName: 'pg_handoff_receiver', displayName: 'PG交接接收人', role: 'ADMIN', extraPermissions: ['sensitive.read', 'sensitive.write'] });
        assert.equal(senderCreated.status, 201);
        assert.equal(recipientCreated.status, 201);
        const sender = new Client(appA, '192.0.2.80'), receiver = new Client(appB, '192.0.2.81');
        assert.equal((await sender.activate(result(senderCreated).activationToken)).status, 200);
        assert.equal((await sender.login('pg_handoff_sender')).status, 200);
        assert.equal((await receiver.activate(result(recipientCreated).activationToken)).status, 200);
        assert.equal((await receiver.login('pg_handoff_receiver')).status, 200);
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
        await t.test('actual PostgreSQL person-update rollback (atomic command coverage follows below)', async () => {
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
        // Each fault is thrown AFTER the target SQL insert, not before it and not merely
        // asserted by an unchanged audit count. Domain + history + audit + receipt roll back together.
        for (const stage of ['sourceHistory', 'people', 'audits', 'receipts'] as const) {
            await t.test('real command rollback after ' + stage + ' insert, plus same-key successful retry', async () => {
                const faults = new FaultStore(storeA);
                let fired = false;
                faults.afterInsert = (table) => {
                    if (table === stage && !fired) {
                        fired = true;
                        throw new Error('synthetic after-insert failure');
                    }
                };
                const failApp = new Application(faults, config, clock);
                const c = new Client(failApp);
                c.jar = { ...ownerA.jar };
                c.csrf = ownerA.csrf;
                const counts = async () => ({ people: await a.person.count(), sources: await a.sourceRecord.count(),
                    history: await a.sourceHistory.count(), audits: await a.auditEvent.count(), receipts: await a.commandReceipt.count() });
                const before = await counts();
                const key = randomUUID();
                const body = { displayName: 'PG rollback ' + stage, roles: ['model'], inlineSource: sourceInput() };
                assert.equal((await c.cmd('POST', '/people', body, key)).status, 503);
                assert.ok(fired, 'the targeted SQL write must actually have run');
                assert.ok(faults.insertTrace.includes(stage));
                assert.deepEqual(await counts(), before, 'all inserts must have rolled back');
                const success = await ownerA.cmd('POST', '/people', body, key);
                assert.equal(success.status, 201);
                assert.deepEqual(await counts(), Object.fromEntries(Object.entries(before).map(([k, v]) => [k, v + 1])));
                const replay = await ownerB.cmd('POST', '/people', body, key);
                assert.equal(replay.status, 201);
                assert.equal(result(replay).resourceId, result(success).resourceId);
                assert.deepEqual(await counts(), Object.fromEntries(Object.entries(before).map(([k, v]) => [k, v + 1])));
            });
        }
        await t.test('new source-history SQL constraints reject duplicate revision, cross-scope FK, UPDATE and DELETE', async () => {
            const h = await a.sourceHistory.findFirstOrThrow({ where: { workspaceId: identity.workspaceId } });
            const input = { ...h, id: randomUUID(), snapshot: h.snapshot as Prisma.InputJsonValue };
            await assert.rejects(a.sourceHistory.create({ data: input }));
            await assert.rejects(a.sourceHistory.update({ where: { id: h.id }, data: { decisionReason: 'synthetic overwrite' } }), /sourceHistory is append-only/);
            await assert.rejects(a.sourceHistory.delete({ where: { id: h.id } }), /sourceHistory is append-only/);
            const foreign = await a.accessScope.findFirstOrThrow({ where: { workspaceId: { not: identity.workspaceId } } });
            await assert.rejects(a.sourceHistory.create({ data: { ...input, id: randomUUID(), scopeId: foreign.id,
                    sourceRevision: 123456, snapshot: { ...(h.snapshot as Prisma.JsonObject), scopeId: foreign.id, revision: 123456 } } }));
            assert.equal(await a.sourceHistory.count({ where: { workspaceId: identity.workspaceId, sourceId: h.sourceId, sourceRevision: 123456 } }), 0);
        });
        await t.test('PG partial import resume retains checkpoints, idempotency and two-worker ownership', async () => {
            const source = await ownerA.cmd('POST', '/sources', sourceInput());
            const preview = await ownerA.cmd('POST', '/imports/preview', { sourceId: result(source).resourceId,
                rows: [{ displayName: 'PG resume 1', roles: ['model'] }, { displayName: 'PG resume 2', roles: ['editor'] }] });
            assert.equal(preview.status, 201);
            const queued = await ownerA.cmd('POST', '/imports/' + result(preview).resourceId + '/commit', { expectedRevision: 1, selectedRows: [0, 1] });
            assert.equal(queued.status, 202);
            const jobId = result(queued).resourceId;
            const faults = new FaultStore(storeA);
            let fired = false;
            faults.afterInsert = (table, row) => {
                if (table === 'people' && 'displayName' in row && row.displayName === 'PG resume 2' && !fired) {
                    fired = true;
                    throw new AppError(503, 'STORE_BUSY', 'synthetic row rollback');
                }
            };
            const worker = new Application(faults, config, clock);
            const before = await a.person.count();
            const old = await worker.imports.claim();
            assert.ok(old);
            await worker.imports.process(old);
            assert.ok(fired);
            assert.equal(await a.person.count(), before + 1);
            const state = result(await ownerA.raw('GET', '/jobs/' + jobId));
            assert.equal(state.canResume, true);
            assert.equal(state.importedCount, 1);
            const key = randomUUID();
            const input = { expectedRevision: state.revision };
            const resumed = await Promise.all([ownerA, ownerB].map(c => c.cmd('POST', '/jobs/' + jobId + '/resume', input, key)));
            assert.ok(resumed.every(r => r.status === 202));
            const claims = await Promise.all([appA.imports.claim(), appB.imports.claim()]);
            assert.equal(claims.filter(Boolean).length, 1);
            await worker.imports.process(old);
            assert.equal(await a.person.count(), before + 1);
            await appA.imports.process(claims.find(Boolean)!);
            assert.equal(await a.person.count(), before + 2);
            assert.equal(result(await ownerB.raw('GET', '/jobs/' + jobId)).state, 'SUCCEEDED');
            assert.equal((await ownerA.cmd('POST', '/jobs/' + jobId + '/resume', input, key)).status, 202);
            assert.equal(await a.person.count(), before + 2);
        });
        await t.test('PG query count stays bounded for 100/1000 people and a 100-row preview', async () => {
            const measured = new PrismaClient({ datasources: { db: { url } }, log: [{ emit: 'event', level: 'query' }] });
            const measuredStore = new PrismaStore(measured);
            let queries = 0;
            measured.$on('query', () => { queries++; }); // Never log SQL parameters or full records.
            try {
                const measuredApp = new Application(measuredStore, config, clock);
                const c = new Client(measuredApp);
                c.jar = { ...ownerA.jar };
                c.csrf = ownerA.csrf;
                const template = await a.person.findUniqueOrThrow({ where: { id: personId } });
                for (const target of [100, 1000]) {
                    const existing = await a.person.count();
                    if (existing < target)
                        await a.person.createMany({ data: Array.from({ length: target - existing }, (_, i) => ({
                                ...template, id: randomUUID(), displayName: 'PG scale ' + target + ':' + i
                            })) });
                    queries = 0;
                    const started = performance.now();
                    const res = await c.cmd('POST', '/imports/preview', { sourceId: template.sourceId,
                        rows: Array.from({ length: 100 }, (_, i) => ({ displayName: 'PG preview ' + i, roles: ['model'] })) });
                    assert.equal(res.status, 201);
                    assert.ok(queries <= 50, 'query budget exceeded: ' + queries);
                    console.log(JSON.stringify({ metric: 'PG-preview', people: target, rows: 100, queries, elapsedMs: performance.now() - started }));
                }
            }
            finally {
                await measuredStore.close();
            }
        });
        await t.test('H1 PG private basic-profile grant and native evidence separation', async () => {
            const created = await sender.cmd('POST', '/people', { displayName: 'PG H1私有档案', roles: ['model'], inlineSource: sourceInput(true) });
            assert.equal(created.status, 201);
            const person = await a.person.findUniqueOrThrow({ where: { id: result(created).resourceId } });
            const sourceBefore = await a.sourceRecord.findUniqueOrThrow({ where: { id: person.sourceId } });
            const scopesBefore = await a.scopeMember.findMany({ orderBy: { id: 'asc' } });
            const input = { expectedRevision: person.revision, expectedSourceRevision: sourceBefore.revision,
                recipientId: result(recipientCreated).membershipId, purpose: 'EDIT', acknowledgeLimitedAccess: true,
                expiresAt: new Date(clock.now().getTime() + 3600000).toISOString() };
            const key = randomUUID();
            const invites = await Promise.all([sender, sender].map(c => c.cmd('POST', '/people/' + person.id + '/handoffs', input, key)));
            assert.ok(invites.every(r => r.status === 201));
            const hid = result(invites[0]!).resourceId;
            assert.equal(await a.recordHandoff.count({ where: { personId: person.id } }), 1);
            assert.equal((await receiver.raw('GET', '/people/' + person.id)).status, 404);
            const ak = randomUUID();
            const accepts = await Promise.all([receiver, receiver].map(c => c.cmd('POST', '/handoffs/' + hid + '/accept', { expectedRevision: 1 }, ak)));
            assert.ok(accepts.every(r => r.status === 200));
            assert.equal((await receiver.raw('GET', '/people/' + person.id)).status, 200);
            for (const path of ['/sources/' + person.sourceId, '/sources/' + person.sourceId + '/history', '/people/' + person.id + '/contacts'])
                assert.equal((await receiver.raw('GET', path)).status, 404);
            assert.deepEqual(await a.sourceRecord.findUniqueOrThrow({ where: { id: person.sourceId } }), sourceBefore);
            assert.deepEqual(await a.scopeMember.findMany({ orderBy: { id: 'asc' } }), scopesBefore);
            const editKey = randomUUID();
            const edit = { expectedRevision: 1, intro: 'PG受控修改' };
            assert.equal((await receiver.cmd('PATCH', '/people/' + person.id, edit, editKey)).status, 200);
            assert.equal((await sender.cmd('POST', '/handoffs/' + hid + '/revoke', { expectedRevision: 2 })).status, 200);
            assert.equal((await receiver.cmd('PATCH', '/people/' + person.id, edit, editKey)).status, 404);
            assert.equal((await receiver.raw('GET', '/people/' + person.id)).status, 404);
            const row = await a.recordHandoff.findUniqueOrThrow({ where: { id: hid } });
            // DB is a second boundary: malformed state and cross-workspace recipient must fail.
            await assert.rejects(a.recordHandoff.update({ where: { id: hid }, data: { state: 'DECLINED', acceptedAt: null, closedById: null } }));
            const alienWorkspace = randomUUID(), alienUser = randomUUID(), alienMember = randomUUID();
            const now = clock.now();
            await a.workspace.create({ data: { id: alienWorkspace, name: 'H1隔离空间', createdAt: now, recoveryEpoch: config.recoveryEpoch } });
            await a.user.create({ data: { id: alienUser, workspaceId: alienWorkspace, loginName: 'alien_' + alienUser, displayName: '仅FK测试', status: 'ACTIVE', passwordHash: null, sessionEpoch: 1, revision: 1, createdAt: now, updatedAt: now } });
            await a.membership.create({ data: { id: alienMember, workspaceId: alienWorkspace, userId: alienUser, role: 'EDITOR', extraPermissions: [], status: 'ACTIVE', revision: 1, createdAt: now, updatedAt: now } });
            await assert.rejects(a.recordHandoff.create({ data: { ...row, id: randomUUID(), recipientId: alienMember } }));
            assert.equal(await a.recordHandoff.count({ where: { personId: person.id } }), 1);
        });
        for (const stage of ['handoffs', 'audits', 'receipts'] as const) {
            await t.test('H1 PG atomic handoff creation rollback after ' + stage, async () => {
                const receiver = await a.membership.findFirstOrThrow({ where: { role: 'EDITOR', status: 'ACTIVE', id: { not: identity.membershipId } } });
                const created = await ownerA.cmd('POST', '/people', { displayName: 'H1回滚-' + stage, roles: ['model'], inlineSource: sourceInput(true) });
                assert.equal(created.status, 201);
                const person = await a.person.findUniqueOrThrow({ where: { id: result(created).resourceId } });
                const input = { expectedRevision: 1, expectedSourceRevision: 1, recipientId: receiver.id, purpose: 'EDIT',
                    expiresAt: new Date(clock.now().getTime() + 3600000).toISOString(), acknowledgeLimitedAccess: true };
                const count = async () => ({ handoffs: await a.recordHandoff.count(), audits: await a.auditEvent.count(), receipts: await a.commandReceipt.count() });
                const before = await count();
                const key = randomUUID();
                const faults = new FaultStore(storeA);
                let fired = false;
                faults.afterInsert = table => {
                    if (table === stage && !fired) {
                        fired = true;
                        throw new Error('H1 after-insert fault');
                    }
                };
                const app = new Application(faults, config, clock), client = new Client(app);
                client.jar = { ...ownerA.jar };
                client.csrf = ownerA.csrf;
                assert.equal((await client.cmd('POST', '/people/' + person.id + '/handoffs', input, key)).status, 503);
                assert.ok(fired);
                assert.deepEqual(await count(), before);
                assert.equal((await ownerA.cmd('POST', '/people/' + person.id + '/handoffs', input, key)).status, 201);
                assert.deepEqual(await count(), Object.fromEntries(Object.entries(before).map(([k, v]) => [k, v + 1])));
            });
        }
        const imageHash = 'a'.repeat(64), imagePreviewHash = 'b'.repeat(64);
        async function mediaSetup() {
            const r = await ownerA.cmd('POST', '/people', { displayName: 'M1 PG合成图片人才', roles: ['model'], inlineSource: sourceInput(true) });
            assert.equal(r.status, 201);
            const person = await a.person.findUniqueOrThrow({ where: { id: result(r).resourceId } });
            const input = { sourceId: person.sourceId, personId: person.id, expectedSourceRevision: 1, fileName: 'synthetic.png', mime: 'image/png', expectedBytes: 12, sha256: imageHash };
            const key = randomUUID(), out = await Promise.all([ownerA, ownerB].map(c => c.cmd('POST', '/uploads', input, key)));
            assert.ok(out.every(r => r.status === 201), JSON.stringify(out.map(r => r.body)));
            const id = result(out[0]!).resourceId as string;
            assert.equal(result(out[1]!).resourceId, id);
            const received = await storeA.transaction(async (tx) => appA.media.beginReceive(tx, await appA.identity.authenticate(tx, ownerA.jar.once_session!), id, 12));
            await storeA.transaction(async (tx) => appA.media.finishReceive(tx, await appA.identity.authenticate(tx, ownerA.jar.once_session!), id, received.receiveToken!, 12, imageHash));
            const upload = await a.mediaUpload.findUniqueOrThrow({ where: { id } });
            assert.equal((await ownerA.cmd('POST', '/uploads/' + id + '/complete', { expectedRevision: upload.revision })).status, 202);
            return id;
        }
        await t.test('M1 PG same-key reservation, competing leases and unique asset from current attempt', async () => {
            const id = await mediaSetup(), claims = await Promise.all([appA.media.claim(), appB.media.claim()]);
            assert.equal(claims.filter(Boolean).length, 1);
            const old = claims.find(Boolean)!;
            clock.advance(31000);
            const next = (await appB.media.claim())!;
            assert.equal(next.id, id);
            assert.notEqual(old.leaseToken, next.leaseToken);
            const output = { mime: 'image/png' as const, bytes: 12, sha256: imageHash, width: 2, height: 3, previewBytes: 10, previewHash: imagePreviewHash };
            await assert.rejects(appA.media.finish(old, output));
            assert.equal(await a.mediaAsset.count({ where: { id } }), 0);
            await appB.media.finish(next, output);
            assert.equal(await a.mediaAsset.count({ where: { id } }), 1);
            assert.equal((await a.mediaUpload.findUniqueOrThrow({ where: { id } })).state, 'READY');
            await assert.rejects(a.mediaUpload.update({ where: { id }, data: { personEpoch: null } }));
            await assert.rejects(a.mediaAsset.update({ where: { id }, data: { width: 0 } }));
            const row = await a.mediaAsset.findUniqueOrThrow({ where: { id } });
            const alien = await a.sourceRecord.findFirst({ where: { workspaceId: { not: identity.workspaceId } } });
            // Wrong parent remains rejected even when both IDs are syntactically valid.
            await assert.rejects(a.mediaAsset.update({ where: { id }, data: { sourceId: randomUUID() } }));
            assert.equal((await a.mediaAsset.findUniqueOrThrow({ where: { id } })).sourceId, row.sourceId);
        });
        for (const stage of ['assets', 'audits'] as const) {
            await t.test('M1 PG READY publication rollback after ' + stage, async () => {
                const id = await mediaSetup(), claim = (await appA.media.claim())!;
                const before = await a.mediaUpload.findUniqueOrThrow({ where: { id } }), auditBefore = await a.auditEvent.count();
                const faults = new FaultStore(storeA);
                let fired = false;
                faults.afterInsert = table => {
                    if (table === stage && !fired) {
                        fired = true;
                        throw new Error('M1 synthetic after write');
                    }
                };
                const app = new Application(faults, config, clock), output = { mime: 'image/png' as const, bytes: 12, sha256: imageHash, width: 2, height: 3, previewBytes: 10, previewHash: imagePreviewHash };
                await assert.rejects(app.media.finish(claim, output));
                assert.ok(fired);
                assert.equal(await a.mediaAsset.count({ where: { id } }), 0);
                assert.deepEqual(await a.mediaUpload.findUniqueOrThrow({ where: { id } }), before);
                assert.equal(await a.auditEvent.count(), auditBefore);
                await appA.media.finish(claim, output);
                assert.equal(await a.mediaAsset.count({ where: { id } }), 1);
            });
        }
        await runProductionContracts(t, { a, b, storeA, ownerA, ownerB, appA, config, clock, identity });
        await runShortlistContracts(t, { a, b, storeA, ownerA, ownerB, appA, config, clock, identity });
        await runSearchContracts(t, { a, ownerA, sender, personId });
    }
    finally {
        await Promise.all([storeA.close(), storeB.close()]);
    }
});
