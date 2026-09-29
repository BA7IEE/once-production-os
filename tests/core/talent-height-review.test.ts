import {test} from 'node:test';
import {fixture} from '../support/fixtures.ts';
import {verifyHeightReview} from '../support/talent-height-review.ts';
test('shoe-only confirmation preserves ambiguous old height review; actual height resolves atomically',async()=>{await verifyHeightReview(await fixture());});
