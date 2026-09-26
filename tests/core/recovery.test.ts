import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, member, sourceInput, result } from '../support/fixtures.ts';
import { RecoveryOps } from '../../packages/core/src/recovery.ts';
import { base } from '../../packages/core/src/helpers.ts';
import { hashSecret } from '../../packages/core/src/crypto.ts';
import { AppError } from '../../packages/core/src/errors.ts';

type F = Awaited<ReturnType<typeof fixture>>;

function recovery(f: F, epoch = 'R'.repeat(48)) {
    return new RecoveryOps(f.clock, {
        accessMode: 'MAINTENANCE',
        dataEgressMode: 'DISABLED',
        dataCleanupMode: 'DISABLED',
        dataMergeMode: 'DISABLED',
        recoveryEpoch: epoch
    });
}
async function actor(f: F, r: RecoveryOps) {
    return f.store.transaction(tx => r.actorFromRestoredTarget(tx, 'owner'));
}
async function seed(f: F) {
    const reviewer = await member(f, 'restore_reviewer', 'REVIEWER');
    const sourceResponse = await f.owner.cmd('POST', '/sources', sourceInput());
    assert.equal(sourceResponse.status, 201, JSON.stringify(sourceResponse.body));
    const sourceId = result(sourceResponse).resourceId as string;
    const personResponse = await f.owner.cmd('POST', '/people', {
        displayName: '恢复前人才', roles: ['model'], sourceId
    });
    assert.equal(personResponse.status, 201);
    const personId = result(personResponse).resourceId as string;

    const source = f.store.rows('sources').find(x => x.id === sourceId)!;
    const person = f.store.rows('people').find(x => x.id === personId)!;
    const ownerMembership = f.store.rows('memberships').find(x => x.id === f.membershipId)!;
    const workspaceScope = f.store.rows('scopes').find(x => x.mode === 'WORKSPACE')!;
    const now = f.clock.now().toISOString();

    await f.store.transaction(async tx => {
        await tx.insert('handoffs', {
            ...base(f.workspaceId, f.clock), personId, sourceId,
            senderId: ownerMembership.id, recipientId: reviewer.id,
            senderRevision: ownerMembership.revision,
            recipientRevision: f.store.rows('memberships').find(x => x.id === reviewer.id)!.revision,
            personRevision: person.revision, sourceRevision: source.revision,
            personEpoch: person.protectionEpoch, sourceEpoch: source.protectionEpoch,
            personScopeId: person.scopeId, sourceScopeId: source.scopeId,
            personScopeRevision: workspaceScope.revision, sourceScopeRevision: workspaceScope.revision,
            purpose: 'EDIT', state: 'PENDING',
            expiresAt: new Date(f.clock.now().getTime() + 86400000).toISOString(),
            acceptedAt: null, closedAt: null, closedById: null
        });
        const permission = {
            ...base(f.workspaceId, f.clock), sourceId, subjectKind: 'PERSON' as const, subjectId: personId,
            purpose: 'INTERNAL_EXPORT' as const, fields: ['person.displayName'] as const,
            validFrom: now, validUntil: source.validUntil, status: 'ACTIVE' as const,
            evidenceNote: '恢复测试导出许可', reviewerId: ownerMembership.id,
            subjectPersonId: personId, subjectWorkId: null, subjectProjectId: null,
            subjectAssetId: null, subjectSourceId: null
        };
        await tx.insert('usePermissions', { ...permission, fields: [...permission.fields] });
        await tx.insert('exports', {
            ...base(f.workspaceId, f.clock), actorId: ownerMembership.id, format: 'JSON',
            schemaVersion: 'once-export-v1', state: 'READY',
            recordManifest: {}, fields: ['person.displayName'], usePermissionRefs: [permission.id],
            payload: { schemaVersion: 'once-export-v1' }, payloadDigest: 'a'.repeat(64),
            expiresAt: new Date(f.clock.now().getTime() + 86400000).toISOString(),
            errorCode: null, leaseToken: null, leaseUntil: null, attempts: 1
        });
        const batch = {
            ...base(f.workspaceId, f.clock), actorId: ownerMembership.id, sourceId,
            sourceRevision: source.revision, scopeId: source.scopeId,
            rows: [{ index: 0, displayName: '恢复任务人才', roles: ['model'], cityCode: null,
                state: 'VALID' as const, issues: [], personId: null }],
            expiresAt: new Date(f.clock.now().getTime() + 86400000).toISOString()
        };
        await tx.insert('imports', batch);
        await tx.insert('jobs', {
            ...base(f.workspaceId, f.clock), type: 'IMPORT_PEOPLE', actorId: ownerMembership.id,
            aggregateId: batch.id, selectedRows: [0], state: 'QUEUED',
            leaseToken: null, leaseUntil: null, attempts: 0, errorCode: null
        });
        const uploadId = randomUUID();
        const token = randomUUID();
        await tx.insert('uploads', {
            ...base(f.workspaceId, f.clock), id: uploadId, actorId: ownerMembership.id,
            actorRevision: ownerMembership.revision, actorEpoch: 1,
            sourceId, sourceRevision: source.revision, sourceEpoch: source.protectionEpoch,
            scopeId: source.scopeId, scopeRevision: workspaceScope.revision,
            personId, personEpoch: person.protectionEpoch, personScopeId: person.scopeId,
            personScopeRevision: workspaceScope.revision, fileName: 'restore.png',
            mime: 'image/png', expectedBytes: 12, expectedHash: 'b'.repeat(64),
            state: 'QUEUED', expiresAt: new Date(f.clock.now().getTime() + 86400000).toISOString(),
            renewals: 0, attempts: 0, receiveToken: token, leaseToken: null, leaseUntil: null,
            errorCode: null, purgedAt: null
        });
        await tx.insert('assets', {
            ...base(f.workspaceId, f.clock), id: uploadId, uploadId,
            sourceId, scopeId: source.scopeId, personId, fileName: 'restore.png', mime: 'image/png',
            bytes: 12, sha256: 'b'.repeat(64), width: 2, height: 3,
            previewBytes: 10, previewHash: 'c'.repeat(64), objectToken: randomUUID(), state: 'READY'
        });
    });
    return { reviewer, sourceId, personId };
}

