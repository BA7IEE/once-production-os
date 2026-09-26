import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, sourceInput } from '../support/fixtures.ts';
import { JsonRebuild } from '../../packages/core/src/rebuild.ts';
import { AppError } from '../../packages/core/src/errors.ts';

type F = Awaited<ReturnType<typeof fixture>>;

function rebuildablePayload() {
    const sourceId = randomUUID();
    const people = Array.from({ length: 10 }, (_, i) => ({
        id: randomUUID(),
        sourceId,
        revision: i + 1,
        data: {
            displayName: 'T29 人才 ' + (i + 1),
            aliases: i === 0 ? ['T29 一号别名'] : [],
            roles: [i % 3 === 0 ? 'photographer' : i % 3 === 1 ? 'editor' : 'model'],
            cityCode: i === 0 ? 'shenzhen' : null,
            languageCodes: i === 0 ? ['zh', 'en'] : [],
            skillCodes: i === 0 ? ['commercial'] : [],
            heightCm: null,
            intro: i === 0 ? '只包含明确导出的简介' : '',
            status: i === 0 ? 'ACTIVE' : 'DRAFT'
        }
    }));
    const works = Array.from({ length: 3 }, (_, i) => ({
        id: randomUUID(),
        sourceId,
        revision: i + 2,
        data: {
            title: 'T29 作品 ' + (i + 1),
            description: i === 0 ? '隔离重建作品' : '',
            industryCode: null,
            workTypeCodes: [],
            origin: 'EXTERNAL',
            originNote: '',
            status: 'DRAFT'
        }
    }));
    const project = {
        id: randomUUID(),
        sourceId,
        revision: 3,
        data: {
            title: 'T29 项目',
            brief: '隔离重建项目',
            locationNote: '',
            dateNote: '',
            reviewNote: '',
            status: 'DRAFT'
        }
    };
    return {
        schemaVersion: 'once-export-v1',
        exportId: randomUUID(),
        frozenAt: '2026-09-23T07:30:00.000Z',
        manifest: {
            schemaVersion: 'once-export-v1',
            frozenAt: '2026-09-23T07:30:00.000Z',
            people,
            works,
            projects: [project],
            sources: [{
                id: sourceId,
                revision: 7,
                protectionEpoch: 4,
                data: {
                    title: 'T29 迁移来源',
                    type: 'MANUAL',
                    providerClaim: '合成 T29 原始提供方说明',
                    basisMode: 'INTERNAL_USE',
                    basisDescription: '合成迁移依据，只用于 T29 自动化测试',
                    validFrom: '2026-09-01T00:00:00.000Z',
                    validUntil: '2026-12-31T00:00:00.000Z',
                    status: 'CONFIRMED'
                }
            }],
            media: [],
            relations: {
                workCredits: [
                    { workId: works[0]!.id, personId: people[0]!.id, roleCode: 'photographer' },
                    { workId: works[1]!.id, personId: people[1]!.id, roleCode: 'editor' },
                    { workId: works[2]!.id, personId: people[2]!.id, roleCode: 'model' }
                ],
                projectParticipants: [
                    { projectId: project.id, personId: people[0]!.id, roleCode: 'photographer', state: 'CONFIRMED' },
                    { projectId: project.id, personId: people[1]!.id, roleCode: 'editor', state: 'NOMINATED' }
                ],
                projectWorks: works.map(work => ({ projectId: project.id, workId: work.id, relation: 'REFERENCE' }))
            }
        }
    };
}

async function context(f: F) {
    const rebuild = new JsonRebuild(f.clock);
    const actor = await f.store.transaction(tx => rebuild.actorFromTarget(tx, 'owner'));
    return { rebuild, actor };
}
async function preview(f: F, payload: unknown) {
    const { rebuild, actor } = await context(f);
    return f.store.transaction(tx => rebuild.preview(tx, actor, payload));
}
async function apply(f: F, payload: unknown) {
    const { rebuild, actor } = await context(f);
    return f.store.transaction(tx => rebuild.apply(tx, actor, payload, { requestId: randomUUID(), ip: 'CLI' }));
}
function businessCounts(f: F) {
    return {
        sources: f.store.rows('sources').length,
        history: f.store.rows('sourceHistory').length,
        people: f.store.rows('people').length,
        works: f.store.rows('works').length,
        credits: f.store.rows('workCredits').length,
        projects: f.store.rows('projects').length,
        participants: f.store.rows('projectParticipants').length,
        projectWorks: f.store.rows('projectWorks').length
    };
}

