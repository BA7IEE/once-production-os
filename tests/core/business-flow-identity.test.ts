import {test} from 'node:test';
import {fixture} from '../support/fixtures.ts';
import {verifyBusinessIdentity} from '../support/business-flow-identity.ts';
test('typed-origin identity updates and narrow archive restore retain provenance with atomic receipts',async()=>{await verifyBusinessIdentity(await fixture());});
