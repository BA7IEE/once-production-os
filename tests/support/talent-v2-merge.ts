import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../packages/core/src/errors.ts';
import { Application } from '../../packages/core/src/api.ts';
import type { Store } from '../../packages/core/src/store.ts';
import { TALENT_FACT_TABLES, TALENT_SCHEMA_VERSION as schemaVersion } from '../../packages/core/src/talent-v2-model.ts';
import { inspectTalentIntegrity, talentSnapshot } from '../../packages/core/src/talent-v2-integrity.ts';
import { decryptContact } from '../../packages/core/src/crypto.ts';
import { FakeClock, Client, sourceInput, result } from './fixtures.ts';
import { seedProfessionalGraph, expectResponse as ok } from './talent-v2-maintenance.ts';
import { FaultStore } from './fault-store.ts';

export function mergeInput(p: Record<string, any>) {
    return { canonicalId: p.canonical.id, duplicateId: p.duplicate.id,
        expectedCanonicalRevision: p.canonical.revision, expectedDuplicateRevision: p.duplicate.revision,
        previewDigest: p.previewDigest,
        fieldDecisions: p.fieldConflicts.map((x: any) => ({ field: x.field, choice: 'CANONICAL' })),
        collisionDecisions: p.collisions.map((x: any) => ({ collisionId: x.id, choice: 'KEEP_CANONICAL' })),
        professionalDecisions: p.professional.items.map(({ table, id, action }: any) => ({ table, id, action })),
        acknowledgeRevocations: true, acknowledgeMediaDetach: true, reason: '合成验收：人工确认重复身份及专业资料迁移' };
}
export async function mergePreview(store: Store, owner: Client, canonicalId: string, duplicateId: string) {
    const [a, b] = await store.transaction(async tx => [await tx.get('people', canonicalId), await tx.get('people', duplicateId)]);
    return ok(await owner.raw('POST', '/people/merge-preview', { canonicalId, duplicateId,
        expectedCanonicalRevision: a!.revision, expectedDuplicateRevision: b!.revision }), 200);
}

