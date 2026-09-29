import {mkdtemp,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {adultTransfer} from '../support/adult-transfer.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,result} from '../support/fixtures.ts';
import {identityTransfer} from '../support/identity-transfer.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import {collectTalentTransfer} from '../../packages/core/src/talent-transfer.ts';
import {SOURCE_FIELDS} from '../support/talent-transfer.ts';
import {IDENTITY_EVIDENCE_CODE} from '../../packages/core/src/identity-transfer.ts';
const setup=async()=>{const f=await fixture();return {f,t:await identityTransfer(f)};};
test('ordinary contact identity evidence rebuild keeps IDs and original review; audit failure rolls back then retry succeeds',async()=>{
 const {t}=await setup(),target=await fixture(),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
 const preview=await target.store.transaction(tx=>rebuild.preview(tx,actor,t.download.payload));assert.equal(preview.fieldEvidence,3);assert.equal(preview.professionalRecords,0);
 target.store.failNextAudit=true;await assert.rejects(target.store.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'})),/injected audit/);
 assert.equal(target.store.rows('people').length,0);assert.equal(target.store.rows('evidence').length,0);
 await target.store.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'}));
 assert.equal(target.store.rows('talentProfiles').length,0);assert.equal(target.store.rows('memberships').length,1);
 const b=t.download.payload.manifest.talent,again=await target.store.transaction(tx=>collectTalentTransfer(tx,actor,target.clock,[t.personId],[],false,false,false,b.identityFields));
 assert.deepEqual(again.identityEvidence,b.identityEvidence);for(const e of target.store.rows('evidence')){assert.equal(e.reviewerId,null);assert.equal(e.originalReviewMembershipId,t.actor.membershipId);}
});
test('identity evidence needs person, field and actual source permission; review rights and current scope are rechecked',async()=>{
 const {f,t}=await setup();
 for(const fields of [[...SOURCE_FIELDS,IDENTITY_EVIDENCE_CODE],[...SOURCE_FIELDS,'person.displayName']]) {
  const grant=result(await f.owner.cmd('POST','/use-permissions',{subjectKind:'SOURCE',subjectId:t.other,sourceId:t.other,fields,validUntil:'2026-10-01T00:00:00.000Z',evidenceNote:'合成：不完整的来源许可'})).resourceId;
  assert.equal((await f.owner.cmd('POST','/exports',{...t.input,usePermissionRefs:[...t.input.usePermissionRefs.slice(0,2),grant]})).status,422);
 }
 await assert.rejects(f.store.transaction(tx=>collectTalentTransfer(tx,{...t.actor,permissions:t.actor.permissions.filter(p=>p!=='sources.review')},f.clock,[t.personId],[],false,false,false,['person.displayName'])),(e:any)=>e.status===403);
 await f.store.transaction(async tx=>{const source=(await tx.get('sources',t.other))!;await tx.replace('sources',{...source,scopeId:randomUUID()});});
 assert.equal((await f.owner.raw('POST',`/exports/${t.jobId}/download`,{})).status,409);
});
test('missing identity owner or selected field, bad source version, duplicate ID and review metadata fail before writes',async()=>{
 const {t}=await setup(),target=await fixture(),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
 for(const mode of ['owner','field','omittedField','source','duplicate','future','review','secret']) {
  const p=structuredClone(t.download.payload),e=p.manifest.talent.identityEvidence[0];
  if(mode==='owner')e.personId=randomUUID();if(mode==='field')e.fieldPath='identifierCiphertext';if(mode==='omittedField')delete p.manifest.people[0].data[e.fieldPath];
  if(mode==='source')e.sourceRevision=999;if(mode==='duplicate')p.manifest.talent.identityEvidence.push(e);if(mode==='future')e.updatedAt='2099-01-01T00:00:00.000Z';
  if(mode==='review')e.originalReview.reviewedAt='2000-01-01T00:00:00.000Z';if(mode==='secret')e.rawText='not allowed';
  await assert.rejects(target.store.transaction(tx=>rebuild.apply(tx,actor,p,{requestId:randomUUID(),ip:'test'})),undefined,mode);assert.equal(target.store.rows('people').length,0);assert.equal(target.store.rows('evidence').length,0);
 }
});
test('identity evidence changes and evidence-only source grant revocation stale queued and ready files',async()=>{
 for(const mode of ['change','grant']) {
  const {f,t}=await setup(),job=result(await f.owner.cmd('POST','/exports',t.input)).resourceId;
  if(mode==='grant')assert.equal((await f.owner.cmd('POST',`/use-permissions/${t.input.usePermissionRefs[2]}/revoke`,{expectedRevision:1})).status,200);
  else await f.store.transaction(async tx=>{const e=(await tx.find('evidence',{personId:t.personId,sourceId:t.other}))[0]!;await tx.replace('evidence',{...e,valueDigest:'a'.repeat(64)});});
  const claim=await f.app.exports.claim();assert.ok(claim);assert.equal(claim.id,job);await f.app.exports.process(claim);assert.equal(f.store.rows('exports').find(e=>e.id===job)!.state,'STALE');
  assert.equal((await f.owner.raw('POST',`/exports/${t.jobId}/download`,{})).status,409);
 }
});
test('identity transfer preserves previous value digests and excludes unselected fields; old formats reject new identity sections',async()=>{
 const {f,t}=await setup(),before=t.download.payload.manifest.talent.identityEvidence;
 const changed=await f.owner.cmd('PATCH',`/td2/people/${t.personId}`,{schemaVersion:'once-talent-v2.0.0',expectedRevision:(await t.current()).revision,displayName:'合成联系人更正名称'});assert.equal(changed.status,200);
 assert.equal((await f.owner.cmd('POST','/exports',t.input)).status,409,'new value without current supporting evidence cannot export');
 assert.equal((await f.owner.cmd('POST','/td2/evidence',{schemaVersion:'once-talent-v2.0.0',ownerKind:'person',ownerId:t.personId,fieldPath:'displayName',expectedRevision:(await t.current()).revision,sourceId:t.source,sourceRevision:1})).status,200);
 const bundle=await f.store.transaction(tx=>collectTalentTransfer(tx,t.actor,f.clock,[t.personId],[],false,false,false,['person.displayName','person.aliases']));
 for(const e of before)assert.deepEqual(bundle.identityEvidence!.find(x=>x.id===e.id),e);assert.equal(bundle.identityEvidence!.length,4);assert.ok(bundle.identityEvidence!.every(e=>e.fieldPath!=='intro'));
 const p=structuredClone(t.download.payload);p.manifest.talent.schemaVersion='once-talent-transfer-v9';
 const target=await fixture(),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));await assert.rejects(target.store.transaction(tx=>rebuild.preview(tx,actor,p)));
});

test('v10 identity evidence can accompany verified adult, credential and shared collection media without downgrading them',async()=>{
 const dir=await mkdtemp(join(await realpath(tmpdir()),'once-identity-combined-'));try {
  const f=await fixture(),t=await adultTransfer(f,join(dir,'media'));
  const bundle=await f.store.transaction(tx=>collectTalentTransfer(tx,t.actor,f.clock,t.input.selectedIds.people,t.download.payload.manifest.talent.selectedFields,true,true,true,['person.displayName']));
  assert.equal(bundle.schemaVersion,'once-talent-transfer-v14');assert.equal(bundle.assets!.length,1);assert.equal(bundle.tables.personCredentials.find(r=>r.id===t.graph.credentialId)!.data.status,'VERIFIED');assert.equal(bundle.tables.adultEligibilities[0].data.state,'VERIFIED_ADULT');
  const target=await fixture(),rebuild=new JsonRebuild(target.clock,{sourceContactKey:f.app.config.contactKey,targetContactKey:target.app.config.contactKey}),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
  const p=structuredClone(t.download.payload);p.manifest.talent=bundle;await target.store.transaction(tx=>rebuild.preview(tx,actor,p));
 }finally{await rm(dir,{recursive:true,force:true});}
});
