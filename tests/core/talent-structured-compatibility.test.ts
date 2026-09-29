import {test} from 'node:test';
import {fixture} from '../support/fixtures.ts';
import {verifyStructuredCompatibility} from '../support/talent-structured-compatibility.ts';
test('legacy structured search shares current occupations, same-work matching, current reviews and complete facets',async()=>{const f=await fixture();await verifyStructuredCompatibility(f.owner);});