/** Identical assertions run against MemoryStore and PostgreSQL; writes use domain commands. */
export async function verifyProfessionalMerge(app: Application, store: Store, clock: FakeClock, owner: Client) {
    const graph = await seedProfessionalGraph(app, store, clock, owner);
    const person = await graph.current();
    const sourceId = ok(await owner.cmd('POST', '/sources', sourceInput())).resourceId as string;
    const canonicalId = ok(await owner.cmd('POST', '/td2/people', {
        schemaVersion, originSourceId: sourceId, sourceRevision: 1, displayName: '合成保留身份'
    })).resourceId as string;
    const shortlistId = ok(await owner.cmd('POST', '/shortlists', { title: '合成合并职业候选', scopeId: person.scopeId })).resourceId;
    ok(await owner.cmd('POST', `/shortlists/${shortlistId}/items`, {
        expectedRevision: 1, personId: person.id, personRoleId: graph.roleId, personRoleRevision: 1, note: '', workAssetIds: []
    }), 200);
    const snapshot = () => store.transaction(tx => talentSnapshot(tx, person.workspaceId));
    const before = await snapshot();
    const preview = await mergePreview(store, owner, canonicalId, person.id);
    assert.equal(preview.complete, true, JSON.stringify(preview.blockers));
    assert.deepEqual(await snapshot(), before, 'preview performs no graph writes');
    assert.ok(preview.professional.items.some((r: any) => r.id === graph.credentialId));
    assert.ok(preview.professional.items.some((r: any) => r.id === graph.proposalId && r.action === 'STALE_PROPOSAL'));
    assert.equal(JSON.stringify(preview).includes('SYNTHETIC-PRIVATE'), false);
    assert.equal(JSON.stringify(preview).includes('identifierCiphertext'), false);
    const input = mergeInput(preview), key = randomUUID();
    const missingDecision = await owner.cmd('POST', '/people/merge', { ...input, professionalDecisions: input.professionalDecisions.slice(1) });
    assert.equal(missingDecision.status, 422); assert.equal(result(missingDecision).error.code, 'TD2_MERGE_DECISIONS_INCOMPLETE');
    assert.deepEqual(await snapshot(), before);

    const fault = new FaultStore(store);
    fault.afterInsert = (table, row) => { if (table === 'audits' && 'action' in row && row.action === 'person.merge') throw new AppError(503, 'STORE_UNAVAILABLE', 'synthetic merge audit failure'); };
    const faultApp = new Application(fault, app.config, clock), client = new Client(faultApp);
    client.jar = { ...owner.jar }; client.csrf = owner.csrf;
    const failed = await client.cmd('POST', '/people/merge', input, key);
    assert.equal(failed.status, 503); assert.equal(result(failed).error.code, 'STORE_UNAVAILABLE');
    assert.ok(fault.insertTrace.includes('personAliases'), 'failure occurs after graph and alias writes');
    assert.deepEqual(await snapshot(), before, 'all graph changes roll back after the audit insert');
    fault.afterInsert = null;
    ok(await client.cmd('POST', '/people/merge', input, key), 200);
    const after = await snapshot();
    for (const table of TALENT_FACT_TABLES) {
        for (const old of before[table].filter(r => r.personId === person.id)) {
            const row = after[table].find(r => r.id === old.id)!;
            assert.ok(row, table + ': stable ID retained');
            assert.equal(row.personId, canonicalId); assert.equal(row.sourceId, old.sourceId);
            assert.equal(row.revision, Number(old.revision) + 1);
            const { personId: _oldPerson, revision: _oldRev, updatedAt: _oldAt, ...oldValues } = old;
            const { personId: _newPerson, revision: _newRev, updatedAt: _newAt, ...newValues } = row;
            assert.deepEqual(newValues, oldValues, table + ': no fact values replaced');
        }
    }
    assert.equal(after.fieldProposals.find(p => p.id === graph.proposalId)?.state, 'STALE');
    assert.deepEqual(after.evidence, before.evidence, 'typed evidence stays on its unchanged owner UUID');
    const candidate = after.shortlistItems.find(r => r.shortlistId === shortlistId)!;
    assert.equal(candidate.personId, canonicalId); assert.equal(candidate.personRoleId, graph.roleId);
    const credential = after.personCredentials.find(r => r.id === graph.credentialId)!;
    assert.equal(decryptContact(String(credential.identifierCiphertext), app.config.contactKey,
        `credential:${person.workspaceId}:${credential.id}`), 'SYNTHETIC-PRIVATE-9876');
    const integrity = await store.transaction(tx => inspectTalentIntegrity(tx, person.workspaceId, app.config.contactKey));
    assert.equal(integrity.relationFailures, 0); assert.equal(integrity.credentialDecryptFailures, 0);
    const detail = ok(await owner.raw('GET', '/td2/people/' + canonicalId), 200);
    assert.equal(detail.facts.personRoles.length, 2); assert.equal(detail.facts.measurementSets[0].id, graph.measurementId);
    const replay = ok(await client.cmd('POST', '/people/merge', input, key), 200);
    assert.equal(replay.replayed, true); assert.deepEqual(await snapshot(), after);
}

