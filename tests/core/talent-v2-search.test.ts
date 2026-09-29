import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, member, sourceInput } from '../support/fixtures.ts';
import { seedProfessionalGraph, expectResponse as ok } from '../support/talent-v2-maintenance.ts';
import { TALENT_SCHEMA_VERSION as schemaVersion } from '../../packages/core/src/talent-v2-model.ts';

test('TD2-T15 result totals and all-page facets exclude hidden professional facts', async () => {
    const f = await fixture(), p = await seedProfessionalGraph(f.app, f.store, f.clock, f.owner);
    const editor = await member(f, 'td2_hidden_fact_editor');
    const hidden = ok(await editor.client.cmd('POST', '/sources', sourceInput(true)));
    ok(await editor.client.cmd('POST', `/td2/people/${p.personId}/languages`, {
        schemaVersion, expectedPersonRevision: (await p.current()).revision,
        sourceId: hidden.resourceId, sourceRevision: 1, values: { languageCode: 'fr', speakingLevelCode: 'NATIVE' }
    }));
    const full = ok(await f.owner.raw('GET', '/td2/people?mode=TALENT&pageSize=1'), 200);
    assert.equal(full.total, 1); assert.equal(full.facets.languages.en, 1); assert.equal(full.facets.languages.fr, undefined);
    assert.ok(!JSON.stringify(full).includes(hidden.resourceId));
    const filtered = ok(await f.owner.raw('GET', '/td2/people?language=fr'), 200);
    assert.equal(filtered.total, 0); assert.equal(Object.keys(filtered.facets.roles).length, 0);
    assert.equal(ok(await editor.client.raw('GET', '/td2/people?language=fr'), 200).total, 1);
    const last = ok(await f.owner.raw('GET', '/td2/people?mode=TALENT&page=2&pageSize=1'), 200);
    assert.equal(last.items.length, 0); assert.equal(last.total, 1); assert.deepEqual(last.facets, full.facets);
});

test('TD2-T15 industry and work type must match the same work in the selected occupation', async () => {
    const f = await fixture(), p = await seedProfessionalGraph(f.app, f.store, f.clock, f.owner);
    for (const [namespace, code] of [['industry', 'furniture'], ['industry', 'fashion'], ['workType', 'photo'], ['workType', 'video']])
        ok(await f.owner.cmd('POST', '/catalog/items', { namespace, code, labelZh: '合成分类', labelEn: 'Synthetic' }));
    const work = async (industryCode: string, workTypeCode: string, roleCode: string) => {
        const w = ok(await f.owner.cmd('POST', '/works', { title: '合成行业作品', sourceId: p.sourceId, industryCode, workTypeCodes: [workTypeCode] }));
        ok(await f.owner.cmd('POST', `/works/${w.resourceId}/credits`, { expectedRevision: 1, personId: p.personId, roleCode, note: '' }), 200);
    };
    await work('furniture', 'photo', 'model'); await work('fashion', 'video', 'model');
    const q = '/td2/people?mode=TALENT&role=model&industryCode=furniture&workTypeCode=video';
    assert.equal(ok(await f.owner.raw('GET', q), 200).total, 0, 'different works cannot lend fields to each other');
    await work('furniture', 'video', 'translator');
    assert.equal(ok(await f.owner.raw('GET', q), 200).total, 0, 'translator credit is not model experience');
    assert.equal(ok(await f.owner.raw('GET', q.replace('role=model', 'role=translator')), 200).total, 1);
    await work('furniture', 'video', 'model'); assert.equal(ok(await f.owner.raw('GET', q), 200).total, 1);
});

test('TD2-T15 actual collaboration and combined professional filters preserve role context', async () => {
    const f = await fixture(), p = await seedProfessionalGraph(f.app, f.store, f.clock, f.owner);
    const project = ok(await f.owner.cmd('POST', '/projects', { title: '合成现场翻译项目', sourceId: p.sourceId }));
    ok(await f.owner.cmd('POST', `/projects/${project.resourceId}/participants`, {
        expectedRevision: 1, personId: p.personId, roleCode: 'translator', state: 'ACTUAL', note: '合成已完成现场翻译记录'
    }), 200);
    assert.equal(ok(await f.owner.raw('GET', '/td2/people?role=model&actualProject=true'), 200).total, 0);
    assert.equal(ok(await f.owner.raw('GET', '/td2/people?role=translator&actualProject=true'), 200).total, 1);
    const query = '/td2/people?role=model&language=en&languageLevel=WORKING&location=shenzhen&locationRelation=BASE&heightMin=170&collectionType=PORTFOLIO&collectionTag=FASHION';
    const hit = ok(await f.owner.raw('GET', query), 200); assert.equal(hit.total, 1); assert.equal(hit.items[0].id, p.personId);
    assert.equal(ok(await f.owner.raw('GET', query + '&adultState=VERIFIED_ADULT'), 200).total, 0);
});

test('TD2-T15 suspended sources remove search matches and orphan filter qualifiers are rejected', async () => {
    const f = await fixture(), p = await seedProfessionalGraph(f.app, f.store, f.clock, f.owner);
    assert.equal((await f.owner.raw('GET', '/td2/people?locationRelation=BASE')).status, 400);
    ok(await f.owner.cmd('POST', `/sources/${p.sourceId}/suspend`, { expectedRevision: 1, reason: '合成验证依据撤销' }), 200);
    const found = ok(await f.owner.raw('GET', '/td2/people?role=model'), 200);
    assert.equal(found.total, 0); assert.equal(Object.keys(found.facets.languages).length, 0);
});
