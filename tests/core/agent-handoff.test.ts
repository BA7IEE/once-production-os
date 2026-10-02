import test from 'node:test';
import {MemoryStore} from '../support/memory-store.ts';
import {handoffScenario,handoffCounterexample,handoffVariants} from '../support/agent-handoff.ts';
test('same Person MACHINE → CLAIM → explicit exposure → true Talent maintenance independent provenance',async()=>{await handoffScenario(new MemoryStore());});
for(const v of handoffVariants)test('same Person handoff counterexample '+v,async()=>{await handoffCounterexample(new MemoryStore(),v);});
import {handoffExport} from '../support/agent-handoff.ts';
test('same Person mixed provenance business JSON export/rebuild no authorization recreated',async()=>{await handoffExport(new MemoryStore(),new MemoryStore());});
