import type { Actor, Clock, Source } from './model.ts';
import type { Tx } from './store.ts';
import type { DeletionItem, DeletionRequest } from './deletion-model.ts';
import { TALENT_OWNER_TABLES, TALENT_V2_TABLES } from './talent-v2-model.ts';
import { talentSnapshot } from './talent-v2-integrity.ts';
import { digest } from './json.ts';
import { invariant } from './errors.ts';
import { scopeVisible, sourceCurrent, deletionBlocked } from './policy.ts';
import { deletionWorkerActor } from './deletion-worker-policy.ts';
import { touch } from './helpers.ts';

/** Withdraw an independent evidence source without rewriting the provenance of the surviving fact.
 * Origins and source-owned professional records require their own per-record retention strategy. */
async function sourceEvidenceGraph(tx: Tx, actor: Actor, sourceId: string, clock: Clock) {
    const data = await talentSnapshot(tx, actor.workspaceId);
    const evidence = data.evidence.filter(r => r.sourceId === sourceId);
    const proposals = data.fieldProposals.filter(r => r.sourceId === sourceId);
    const sourceOwned = data.people.some(r => r.sourceId === sourceId)
        || TALENT_V2_TABLES.some(t => t !== 'fieldProposals' && t !== 'organizations' && data[t].some(r => r.sourceId === sourceId));
    type Row = typeof data.people[number];
    const owners = new Map<string, {table: keyof typeof data; row: Row}>();
    let missingOwner = false;
    for (const record of [...evidence, ...proposals]) {
        const entries = Object.entries(TALENT_OWNER_TABLES).filter(([key]) => record[key] != null);
        if (entries.length !== 1) { missingOwner = true; continue; }
        const [key, table] = entries[0]!;
        const row = data[table].find(r => r.id === record[key]);
        if (!row) { missingOwner = true; continue; }
        owners.set(table + ':' + row.id, {table, row});
    }
    const retainedEvidence = data.evidence.filter(r => r.sourceId !== sourceId && [...owners.values()].some(o =>
        Object.entries(TALENT_OWNER_TABLES).some(([key, table]) => table === o.table && r[key] === o.row.id)));
    const people = data.people.filter(p => [...owners.values()].some(o => (o.table === 'people' ? o.row.id : o.row.personId) === p.id));
    const sourceIds = new Set([sourceId, ...[...owners.values()].map(o => o.row.sourceId), ...retainedEvidence.map(e => e.sourceId), ...people.map(p => p.sourceId)]);
    const sources = data.sources.filter(s => sourceIds.has(s.id));
    const scopeIds = new Set([...people, ...sources].map(r => r.scopeId));
    const scopes = data.scopes.filter(s => scopeIds.has(s.id));
    const blockedSources = new Set<string>();
    for (const id of sourceIds) if (typeof id === 'string' && id !== sourceId && await deletionBlocked(tx, actor.workspaceId, 'SOURCE', id)) blockedSources.add(id);
    let blocker: string | null = sourceOwned ? 'TD2_SOURCE_RETENTION_REVIEW_REQUIRED' : missingOwner || sources.length !== sourceIds.size ? 'TD2_SOURCE_OWNER_MISSING' : null;
    for (const row of [...people, ...sources]) if (!await scopeVisible(tx, actor, String(row.scopeId))) blocker = 'TD2_HIDDEN_DEPENDENCY';
    // Every affected field must retain an already recorded, current, same-value basis. Merely selecting
    // another source at deletion time is not evidence, and removing the last row must not activate fallback.
    for (const record of evidence) {
        const entry = Object.entries(TALENT_OWNER_TABLES).find(([key]) => record[key] != null);
        if (!entry) continue;
        const [key, table] = entry, owner = owners.get(table + ':' + record[key])?.row;
        if (!owner) continue;
        const supported = retainedEvidence.some(e => e[key] === owner.id && e.fieldPath === record.fieldPath
            && e.valueDigest === digest(owner[String(record.fieldPath)] ?? null)
            && sources.some(s => s.id === e.sourceId && !blockedSources.has(s.id) && sourceCurrent(s as unknown as Source, clock) && s.revision === e.sourceRevision));
        if (!supported && !blocker) blocker = 'TD2_SOURCE_INDEPENDENT_EVIDENCE_REQUIRED';
    }
    for (const {table, row} of owners.values()) {
        const person = people.find(p => p.id === (table === 'people' ? row.id : row.personId));
        if (!person || person.status === 'ERASED' || await deletionBlocked(tx, actor.workspaceId, 'PERSON', person.id)) blocker = blocker ?? 'TD2_SOURCE_OWNER_UNAVAILABLE';
        if (row.supersededById) blocker = blocker ?? 'TD2_MERGE_HISTORY_RETENTION_REQUIRED';
        if (table === 'adultEligibilities' && row.originalVerificationWorkspaceId && !retainedEvidence.some(e => e.adultEligibilityId === row.id && e.fieldPath === 'state' && e.valueDigest === digest('VERIFIED_ADULT') && e.originalReviewWorkspaceId === row.originalVerificationWorkspaceId && e.originalReviewMembershipId === row.originalVerificationMembershipId && e.originalReviewedAt === row.verifiedAt)) blocker = blocker ?? 'TD2_SOURCE_VERIFICATION_HISTORY_REQUIRED';
    }
    const orderedOwners = [...owners.values()].sort((a,b) => (a.table+':'+a.row.id).localeCompare(b.table+':'+b.row.id));
    const graphDigest = digest({evidence, proposals, owners: orderedOwners, retainedEvidence,
        people: people.map(p => ({id:p.id,scopeId:p.scopeId})), scopes,
        sources: sources.map(s => s.id === sourceId ? {id:s.id,scopeId:s.scopeId} : s)});
    return {evidence, proposals, people, blocker, count:evidence.length+proposals.length,
        detailCode:`TD2_SOURCE_EVIDENCE_${graphDigest}:E${evidence.length}:P${proposals.length}:F${owners.size}`};
}
export async function previewTalentSourceErasure(tx: Tx, actor: Actor, sourceId: string, clock: Clock) {
    return sourceEvidenceGraph(tx, actor, sourceId, clock);
}
export async function eraseTalentSourceEvidence(tx: Tx, request: DeletionRequest, item: DeletionItem, clock: Clock) {
    invariant(request.targetKind === 'SOURCE' && request.targetId === item.resourceId, 'TD2_ERASURE_TARGET_INVALID', '来源证据清理必须绑定来源删除申请', 409);
    const actor = await deletionWorkerActor(tx, request);
    const graph = await sourceEvidenceGraph(tx, actor, item.resourceId, clock);
    invariant(!graph.blocker && graph.detailCode === item.detailCode, 'TD2_ERASURE_GRAPH_STALE', '资料或独立依据已经变化，拒绝使用旧来源清理计划', 409);
    for (const row of graph.proposals) await tx.remove('fieldProposals', row.id);
    for (const row of graph.evidence) await tx.remove('evidence', row.id);
    for (const old of graph.people) { const row = (await tx.get('people', old.id))!; await tx.replace('people', touch(row, clock)); }
}
