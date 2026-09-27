import type { Actor, Clock, Table, TableMap } from './model.ts';
import type { Tx } from './store.ts';
import { TALENT_FACT_TABLES, TALENT_OWNER_TABLES } from './talent-v2-model.ts';
import { talentSnapshot } from './talent-v2-integrity.ts';
import { loadTalentGraph } from './talent-v2-graph.ts';
import type { FactRow, FactTable } from './talent-v2-schema.ts';
import { sourceFor, requirePermission } from './policy.ts';
import { AppError, invariant } from './errors.ts';
import { digest } from './json.ts';
import { shortlistFor } from './shortlists.ts';
import { readyAsset, workFor } from './production-policy.ts';
import { touch } from './helpers.ts';

const MOVE_TABLES = [...TALENT_FACT_TABLES, 'mediaCollectionItems', 'talentMigrationReviews'] as const;
type Row = { id: string; workspaceId: string; [key: string]: unknown };
export interface TalentMergeItem { table: string; id: string; revision: number; action: 'MOVE' | 'REBIND_AGENT' | 'STALE_PROPOSAL' | 'RETAIN_HISTORY' }
export type TalentConflictChoice = 'RETAIN_DUPLICATE_HISTORY' | 'KEEP_CANONICAL_ACTIVE' | 'KEEP_DUPLICATE_ACTIVE';
export interface TalentConflictDecision { table: string; canonicalId: string; duplicateId: string; choice: TalentConflictChoice }
export interface TalentMergeConflict {
    table: string; canonicalId: string; duplicateId: string; code: string;
    choices: TalentConflictChoice[]; canonicalValue: Record<string, unknown>; duplicateValue: Record<string, unknown>;
    dependentCount: number;
}
export const conflictKey = (c: { table: string; canonicalId: string; duplicateId: string }) => `${c.table}:${c.canonicalId}:${c.duplicateId}`;

/** Conflict values use the permission-filtered fact projection. Secret identifiers and proposal
 * values are never exposed. Stable UUIDs and original sources survive every resolution. */
