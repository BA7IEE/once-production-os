import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unsupportedExperienceSurfaces,forbiddenNonGoalSurfaces} from '../../scripts/talent-experience-surface-policy.mjs';
test('unreviewed external and legacy-named publishing routes remain blocked',()=>{
 const routes=['/portal/profiles/{id}/upload','/casting/access/exchange','/casting-shares','/talent-invitations/{id}/send','/ingestion/uploads','/talent-publications','/works/{id}/publish','/anqicms/sync','/quotes'];
 assert.deepEqual(unsupportedExperienceSurfaces(routes),routes);
 assert.deepEqual(unsupportedExperienceSurfaces(['/directory/talents','/people','/td2/people','/ai-jobs']),[]);
});
test('internal directory acceptance never admits child paths or transactions/booking',()=>{
 assert.deepEqual(unsupportedExperienceSurfaces(['/directory/talents/share','/directory/talents/search']),['/directory/talents/share']);
 assert.deepEqual(forbiddenNonGoalSurfaces(['/payment','/booking/{id}','/crm','/invoice','/seo']),['/payment','/booking/{id}','/crm','/invoice','/seo']);
});

test('PR02b admits reviewed account and claim routes, never uploads',()=>{assert.deepEqual(unsupportedExperienceSurfaces(['/portal/auth/verify','/portal/me','/portal/auth/challenges']),[]);assert.deepEqual(unsupportedExperienceSurfaces(['/portal/claims','/portal/uploads']),['/portal/uploads']);});
