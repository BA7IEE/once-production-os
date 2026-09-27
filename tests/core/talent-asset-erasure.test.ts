import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture, result } from '../support/fixtures.ts';
import { verifySharedAssetErasure, seedSharedProof, prepareAssetDeletion } from '../support/talent-asset-erasure.ts';
import { DeletionCleanup } from '../../packages/core/src/deletion-cleanup.ts';

test('TD2 shared proof deletion removes only affected collection links, revokes current qualifications, preserves review history and rolls back audit failure', async () => {
    const f = await fixture(), root = await mkdtemp(join(await realpath(tmpdir()), 'once-shared-proof-'));
    try { await verifySharedAssetErasure(f, root); } finally { await rm(root, { recursive: true, force: true }); }
});
test('TD2 frozen shared proof plan rejects changed collection contents before touching qualifications', async () => {
    const f = await fixture(), root = await mkdtemp(join(await realpath(tmpdir()), 'once-shared-proof-stale-'));
    try {
        const s = await seedSharedProof(f, root); await prepareAssetDeletion(f, s.assetId);
        await f.store.transaction(async tx => { const row = (await tx.find('mediaCollectionItems', { collectionId: s.g.collectionId, assetId: s.keptAssetId }))[0]!; await tx.replace('mediaCollectionItems', { ...row, caption: '合成并发变更', revision: row.revision + 1 }); });
        const cleanup = new DeletionCleanup(f.store, f.clock, f.app.config), claim = await cleanup.claim(); assert.ok(claim); await cleanup.process(claim);
        const item = f.store.rows('deletionItems').find(i => i.resourceKind === 'talentAssetGraph')!;
        assert.equal(item.cleanupState, 'FAILED'); assert.equal(item.cleanupErrorCode, 'TD2_ERASURE_GRAPH_STALE');
        assert.equal(f.store.rows('adultEligibilities').find(a => a.id === s.adultId)!.state, 'VERIFIED_ADULT');
        assert.equal(f.store.rows('mediaCollectionItems').filter(i => i.assetId === s.assetId).length, 2);
    } finally { await rm(root, { recursive: true, force: true }); }
});

test('TD2 shared asset preview blocks when a proof owner moves outside the requester scope', async () => {
    const f = await fixture(), root = await mkdtemp(join(await realpath(tmpdir()), 'once-shared-proof-hidden-'));
    try {
        const s = await seedSharedProof(f, root), p = await s.g.current();
        const scope = result(await f.owner.cmd('POST','/scopes',{name:'合成清理不可见范围',membershipIds:[p.maintainerId]})).resourceId;
        await f.store.transaction(async tx => {
            for(const m of await tx.find('scopeMembers',{scopeId:scope})) await tx.remove('scopeMembers',m.id);
            await tx.replace('people',{...p,scopeId:scope,revision:p.revision+1});
        });
        const asset=f.store.rows('assets').find(a=>a.id===s.assetId)!;
        const preview=await f.owner.raw('POST','/deletion-requests/preview',{targetKind:'ASSET',targetId:s.assetId,expectedRevision:asset.revision});
        assert.equal(preview.status,200);assert.equal(result(preview).complete,false);assert.ok(result(preview).unresolved.some((r:any)=>r.code==='TD2_HIDDEN_DEPENDENCY'));
        assert.equal(result(preview).items.some((r:any)=>r.resourceKind==='talentAssetGraph'),false);
    } finally { await rm(root, { recursive: true, force: true }); }
});
