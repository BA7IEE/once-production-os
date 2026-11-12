import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RecoveryOps } from '../../packages/core/src/recovery.ts';
import { hashSecret } from '../../packages/core/src/crypto.ts';
import { digest } from '../../packages/core/src/json.ts';
import { AppError } from '../../packages/core/src/errors.ts';
import type { RecoveryApprovalEvidence, RecoveryCheckReport, RecoveryRun } from '../../packages/core/src/recovery-model.ts';
import { MemoryStore } from '../support/memory-store.ts';
import { FakeClock } from '../support/fixtures.ts';
import { authFixture, loginTalent } from '../support/talent-auth.ts';

// MemoryStore checks exercise the code paths only: they do not emulate a
// PostgreSQL transaction, an independent witness, a journal, or a real restore.
const HOLD = 'RECOVERY_TRUST_EVIDENCE_UNAVAILABLE';
const meta = () => ({ requestId: randomUUID(), ip: 'synthetic-test' });
const emptyDigest = digest([]);
const external = (migrationMatch = true) => ({
    migrationDigest: 'd'.repeat(64), migrationMatch,
    media: { provider: 'disabled' as const, identityDigest: emptyDigest,
        backupIdentityDigest: emptyDigest, expectedAssetIds: [], verifiedAssetIds: [],
        missingAssetIds: [], mismatchAssetIds: [] }
});

async function preparedFixture() {
    const store = new MemoryStore();
    const clock = new FakeClock();
    const workspaceId = '11111111-1111-4111-8111-111111111111';
    const userId = '22222222-2222-4222-8222-222222222222';
    const membershipId = '33333333-3333-4333-8333-333333333333';
    const createdAt = clock.now().toISOString();
    const oldEpoch = 'S'.repeat(48);
    await store.transaction(async tx => {
        await tx.insert('workspaces', { id: workspaceId, name: 'synthetic', createdAt, recoveryEpoch: oldEpoch });
        await tx.insert('users', { id: userId, workspaceId, createdAt, updatedAt: createdAt,
            revision: 1, loginName: 'owner', displayName: 'synthetic', passwordHash: null,
            status: 'ACTIVE', sessionEpoch: 1 });
        await tx.insert('memberships', { id: membershipId, workspaceId, createdAt, updatedAt: createdAt,
            revision: 1, userId, role: 'ADMIN', extraPermissions: [], status: 'ACTIVE' });
    });
    const config = { accessMode: 'MAINTENANCE' as const, dataEgressMode: 'DISABLED' as const,
        dataCleanupMode: 'DISABLED' as const, dataMergeMode: 'DISABLED' as const,
        recoveryEpoch: 'R'.repeat(48), contactKey: Buffer.alloc(32, 9) };
    const ops = new RecoveryOps(clock, config);
    const actor = await store.transaction(tx => ops.actorFromRestoredTarget(tx, 'owner'));
    const run = await store.transaction(tx => ops.prepare(tx, actor, hashSecret(oldEpoch), meta()));
    return { store, clock, config, ops, actor, run, oldEpoch };
}

function relevantState(f: Awaited<ReturnType<typeof preparedFixture>>) {
    return {
        workspaces: f.store.rows('workspaces'),
        runs: f.store.rows('recoveryRuns'),
        audits: f.store.rows('audits')
    };
}

function legacyShapedEvidence(run: RecoveryRun, report: RecoveryCheckReport): RecoveryApprovalEvidence {
    const sequence = 7, head = 'e'.repeat(64);
    const deltaResolution = { schemaVersion: 'once-recovery-delta-v1' as const,
        backupSequence: sequence, currentSequence: sequence, postBackupEntries: 0,
        resolved: 0, unresolved: 0, items: [] };
    return { schemaVersion: 'once-recovery-approval-v1', backupId: randomUUID(),
        backupManifestDigest: 'a'.repeat(64), databaseSha256: 'b'.repeat(64),
        recoveryEpochDigest: run.sourceEpochDigest, contactKeyDigest: report.contactKeyDigest,
        migrationDigest: report.migrationDigest, mediaIdentityDigest: report.media.backupIdentityDigest,
        reportDigest: run.reportDigest!, deltaResolutionDigest: digest(deltaResolution), deltaResolution,
        safetyJournal: { journalId: randomUUID(), backupSequence: sequence, backupHeadHash: head,
            currentSequence: sequence, currentHeadHash: head, postBackupEntries: 0 } };
}

