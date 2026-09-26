import type { RecoveryDeltaItem, RecoveryDeltaResolutionReport } from '../../../../packages/core/src/recovery-model.ts';
import { RECOVERY_PREPARE_CONTAINED_OPERATIONS } from '../../../../packages/core/src/recovery-model.ts';
import { invariant } from '../../../../packages/core/src/errors.ts';
import { SAFETY_JOURNAL_ENTRY_VERSION } from './safety-journal.ts';
import type { SafetyJournalEntry, SafetyJournalState } from './safety-journal.ts';

const CONTAINED = new Set<string>(RECOVERY_PREPARE_CONTAINED_OPERATIONS);

function suffix(id: string, prefix: string): string | null {
    if (!id.startsWith(prefix)) return null;
    invariant(id.length > prefix.length, 'SAFETY_DELTA_INVALID', '安全日志 marker 标识为空', 503);
    return id.slice(prefix.length);
}
function op(entry: SafetyJournalEntry, prefix: string): string {
    invariant(entry.action.startsWith(prefix) && entry.action.length > prefix.length,
        'SAFETY_DELTA_INVALID', '安全日志 completion marker operation 无效', 503);
    return entry.action.slice(prefix.length);
}
function item(key: string, operation: string, resourceId: string,
    state: RecoveryDeltaItem['state'], resolution: RecoveryDeltaItem['resolution'],
    reasonCode: string, evidenceSeqs: number[]): RecoveryDeltaItem {
    return { key, operation, resourceId, state, resolution, reasonCode,
        evidenceSeqs: [...evidenceSeqs].sort((a, b) => a - b) };
}
function auditIdentity(entry: SafetyJournalEntry, operation: string): string | null {
    // Legacy bytes/anchors remain valid, but v1 never recorded a request identity.
    if (entry.schemaVersion !== SAFETY_JOURNAL_ENTRY_VERSION || !entry.requestId) return null;
    return JSON.stringify([entry.workspaceId, operation, entry.resourceId, entry.requestId]);
}

