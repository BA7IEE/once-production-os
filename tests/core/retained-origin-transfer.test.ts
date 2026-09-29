import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from '../support/fixtures.ts';
import {roundTripRetainedOrigin,exportRetainedOrigin} from '../support/retained-origin-transfer.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import {collectTalentTransfer} from '../../packages/core/src/talent-transfer.ts';
test('TD2 retained-origin export and rebuild keep erased source inert and preserve independently reviewed language, with audit rollback and repeat transfer',async()=>{await roundTripRetainedOrigin(await fixture(),await fixture());});
test('TD2 retained-origin rebuild rejects missing or altered independent proof and active or colliding origin headers before writes',async()=>{
 const t=await exportRetainedOrigin(await fixture()),target=await fixture(),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
 for(const mode of ['missing','digest','revision','expiry','active','collision','unused','payload','live-owner']) {
  const p=structuredClone(t.download.payload),b=p.manifest.talent,e=b.evidence.find((e:any)=>e.ownerId===t.s.languageId&&e.fieldPath==='languageCode');
  if(mode==='missing')b.evidence=b.evidence.filter((r:any)=>r.id!==e.id);
  if(mode==='digest')e.valueDigest='a'.repeat(64);
  if(mode==='revision')e.sourceRevision++;
  if(mode==='expiry')p.manifest.sources.find((s:any)=>s.id===e.sourceId).data.validUntil='2026-09-23T07:59:00.000Z';
  if(mode==='active')b.retainedOrigins[0].status='CONFIRMED';
  if(mode==='collision')b.retainedOrigins[0].id=p.manifest.sources[0].id;
  if(mode==='unused')b.retainedOrigins[0].id=randomUUID();
  if(mode==='payload')b.retainedOrigins[0].providerClaim='must not migrate erased payload';
  if(mode==='live-owner')p.manifest.people[0].sourceId=b.retainedOrigins[0].id;
  await assert.rejects(target.store.transaction(tx=>rebuild.apply(tx,actor,p,{requestId:randomUUID(),ip:'test'})),undefined,mode);assert.equal(target.store.rows('sources').length,0);assert.equal(target.store.rows('people').length,0);
 }
});
test('TD2 retained-origin transfer still requires evidence selection and current basis grant; erased origin scope changes invalidate ready exports',async()=>{
 for(const mode of ['grant','scope']) {
  const f=await fixture(),t=await exportRetainedOrigin(f),actor=await f.store.transaction(tx=>f.app.identity.authenticate(tx,f.owner.jar.once_session!));
  await assert.rejects(f.store.transaction(tx=>collectTalentTransfer(tx,actor,f.clock,[t.s.g.personId],['person.td2.personLanguages'])),(e:any)=>e.code==='TD2_RETAINED_ORIGIN_EVIDENCE_REQUIRED');
  if(mode==='grant')assert.equal((await f.owner.cmd('POST',`/use-permissions/${t.basisPermission}/revoke`,{expectedRevision:1})).status,200);
  else await f.store.transaction(async tx=>{const origin=(await tx.get('sources',t.s.sourceId))!;await tx.replace('sources',{...origin,scopeId:randomUUID()});});
  assert.equal((await f.owner.raw('POST',`/exports/${t.jobId}/download`,{})).status,409);
 }
});
test('TD2 retained-origin rebuild preserves explicitly unreviewed evidence without inventing reviewer attribution',async()=>{
 const t=await exportRetainedOrigin(await fixture()),target=await fixture(),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
 const p=structuredClone(t.download.payload);for(const e of p.manifest.talent.evidence)e.originalReview=null;
 await target.store.transaction(tx=>rebuild.apply(tx,actor,p,{requestId:randomUUID(),ip:'test'}));
 for(const e of target.store.rows('evidence')){assert.equal(e.reviewerId,null);assert.equal(e.reviewedAt,null);assert.equal(e.originalReviewMembershipId,null);}
 const detail=await target.owner.raw('GET',`/td2/people/${t.s.g.personId}`);assert.equal(detail.status,200);
});