export async function scanTalentMerge(tx: Tx, actor: Actor, clock: Clock, canonicalId: string, duplicateId: string) {
    const data = await talentSnapshot(tx, actor.workspaceId);
    const graph = await loadTalentGraph(tx, actor, clock);
    const selected = new Map<Table, Row[]>();
    const ownerIds = new Set<string>();
    const blockers = new Set<string>();
    const items: TalentMergeItem[] = [];
    const conflicts: TalentMergeConflict[] = [];
    const addConflict = (table: FactTable, a: Row, b: Row, code: string, choices: TalentConflictChoice[]) => {
        const canonicalValue = graph.project(table, a as FactRow), duplicateValue = graph.project(table, b as FactRow);
        if (!canonicalValue || !duplicateValue || (canonicalValue.unavailableFields as string[]).length || (duplicateValue.unavailableFields as string[]).length)
            blockers.add('TD2_MERGE_HIDDEN_DEPENDENCY');
        const dependentCount = [...TALENT_FACT_TABLES, 'shortlistItems' as const].reduce((n, t) =>
            n + data[t].filter(r => r.personRoleId === a.id || r.personRoleId === b.id).length, 0);
        conflicts.push({ table, canonicalId: a.id, duplicateId: b.id, code, choices,
            canonicalValue: canonicalValue ?? {}, duplicateValue: duplicateValue ?? {}, dependentCount });
    };
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
                        addConflict(table, a, b, 'PERIOD_RESOLUTION_REQUIRED', ['KEEP_CANONICAL_ACTIVE', 'KEEP_DUPLICATE_ACTIVE']);
                    }
                }
        }
        if (table === 'talentProfiles' || table === 'castingProfiles' || table === 'adultEligibilities') {
            const relevant = table === 'adultEligibilities' ? rows.filter(r => r.status === 'ACTIVE') : rows;
            const a = relevant.find(r => r.personId === canonicalId), b = relevant.find(r => r.personId === duplicateId);
            if (a && b) {
                if (table === 'adultEligibilities') {
                    addConflict(table, a, b, 'ADULT_RESOLUTION_REQUIRED', ['KEEP_CANONICAL_ACTIVE', 'KEEP_DUPLICATE_ACTIVE']);
                    if (!actor.permissions.includes('sources.review')) blockers.add('TD2_MERGE_REVIEW_REQUIRED');
                } else {
                    addConflict(table, a, b, 'SINGLETON_RESOLUTION_REQUIRED', ['RETAIN_DUPLICATE_HISTORY']);
                    const item = items.find(i => i.table === table && i.id === b.id);
                    if (item) item.action = 'RETAIN_HISTORY';
                }
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
    // Match the existing shortlist add rule: person + work + exact role UUID.
    // Distinct roles survive identity merge; unknown-role collisions with review evidence stay blocked.
    const shortlists = data.shortlistItems.filter(r => r.personId === canonicalId || r.personId === duplicateId);
    const professionalShortlists = shortlists.filter(r => r.personRoleId
        || data.talentProfiles.some(p=>p.personId===canonicalId||p.personId===duplicateId)
        || data.talentMigrationReviews.some(review=>review.shortlistItemId===r.id));
    selected.set('shortlistItems',professionalShortlists);
    const shortlistEndpoints: unknown[]=[];
    for(const row of professionalShortlists) {
        try {
            shortlistEndpoints.push(await shortlistFor(tx,actor,String(row.shortlistId)));
            if(row.workId)shortlistEndpoints.push(await workFor(tx,actor,String(row.workId),clock));
            const links=(await tx.find('shortlistItemAssets',{workspaceId:actor.workspaceId,itemId:row.id})).sort((a,b)=>a.id.localeCompare(b.id));
            if(links.length&&!actor.permissions.includes('assets.read'))blockers.add('TD2_MERGE_HIDDEN_DEPENDENCY');
            shortlistEndpoints.push(...links);
            for(const link of links)shortlistEndpoints.push(await readyAsset(tx,actor,link.assetId,clock));
        } catch(error) {
            if(error instanceof AppError&&error.status===404)blockers.add('TD2_MERGE_HIDDEN_DEPENDENCY');else throw error;
        }
        const collision=shortlists.some(a=>a.personId===canonicalId&&a.shortlistId===row.shortlistId&&(a.workId??null)===(row.workId??null)&&(a.personRoleId??null)===(row.personRoleId??null));
        if(row.personId===duplicateId&&!collision)items.push({table:'shortlistItems',id:row.id,revision:Number(row.revision),action:'MOVE'});
    }
    for (const b of shortlists.filter(r => r.personId === duplicateId)) {
        const a=shortlists.find(a => a.personId === canonicalId && a.shortlistId === b.shortlistId
            && (a.workId ?? null) === (b.workId ?? null) && (a.personRoleId ?? null) === (b.personRoleId ?? null));
        if(a && (a.personRoleId || b.personRoleId || data.talentMigrationReviews.some(r=>r.shortlistItemId===a.id||r.shortlistItemId===b.id)))
            blockers.add('TD2_MERGE_SHORTLIST_CONFLICT');
    }
    const count = [...selected.values()].reduce((n, rows) => n + rows.length, 0);
    if (count > 500) blockers.add('TD2_MERGE_LIMIT');
    const hidden = blockers.has('TD2_MERGE_HIDDEN_DEPENDENCY') || blockers.has('TD2_MERGE_SENSITIVE_REQUIRED');
    items.sort((a, b) => a.table.localeCompare(b.table) || a.id.localeCompare(b.id));
    if (conflicts.length > 100) blockers.add('TD2_MERGE_LIMIT');
    // Include endpoint state so source/scope/media changes invalidate a frozen preview too.
    // This conservative snapshot may also invalidate on unrelated workspace edits.
    return { selected, conflicts, count, blockers: [...blockers].sort(),
        preview: { items: hidden ? [] : items, conflicts: hidden ? [] : conflicts, restricted: hidden },
        digest: digest({data,shortlistEndpoints}) };
}
export type TalentMergePlan = Awaited<ReturnType<typeof scanTalentMerge>>;

export function resolveTalentConflicts(plan: TalentMergePlan, decisions: TalentConflictDecision[]) {
    const choices = new Map<string, TalentConflictChoice>();
    for (const d of decisions) {
        invariant(!choices.has(conflictKey(d)), 'TD2_MERGE_CONFLICT_DUPLICATE', '同一专业冲突只能决定一次', 422);
        choices.set(conflictKey(d), d.choice);
    }
    invariant(choices.size === plan.conflicts.length && plan.conflicts.every(c => choices.has(conflictKey(c))),
        'TD2_MERGE_CONFLICT_INCOMPLETE', '必须逐项决定全部专业资料冲突', 422);
    const deactivate = new Map<FactTable, Set<string>>(), retain = new Map<string, TalentMergeConflict>();
    const kept = new Set<string>(), dropped = new Set<string>();
    for (const c of plan.conflicts) {
        const choice = choices.get(conflictKey(c))!;
        invariant(c.choices.includes(choice), 'TD2_MERGE_CONFLICT_CHOICE_INVALID', '专业冲突决定不符合当前预览', 422);
        if (choice === 'RETAIN_DUPLICATE_HISTORY') { retain.set(c.table + ':' + c.duplicateId, c); continue; }
        const keep = choice === 'KEEP_CANONICAL_ACTIVE' ? c.canonicalId : c.duplicateId;
        const drop = choice === 'KEEP_CANONICAL_ACTIVE' ? c.duplicateId : c.canonicalId;
        kept.add(c.table + ':' + keep); dropped.add(c.table + ':' + drop);
        const ids = deactivate.get(c.table as FactTable) ?? new Set<string>(); ids.add(drop); deactivate.set(c.table as FactTable, ids);
    }
    invariant([...kept].every(id => !dropped.has(id)), 'TD2_MERGE_CONFLICT_CONTRADICTORY', '同一条资料不能同时选择保留生效和停用，请重新决定', 422);
    return { deactivate, retain };
}

export async function applyTalentMerge(tx: Tx, actor: Actor, clock: Clock, plan: TalentMergePlan, canonicalId: string, duplicateId: string, decisions: TalentConflictDecision[] = []) {
    invariant(plan.blockers.length === 0, 'MERGE_BLOCKED', '专业资料仍有未解决的合并依赖', 409);
    const { deactivate, retain } = resolveTalentConflicts(plan, decisions);
    if (plan.conflicts.some(c => c.table === 'adultEligibilities')) requirePermission(actor, 'sources.review');
    // Deactivate losing active rows before moving a competing row through immediate unique indexes.
    for (const [table, ids] of deactivate) for (const id of ids) {
        const row = await tx.get(table, id); invariant(!!row, 'MERGE_PREVIEW_STALE', '专业记录已经变化', 409);
        await tx.replace(table, { ...touch(row, clock), status: 'INACTIVE' } as TableMap[typeof table]);
    }
    const affectedPeople = new Set<string>();
    let moved = 0, staleProposals = 0, retainedProfiles = 0;
    for (const table of MOVE_TABLES) for (const row of plan.selected.get(table) ?? []) {
        if (row.personId !== duplicateId && row.agentPersonId !== duplicateId) continue;
        const history = retain.get(table + ':' + row.id);
        if (history) {
            invariant(table === 'talentProfiles' || table === 'castingProfiles', 'TD2_MERGE_HISTORY_INVALID', '不支持该类型的历史保留', 422);
            const old = row as unknown as TableMap[typeof table];
            await tx.replace(table, { ...touch(old, clock), supersededById: history.canonicalId,
                ...(table === 'castingProfiles' ? { currentMeasurementSetId: null, retiredCurrentMeasurementSetId: row.currentMeasurementSetId == null ? null : String(row.currentMeasurementSetId) } : {}) });
            retainedProfiles++; continue;
        }
        const current = await tx.get(table, row.id); invariant(!!current, 'MERGE_PREVIEW_STALE', '专业记录已经变化', 409);
        const next = { ...touch(current, clock),
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
    return { moved, staleProposals, retainedProfiles, deactivated: [...deactivate.values()].reduce((n, ids) => n + ids.size, 0) };
}
