import test from 'node:test';
import {MemoryStore} from '../support/memory-store.ts';
import {collectionScenario} from '../support/media-collections.ts';
test('PR03C collection draft, adoption, cover, ordering, existing reference and rollback',async()=>{await collectionScenario(new MemoryStore());});
import {collectionSecurityScenario} from '../support/media-collections.ts';
test('PR03C current formal ownership, MIME, purpose, concurrency and revocation',async()=>{await collectionSecurityScenario(new MemoryStore());});
import {collectionEnrollScenario} from '../support/media-collections.ts';
test('PR03C unbound ENROLL collection and actual Person deletion protection',async()=>{await collectionEnrollScenario(new MemoryStore());});
import {collectionExportScenario,collectionMergeScenario} from '../support/media-collections.ts';
test('PR03C actual JSON export worker preserves formal collections and excludes drafts',async()=>{await collectionExportScenario(new MemoryStore());});
test('PR03C actual Person merge moves safe collections and blocks old talent authority',async()=>{await collectionMergeScenario(new MemoryStore());});
import {collectionRebuildScenario} from '../support/media-collections.ts';
test('PR03C JSON rebuild preserves collections with no external accounts/grants/drafts',async()=>{await collectionRebuildScenario(new MemoryStore(),new MemoryStore());});

import assert from 'node:assert/strict';
import {assertCollectionTags} from '../../packages/core/src/media-collections.ts';
test('PR03C versioned tag catalog rejects inactive, unknown and duplicate authoring values',()=>{
 const catalog=[{code:'FASHION',status:'ACTIVE'},{code:'BEAUTY',status:'INACTIVE'}];
 assert.doesNotThrow(()=>assertCollectionTags(['FASHION'],catalog));
 for(const codes of [['BEAUTY'],['invented'],['FASHION','FASHION']])assert.throws(()=>assertCollectionTags(codes,catalog),{code:'COLLECTION_TAG_INVALID'});
});
