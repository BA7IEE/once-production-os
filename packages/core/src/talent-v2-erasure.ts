import {personHistoryErasure,historyErasureBlocker,recordPersonHistoryErasure,assertHistoryErasureComplete} from './merge-history-erasure.ts';
import {deletionWorkerActor} from './deletion-worker-policy.ts';
import { assertSourceFactRetentionComplete } from './talent-source-fact-erasure.ts';
import type { Actor, Clock, Table } from './model.ts';
import type { Tx } from './store.ts';
import type { DeletionItem, DeletionRequest } from './deletion-model.ts';
import { TALENT_OWNER_TABLES, TALENT_V2_TABLES } from './talent-v2-model.ts';
import { talentSnapshot, talentDependencyCounts } from './talent-v2-integrity.ts';
import { scopeVisible } from './policy.ts';
import { touch } from './helpers.ts';
import { digest } from './json.ts';
import { invariant } from './errors.ts';

async function personErasureGraph(tx: Tx, workspaceId: string, personId: string) {
    const data = await talentSnapshot(tx, workspaceId);
    const history=personHistoryErasure(data,personId),erasePeople=new Set([personId,...history.oldIds]);
    type Row = typeof data.people[number];
    const selected = new Map<Table, Row[]>();
    const ids = new Set<string>();
    for (const table of TALENT_V2_TABLES) {
        if (table === 'fieldProposals') continue;
        const rows = data[table].filter(r => erasePeople.has(String(r.personId)) || (table === 'representations' && erasePeople.has(String(r.agentPersonId))));
        if (rows.length) selected.set(table, rows);
        for (const row of rows) ids.add(`${table}:${row.id}`);
    }
    // Evidence on the Person itself remains under its existing per-item retention decisions.
    // Evidence and proposals on the erased professional facts cannot outlive their owners.
    for (const table of ['evidence', 'fieldProposals'] as const) {
        const rows = data[table].filter(row => (table === 'fieldProposals' && erasePeople.has(String(row.personId))) || (row.personId!==personId&&history.oldIds.has(String(row.personId)))
            || Object.entries(TALENT_OWNER_TABLES).some(([field, ownerTable]) => ids.has(`${ownerTable}:${row[field]}`)));
        if (rows.length) selected.set(table, rows);
    }
    const graph = [...selected].sort(([a], [b]) => a.localeCompare(b)).map(([table, rows]) => ({ table, rows }));
    const sourceIds = new Set([...history.people.map(p=>String(p.sourceId)),...graph.flatMap(x => x.rows.map(r => r.sourceId).filter((id): id is string => typeof id === 'string'))]);
    const personIds = new Set([personId,...history.aliases.map(a=>String(a.canonicalPersonId)),...history.oldIds, ...graph.flatMap(x => x.rows.map(r => r.personId).filter((id): id is string => typeof id === 'string'))]);
    const sources = data.sources.filter(r => sourceIds.has(r.id)).map(r => ({ id: r.id, scopeId: r.scopeId,
        revision: r.revision, protectionEpoch: r.protectionEpoch, status: r.status }));
    // Root revision changes at block; bind its scope without confusing that planned transition with drift.
    const people = data.people.filter(r => personIds.has(r.id)).map(r => ({ id: r.id, scopeId: r.scopeId }));
    const scopeIds = new Set([...sources.map(r => r.scopeId), ...people.map(r => r.scopeId)]);
    const scopes = data.scopes.filter(r => scopeIds.has(r.id));
    return { data, selected, history, digest: digest({ ...(history.aliases.length?{history:history.snapshot}:{}),graph, sources, people, scopes }), count: graph.reduce((n, x) => n + x.rows.length, 0)+history.count,
        counts: Object.fromEntries(graph.map(x => [x.table, x.rows.length])) };
}
export async function previewTalentErasure(tx: Tx, actor: Actor, personId: string) {
    const g = await personErasureGraph(tx, actor.workspaceId, personId);
    let visible = true;
    for (const rows of g.selected.values()) for (const row of rows) {
        if (row.personId) {
            const p = g.data.people.find(p => p.id === row.personId);
            if (!p || !await scopeVisible(tx, actor, String(p.scopeId))) visible = false;
        }
        if (row.sourceId) {
            const s = g.data.sources.find(s => s.id === row.sourceId);
            if (!s || !await scopeVisible(tx, actor, String(s.scopeId))) visible = false;
        }
    }
    const historyBlocker=await historyErasureBlocker(tx,actor,personId,g.history,g.data);
    const sensitive = (g.selected.get('personCredentials') ?? []).some(r => !!r.identifierCiphertext);
    return { count: g.count, digest: g.digest, counts: visible ? g.counts : {},
        historyIdentityCount:g.history.people.length,historySummary:!historyBlocker?g.history.people.map(p=>String(p.displayName)).join('、'):'', blocker:historyBlocker??(!visible ? 'TD2_HIDDEN_DEPENDENCY' : sensitive && !actor.permissions.includes('sensitive.write') ? 'TD2_SENSITIVE_WRITE_REQUIRED' : null) };
}

