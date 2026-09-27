import { verifyTalentEvidenceHistory } from '../support/talent-evidence-history.ts';
/** Fresh disposable PostgreSQL only. Same domain assertions as MemoryStore, real FK/audit rollback. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaStore } from '../../apps/api/src/prisma-store.ts';
import { Application } from '../../packages/core/src/api.ts';
import { FakeClock, Client, SYNTHETIC_PASSWORD } from '../support/fixtures.ts';
import { verifyCandidateRoleContext, verifyLegacyCandidateEnrollment, verifyUnknownRoleCandidateMerge, verifyRoleCandidateMerge, verifyProfessionalConflicts, verifyProfessionalMerge } from '../support/talent-v2-merge.ts';

test('TD2 real PostgreSQL professional merge rollback and retry', async () => {
    assert.equal(process.env.ALLOW_TD2_DB_TESTS, 'yes');
    const raw = process.env.DATABASE_URL_TD2_TEST; assert.ok(raw);
    const url = new URL(raw);
    assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
    assert.match(url.pathname, /^\/once_test_td2_[a-z0-9_]+$/);
    assert.ok(url.username && url.password); assert.equal(url.search, ''); assert.equal(url.hash, '');
    const client = new PrismaClient({ datasources: { db: { url: raw } }, log: [] });
    const store = new PrismaStore(client), clock = new FakeClock();
    try {
        await client.$connect(); assert.equal(await client.workspace.count(), 0);
        const app = new Application(store, { origin: 'https://td2.test.invalid', secureCookies: true,
            contactKey: randomBytes(32), csrfKey: randomBytes(32), recoveryEpoch: randomBytes(24).toString('hex'),
            accessMode: 'INTERNAL', environment: 'test', dataEgressMode: 'INTERNAL_APPROVED',
            dataCleanupMode: 'INTERNAL_APPROVED', dataMergeMode: 'INTERNAL_APPROVED' }, clock);
        await app.identity.bootstrap('owner', '合成2.0维护管理员', SYNTHETIC_PASSWORD);
        const owner = new Client(app); assert.equal((await owner.login()).status, 200);
        await verifyProfessionalMerge(app, store, clock, owner);
        await verifyProfessionalConflicts(app, store, clock, owner);
        await verifyRoleCandidateMerge(app,store,clock,owner);
        await verifyUnknownRoleCandidateMerge(app,store,clock,owner);
        await verifyCandidateRoleContext(app,store,clock,owner);
        await verifyLegacyCandidateEnrollment(app,store,clock,owner);
        const review = await client.talentMigrationReview.findFirstOrThrow({where:{previousShortlistItemIds:{isEmpty:false}}});
        await assert.rejects(client.talentMigrationReview.update({where:{id:review.id},data:{previousShortlistItemIds:[]}}), /lineage is append only/);
        await assert.rejects(client.talentMigrationReview.update({where:{id:review.id},data:{shortlistItemId:null}}), /reassignment must preserve/);
        const retired = await client.talentProfile.findFirstOrThrow({ where: { supersededById: { not: null } } });
        await assert.rejects(client.$executeRaw`UPDATE "talentProfiles" SET "revision"="revision"+1 WHERE "id"=${retired.id}::uuid`, /retired profile is immutable/);
        await assert.rejects(client.$executeRaw`DELETE FROM "talentProfiles" WHERE "id"=${retired.id}::uuid`, /retired profile is immutable/);
        await assert.rejects(client.$executeRaw`UPDATE "talentProfiles" SET "personId"=${retired.personId}::uuid WHERE "id"=${retired.supersededById}::uuid`, /cannot change the owner/);
        const ordinary = await client.talentProfile.findFirstOrThrow({ where: { supersededById: null, id: { not: retired.supersededById! } } });
        await assert.rejects(client.$executeRaw`UPDATE "talentProfiles" SET "supersededById"=${retired.supersededById}::uuid,"revision"="revision"+1 WHERE "id"=${ordinary.id}::uuid`, /matching completed identity merge/);
        console.log('PASS TD2 PG: explicit conflicts, immutable history, raw SQL lineage guards; typed merge stable IDs, original sources, role links, audit rollback, retry and replay');
        await verifyTalentEvidenceHistory(app,store,clock,owner);
        console.log('PASS TD2 evidence history PG: paginated current/stale field support, suspended sources and original review attribution; restricted fields and machine reads rejected');
    } finally { await store.close(); }
});