async function simulatedLegacyInspected(f: Awaited<ReturnType<typeof preparedFixture>>) {
    const actual = await f.store.transaction(tx => f.ops.check(tx, f.actor, f.run.id, external()));
    assert.deepEqual(actual.blockers, [HOLD]);
    // Deliberately construct a prior-contract clean report in this test's own
    // MemoryStore. This is neither a real old-version run nor trusted evidence.
    const report: RecoveryCheckReport = { ...actual, blockers: [] };
    const run: RecoveryRun = { ...f.run, state: 'INSPECTED', checkedAt: report.checkedAt,
        report, reportDigest: digest(report), approvedAt: null, approvalDigest: null, approval: {} };
    await f.store.transaction(tx => tx.replace('recoveryRuns', run));
    return { run, report, evidence: legacyShapedEvidence(run, report) };
}

const denied = (error: unknown) => error instanceof AppError && error.code === HOLD;

test('no-stop recovery CHECK explicitly blocks when independent proof is unavailable and is zero-write', async () => {
    const f = await preparedFixture();
    assert.equal(f.store.rows('receipts').length, 0);
    const before = relevantState(f);
    const report = await f.store.transaction(tx => f.ops.check(tx, f.actor, f.run.id, external()));
    assert.deepEqual(report.blockers, [HOLD]);
    assert.deepEqual(relevantState(f), before);
});

test('the new hold coexists with an existing migration blocker and cannot be removed by an extra caller claim', async () => {
    const f = await preparedFixture();
    const before = relevantState(f);
    const untrustedExternal = { ...external(false), independentWitnessVerified: true };
    const report = await f.store.transaction(tx => f.ops.check(tx, f.actor, f.run.id, untrustedExternal));
    assert.ok(report.blockers.includes('MIGRATION_MISMATCH'));
    assert.ok(report.blockers.includes(HOLD));
    assert.deepEqual(relevantState(f), before);
});

test('recorded inspection retains the blocker and a direct approval attempt cannot mutate it', async () => {
    const f = await preparedFixture();
    const report = await f.store.transaction(tx => f.ops.inspect(tx, f.actor, f.run.id, external(), meta()));
    assert.deepEqual(report.blockers, [HOLD]);
    const inspected = f.store.rows('recoveryRuns').find(row => row.id === f.run.id)!;
    assert.equal(inspected.state, 'INSPECTED');
    assert.deepEqual(inspected.report, report);
    assert.equal(inspected.reportDigest, digest(report));
    assert.equal(f.store.rows('audits').filter(row => row.action === 'recovery.inspect').length, 1);
    const before = relevantState(f);
    await assert.rejects(f.store.transaction(tx => f.ops.approve(tx, f.actor, f.run.id, external(),
        legacyShapedEvidence(inspected, report), meta())), denied);
    assert.deepEqual(relevantState(f), before);
    assert.equal(f.store.rows('workspaces')[0]!.recoveryEpoch, f.oldEpoch);
    assert.equal(f.store.rows('audits').filter(row => row.action === 'recovery.approve').length, 0);
});

