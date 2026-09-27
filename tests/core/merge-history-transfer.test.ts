import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,result} from '../support/fixtures.ts';
import {mergeHistoryTransfer} from '../support/merge-history-transfer.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import {collectTalentTransfer} from '../../packages/core/src/talent-transfer.ts';
import {inspectTalentIntegrity} from '../../packages/core/src/talent-v2-integrity.ts';
const setup=async()=>{const f=await fixture();return {f,t:await mergeHistoryTransfer(f)};};
test('merge history rebuild preserves immutable alias, archived identity, retained profiles and original actor without replaying a merge',async()=>{
 const {t}=await setup(),target=await fixture(),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
 target.store.failNextAudit=true;await assert.rejects(target.store.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'})),/injected audit/);assert.equal(target.store.rows('people').length,0);assert.equal(target.store.rows('personAliases').length,0);
 await target.store.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'}));
 const h=t.download.payload.manifest.talent.mergeHistory;assert.equal(h.people.length,1);assert.equal(h.talentProfiles.length,1);assert.equal(h.castingProfiles.length,1);
 assert.equal(target.store.rows('people').find(p=>p.id===t.oldPersonId)!.status,'ARCHIVED');assert.equal(target.store.rows('personMerges')[0]!.actorId,null);assert.equal(target.store.rows('personMerges')[0]!.originalActorMembershipId,t.actor.membershipId);assert.equal(target.store.rows('memberships').length,1);
 assert.equal(result(await target.owner.raw('GET',`/people/${t.personId}/merge-history`)).items.length,2);
 assert.equal((await target.owner.raw('GET',`/td2/people/${t.oldPersonId}`)).status,404);
 const b=t.download.payload.manifest.talent,again=await target.store.transaction(tx=>collectTalentTransfer(tx,actor,target.clock,[t.personId],b.selectedFields,true,false,false,undefined,true));
 // The target bumps protectionEpoch; history content and all old UUIDs/attribution are unchanged.
 const expected=structuredClone(h);expected.people[0].protectionEpoch++;assert.deepEqual(again.mergeHistory,expected);
 assert.equal((await target.store.transaction(tx=>inspectTalentIntegrity(tx,actor.workspaceId,target.app.config.contactKey))).relationFailures,0);
});
test('merge history rejects cross-identity mapping, missing current profile or retired measurement, forged actor and unknown manifest payload',async()=>{
 const {t}=await setup(),target=await fixture(),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
 for(const mode of ['alias','decision','profile','measurement','actor','payload','evidence','time']) {
  const p=structuredClone(t.download.payload),h=p.manifest.talent.mergeHistory;
  if(mode==='alias')h.aliases[0].canonicalPersonId=randomUUID();if(mode==='decision')h.decisions[0].duplicateSourceId=randomUUID();if(mode==='profile')h.talentProfiles[0].supersededById=randomUUID();if(mode==='measurement')h.castingProfiles[0].retiredCurrentMeasurementSetId=randomUUID();if(mode==='actor')h.decisions[0].actorId=actor.membershipId;if(mode==='payload')h.decisions[0].decisionManifest.secret='unknown';if(mode==='evidence')h.evidence[0].ownerId=randomUUID();if(mode==='time')h.decisions[0].completedAt='2099-01-01T00:00:00.000Z';
  await assert.rejects(target.store.transaction(tx=>rebuild.apply(tx,actor,p,{requestId:randomUUID(),ip:'test'})),undefined,mode);assert.equal(target.store.rows('people').length,0);
 }
});
test('historical identity scope and explicit history or evidence grant remain required',async()=>{
 const {f,t}=await setup(),b=t.download.payload.manifest.talent;
 await assert.rejects(f.store.transaction(tx=>collectTalentTransfer(tx,{...t.actor,permissions:t.actor.permissions.filter(p=>p!=='data.merge')},f.clock,[t.personId],b.selectedFields,true,false,false,undefined,true)),(e:any)=>e.status===403);
 await assert.rejects(f.store.transaction(tx=>collectTalentTransfer(tx,t.actor,f.clock,[t.personId],b.selectedFields,false,false,false,undefined,true)),/字段依据/);
 assert.equal((await f.owner.cmd('POST','/exports',{...t.input,usePermissionRefs:t.input.usePermissionRefs.slice(0,2)})).status,422);
 await f.store.transaction(async tx=>{const p=(await tx.get('people',t.oldPersonId))!;await tx.replace('people',{...p,scopeId:randomUUID()});});assert.equal((await f.owner.raw('POST',`/exports/${t.jobId}/download`,{})).status,409);
});