test('DEV-07H T29 preview is zero-write and accepts a closed 10 people / 3 works / 1 project graph', async () => {
    const f = await fixture();
    const payload = rebuildablePayload();
    const before = businessCounts(f);
    const summary = await preview(f, payload);
    assert.deepEqual(businessCounts(f), before);
    assert.equal(summary.schemaVersion, 'once-export-v1');
    assert.equal(summary.exportId, payload.exportId);
    assert.equal(summary.inputDigest.length, 64);
    assert.deepEqual(summary.counts, {
        sources: 1, people: 10, works: 3, projects: 1,
        workCredits: 3, projectParticipants: 2, projectWorks: 3, mediaIdentities: 0
    });
    assert.equal(summary.mediaRestored, 0);
});

test('DEV-07H T29 apply preserves exported business ids and relations while rebinding target ownership/scope', async () => {
    const f = await fixture();
    const payload = rebuildablePayload();
    const usersBefore = f.store.rows('users').length;
    const membersBefore = f.store.rows('memberships').length;
    const sessionsBefore = f.store.rows('sessions').length;
    const auditsBefore = f.store.rows('audits').length;

    const summary = await apply(f, payload);
    assert.equal(summary.counts.people, 10);
    assert.equal(f.store.rows('sources')[0]!.id, payload.manifest.sources[0]!.id);
    assert.deepEqual(new Set(f.store.rows('people').map(x => x.id)), new Set(payload.manifest.people.map(x => x.id)));
    assert.deepEqual(new Set(f.store.rows('works').map(x => x.id)), new Set(payload.manifest.works.map(x => x.id)));
    assert.equal(f.store.rows('projects')[0]!.id, payload.manifest.projects[0]!.id);

    const workspaceScope = f.store.rows('scopes').find(x => x.mode === 'WORKSPACE')!;
    const admin = f.store.rows('memberships')[0]!;
    assert.ok(f.store.rows('sources').every(x => x.scopeId === workspaceScope.id && x.maintainerId === admin.id));
    assert.ok(f.store.rows('people').every(x => x.scopeId === workspaceScope.id && x.maintainerId === admin.id));
    assert.ok(f.store.rows('works').every(x => x.scopeId === workspaceScope.id && x.maintainerId === admin.id));
    assert.ok(f.store.rows('projects').every(x => x.scopeId === workspaceScope.id && x.maintainerId === admin.id));

    const source = f.store.rows('sources')[0]!;
    assert.equal(source.textPayload, '');
    assert.equal(source.reviewedBy, admin.id);
    assert.equal(source.protectionEpoch, payload.manifest.sources[0]!.protectionEpoch + 1);
    const history = f.store.rows('sourceHistory');
    assert.equal(history.length, 1);
    assert.equal(history[0]!.action, 'BASELINE');
    assert.equal(history[0]!.baselineOnly, true);
    assert.equal(history[0]!.sourceRevision, source.revision);
    assert.equal(history[0]!.decisionReason, null);
    assert.equal(history[0]!.actorId, null);

    assert.equal(f.store.rows('workCredits').length, 3);
    assert.equal(f.store.rows('projectParticipants').length, 2);
    assert.equal(f.store.rows('projectWorks').length, 3);
    assert.ok(f.store.rows('workCredits').every(x => x.note === ''));
    assert.ok(f.store.rows('projectParticipants').every(x => x.note === ''));

    assert.equal(f.store.rows('users').length, usersBefore);
    assert.equal(f.store.rows('memberships').length, membersBefore);
    assert.equal(f.store.rows('sessions').length, sessionsBefore);
    assert.equal(f.store.rows('contacts').length, 0);
    assert.equal(f.store.rows('evidence').length, 0);
    assert.equal(f.store.rows('exports').length, 0);
    assert.equal(f.store.rows('receipts').length, 0);
    assert.equal(f.store.rows('audits').length, auditsBefore + 1);
    assert.equal(f.store.rows('audits').at(-1)!.action, 'rebuild.apply');
    assert.equal(f.store.rows('audits').at(-1)!.resourceKind, 'rebuild-export');
    assert.equal(f.store.rows('audits').at(-1)!.resourceId, payload.exportId);

    const restored = await f.owner.raw('GET', '/people/' + payload.manifest.people[0]!.id);
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
});

test('DEV-07H T29 rejects non-rebuildable missing or unknown fields before any write', async () => {
    for (const mutate of [
        (p: any) => { delete p.manifest.sources[0].data.providerClaim; },
        (p: any) => { p.manifest.people[0].data.passwordHash = 'must-never-be-imported'; }
    ]) {
        const f = await fixture();
        const payload: any = rebuildablePayload();
        mutate(payload);
        await assert.rejects(apply(f, payload), (e: unknown) => e instanceof AppError && e.code === 'VALIDATION_FAILED');
        assert.deepEqual(businessCounts(f), { sources: 0, history: 0, people: 0, works: 0, credits: 0, projects: 0, participants: 0, projectWorks: 0 });
    }
});

