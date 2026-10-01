import {collectionFinalizationScenario} from '../support/media-collections-finalization.ts';
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {collectionScenario,collectionSecurityScenario,collectionEnrollScenario,collectionExportScenario,collectionMergeScenario,collectionRebuildScenario} from '../support/media-collections.ts';
const url=process.env.DATABASE_URL_COLLECTION_TEST;
assert.ok(process.env.ALLOW_DB_TESTS==='yes'&&url&&new URL(url).pathname.startsWith('/once_test_'));
const db=new PrismaClient({datasources:{db:{url}},log:[]}),store=new PrismaStore(db);
try{assert.equal(await db.workspace.count(),0);if(process.env.COLLECTION_FINALIZATION==='yes'){console.log(JSON.stringify(await collectionFinalizationScenario(store)));}else if(process.env.COLLECTION_EXPORT==='yes'){const raw=process.env.DATABASE_URL_COLLECTION_REBUILD_TEST;assert.ok(raw);const target=new PrismaStore(new PrismaClient({datasources:{db:{url:raw}},log:[]}));try{console.log(JSON.stringify(await collectionRebuildScenario(store,target)));}finally{await target.close();}}else if(process.env.COLLECTION_MERGE==='yes'){console.log(JSON.stringify(await collectionMergeScenario(store)));}else if(process.env.COLLECTION_ENROLL==='yes'){console.log(JSON.stringify(await collectionEnrollScenario(store)));}else if(process.env.COLLECTION_SECURITY==='yes'){console.log(JSON.stringify(await collectionSecurityScenario(store)));}else{const {checks,collection,first}=await collectionScenario(store);
 await assert.rejects(db.mediaCollection.update({where:{id:collection.id},data:{coverAssetId:crypto.randomUUID()}}));checks.push('pg-cover-fk');
 const c=await db.mediaCollection.findUniqueOrThrow({where:{id:collection.id}});await assert.rejects(db.mediaCollection.create({data:{...c,id:crypto.randomUUID(),coverAssetId:null}}));checks.push('pg-one-current-version');
 const item=await db.mediaCollectionItem.findFirstOrThrow({where:{collectionId:c.id}});await assert.rejects(db.mediaCollectionItem.create({data:{...item,id:crypto.randomUUID()}}));checks.push('pg-unique-asset-and-order');
 await assert.rejects(db.mediaCollectionItem.update({where:{id:item.id},data:{personId:crypto.randomUUID()}}));checks.push('pg-same-person-fk');
 assert.equal((await db.mediaAsset.findUniqueOrThrow({where:{id:first}})).usageState,'ADOPTED');console.log(JSON.stringify({checks}));
}}finally{await store.close();}
