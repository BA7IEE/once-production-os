/** T29 end-to-end PostgreSQL acceptance.
 * Source side uses the already-migrated disposable once_test_* database after its normal suite.
 * Target side is a second fresh migrated once_rebuild_* database created by verify-postgres.mjs.
 * Neither database is dropped, truncated or reset here. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { PrismaStore } from '../../apps/api/src/prisma-store.ts';
import { Application } from '../../packages/core/src/api.ts';
import type { Actor, Config } from '../../packages/core/src/model.ts';
import { permissionsFor } from '../../packages/core/src/policy.ts';
import { JsonRebuild } from '../../packages/core/src/rebuild.ts';
import { FaultStore } from '../support/fault-store.ts';
import { FakeClock, SYNTHETIC_PASSWORD, sourceInput } from '../support/fixtures.ts';

function checkedUrl(name: 'DATABASE_URL_TEST' | 'DATABASE_URL_REBUILD_TEST', prefix: 'once_test_' | 'once_rebuild_') {
    const raw = process.env[name];
    assert.ok(raw, name + ' is required');
    const url = new URL(raw);
    assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
    assert.match(url.pathname, new RegExp('^/' + prefix + '[a-z0-9_]+$'));
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
    assert.ok(url.username && url.password);
    return raw;
}
async function sourceActor(client: PrismaClient): Promise<Actor> {
    const workspace = await client.workspace.findFirstOrThrow();
    const member = await client.membership.findFirstOrThrow({ where: { workspaceId: workspace.id, role: 'ADMIN', status: 'ACTIVE' } });
    const user = await client.user.findUniqueOrThrow({ where: { id: member.userId } });
    return {
        workspaceId: workspace.id, membershipId: member.id, userId: user.id,
        role: 'ADMIN', permissions: permissionsFor({
            id: member.id, workspaceId: member.workspaceId, userId: member.userId,
            createdAt: member.createdAt.toISOString(), updatedAt: member.updatedAt.toISOString(),
            revision: member.revision, role: 'ADMIN', extraPermissions: member.extraPermissions as any, status: 'ACTIVE'
        }),
        displayName: user.displayName, userEpoch: user.sessionEpoch, sessionId: 't29-source'
    };
}
async function buildControlledExport(client: PrismaClient, store: PrismaStore) {
    const clock = new FakeClock();
    const actor = await sourceActor(client);
    const workspace = await client.workspace.findUniqueOrThrow({ where: { id: actor.workspaceId } });
    const config: Config = {
        origin: 'https://t29-source.test.invalid', secureCookies: true,
        contactKey: randomBytes(32), csrfKey: randomBytes(32), recoveryEpoch: workspace.recoveryEpoch,
        accessMode: 'INTERNAL', environment: 'test', mediaEnabled: false,
        dataEgressMode: 'INTERNAL_APPROVED', dataCleanupMode: 'DISABLED', dataMergeMode: 'DISABLED'
    };
    const app = new Application(store, config, clock);
    const source = await store.transaction(tx => app.talent.createSource(tx, actor, {
        ...sourceInput(), title: 'T29 真实导出来源', providerClaim: 'PRIVATE_PROVIDER_SENTINEL'
    }));
    const people = [];
    for (let i = 0; i < 10; i++) {
        people.push(await store.transaction(tx => app.talent.createPerson(tx, actor, {
            displayName: 'T29 导出人才 ' + (i + 1), roles: [i % 2 ? 'editor' : 'model'], sourceId: source.id,
            ...(i === 0 ? { intro: 'PRIVATE_REBUILD_SENTINEL' } : {})
        })));
    }
    const works = [];
    for (let i = 0; i < 3; i++) {
        works.push(await store.transaction(tx => app.portfolio.create(tx, actor, {
            title: 'T29 导出作品 ' + (i + 1), sourceId: source.id, origin: 'EXTERNAL'
        })));
    }
    const project = await store.transaction(tx => app.projects.create(tx, actor, {
        title: 'T29 导出项目', sourceId: source.id, brief: '真实 once-export-v1 重建验收'
    }));

    for (let i = 0; i < works.length; i++) {
        const current = await client.work.findUniqueOrThrow({ where: { id: works[i]!.id } });
        await store.transaction(tx => app.portfolio.addCredit(tx, actor, current.id, {
            expectedRevision: current.revision, personId: people[i]!.id,
            roleCode: i % 2 ? 'editor' : 'model', note: ''
        }));
    }
    for (let i = 0; i < 2; i++) {
        const current = await client.project.findUniqueOrThrow({ where: { id: project.id } });
        await store.transaction(tx => app.projects.addParticipant(tx, actor, project.id, {
            expectedRevision: current.revision, personId: people[i]!.id,
            roleCode: i % 2 ? 'editor' : 'model', state: i ? 'NOMINATED' : 'CONFIRMED', note: ''
        }));
    }
    for (const work of works) {
        const current = await client.project.findUniqueOrThrow({ where: { id: project.id } });
        await store.transaction(tx => app.projects.linkWork(tx, actor, project.id, {
            expectedRevision: current.revision, workId: work.id, relation: 'REFERENCE'
        }));
    }

    const personFields = ['person.displayName','person.aliases','person.roles','person.cityCode','person.languageCodes','person.skillCodes','person.heightCm','person.intro','person.status'] as const;
    const workFields = ['work.title','work.description','work.industryCode','work.workTypeCodes','work.origin','work.originNote','work.status','work.relations'] as const;
    const projectFields = ['project.title','project.brief','project.locationNote','project.dateNote','project.reviewNote','project.status','project.relations'] as const;
    const sourceFields = ['source.title','source.type','source.providerClaim','source.basisMode','source.basisDescription','source.validFrom','source.validUntil','source.status'] as const;
    const permissionRefs: string[] = [];
    const permit = async (subjectKind: 'SOURCE'|'PERSON'|'WORK'|'PROJECT', subjectId: string, fields: readonly string[]) => {
        const row = await store.transaction(tx => app.exports.createPermission(tx, actor, {
            sourceId: source.id, subjectKind, subjectId, fields: [...fields],
            validUntil: source.validUntil, evidenceNote: 'T29 合成内部迁移许可'
        }));
        permissionRefs.push(row.id);
    };
    await permit('SOURCE', source.id, sourceFields);
    for (const person of people) await permit('PERSON', person.id, personFields);
    for (const work of works) await permit('WORK', work.id, workFields);
    await permit('PROJECT', project.id, projectFields);

    const job = await store.transaction(tx => app.exports.create(tx, actor, {
        format: 'JSON',
        selectedIds: { people: people.map(x => x.id), works: works.map(x => x.id), projects: [project.id] },
        fields: [...personFields, ...workFields, ...projectFields, ...sourceFields],
        usePermissionRefs: permissionRefs
    }));
    for (let i = 0; i < 100; i++) {
        const current = await client.exportJob.findUniqueOrThrow({ where: { id: job.id } });
        if (current.state === 'READY') break;
        const claim = await app.exports.claim();
        assert.ok(claim, 'expected export claim while T29 source export is queued');
        await app.exports.process(claim);
    }
    const ready = await client.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(ready.state, 'READY');
    assert.ok(ready.payload);
    const payload = ready.payload as any;
    assert.equal(payload.schemaVersion, 'once-export-v1');
    assert.equal(payload.manifest.people.length, 10);
    assert.equal(payload.manifest.works.length, 3);
    assert.equal(payload.manifest.projects.length, 1);
    assert.equal(payload.manifest.relations.workCredits.length, 3);
    assert.equal(payload.manifest.relations.projectParticipants.length, 2);
    assert.equal(payload.manifest.relations.projectWorks.length, 3);
    const encoded = JSON.stringify(payload);
    assert.equal(encoded.includes('passwordHash'), false);
    assert.equal(encoded.includes('tokenHash'), false);
    assert.equal(encoded.includes('ciphertext'), false);
    assert.equal(encoded.includes('textPayload'), false);
    return payload;
}

test('DEV-07H T29 real once-export-v1 -> PostgreSQL rollback -> CLI rebuild 10/3/1 graph', async () => {
    assert.equal(process.env.ALLOW_REBUILD_TESTS, 'yes');
    const sourceUrl = checkedUrl('DATABASE_URL_TEST', 'once_test_');
    const targetUrl = checkedUrl('DATABASE_URL_REBUILD_TEST', 'once_rebuild_');
    assert.notEqual(sourceUrl, targetUrl);
    const sourceClient = new PrismaClient({ datasources: { db: { url: sourceUrl } }, log: [] });
    const targetClient = new PrismaClient({ datasources: { db: { url: targetUrl } }, log: [] });
    const sourceStore = new PrismaStore(sourceClient), targetStore = new PrismaStore(targetClient);
    const tmp = mkdtempSync(join(tmpdir(), 'once-rebuild-pg-'));
    try {
        await sourceClient.$connect();
        await targetClient.$connect();
        assert.equal(await targetClient.workspace.count(), 0, 'T29 target must be a fresh migrated rebuild database.');
        const exportPayload = await buildControlledExport(sourceClient, sourceStore);

        const targetClock = new FakeClock();
        const targetConfig: Config = {
            origin: 'https://rebuild.test.invalid', secureCookies: true,
            contactKey: randomBytes(32), csrfKey: randomBytes(32), recoveryEpoch: randomBytes(24).toString('hex'),
            accessMode: 'INTERNAL', environment: 'test', mediaEnabled: false,
            dataEgressMode: 'DISABLED', dataCleanupMode: 'DISABLED', dataMergeMode: 'DISABLED'
        };
        const targetApp = new Application(targetStore, targetConfig, targetClock);
        await targetApp.identity.bootstrap('rebuild_owner', 'T29重建管理员', SYNTHETIC_PASSWORD);
        const rebuild = new JsonRebuild(targetClock);
        const actor = await targetStore.transaction(tx => rebuild.actorFromTarget(tx, 'rebuild_owner'));
        const preview = await targetStore.transaction(tx => rebuild.preview(tx, actor, exportPayload));
        assert.deepEqual(preview.counts, {
            sources: 1, people: 10, works: 3, projects: 1,
            workCredits: 3, projectParticipants: 2, projectWorks: 3, mediaIdentities: 0
        });
        assert.equal(await targetClient.person.count(), 0);

        const faults = new FaultStore(targetStore);
        let fired = false;
        faults.afterInsert = table => {
            if (table === 'audits' && !fired) {
                fired = true;
                throw new Error('T29 synthetic audit failure');
            }
        };
        await assert.rejects(
            faults.transaction(tx => rebuild.apply(tx, actor, exportPayload, { requestId: randomUUID(), ip: 'CLI' })),
            (error: unknown) => error instanceof Error && (error as any).code === 'STORE_UNAVAILABLE'
        );
        assert.ok(fired, 'fault must happen after the real audit insert inside the transaction');
        assert.equal(await targetClient.sourceRecord.count(), 0);
        assert.equal(await targetClient.sourceHistory.count(), 0);
        assert.equal(await targetClient.person.count(), 0);
        assert.equal(await targetClient.work.count(), 0);
        assert.equal(await targetClient.project.count(), 0);

        const file = join(tmp, 'controlled-export.json');
        writeFileSync(file, JSON.stringify(exportPayload), { mode: 0o600 });
        const cli = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/rebuild-export.ts',
            '--input', file, '--actor-login', 'rebuild_owner', '--apply'], {
            cwd: process.cwd(), encoding: 'utf8', timeout: 120000,
            env: { ...process.env, DATABASE_URL_REBUILD: targetUrl, ALLOW_REBUILD: 'yes' }
        });
        assert.equal(cli.status, 0, (cli.stderr ?? '').slice(-4000));
        assert.doesNotMatch(cli.stdout, /PRIVATE_REBUILD_SENTINEL|PRIVATE_PROVIDER_SENTINEL/);
        const summary = JSON.parse(cli.stdout);
        assert.equal(summary.mode, 'APPLY');
        assert.equal(summary.mediaRestored, 0);
        assert.equal(summary.counts.people, 10);

        assert.equal(await targetClient.sourceRecord.count(), 1);
        assert.equal(await targetClient.sourceHistory.count(), 1);
        assert.equal(await targetClient.person.count(), 10);
        assert.equal(await targetClient.work.count(), 3);
        assert.equal(await targetClient.project.count(), 1);
        assert.equal(await targetClient.workCredit.count(), 3);
        assert.equal(await targetClient.projectParticipant.count(), 2);
        assert.equal(await targetClient.projectWork.count(), 3);
        assert.equal(await targetClient.contact.count(), 0);
        assert.equal(await targetClient.fieldEvidence.count(), 0);
        assert.equal(await targetClient.session.count(), 0);
        assert.equal(await targetClient.activation.count(), 0);
        assert.equal(await targetClient.user.count(), 1);
        assert.equal(await targetClient.membership.count(), 1);
        assert.equal(await targetClient.commandReceipt.count(), 0);
        assert.equal(await targetClient.exportJob.count(), 0);

        const source = await targetClient.sourceRecord.findUniqueOrThrow({ where: { id: exportPayload.manifest.sources[0].id } });
        assert.equal(source.textPayload, '');
        assert.equal(source.protectionEpoch, exportPayload.manifest.sources[0].protectionEpoch + 1);
        const history = await targetClient.sourceHistory.findFirstOrThrow({ where: { sourceId: source.id } });
        assert.equal(history.action, 'BASELINE');
        assert.equal(history.baselineOnly, true);
        assert.match(history.decisionReason ?? '', /original source history/i);

        for (const row of exportPayload.manifest.people)
            assert.ok(await targetClient.person.findUnique({ where: { id: row.id } }));
        for (const row of exportPayload.manifest.works)
            assert.ok(await targetClient.work.findUnique({ where: { id: row.id } }));
        assert.ok(await targetClient.project.findUnique({ where: { id: exportPayload.manifest.projects[0].id } }));

        const second = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/rebuild-export.ts',
            '--input', file, '--actor-login', 'rebuild_owner', '--apply'], {
            cwd: process.cwd(), encoding: 'utf8', timeout: 120000,
            env: { ...process.env, DATABASE_URL_REBUILD: targetUrl, ALLOW_REBUILD: 'yes' }
        });
        assert.equal(second.status, 1);
        assert.match(second.stderr, /REBUILD_TARGET_NOT_EMPTY/);
        assert.equal(await targetClient.person.count(), 10);
    }
    finally {
        await Promise.all([sourceStore.close(), targetStore.close()]);
        rmSync(tmp, { recursive: true, force: true });
    }
});
