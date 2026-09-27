import type { Actor, Clock, Table, TableMap } from './model.ts';
import type { Tx } from './store.ts';
import { TALENT_FACT_TABLES, TALENT_OWNER_TABLES } from './talent-v2-model.ts';
import { talentSnapshot } from './talent-v2-integrity.ts';
import { loadTalentGraph } from './talent-v2-graph.ts';
import type { FactRow, FactTable } from './talent-v2-schema.ts';
import { sourceFor } from './policy.ts';
import { AppError, invariant } from './errors.ts';
import { digest } from './json.ts';
import { touch } from './helpers.ts';

const MOVE_TABLES = [...TALENT_FACT_TABLES, 'mediaCollectionItems', 'talentMigrationReviews'] as const;
type Row = { id: string; workspaceId: string; [key: string]: unknown };
export interface TalentMergeItem { table: string; id: string; revision: number; action: 'MOVE' | 'REBIND_AGENT' | 'STALE_PROPOSAL' }
export interface TalentMergeConflict { table: string; canonicalId: string; duplicateId: string; code: string }

/** No raw facts, proposal values, identifiers or evidence text are exposed by this maintenance DTO.
 * Non-colliding records keep their UUID and source. Singleton consolidation requires a separate
 * evidence-preserving resolution policy; it must never be implemented by dropping one record. */
export async function scanTalentMerge(tx: Tx, actor: Actor, clock: Clock, canonicalId: string, duplicateId: string) {
    const data = await talentSnapshot(tx, actor.workspaceId);
    const graph = await loadTalentGraph(tx, actor, clock);
    const selected = new Map<Table, Row[]>();
    const ownerIds = new Set<string>();
    const blockers = new Set<string>();
    const items: TalentMergeItem[] = [];
    const conflicts: TalentMergeConflict[] = [];
    for (const table of MOVE_TABLES) {
        const rows = data[table].filter(r => r.personId === canonicalId || r.personId === duplicateId
            || (table === 'representations' && (r.agentPersonId === canonicalId || r.agentPersonId === duplicateId)));
        selected.set(table, rows);
        for (const row of rows) {
            ownerIds.add(`${table}:${row.id}`);
            if (row.personId === duplicateId || row.agentPersonId === duplicateId)
                items.push({ table, id: row.id, revision: Number(row.revision), action: row.personId === duplicateId ? 'MOVE' : 'REBIND_AGENT' });
            const person = data.people.find(p => p.id === row.personId);
            if (!person || !graph.identityReadable(person as unknown as TableMap['people'])) blockers.add('TD2_MERGE_HIDDEN_DEPENDENCY');
            if ((TALENT_FACT_TABLES as readonly string[]).includes(table)
                && !graph.readable(table as FactTable, row as FactRow)) blockers.add('TD2_MERGE_HIDDEN_DEPENDENCY');
            for (const key of ['assetId', 'evidenceAssetId']) if (row[key] && (!actor.permissions.includes('assets.read') || !graph.assetReadable(String(row[key]))))
                blockers.add('TD2_MERGE_HIDDEN_DEPENDENCY');
            if (table === 'personCredentials' && row.identifierCiphertext && !actor.permissions.includes('sensitive.write'))
                blockers.add('TD2_MERGE_SENSITIVE_REQUIRED');
            // Rebinding an agent to the represented person would create a self-representation.
            if (table === 'representations' && row.agentPersonId &&
                (row.personId === duplicateId ? canonicalId : row.personId) === (row.agentPersonId === duplicateId ? canonicalId : row.agentPersonId))
                blockers.add('TD2_MERGE_SELF_REPRESENTATION');
        }
        if (table === 'personRoles' || table === 'personLanguages' || table === 'talentLocations') {
            const key = table === 'personRoles' ? 'roleCode' : table === 'personLanguages' ? 'languageCode' : 'relationCode';
            for (const a of rows.filter(r => r.personId === canonicalId && r.status === 'ACTIVE'))
                for (const b of rows.filter(r => r.personId === duplicateId && r.status === 'ACTIVE')) {
                    const overlap = (!a.validFrom || !b.validUntil || String(a.validFrom) < String(b.validUntil))
                        && (!b.validFrom || !a.validUntil || String(b.validFrom) < String(a.validUntil));
                    if (a[key] === b[key] && overlap && (table !== 'talentLocations' || a.relationCode === 'BASE')) {
                        conflicts.push({ table, canonicalId: a.id, duplicateId: b.id, code: 'PERIOD_RESOLUTION_REQUIRED' });
                        blockers.add('TD2_MERGE_PERIOD_CONFLICT');
                    }
                }
        }
        if (table === 'talentProfiles' || table === 'castingProfiles' || table === 'adultEligibilities') {
            const relevant = table === 'adultEligibilities' ? rows.filter(r => r.status === 'ACTIVE') : rows;
            const a = relevant.find(r => r.personId === canonicalId), b = relevant.find(r => r.personId === duplicateId);
            if (a && b) {
                conflicts.push({ table, canonicalId: a.id, duplicateId: b.id, code: 'SINGLETON_RESOLUTION_REQUIRED' });
                blockers.add('TD2_MERGE_SINGLETON_CONFLICT');
            }
        }
    }
    for (const table of ['evidence', 'fieldProposals'] as const) {
        const rows = data[table].filter(r => r.personId === canonicalId || r.personId === duplicateId
            || Object.entries(TALENT_OWNER_TABLES).some(([key, ownerTable]) => ownerIds.has(`${ownerTable}:${r[key]}`)));
        selected.set(table, rows);
        if (table === 'fieldProposals') for (const row of rows) {
            if (row.state === 'PENDING' || row.personId === duplicateId)
                items.push({ table, id: row.id, revision: Number(row.revision), action: row.state === 'PENDING' ? 'STALE_PROPOSAL' : 'MOVE' });
        }
    }
    const sourceIds = new Set([...selected.values()].flat().filter(r => r.sourceId).map(r => String(r.sourceId)));
    for (const sourceId of sourceIds) {
        try { await sourceFor(tx, actor, sourceId, clock); }
        catch (error) { if (error instanceof AppError && error.status === 404) blockers.add('TD2_MERGE_HIDDEN_DEPENDENCY'); else throw error; }
    }
    // No legacy collision handler may discard role context or rows still referenced by migration reviews.
    const shortlists = data.shortlistItems.filter(r => r.personId === canonicalId || r.personId === duplicateId);
    for (const b of shortlists.filter(r => r.personId === duplicateId))
        if (shortlists.some(a => a.personId === canonicalId && a.shortlistId === b.shortlistId && (a.workId ?? null) === (b.workId ?? null))
            && (b.personRoleId || shortlists.some(a => a.personId === canonicalId && a.shortlistId === b.shortlistId && a.personRoleId)
                || data.talentMigrationReviews.some(r => shortlists.some(s => s.id === r.shortlistItemId))))
            blockers.add('TD2_MERGE_SHORTLIST_CONFLICT');
    const count = [...selected.values()].reduce((n, rows) => n + rows.length, 0);
    if (count > 500) blockers.add('TD2_MERGE_LIMIT');
    const hidden = blockers.has('TD2_MERGE_HIDDEN_DEPENDENCY') || blockers.has('TD2_MERGE_SENSITIVE_REQUIRED');
    items.sort((a, b) => a.table.localeCompare(b.table) || a.id.localeCompare(b.id));
    // Include endpoint state so source/scope/media changes invalidate a frozen preview too.
    // This conservative snapshot may also invalidate on unrelated workspace edits.
    return { selected, count, blockers: [...blockers].sort(),
        preview: { items: hidden ? [] : items, conflicts: hidden ? [] : conflicts, restricted: hidden },
        digest: digest(data) };
}
export type TalentMergePlan = Awaited<ReturnType<typeof scanTalentMerge>>;