test('a constructed prior-contract clean report and plausible old evidence cannot bypass repeated direct approvals', async () => {
    const f = await preparedFixture();
    const { run, evidence } = await simulatedLegacyInspected(f);
    const before = relevantState(f);
    for (let attempt = 0; attempt < 2; attempt++) {
        await assert.rejects(f.store.transaction(tx => f.ops.approve(tx, f.actor, run.id, external(), evidence, meta())), denied);
        assert.deepEqual(relevantState(f), before);
    }
    assert.equal(f.store.rows('workspaces')[0]!.recoveryEpoch, f.oldEpoch);
    assert.equal(f.store.rows('recoveryRuns')[0]!.state, 'INSPECTED');
    assert.equal(f.store.rows('audits').filter(row => row.action === 'recovery.approve').length, 0);
});

test('empty, malformed, and caller-claimed proof never allow approval or change the restored state', async () => {
    const f = await preparedFixture();
    const { run, evidence } = await simulatedLegacyInspected(f);
    const cases: Array<{ value: unknown; code: string; status: number }> = [
        { value: undefined, code: 'RECOVERY_APPROVAL_INVALID', status: 400 },
        { value: null, code: 'RECOVERY_APPROVAL_INVALID', status: 400 },
        { value: {}, code: 'RECOVERY_APPROVAL_INVALID', status: 400 },
        { value: { schemaVersion: 'invalid' }, code: 'RECOVERY_APPROVAL_INVALID', status: 400 },
        { value: { ...evidence, databaseSha256: 'invalid' }, code: 'RECOVERY_APPROVAL_INVALID', status: 400 },
        { value: { ...evidence, backupId: 'invalid' }, code: 'VALIDATION_FAILED', status: 400 },
        { value: { ...evidence, deltaResolutionDigest: '0'.repeat(64) }, code: 'RECOVERY_DELTA_INVALID', status: 400 },
        { value: { ...evidence, independentWitnessVerified: true, sourceStopped: true, targetSnapshotVerified: true },
            code: HOLD, status: 409 }
    ];
    const before = relevantState(f);
    for (const candidate of cases) {
        await assert.rejects(f.store.transaction(tx => f.ops.approve(tx, f.actor, run.id, external(),
            candidate.value as RecoveryApprovalEvidence, meta())),
        (error: unknown) => error instanceof AppError && error.code === candidate.code && error.status === candidate.status);
        assert.deepEqual(relevantState(f), before);
    }
    assert.equal(f.store.rows('workspaces')[0]!.recoveryEpoch, f.oldEpoch);
    assert.equal(f.store.rows('audits').filter(row => row.action === 'recovery.approve').length, 0);
});

test('catching and swallowing the trust refusal inside a committed transaction cannot persist approval writes', async () => {
    const f = await preparedFixture();
    const { run, evidence } = await simulatedLegacyInspected(f);
    const before = relevantState(f);
    let caught = false;
    await f.store.transaction(async tx => {
        try {
            await f.ops.approve(tx, f.actor, run.id, external(), evidence, meta());
        } catch (error) {
            assert.ok(denied(error));
            caught = true;
        }
        assert.equal(caught, true, 'a valid legacy request must reach the trust hold');
        // Return normally so MemoryStore commits the transaction callback.
    });
    assert.deepEqual(relevantState(f), before);
    assert.equal(f.store.rows('workspaces')[0]!.recoveryEpoch, f.oldEpoch);
    assert.equal(f.store.rows('audits').filter(row => row.action === 'recovery.approve').length, 0);
});

test('existing closed-execution gate still rejects before any approval write', async () => {
    const f = await preparedFixture();
    const { run, evidence } = await simulatedLegacyInspected(f);
    const unsafe = new RecoveryOps(f.clock, { ...f.config, dataCleanupMode: 'INTERNAL_APPROVED' });
    const before = relevantState(f);
    await assert.rejects(f.store.transaction(tx => unsafe.approve(tx, f.actor, run.id, external(), evidence, meta())),
        (error: unknown) => error instanceof AppError && error.code === 'RECOVERY_GATES_NOT_CLOSED');
    assert.deepEqual(relevantState(f), before);
});

