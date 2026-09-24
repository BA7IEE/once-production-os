/** WP1 real-database contracts called after the existing suite. No DB reset or new workspace login. */
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { Application } from '../../packages/core/src/api.ts';
import type { Config, Table } from '../../packages/core/src/model.ts';
import type { PrismaStore } from '../../apps/api/src/prisma-store.ts';
import { Client, FakeClock, sourceInput, result } from '../support/fixtures.ts';
import { FaultStore } from '../support/fault-store.ts';
type Context = {
    a: PrismaClient;
    b: PrismaClient;
    storeA: PrismaStore;
    ownerA: Client;
    ownerB: Client;
    appA: Application;
    config: Config;
    clock: FakeClock;
    identity: {
        workspaceId: string;
        membershipId: string;
    };
};
export async function runProductionContracts(t: TestContext, c: Context) {
    const { a, b, storeA, ownerA, ownerB, appA, config, clock, identity } = c;
    const ok = async (p: ReturnType<Client['raw']>, status = 200) => { const r = await p; assert.equal(r.status, status, JSON.stringify(r.body)); return result(r); };
    const get = (path: string) => ok(ownerA.raw('GET', path));
    const root = async (kind: 'works' | 'projects', extra: Record<string, unknown> = {}) => (await ok(ownerA.cmd('POST', '/' + kind, { title: 'WP1 PG ' + kind, inlineSource: sourceInput(), ...extra }), 201)).resourceId as string;
    const modify = async (path: string, suffix: string, body: Record<string, unknown>) => { const row = await get(path); return ok(ownerA.cmd(suffix ? 'POST' : 'PATCH', path + suffix, { expectedRevision: row.revision, ...body })); };
    const workId = await root('works'), projectId = await root('projects');
    const personId = (await ok(ownerA.cmd('POST', '/people', { displayName: 'WP1 PG contributor', roles: ['model', 'editor'], inlineSource: sourceInput() }), 201)).resourceId as string;
    const image = async () => {
        const person = await a.person.findUniqueOrThrow({ where: { id: personId } }), s = await a.sourceRecord.findUniqueOrThrow({ where: { id: person.sourceId } }), hash = 'c'.repeat(64);
        const id = (await ok(ownerA.cmd('POST', '/uploads', { sourceId: s.id, personId, expectedSourceRevision: s.revision, fileName: 'wp-synthetic.png', mime: 'image/png', expectedBytes: 12, sha256: hash }), 201)).resourceId as string;
        await storeA.transaction(async (tx) => { const actor = await appA.identity.authenticate(tx, ownerA.jar.once_session!), u = await appA.media.beginReceive(tx, actor, id, 12); await appA.media.finishReceive(tx, actor, id, u.receiveToken!, 12, hash); });
        const u = await a.mediaUpload.findUniqueOrThrow({ where: { id } });
        await ok(ownerA.cmd('POST', '/uploads/' + id + '/complete', { expectedRevision: u.revision }), 202);
        const claim = (await appA.media.claim())!;
        assert.equal(claim.id, id);
        await appA.media.finish(claim, { mime: 'image/png', sha256: hash, bytes: 12, width: 2, height: 3, previewBytes: 10, previewHash: 'd'.repeat(64) });
        return id;
    };
    const asset1 = await image(), asset2 = await image();
    await t.test('WP1 PG identical create commands on independent clients make one root/source/receipt', async () => {
        const key = randomUUID(), body = { title: 'WP1 concurrent root', inlineSource: sourceInput() }, before = await a.sourceRecord.count();
        const [x, y] = await Promise.all([ok(ownerA.cmd('POST', '/works', body, key), 201), ok(ownerB.cmd('POST', '/works', body, key), 201)]);
        assert.equal(x.resourceId, y.resourceId);
        assert.equal(Number(x.replayed) + Number(y.replayed), 1);
        assert.equal(await a.sourceRecord.count(), before + 1);
        assert.equal(await a.commandReceipt.count({ where: { commandKey: key } }), 1);
    });
    await t.test('WP1 PG concurrent child writes require same-parent CAS; retry old key does not write twice', async () => {
        const body = { expectedRevision: 1, assetId: asset1 }, key = randomUUID();
        const [x, y] = await Promise.all([ownerA.cmd('POST', '/works/' + workId + '/assets', body, key), ownerB.cmd('POST', '/works/' + workId + '/assets', { expectedRevision: 1, assetId: asset2 })]);
        assert.deepEqual([x.status, y.status].sort(), [200, 409]);
        const w = await a.work.findUniqueOrThrow({ where: { id: workId } });
        assert.equal(w.revision, 2);
        assert.equal(await a.workAsset.count({ where: { workId } }), 1);
        const winner = x.status === 200 ? asset1 : asset2;
        await modify('/works/' + workId, '/assets', { assetId: winner === asset1 ? asset2 : asset1 });
        if (x.status === 200) {
            assert.equal((await ok(ownerA.cmd('POST', '/works/' + workId + '/assets', body, key))).replayed, true);
            assert.equal(await a.workAsset.count({ where: { workId } }), 2);
        }
    });
    await t.test('WP1 PG swaps deferred positions and validates cover belongs to this work at commit', async () => {
        const all = await a.workAsset.findMany({ where: { workId }, orderBy: { position: 'asc' } });
        assert.equal(all.length, 2);
        await modify('/works/' + workId, '/assets/reorder', { entryIds: all.map(e => e.id).reverse(), coverEntryId: all[1]!.id });
        assert.deepEqual((await a.workAsset.findMany({ where: { workId }, orderBy: { position: 'asc' } })).map(e => e.id), all.map(e => e.id).reverse());
        const second = await root('works');
        await modify('/works/' + second, '/assets', { assetId: asset1 });
        const alien = await a.workAsset.findFirstOrThrow({ where: { workId: second } }), before = await a.work.findUniqueOrThrow({ where: { id: workId } });
        await assert.rejects(a.$transaction(async (tx) => { await tx.work.update({ where: { id: workId }, data: { coverEntryId: alien.id } }); }));
        assert.deepEqual(await a.work.findUniqueOrThrow({ where: { id: workId } }), before);
        await assert.rejects(a.$transaction(async (tx) => { await tx.workAsset.update({ where: { id: all[0]!.id }, data: { position: 0 } }); await tx.workAsset.update({ where: { id: all[1]!.id }, data: { position: 0 } }); }));
        assert.deepEqual((await a.workAsset.findMany({ where: { workId }, orderBy: { position: 'asc' } })).map(e => e.position), [0, 1]);
    });
    await t.test('WP1 PG removal compacts order, changes cover, but preserves original media', async () => {
        let w = await get('/works/' + workId);
        await modify('/works/' + workId, '', { status: 'ACTIVE' });
        const cover = w.items.find((e: any) => e.isCover);
        await modify('/works/' + workId, '/assets/remove', { entryId: cover.id });
        w = await get('/works/' + workId);
        assert.equal(w.items.length, 1);
        assert.equal(w.items[0].position, 0);
        assert.equal(w.items[0].isCover, true);
        await modify('/works/' + workId, '/assets/remove', { entryId: w.items[0].id });
        w = await get('/works/' + workId);
        assert.equal(w.status, 'DRAFT');
        assert.equal(w.items.length, 0);
        assert.equal(await a.mediaAsset.count({ where: { id: { in: [asset1, asset2] } } }), 2);
    });
    await t.test('WP1 PG relationship uniqueness, state checks and workspace FKs are enforced by PostgreSQL', async () => {
        await modify('/works/' + workId, '/credits', { personId, roleCode: 'model', note: 'manual credit' });
        const credit = await a.workCredit.findFirstOrThrow({ where: { workId } });
        await assert.rejects(a.workCredit.create({ data: { ...credit, id: randomUUID() } }));
        await modify('/projects/' + projectId, '/participants', { personId, roleCode: 'model', state: 'ACTUAL', note: 'actually performed synthetic photography' });
        const part = await a.projectParticipant.findFirstOrThrow({ where: { projectId } });
        await assert.rejects(a.projectParticipant.update({ where: { id: part.id }, data: { note: '' } }));
        await assert.rejects(a.projectParticipant.create({ data: { ...part, id: randomUUID() } }));
        const foreignPerson = await a.person.findFirst({ where: { workspaceId: { not: identity.workspaceId } } });
        if (foreignPerson)
            await assert.rejects(a.projectParticipant.create({ data: { ...part, id: randomUUID(), personId: foreignPerson.id } }));
        const foreignScope = await a.accessScope.findFirstOrThrow({ where: { workspaceId: { not: identity.workspaceId } } });
        await assert.rejects(a.work.update({ where: { id: workId }, data: { scopeId: foreignScope.id } }));
        await assert.rejects(a.work.update({ where: { id: workId }, data: { origin: 'ONCE', originNote: '' } }));
        assert.equal((await get('/people/' + personId + '/production')).actualProjectCount, 1);
    });
    await t.test('WP1 PG external work reference/delivery remains external; source loss redacts live children', async () => {
        const w = await root('works', { origin: 'EXTERNAL' });
        await modify('/projects/' + projectId, '/works', { workId: w, relation: 'REFERENCE' });
        await modify('/projects/' + projectId, '/works', { workId: w, relation: 'DELIVERABLE' });
        assert.equal((await a.work.findUniqueOrThrow({ where: { id: w } })).origin, 'EXTERNAL');
        assert.equal(await a.projectWork.count({ where: { projectId, workId: w } }), 1);
        assert.equal(await a.workCredit.count({ where: { workId: w } }), 0);
        const source = await a.sourceRecord.findUniqueOrThrow({ where: { id: (await a.work.findUniqueOrThrow({ where: { id: w } })).sourceId } });
        await ok(ownerA.cmd('POST', '/sources/' + source.id + '/suspend', { expectedRevision: source.revision, reason: 'synthetic suspension' }));
        const view = await get('/projects/' + projectId);
        assert.equal(view.works.find((e: any) => e.work === null)?.relation, null);
        assert.ok(!JSON.stringify(view).includes(w));
    });
    const failingCommand = async (stage: Table, path: string, body: Record<string, unknown>, rootKind: 'works' | 'projects', rootId: string) => {
        const faults = new FaultStore(storeA);
        let fired = false;
        faults.afterInsert = table => { if (table === stage && !fired) {
            fired = true;
            throw new Error('WP1 deliberate post-write failure');
        } };
        const app = new Application(faults, config, clock), client = new Client(app);
        client.jar = { ...ownerA.jar };
        client.csrf = ownerA.csrf;
        const snapshot = async () => ({ works: await a.work.findMany({ orderBy: { id: 'asc' } }), projects: await a.project.findMany({ orderBy: { id: 'asc' } }), assets: await a.workAsset.findMany({ orderBy: { id: 'asc' } }), credits: await a.workCredit.findMany({ orderBy: { id: 'asc' } }), participants: await a.projectParticipant.findMany({ orderBy: { id: 'asc' } }), links: await a.projectWork.findMany({ orderBy: { id: 'asc' } }), audit: await a.auditEvent.count(), receipts: await a.commandReceipt.count() });
        const before = await snapshot(), key = randomUUID();
        const r = await client.cmd('POST', path, body, key);
        assert.ok(r.status >= 500, JSON.stringify(r.body));
        assert.ok(fired, 'real ' + stage + ' insertion must occur before failure');
        assert.deepEqual(await snapshot(), before);
        await ok(ownerA.cmd('POST', path, body, key));
        assert.equal(await a.commandReceipt.count({ where: { commandKey: key } }), 1);
    };
    for (const stage of ['workAssets', 'audits', 'receipts'] as const) {
        await t.test('WP1 PG link/cover/root/audit/receipt roll back after ' + stage, async () => { const w = await root('works'); await failingCommand(stage, '/works/' + w + '/assets', { expectedRevision: 1, assetId: asset1 }, 'works', w); });
    }
    for (const stage of ['workCredits', 'projectParticipants', 'projectWorks'] as const) {
        await t.test('WP1 PG child insertion failure rolls back its parent revision: ' + stage, async () => {
            if (stage === 'workCredits') {
                const w = await root('works');
                await failingCommand(stage, '/works/' + w + '/credits', { expectedRevision: 1, personId, roleCode: 'editor', note: 'synthetic' }, 'works', w);
            }
            else {
                const p = await root('projects');
                await failingCommand(stage, '/projects/' + p + (stage === 'projectParticipants' ? '/participants' : '/works'), stage === 'projectParticipants' ? { expectedRevision: 1, personId, roleCode: 'editor', state: 'NOMINATED', note: '' } : { expectedRevision: 1, workId, relation: 'REFERENCE' }, 'projects', p);
            }
        });
    }
    await t.test('DEV-06 PG work facts are constrained and power visible credited-work search', async () => {
        await ok(ownerA.cmd('POST', '/catalog/items', { namespace: 'industry', code: 'furniture', labelZh: '家具', labelEn: 'Furniture' }), 201);
        await ok(ownerA.cmd('POST', '/catalog/items', { namespace: 'workType', code: 'product_photo', labelZh: '产品摄影', labelEn: 'Product photography' }), 201);
        const w = await root('works', { industryCode: 'furniture', workTypeCodes: ['product_photo'] });
        await modify('/works/' + w, '/credits', { personId, roleCode: 'model', note: 'synthetic fact credit' });
        const search = result(await ownerA.raw('GET', '/talent-search?industryCode=furniture&workTypeCode=product_photo'));
        assert.ok(search.items.some((x: any) => x.id === personId));
        assert.ok(search.items.find((x: any) => x.id === personId).match.some((x: any) => x.field === 'industryCode'));
        const before = await a.work.findUniqueOrThrow({ where: { id: w } });
        await assert.rejects(a.work.update({ where: { id: w }, data: { industryCode: 'INVALID SPACE' } }));
        await assert.rejects(a.work.update({ where: { id: w }, data: { workTypeCodes: Array.from({ length: 11 }, (_, i) => 'type_' + i) } }));
        assert.deepEqual(await a.work.findUniqueOrThrow({ where: { id: w } }), before);
    });
    await t.test('DEV-06 PG shortlist exact work-asset FK rejects cross-work selections', async () => {
        let work = await get('/works/' + workId);
        if (!work.items.length)
            await modify('/works/' + workId, '/assets', { assetId: asset1 });
        work = await get('/works/' + workId);
        const scope = await a.accessScope.findFirstOrThrow({ where: { workspaceId: identity.workspaceId, mode: 'WORKSPACE' } });
        const listId = (await ok(ownerA.cmd('POST', '/shortlists', { title: 'DEV06 PG exact FK', brief: 'synthetic', scopeId: scope.id }), 201)).resourceId as string;
        await ok(ownerA.cmd('POST', '/shortlists/' + listId + '/items', { expectedRevision: 1, personId, workId,
            workAssetIds: [work.items[0].id], note: 'synthetic shortlist selection' }));
        const item = await a.shortlistItem.findFirstOrThrow({ where: { shortlistId: listId } });
        const second = await root('works');
        await modify('/works/' + second, '/credits', { personId, roleCode: 'model', note: 'synthetic second credit' });
        await modify('/works/' + second, '/assets', { assetId: asset1 });
        const alien = await a.workAsset.findFirstOrThrow({ where: { workId: second } });
        await assert.rejects(a.shortlistItemAsset.create({ data: {
            id: randomUUID(), workspaceId: identity.workspaceId, createdAt: clock.now(), updatedAt: clock.now(), revision: 1,
            itemId: item.id, assetId: alien.assetId, workId, workAssetId: alien.id, position: 1
        } }));
        assert.equal(await a.shortlistItemAsset.count({ where: { itemId: item.id } }), 1);
    });
    await t.test('DEV-06 PG unlinking a work image removes only derived shortlist selection and preserves media/item', async () => {
        const scope = await a.accessScope.findFirstOrThrow({ where: { workspaceId: identity.workspaceId, mode: 'WORKSPACE' } });
        const w = await root('works');
        await modify('/works/' + w, '/credits', { personId, roleCode: 'model', note: 'synthetic shortlist unlink credit' });
        await modify('/works/' + w, '/assets', { assetId: asset2 });
        const beforeWork = await get('/works/' + w);
        const workEntry = beforeWork.items[0];
        const listId = (await ok(ownerA.cmd('POST', '/shortlists', { title: 'DEV06 PG unlink', brief: '', scopeId: scope.id }), 201)).resourceId as string;
        await ok(ownerA.cmd('POST', '/shortlists/' + listId + '/items', { expectedRevision: 1, personId, workId: w,
            workAssetIds: [workEntry.id], note: 'derived selection should disappear on unlink' }));
        const item = await a.shortlistItem.findFirstOrThrow({ where: { shortlistId: listId } });
        assert.equal(await a.shortlistItemAsset.count({ where: { itemId: item.id } }), 1);
        assert.equal(await a.mediaAsset.count({ where: { id: asset2 } }), 1);
        await modify('/works/' + w, '/assets/remove', { entryId: workEntry.id });
        assert.equal(await a.workAsset.count({ where: { id: workEntry.id } }), 0);
        assert.equal(await a.shortlistItemAsset.count({ where: { itemId: item.id } }), 0);
        assert.equal(await a.mediaAsset.count({ where: { id: asset2 } }), 1);
        assert.equal(await a.shortlistItem.count({ where: { id: item.id } }), 1);
        const view = await get('/shortlists/' + listId);
        assert.equal(view.items[0].unavailable, false);
        assert.deepEqual(view.items[0].selectedAssets, []);
        assert.equal(view.items[0].updatedSinceAdded, true);
    });
    await t.test('DEV-06 PG concurrent shortlist mutations serialize on root CAS', async () => {
        const scope = await a.accessScope.findFirstOrThrow({ where: { workspaceId: identity.workspaceId, mode: 'WORKSPACE' } });
        const listId = (await ok(ownerA.cmd('POST', '/shortlists', { title: 'DEV06 PG CAS', brief: '', scopeId: scope.id }), 201)).resourceId as string;
        const body = { expectedRevision: 1, personId, workAssetIds: [], note: 'concurrent synthetic candidate' };
        const [x, y] = await Promise.all([ownerA.cmd('POST', '/shortlists/' + listId + '/items', body), ownerB.cmd('POST', '/shortlists/' + listId + '/items', body)]);
        assert.deepEqual([x.status, y.status].sort(), [200, 409]);
        assert.equal(await a.shortlistItem.count({ where: { shortlistId: listId } }), 1);
        assert.equal((await a.shortlist.findUniqueOrThrow({ where: { id: listId } })).revision, 2);
    });
    for (const stage of ['shortlistItems', 'shortlistItemAssets', 'audits', 'receipts'] as const) {
        await t.test('DEV-06 PG candidate command rolls back after ' + stage, async () => {
            const scope = await a.accessScope.findFirstOrThrow({ where: { workspaceId: identity.workspaceId, mode: 'WORKSPACE' } });
            const listId = (await ok(ownerA.cmd('POST', '/shortlists', { title: 'DEV06 rollback ' + stage, brief: '', scopeId: scope.id }), 201)).resourceId as string;
            let work = await get('/works/' + workId);
            if (!work.items.length)
                await modify('/works/' + workId, '/assets', { assetId: asset1 });
            work = await get('/works/' + workId);
            const before = {
                root: await a.shortlist.findUniqueOrThrow({ where: { id: listId } }),
                items: await a.shortlistItem.count({ where: { shortlistId: listId } }),
                assets: await a.shortlistItemAsset.count(),
                audits: await a.auditEvent.count(),
                receipts: await a.commandReceipt.count()
            };
            const faults = new FaultStore(storeA);
            let fired = false;
            faults.afterInsert = table => {
                if (table === stage && !fired) {
                    fired = true;
                    throw new Error('DEV06 deliberate post-write failure');
                }
            };
            const app = new Application(faults, config, clock), client = new Client(app);
            client.jar = { ...ownerA.jar };
            client.csrf = ownerA.csrf;
            const body = { expectedRevision: 1, personId, workId, workAssetIds: [work.items[0].id], note: 'rollback synthetic' };
            const key = randomUUID();
            const failed = await client.cmd('POST', '/shortlists/' + listId + '/items', body, key);
            assert.ok(failed.status >= 500, JSON.stringify(failed.body));
            assert.ok(fired);
            assert.deepEqual(await a.shortlist.findUniqueOrThrow({ where: { id: listId } }), before.root);
            assert.equal(await a.shortlistItem.count({ where: { shortlistId: listId } }), before.items);
            assert.equal(await a.shortlistItemAsset.count(), before.assets);
            assert.equal(await a.auditEvent.count(), before.audits);
            assert.equal(await a.commandReceipt.count(), before.receipts);
            await ok(ownerA.cmd('POST', '/shortlists/' + listId + '/items', body, key));
            assert.equal(await a.shortlistItem.count({ where: { shortlistId: listId } }), 1);
            assert.equal(await a.commandReceipt.count({ where: { commandKey: key } }), 1);
        });
    }

    await t.test('DEV-07A PG typed export permissions reject wrong-source subjects and unregistered fields', async () => {
        const person = await a.person.findUniqueOrThrow({ where: { id: personId } });
        const foreignSourceId = (await ok(ownerA.cmd('POST', '/sources', sourceInput()), 201)).resourceId as string;
        const now = clock.now();
        await assert.rejects(a.usePermission.create({ data: {
            id: randomUUID(), workspaceId: identity.workspaceId, createdAt: now, updatedAt: now, revision: 1,
            sourceId: foreignSourceId, subjectKind: 'PERSON', subjectId: personId, purpose: 'INTERNAL_EXPORT',
            fields: ['person.displayName'], validFrom: now, validUntil: new Date(now.getTime() + 3600000),
            status: 'ACTIVE', evidenceNote: 'synthetic wrong source permission', reviewerId: identity.membershipId,
            subjectPersonId: personId, subjectWorkId: null, subjectProjectId: null, subjectAssetId: null, subjectSourceId: null
        } }));
        await assert.rejects(a.usePermission.create({ data: {
            id: randomUUID(), workspaceId: identity.workspaceId, createdAt: now, updatedAt: now, revision: 1,
            sourceId: person.sourceId, subjectKind: 'PERSON', subjectId: personId, purpose: 'INTERNAL_EXPORT',
            fields: ['person.secretField'], validFrom: now, validUntil: new Date(now.getTime() + 3600000),
            status: 'ACTIVE', evidenceNote: 'synthetic forbidden export field', reviewerId: identity.membershipId,
            subjectPersonId: personId, subjectWorkId: null, subjectProjectId: null, subjectAssetId: null, subjectSourceId: null
        } }));
        const member = await a.membership.findUniqueOrThrow({ where: { id: identity.membershipId } });
        await assert.rejects(a.membership.update({ where: { id: member.id }, data: { extraPermissions: [...member.extraPermissions, 'unregistered.permission'] } }));
    });

    await t.test('DEV-07A PG export freezes exact dependency and worker produces private JSON payload', async () => {
        const person = await a.person.findUniqueOrThrow({ where: { id: personId } });
        const permit = (await ok(ownerA.cmd('POST', '/use-permissions', {
            sourceId: person.sourceId, subjectKind: 'PERSON', subjectId: personId,
            fields: ['person.displayName', 'person.roles'], validUntil: new Date(clock.now().getTime() + 86400000).toISOString(),
            evidenceNote: 'synthetic approved internal export'
        }), 201)).resourceId as string;
        const exportId = (await ok(ownerA.cmd('POST', '/exports', {
            format: 'JSON', selectedIds: { people: [personId], works: [], projects: [] },
            fields: ['person.displayName', 'person.roles'], usePermissionRefs: [permit]
        }), 202)).resourceId as string;
        assert.equal(await a.exportDependency.count({ where: { exportId } }), 1);
        const dependency = await a.exportDependency.findFirstOrThrow({ where: { exportId } });
        assert.equal(dependency.personId, personId);
        assert.equal(dependency.sourceId, person.sourceId);
        assert.equal(dependency.usePermissionId, permit);
        const claim = await appA.exports.claim();
        assert.ok(claim);
        assert.equal(claim.id, exportId);
        await appA.exports.process(claim);
        const row = await a.exportJob.findUniqueOrThrow({ where: { id: exportId } });
        assert.equal(row.state, 'READY');
        assert.equal(row.payloadDigest?.length, 64);
        const downloaded = result(await ownerA.raw('POST', '/exports/' + exportId + '/download', {}));
        assert.equal(downloaded.sha256, row.payloadDigest);
        assert.equal(downloaded.payload.manifest.people[0].id, personId);
        assert.equal('sourceId' in downloaded.payload.manifest.people[0], true);
        assert.ok(!JSON.stringify(downloaded.payload).includes('passwordHash'));
        assert.ok(!JSON.stringify(downloaded.payload).includes('textPayload'));
    });

    for (const stage of ['exports', 'exportDependencies', 'audits', 'receipts'] as const) {
        await t.test('DEV-07A PG export create rolls back after ' + stage, async () => {
            const person = await a.person.findUniqueOrThrow({ where: { id: personId } });
            const permit = (await ok(ownerA.cmd('POST', '/use-permissions', {
                sourceId: person.sourceId, subjectKind: 'PERSON', subjectId: personId,
                fields: ['person.displayName'], validUntil: new Date(clock.now().getTime() + 86400000).toISOString(),
                evidenceNote: 'synthetic rollback export permission ' + stage
            }), 201)).resourceId as string;
            const before = {
                exports: await a.exportJob.count(),
                deps: await a.exportDependency.count(),
                audits: await a.auditEvent.count(),
                receipts: await a.commandReceipt.count()
            };
            const faults = new FaultStore(storeA);
            let fired = false;
            faults.afterInsert = table => {
                if (table === stage && !fired) {
                    fired = true;
                    throw new Error('DEV07 deliberate export failure');
                }
            };
            const app = new Application(faults, config, clock), client = new Client(app);
            client.jar = { ...ownerA.jar };
            client.csrf = ownerA.csrf;
            const body = { format: 'JSON', selectedIds: { people: [personId], works: [], projects: [] },
                fields: ['person.displayName'], usePermissionRefs: [permit] };
            const key = randomUUID(), failed = await client.cmd('POST', '/exports', body, key);
            assert.ok(failed.status >= 500, JSON.stringify(failed.body));
            assert.ok(fired);
            assert.equal(await a.exportJob.count(), before.exports);
            assert.equal(await a.exportDependency.count(), before.deps);
            assert.equal(await a.auditEvent.count(), before.audits);
            assert.equal(await a.commandReceipt.count(), before.receipts);
            const success = await ok(ownerA.cmd('POST', '/exports', body, key), 202);
            assert.equal(await a.exportJob.count(), before.exports + 1);
            assert.equal(await a.exportDependency.count(), before.deps + 1);
            assert.equal(await a.commandReceipt.count({ where: { commandKey: key, operation: 'export.create' } }), 1);
            assert.ok(success.resourceId);
        });
    }

    await t.test('DEV-07B PG deletion target/source shape and unresolved-count constraints are enforced by DB', async () => {
        const person = await a.person.findUniqueOrThrow({ where: { id: personId } });
        const foreignSource = (await ok(ownerA.cmd('POST', '/sources', sourceInput()), 201)).resourceId as string;
        const now = clock.now();
        const base = {
            id: randomUUID(), workspaceId: identity.workspaceId, createdAt: now, updatedAt: now, revision: 1,
            actorId: identity.membershipId, targetKind: 'PERSON', targetId: personId, targetSourceId: foreignSource,
            targetRevision: person.revision, targetProtectionEpoch: person.protectionEpoch, state: 'DRAFT',
            reason: 'synthetic wrong-source deletion request', previewDigest: 'a'.repeat(64),
            impactCount: 0, reviewRequiredCount: 0, unresolvedCount: 0,
            targetPersonId: personId, targetWorkId: null, targetProjectId: null, targetAssetId: null, targetSourceSubjectId: null
        };
        await assert.rejects(a.deletionRequest.create({ data: base }));
        await assert.rejects(a.deletionRequest.create({ data: { ...base, id: randomUUID(), targetSourceId: person.sourceId, unresolvedCount: 1 } }));
    });

    await t.test('DEV-07B PG preview freezes exact visible impacts without blocking the target', async () => {
        const person = await a.person.findUniqueOrThrow({ where: { id: personId } });
        const w = await root('works');
        await modify('/works/' + w, '/credits', { personId, roleCode: 'model', note: 'synthetic deletion impact note' });
        const previewResponse = await ownerA.raw('POST', '/deletion-requests/preview', {
            targetKind: 'PERSON', targetId: personId, expectedRevision: person.revision
        });
        assert.equal(previewResponse.status, 200, JSON.stringify(previewResponse.body));
        const preview = result(previewResponse);
        assert.equal(preview.complete, true);
        assert.ok(preview.impactCount >= 1);
        const created = await ok(ownerA.cmd('POST', '/deletion-requests', {
            targetKind: 'PERSON', targetId: personId, expectedRevision: person.revision,
            previewDigest: preview.previewDigest, reason: 'synthetic freeze deletion impact only'
        }), 201);
        const requestId = created.resourceId as string;
        const row = await a.deletionRequest.findUniqueOrThrow({ where: { id: requestId } });
        assert.equal(row.state, 'DRAFT');
        assert.equal(row.unresolvedCount, 0);
        assert.equal(await a.deletionItem.count({ where: { requestId } }), preview.impactCount);
        assert.ok(await a.person.findUnique({ where: { id: personId } }));
        const detail = result(await ownerA.raw('GET', '/deletion-requests/' + requestId));
        assert.equal(detail.executionAvailable, false);
        assert.ok(!JSON.stringify(detail).includes(w));
    });

    for (const stage of ['deletionRequests', 'deletionItems', 'audits', 'receipts'] as const) {
        await t.test('DEV-07B PG draft deletion create rolls back after ' + stage, async () => {
            const person = await a.person.findUniqueOrThrow({ where: { id: personId } });
            const p = result(await ownerA.raw('POST', '/deletion-requests/preview', {
                targetKind: 'PERSON', targetId: personId, expectedRevision: person.revision
            }));
            assert.ok(p.impactCount > 0);
            const before = {
                requests: await a.deletionRequest.count(),
                items: await a.deletionItem.count(),
                audits: await a.auditEvent.count(),
                receipts: await a.commandReceipt.count()
            };
            const faults = new FaultStore(storeA);
            let fired = false;
            faults.afterInsert = table => {
                if (table === stage && !fired) {
                    fired = true;
                    throw new Error('DEV07B deliberate draft deletion failure');
                }
            };
            const app = new Application(faults, config, clock), client = new Client(app);
            client.jar = { ...ownerA.jar }; client.csrf = ownerA.csrf;
            const body = { targetKind: 'PERSON', targetId: personId, expectedRevision: person.revision,
                previewDigest: p.previewDigest, reason: 'synthetic rollback draft deletion ' + stage };
            const key = randomUUID(), failed = await client.cmd('POST', '/deletion-requests', body, key);
            assert.ok(failed.status >= 500, JSON.stringify(failed.body));
            assert.ok(fired);
            assert.equal(await a.deletionRequest.count(), before.requests);
            assert.equal(await a.deletionItem.count(), before.items);
            assert.equal(await a.auditEvent.count(), before.audits);
            assert.equal(await a.commandReceipt.count(), before.receipts);
            const success = await ok(ownerA.cmd('POST', '/deletion-requests', body, key), 201);
            assert.ok(success.resourceId);
            assert.equal(await a.deletionRequest.count(), before.requests + 1);
            assert.equal(await a.commandReceipt.count({ where: { commandKey: key, operation: 'deletion.create' } }), 1);
        });
    }

}