/** The entire graph is removed in ONE short transaction, including dependent typed Evidence.
 * A cleanup audit failure rolls this graph back together with the cleanup item's receipt.
 * Asset bytes are intentionally not touched here; existing media retention/purge decisions own them. */
export async function eraseTalentPersonGraph(tx: Tx, request: DeletionRequest, item: DeletionItem, clock: Clock) {
    invariant(request.targetKind === 'PERSON' && request.targetId === item.resourceId,
        'TD2_ERASURE_TARGET_INVALID', '人才专业档案清理必须绑定人物删除申请', 409);
    const actor=await deletionWorkerActor(tx,request),current=await previewTalentErasure(tx,actor,item.resourceId);
    invariant(!current.blocker,current.blocker??'TD2_HISTORY_SCOPE_CHANGED','当前资格或关联范围已变化，拒绝执行旧人物清理计划',409);
    const g = await personErasureGraph(tx, request.workspaceId, item.resourceId);
    invariant(item.detailCode === `TD2_GRAPH_${g.digest}${g.history.people.length?':H'+g.history.people.length:''}`, 'TD2_ERASURE_GRAPH_STALE', '人才专业档案依赖发生变化，拒绝使用旧清理计划', 409);
    const roles = new Set((g.selected.get('personRoles') ?? []).map(r => r.id));
    for (const row of await tx.find('shortlistItems', { workspaceId: request.workspaceId, personId: item.resourceId })) {
        if (!row.personRoleId || !roles.has(row.personRoleId)) continue;
        // The parent Person is already blocked. Clearing this FK does not authorize a fallback role.
        await tx.replace('shortlistItems', { ...touch(row, clock), personRoleId: null,
            personRoleRevision: null, roleContextState: 'LEGACY_REVIEW' });
    }
    const affected = new Set((g.selected.get('representations') ?? []).map(r => String(r.personId)).filter(id => id !== item.resourceId));
    // All TD2 FKs are deferred. Dependents first also keeps adapters with stricter FK ordering viable.
    const order: Table[] = ['fieldProposals', 'evidence', 'talentMigrationReviews', 'mediaCollectionItems', 'mediaCollectionTags',
        'mediaCollections', 'personCredentials', 'representations', 'translatorLanguagePairs', 'translatorServiceModes',
        'adultEligibilities', 'castingProfiles', 'measurementSets', 'personCapabilities', 'talentLocations',
        'personLanguages', 'personExternalRefs', 'personRoles', 'talentProfiles'];
    invariant([...g.selected.keys()].every(t => order.includes(t)), 'TD2_ERASURE_UNREGISTERED', '存在尚未注册清理策略的人才关系', 409);
    for (const table of order) for (const row of g.selected.get(table) ?? []) {if((table==='talentProfiles'||table==='castingProfiles')&&row.supersededById)continue;await tx.remove(table,row.id);}
    await recordPersonHistoryErasure(tx,actor,request,g.data,clock);
    for (const id of affected) {
        const p = await tx.get('people', id);
        if (p) await tx.replace('people', touch(p, clock));
    }
}

/** Older persisted requests must not finalize a root while newly introduced dependencies survive. */
export async function assertTalentFinalizationClean(tx: Tx, workspaceId: string, kind: string, id: string, clock: Clock) {
    if (kind !== 'PERSON' && kind !== 'SOURCE' && kind !== 'ASSET') return;
    if(kind==='PERSON')await assertHistoryErasureComplete(tx,workspaceId,id);
    if (kind === 'SOURCE' && await assertSourceFactRetentionComplete(tx, workspaceId, id, clock)) return;
    const deps = await talentDependencyCounts(tx, workspaceId, kind, id);
    invariant(deps.count === 0, 'TD2_CLEANUP_INCOMPLETE', '人才2.0关联资料尚未清理，不能宣告根对象删除完成', 409);
}

export async function validatePersonErasurePlan(tx:Tx,actor:Actor,request:DeletionRequest,items:DeletionItem[]){
 if(request.targetKind!=='PERSON')return;
 const current=await previewTalentErasure(tx,actor,request.targetId),item=items.find(i=>i.resourceKind==='talentGraph');
 invariant(!current.blocker,current.blocker??'TD2_ERASURE_GRAPH_STALE','人物历史、当前权限或依赖范围已变化，须重新评估',409);
 invariant((!current.count&&!item)||(item?.detailCode===`TD2_GRAPH_${current.digest}${current.historyIdentityCount?':H'+current.historyIdentityCount:''}`),'TD2_ERASURE_GRAPH_STALE','人物专业档案或合并历史发生变化，拒绝旧清理计划',409);
}