function snapshot(f: F) {
    return {
        recoveryRuns: structuredClone(f.store.rows('recoveryRuns')),
        users: structuredClone(f.store.rows('users')),
        memberships: structuredClone(f.store.rows('memberships')),
        sessions: structuredClone(f.store.rows('sessions')),
        activations: structuredClone(f.store.rows('activations')),
        sources: structuredClone(f.store.rows('sources')),
        sourceHistory: structuredClone(f.store.rows('sourceHistory')),
        handoffs: structuredClone(f.store.rows('handoffs')),
        permissions: structuredClone(f.store.rows('usePermissions')),
        exports: structuredClone(f.store.rows('exports')),
        jobs: structuredClone(f.store.rows('jobs')),
        uploads: structuredClone(f.store.rows('uploads')),
        assets: structuredClone(f.store.rows('assets')),
        audits: structuredClone(f.store.rows('audits')),
        workspace: structuredClone(f.store.rows('workspaces')[0])
    };
}

test('DEV-09A recovery preview is zero-write and requires a rotated deployment epoch', async () => {
    const f = await fixture();
    await seed(f);
    const r = recovery(f);
    const a = await actor(f, r);
    const before = snapshot(f);
    const p = await f.store.transaction(tx => r.preview(tx, a));
    assert.equal(p.alreadyPrepared, false);
    assert.equal(p.sourceEpochDigest, hashSecret(f.app.config.recoveryEpoch));
    assert.equal(p.targetEpochDigest, hashSecret('R'.repeat(48)));
    assert.ok(p.counts.sessions >= 2);
    assert.equal(p.counts.sources, 1);
    assert.equal(p.counts.exports, 1);
    assert.equal(p.counts.jobs, 1);
    assert.equal(p.counts.uploads, 1);
    assert.equal(p.counts.assets, 1);
    assert.deepEqual(snapshot(f), before);

    const same = new RecoveryOps(f.clock, {
        accessMode: 'MAINTENANCE', dataEgressMode: 'DISABLED', dataCleanupMode: 'DISABLED',
        dataMergeMode: 'DISABLED', recoveryEpoch: f.app.config.recoveryEpoch
    });
    const sameActor = await f.store.transaction(tx => same.actorFromRestoredTarget(tx, 'owner'));
    await assert.rejects(f.store.transaction(tx => same.preview(tx, sameActor)),
        (e: unknown) => e instanceof AppError && e.code === 'RECOVERY_EPOCH_NOT_ROTATED');
});

