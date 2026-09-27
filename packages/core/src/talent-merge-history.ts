import type { Actor, Clock, RequestMeta } from './model.ts';
import type { Tx } from './store.ts';
import type { FactRow } from './talent-v2-schema.ts';
import { loadTalentGraph, td2PersonFor } from './talent-v2-graph.ts';
import { requirePermission, scopeVisible, sourceFor } from './policy.ts';
import { audit, page } from './helpers.ts';
import { AppError } from './errors.ts';

/** Read-only, separately authorized retained singleton records. No credential, proposal,
 * evidence text or hidden record count enters this DTO. Current source use remains mandatory. */
export async function readTalentMergeHistory(tx: Tx, actor: Actor, personId: string, query: Record<string, string>, clock: Clock, meta: RequestMeta) {
    requirePermission(actor, 'data.merge'); requirePermission(actor, 'records.read');
    await td2PersonFor(tx, actor, personId);
    const graph = await loadTalentGraph(tx, actor, clock);
    const result: Array<{ table: string; retained: true; currentProfileId: string; originalPersonId: string; record: Record<string, unknown> }> = [];
    for (const table of ['talentProfiles', 'castingProfiles'] as const) {
        const current = graph.rows(table).find(r => r.personId === personId && !r.supersededById);
        if (!current || !graph.readable(table, current as unknown as FactRow)) continue;
        for (const row of graph.rows(table).filter(r => r.supersededById === current.id)) {
            const old = graph.rows('people').find(p => p.id === row.personId);
            if (!old || !await scopeVisible(tx, actor, old.scopeId)
                || !graph.rows('personAliases').some(a => a.oldPersonId === old.id && a.canonicalPersonId === personId)) continue;
            try { await sourceFor(tx, actor, row.sourceId, clock); }
            catch (error) { if (error instanceof AppError && error.status === 404) continue; throw error; }
            // Projection uses the canonical identity only after checking the historical identity's
            // scope and the exact immutable alias. Field Evidence still refers to the original UUID.
            const projected = graph.project(table, { ...row, personId } as unknown as FactRow);
            if (!projected) continue;
            projected.personId = old.id; projected.usable = false;
            if (table === 'castingProfiles') {
                const id = 'retiredCurrentMeasurementSetId' in row ? row.retiredCurrentMeasurementSetId : null;
                const measurement = id ? graph.fact('measurementSets', id) : undefined;
                projected.currentMeasurementSetId = measurement && graph.readable('measurementSets', measurement) ? id : null;
            }
            result.push({ table, retained: true, currentProfileId: current.id, originalPersonId: old.id, record: projected });
        }
    }
    await audit(tx, actor, actor.workspaceId, 'person.merge-history-read', 'person', personId, [], meta, clock);
    return page(result.sort((a, b) => String(a.record.id).localeCompare(String(b.record.id))), query);
}
