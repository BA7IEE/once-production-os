import {test} from 'node:test';
import {fixture} from '../support/fixtures.ts';
import {verifyClearedCredentialRetention} from '../support/talent-credential-retention.ts';
test('revoked credential survives explicit secret clearance and source erasure as history only',async()=>{await verifyClearedCredentialRetention(await fixture());});
