import {test} from 'node:test';
import {fixture} from '../support/fixtures.ts';
import {verifyManualMaintenance} from '../support/talent-manual-maintenance.ts';
test('manual height dismissal and credential identifier erasure require human confirmation, scope and atomic audit',async()=>{await verifyManualMaintenance(await fixture());});
