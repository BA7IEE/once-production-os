import test from 'node:test';
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {verifyInboxFiles} from '../support/supplier-inbox-files.mjs';
assert.equal(process.env.ALLOW_DB_TESTS,'yes');assert.ok(process.env.ONCE_RESOURCE_RUN_DIR);
const raw=process.env.DATABASE_URL_TEST;assert.ok(raw);const url=new URL(raw);assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/^\/once_test_[a-z0-9_]+$/);
test('employee inbox: actual PDF/media, durable chunks, explicit identities, UNKNOWN billing, reconciliation and deletion in PostgreSQL',async()=>{
 const store=new PrismaStore(new PrismaClient({datasources:{db:{url:raw}},log:[]}));try{await verifyInboxFiles(store);}finally{await store.close();}
});
