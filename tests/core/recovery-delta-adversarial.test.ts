import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SafetyJournalWriter, readSafetyJournal } from '../../apps/api/src/recovery/safety-journal.ts';
import { analyzeSafetyDeltas } from '../../apps/api/src/recovery/delta-resolution.ts';
import { digest } from '../../packages/core/src/json.ts';
import type { SafetyIntent } from '../../packages/core/src/safety-intent.ts';
import type { AuditEvent } from '../../packages/core/src/model.ts';

const workspaceId = '11111111-1111-4111-8111-111111111111';
function intent(): SafetyIntent {
    return { intentId: 'intent:' + randomUUID(), workspaceId, operation: 'source.suspend',
        requestId: randomUUID(), resourceId: randomUUID() };
}
function audit(i: SafetyIntent, overrides: Partial<AuditEvent> = {}): AuditEvent {
    const at = '2026-09-26T10:00:00.000Z';
    return { id: randomUUID(), workspaceId: i.workspaceId, createdAt: at, updatedAt: at,
        revision: 1, actorId: randomUUID(), action: i.operation, resourceKind: 'source',
        resourceId: i.resourceId, changedFields: ['status'], requestId: i.requestId, ...overrides };
}
async function journal(run: (writer: SafetyJournalWriter, path: string) => Promise<void>) {
    const dir = mkdtempSync(join(tmpdir(), 'once-delta-adversarial-'));
    chmodSync(dir, 0o700);
    try { const path = join(dir, 'journal.jsonl'); await run(await SafetyJournalWriter.open(path), path); }
    finally { rmSync(dir, { recursive: true, force: true }); }
}

test('DEV-09E a different request cannot borrow a same-resource commit marker', async () => {
    await journal(async writer => {
        const i = intent();
        await writer.writeAhead(i); await writer.committed(i, i.resourceId);
        const anchor = writer.snapshot().sequence;
        await writer.append([audit(i, { requestId: randomUUID() })]);
        const report = analyzeSafetyDeltas(writer.state, anchor);
        assert.equal(report.unresolved, 1);
        assert.equal(report.items[0]!.reasonCode, 'UNMATCHED_COMMITTED_AUDIT');
    });
});

test('DEV-09E an audit cannot borrow another workspace commit marker', async () => {
    await journal(async writer => {
        const i = intent();
        await writer.writeAhead(i); await writer.committed(i, i.resourceId);
        const anchor = writer.snapshot().sequence;
        await writer.append([audit(i, { workspaceId: randomUUID() })]);
        assert.equal(analyzeSafetyDeltas(writer.state, anchor).unresolved, 1);
    });
});

test('DEV-09E a commit marker can account for only one distinct audit event', async () => {
    await journal(async writer => {
        const i = intent();
        await writer.writeAhead(i); await writer.committed(i, i.resourceId);
        await writer.append([audit(i)]);
        const anchor = writer.snapshot().sequence;
        await writer.append([audit(i)]);
        assert.equal(analyzeSafetyDeltas(writer.state, anchor).unresolved, 1);
    });
});

test('DEV-09E an orphan abort is not evidence of NO_COMMIT', async () => {
    await journal(async writer => {
        await writer.aborted(intent(), 'NOT_STARTED');
        const report = analyzeSafetyDeltas(writer.state, 0);
        assert.equal(report.unresolved, 1);
        assert.equal(report.items[0]!.reasonCode, 'MISSING_INTENT');
    });
});

test('DEV-09E a pre-backup orphan commit cannot explain a delayed audit', async () => {
    await journal(async writer => {
        const i = intent();
        await writer.committed(i, i.resourceId);
        const anchor = writer.snapshot().sequence;
        await writer.append([audit(i)]);
        assert.equal(analyzeSafetyDeltas(writer.state, anchor).unresolved, 1);
    });
});

test('DEV-09E contradictory pre-backup markers are still validated before using delayed evidence', async () => {
    await journal(async writer => {
        const i = intent();
        await writer.writeAhead(i); await writer.committed(i, i.resourceId); await writer.aborted(i, 'NOT_STARTED');
        const anchor = writer.snapshot().sequence;
        await writer.append([audit(i)]);
        assert.throws(() => analyzeSafetyDeltas(writer.state, anchor));
    });
});

