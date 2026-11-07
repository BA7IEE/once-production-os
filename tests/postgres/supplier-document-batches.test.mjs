import test from 'node:test';
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {uploadedDocumentFixture} from '../support/supplier-document-fixture.mjs';
import {verifyBatchRecovery} from '../support/supplier-document-batches.mjs';

assert.equal(process.env.ALLOW_DB_TESTS,'yes');assert.ok(process.env.ONCE_RESOURCE_RUN_DIR);
const raw=process.env.DATABASE_URL_TEST;assert.ok(raw);
const url=new URL(raw);assert.ok(['127.0.0.1','localhost'].includes(url.hostname));assert.match(url.pathname,/^\/once_test_[a-z0-9_]+$/);
test('real PostgreSQL persists full-PDF plan, explicit retry, one-send billing and page provenance through confirmation',async()=>{
 const db=new PrismaClient({datasources:{db:{url:raw}},log:[]}),store=new PrismaStore(db);
 try{assert.equal(await db.workspace.count(),0);await uploadedDocumentFixture(verifyBatchRecovery,{fileName:'long-portfolio.pdf',store});}
 finally{await store.close();}
});
