import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, member, sourceInput, result } from '../support/fixtures.ts';
import { RecoveryOps } from '../../packages/core/src/recovery.ts';
import { base } from '../../packages/core/src/helpers.ts';
import { hashSecret } from '../../packages/core/src/crypto.ts';
import { digest } from '../../packages/core/src/json.ts';
import { AppError } from '../../packages/core/src/errors.ts';

type F = Awaited<ReturnType<typeof fixture>>;

function recovery(f: F, epoch = 'R'.repeat(48), contactKey: Buffer = f.app.config.contactKey) {
    return new RecoveryOps(f.clock, {
        accessMode: 'MAINTENANCE',
        dataEgressMode: 'DISABLED',
        dataCleanupMode: 'DISABLED',
        dataMergeMode: 'DISABLED',
        recoveryEpoch: epoch,
        contactKey
    });
}
function external(f: F, overrides: Partial<{ migrationMatch: boolean; provider: 'disabled'|'local'; missing: string[]; mismatch: string[] }> = {}) {
    const assets = f.store.rows('assets').filter(x => x.state !== 'ERASED').sort((a,b) => a.id.localeCompare(b.id));
    const ids = assets.map(x => x.id);
    const identityDigest = digest(assets.map(x => ({
        id: x.id, uploadId: x.uploadId, sourceId: x.sourceId, scopeId: x.scopeId, personId: x.personId,
        revision: x.revision, fileName: x.fileName, mime: x.mime, bytes: x.bytes, sha256: x.sha256,
        width: x.width, height: x.height, previewBytes: x.previewBytes, previewHash: x.previewHash,
        objectToken: x.objectToken, state: x.state
    })));
    const backupIdentityDigest = digest(assets.map(x => ({
        id: x.id, uploadId: x.uploadId, sourceId: x.sourceId, scopeId: x.scopeId, personId: x.personId,
        fileName: x.fileName, mime: x.mime, bytes: x.bytes, sha256: x.sha256,
        width: x.width, height: x.height, previewBytes: x.previewBytes, previewHash: x.previewHash,
        objectToken: x.objectToken
    })));
    const provider = overrides.provider ?? 'local';
    const missing = overrides.missing ?? [];
    const mismatch = overrides.mismatch ?? [];
    const bad = new Set([...missing, ...mismatch]);
    return {
        migrationDigest: 'd'.repeat(64),
        migrationMatch: overrides.migrationMatch ?? true,
        media: {
            provider,
            identityDigest,
            backupIdentityDigest,
            expectedAssetIds: ids,
            verifiedAssetIds: provider === 'local' ? ids.filter(id => !bad.has(id)) : [],
            missingAssetIds: provider === 'disabled' ? ids : missing,
            mismatchAssetIds: mismatch
        }
    };
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
    const ownerUserId = f.store.rows('memberships').find(x => x.id === f.membershipId)!.userId;
    const ownerBefore = f.store.rows('users').find(x => x.id === ownerUserId)!;

    const run = await f.store.transaction(tx => r.prepare(tx, a, expected, { requestId: randomUUID(), ip: 'CLI' }));
    assert.equal(run.state, 'PREPARED');
    assert.equal(run.sourceEpochDigest, expected);
    assert.equal(run.targetEpochDigest, hashSecret('R'.repeat(48)));
    assert.equal(f.store.rows('workspaces')[0]!.recoveryEpoch, oldWorkspaceEpoch,
        'prepare must not approve the new deployment recovery epoch');

    assert.ok(f.store.rows('sessions').every(x => !!x.revokedAt));
    assert.ok(f.store.rows('activations').every(x => !!x.consumedAt));
    assert.ok(f.store.rows('users').find(x => x.id === ownerUserId)!.sessionEpoch > ownerBefore.sessionEpoch);
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


test('DEV-09B restore check is zero-write; record persists an allowlisted INSPECTED report', async () => {
    const f = await fixture();
    const { personId, sourceId } = await seed(f);
    const person = f.store.rows('people').find(x => x.id === personId)!;
    const contact = await f.owner.cmd('PUT', '/people/' + personId + '/contacts', {
        expectedRevision: person.revision,
        contacts: [{ kind: 'EMAIL', value: 'restore-check@example.invalid', sourceId }]
    });
    assert.equal(contact.status, 200, JSON.stringify(contact.body));

    const r = recovery(f);
    const a = await actor(f, r);
    const run = await f.store.transaction(tx => r.prepare(tx, a, hashSecret(f.app.config.recoveryEpoch),
        { requestId: randomUUID(), ip: 'CLI' }));
    const beforeRun = structuredClone(f.store.rows('recoveryRuns')[0]!);
    const beforeAudits = f.store.rows('audits').length;

    const report = await f.store.transaction(tx => r.check(tx, a, run.id, external(f)));
    assert.deepEqual(report.blockers, []);
    assert.equal(report.contactCount, 1);
    assert.equal(report.contactDecryptFailures, 0);
    assert.equal(report.migrationMatch, true);
    assert.equal(report.media.verifiedAssetIds.length, 1);
    assert.deepEqual(f.store.rows('recoveryRuns')[0], beforeRun, 'CHECK must not persist report state');
    assert.equal(f.store.rows('audits').length, beforeAudits);

    const recorded = await f.store.transaction(tx => r.inspect(tx, a, run.id, external(f),
        { requestId: randomUUID(), ip: 'CLI' }));
    assert.deepEqual(recorded.blockers, []);
    const saved = f.store.rows('recoveryRuns')[0]!;
    assert.equal(saved.state, 'INSPECTED');
    assert.match(saved.reportDigest ?? '', /^[a-f0-9]{64}$/);
    assert.equal((saved.report as any).databaseStateDigest, recorded.databaseStateDigest);
    assert.equal(f.store.rows('audits').at(-1)!.action, 'recovery.inspect');
});

test('DEV-09B wrong contact key and media/migration gaps become explicit blockers', async () => {
    const f = await fixture();
    const { personId, sourceId } = await seed(f);
    const person = f.store.rows('people').find(x => x.id === personId)!;
    assert.equal((await f.owner.cmd('PUT', '/people/' + personId + '/contacts', {
        expectedRevision: person.revision,
        contacts: [{ kind: 'PHONE', value: '+10000000000', sourceId }]
    })).status, 200);

    const good = recovery(f), a = await actor(f, good);
    const run = await f.store.transaction(tx => good.prepare(tx, a, hashSecret(f.app.config.recoveryEpoch),
        { requestId: randomUUID(), ip: 'CLI' }));

    const wrong = recovery(f, 'R'.repeat(48), Buffer.alloc(32, 9));
    const wrongActor = await actor(f, wrong);
    const wrongReport = await f.store.transaction(tx => wrong.check(tx, wrongActor, run.id,
        external(f, { migrationMatch: false, provider: 'disabled' })));
    assert.ok(wrongReport.blockers.includes('CONTACT_KEY_MISMATCH'));
    assert.ok(wrongReport.blockers.includes('MIGRATION_MISMATCH'));
    assert.ok(wrongReport.blockers.includes('MEDIA_PROVIDER_REQUIRED'));
    assert.ok(wrongReport.blockers.includes('MEDIA_MISSING'));
    assert.equal(wrongReport.contactDecryptFailures, 1);
});

test('DEV-09B stale media evidence is rejected and DB safety changes produce a new blocker/digest', async () => {
    const f = await fixture();
    const { reviewer } = await seed(f);
    const r = recovery(f), a = await actor(f, r);
    const run = await f.store.transaction(tx => r.prepare(tx, a, hashSecret(f.app.config.recoveryEpoch),
        { requestId: randomUUID(), ip: 'CLI' }));

    const x = external(f);
    await assert.rejects(f.store.transaction(tx => r.check(tx, a, run.id, {
        ...x, media: { ...x.media, expectedAssetIds: [] , verifiedAssetIds: [] }
    })), (e: unknown) => e instanceof AppError && e.code === 'RECOVERY_EXTERNAL_EVIDENCE_STALE');

    await f.store.transaction(async tx => {
        const asset = (await tx.find('assets'))[0]!;
        await tx.replace('assets', { ...asset, revision: asset.revision + 1,
            updatedAt: f.clock.now().toISOString(), fileName: 'metadata-changed.png' });
    });
    await assert.rejects(f.store.transaction(tx => r.check(tx, a, run.id, x)),
        (e: unknown) => e instanceof AppError && e.code === 'RECOVERY_EXTERNAL_EVIDENCE_STALE',
        'same IDs with changed asset metadata must invalidate old media evidence');

    const clean = await f.store.transaction(tx => r.inspect(tx, a, run.id, external(f),
        { requestId: randomUUID(), ip: 'CLI' }));
    await f.store.transaction(async tx => {
        const member = (await tx.find('memberships', { id: reviewer.id }))[0]!;
        await tx.replace('memberships', { ...member, revision: member.revision + 1, status: 'ACTIVE',
            updatedAt: f.clock.now().toISOString() });
    });
    const changed = await f.store.transaction(tx => r.check(tx, a, run.id, external(f)));
    assert.notEqual(changed.databaseStateDigest, clean.databaseStateDigest);
    assert.ok(changed.blockers.includes('OLD_MEMBERSHIP_ACTIVE'));
});


function approvalEvidence(run: any, report: any, overrides: any = {}) {
    const seq = overrides.backupSequence ?? 7;
    const head = overrides.backupHeadHash ?? 'e'.repeat(64);
    return {
        schemaVersion: 'once-recovery-approval-v1' as const,
        backupId: overrides.backupId ?? randomUUID(),
        backupManifestDigest: overrides.backupManifestDigest ?? 'a'.repeat(64),
        databaseSha256: overrides.databaseSha256 ?? 'b'.repeat(64),
        recoveryEpochDigest: overrides.recoveryEpochDigest ?? run.sourceEpochDigest,
        contactKeyDigest: overrides.contactKeyDigest ?? report.contactKeyDigest,
        migrationDigest: overrides.migrationDigest ?? report.migrationDigest,
        mediaIdentityDigest: overrides.mediaIdentityDigest ?? report.media.backupIdentityDigest,
        reportDigest: overrides.reportDigest ?? run.reportDigest,
        safetyJournal: {
            journalId: overrides.journalId ?? randomUUID(),
            backupSequence: seq,
            backupHeadHash: head,
            currentSequence: overrides.currentSequence ?? seq,
            currentHeadHash: overrides.currentHeadHash ?? head,
            postBackupEntries: overrides.postBackupEntries ?? 0
        }
    };
}

test('DEV-09C zero-delta approval changes only recovery epoch and preserves conservative quarantines', async () => {
    const f = await fixture();
    const { sourceId } = await seed(f);
    const r = recovery(f), a = await actor(f, r);
    const oldEpoch = f.store.rows('workspaces')[0]!.recoveryEpoch;
    const prepared = await f.store.transaction(tx => r.prepare(tx, a, hashSecret(oldEpoch),
        { requestId: randomUUID(), ip: 'CLI' }));
    const report = await f.store.transaction(tx => r.inspect(tx, a, prepared.id, external(f),
        { requestId: randomUUID(), ip: 'CLI' }));
    assert.deepEqual(report.blockers, []);
    const inspected = f.store.rows('recoveryRuns')[0]!;
    const evidence = approvalEvidence(inspected, report);

    const approved = await f.store.transaction(tx => r.approve(tx, a, inspected.id, external(f), evidence,
        { requestId: randomUUID(), ip: 'CLI' }));
    assert.equal(approved.state, 'APPROVED');
    assert.equal(f.store.rows('workspaces')[0]!.recoveryEpoch, 'R'.repeat(48));
    assert.match(approved.approvalDigest ?? '', /^[a-f0-9]{64}$/);
    assert.equal((approved.approval as any).backupId, evidence.backupId);
    assert.equal(f.store.rows('sources').find(x => x.id === sourceId)!.status, 'SUSPENDED',
        'approval must not silently reactivate restored source data');
    assert.equal(f.store.rows('assets')[0]!.state, 'QUARANTINED',
        'approval must not silently unquarantine restored media');
    assert.equal(f.store.rows('audits').at(-1)!.action, 'recovery.approve');
});

test('DEV-09C any post-backup safety journal entry blocks approval', async () => {
    const f = await fixture();
    await seed(f);
    const r = recovery(f), a = await actor(f, r);
    const oldEpoch = f.store.rows('workspaces')[0]!.recoveryEpoch;
    const prepared = await f.store.transaction(tx => r.prepare(tx, a, hashSecret(oldEpoch),
        { requestId: randomUUID(), ip: 'CLI' }));
    const report = await f.store.transaction(tx => r.inspect(tx, a, prepared.id, external(f),
        { requestId: randomUUID(), ip: 'CLI' }));
    const inspected = f.store.rows('recoveryRuns')[0]!;
    const before = snapshot(f);
    const evidence = approvalEvidence(inspected, report, {
        currentSequence: 8, postBackupEntries: 1, currentHeadHash: 'f'.repeat(64)
    });
    await assert.rejects(f.store.transaction(tx => r.approve(tx, a, inspected.id, external(f), evidence,
        { requestId: randomUUID(), ip: 'CLI' })),
        (e: unknown) => e instanceof AppError && e.code === 'RECOVERY_JOURNAL_DELTA_UNRESOLVED');
    assert.deepEqual(snapshot(f), before);
});

test('DEV-09C stale inspection or mismatched backup evidence cannot approve', async () => {
    const f = await fixture();
    const { reviewer } = await seed(f);
    const r = recovery(f), a = await actor(f, r);
    const oldEpoch = f.store.rows('workspaces')[0]!.recoveryEpoch;
    const prepared = await f.store.transaction(tx => r.prepare(tx, a, hashSecret(oldEpoch),
        { requestId: randomUUID(), ip: 'CLI' }));
    const report = await f.store.transaction(tx => r.inspect(tx, a, prepared.id, external(f),
        { requestId: randomUUID(), ip: 'CLI' }));
    const inspected = f.store.rows('recoveryRuns')[0]!;

    await assert.rejects(f.store.transaction(tx => r.approve(tx, a, inspected.id, external(f),
        approvalEvidence(inspected, report, { contactKeyDigest: '0'.repeat(64) }),
        { requestId: randomUUID(), ip: 'CLI' })),
        (e: unknown) => e instanceof AppError && e.code === 'RECOVERY_BACKUP_KEY_MISMATCH');

    await f.store.transaction(async tx => {
        const member = (await tx.find('memberships', { id: reviewer.id }))[0]!;
        await tx.replace('memberships', { ...member, revision: member.revision + 1, status: 'ACTIVE',
            updatedAt: f.clock.now().toISOString() });
    });
    await assert.rejects(f.store.transaction(tx => r.approve(tx, a, inspected.id, external(f),
        approvalEvidence(inspected, report), { requestId: randomUUID(), ip: 'CLI' })),
        (e: unknown) => e instanceof AppError && e.code === 'RECOVERY_BLOCKERS_PRESENT');
    assert.equal(f.store.rows('workspaces')[0]!.recoveryEpoch, oldEpoch);
});

test('DEV-09C approval audit failure rolls workspace epoch and approval evidence back', async () => {
    const f = await fixture();
    await seed(f);
    const r = recovery(f), a = await actor(f, r);
    const oldEpoch = f.store.rows('workspaces')[0]!.recoveryEpoch;
    const prepared = await f.store.transaction(tx => r.prepare(tx, a, hashSecret(oldEpoch),
        { requestId: randomUUID(), ip: 'CLI' }));
    const report = await f.store.transaction(tx => r.inspect(tx, a, prepared.id, external(f),
        { requestId: randomUUID(), ip: 'CLI' }));
    const inspected = structuredClone(f.store.rows('recoveryRuns')[0]!);
    f.store.failNextAudit = true;
    await assert.rejects(f.store.transaction(tx => r.approve(tx, a, inspected.id, external(f),
        approvalEvidence(inspected, report), { requestId: randomUUID(), ip: 'CLI' })), /injected audit failure/);
    assert.equal(f.store.rows('workspaces')[0]!.recoveryEpoch, oldEpoch);
    assert.deepEqual(f.store.rows('recoveryRuns')[0], inspected);
});
