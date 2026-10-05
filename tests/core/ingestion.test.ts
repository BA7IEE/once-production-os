import {test} from 'node:test';
import {MemoryStore} from '../support/memory-store.ts';
import {ingestionExport,ingestionRebuild,ingestionLifecycle} from '../support/ingestion-lifecycle.ts';
import {verifyIngestion} from '../support/ingestion.ts';
test('external Agent ingestion shares guarded submission and atomic human review',async()=>{const s=new MemoryStore();const r=await verifyIngestion(s,async()=>{s.failNextAudit=true;},async()=>{s.failNextAudit=false;});const payload=await ingestionExport(r);await ingestionRebuild(r,new MemoryStore(),payload);await ingestionLifecycle(r);});
