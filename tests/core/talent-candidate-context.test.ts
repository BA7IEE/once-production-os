import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,member,result,sourceInput} from '../support/fixtures.ts';
import {verifyCandidateRoleContext,verifyLegacyCandidateEnrollment} from '../support/talent-v2-merge.ts';
test('TD2 candidate creation, visibility and human role review require matching current occupational credits and all visible dependencies',async()=>{
    const f=await fixture();await verifyCandidateRoleContext(f.app,f.store,f.clock,f.owner);
});

test('TD2 runtime enrollment makes old candidate occupations explicitly pending with atomic rollback and replay',async()=>{
    const f=await fixture();await verifyLegacyCandidateEnrollment(f.app,f.store,f.clock,f.owner);
});
test('TD2 enrollment refuses hidden shortlist dependencies without creating a partial professional profile',async()=>{
    const f=await fixture(),id=result(await f.owner.cmd('POST','/people',{displayName:'合成隐藏候选升级',roles:['model'],inlineSource:sourceInput()})).resourceId;
    const p=f.store.rows('people').find(r=>r.id===id)!,list=result(await f.owner.cmd('POST','/shortlists',{title:'合成隐藏清单',scopeId:p.scopeId})).resourceId;
    await f.owner.cmd('POST',`/shortlists/${list}/items`,{expectedRevision:1,personId:id,note:'合成',workAssetIds:[]});
    await f.store.transaction(async tx=>{const root=(await tx.get('shortlists',list))!;await tx.replace('shortlists',{...root,scopeId:randomUUID()});});
    assert.equal((await f.owner.cmd('POST',`/td2/people/${id}/enroll`,{schemaVersion:'once-talent-v2.0.0',expectedRevision:p.revision,sourceRevision:1})).status,404);
    assert.equal(f.store.rows('talentProfiles').filter(r=>r.personId===id).length,0);assert.equal(f.store.rows('talentMigrationReviews').filter(r=>r.personId===id).length,0);
});

test('TD2 pending candidate review exposes no person or role details to a shared read-only member',async()=>{
    const f=await fixture(),viewer=await member(f,'candidate_viewer','VIEWER'),scope=f.store.rows('scopes').find(r=>r.mode==='WORKSPACE')!.id;
    const source=result(await f.owner.cmd('POST','/sources',sourceInput())).resourceId;
    const id=result(await f.owner.cmd('POST','/people',{displayName:'合成只读待核实',roles:['model'],sourceId:source})).resourceId;
    for(const [kind,recordId] of [['source',source],['person',id]]) assert.equal((await f.owner.cmd('PATCH',`/records/${kind}/${recordId}/scope`,{expectedRevision:1,scopeId:scope})).status,200);
    const list=result(await f.owner.cmd('POST','/shortlists',{title:'合成只读清单',scopeId:scope})).resourceId;
    assert.equal((await f.owner.cmd('POST',`/shortlists/${list}/items`,{expectedRevision:1,personId:id,note:'未核实备注',workAssetIds:[]})).status,200);
    assert.equal((await f.owner.cmd('POST',`/td2/people/${id}/enroll`,{schemaVersion:'once-talent-v2.0.0',expectedRevision:2,sourceRevision:2})).status,200);
    const ownerView=result(await f.owner.raw('GET',`/shortlists/${list}`));assert.ok(ownerView.items[0].roleReview);
    const response=await viewer.client.raw('GET',`/shortlists/${list}`);assert.equal(response.status,200);
    assert.deepEqual(result(response).items,[{id:ownerView.items[0].id,position:0,unavailable:true}]);
    assert.equal((await viewer.client.cmd('POST',`/td2/shortlists/${list}/role`,{schemaVersion:'once-talent-v2.0.0',expectedRevision:3,itemId:ownerView.items[0].id,personRoleId:ownerView.items[0].roleReview.roles[0].id,personRoleRevision:1})).status,403);
});