// A test-only in-memory provider and synthetic account exercise the real Core
// stop command; no PostgreSQL, network, actual notifications or journal is used.
async function syntheticStopFixture(collision = false, createOtherAccount = false) {
    const store = new MemoryStore();
    const f = await authFixture(store);
    const talent = await loginTalent(f, 'synthetic-stop@example.invalid');
    const other = createOtherAccount ? await loginTalent(f, 'synthetic-other@example.invalid') : null;
    f.app.config.portalCommandStopEnabled = true;
    const initialKey = randomUUID();
    if (collision) {
        const original = await talent.client.raw('POST', '/portal/auth/revoke-other-sessions', {},
            { 'x-once-talent-account': talent.accountId, 'idempotency-key': initialKey });
        assert.equal(original.status, 200);
    }
    const key = randomUUID();
    const stopped = await talent.client.raw('POST', '/portal/commands/' + key + '/stop', {},
        { 'x-once-talent-account': talent.accountId, 'idempotency-key': key });
    assert.equal(stopped.status, 200);
    const stops = store.rows('receipts').filter(row => row.operation === 'portal.command.stop' && row.commandKey === key);
    assert.equal(stops.length, 1);
    const stop = stops[0]!;
    if (collision) {
        const original = store.rows('receipts').find(row => row.operation === 'portal.sessions.revoke'
            && row.talentAccountId === talent.accountId && row.commandKey === initialKey);
        assert.ok(original);
        // Deliberately construct the conflicting pair only in this local
        // MemoryStore, modeling an old writer or inconsistent restored target.
        await store.transaction(tx => tx.insert('receipts', { ...original, id: randomUUID(), commandKey: key }));
    }
    const ops = new RecoveryOps(f.clock, { accessMode: 'MAINTENANCE', dataEgressMode: 'DISABLED',
        dataCleanupMode: 'DISABLED', dataMergeMode: 'DISABLED', recoveryEpoch: 'R'.repeat(48),
        contactKey: f.app.config.contactKey });
    const actor = await store.transaction(tx => ops.actorFromRestoredTarget(tx, 'owner'));
    const oldEpoch = store.rows('workspaces')[0]!.recoveryEpoch;
    const run = await store.transaction(tx => ops.prepare(tx, actor, hashSecret(oldEpoch), meta()));
    return { store, ops, actor, run, stop, oldEpoch, otherAccountId: other?.accountId };
}

test('an invalid stop receipt remains a distinct CHECK blocker alongside the default hold', async () => {
    const f = await syntheticStopFixture();
    const valid = await f.store.transaction(tx => f.ops.check(tx, f.actor, f.run.id, external()));
    assert.ok(valid.blockers.includes(HOLD));
    assert.ok(!valid.blockers.includes('PORTAL_STOP_RECEIPT_INVALID'));
    const invalidDigest = f.stop.requestDigest === 'f'.repeat(64) ? 'e'.repeat(64) : 'f'.repeat(64);
    await f.store.transaction(tx => tx.replace('receipts', { ...f.stop, requestDigest: invalidDigest }));
    const before = { runs: f.store.rows('recoveryRuns'), workspaces: f.store.rows('workspaces'), audits: f.store.rows('audits') };
    const invalid = await f.store.transaction(tx => f.ops.check(tx, f.actor, f.run.id, external()));
    assert.ok(invalid.blockers.includes('PORTAL_STOP_RECEIPT_INVALID'));
    assert.ok(invalid.blockers.includes(HOLD));
    assert.deepEqual({ runs: f.store.rows('recoveryRuns'), workspaces: f.store.rows('workspaces'), audits: f.store.rows('audits') }, before);
});

