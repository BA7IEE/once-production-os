import test from 'node:test';
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {uploadedDocumentFixture} from '../support/supplier-document-fixture.mjs';
import {verifyWorkGrouping} from '../support/supplier-work-grouping.mjs';

assert.equal(process.env.ALLOW_DB_TESTS,'yes');assert.ok(process.env.ONCE_RESOURCE_RUN_DIR);
const raw=process.env.DATABASE_URL_TEST;assert.ok(raw);
const url=new URL(raw);assert.ok(['127.0.0.1','localhost'].includes(url.hostname));assert.match(url.pathname,/^\/once_test_[a-z0-9_]+$/);
test('real PostgreSQL groups two actual PDFs into one self-confirmed case with all page origins and atomic rejection/replay',async()=>{
 const db=new PrismaClient({datasources:{db:{url:raw}},log:[]}),store=new PrismaStore(db);
 try{assert.equal(await db.workspace.count(),0);await uploadedDocumentFixture(verifyWorkGrouping,{fileName:'long-portfolio.pdf',store});}
 finally{await store.close();}
});
