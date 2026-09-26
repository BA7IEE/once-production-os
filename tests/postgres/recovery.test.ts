/** DEV-09A real PostgreSQL recovery quarantine acceptance.
 * Runs only against a fresh migrated once_restore_* database created by verify-postgres.mjs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { PrismaStore } from '../../apps/api/src/prisma-store.ts';
import { Application } from '../../packages/core/src/api.ts';
import { RecoveryOps } from '../../packages/core/src/recovery.ts';
import { FaultStore } from '../support/fault-store.ts';
import { FakeClock, Client, SYNTHETIC_PASSWORD, sourceInput, result } from '../support/fixtures.ts';
import { base } from '../../packages/core/src/helpers.ts';
import { hashSecret } from '../../packages/core/src/crypto.ts';

function restoreUrl() {
    assert.equal(process.env.ALLOW_RECOVERY_TESTS, 'yes');
    const raw = process.env.DATABASE_URL_RECOVERY_TEST;
    assert.ok(raw);
    const url = new URL(raw);
    assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
    assert.match(url.pathname, /^\/once_restore_[a-z0-9_]+$/);
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
    assert.ok(url.username && url.password);
    return raw;
}
function run(command: string, args: string[], env: NodeJS.ProcessEnv, expected = 0) {
    const r = spawnSync(command, args, { encoding: 'utf8', timeout: 180000, env });
    assert.equal(r.status, expected, command + ' ' + args.join(' ') + '\nstdout:\n' + (r.stdout ?? '') + '\nstderr:\n' + (r.stderr ?? ''));
    return r;
}

test('DEV-09A restored PostgreSQL is quarantined before any recovery epoch approval', async () => {
    const url = restoreUrl();
    const client = new PrismaClient({ datasources: { db: { url } }, log: [] });
    const store = new PrismaStore(client);
    const tmp = mkdtempSync(join(tmpdir(), 'once-recovery-pg-'));
    const oldEpoch = 'old_restore_epoch_20260926_aaaaaaaaaaaaaaaaaaaa';
    const newEpoch = 'new_restore_epoch_20260926_bbbbbbbbbbbbbbbbbbbb';
    const clock = new FakeClock();
    try {
        await client.$connect();
        assert.equal(await client.workspace.count(), 0);
        const config = {
            origin: 'https://restore-old.test.invalid', secureCookies: true,
            contactKey: randomBytes(32), csrfKey: randomBytes(32), recoveryEpoch: oldEpoch,
            accessMode: 'INTERNAL' as const, environment: 'test' as const, mediaEnabled: false,
            dataEgressMode: 'INTERNAL_APPROVED' as const,
            dataCleanupMode: 'INTERNAL_APPROVED' as const,
            dataMergeMode: 'INTERNAL_APPROVED' as const
        };
        const app = new Application(store, config, clock);
        const ids = await app.identity.bootstrap('owner', '恢复维护管理员', SYNTHETIC_PASSWORD);
        const owner = new Client(app);
        assert.equal((await owner.login()).status, 200);

        const reviewerCreate = await owner.raw('POST', '/memberships', {
            loginName: 'restore_editor', displayName: '恢复前编辑', role: 'EDITOR', extraPermissions: []
        });
        assert.equal(reviewerCreate.status, 201);
        const reviewer = new Client(app, '192.0.2.61');
        assert.equal((await reviewer.activate(result(reviewerCreate).activationToken)).status, 200);
        assert.equal((await reviewer.login('restore_editor')).status, 200);
        const reviewerId = result(reviewerCreate).membershipId as string;

        const pending = await owner.raw('POST', '/memberships', {
            loginName: 'restore_pending', displayName: '恢复前待激活成员', role: 'VIEWER', extraPermissions: []
        });
        assert.equal(pending.status, 201);

        const sourceCreated = await owner.cmd('POST', '/sources', sourceInput());
        assert.equal(sourceCreated.status, 201);
        const sourceId = result(sourceCreated).resourceId as string;
        const personCreated = await owner.cmd('POST', '/people', {
            displayName: '恢复前人才', roles: ['model'], sourceId
        });
        assert.equal(personCreated.status, 201);
        const personId = result(personCreated).resourceId as string;
        const source = await client.sourceRecord.findUniqueOrThrow({ where: { id: sourceId } });
        const person = await client.person.findUniqueOrThrow({ where: { id: personId } });

        const handoff = await owner.cmd('POST', '/people/' + personId + '/handoffs', {
            expectedRevision: person.revision, expectedSourceRevision: source.revision,
            recipientId: reviewerId, purpose: 'EDIT',
            expiresAt: new Date(clock.now().getTime() + 86400000).toISOString(),
            acknowledgeLimitedAccess: true
        });
        assert.equal(handoff.status, 201, JSON.stringify(handoff.body));

        const permit = await owner.cmd('POST', '/use-permissions', {
            sourceId, subjectKind: 'PERSON', subjectId: personId,
            fields: ['person.displayName'], validUntil: source.validUntil,
            evidenceNote: '恢复前导出许可'
        });
        assert.equal(permit.status, 201);
        const exportCreated = await owner.cmd('POST', '/exports', {
            format: 'JSON', selectedIds: { people: [personId], works: [], projects: [] },
            fields: ['person.displayName'], usePermissionRefs: [result(permit).resourceId]
        });
        assert.equal(exportCreated.status, 202);
        const claim = await app.exports.claim();
        assert.ok(claim);
        await app.exports.process(claim);
        assert.equal((await client.exportJob.findUniqueOrThrow({ where: { id: result(exportCreated).resourceId as string } })).state, 'READY');

        const batch = await owner.cmd('POST', '/imports/preview', {
            sourceId, rows: [{ displayName: '恢复前排队导入', roles: ['model'] }]
        });
        assert.equal(batch.status, 201);
        const committed = await owner.cmd('POST', '/imports/' + result(batch).resourceId + '/commit', {
            expectedRevision: 1, selectedRows: [0]
        });
        assert.equal(committed.status, 202);

        const ownerMembership = await client.membership.findUniqueOrThrow({ where: { id: ids.membershipId } });
        const workspaceScope = await client.accessScope.findFirstOrThrow({ where: { workspaceId: ids.workspaceId, mode: 'WORKSPACE' } });
        await store.transaction(async tx => {
            const queuedId = randomUUID();
            await tx.insert('uploads', {
                ...base(ids.workspaceId, clock), id: queuedId, actorId: ownerMembership.id,
                actorRevision: ownerMembership.revision, actorEpoch: 1,
                sourceId, sourceRevision: source.revision, sourceEpoch: source.protectionEpoch,
                scopeId: source.scopeId, scopeRevision: workspaceScope.revision,
                personId, personEpoch: person.protectionEpoch, personScopeId: person.scopeId,
                personScopeRevision: workspaceScope.revision, fileName: 'queued.png', mime: 'image/png',
                expectedBytes: 12, expectedHash: 'a'.repeat(64), state: 'QUEUED',
                expiresAt: new Date(clock.now().getTime() + 86400000).toISOString(),
                renewals: 0, attempts: 0, receiveToken: randomUUID(), leaseToken: null, leaseUntil: null,
                errorCode: null, purgedAt: null
            });
            const readyId = randomUUID();
            const objectToken = randomUUID();
            await tx.insert('uploads', {
                ...base(ids.workspaceId, clock), id: readyId, actorId: ownerMembership.id,
                actorRevision: ownerMembership.revision, actorEpoch: 1,
                sourceId, sourceRevision: source.revision, sourceEpoch: source.protectionEpoch,
                scopeId: source.scopeId, scopeRevision: workspaceScope.revision,
                personId, personEpoch: person.protectionEpoch, personScopeId: person.scopeId,
                personScopeRevision: workspaceScope.revision, fileName: 'ready.png', mime: 'image/png',
                expectedBytes: 12, expectedHash: 'b'.repeat(64), state: 'READY',
                expiresAt: new Date(clock.now().getTime() + 86400000).toISOString(),
                renewals: 0, attempts: 1, receiveToken: randomUUID(), leaseToken: null, leaseUntil: null,
                errorCode: null, purgedAt: null
            });
            await tx.insert('assets', {
                ...base(ids.workspaceId, clock), id: readyId, uploadId: readyId,
                sourceId, scopeId: source.scopeId, personId, fileName: 'ready.png', mime: 'image/png',
                bytes: 12, sha256: 'b'.repeat(64), width: 2, height: 3,
                previewBytes: 10, previewHash: 'c'.repeat(64), objectToken, state: 'READY'
            });
        });

        const recoveryConfig = {
            accessMode: 'MAINTENANCE' as const, dataEgressMode: 'DISABLED' as const,
            dataCleanupMode: 'DISABLED' as const, dataMergeMode: 'DISABLED' as const,
            recoveryEpoch: newEpoch
        };
        const recovery = new RecoveryOps(clock, recoveryConfig);
        const recoveryActor = await store.transaction(tx => recovery.actorFromRestoredTarget(tx, 'owner'));
        const beforeSource = await client.sourceRecord.findUniqueOrThrow({ where: { id: sourceId } });

        const faults = new FaultStore(store);
        let fired = false;
        faults.afterInsert = table => {
            if (table === 'audits' && !fired) { fired = true; throw new Error('synthetic recovery audit failure'); }
        };
        await assert.rejects(faults.transaction(tx => recovery.prepare(tx, recoveryActor, hashSecret(oldEpoch),
            { requestId: randomUUID(), ip: 'CLI' })),
            (e: unknown) => e instanceof Error && 'code' in e && (e as { code: string }).code === 'STORE_UNAVAILABLE');
        assert.ok(fired, 'fault must happen after the real recovery audit insert inside the transaction');
        assert.equal(await client.recoveryRun.count(), 0);
        assert.equal((await client.sourceRecord.findUniqueOrThrow({ where: { id: sourceId } })).status, beforeSource.status);
        assert.equal((await client.exportJob.findUniqueOrThrow({ where: { id: result(exportCreated).resourceId as string } })).state, 'READY');

        const epochFile = join(tmp, 'recovery.epoch');
        writeFileSync(epochFile, newEpoch + '\n', { mode: 0o600 });
        const common = {
            ...process.env, DATABASE_URL_RECOVERY: url, DATABASE_URL: 'postgresql://ignored:ignored@127.0.0.1:1/ignored',
            RECOVERY_EPOCH_FILE: epochFile, ACCESS_MODE: 'MAINTENANCE',
            DATA_EGRESS_MODE: 'DISABLED', DATA_CLEANUP_MODE: 'DISABLED', DATA_MERGE_MODE: 'DISABLED'
        };
        const check = run('pnpm', ['--silent', 'recovery:prepare', '--', '--actor-login', 'owner'], common);
        const checked = JSON.parse(check.stdout);
        assert.equal(checked.mode, 'CHECK');
        assert.equal(checked.alreadyPrepared, false);
        assert.equal(checked.sourceEpochDigest, hashSecret(oldEpoch));
        assert.equal(checked.targetEpochDigest, hashSecret(newEpoch));
        assert.equal(await client.recoveryRun.count(), 0);

        const applied = run('pnpm', ['--silent', 'recovery:prepare', '--', '--actor-login', 'owner',
            '--expected-source-sha256', checked.sourceEpochDigest, '--apply'], {
            ...common, ALLOW_RECOVERY_PREPARE: 'yes'
        });
        const prepared = JSON.parse(applied.stdout);
        assert.equal(prepared.mode, 'APPLY');
        assert.equal(prepared.state, 'PREPARED');

        assert.equal(await client.recoveryRun.count(), 1);
        assert.equal((await client.workspace.findUniqueOrThrow({ where: { id: ids.workspaceId } })).recoveryEpoch, oldEpoch);
        assert.equal(await client.session.count({ where: { revokedAt: null } }), 0);
        assert.equal(await client.activation.count({ where: { consumedAt: null } }), 0);
        assert.equal((await client.membership.findUniqueOrThrow({ where: { id: reviewerId } })).status, 'DISABLED');
        assert.equal(await client.membership.count({ where: { id: { not: ids.membershipId }, status: 'ACTIVE' } }), 0);
        assert.equal((await client.recordHandoff.findUniqueOrThrow({ where: { id: result(handoff).resourceId as string } })).state, 'REVOKED');
        assert.equal((await client.usePermission.findUniqueOrThrow({ where: { id: result(permit).resourceId as string } })).status, 'REVOKED');
        const oldExport = await client.exportJob.findUniqueOrThrow({ where: { id: result(exportCreated).resourceId as string } });
        assert.equal(oldExport.state, 'STALE');
        assert.equal(oldExport.payload, null);
        assert.equal(oldExport.payloadDigest, null);
        assert.equal(await client.durableJob.count({ where: { state: 'QUEUED' } }), 0);
        assert.ok((await client.durableJob.findFirstOrThrow()).errorCode === 'RESTORE_REVIEW_REQUIRED');
        assert.equal(await client.mediaUpload.count({ where: { state: 'QUEUED' } }), 0);
        assert.equal(await client.mediaUpload.count({ where: { errorCode: 'RESTORE_REVIEW_REQUIRED' } }), 1);
        assert.equal((await client.mediaAsset.findFirstOrThrow()).state, 'QUARANTINED');
        assert.equal((await client.sourceRecord.findUniqueOrThrow({ where: { id: sourceId } })).status, 'SUSPENDED');
        const history = await client.sourceHistory.findFirstOrThrow({ where: { sourceId }, orderBy: { sourceRevision: 'desc' } });
        assert.equal(history.action, 'SUSPENDED');
        assert.match(history.decisionReason ?? '', /Restore review required/);
        const audit = await client.auditEvent.findFirstOrThrow({ where: { action: 'recovery.prepare' } });
        assert.equal(audit.resourceKind, 'recovery');

        const oldSessionUse = await owner.raw('GET', '/people/' + personId);
        assert.equal(oldSessionUse.status, 401, JSON.stringify(oldSessionUse.body));

        const isolatedApp = new Application(store, { ...config, accessMode: 'INTERNAL', recoveryEpoch: newEpoch,
            dataEgressMode: 'DISABLED', dataCleanupMode: 'DISABLED', dataMergeMode: 'DISABLED' }, clock);
        const isolatedClient = new Client(isolatedApp, '192.0.2.88');
        const isolatedLogin = await isolatedClient.login('owner');
        assert.equal(isolatedLogin.status, 503, JSON.stringify(isolatedLogin.body));

        const second = run('pnpm', ['--silent', 'recovery:prepare', '--', '--actor-login', 'owner',
            '--expected-source-sha256', checked.sourceEpochDigest, '--apply'], {
            ...common, ALLOW_RECOVERY_PREPARE: 'yes'
        }, 1);
        assert.match(second.stderr, /RECOVERY_ALREADY_PREPARED/);

        console.log('PASS DEV-09A recovery PG/CLI: old sessions/activations/rights/tasks/exports invalidated; sources/media quarantined; workspace epoch remains unapproved');
    }
    finally {
        await store.close();
        rmSync(tmp, { recursive: true, force: true });
    }
});
