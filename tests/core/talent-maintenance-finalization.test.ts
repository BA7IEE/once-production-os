import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../support/memory-store.ts';
import {verifyTalentMaintenance,exportMaintenance} from '../support/talent-maintenance.ts';
import {verifyMaintenanceFinalization} from '../support/talent-maintenance-finalization.ts';
import {isolateTalentAuth} from '../../packages/core/src/talent-auth.ts';

test('PR02b finalization: exact terminal replay, complete ENROLL rejection and scoped source text',async()=>{
 const store=new MemoryStore(),{f,grantId}=await verifyTalentMaintenance(store),result=await verifyMaintenanceFinalization(f,grantId);
 const payload=JSON.stringify(await exportMaintenance(f));
 for(const hidden of [result.rejectedClaim.id,result.rejectedSubmissionId,result.rejectedText,result.ownershipBasis])assert.ok(!payload.includes(hidden),'ordinary business export excludes rejected enrollment and internal decision');
 const workspace=store.rows('workspaces')[0]!;
 await store.transaction(tx=>isolateTalentAuth(tx,workspace.id,f.clock));
 assert.deepEqual(await store.transaction(tx=>tx.get('talentClaims',result.rejectedClaim.id)),result.rejectedClaim,'recovery preserves the terminal decision and never reopens its reservation');
 assert.equal((await store.transaction(tx=>tx.get('talentSubmissions',result.rejectedSubmissionId)))!.state,'REJECTED');
});
