import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, member, result } from '../support/fixtures.ts';
import { verifyProfessionalConflicts, verifyProfessionalMerge, mergePreview, mergeInput } from '../support/talent-v2-merge.ts';
import { seedProfessionalGraph, expectResponse as ok } from '../support/talent-v2-maintenance.ts';
import { TALENT_SCHEMA_VERSION as schemaVersion } from '../../packages/core/src/talent-v2-model.ts';

test('TD2 typed merge preserves IDs, sources, role links and credentials; audit failure rolls back; exact retry/replay succeed', async () => {
    const f = await fixture(); await verifyProfessionalMerge(f.app, f.store, f.clock, f.owner);
});
async function setup() {
    const f = await fixture(), g = await seedProfessionalGraph(f.app, f.store, f.clock, f.owner);
    const canonicalId = ok(await f.owner.cmd('POST', '/td2/people', { schemaVersion, originSourceId: g.sourceId,
        sourceRevision: 1, displayName: '合成主身份' })).resourceId as string;
    return { ...f, g, canonicalId };
}
test('TD2 typed merge binds fact content, evidence and proposal revisions, not only root revisions', async () => {
    const f = await setup();
    for (const table of ['personLanguages', 'evidence', 'fieldProposals'] as const) {
        const p = await mergePreview(f.store, f.owner, f.canonicalId, f.g.personId);
        await f.store.transaction(async tx => {
            const row = (await tx.find(table, { workspaceId: f.workspaceId }))[0]!;
            await tx.replace(table, { ...row, revision: row.revision + 1 });
        });
        const r = await f.owner.cmd('POST', '/people/merge', mergeInput(p));
        assert.equal(r.status, 409); assert.equal(result(r).error.code, 'MERGE_PREVIEW_STALE');
        assert.equal(f.store.rows('personAliases').length, 0);
    }
});
test('TD2 hidden or sensitive dependencies expose no typed IDs, proposal values or secret data', async () => {
    const f = await setup(), editor = await member(f, 'typed_merger', 'EDITOR', ['data.merge']);
    const p = await mergePreview(f.store, editor.client, f.canonicalId, f.g.personId);
    assert.equal(p.complete, false); assert.equal(p.professional.restricted, true);
    assert.deepEqual(p.professional.items, []); assert.deepEqual(p.professional.conflicts, []);
    assert.equal(JSON.stringify(p).includes(f.g.credentialId), false);
    // Revoking a fact's own source blocks the existing preview even if identity sources remain usable.
    const role = f.store.rows('personRoles')[0]!;
    const restricted = ok(await f.owner.cmd('POST', '/scopes', { name: '合成专用', membershipIds: [f.membershipId] })).resourceId;
    await f.store.transaction(async tx => {
        const source = (await tx.get('sources', role.sourceId))!;
        await tx.replace('sources', { ...source, scopeId: restricted });
    });
    assert.equal((await editor.client.raw('POST', '/people/merge-preview', {
        canonicalId: f.canonicalId, duplicateId: f.g.personId,
        expectedCanonicalRevision: 1, expectedDuplicateRevision: (await f.g.current()).revision
    })).status, 404);
});
test('TD2 singleton collisions are enumerated and cannot be bypassed by explicit migration acknowledgements', async () => {
    const f = await setup();
    ok(await f.owner.cmd('POST', `/td2/people/${f.canonicalId}/enroll`, { schemaVersion, expectedRevision: 1, sourceRevision: 1 }), 200);
    const p = await mergePreview(f.store, f.owner, f.canonicalId, f.g.personId);
    assert.equal(p.complete, true); assert.ok(p.professional.conflicts.some((c: any) => c.table === 'talentProfiles'));
    const r = await f.owner.cmd('POST', '/people/merge', mergeInput(p));
    assert.equal(r.status, 422); assert.equal(result(r).error.code, 'TD2_MERGE_CONFLICT_INCOMPLETE');
    assert.equal(f.store.rows('talentProfiles').length, 2); assert.equal(f.store.rows('personAliases').length, 0);
});
test('TD2 overlapping language facts remain a conflict, and duplicate or invented acknowledgements fail', async () => {
    const f = await setup();
    let p = await mergePreview(f.store, f.owner, f.canonicalId, f.g.personId), input = mergeInput(p);
    assert.equal((await f.owner.cmd('POST', '/people/merge', { ...input, professionalDecisions: [...input.professionalDecisions, input.professionalDecisions[0]] })).status, 422);
    ok(await f.owner.cmd('POST', `/td2/people/${f.canonicalId}/languages`, { schemaVersion, expectedPersonRevision: 1,
        sourceId: f.g.sourceId, sourceRevision: 1, values: { languageCode: 'en', speakingLevelCode: 'NATIVE' } }));
    p = await mergePreview(f.store, f.owner, f.canonicalId, f.g.personId);
    assert.ok(p.professional.conflicts.some((b: any) => b.table === 'personLanguages'));
    assert.equal((await f.owner.cmd('POST', '/people/merge', mergeInput(p))).status, 422);
});

