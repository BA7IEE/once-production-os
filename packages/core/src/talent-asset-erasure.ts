import { deletionWorkerActor } from './deletion-worker-policy.ts';
import type { Actor, Clock } from './model.ts';
import type { Tx } from './store.ts';
import type { DeletionItem, DeletionRequest } from './deletion-model.ts';
import { TALENT_V2_TABLES } from './talent-v2-model.ts';
import { talentSnapshot } from './talent-v2-integrity.ts';
import { digest } from './json.ts';
import { scopeVisible } from './policy.ts';
import { invariant } from './errors.ts';
import { touch } from './helpers.ts';

/** Freeze all shared references together, including order and proof-review history. No file IO here. */
async function assetGraph(tx: Tx, workspaceId: string, assetIds: string[], sourceRootId?: string) {
    const data = await talentSnapshot(tx, workspaceId);
    const ownedAssets = data.assets.filter(r => assetIds.includes(r.id));
    const links = data.mediaCollectionItems.filter(r => assetIds.includes(String(r.assetId)));
    const collections = data.mediaCollections.filter(r => links.some(l => l.collectionId === r.id));
    const orderedItems = data.mediaCollectionItems.filter(r => collections.some(c => c.id === r.collectionId));
    const covers=data.talentProfiles.filter(r=>assetIds.includes(String(r.coverAssetId)));
    const adults = data.adultEligibilities.filter(r => assetIds.includes(String(r.evidenceAssetId)));
    const credentials = data.personCredentials.filter(r => assetIds.includes(String(r.evidenceAssetId)));
    const evidence = data.evidence.filter(r => adults.some(a => a.id === r.adultEligibilityId) || credentials.some(c => c.id === r.personCredentialId));
    const proposals = data.fieldProposals.filter(r => r.state === 'PENDING' && (adults.some(a => a.id === r.adultEligibilityId) || credentials.some(c => c.id === r.personCredentialId)
        || (['evidenceAssetId','coverAssetId'].includes(String(r.fieldPath)) && assetIds.includes(String(r.proposedValue)))));
    const relatedOwners = [...data.talentProfiles.filter(r=>proposals.some(p=>p.talentProfileId===r.id)), ...covers, ...adults, ...credentials, ...collections,
        ...data.adultEligibilities.filter(a => proposals.some(p => p.adultEligibilityId === a.id)),
        ...data.personCredentials.filter(c => proposals.some(p => p.personCredentialId === c.id))];
    const personIds = new Set([...relatedOwners.map(r => r.personId), ...ownedAssets.map(r => r.personId).filter(id => typeof id === 'string')]);
    const people = data.people.filter(r => personIds.has(r.id));
    const sourceIds = new Set([...relatedOwners, ...proposals, ...evidence, ...ownedAssets].map(r => r.sourceId));
    const sources = data.sources.filter(r => sourceIds.has(r.id));
    const scopeIds = new Set([...people, ...sources, ...ownedAssets].map(r => r.scopeId));
    const scopes = data.scopes.filter(r => scopeIds.has(r.id));
    const unknownReference = TALENT_V2_TABLES.some(table => !['mediaCollectionItems','adultEligibilities','personCredentials'].includes(table) && data[table].some(r => assetIds.includes(String(r.assetId)) || assetIds.includes(String(r.evidenceAssetId))));
    const missingEndpoint = ownedAssets.length !== assetIds.length || collections.length !== new Set(links.map(l => l.collectionId)).size || people.length !== personIds.size || sources.length !== sourceIds.size;
    return { covers, links, collections, adults, credentials, proposals, people, sources, ownedAssets, unknownReference, missingEndpoint,
        count: covers.length + links.length + adults.length + credentials.length + proposals.length,
        digest: digest({ covers, ownedAssets, links, collections, orderedItems, adults, credentials, evidence, proposals,
            people: people.map(r => ({ id: r.id, scopeId: r.scopeId })),
            sources: sources.map(s => { if (s.id !== sourceRootId) return s; const {revision,protectionEpoch,updatedAt,...rest}=s; return rest; }), scopes }) };
}
function graphCode(graph: Awaited<ReturnType<typeof assetGraph>>) {
    return `TD2_ASSET_GRAPH_${graph.digest}:C${graph.links.length}:Q${graph.credentials.length}:A${graph.adults.length}:P${graph.proposals.length}`;
}
export async function previewTalentAssetErasure(tx: Tx, actor: Actor, assetId: string) {
    const graph = await assetGraph(tx, actor.workspaceId, [assetId]);
    if (graph.covers.some(r=>r.supersededById))return {count:graph.count,detailCode:graphCode(graph),blocker:'MERGE_HISTORY_COVER_ERASURE_REQUIRED'};
    if (graph.unknownReference || graph.missingEndpoint) return { count: graph.count, detailCode: graphCode(graph), blocker: 'TD2_ASSET_REFERENCE_UNREGISTERED' };
    for (const row of [...graph.people, ...graph.sources, ...graph.ownedAssets]) if (!await scopeVisible(tx, actor, String(row.scopeId)))
        return { count: graph.count, detailCode: graphCode(graph), blocker: 'TD2_HIDDEN_DEPENDENCY' };
    return { count: graph.count, detailCode: graphCode(graph), blocker: null };
}
export async function snapshotTalentSourceAssets(tx: Tx, actor: Actor, sourceId: string) {
    const ids=(await tx.find('assets',{workspaceId:actor.workspaceId,sourceId})).filter(a=>a.state!=='ERASED').map(a=>a.id).sort();
    const graph=await assetGraph(tx,actor.workspaceId,ids,sourceId);
    let blocker:string|null=graph.covers.some(r=>r.supersededById)?'MERGE_HISTORY_COVER_ERASURE_REQUIRED':graph.unknownReference||graph.missingEndpoint?'TD2_ASSET_REFERENCE_UNREGISTERED':null;
    for(const row of [...graph.people,...graph.sources,...graph.ownedAssets])if(!await scopeVisible(tx,actor,String(row.scopeId)))blocker='TD2_HIDDEN_DEPENDENCY';
    return {...graph,detailCode:graphCode(graph),blocker};
}
export async function previewTalentSourceAssets(tx: Tx, actor: Actor, sourceId: string) {
    const graph=await snapshotTalentSourceAssets(tx,actor,sourceId);
    return {count:graph.count,detailCode:graph.detailCode,blocker:graph.blocker};
}
export async function eraseTalentAssetReferences(tx: Tx, request: DeletionRequest, item: DeletionItem, clock: Clock) {
    const sourceGroup = request.targetKind === 'SOURCE' && item.resourceKind === 'talentSourceAssetGraph';
    invariant((request.targetKind === 'ASSET' || sourceGroup) && request.targetId === item.resourceId, 'TD2_ERASURE_TARGET_INVALID', '图片关联清理必须绑定原件或其来源删除申请', 409);
    const assetIds = sourceGroup ? (await tx.find('assets',{workspaceId:request.workspaceId,sourceId:request.targetId})).filter(a=>a.state!=='ERASED').map(a=>a.id).sort() : [item.resourceId];
    if (sourceGroup) {
        const items = await tx.find('deletionItems',{workspaceId:request.workspaceId,requestId:request.id});
        invariant(assetIds.every(id=>items.some(i=>i.resourceKind==='asset'&&i.resourceId===id&&i.resolvedAction==='ERASE_PAYLOAD')), 'TD2_SOURCE_MEDIA_PLAN_INCOMPLETE', '来源原件删除计划不完整', 409);
    }
    const graph = await assetGraph(tx, request.workspaceId, assetIds, sourceGroup ? request.targetId : undefined);
    invariant(item.detailCode === graphCode(graph) && !graph.unknownReference && !graph.missingEndpoint, 'TD2_ERASURE_GRAPH_STALE', '共享图片引用或证明记录发生变化，拒绝使用旧清理计划', 409);
    const actor = await deletionWorkerActor(tx, request);
    await applyTalentAssetGraph(tx,actor,graph,clock);
}
/** Internal transaction component: caller first binds this complete snapshot to its frozen plan. */
export async function applyTalentAssetGraph(tx:Tx,actor:Actor,graph:Awaited<ReturnType<typeof assetGraph>>,clock:Clock) {
    for (const row of [...graph.people, ...graph.sources, ...graph.ownedAssets]) invariant(await scopeVisible(tx, actor, String(row.scopeId)), 'TD2_HIDDEN_DEPENDENCY', '清理发起者已失去关联资料的范围权限', 403);
    for(const old of graph.covers){invariant(!old.supersededById,'MERGE_HISTORY_COVER_ERASURE_REQUIRED','封面属于保留合并历史，须先清理该历史资料',409);const row=(await tx.get('talentProfiles',old.id))!;await tx.replace('talentProfiles',{...touch(row,clock),coverAssetId:null});}
    for (const link of graph.links) await tx.remove('mediaCollectionItems', link.id);
    for (const collection of graph.collections) {
        const row = (await tx.get('mediaCollections', collection.id))!;
        const rest = (await tx.find('mediaCollectionItems', { workspaceId: actor.workspaceId, collectionId: row.id })).sort((a,b) => a.orderIndex-b.orderIndex || a.id.localeCompare(b.id));
        for (const [index, entry] of rest.entries()) if (entry.orderIndex !== index) await tx.replace('mediaCollectionItems', { ...touch(entry, clock), orderIndex: index });
        await tx.replace('mediaCollections', touch(row, clock));
    }
    // Preserve earlier reviewer/timestamps and append-only field evidence as history, never as current eligibility.
    for (const old of graph.adults) { const row = (await tx.get('adultEligibilities', old.id))!;
        await tx.replace('adultEligibilities', { ...touch(row, clock), evidenceAssetId: null, state: 'UNKNOWN' }); }
    for (const old of graph.credentials) { const row = (await tx.get('personCredentials', old.id))!;
        await tx.replace('personCredentials', { ...touch(row, clock), evidenceAssetId: null, status: 'REVOKED' }); }
    for (const old of graph.proposals) { const row = (await tx.get('fieldProposals', old.id))!;
        await tx.replace('fieldProposals', { ...touch(row, clock), state: 'STALE', decidedAt: clock.now().toISOString(), decidedById: actor.membershipId }); }
    for (const person of graph.people) { const row = (await tx.get('people', person.id))!; await tx.replace('people', touch(row, clock)); }
}