export function analyzeSafetyDeltas(state: SafetyJournalState, backupSequence: number): RecoveryDeltaResolutionReport {
    invariant(Number.isSafeInteger(backupSequence) && backupSequence >= 0 && backupSequence <= state.entries.length,
        'SAFETY_DELTA_ANCHOR_INVALID', '安全日志 backup sequence 无效', 503);
    invariant(state.snapshot.sequence === state.entries.length
        && state.entries.every((entry, index) => entry.seq === index + 1),
        'SAFETY_DELTA_INVALID', '安全日志快照与增量序列不一致', 503);
    const intents = new Map<string, SafetyJournalEntry>();
    const commits = new Map<string, SafetyJournalEntry>();
    const aborts = new Map<string, SafetyJournalEntry>();
    const markerSeqs = new Set<number>();
    const logicalKeys = new Set<string>();
    for (const entry of state.entries) {
        const i = suffix(entry.auditId, 'intent:');
        const c = suffix(entry.auditId, 'commit:');
        const a = suffix(entry.auditId, 'abort:');
        const key = i ?? c ?? a;
        if (key === null) {
            invariant(!/^(intent|commit|abort)\./.test(entry.action)
                && !['intent', 'intent-commit', 'intent-abort'].includes(entry.resourceKind),
                'SAFETY_DELTA_INVALID', '未归并的 marker entry', 503);
            continue;
        }
        const map = i !== null ? intents : c !== null ? commits : aborts;
        const kind = i !== null ? 'intent' : c !== null ? 'intent-commit' : 'intent-abort';
        invariant(entry.resourceKind === kind && !map.has(key),
            'SAFETY_DELTA_INVALID', 'marker 类型或唯一性无效', 503);
        map.set(key, entry);
        markerSeqs.add(entry.seq);
        logicalKeys.add(key);
    }

    const post = state.entries.filter(x => x.seq > backupSequence);
    const used = new Set<number>();
    const items: RecoveryDeltaItem[] = [];
    const committedPairs = new Map<string, number[]>();

    // Validate the WHOLE marker chain before any pre-anchor marker may explain a delayed audit.
    for (const key of [...logicalKeys].sort()) {
        const intent = intents.get(key), commit = commits.get(key), abort = aborts.get(key);
        invariant(!(commit && abort), 'SAFETY_DELTA_INVALID',
            '同一安全意图不能同时出现 commit 与 abort marker', 503);
        const operation = intent ? op(intent, 'intent.') : commit ? op(commit, 'commit.') : op(abort!, 'abort.');
        if (commit) invariant(commit.action === 'commit.' + operation, 'SAFETY_DELTA_INVALID', 'commit operation 不一致', 503);
        if (abort) invariant(abort.action === 'abort.' + operation, 'SAFETY_DELTA_INVALID', 'abort operation 不一致', 503);
        const workspaceId = intent?.workspaceId ?? commit?.workspaceId ?? abort!.workspaceId;
        const rows = [intent, commit, abort].filter((x): x is SafetyJournalEntry => !!x);
        invariant(rows.every(x => x.workspaceId === workspaceId),
            'SAFETY_DELTA_INVALID', '同一安全意图的 marker workspace 不一致', 503);
        if (intent && commit) {
            invariant(intent.seq < commit.seq, 'SAFETY_DELTA_INVALID', 'commit marker 不能早于对应 intent', 503);
            // Create commands may discover a new ID; containment operations always target an existing ID.
            invariant(!CONTAINED.has(operation) || intent.resourceId === commit.resourceId,
                'SAFETY_DELTA_INVALID', '受恢复隔离覆盖的 commit 资源标识与 intent 不一致', 503);
            const identity = auditIdentity(commit, operation);
            if (identity !== null) {
                const matches = committedPairs.get(identity) ?? [];
                matches.push(commit.seq);
                committedPairs.set(identity, matches);
            }
        }
        if (intent && abort) {
            invariant(intent.seq < abort.seq, 'SAFETY_DELTA_INVALID', 'abort marker 不能早于对应 intent', 503);
            invariant(intent.resourceId === abort.resourceId,
                'SAFETY_DELTA_INVALID', 'abort marker 资源标识与 intent 不一致', 503);
        }
        const evidence = rows.filter(x => x.seq > backupSequence);
        if (!evidence.length) continue;
        evidence.forEach(row => used.add(row.seq));
        const seqs = evidence.map(x => x.seq);
        const resourceId = commit?.resourceId ?? intent?.resourceId ?? abort!.resourceId;
        if (commit) {
            if (!intent) items.push(item(key, operation, resourceId, 'COMMITTED', 'BLOCKER', 'MISSING_INTENT', seqs));
            else if (CONTAINED.has(operation)) items.push(item(key, operation, resourceId,
                'COMMITTED', 'CONTAINED_BY_PREPARE', 'PREPARE_IS_MORE_RESTRICTIVE', seqs));
            else items.push(item(key, operation, resourceId, 'COMMITTED', 'BLOCKER', 'COMMITTED_REPLAY_REQUIRED', seqs));
        } else if (abort) {
            const provenNotStarted = !!intent && intent.schemaVersion === SAFETY_JOURNAL_ENTRY_VERSION
                && abort.schemaVersion === SAFETY_JOURNAL_ENTRY_VERSION && abort.abortProof === 'NOT_STARTED'
                && abort.requestId === intent.requestId && !operation.startsWith('worker.');
            items.push(item(key, operation, resourceId, 'ABORTED', provenNotStarted ? 'NO_COMMIT' : 'BLOCKER',
                !intent ? 'MISSING_INTENT' : provenNotStarted ? 'ABORT_MARKER' : 'ABORT_NOT_PROVEN_SAFE', seqs));
        } else {
            items.push(item(key, operation, resourceId, 'UNRESOLVED', 'BLOCKER', 'MISSING_COMPLETION_MARKER', seqs));
        }
    }

    // One verified completion can account for only one distinct audit. Earlier audits consume
    // their completion too; otherwise an extra post-anchor audit could borrow an already-used marker.
    const consumed = new Set<number>();
    for (const row of state.entries) {
        if (markerSeqs.has(row.seq)) continue;
        const identity = auditIdentity(row, row.action);
        const candidates = identity === null ? [] : (committedPairs.get(identity) ?? []);
        const match = candidates.length === 1 && !consumed.has(candidates[0]!) ? candidates[0] : undefined;
        if (match !== undefined) consumed.add(match);
        if (row.seq <= backupSequence) continue;
        items.push(item('audit:' + row.auditId, row.action, row.resourceId, 'AUDIT_ONLY',
            match !== undefined ? 'SUPPLEMENTAL_AUDIT' : 'BLOCKER',
            match !== undefined ? 'MATCHED_COMMIT_MARKER' : 'UNMATCHED_COMMITTED_AUDIT', [row.seq]));
        used.add(row.seq);
    }

    const expected = post.map(x => x.seq).sort((a, b) => a - b);
    const accounted = [...used].sort((a, b) => a - b);
    invariant(expected.length === accounted.length && expected.every((x, i) => x === accounted[i]),
        'SAFETY_DELTA_INVALID', '安全日志增量没有被完整归并', 503);
    items.sort((a, b) => (a.evidenceSeqs[0] ?? 0) - (b.evidenceSeqs[0] ?? 0) || a.key.localeCompare(b.key));
    const unresolved = items.filter(x => x.resolution === 'BLOCKER').length;
    return { schemaVersion: 'once-recovery-delta-v1', backupSequence, currentSequence: state.snapshot.sequence,
        postBackupEntries: state.snapshot.sequence - backupSequence,
        resolved: items.length - unresolved, unresolved, items };
}