test('TD2 merging an independent agent rebinds inbound representation without moving the represented talent', async () => {
    const f = await setup(), representedBefore = await f.g.current();
    const representationBefore = f.store.rows('representations').find(r => r.agentPersonId === f.g.agentId)!;
    const p = await mergePreview(f.store, f.owner, f.canonicalId, f.g.agentId);
    assert.equal(p.complete, true);
    assert.ok(p.professional.items.some((r: any) => r.id === representationBefore.id && r.action === 'REBIND_AGENT'));
    ok(await f.owner.cmd('POST', '/people/merge', mergeInput(p)), 200);
    const representation = f.store.rows('representations').find(r => r.id === representationBefore.id)!;
    assert.equal(representation.agentPersonId, f.canonicalId);
    assert.equal(representation.personId, f.g.personId); assert.equal(representation.sourceId, representationBefore.sourceId);
    assert.equal((await f.g.current()).revision, representedBefore.revision + 1);
    assert.equal(f.store.rows('personRoles').filter(r => r.personId === f.g.personId).length, 2);
});

test('TD2 source revocation for a professional fact invalidates preview while both identity sources remain readable', async () => {
    const f = await setup();
    const source = structuredClone(f.store.rows('sources').find(s => s.id === f.g.sourceId)!);
    const { randomUUID } = await import('node:crypto'); source.id = randomUUID();
    await f.store.transaction(async tx => {
        await tx.insert('sources', source);
        const language = (await tx.get('personLanguages', f.g.languageId))!;
        await tx.replace('personLanguages', { ...language, sourceId: source.id });
    });
    const p = await mergePreview(f.store, f.owner, f.canonicalId, f.g.personId);
    assert.equal(p.complete, true);
    await f.store.transaction(tx => tx.replace('sources', { ...source, status: 'SUSPENDED', revision: source.revision + 1 }));
    const r = await f.owner.cmd('POST', '/people/merge', mergeInput(p));
    assert.equal(r.status, 409); assert.equal(result(r).error.code, 'MERGE_PREVIEW_STALE');
    const now = await mergePreview(f.store, f.owner, f.canonicalId, f.g.personId);
    assert.equal(now.complete, false); assert.equal(now.professional.restricted, true); assert.deepEqual(now.professional.items, []);
    assert.equal(f.store.rows('personAliases').length, 0);
});

test('TD2 explicit conflict decisions retain source facts, immutable history and atomic retry', async () => { const f = await fixture(); await verifyProfessionalConflicts(f.app, f.store, f.clock, f.owner); });

test('TD2 contradictory interval decisions cannot deactivate a record selected as active elsewhere', async () => {
    const { resolveTalentConflicts } = await import('../../packages/core/src/talent-v2-merge.ts');
    const common = { table: 'personLanguages', canonicalId: 'a', code: 'PERIOD_RESOLUTION_REQUIRED', canonicalValue: {}, duplicateValue: {}, dependentCount: 0, choices: ['KEEP_CANONICAL_ACTIVE', 'KEEP_DUPLICATE_ACTIVE'] };
    const conflicts = [{ ...common, duplicateId: 'b' }, { ...common, duplicateId: 'c' }];
    assert.throws(() => resolveTalentConflicts({ conflicts } as any, [
        { table: 'personLanguages', canonicalId: 'a', duplicateId: 'b', choice: 'KEEP_CANONICAL_ACTIVE' },
        { table: 'personLanguages', canonicalId: 'a', duplicateId: 'c', choice: 'KEEP_DUPLICATE_ACTIVE' }
    ]), /同时选择保留生效和停用/);
});
test('TD2 retained history requires merge permission and rechecks the original identity scope', async () => {
    const f = await fixture();
    const a = await seedProfessionalGraph(f.app, f.store, f.clock, f.owner);
    const b = ok(await f.owner.cmd('POST', '/td2/people', { schemaVersion, originSourceId: a.sourceId, sourceRevision: 1, displayName: '合成历史身份', createTalent: true })).resourceId;
    const p = await mergePreview(f.store, f.owner, a.personId, b);
    ok(await f.owner.cmd('POST', '/people/merge', { ...mergeInput(p), professionalConflicts: p.professional.conflicts.map((c: any) => ({table:c.table,canonicalId:c.canonicalId,duplicateId:c.duplicateId,choice:'RETAIN_DUPLICATE_HISTORY'})) }), 200);
    const viewer = await member(f, 'history_viewer', 'VIEWER');
    assert.equal((await viewer.client.raw('GET', `/people/${a.personId}/merge-history`)).status, 403);
    const editor = await member(f, 'history_editor', 'EDITOR', ['data.merge']);
    assert.equal(ok(await editor.client.raw('GET', `/people/${a.personId}/merge-history`), 200).items.length, 1);
    const scope = ok(await f.owner.cmd('POST','/scopes',{name:'历史专用范围',membershipIds:[f.membershipId]})).resourceId;
    await f.store.transaction(async tx => { const old=(await tx.get('people',b))!; await tx.replace('people',{...old,scopeId:scope}); });
    assert.equal(ok(await editor.client.raw('GET', `/people/${a.personId}/merge-history`), 200).items.length, 0);
});
