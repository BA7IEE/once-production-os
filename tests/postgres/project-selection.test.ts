import test from 'node:test';
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {selectionFixture,verifyProjectSelection,verifySelectionDeletion} from '../support/project-selection.ts';
assert.equal(process.env.ALLOW_DB_TESTS,'yes');assert.ok(process.env.ONCE_RESOURCE_RUN_DIR);const raw=process.env.DATABASE_URL_TEST;assert.ok(raw);const u=new URL(raw);assert.equal(u.hostname,'127.0.0.1');assert.match(u.pathname,/^\/once_test_[a-z0-9_]+$/);
test('real PG project requirements, current directory matching, atomic confirmations and reviewed erasure under actual FKs',async()=>{const db=new PrismaClient({datasources:{db:{url:raw}},log:[]}),store=new PrismaStore(db);try{const f=await selectionFixture(store);await verifyProjectSelection(f);const item=(await store.transaction(tx=>tx.find('shortlistItems',{shortlistId:f.listId})))[0]!;await assert.rejects(db.shortlistItem.update({where:{id:item.id},data:{personRoleId:f.a.role}}));await assert.rejects(db.projectRequirement.update({where:{id:f.req.id},data:{sourceId:f.sourceA}}));await verifySelectionDeletion(f);}finally{await store.close();}});
