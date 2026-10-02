import test from 'node:test';
import {MemoryStore} from '../support/memory-store.ts';
import {agentStructuresScenario,agentStructuresCounterexample} from '../support/agent-structures.ts';
test('MACHINE Collection/Work atomic adoption, explicit update, shared Work LINK and exact Credit reuse',async()=>{await agentStructuresScenario(new MemoryStore());});
export const variants=['asset-id','role-id','source-id','collection-id','work-id','scope-id','missing-media','not-ready','type','mime','role-key','graph','partial','decision','duplicate','role','tag','order','collection-cover','cover','work-facts','work-assets','credit','source','legacy'];
for(const variant of variants)test('MACHINE Collection/Work fail-closed '+variant,async()=>{await agentStructuresCounterexample(new MemoryStore(),variant);});
import {agentStructuresLifecycle,agentStructuresProtection} from '../support/agent-structures.ts';
test('MACHINE Collection/Work actual business JSON export and verified rebuild preserve provenance without rebuilding auth',async()=>{await agentStructuresLifecycle(new MemoryStore(),new MemoryStore());});
for(const kind of ['PERSON','MERGE'] as const)test('MACHINE Collection/Work lifecycle '+kind,async()=>{await agentStructuresProtection(new MemoryStore(),kind);});
import {agentStructuresPartialIsolation} from '../support/agent-structures.ts';
test('MACHINE Collection/Work valid closed partial approval and cross-Agent isolation',async()=>{await agentStructuresPartialIsolation(new MemoryStore());});
import {agentStructuresBasisRevocation} from '../support/agent-structures.ts';
test('MACHINE INTERNAL_REVIEW basis revoke invalidates formal projections',async()=>{await agentStructuresBasisRevocation(new MemoryStore());});

test('MACHINE full-length batch and Work review bases remain complete and export/rebuild compatible',async()=>{await agentStructuresLifecycle(new MemoryStore(),new MemoryStore(),true);});