test('a constructed same-account same-key conflict remains a distinct CHECK blocker', async () => {
    const f = await syntheticStopFixture(true);
    const before = { runs: f.store.rows('recoveryRuns'), workspaces: f.store.rows('workspaces'), audits: f.store.rows('audits') };
    const report = await f.store.transaction(tx => f.ops.check(tx, f.actor, f.run.id, external()));
    assert.ok(report.blockers.includes('PORTAL_STOP_RECEIPT_AMBIGUOUS'));
    assert.ok(report.blockers.includes(HOLD));
    assert.ok(!report.blockers.includes('PORTAL_STOP_RECEIPT_INVALID'));
    assert.deepEqual({ runs: f.store.rows('recoveryRuns'), workspaces: f.store.rows('workspaces'), audits: f.store.rows('audits') }, before);
});

test('a valid stop field change after recorded inspection changes the CHECK database digest', async () => {
    const f = await syntheticStopFixture();
    const recorded = await f.store.transaction(tx => f.ops.inspect(tx, f.actor, f.run.id, external(), meta()));
    assert.ok(recorded.blockers.includes(HOLD));
    assert.ok(!recorded.blockers.includes('PORTAL_STOP_RECEIPT_INVALID'));
    const saved = f.store.rows('recoveryRuns').find(row => row.id === f.run.id)!;
    assert.equal(saved.reportDigest, digest(recorded));
    await f.store.transaction(tx => tx.replace('receipts',
        { ...f.stop, result: { ...f.stop.result, revision: f.stop.result.revision + 1 } }));
    const before = { runs: f.store.rows('recoveryRuns'), workspaces: f.store.rows('workspaces'), audits: f.store.rows('audits') };
    const changed = await f.store.transaction(tx => f.ops.check(tx, f.actor, f.run.id, external()));
    assert.notEqual(changed.databaseStateDigest, recorded.databaseStateDigest);
    assert.ok(changed.blockers.includes(HOLD));
    assert.ok(!changed.blockers.includes('PORTAL_STOP_RECEIPT_INVALID'));
    assert.equal(f.store.rows('recoveryRuns').find(row => row.id === f.run.id)!.reportDigest, saved.reportDigest);
    assert.deepEqual({ runs: f.store.rows('recoveryRuns'), workspaces: f.store.rows('workspaces'), audits: f.store.rows('audits') }, before);
});

type SyntheticStopFixture = Awaited<ReturnType<typeof syntheticStopFixture>>;
type StopMutation = {
    name: string;
    invalid: boolean;
    apply: (f: SyntheticStopFixture) => Promise<void>;
};

// Each edit below affects only this test's MemoryStore. The variants reproduce
// previously covered safety-state changes without modifying a safety journal
// or introducing a test-only path around the approval hold.
const stopMutations: StopMutation[] = [
    { name: 'delete the stop', invalid: false, apply: async f => {
        await f.store.transaction(tx => tx.remove('receipts', f.stop.id));
    } },
    { name: 'change key and request digest consistently', invalid: false, apply: async f => {
        const commandKey = randomUUID();
        await f.store.transaction(tx => tx.replace('receipts', { ...f.stop, commandKey,
            requestDigest: digest({ operation: 'portal.command.stop', targetId: commandKey, input: {} }) }));
    } },
    { name: 'change owner and resource consistently', invalid: false, apply: async f => {
        assert.ok(f.otherAccountId);
        await f.store.transaction(tx => tx.replace('receipts', { ...f.stop,
            talentAccountId: f.otherAccountId!, resourceId: f.otherAccountId!,
            result: { ...f.stop.result, resourceId: f.otherAccountId! } }));
    } },
    { name: 'change request digest inconsistently', invalid: true, apply: async f => {
        const requestDigest = f.stop.requestDigest === 'f'.repeat(64) ? 'e'.repeat(64) : 'f'.repeat(64);
        await f.store.transaction(tx => tx.replace('receipts', { ...f.stop, requestDigest }));
    } },
    { name: 'change result target inconsistently', invalid: true, apply: async f => {
        assert.ok(f.otherAccountId);
        await f.store.transaction(tx => tx.replace('receipts', { ...f.stop,
            result: { ...f.stop.result, resourceId: f.otherAccountId! } }));
    } },
    { name: 'change operation ID', invalid: false, apply: async f => {
        await f.store.transaction(tx => tx.replace('receipts', { ...f.stop,
            result: { ...f.stop.result, operationId: randomUUID() } }));
    } },
    { name: 'change result revision', invalid: false, apply: async f => {
        await f.store.transaction(tx => tx.replace('receipts', { ...f.stop,
            result: { ...f.stop.result, revision: f.stop.result.revision + 1 } }));
    } },
    { name: 'change receipt metadata', invalid: false, apply: async f => {
        await f.store.transaction(tx => tx.replace('receipts', { ...f.stop,
            updatedAt: new Date(Date.parse(f.stop.updatedAt) + 1000).toISOString() }));
    } },
    { name: 'insert a second stop', invalid: false, apply: async f => {
        const commandKey = randomUUID();
        await f.store.transaction(tx => tx.insert('receipts', { ...f.stop, id: randomUUID(), commandKey,
            requestDigest: digest({ operation: 'portal.command.stop', targetId: commandKey, input: {} }),
            result: { ...f.stop.result, operationId: randomUUID() } }));
    } }
];

