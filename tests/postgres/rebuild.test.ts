/** T29 real PostgreSQL + CLI rebuild acceptance.
 * The wrapper creates a fresh loopback once_rebuild_* database and applies migrations.
 * This file never drops, truncates, resets or restores a database. */
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
import type { Config } from '../../packages/core/src/model.ts';
import { JsonRebuild } from '../../packages/core/src/rebuild.ts';
import { FaultStore } from '../support/fault-store.ts';
import { FakeClock, SYNTHETIC_PASSWORD } from '../support/fixtures.ts';

function testUrl(): string {
    assert.equal(process.env.ALLOW_REBUILD_TESTS, 'yes');
    const raw = process.env.DATABASE_URL_REBUILD_TEST;
    assert.ok(raw);
    const url = new URL(raw);
    assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
    assert.match(url.pathname, /^\/once_rebuild_[a-z0-9_]+$/);
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
    assert.ok(url.username && url.password);
    return raw;
}
function payload() {
    const sourceId = randomUUID();
    const people = Array.from({ length: 10 }, (_, i) => ({
        id: randomUUID(), sourceId, revision: i + 1,
        data: {
            displayName: 'PG T29 人才 ' + (i + 1), aliases: [], roles: [i % 2 ? 'editor' : 'model'],
            cityCode: null, languageCodes: [], skillCodes: [], heightCm: null,
            intro: i === 0 ? 'PRIVATE_REBUILD_SENTINEL' : '', status: i === 0 ? 'ACTIVE' : 'DRAFT'
        }
    }));
    const works = Array.from({ length: 3 }, (_, i) => ({
        id: randomUUID(), sourceId, revision: i + 2,
        data: { title: 'PG T29 作品 ' + (i + 1), description: '', industryCode: null, workTypeCodes: [],
            origin: 'EXTERNAL', originNote: '', status: 'DRAFT' }
    }));
    const project = { id: randomUUID(), sourceId, revision: 2,
        data: { title: 'PG T29 项目', brief: '', locationNote: '', dateNote: '', reviewNote: '', status: 'DRAFT' } };
    return {
        schemaVersion: 'once-export-v1', exportId: randomUUID(), frozenAt: '2026-09-23T07:30:00.000Z',
        manifest: {
            schemaVersion: 'once-export-v1', frozenAt: '2026-09-23T07:30:00.000Z',
            people, works, projects: [project],
            sources: [{
                id: sourceId, revision: 6, protectionEpoch: 3,
                data: { title: 'PG T29 来源', type: 'MANUAL', providerClaim: 'PRIVATE_PROVIDER_SENTINEL',
                    basisMode: 'INTERNAL_USE', basisDescription: 'PG T29 合成迁移依据',
                    validFrom: '2026-09-01T00:00:00.000Z', validUntil: '2026-12-31T00:00:00.000Z', status: 'CONFIRMED' }
            }],
            media: [],
            relations: {
                workCredits: works.map((work, i) => ({ workId: work.id, personId: people[i]!.id, roleCode: i % 2 ? 'editor' : 'model' })),
                projectParticipants: [
                    { projectId: project.id, personId: people[0]!.id, roleCode: 'model', state: 'CONFIRMED' },
                    { projectId: project.id, personId: people[1]!.id, roleCode: 'editor', state: 'NOMINATED' }
                ],
                projectWorks: works.map(work => ({ projectId: project.id, workId: work.id, relation: 'REFERENCE' }))
            }
        }
    };
}

