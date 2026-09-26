/** DEV-07H / T29 isolated JSON rebuild acceptance against real PostgreSQL and the real CLI.
 * Creates a new once_rebuild_* database beside the disposable contract DB and deliberately leaves it
 * in place. It never drops, truncates, resets or touches a non-loopback database. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { PrismaStore } from '../../apps/api/src/prisma-store.ts';
import { Application } from '../../packages/core/src/api.ts';
import { FakeClock, SYNTHETIC_PASSWORD } from '../support/fixtures.ts';

const raw = process.env.DATABASE_URL_TEST;
assert.equal(process.env.ALLOW_DB_TESTS, 'yes');
assert.ok(raw, 'DATABASE_URL_TEST is required');
const current = new URL(raw);
assert.ok(['postgresql:', 'postgres:'].includes(current.protocol));
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(current.hostname));
assert.match(current.pathname, /^\/once_test_[a-z0-9_]+$/);
assert.equal(current.search, '');
assert.ok(current.username && current.password);

const dbName = 'once_rebuild_t29_' + randomBytes(5).toString('hex');
const target = new URL(raw);
target.pathname = '/' + dbName;
const targetUrl = target.toString();

const admin = new PrismaClient({ datasources: { db: { url: raw } }, log: [] });
const targetClient = new PrismaClient({ datasources: { db: { url: targetUrl } }, log: [] });
const tmp = mkdtempSync(join(tmpdir(), 'once-t29-rebuild-'));

function run(command, args, env = process.env, expected = 0) {
    const r = spawnSync(command, args, { encoding: 'utf8', timeout: 180000, env });
    assert.equal(r.status, expected, command + ' ' + args.join(' ') + '\nstdout:\n' + (r.stdout ?? '') + '\nstderr:\n' + (r.stderr ?? ''));
    return r;
}
function payload() {
    const sourceId = randomUUID();
    const people = Array.from({ length: 10 }, (_, i) => ({
        id: randomUUID(), sourceId, revision: i + 1,
        data: {
            displayName: 'T29 PG 人才 ' + (i + 1), aliases: i === 0 ? ['T29 PG 一号别名'] : [],
            roles: [i % 3 === 0 ? 'photographer' : i % 3 === 1 ? 'editor' : 'model'],
            cityCode: i === 0 ? 'shenzhen' : null, languageCodes: i === 0 ? ['zh', 'en'] : [],
            skillCodes: i === 0 ? ['commercial'] : [], heightCm: null,
            intro: i === 0 ? 'T29 real PostgreSQL rebuild' : '', status: i === 0 ? 'ACTIVE' : 'DRAFT'
        }
    }));
    const works = Array.from({ length: 3 }, (_, i) => ({
        id: randomUUID(), sourceId, revision: i + 2,
        data: { title: 'T29 PG 作品 ' + (i + 1), description: '', industryCode: null, workTypeCodes: [],
            origin: 'EXTERNAL', originNote: '', status: 'DRAFT' }
    }));
    const project = {
        id: randomUUID(), sourceId, revision: 3,
        data: { title: 'T29 PG 项目', brief: '真实数据库隔离重建', locationNote: '', dateNote: '', reviewNote: '', status: 'DRAFT' }
    };
    return {
        schemaVersion: 'once-export-v1', exportId: randomUUID(), frozenAt: '2026-09-23T07:30:00.000Z',
        manifest: {
            schemaVersion: 'once-export-v1', frozenAt: '2026-09-23T07:30:00.000Z',
            people, works, projects: [project],
            sources: [{ id: sourceId, revision: 7, protectionEpoch: 4, data: {
                title: 'T29 PG 迁移来源', type: 'MANUAL', providerClaim: '合成 T29 PostgreSQL 提供方',
                basisMode: 'INTERNAL_USE', basisDescription: '合成迁移依据，只用于 T29 PostgreSQL 自动验收',
                validFrom: '2026-09-01T00:00:00.000Z', validUntil: '2026-12-31T00:00:00.000Z', status: 'CONFIRMED'
            }}],
            media: [],
            relations: {
                workCredits: [
                    { workId: works[0].id, personId: people[0].id, roleCode: 'photographer' },
                    { workId: works[1].id, personId: people[1].id, roleCode: 'editor' },
                    { workId: works[2].id, personId: people[2].id, roleCode: 'model' }
                ],
                projectParticipants: [
                    { projectId: project.id, personId: people[0].id, roleCode: 'photographer', state: 'CONFIRMED' },
                    { projectId: project.id, personId: people[1].id, roleCode: 'editor', state: 'NOMINATED' }
                ],
                projectWorks: works.map(work => ({ projectId: project.id, workId: work.id, relation: 'REFERENCE' }))
            }
        }
    };
}

try {
    await admin.$connect();
    const existing = await admin.$queryRawUnsafe(`SELECT 1 FROM pg_database WHERE datname = '${dbName}'`);
    assert.equal(existing.length, 0);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);

    run('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { ...process.env, DATABASE_URL: targetUrl });
    await targetClient.$connect();
    assert.equal(await targetClient.workspace.count(), 0);

    const store = new PrismaStore(targetClient);
    const clock = new FakeClock();
    const app = new Application(store, {
        origin: 'https://rebuild.test.invalid', secureCookies: true,
        contactKey: randomBytes(32), csrfKey: randomBytes(32), recoveryEpoch: randomBytes(24).toString('hex'),
        accessMode: 'INTERNAL', dataEgressMode: 'DISABLED', dataCleanupMode: 'DISABLED', dataMergeMode: 'DISABLED',
        environment: 'test', mediaEnabled: false
    }, clock);
    const ids = await app.identity.bootstrap('owner', 'T29 隔离重建管理员', SYNTHETIC_PASSWORD);
    assert.equal(await targetClient.user.count(), 1);
    assert.equal(await targetClient.membership.count(), 1);
    assert.equal(await targetClient.session.count(), 0);
    assert.equal(await targetClient.auditEvent.count(), 1);

    const value = payload();
    const input = join(tmp, 't29-export.json');
    writeFileSync(input, JSON.stringify(value), { mode: 0o600 });

    // DATABASE_URL is intentionally a different test DB; the CLI must use only DATABASE_URL_REBUILD.
    const commonEnv = { ...process.env, DATABASE_URL_REBUILD: targetUrl, DATABASE_URL: raw };
    const check = run('pnpm', ['rebuild:json', '--', '--input', input, '--actor-login', 'owner'], commonEnv);
    const checked = JSON.parse(check.stdout);
    assert.equal(checked.mode, 'CHECK');
    assert.equal(checked.counts.people, 10);
    assert.equal(checked.counts.works, 3);
    assert.equal(checked.counts.projects, 1);
    assert.equal(checked.mediaRestored, 0);
    assert.equal(await targetClient.sourceRecord.count(), 0, 'CHECK must be zero-write');
    assert.equal(await targetClient.person.count(), 0);

    // The ordinary once_test_* DB is rejected by the CLI target-name safety gate before any query.
    const rejected = run('pnpm', ['rebuild:json', '--', '--input', input, '--actor-login', 'owner'], {
        ...process.env, DATABASE_URL_REBUILD: raw
    }, 2);
    assert.match(rejected.stderr, /Only an explicit loopback once_rebuild_/);

    const applied = run('pnpm', ['rebuild:json', '--', '--input', input, '--actor-login', 'owner', '--apply'], {
        ...commonEnv, ALLOW_REBUILD: 'yes'
    });
    const summary = JSON.parse(applied.stdout);
    assert.equal(summary.mode, 'APPLY');
    assert.deepEqual(summary.counts, {
        sources: 1, people: 10, works: 3, projects: 1,
        workCredits: 3, projectParticipants: 2, projectWorks: 3, mediaIdentities: 0
    });
    assert.equal(summary.workspaceId, ids.workspaceId);

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
    assert.equal(await targetClient.exportJob.count(), 0);
    assert.equal(await targetClient.session.count(), 0);
    assert.equal(await targetClient.auditEvent.count(), 2);
    const rebuildAudit = await targetClient.auditEvent.findFirstOrThrow({ where: { action: 'rebuild.apply' } });
    assert.equal(rebuildAudit.resourceKind, 'rebuild-export');
    assert.equal(rebuildAudit.resourceId, value.exportId);

    assert.equal((await targetClient.person.findUniqueOrThrow({ where: { id: value.manifest.people[0].id } })).displayName, 'T29 PG 人才 1');
    assert.equal((await targetClient.work.findUniqueOrThrow({ where: { id: value.manifest.works[0].id } })).title, 'T29 PG 作品 1');
    assert.equal((await targetClient.project.findUniqueOrThrow({ where: { id: value.manifest.projects[0].id } })).title, 'T29 PG 项目');
    const history = await targetClient.sourceHistory.findFirstOrThrow();
    assert.equal(history.action, 'BASELINE');
    assert.equal(history.baselineOnly, true);

    const second = run('pnpm', ['rebuild:json', '--', '--input', input, '--actor-login', 'owner', '--apply'], {
        ...commonEnv, ALLOW_REBUILD: 'yes'
    }, 1);
    assert.match(second.stderr, /REBUILD_TARGET_NOT_EMPTY/);

    console.log('PASS DEV-07H T29 PG/CLI: CHECK zero-write -> 10 people/3 works/1 project APPLY -> stable ids/relations; unsafe target and replay rejected');
    await store.close();
} finally {
    await admin.$disconnect();
    await targetClient.$disconnect().catch(() => {});
    rmSync(tmp, { recursive: true, force: true });
}
