import test from 'node:test';
import assert from 'node:assert/strict';
import {TalentBasisTransferSchema} from '../../packages/core/src/rebuild-validation.ts';
import {reviewBasisSnapshot,consentBasisSnapshot,malformedReviewSnapshots} from '../support/imported-review-basis.ts';
test('rebuild rejects malformed imported review provenance and retains both legitimate branches',()=>{
 for(const {name,value}of malformedReviewSnapshots())assert.throws(()=>TalentBasisTransferSchema.parse(value),name);
 assert.throws(()=>TalentBasisTransferSchema.parse({...reviewBasisSnapshot(),fieldScope:['\u0000']}),'rebuild must reject NUL unsupported by PostgreSQL JSON/text');
 for(const value of [reviewBasisSnapshot(),{...reviewBasisSnapshot(),fieldScope:['😀'.repeat(60)],validUntil:'2024-02-29T23:59:59.999Z'},consentBasisSnapshot(),{...consentBasisSnapshot(),version:'talent-basis-v2',fieldScope:['media','work']}])assert.deepEqual(TalentBasisTransferSchema.parse(value),value);
});
