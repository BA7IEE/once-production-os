import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,result} from '../support/fixtures.ts';
import {seedRoleCandidates,verifyRoleCandidateMerge,verifyUnknownRoleCandidateMerge,mergePreview,mergeInput} from '../support/talent-v2-merge.ts';

test('TD2 identity merge preserves separate role candidates, notes and inactive role context with atomic retry',async()=>{
    const f=await fixture();await verifyRoleCandidateMerge(f.app,f.store,f.clock,f.owner);
});
test('TD2 shortlist scope loss hides candidate acknowledgements and shortlist changes stale previews',async()=>{
    for(const mode of ['scope','note','root']) {
        const f=await fixture(),g=await seedRoleCandidates(f.app,f.store,f.clock,f.owner),p=await mergePreview(f.store,f.owner,g.a.personId,g.b.personId);
        await f.store.transaction(async tx=>{
            if(mode==='note'){const row=(await tx.get('shortlistItems',g.ids[2]!))!;await tx.replace('shortlistItems',{...row,note:'变更后的协作说明',revision:row.revision+1});}
            else{const row=(await tx.get('shortlists',g.list))!;await tx.replace('shortlists',{...row,...(mode==='scope'?{scopeId:randomUUID()}:{title:'变更后的候选清单',revision:row.revision+1})});}
        });
        assert.equal((await f.owner.cmd('POST','/people/merge',mergeInput(p))).status,409);
        if(mode==='scope') {
            const hidden=await mergePreview(f.store,f.owner,g.a.personId,g.b.personId);assert.equal(hidden.complete,false);assert.equal(hidden.professional.restricted,true);assert.deepEqual(hidden.professional.items,[]);
        }
    }
});
test('TD2 unknown-role collisions preserve both pending reviews with explicit choice, atomic retry and later human role binding',async()=>{
    const f=await fixture();await verifyUnknownRoleCandidateMerge(f.app,f.store,f.clock,f.owner);
});
test('TD2 selected media requires current asset permission and its links bind the merge preview',async()=>{
    const f=await fixture(),g=await seedRoleCandidates(f.app,f.store,f.clock,f.owner);
    const {base}=await import('../../packages/core/src/helpers.ts'),{scanTalentMerge}=await import('../../packages/core/src/talent-v2-merge.ts');
    const actor=await f.store.transaction(tx=>f.app.identity.authenticate(tx,f.owner.jar.once_session!));
    const asset={...base(f.workspaceId,f.clock),uploadId:randomUUID(),sourceId:g.b.sourceId,scopeId:(await g.b.current()).scopeId,objectToken:randomUUID(),personId:g.b.personId,fileName:'synthetic.png',mime:'image/png',sha256:'a'.repeat(64),previewHash:'b'.repeat(64),state:'READY' as const,bytes:30,width:3,height:3,previewBytes:30};
    await f.store.transaction(tx=>tx.insert('assets',asset));
    const work=result(await f.owner.cmd('POST','/works',{title:'合成候选选图',sourceId:g.b.sourceId})).resourceId;
    assert.equal((await f.owner.cmd('POST',`/works/${work}/assets`,{expectedRevision:1,assetId:asset.id})).status,200);
    assert.equal((await f.owner.cmd('POST',`/works/${work}/credits`,{expectedRevision:2,personId:g.b.personId,roleCode:'model',note:'合成署名'})).status,200);
    const workAsset=f.store.rows('workAssets').find(r=>r.workId===work)!;
    assert.equal((await f.owner.cmd('POST',`/shortlists/${g.list}/items`,{expectedRevision:f.store.rows('shortlists').find(r=>r.id===g.list)!.revision,personId:g.b.personId,personRoleId:g.b.roleId,personRoleRevision:1,workId:work,workAssetIds:[workAsset.id],note:'保留选图'})).status,200);
    const visible=await f.store.transaction(tx=>scanTalentMerge(tx,actor,f.clock,g.a.personId,g.b.personId));assert.equal(visible.preview.restricted,false);
    const hidden=await f.store.transaction(tx=>scanTalentMerge(tx,{...actor,permissions:actor.permissions.filter(p=>p!=='assets.read')},f.clock,g.a.personId,g.b.personId));
    assert.equal(hidden.preview.restricted,true);assert.deepEqual(hidden.preview.items,[]);
    await f.store.transaction(tx=>tx.remove('shortlistItemAssets',f.store.rows('shortlistItemAssets')[0]!.id));
    const changed=await f.store.transaction(tx=>scanTalentMerge(tx,actor,f.clock,g.a.personId,g.b.personId));assert.notEqual(changed.digest,visible.digest);
});

test('TD2 candidate review changes stale merge plans and oversized lineage blocks the merge',async()=>{
    const f=await fixture(),g=await seedRoleCandidates(f.app,f.store,f.clock,f.owner),reviewId=randomUUID();
    await f.store.transaction(async tx=>{
        for(const id of [g.ids[0]!,g.ids[2]!]){const row=(await tx.get('shortlistItems',id))!;await tx.replace('shortlistItems',{...row,personRoleId:null,personRoleRevision:null,roleContextState:'LEGACY_REVIEW'});}
        await tx.insert('talentMigrationReviews',{id:reviewId,workspaceId:f.workspaceId,createdAt:f.clock.now().toISOString(),updatedAt:f.clock.now().toISOString(),revision:1,personId:g.b.personId,shortlistItemId:g.ids[2]!,previousShortlistItemIds:[],reason:'SHORTLIST_ROLE_REQUIRED',state:'PENDING',resolvedAt:null,resolvedById:null});
    });
    const p=await mergePreview(f.store,f.owner,g.a.personId,g.b.personId);assert.equal(p.complete,true);
    await f.store.transaction(async tx=>{const r=(await tx.get('talentMigrationReviews',reviewId))!;await tx.replace('talentMigrationReviews',{...r,revision:r.revision+1});});
    assert.equal((await f.owner.cmd('POST','/people/merge',mergeInput(p))).status,409);
    assert.ok(f.store.rows('shortlistItems').some(r=>r.id===g.ids[2]));
    await f.store.transaction(async tx=>{const r=(await tx.get('talentMigrationReviews',reviewId))!;await tx.replace('talentMigrationReviews',{...r,previousShortlistItemIds:Array.from({length:100},()=>randomUUID())});});
    const bounded=await mergePreview(f.store,f.owner,g.a.personId,g.b.personId);assert.equal(bounded.complete,false);assert.ok(bounded.blockers.some((b:any)=>b.code==='TD2_MERGE_LIMIT'));
});