test('DEV-09E contained commit must identify the resource named by its write-ahead intent', async () => {
    await journal(async writer => {
        const i = intent();
        await writer.writeAhead(i); await writer.committed(i, randomUUID());
        assert.throws(() => analyzeSafetyDeltas(writer.state, 0));
    });
});

test('DEV-09E aborted multi-transaction worker is not proven side-effect free', async () => {
    await journal(async writer => {
        const i = { ...intent(), operation: 'worker.deletion.finalize' };
        await writer.writeAhead(i); await writer.aborted(i, 'NOT_STARTED');
        assert.equal(analyzeSafetyDeltas(writer.state, 0).unresolved, 1);
    });
});

test('DEV-09E same request and valid marker pair still resolves a delayed audit', async () => {
    await journal(async writer => {
        const i = intent();
        await writer.writeAhead(i); await writer.committed(i, i.resourceId);
        const anchor = writer.snapshot().sequence;
        await writer.append([audit(i)]);
        const report = analyzeSafetyDeltas(writer.state, anchor);
        assert.equal(report.unresolved, 0);
        assert.equal(report.items[0]!.resolution, 'SUPPLEMENTAL_AUDIT');
    });
});

test('DEV-09E legacy v1 journal stays readable but cannot invent request correlation', async () => {
    await journal(async (writer, path) => {
        const i = intent();
        await writer.writeAhead(i); await writer.committed(i, i.resourceId);
        await writer.append([audit(i)]);
        const rows = readFileSync(path, 'utf8').trimEnd().split('\n').map(x => JSON.parse(x));
        let prevHash = digest(rows[0]);
        for (const row of rows.slice(1)) {
            row.schemaVersion = 'once-safety-journal-entry-v1';
            delete row.requestId; delete row.hash;
            row.prevHash = prevHash; row.hash = digest(row); prevHash = row.hash;
        }
        writeFileSync(path, rows.map(x => JSON.stringify(x)).join('\n') + '\n', { mode: 0o600 });
        const legacyBytes = readFileSync(path);
        const state = await readSafetyJournal(path);
        assert.equal(analyzeSafetyDeltas(state, 2).unresolved, 1);
        const reopened = await SafetyJournalWriter.open(path);
        const next = intent(); await reopened.writeAhead(next);
        assert.ok(readFileSync(path).subarray(0, legacyBytes.length).equals(legacyBytes),
            'forward-only journal append must not rewrite legacy hashes or backup anchors');
        assert.equal((await readSafetyJournal(path)).entries.length, 4);
    });
});


test('DEV-09E legacy abort markers are not proof that a transaction never started', async () => {
    await journal(async (writer, path) => {
        const i = intent();
        await writer.writeAhead(i); await writer.aborted(i, 'NOT_STARTED');
        const rows = readFileSync(path, 'utf8').trimEnd().split('\n').map(x => JSON.parse(x));
        let prevHash = digest(rows[0]);
        for (const row of rows.slice(1)) {
            row.schemaVersion = 'once-safety-journal-entry-v1';
            delete row.requestId; delete row.abortProof; delete row.hash;
            row.prevHash = prevHash; row.hash = digest(row); prevHash = row.hash;
        }
        writeFileSync(path, rows.map(x => JSON.stringify(x)).join('\n') + '\n', { mode: 0o600 });
        const report = analyzeSafetyDeltas(await readSafetyJournal(path), 0);
        assert.equal(report.unresolved, 1);
        assert.equal(report.items[0]!.reasonCode, 'ABORT_NOT_PROVEN_SAFE');
    });
});

test('DEV-09E unproven abort and malformed v2 request identity cannot be appended as evidence', async () => {
    await journal(async (writer, path) => {
        const i = intent();
        await writer.writeAhead(i);
        const before = readFileSync(path);
        // Exercise the JavaScript boundary, where TypeScript cannot enforce the proof parameter.
        await assert.rejects(writer.aborted(i, undefined as never));
        assert.ok(readFileSync(path).equals(before));
        const rows = readFileSync(path, 'utf8').trimEnd().split('\n').map(x => JSON.parse(x));
        delete rows[1].requestId; delete rows[1].hash; rows[1].hash = digest(rows[1]);
        writeFileSync(path, rows.map(x => JSON.stringify(x)).join('\n') + '\n', { mode: 0o600 });
        await assert.rejects(readSafetyJournal(path));
    });
});