for (const mutation of stopMutations) {
    test('synthetic post-inspection stop mutation: ' + mutation.name, async () => {
        const f = await syntheticStopFixture(false, true);
        const recorded = await f.store.transaction(tx => f.ops.inspect(tx, f.actor, f.run.id, external(), meta()));
        assert.ok(recorded.blockers.includes(HOLD));
        assert.ok(!recorded.blockers.includes('PORTAL_STOP_RECEIPT_INVALID'));
        assert.ok(!recorded.blockers.includes('PORTAL_STOP_RECEIPT_AMBIGUOUS'));
        const inspected = f.store.rows('recoveryRuns').find(row => row.id === f.run.id)!;
        assert.equal(inspected.reportDigest, digest(recorded));
        const evidence = legacyShapedEvidence(inspected, recorded);

        await mutation.apply(f);
        const before = { runs: f.store.rows('recoveryRuns'), workspaces: f.store.rows('workspaces'), audits: f.store.rows('audits') };
        const changed = await f.store.transaction(tx => f.ops.check(tx, f.actor, f.run.id, external()));
        assert.notEqual(changed.databaseStateDigest, recorded.databaseStateDigest);
        assert.ok(changed.blockers.includes(HOLD));
        assert.equal(changed.blockers.includes('PORTAL_STOP_RECEIPT_INVALID'), mutation.invalid);
        assert.ok(!changed.blockers.includes('PORTAL_STOP_RECEIPT_AMBIGUOUS'));
        assert.deepEqual({ runs: f.store.rows('recoveryRuns'), workspaces: f.store.rows('workspaces'), audits: f.store.rows('audits') }, before);

        const expectedError = mutation.invalid ? 'RECOVERY_BLOCKERS_PRESENT' : 'RECOVERY_CHECK_STALE';
        await assert.rejects(f.store.transaction(tx => f.ops.approve(tx, f.actor, f.run.id, external(), evidence, meta())),
            (error: unknown) => error instanceof AppError && error.code === expectedError && error.status === 409);
        assert.deepEqual({ runs: f.store.rows('recoveryRuns'), workspaces: f.store.rows('workspaces'), audits: f.store.rows('audits') }, before);
        assert.equal(f.store.rows('workspaces')[0]!.recoveryEpoch, f.oldEpoch);
        assert.equal(f.store.rows('recoveryRuns').find(row => row.id === f.run.id)!.state, 'INSPECTED');
        assert.equal(f.store.rows('audits').filter(row => row.action === 'recovery.approve').length, 0);
    });
}
