import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SafetyJournalWriter, readSafetyJournal, safetyCriticalAudit } from '../../apps/api/src/recovery/safety-journal.ts';
import type { AuditEvent } from '../../packages/core/src/model.ts';

function dir() {
    const root = mkdtempSync(join(tmpdir(), 'once-safety-journal-'));
    chmodSync(root, 0o700);
    return root;
}
function audit(action: string, at: string, id = randomUUID()): AuditEvent {
    return {
        id, workspaceId: '11111111-1111-4111-8111-111111111111',
        createdAt: at, updatedAt: at, revision: 1,
        actorId: '22222222-2222-4222-8222-222222222222',
        action, resourceKind: 'membership',
        resourceId: '33333333-3333-4333-8333-333333333333',
        changedFields: ['status','sessionEpoch'], requestId: randomUUID()
    };
}

test('DEV-09C safety journal is private, ordered, append-idempotent and excludes noisy reads', async () => {
    const root = dir(), path = join(root, 'journal.jsonl');
    try {
        const writer = await SafetyJournalWriter.open(path);
        assert.equal(statSync(path).mode & 0o777, 0o600);
        const noisy = audit('auth.login', '2026-09-26T00:00:00.000Z');
        const later = audit('member.disable', '2026-09-26T00:00:02.000Z');
        const earlier = audit('source.suspend', '2026-09-26T00:00:01.000Z');
        assert.equal(safetyCriticalAudit(noisy), false);
        assert.equal(safetyCriticalAudit(later), true);

        assert.equal(await writer.append([later, noisy, earlier]), 2);
        assert.equal(writer.snapshot().sequence, 2);
        const state = await readSafetyJournal(path);
        assert.equal(state.entries.length, 2);
        assert.equal(state.entries[0]!.auditId, earlier.id);
        assert.equal(state.entries[1]!.auditId, later.id);
        assert.equal(state.entries[0]!.seq, 1);
        assert.equal(state.entries[1]!.seq, 2);
        assert.equal(state.entries[1]!.prevHash, state.entries[0]!.hash);
        assert.equal(await writer.append([earlier, later]), 0);
        assert.equal((await readSafetyJournal(path)).snapshot.headHash, state.snapshot.headHash);
    }
    finally { rmSync(root, { recursive: true, force: true }); }
});

test('DEV-09D concurrent first open is race-safe and never overwrites the journal header', async () => {
    const root = dir(), path = join(root, 'journal.jsonl');
    try {
        const [a,b] = await Promise.all([SafetyJournalWriter.open(path), SafetyJournalWriter.open(path)]);
        assert.equal(a.snapshot().journalId, b.snapshot().journalId);
        await Promise.all([
            a.writeAhead({ intentId: 'intent:' + randomUUID(), workspaceId: '11111111-1111-4111-8111-111111111111',
                operation: 'source.suspend', requestId: randomUUID(), resourceId: randomUUID() }),
            b.writeAhead({ intentId: 'intent:' + randomUUID(), workspaceId: '11111111-1111-4111-8111-111111111111',
                operation: 'member.disable', requestId: randomUUID(), resourceId: randomUUID() })
        ]);
        const state = await readSafetyJournal(path);
        assert.equal(state.entries.length, 2);
        assert.equal(state.header.journalId, a.snapshot().journalId);
    }
    finally { rmSync(root, { recursive: true, force: true }); }
});

test('DEV-09C safety journal detects line tampering, truncation and duplicate audit ids', async () => {
    const root = dir(), path = join(root, 'journal.jsonl');
    try {
        const writer = await SafetyJournalWriter.open(path);
        const a = audit('member.disable', '2026-09-26T00:00:01.000Z');
        await writer.append([a]);
        const original = readFileSync(path, 'utf8');

        writeFileSync(path, original.replace('"member.disable"', '"member.permissions"'), { mode: 0o600 });
        await assert.rejects(readSafetyJournal(path));

        writeFileSync(path, original.slice(0, -1), { mode: 0o600 });
        await assert.rejects(readSafetyJournal(path));

        writeFileSync(path, original, { mode: 0o600 });
        const lines = original.trimEnd().split('\n');
        writeFileSync(path, original + lines[1] + '\n', { mode: 0o600 });
        await assert.rejects(readSafetyJournal(path));
    }
    finally { rmSync(root, { recursive: true, force: true }); }
});

test('DEV-09C safety journal refuses public parent/file permissions', async () => {
    const root = dir(), path = join(root, 'journal.jsonl');
    try {
        chmodSync(root, 0o755);
        await assert.rejects(SafetyJournalWriter.open(path));
        chmodSync(root, 0o700);
        await SafetyJournalWriter.open(path);
        chmodSync(path, 0o644);
        await assert.rejects(readSafetyJournal(path));
    }
    finally { rmSync(root, { recursive: true, force: true }); }
});