test('DEV-09A prepare revokes old capabilities but deliberately does not approve workspace epoch', async () => {
    const f = await fixture();
    const { reviewer, sourceId } = await seed(f);
    const r = recovery(f);
    const a = await actor(f, r);
    const expected = hashSecret(f.app.config.recoveryEpoch);
    const oldWorkspaceEpoch = f.store.rows('workspaces')[0]!.recoveryEpoch;
    const ownerBefore = f.store.rows('users').find(x => x.id === f.userId)!;

    const run = await f.store.transaction(tx => r.prepare(tx, a, expected, { requestId: randomUUID(), ip: 'CLI' }));
    assert.equal(run.state, 'PREPARED');
    assert.equal(run.sourceEpochDigest, expected);
    assert.equal(run.targetEpochDigest, hashSecret('R'.repeat(48)));
    assert.equal(f.store.rows('workspaces')[0]!.recoveryEpoch, oldWorkspaceEpoch,
        'prepare must not approve the new deployment recovery epoch');

    assert.ok(f.store.rows('sessions').every(x => !!x.revokedAt));
    assert.ok(f.store.rows('activations').every(x => !!x.consumedAt));
    assert.ok(f.store.rows('users').find(x => x.id === f.userId)!.sessionEpoch > ownerBefore.sessionEpoch);
    assert.equal(f.store.rows('memberships').find(x => x.id === reviewer.id)!.status, 'DISABLED');
    assert.equal(f.store.rows('handoffs')[0]!.state, 'REVOKED');
    assert.equal(f.store.rows('usePermissions')[0]!.status, 'REVOKED');
    assert.equal(f.store.rows('exports')[0]!.state, 'STALE');
    assert.equal(f.store.rows('exports')[0]!.payload, null);
    assert.equal(f.store.rows('exports')[0]!.payloadDigest, null);
    assert.equal(f.store.rows('jobs')[0]!.state, 'FAILED');
    assert.equal(f.store.rows('jobs')[0]!.errorCode, 'RESTORE_REVIEW_REQUIRED');
    assert.equal(f.store.rows('uploads')[0]!.state, 'FAILED');
    assert.equal(f.store.rows('uploads')[0]!.errorCode, 'RESTORE_REVIEW_REQUIRED');
    assert.equal(f.store.rows('assets')[0]!.state, 'QUARANTINED');
    assert.equal(f.store.rows('sources').find(x => x.id === sourceId)!.status, 'SUSPENDED');
    assert.equal(f.store.rows('sourceHistory').at(-1)!.action, 'SUSPENDED');
    assert.match(f.store.rows('sourceHistory').at(-1)!.decisionReason ?? '', /Restore review required/);

    assert.equal(f.store.rows('recoveryRuns').length, 1);
    const audit = f.store.rows('audits').at(-1)!;
    assert.equal(audit.action, 'recovery.prepare');
    assert.equal(audit.resourceKind, 'recovery');
    assert.equal(audit.resourceId, run.id);

    const p = await f.store.transaction(tx => r.preview(tx, a));
    assert.equal(p.alreadyPrepared, true);
    await assert.rejects(f.store.transaction(tx => r.prepare(tx, a, expected, { requestId: randomUUID(), ip: 'CLI' })),
        (e: unknown) => e instanceof AppError && e.code === 'RECOVERY_ALREADY_PREPARED');
});

test('DEV-09A wrong source epoch digest and open execution gates fail before writes', async () => {
    const f = await fixture();
    await seed(f);
    const r = recovery(f);
    const a = await actor(f, r);
    const before = snapshot(f);
    await assert.rejects(f.store.transaction(tx => r.prepare(tx, a, '0'.repeat(64), { requestId: randomUUID(), ip: 'CLI' })),
        (e: unknown) => e instanceof AppError && e.code === 'RECOVERY_SOURCE_EPOCH_MISMATCH');
    assert.deepEqual(snapshot(f), before);

    const unsafe = new RecoveryOps(f.clock, {
        accessMode: 'MAINTENANCE', dataEgressMode: 'INTERNAL_APPROVED', dataCleanupMode: 'DISABLED',
        dataMergeMode: 'DISABLED', recoveryEpoch: 'S'.repeat(48)
    });
    await assert.rejects(f.store.transaction(tx => unsafe.actorFromRestoredTarget(tx, 'owner')),
        (e: unknown) => e instanceof AppError && e.code === 'RECOVERY_GATES_NOT_CLOSED');
});

test('DEV-09A audit failure rolls every recovery quarantine write back', async () => {
    const f = await fixture();
    await seed(f);
    const r = recovery(f);
    const a = await actor(f, r);
    const before = snapshot(f);
    f.store.failNextAudit = true;
    await assert.rejects(f.store.transaction(tx => r.prepare(tx, a, hashSecret(f.app.config.recoveryEpoch),
        { requestId: randomUUID(), ip: 'CLI' })), /injected audit failure/);
    assert.deepEqual(snapshot(f), before);
});