/** Conflicting professional graphs exercise both history retention and active-record selection. */
export async function verifyProfessionalConflicts(app: Application, store: Store, clock: FakeClock, owner: Client) {
    const a = await seedProfessionalGraph(app, store, clock, owner), b = await seedProfessionalGraph(app, store, clock, owner);
    const person = await a.current();
    const snapshot = () => store.transaction(tx => talentSnapshot(tx, person.workspaceId));
    const before = await snapshot(), p = await mergePreview(store, owner, a.personId, b.personId);
    assert.equal(p.complete, true, JSON.stringify(p.blockers));
    assert.equal(p.professional.conflicts.length, 7);
    const decisions = p.professional.conflicts.map((c: any) => ({ table: c.table, canonicalId: c.canonicalId, duplicateId: c.duplicateId,
        choice: c.choices.includes('RETAIN_DUPLICATE_HISTORY') ? 'RETAIN_DUPLICATE_HISTORY' : c.table === 'adultEligibilities' ? 'KEEP_DUPLICATE_ACTIVE' : 'KEEP_CANONICAL_ACTIVE' }));
    const input = { ...mergeInput(p), professionalConflicts: decisions }, key = randomUUID();
    assert.equal((await owner.cmd('POST', '/people/merge', { ...input, professionalConflicts: decisions.slice(1) })).status, 422);
    assert.equal((await owner.cmd('POST', '/people/merge', { ...input, professionalConflicts: [...decisions, decisions[0]] })).status, 422);
    const fault = new FaultStore(store);
    fault.afterInsert = (t, r) => { if (t === 'audits' && 'action' in r && r.action === 'person.merge') throw new AppError(503, 'STORE_UNAVAILABLE', 'synthetic conflict audit failure'); };
    const client = new Client(new Application(fault, app.config, clock)); client.jar = { ...owner.jar }; client.csrf = owner.csrf;
    assert.equal((await client.cmd('POST', '/people/merge', input, key)).status, 503);
    assert.ok(fault.insertTrace.includes('personAliases'));
    assert.deepEqual(await snapshot(), before);
    fault.afterInsert = null;
    ok(await client.cmd('POST', '/people/merge', input, key), 200);
    const after = await snapshot();
    for (const table of ['talentProfiles', 'castingProfiles'] as const) {
        const old = before[table].find(r => r.personId === b.personId)!, retained = after[table].find(r => r.id === old.id)!;
        assert.equal(retained.personId, b.personId); assert.equal(retained.sourceId, old.sourceId);
        assert.equal(retained.supersededById, before[table].find(r => r.personId === a.personId)!.id);
        if (table === 'castingProfiles') { assert.equal(retained.currentMeasurementSetId, null); assert.equal(retained.retiredCurrentMeasurementSetId, old.currentMeasurementSetId); }
        for (const [field, value] of Object.entries(old)) if (!['revision', 'updatedAt', 'supersededById', 'currentMeasurementSetId', 'retiredCurrentMeasurementSetId'].includes(field)) assert.deepEqual(retained[field], value);
        await assert.rejects(store.transaction(async tx => tx.remove(table, old.id)), /历史/);
        await assert.rejects(store.transaction(async tx => { const row = (await tx.get(table, old.id))!; await tx.replace(table, { ...row, revision: row.revision + 1 }); }), /只读/);
    }
    assert.deepEqual(after.evidence, before.evidence);
    assert.equal(after.personRoles.find(r => r.id === b.roleId)!.status, 'INACTIVE');
    assert.equal(after.personRoles.find(r => r.id === a.roleId)!.status, 'ACTIVE');
    assert.equal(after.personLanguages.find(r => r.id === b.languageId)!.status, 'INACTIVE');
    assert.equal(after.adultEligibilities.find(r => r.personId === a.personId && r.status === 'ACTIVE')!.sourceId, b.sourceId);
    assert.equal(after.adultEligibilities.filter(r => r.personId === a.personId && r.status === 'ACTIVE').length, 1);
    assert.equal(after.measurementSets.find(r => r.id === b.measurementId)!.personId, a.personId);
    assert.equal(after.personCredentials.find(r => r.id === b.credentialId)!.personRoleId, before.personCredentials.find(r => r.id === b.credentialId)!.personRoleId);
    const deletion = ok(await owner.raw('POST', '/deletion-requests/preview', { targetKind: 'PERSON', targetId: a.personId, expectedRevision: (await a.current()).revision }), 200);
    assert.equal(deletion.complete, false);
    assert.ok(deletion.unresolved.some((r: any) => r.code === 'TD2_MERGE_HISTORY_RETENTION_REQUIRED'));
    const history = ok(await owner.raw('GET', `/people/${a.personId}/merge-history`), 200);
    assert.equal(history.items.length, 2); assert.ok(history.items.every((r: any) => r.record.usable === false && r.originalPersonId === b.personId));
    assert.equal(JSON.stringify(history).includes('SYNTHETIC-PRIVATE'), false);
    const check = await store.transaction(tx => inspectTalentIntegrity(tx, person.workspaceId, app.config.contactKey));
    assert.equal(check.relationFailures, 0); assert.equal(check.credentialDecryptFailures, 0);
    assert.equal(ok(await client.cmd('POST', '/people/merge', input, key), 200).replayed, true);
    assert.deepEqual(await snapshot(), after);
    await store.transaction(async tx => { const source = (await tx.get('sources', b.sourceId))!; await tx.replace('sources', { ...source, status: 'SUSPENDED', revision: source.revision + 1 }); });
    assert.equal(ok(await owner.raw('GET', `/people/${a.personId}/merge-history`), 200).items.length, 0);
}