test('DEV-07H T29 rejects missing source closure, unknown target catalog codes, ACTUAL-without-note and ACTIVE work without bytes', async () => {
    const cases: Array<[string, (p: any) => void]> = [
        ['REBUILD_SOURCE_MISSING', p => { p.manifest.people[0].sourceId = randomUUID(); }],
        ['REBUILD_CATALOG_MISSING', p => { p.manifest.people[0].data.roles = ['unknown_role']; }],
        ['REBUILD_RELATION_DETAIL_MISSING', p => { p.manifest.relations.projectParticipants[0].state = 'ACTUAL'; }],
        ['REBUILD_MEDIA_BYTES_REQUIRED', p => { p.manifest.works[0].data.status = 'ACTIVE'; }]
    ];
    for (const [code, mutate] of cases) {
        const f = await fixture();
        const payload: any = rebuildablePayload();
        mutate(payload);
        await assert.rejects(apply(f, payload), (e: unknown) => e instanceof AppError && e.code === code);
        assert.equal(f.store.rows('people').length, 0);
        assert.equal(f.store.rows('sources').length, 0);
    }
});

test('DEV-07H T29 refuses to merge into an already-used target', async () => {
    const f = await fixture();
    const created = await f.owner.cmd('POST', '/people', {
        displayName: '目标已有业务数据', roles: ['model'], inlineSource: sourceInput()
    });
    assert.equal(created.status, 201);
    const before = businessCounts(f);
    await assert.rejects(preview(f, rebuildablePayload()), (e: unknown) => e instanceof AppError && e.code === 'REBUILD_TARGET_NOT_EMPTY');
    assert.deepEqual(businessCounts(f), before);
});

test('DEV-07H T29 cannot bypass normal per-work or per-project relationship limits', async () => {
    const f = await fixture();
    const payload: any = rebuildablePayload();
    const roles = ['model','photographer','editor','makeup','director','stylist','producer','cinematographer'];
    const rows = [];
    for (const person of payload.manifest.people) {
        for (const roleCode of roles) rows.push({ workId: payload.manifest.works[0].id, personId: person.id, roleCode });
    }
    payload.manifest.relations.workCredits = rows.slice(0, 51);
    await assert.rejects(preview(f, payload), (e: unknown) => e instanceof AppError && e.code === 'REBUILD_ROOT_RELATION_LIMIT');

    const f2 = await fixture();
    const payload2: any = rebuildablePayload();
    const sourceId = payload2.manifest.sources[0].id;
    payload2.manifest.media = Array.from({ length: 31 }, (_, position) => ({
        id: randomUUID(), workId: payload2.manifest.works[0].id, position, isCover: position === 0,
        sourceId, revision: 1, fileName: 'm-' + position + '.png', mime: 'image/png',
        bytes: 12, sha256: position.toString(16).padStart(64, '0'), width: 2, height: 3
    }));
    await assert.rejects(preview(f2, payload2), (e: unknown) => e instanceof AppError && e.code === 'REBUILD_ROOT_MEDIA_LIMIT');
});

test('DEV-07H T29 rejects states normal record APIs would not create', async () => {
    for (const [code, mutate] of [
        ['REBUILD_DUPLICATE_CODE', (p: any) => { p.manifest.people[0].data.roles = ['model','model']; }],
        ['REBUILD_DUPLICATE_CODE', (p: any) => { p.manifest.people[0].data.languageCodes = ['zh','zh']; }],
        ['REBUILD_DUPLICATE_CODE', (p: any) => { p.manifest.works[0].data.workTypeCodes = ['product_photo','product_photo']; }],
        ['REBUILD_TITLE_REQUIRED', (p: any) => { p.manifest.works[0].data.title = '   '; }],
        ['REBUILD_TITLE_REQUIRED', (p: any) => { p.manifest.projects[0].data.title = '   '; }]
    ] as Array<[string, (p: any) => void]>) {
        const f = await fixture();
        const payload: any = rebuildablePayload();
        mutate(payload);
        await assert.rejects(preview(f, payload), (e: unknown) => e instanceof AppError && e.code === code);
    }
});

