import {test} from 'node:test';
import {MemoryStore} from '../support/memory-store.ts';
import {ingestionRejectionScenario} from '../support/ingestion-rejection.ts';
test('MACHINE stale intake rejection is metadata-only, currently authorized, atomic and retention-safe',async()=>{
 await ingestionRejectionScenario(new MemoryStore());
});