test('DEV-07H T29 real PostgreSQL rollback + CLI apply rebuilds 10/3/1 graph without identity secrets', async () => {
    const url = testUrl();
    const client = new PrismaClient({ datasources: { db: { url } }, log: [] });
    const store = new PrismaStore(client);
    const tmp = mkdtempSync(join(tmpdir(), 'once-rebuild-pg-'));
    try {
        await client.$connect();
        assert.equal(await client.workspace.count(), 0, 'T29 requires a fresh migrated rebuild database.');
        const clock = new FakeClock();
        const config: Config = {
            origin: 'https://rebuild.test.invalid', secureCookies: true,
            contactKey: randomBytes(32), csrfKey: randomBytes(32), recoveryEpoch: randomBytes(24).toString('hex'),
            accessMode: 'INTERNAL', environment: 'test', mediaEnabled: false,
            dataEgressMode: 'DISABLED', dataCleanupMode: 'DISABLED', dataMergeMode: 'DISABLED'
        };
        const app = new Application(store, config, clock);
        await app.identity.bootstrap('rebuild_owner', 'T29重建管理员', SYNTHETIC_PASSWORD);
        const rebuild = new JsonRebuild(clock);
        const actor = await store.transaction(tx => rebuild.actorFromTarget(tx, 'rebuild_owner'));
        const input = payload();

        const preview = await store.transaction(tx => rebuild.preview(tx, actor, input));
        assert.deepEqual(preview.counts, {
            sources: 1, people: 10, works: 3, projects: 1,
            workCredits: 3, projectParticipants: 2, projectWorks: 3, mediaIdentities: 0
        });
        assert.equal(await client.person.count(), 0);

        const faults = new FaultStore(store);
        let fired = false;
        faults.afterInsert = table => {
            if (table === 'audits' && !fired) {
                fired = true;
                throw new Error('T29 synthetic audit failure');
            }
        };
        await assert.rejects(faults.transaction(tx => rebuild.apply(tx, actor, input, { requestId: randomUUID(), ip: 'CLI' })), /T29 synthetic audit failure/);
        assert.ok(fired);
        assert.equal(await client.sourceRecord.count(), 0);
        assert.equal(await client.sourceHistory.count(), 0);
        assert.equal(await client.person.count(), 0);
        assert.equal(await client.work.count(), 0);
        assert.equal(await client.project.count(), 0);

        const file = join(tmp, 'controlled-export.json');
        writeFileSync(file, JSON.stringify(input), { mode: 0o600 });
        const cli = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/rebuild-export.ts',
            '--input', file, '--actor-login', 'rebuild_owner', '--apply'], {
            cwd: process.cwd(), encoding: 'utf8', timeout: 120000,
            env: { ...process.env, DATABASE_URL_REBUILD: url, ALLOW_REBUILD: 'yes' }
        });
        assert.equal(cli.status, 0, (cli.stderr ?? '').slice(-4000));
        assert.doesNotMatch(cli.stdout, /PRIVATE_REBUILD_SENTINEL|PRIVATE_PROVIDER_SENTINEL/);
        const summary = JSON.parse(cli.stdout);
        assert.equal(summary.mode, 'APPLY');
        assert.equal(summary.mediaRestored, 0);
        assert.equal(summary.counts.people, 10);

        assert.equal(await client.sourceRecord.count(), 1);
        assert.equal(await client.sourceHistory.count(), 1);
        assert.equal(await client.person.count(), 10);
        assert.equal(await client.work.count(), 3);
        assert.equal(await client.project.count(), 1);
        assert.equal(await client.workCredit.count(), 3);
        assert.equal(await client.projectParticipant.count(), 2);
        assert.equal(await client.projectWork.count(), 3);
        assert.equal(await client.contact.count(), 0);
        assert.equal(await client.fieldEvidence.count(), 0);
        assert.equal(await client.session.count(), 0);
        assert.equal(await client.activation.count(), 0);
        assert.equal(await client.user.count(), 1);
        assert.equal(await client.membership.count(), 1);
        assert.equal(await client.commandReceipt.count(), 0);
        assert.equal(await client.exportJob.count(), 0);

        const source = await client.sourceRecord.findUniqueOrThrow({ where: { id: input.manifest.sources[0]!.id } });
        assert.equal(source.textPayload, '');
        assert.equal(source.protectionEpoch, input.manifest.sources[0]!.protectionEpoch + 1);
        const history = await client.sourceHistory.findFirstOrThrow({ where: { sourceId: source.id } });
        assert.equal(history.action, 'BASELINE');
        assert.equal(history.baselineOnly, true);
        assert.match(history.decisionReason ?? '', /original source history/i);

        for (const row of input.manifest.people)
            assert.ok(await client.person.findUnique({ where: { id: row.id } }));
        for (const row of input.manifest.works)
            assert.ok(await client.work.findUnique({ where: { id: row.id } }));
        assert.ok(await client.project.findUnique({ where: { id: input.manifest.projects[0]!.id } }));

        const second = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/rebuild-export.ts',
            '--input', file, '--actor-login', 'rebuild_owner', '--apply'], {
            cwd: process.cwd(), encoding: 'utf8', timeout: 120000,
            env: { ...process.env, DATABASE_URL_REBUILD: url, ALLOW_REBUILD: 'yes' }
        });
        assert.equal(second.status, 1);
        assert.match(second.stderr, /REBUILD_TARGET_NOT_EMPTY/);
        assert.equal(await client.person.count(), 10);
    }
    finally {
        await store.close();
        rmSync(tmp, { recursive: true, force: true });
    }
});
