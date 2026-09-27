import { verifySourcePersonErasure } from '../support/talent-source-person-erasure.ts';
import { verifyCombinedSourceErasure } from '../support/talent-source-combined-erasure.ts';
import { verifySourceAssetErasure } from '../support/talent-source-asset-erasure.ts';
/** Fresh disposable PostgreSQL only. Same domain assertions as MemoryStore, real FK/audit rollback. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaStore } from '../../apps/api/src/prisma-store.ts';
import { Application } from '../../packages/core/src/api.ts';
import { FakeClock, Client, SYNTHETIC_PASSWORD } from '../support/fixtures.ts';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifySharedAssetErasure } from '../support/talent-asset-erasure.ts';

test('TD2 real PostgreSQL shared proof erasure and physical file cleanup', async () => {
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
        const mediaRoot = await mkdtemp(join(await realpath(tmpdir()), 'once-pg-shared-proof-'));
        try { await verifySharedAssetErasure({app,store,clock,owner},mediaRoot); await verifySourceAssetErasure({app,store,clock,owner},mediaRoot); await verifyCombinedSourceErasure({app,store,clock,owner},mediaRoot); await verifySourcePersonErasure({app,store,clock,owner},mediaRoot); } finally { await rm(mediaRoot,{recursive:true,force:true}); }
        console.log('PASS TD2 PG: shared collection/proof deletion, current requester checks, audit rollback/retry, historical evidence retained, physical media purge and ERASED finalization');
    } finally { await store.close(); }
});
