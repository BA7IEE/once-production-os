import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, member, result, sourceInput } from '../support/fixtures.ts';
import { verifyTalentEvidenceHistory } from '../support/talent-evidence-history.ts';
import { seedProfessionalGraph, expectResponse as ok } from '../support/talent-v2-maintenance.ts';

test('TD2 field evidence history separates current basis, changed values, suspended sources and original review attribution without exposing digests',async()=>{
 const f=await fixture();await verifyTalentEvidenceHistory(f.app,f.store,f.clock,f.owner);
});
test('TD2 field evidence pages and totals omit hidden sources; ordinary readers cannot access review history',async()=>{
 const f=await fixture(),g=await seedProfessionalGraph(f.app,f.store,f.clock,f.owner),reviewer=await member(f,'evidence_reviewer','REVIEWER'),viewer=await member(f,'evidence_viewer','VIEWER');
 const hidden=ok(await f.owner.cmd('POST','/sources',{...sourceInput(),title:'不可向复核成员展示的合成来源'})).resourceId;
 ok(await f.owner.cmd('POST','/td2/evidence',{schemaVersion:'once-talent-v2.0.0',ownerKind:'personLanguages',ownerId:g.languageId,fieldPath:'speakingLevelCode',expectedRevision:1,sourceId:hidden,sourceRevision:1}),200);
 const privateScope=ok(await f.owner.cmd('POST','/scopes',{name:'合成独立私有依据',membershipIds:[f.membershipId]})).resourceId;ok(await f.owner.cmd('PATCH',`/records/source/${hidden}/scope`,{expectedRevision:1,scopeId:privateScope}),200);
 const scope=ok(await f.owner.cmd('POST','/scopes',{name:'合成仅共享原依据',membershipIds:[f.membershipId,reviewer.id,viewer.id]})).resourceId;
 for(const [kind,id,revision] of [['person',g.personId,(await g.current()).revision],['source',g.sourceId,1]] as const)ok(await f.owner.cmd('PATCH',`/records/${kind}/${id}/scope`,{expectedRevision:revision,scopeId:scope}),200);
 const path=`/td2/evidence?ownerKind=personLanguages&ownerId=${g.languageId}&fieldPath=speakingLevelCode&page=1&pageSize=1`;
 assert.equal(ok(await f.owner.raw('GET',path),200).total,2);
 const visible=ok(await reviewer.client.raw('GET',path),200);assert.equal(visible.total,1);assert.equal(visible.items[0].source.id,g.sourceId);assert.equal(JSON.stringify(visible).includes(hidden),false);assert.equal(JSON.stringify(visible).includes('不可向复核成员'),false);
 assert.equal((await viewer.client.raw('GET',path)).status,403);
 const me=await f.store.transaction(tx=>f.app.identity.authenticate(tx,f.owner.jar.once_session!));
 await assert.rejects(f.store.transaction(tx=>f.app.talentV2.evidenceHistory(tx,{...me,permissions:me.permissions.filter(p=>p!=='sources.read')},{ownerKind:'personLanguages',ownerId:g.languageId,fieldPath:'speakingLevelCode'})),(e:any)=>e.status===403);
});