test('DEV-07H T29 media identity permits cross-work reuse but rejects duplicate links and order gaps', async () => {
    const sharedAssetId = randomUUID();

    {
        const f = await fixture();
        const payload: any = rebuildablePayload();
        const sourceId = payload.manifest.sources[0].id;
        const media = (workId: string, position: number) => ({
            id: sharedAssetId, workId, position, isCover: true, sourceId, revision: 1,
            fileName: 'shared.png', mime: 'image/png', bytes: 12, sha256: 'a'.repeat(64), width: 2, height: 3
        });
        payload.manifest.media = [media(payload.manifest.works[0].id, 0), media(payload.manifest.works[1].id, 0)];
        const summary = await preview(f, payload);
        assert.equal(summary.counts.mediaIdentities, 2);
        assert.equal(summary.mediaRestored, 0);
    }

    {
        const f = await fixture();
        const payload: any = rebuildablePayload();
        const sourceId = payload.manifest.sources[0].id;
        const first = {
            id: sharedAssetId, workId: payload.manifest.works[0].id, position: 0, isCover: true,
            sourceId, revision: 1, fileName: 'shared.png', mime: 'image/png', bytes: 12,
            sha256: 'd'.repeat(64), width: 2, height: 3
        };
        payload.manifest.media = [first, { ...first, workId: payload.manifest.works[1].id, sha256: 'e'.repeat(64) }];
        await assert.rejects(preview(f, payload), (e: unknown) => e instanceof AppError && e.code === 'REBUILD_MEDIA_IDENTITY_CONFLICT');
    }

    {
        const f = await fixture();
        const payload: any = rebuildablePayload();
        const sourceId = payload.manifest.sources[0].id;
        const workId = payload.manifest.works[0].id;
        const base = {
            id: sharedAssetId, workId, isCover: false, sourceId, revision: 1,
            fileName: 'duplicate.png', mime: 'image/png', bytes: 12, sha256: 'b'.repeat(64), width: 2, height: 3
        };
        payload.manifest.media = [{ ...base, position: 0 }, { ...base, position: 1 }];
        await assert.rejects(preview(f, payload), (e: unknown) => e instanceof AppError && e.code === 'REBUILD_DUPLICATE_MEDIA_LINK');
    }

    {
        const f = await fixture();
        const payload: any = rebuildablePayload();
        const sourceId = payload.manifest.sources[0].id;
        payload.manifest.media = [{
            id: randomUUID(), workId: payload.manifest.works[0].id, position: 1, isCover: false, sourceId, revision: 1,
            fileName: 'gap.png', mime: 'image/png', bytes: 12, sha256: 'c'.repeat(64), width: 2, height: 3
        }];
        await assert.rejects(preview(f, payload), (e: unknown) => e instanceof AppError && e.code === 'REBUILD_MEDIA_ORDER_INVALID');
    }
});

test('DEV-07H T29 allows target-local catalog preparation through normal commands', async () => {
    const f = await fixture();
    const industry = await f.owner.cmd('POST', '/catalog/items', {
        namespace: 'industry', code: 'rebuild_industry', labelZh: '重建行业', labelEn: 'Rebuild industry'
    });
    const workType = await f.owner.cmd('POST', '/catalog/items', {
        namespace: 'workType', code: 'rebuild_work_type', labelZh: '重建作品类型', labelEn: 'Rebuild work type'
    });
    assert.equal(industry.status, 201);
    assert.equal(workType.status, 201);
    assert.ok(f.store.rows('receipts').length >= 2, 'normal catalog preparation writes command receipts');

    const payload: any = rebuildablePayload();
    payload.manifest.works[0].data.industryCode = 'rebuild_industry';
    payload.manifest.works[0].data.workTypeCodes = ['rebuild_work_type'];
    const summary = await apply(f, payload);
    assert.equal(summary.counts.works, 3);
    assert.equal(f.store.rows('works')[0]!.industryCode, 'rebuild_industry');
    assert.deepEqual(f.store.rows('works')[0]!.workTypeCodes, ['rebuild_work_type']);
});

test('DEV-07H T29 audit failure rolls the complete rebuild transaction back', async () => {
    const f = await fixture();
    const beforeAudits = f.store.rows('audits').length;
    f.store.failNextAudit = true;
    await assert.rejects(apply(f, rebuildablePayload()), /injected audit failure/);
    assert.deepEqual(businessCounts(f), { sources: 0, history: 0, people: 0, works: 0, credits: 0, projects: 0, participants: 0, projectWorks: 0 });
    assert.equal(f.store.rows('audits').length, beforeAudits);
});

test('DEV-07H T29 cannot be replayed into the same target after a successful rebuild', async () => {
    const f = await fixture();
    const payload = rebuildablePayload();
    await apply(f, payload);
    const after = businessCounts(f);
    await assert.rejects(apply(f, payload), (e: unknown) => e instanceof AppError && e.code === 'REBUILD_TARGET_NOT_EMPTY');
    assert.deepEqual(businessCounts(f), after);
});