export async function applyTalentMerge(tx: Tx, actor: Actor, clock: Clock, plan: TalentMergePlan, canonicalId: string, duplicateId: string) {
    invariant(plan.blockers.length === 0, 'MERGE_BLOCKED', '专业资料仍有未解决的合并依赖', 409);
    const affectedPeople = new Set<string>();
    let moved = 0, staleProposals = 0;
    for (const table of MOVE_TABLES) for (const row of plan.selected.get(table) ?? []) {
        if (row.personId !== duplicateId && row.agentPersonId !== duplicateId) continue;
        const next = { ...touch(row as unknown as TableMap[typeof table], clock),
            personId: row.personId === duplicateId ? canonicalId : String(row.personId) };
        if (table === 'representations' && row.agentPersonId === duplicateId) {
            Object.assign(next, { agentPersonId: canonicalId });
            if (row.personId !== canonicalId && row.personId !== duplicateId) affectedPeople.add(String(row.personId));
        }
        await tx.replace(table, next); moved++;
    }
    for (const row of plan.selected.get('fieldProposals') ?? []) {
        if (row.personId !== duplicateId && row.state !== 'PENDING') continue;
        const next = { ...touch(row as unknown as TableMap['fieldProposals'], clock),
            personId: row.personId === duplicateId ? canonicalId : row.personId as string | null };
        if (row.state === 'PENDING') {
            Object.assign(next, { state: 'STALE', decidedAt: clock.now().toISOString(), decidedById: actor.membershipId }); staleProposals++;
        }
        await tx.replace('fieldProposals', next);
    }
    for (const id of affectedPeople) {
        const p = await tx.get('people', id); if (p) await tx.replace('people', touch(p, clock));
    }
    return { moved, staleProposals };
}
