import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import type { Application } from '../../packages/core/src/api.ts';
import type { Store } from '../../packages/core/src/store.ts';
import { LocalMediaProvider } from '../../apps/api/src/media/local-provider.ts';
import { DeletionCleanup } from '../../packages/core/src/deletion-cleanup.ts';
import { talentSnapshot, talentDependencyCounts, inspectTalentIntegrity } from '../../packages/core/src/talent-v2-integrity.ts';
import { seedProfessionalGraph, expectResponse as ok } from './talent-v2-maintenance.ts';
import { FaultStore } from './fault-store.ts';
import type { FakeClock, Client } from './fixtures.ts';
const schemaVersion = 'once-talent-v2.0.0';
type Context = { app: Application; store: Store; clock: FakeClock; owner: Client };
export async function seedSharedProof(f: Context, root: string) {
    const g = await seedProfessionalGraph(f.app, f.store, f.clock, f.owner);
    f.app.config.mediaEnabled = true;
    const provider = await LocalMediaProvider.create(root);
    const actor = await f.store.transaction(tx => f.app.identity.authenticate(tx, f.owner.jar.once_session!));
    const upload = async (name: string) => {
        const original = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#617892' } }).png().toBuffer();
        const hash = createHash('sha256').update(original).digest('hex');
        const id = ok(await f.owner.cmd('POST', '/uploads', { sourceId: g.sourceId, expectedSourceRevision: 1, personId: g.personId,
            fileName: name, mime: 'image/png', expectedBytes: original.length, sha256: hash })).resourceId as string;
        const u = await f.store.transaction(tx => f.app.media.beginReceive(tx, actor, id, original.length));
        const received = await provider.receive(u, Readable.from(original), new AbortController().signal);
        await f.store.transaction(tx => f.app.media.finishReceive(tx, actor, id, u.receiveToken!, received.bytes, received.sha256));
        const ready = (await f.store.transaction(tx => tx.get('uploads', id)))!;
        ok(await f.owner.cmd('POST', `/uploads/${id}/complete`, { expectedRevision: ready.revision }), 202);
        const claim = await f.app.media.claim(); assert.ok(claim);
        const sealed = await provider.seal(claim, new AbortController().signal), preview = await sharp(original).jpeg({ quality: 82 }).toBuffer();
        await writeFile(sealed.preview, preview, { mode: 0o400 }); await chmod(sealed.preview, 0o400);
        await f.app.media.finish(claim, { mime: 'image/png', sha256: hash, bytes: original.length, width: 8, height: 6,
            previewBytes: preview.length, previewHash: createHash('sha256').update(preview).digest('hex') });
        return id;
    };
    const assetId = await upload('synthetic-shared-proof.png'), keptAssetId = await upload('synthetic-retained-image.png');
    const collection2 = await g.add('mediaCollections', { collectionTypeCode: 'POLAROIDS', title: '合成第二集合' });
    for (const collectionId of [g.collectionId, collection2]) for (const id of [assetId, keptAssetId]) {
        const collection = (await f.store.transaction(tx => tx.get('mediaCollections', collectionId)))!;
        ok(await f.owner.cmd('POST', `/td2/collections/${collectionId}/items`, { schemaVersion, expectedRevision: collection.revision,
            expectedPersonRevision: (await g.current()).revision, assetId: id, caption: '合成共享引用' }), 200);
    }
    const credentialId = await g.add('personCredentials', { credentialTypeCode: 'OTHER', issuerName: '合成证明机构', evidenceAssetId: assetId });
    ok(await f.owner.cmd('POST', `/td2/credentials/${credentialId}/verify`, { schemaVersion, expectedRevision: 1, expectedPersonRevision: (await g.current()).revision, sourceRevision: 1 }), 200);
    const adult = (await f.store.transaction(tx => tx.find('adultEligibilities', { personId: g.personId })))[0]!;
    ok(await f.owner.cmd('POST', `/td2/adult-eligibility/${adult.id}/verify`, { schemaVersion, expectedRevision: adult.revision,
        expectedPersonRevision: (await g.current()).revision, sourceRevision: 1, evidenceAssetId: assetId, validUntil: '2026-10-01T00:00:00.000Z' }), 200);
    const proposalId = ok(await f.owner.cmd('POST', '/td2/proposals', { schemaVersion, ownerKind: 'personCredentials', ownerId: credentialId,
        fieldPath: 'issuerName', expectedRevision: 2, sourceId: g.sourceId, sourceRevision: 1, proposedValue: '合成待审名称' })).resourceId as string;
    return { g, assetId, keptAssetId, credentialId, adultId: adult.id, proposalId, collection2, provider };
}
export async function prepareAssetDeletion(f: Context, assetId: string) {
    const asset = (await f.store.transaction(tx => tx.get('assets', assetId)))!;
    const preview = ok(await f.owner.raw('POST', '/deletion-requests/preview', { targetKind: 'ASSET', targetId: assetId, expectedRevision: asset.revision }), 200);
    assert.equal(preview.complete, true, JSON.stringify(preview.unresolved));
    assert.ok(preview.items.some((i: any) => i.resourceKind === 'talentAssetGraph' && i.evidenceState === 'REVIEW_REQUIRED'));
    assert.equal(JSON.stringify(preview).includes('identifierCiphertext'), false);
    const requestId = ok(await f.owner.cmd('POST', '/deletion-requests', { targetKind: 'ASSET', targetId: assetId,
        expectedRevision: asset.revision, previewDigest: preview.previewDigest, reason: '合成确认删除共享原件及证明引用' })).resourceId as string;
    const current = async () => (await f.store.transaction(tx => tx.get('deletionRequests', requestId)))!;
    ok(await f.owner.cmd('POST', `/deletion-requests/${requestId}/block`, { expectedRevision: 1, previewDigest: preview.previewDigest, acknowledgeBlock: true }), 200);
    for (const item of await f.store.transaction(tx => tx.find('deletionItems', { requestId }))) if (item.decision === 'PENDING') {
        if (item.resourceKind === 'talentAssetGraph') assert.equal((await f.owner.cmd('POST', `/deletion-requests/${requestId}/decisions`, {
            expectedRevision: (await current()).revision, entryId: item.id, decision: 'RETAIN_WITH_BASIS', decisionReason: '不能删除原件却保留有效引用', retentionSourceId: asset.sourceId })).status, 422);
        ok(await f.owner.cmd('POST', `/deletion-requests/${requestId}/decisions`, { expectedRevision: (await current()).revision,
            entryId: item.id, decision: 'APPLY_PROPOSED', decisionReason: '合成确认移除引用并撤销当前资格' }), 200);
    }
    ok(await f.owner.cmd('POST', `/deletion-requests/${requestId}/plan/freeze`, { expectedRevision: (await current()).revision, acknowledgePlan: true }), 200);
    ok(await f.owner.cmd('POST', `/deletion-requests/${requestId}/cleaning/start`, { expectedRevision: (await current()).revision,
        planDigest: (await current()).planDigest, acknowledgeIrreversible: true }), 200);
    return { requestId, current };
}
export async function verifySharedAssetErasure(f: Context, root: string) {
    const s = await seedSharedProof(f, root), p = await s.g.current();
    const before = await f.store.transaction(tx => talentSnapshot(tx, p.workspaceId));
    const r = await prepareAssetDeletion(f, s.assetId);
    const requester = (await f.store.transaction(tx => tx.get('memberships', p.maintainerId)))!;
    await f.store.transaction(tx => tx.replace('memberships', { ...requester, status: 'DISABLED' }));
    const disabledCleanup = new DeletionCleanup(f.store, f.clock, f.app.config), disabledClaim = await disabledCleanup.claim(); assert.ok(disabledClaim); await disabledCleanup.process(disabledClaim);
    assert.equal((await f.store.transaction(tx => tx.get('adultEligibilities', s.adultId)))!.state, 'VERIFIED_ADULT');
    assert.equal((await f.store.transaction(tx => tx.find('deletionItems', { requestId: r.requestId }))).some(i => i.cleanupState === 'DONE'), false);
    await f.store.transaction(tx => tx.replace('memberships', requester));
    const faults = new FaultStore(f.store);
    faults.afterInsert = (table, row) => { if (table === 'audits' && 'action' in row && row.action === 'deletion.cleanup-item'
        && 'changedFields' in row && row.changedFields.includes('talentAssetGraph')) throw new Error('synthetic shared proof cleanup audit failure'); };
    const cleanup = new DeletionCleanup(faults, f.clock, f.app.config), claim = await cleanup.claim(); assert.ok(claim); await cleanup.process(claim);
    const failed = await f.store.transaction(tx => talentSnapshot(tx, p.workspaceId));
    for (const table of ['mediaCollectionItems','mediaCollections','adultEligibilities','personCredentials','fieldProposals','evidence'] as const) assert.deepEqual(failed[table], before[table]);
    faults.afterInsert = null; const retry = await cleanup.claim(); assert.ok(retry); await cleanup.process(retry);
    const after = await f.store.transaction(tx => talentSnapshot(tx, p.workspaceId));
    assert.equal((await f.store.transaction(tx => talentDependencyCounts(tx, p.workspaceId, 'ASSET', s.assetId))).count, 0);
    for (const collectionId of [s.g.collectionId, s.collection2]) {
        const items = after.mediaCollectionItems.filter(i => i.collectionId === collectionId); assert.equal(items.length, 1);
        assert.equal(items[0]!.assetId, s.keptAssetId); assert.equal(items[0]!.orderIndex, 0);
    }
    assert.equal(after.personCredentials.find(c => c.id === s.credentialId)!.status, 'REVOKED');
    assert.equal(after.personCredentials.find(c => c.id === s.credentialId)!.evidenceAssetId, null);
    const adult = after.adultEligibilities.find(a => a.id === s.adultId)!, oldAdult = before.adultEligibilities.find(a => a.id === s.adultId)!;
    assert.equal(adult.state, 'UNKNOWN'); assert.equal(adult.evidenceAssetId, null); assert.equal(adult.verifiedAt, oldAdult.verifiedAt); assert.equal(adult.verifiedByMembershipId, oldAdult.verifiedByMembershipId);
    assert.deepEqual(after.evidence, before.evidence); assert.equal(after.fieldProposals.find(r => r.id === s.proposalId)!.state, 'STALE');
    assert.equal(after.personCredentials.find(c => c.id === s.g.credentialId)!.identifierCiphertext, before.personCredentials.find(c => c.id === s.g.credentialId)!.identifierCiphertext);
    const final = await f.app.deletionFinalization.claim(); assert.ok(final);
    await f.store.transaction(tx => tx.replace('memberships', { ...requester, status: 'DISABLED' }));
    await assert.rejects(f.app.deletionFinalization.mediaTasks(final), (error: any) => error.code === 'ACTOR_DISABLED');
    await s.provider.verifyAsset((await f.store.transaction(tx => tx.get('assets', s.assetId)))!);
    await f.store.transaction(tx => tx.replace('memberships', requester));
    const tasks = await f.app.deletionFinalization.mediaTasks(final); assert.deepEqual(tasks, [{ mediaId: s.assetId }]);
    await s.provider.purge(s.assetId); await f.app.deletionFinalization.completeMediaPurge(final, s.assetId); await f.app.deletionFinalization.finish(final);
    assert.equal((await r.current()).state, 'COMPLETED'); assert.equal((await f.store.transaction(tx => tx.get('assets', s.assetId)))!.state, 'ERASED');
    assert.equal((await f.store.transaction(tx => tx.get('assets', s.keptAssetId)))!.state, 'READY');
    assert.equal((await f.store.transaction(tx => inspectTalentIntegrity(tx, p.workspaceId, f.app.config.contactKey))).relationFailures, 0);
}
