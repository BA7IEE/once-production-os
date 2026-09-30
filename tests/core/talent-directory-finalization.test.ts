import {test} from 'node:test';
import {fixture} from '../support/fixtures.ts';
import {verifyDirectoryFinalization} from '../support/talent-directory-finalization.ts';
test('PR01b finalization OR/AND, complete facets, conservative presets and explicit candidate role',async()=>{await verifyDirectoryFinalization(await fixture());});
