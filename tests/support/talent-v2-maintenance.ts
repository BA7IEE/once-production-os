/** Shared synthetic contracts. Executed unchanged against MemoryStore and real PostgreSQL. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Store, Tx } from '../../packages/core/src/store.ts';
import type { Table } from '../../packages/core/src/model.ts';
import type { Application, ApiResponse } from '../../packages/core/src/api.ts';
import { RecoveryOps } from '../../packages/core/src/recovery.ts';
import { DeletionCleanup } from '../../packages/core/src/deletion-cleanup.ts';
import { hashSecret } from '../../packages/core/src/crypto.ts';
import { digest } from '../../packages/core/src/json.ts';
import { inspectTalentIntegrity, talentDependencyCounts } from '../../packages/core/src/talent-v2-integrity.ts';
import { TALENT_SCHEMA_VERSION as schemaVersion } from '../../packages/core/src/talent-v2-model.ts';
import { TD2_FACTS, type FactTable } from '../../packages/core/src/talent-v2-schema.ts';
import { FakeClock, Client, sourceInput, result } from './fixtures.ts';
import { FaultStore } from './fault-store.ts';

export function expectResponse(response: ApiResponse, status = 201) {
    assert.equal(response.status, status, JSON.stringify(response.body)); return result(response);
}
export async function seedProfessionalGraph(app: Application, store: Store, clock: FakeClock, owner: Client, sourceId?: string, personId?: string) {
    sourceId ??= expectResponse(await owner.cmd('POST', '/sources', sourceInput())).resourceId as string;
    if (!personId) personId = expectResponse(await owner.cmd('POST', '/td2/people', {
        schemaVersion, originSourceId: sourceId, sourceRevision: 1, displayName: '合成专业档案', createTalent: true
    })).resourceId as string;
    else {
        const person = (await store.transaction(tx => tx.get('people', personId!)))!;
        expectResponse(await owner.cmd('POST', `/td2/people/${personId}/enroll`, {
            schemaVersion, expectedRevision: person.revision, sourceRevision: 1
        }), 200);
    }
    const current = async () => (await store.transaction(tx => tx.get('people', personId!)))!;
    const add = async (table: FactTable, values: Record<string, unknown>) => expectResponse(await owner.cmd('POST',
        `/td2/people/${personId}/${TD2_FACTS[table].slug}`, {
            schemaVersion, expectedPersonRevision: (await current()).revision, sourceId, sourceRevision: 1, values
        })).resourceId as string;
    const existingRoles = await store.transaction(tx => tx.find('personRoles', { personId }));
    const roleId = existingRoles.find(r => r.roleCode === 'model')?.id ?? await add('personRoles', { roleCode: 'model' });
    const translatorId = await add('personRoles', { roleCode: 'translator' });
    const languageId = await add('personLanguages', { languageCode: 'en', speakingLevelCode: 'WORKING' });
    await add('talentLocations', { locationCode: 'shenzhen', relationCode: 'BASE' });
    await add('castingProfiles', { hairColorCode: 'BROWN' });
    const measurementId = await add('measurementSets', { measuredOn: '2026-09-22', datePrecision: 'EXACT_DAY', heightCm: 175, shoeSizeValue: '38', shoeSizeSystem: 'EU' });
    expectResponse(await owner.cmd('POST', `/td2/measurements/${measurementId}/confirm`, {
        schemaVersion, expectedRevision: 1, expectedPersonRevision: (await current()).revision, sourceRevision: 1
    }), 200);
    await add('adultEligibilities', { state: 'SELF_DECLARED_ADULT' });
    const externalRefId = await add('personExternalRefs', { providerCode: 'WECHAT', namespaceCode: 'synthetic', externalKey: 'ref-' + personId });
    const credentialId = await add('personCredentials', { credentialTypeCode: 'DRONE_LICENSE', issuerName: '合成资质签发机构' });
    expectResponse(await owner.cmd('POST', `/td2/credentials/${credentialId}/identifier`, {
        schemaVersion, expectedRevision: 1, expectedPersonRevision: (await current()).revision, identifier: 'SYNTHETIC-PRIVATE-9876'
    }), 200);
    await add('translatorLanguagePairs', { personRoleId: translatorId, sourceLanguageCode: 'en', targetLanguageCode: 'zh' });
    await add('translatorServiceModes', { personRoleId: translatorId, modeCode: 'ON_SET' });
    const collectionId = await add('mediaCollections', { personRoleId: roleId, collectionTypeCode: 'PORTFOLIO', title: '合成模特作品集' });
    await add('mediaCollectionTags', { collectionId, tagCode: 'FASHION' });
    const agentId = expectResponse(await owner.cmd('POST', '/td2/people', {
        schemaVersion, originSourceId: sourceId, sourceRevision: 1, displayName: '合成经纪联系人'
    })).resourceId as string;
    await add('representations', { relationCode: 'AGENT', agentPersonId: agentId, personRoleId: roleId, territoryCode: 'cn' });
    const capabilityCode = 'skill-' + personId.slice(0, 8);
    expectResponse(await owner.cmd('POST', '/td2/capability-definitions', {
        schemaVersion, code: capabilityCode, labelZh: '合成能力', labelEn: 'Synthetic', aliases: [],
        applicableRoleCodes: ['model'], levelSchemeCode: 'ABILITY_5', semanticVersion: '1.0.0'
    }));
    await add('personCapabilities', { capabilityCode, personRoleId: roleId, levelCode: 'PROFESSIONAL' });
    const proposalId = expectResponse(await owner.cmd('POST', '/td2/proposals', {
        schemaVersion, ownerKind: 'personLanguages', ownerId: languageId, fieldPath: 'speakingLevelCode',
        expectedRevision: 1, sourceId, sourceRevision: 1, proposedValue: 'FLUENT'
    })).resourceId as string;
    const p = await current();
    const principal = expectResponse(await owner.raw('POST', '/td2/principals', {
        schemaVersion, displayName: '合成专业资料Agent', scopeId: p.scopeId, defaultMaintainerMembershipId: p.maintainerId,
        permissionCodes: ['records.read', 'sources.read', 'talent.propose'], expiresAt: '2026-10-01T00:00:00.000Z'
    }));
    return { personId, sourceId, roleId, translatorId, languageId, measurementId, externalRefId,
        credentialId, collectionId, proposalId, agentId, principalId: principal.id as string, token: principal.token as string, current, add };
}

export async function verifyProfessionalErasure(app: Application, store: Store, clock: FakeClock, owner: Client) {
    const f = await seedProfessionalGraph(app, store, clock, owner);
    expectResponse(await owner.cmd('PATCH',`/directory/talents/${f.personId}`,{schemaVersion:'once-talent-experience-v1',expectedRevision:(await f.current()).revision,sourceId:f.sourceId,sourceRevision:1,profile:{genderCode:'FEMALE',birthPrecision:'YEAR_ONLY',birthYear:2000,nationalityCodes:['CN']},model:{castingMarketCode:'DOMESTIC',experienceCode:'AMATEUR',styleCodes:['natural'],serviceCodes:['print']}}),200);
    const p = await f.current();
    const listId = expectResponse(await owner.cmd('POST', '/shortlists', { title: '合成职业候选', scopeId: p.scopeId })).resourceId as string;
    expectResponse(await owner.cmd('POST', `/shortlists/${listId}/items`, {
        expectedRevision: 1, personId: p.id, personRoleId: f.roleId, personRoleRevision: (await store.transaction(tx=>tx.get('personRoles',f.roleId)))!.revision, note: '', workAssetIds: []
    }), 200);
    const preview = expectResponse(await owner.raw('POST', '/deletion-requests/preview', {
        targetKind: 'PERSON', targetId: p.id, expectedRevision: p.revision
    }), 200);
    assert.equal(preview.complete, true); assert.ok(preview.items.some((r: any) => r.resourceKind === 'talentGraph'));
    assert.ok(!JSON.stringify(preview).includes('SYNTHETIC-PRIVATE'));
    const requestId = expectResponse(await owner.cmd('POST', '/deletion-requests', {
        targetKind: 'PERSON', targetId: p.id, expectedRevision: p.revision, previewDigest: preview.previewDigest,
        reason: '合成验收：彻底清理专业档案及其有类型的证据和建议'
    })).resourceId as string;
    expectResponse(await owner.cmd('POST', `/deletion-requests/${requestId}/block`, {
        expectedRevision: 1, previewDigest: preview.previewDigest, acknowledgeBlock: true
    }), 200);
    const req = async () => (await store.transaction(tx => tx.get('deletionRequests', requestId)))!;
    for (const item of await store.transaction(tx => tx.find('deletionItems', { requestId }))) if (item.decision === 'PENDING')
        expectResponse(await owner.cmd('POST', `/deletion-requests/${requestId}/decisions`, {
            expectedRevision: (await req()).revision, entryId: item.id, decision: 'APPLY_PROPOSED', decisionReason: '合成测试确认无保留需求'
        }), 200);
    expectResponse(await owner.cmd('POST', `/deletion-requests/${requestId}/plan/freeze`, { expectedRevision: (await req()).revision, acknowledgePlan: true }), 200);
    expectResponse(await owner.cmd('POST', `/deletion-requests/${requestId}/cleaning/start`, {
        expectedRevision: (await req()).revision, planDigest: (await req()).planDigest, acknowledgeIrreversible: true
    }), 200);
    const before = await store.transaction(tx => talentDependencyCounts(tx, p.workspaceId, 'PERSON', p.id));
    assert.ok(before.count >= 15);
    // Real Store transaction rollback, not an in-memory assertion about intended code paths.
    const fault = new FaultStore(store);
    fault.afterInsert = (table, row) => {
        if (table === 'audits' && 'action' in row && row.action === 'deletion.cleanup-item'
            && 'changedFields' in row && row.changedFields.includes('talentGraph')) throw new Error('synthetic cleanup audit failure');
    };
    const cleanup = new DeletionCleanup(fault, clock, app.config);
    const first = await cleanup.claim(); assert.ok(first); await cleanup.process(first);
    const failed = await store.transaction(tx => talentDependencyCounts(tx, p.workspaceId, 'PERSON', p.id));
    assert.equal(failed.count, before.count); assert.equal(failed.digest, before.digest);
    assert.equal((await store.transaction(tx => tx.get('personCredentials', f.credentialId)))?.identifierCiphertext !== null, true);
    fault.afterInsert = null;
    const retry = await cleanup.claim(); assert.ok(retry); await cleanup.process(retry);
    assert.equal((await store.transaction(tx => talentDependencyCounts(tx, p.workspaceId, 'PERSON', p.id))).count, 0);
    const final = await app.deletionFinalization.claim(); assert.ok(final); await app.deletionFinalization.finish(final);
    assert.equal((await req()).state, 'COMPLETED'); assert.equal((await f.current()).status, 'ERASED');
    assert.ok(await store.transaction(tx => tx.get('people', f.agentId)), 'independent agent identity remains');
    assert.ok(await store.transaction(tx => tx.get('servicePrincipals', f.principalId)), 'machine accounts are not Person-owned payload');
    assert.equal((await owner.raw('GET', `/td2/people/${p.id}`)).status, 404);
}

export async function verifyProfessionalRecovery(app: Application, store: Store, clock: FakeClock, owner: Client) {
    const f = await seedProfessionalGraph(app, store, clock, owner);
    expectResponse(await owner.cmd('PATCH',`/directory/talents/${f.personId}`,{schemaVersion:'once-talent-experience-v1',expectedRevision:(await f.current()).revision,sourceId:f.sourceId,sourceRevision:1,profile:{genderCode:'FEMALE',birthPrecision:'YEAR_ONLY',birthYear:2000,nationalityCodes:['CN']},model:{castingMarketCode:'DOMESTIC',experienceCode:'AMATEUR',styleCodes:['natural'],serviceCodes:['print']}}),200);
    const p = await f.current();
    const config = { ...app.config, accessMode: 'MAINTENANCE' as const, dataEgressMode: 'DISABLED' as const,
        dataCleanupMode: 'DISABLED' as const, dataMergeMode: 'DISABLED' as const, recoveryEpoch: 'td2_new_epoch_' + 'x'.repeat(40) };
    const recovery = new RecoveryOps(clock, config);
    const actor = await store.transaction(tx => recovery.actorFromRestoredTarget(tx, 'owner'));
    const plan = await store.transaction(tx => recovery.preview(tx, actor));
    const faults = new FaultStore(store);
    faults.afterInsert = (table, row) => {
        if (table === 'audits' && 'action' in row && row.action === 'recovery.prepare') throw new Error('synthetic prepare audit failure');
    };
    const meta = { requestId: randomUUID(), ip: 'test' };
    await assert.rejects(faults.transaction(tx => recovery.prepare(tx, actor, plan.sourceEpochDigest, meta)));
    assert.equal((await store.transaction(tx => tx.get('servicePrincipals', f.principalId)))?.status, 'ACTIVE');
    assert.equal((await store.transaction(tx => tx.get('fieldProposals', f.proposalId)))?.state, 'PENDING');
    const run = await store.transaction(tx => recovery.prepare(tx, actor, plan.sourceEpochDigest, meta));
    assert.equal((await store.transaction(tx => tx.get('servicePrincipals', f.principalId)))?.credentialHash, null);
    assert.equal((await store.transaction(tx => tx.get('fieldProposals', f.proposalId)))?.state, 'STALE');
    assert.equal((await f.current()).id, p.id);
    const emptyMedia = { provider: 'disabled' as const, identityDigest: digest([]), backupIdentityDigest: digest([]),
        expectedAssetIds: [], verifiedAssetIds: [], missingAssetIds: [], mismatchAssetIds: [] };
    const external = { migrationDigest: 'd'.repeat(64), migrationMatch: true, media: emptyMedia };
    const report = await store.transaction(tx => recovery.inspect(tx, actor, run.id, external, meta));
    assert.deepEqual(report.blockers, []); assert.ok(report.talent); assert.equal(report.talent.credentialCount, 1);
    assert.equal(report.talent.credentialDecryptFailures, 0); assert.equal(report.talent.tableCounts.personRoles, 2);
    const serialized = JSON.stringify(report);
    assert.ok(!serialized.includes(f.token) && !serialized.includes('credentialHash') && !serialized.includes('identifierCiphertext'));
    const wrong = new RecoveryOps(clock, { ...config, contactKey: Buffer.alloc(32, 9) });
    const wrongReport = await store.transaction(tx => wrong.check(tx, actor, run.id, external));
    assert.equal(wrongReport.contactCount, 0); assert.ok(wrongReport.blockers.includes('TD2_CREDENTIAL_KEY_MISMATCH'));
    const changed = await store.transaction(async tx => {
        const language = (await tx.get('personLanguages', f.languageId))!;
        await tx.replace('personLanguages', { ...language, speakingLevelCode: 'FLUENT', revision: language.revision + 1 });
        return recovery.check(tx, actor, run.id, external);
    });
    assert.notEqual(changed.databaseStateDigest, report.databaseStateDigest);
    const evidence = { schemaVersion: 'once-recovery-approval-v1' as const, backupId: randomUUID(), backupManifestDigest: 'a'.repeat(64),
        databaseSha256: 'b'.repeat(64), recoveryEpochDigest: plan.sourceEpochDigest, contactKeyDigest: report.contactKeyDigest,
        migrationDigest: external.migrationDigest, mediaIdentityDigest: emptyMedia.backupIdentityDigest, reportDigest: digest(report),
        safetyJournal: { journalId: randomUUID(), backupSequence: 0, currentSequence: 0, backupHeadHash: 'c'.repeat(64), currentHeadHash: 'c'.repeat(64), postBackupEntries: 0 },
        deltaResolution: { schemaVersion: 'once-recovery-delta-v1' as const, backupSequence: 0, currentSequence: 0, postBackupEntries: 0, resolved: 0, unresolved: 0, items: [] }, deltaResolutionDigest: '' };
    evidence.deltaResolutionDigest = digest(evidence.deltaResolution);
    await assert.rejects(store.transaction(tx => recovery.approve(tx, actor, run.id, external, evidence, meta)), (e: any) => e.code === 'RECOVERY_CHECK_STALE');
    assert.equal(hashSecret((await store.transaction(tx => tx.get('workspaces', p.workspaceId)))!.recoveryEpoch), plan.sourceEpochDigest);
    assert.equal((await store.transaction(tx => inspectTalentIntegrity(tx, p.workspaceId, app.config.contactKey))).relationFailures, 0);
}
