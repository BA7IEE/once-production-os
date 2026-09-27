import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, result } from '../support/fixtures.ts';
import { verifyProfessionalErasure, verifyProfessionalRecovery, seedProfessionalGraph, expectResponse } from '../support/talent-v2-maintenance.ts';
import { inspectTalentIntegrity } from '../../packages/core/src/talent-v2-integrity.ts';
import { assertTalentFinalizationClean } from '../../packages/core/src/talent-v2-erasure.ts';
import { TALENT_SCHEMA_VERSION as schemaVersion } from '../../packages/core/src/talent-v2-model.ts';
import { randomUUID } from 'node:crypto';

test('TD2-T16 Person graph erasure previews, rolls back on audit failure, retries and preserves independent identities', async () => {
    const f = await fixture(); await verifyProfessionalErasure(f.app, f.store, f.clock, f.owner);
});
test('TD2-T17 recovery revokes machine credentials, invalidates proposals, checks credential encryption and detects graph drift', async () => {
    const f = await fixture(); await verifyProfessionalRecovery(f.app, f.store, f.clock, f.owner);
});
test('TD2-T17 integrity inspector detects missing or cross-person typed references without leaking identifiers', async () => {
    const f = await fixture(), p = await seedProfessionalGraph(f.app, f.store, f.clock, f.owner);
    const before = await f.store.transaction(tx => inspectTalentIntegrity(tx, f.workspaceId, f.app.config.contactKey));
    await f.store.transaction(async tx => {
        const pair = (await tx.find('translatorLanguagePairs', { personId: p.personId }))[0]!;
        await tx.replace('translatorLanguagePairs', { ...pair, personRoleId: randomUUID() });
    });
    const report = await f.store.transaction(tx => inspectTalentIntegrity(tx, f.workspaceId, f.app.config.contactKey));
    assert.ok(report.relationFailures > before.relationFailures); assert.ok(report.blockers.includes('TD2_RELATION_INVALID'));
});
test('TD2-T16 source-owned identities require explicit full erasure while singleton merge requires history resolution', async () => {
    const f = await fixture(), p = await seedProfessionalGraph(f.app, f.store, f.clock, f.owner);
    const preview = expectResponse(await f.owner.raw('POST', '/deletion-requests/preview', { targetKind: 'SOURCE', targetId: p.sourceId, expectedRevision: 1 }), 200);
    assert.equal(preview.complete,true); assert.equal(preview.items.filter((r:any)=>r.detailCode==='TD2_SOURCE_PERSON_ERASE_ONLY').length,2); assert.ok(preview.items.some((r:any)=>r.resourceKind==='talentSourceFact'&&r.resourceId===p.credentialId));
    const second = expectResponse(await f.owner.cmd('POST', '/td2/people', { schemaVersion, originSourceId: p.sourceId, sourceRevision: 1, displayName: '合成重复人物', createTalent: true }));
    const merge = expectResponse(await f.owner.raw('POST', '/people/merge-preview', {
        canonicalId: p.personId, duplicateId: second.resourceId, expectedCanonicalRevision: (await p.current()).revision, expectedDuplicateRevision: 1
    }), 200);
    assert.ok(merge.professional.conflicts.some((r: any) => r.table === 'talentProfiles' && r.choices.includes('RETAIN_DUPLICATE_HISTORY')));
    assert.equal(merge.complete, true);
    await assert.rejects(f.store.transaction(tx => assertTalentFinalizationClean(tx, f.workspaceId, 'PERSON', p.personId, f.clock)));
});
test('TD2-T16 legacy export cannot serialize stale flat professional fields for an upgraded person', async () => {
    const f = await fixture(), p = await seedProfessionalGraph(f.app, f.store, f.clock, f.owner);
    const permission = expectResponse(await f.owner.cmd('POST', '/use-permissions', {
        sourceId: p.sourceId, subjectKind: 'PERSON', subjectId: p.personId, fields: ['person.displayName', 'person.roles'],
        validUntil: '2026-10-01T00:00:00.000Z', evidenceNote: '合成测试旧版字段不能假装是完整2.0资料'
    }));
    const exported = await f.owner.cmd('POST', '/exports', {
        format: 'JSON', selectedIds: { people: [p.personId], works: [], projects: [] },
        fields: ['person.displayName', 'person.roles'], usePermissionRefs: [permission.resourceId]
    });
    assert.equal(exported.status, 409); assert.equal(result(exported).error.code, 'TD2_TYPED_EXPORT_REQUIRED');
});
