import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {presentationFixture,verifyClientPresentations,verifyClientDeletion} from '../support/client-presentations.ts';
assert.equal(process.env.ALLOW_DB_TESTS,'yes');assert.ok(process.env.ONCE_RESOURCE_RUN_DIR);const raw=process.env.DATABASE_URL_TEST;assert.ok(raw);const u=new URL(raw);assert.equal(u.hostname,'127.0.0.1');assert.match(u.pathname,/^\/once_test_[a-z0-9_]+$/);
test('real PostgreSQL immutable client snapshot, exact recipient/session/entry FKs, feedback rollback, and reviewed erasure',async()=>{const db=new PrismaClient({datasources:{db:{url:raw}},log:[]}),store=new PrismaStore(db);try{const f=await presentationFixture(store),v=await verifyClientPresentations(f);await assert.rejects(db.clientVersion.update({where:{id:v.first.versionId},data:{contentCiphertext:'forged'}}));await assert.rejects(db.clientVersion.delete({where:{id:v.first.versionId}}));await assert.rejects(db.clientVersion.update({where:{id:v.first.versionId},data:{state:'ERASED',contentCiphertext:null}}));const feedback=await db.clientFeedback.findFirstOrThrow();await assert.rejects(db.clientFeedback.create({data:{...feedback,id:randomUUID(),commandKey:randomUUID(),entryId:randomUUID()}}));await assert.rejects(db.clientFeedback.update({where:{id:feedback.id},data:{choice:'PASS'}}));await verifyClientDeletion(f);}finally{await store.close();}});
