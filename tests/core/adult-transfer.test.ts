import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,realpath,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {fixture,result} from '../support/fixtures.ts';
import {adultTransfer} from '../support/adult-transfer.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import {prepareRebuildMedia} from '../../scripts/rebuild-media.ts';
import {collectTalentTransfer} from '../../packages/core/src/talent-transfer.ts';
import {inspectTalentIntegrity} from '../../packages/core/src/talent-v2-integrity.ts';
const setup=async()=>{const dir=await mkdtemp(join(await realpath(tmpdir()),'once-adult-')),f=await fixture();return {dir,f,t:await adultTransfer(f,join(dir,'source'))};};
async function restored(f:Awaited<ReturnType<typeof fixture>>,t:Awaited<ReturnType<typeof adultTransfer>>,dir:string,payload=t.download.payload) {
 const target=await fixture(),keys={sourceContactKey:f.app.config.contactKey,targetContactKey:target.app.config.contactKey},rebuild=new JsonRebuild(target.clock,keys),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
 const input=join(dir,randomUUID()),output=join(dir,randomUUID());await mkdir(input,{mode:0o700});await writeFile(join(input,t.asset.id+'.original.bin'),t.original);await writeFile(join(input,t.asset.id+'.preview.jpg'),t.preview);
 const verified=await prepareRebuildMedia(payload,actor.workspaceId,{REBUILD_MEDIA_INPUT_DIR:input,REBUILD_MEDIA_TARGET_DIR:output},true),ready=new JsonRebuild(target.clock,keys,verified);
 await target.store.transaction(tx=>ready.apply(tx,actor,payload,{requestId:randomUUID(),ip:'test'}));return {target,actor};
}

test('adult transfer retains original reviewer without creating an account; re-export and local re-verification preserve attribution boundaries',async()=>{
 const {dir,f,t}=await setup();try {
    const {target,actor}=await restored(f,t,dir),a=target.store.rows('adultEligibilities').find(a=>a.id===t.adultId)!;
    assert.equal(a.verifiedByMembershipId,null);assert.equal(a.originalVerificationWorkspaceId,t.actor.workspaceId);assert.equal(a.originalVerificationMembershipId,t.actor.membershipId);assert.equal(target.store.rows('memberships').length,1);assert.equal(a.state,'VERIFIED_ADULT');
    const b=t.download.payload.manifest.talent,reexported=await target.store.transaction(tx=>collectTalentTransfer(tx,actor,target.clock,t.input.selectedIds.people,b.selectedFields,true,true,true));
    assert.deepEqual(reexported.tables.adultEligibilities,b.tables.adultEligibilities);
    const detail=result(await target.owner.raw('GET',`/td2/people/${t.graph.personId}`));assert.equal(detail.adultState,'VERIFIED_ADULT');assert.equal(detail.facts.adultEligibilities[0].originalVerification.membershipId,t.actor.membershipId);
    const response=await target.owner.cmd('POST',`/td2/adult-eligibility/${a.id}/verify`,{schemaVersion:'once-talent-v2.0.0',expectedRevision:a.revision,expectedPersonRevision:target.store.rows('people').find(p=>p.id===a.personId)!.revision,sourceRevision:1,evidenceAssetId:t.asset.id,validUntil:'2026-09-29T00:00:00.000Z'});assert.equal(response.status,200,JSON.stringify(response.body));
    const reviewed=target.store.rows('adultEligibilities')[0]!;assert.equal(reviewed.originalVerificationWorkspaceId,null);assert.equal(reviewed.originalVerificationMembershipId,null);assert.equal(reviewed.verifiedByMembershipId,actor.membershipId);assert.ok(target.store.rows('evidence').some(e=>e.adultEligibilityId===a.id&&e.originalReviewMembershipId===t.actor.membershipId),'原核验仍保留在字段证据历史中');
    const current=result(await target.owner.raw('GET',`/td2/people/${t.graph.personId}`));assert.deepEqual(current.facts.adultEligibilities[0].unavailableFields,[]);assert.equal(current.adultState,'VERIFIED_ADULT');
    const integrity=await target.store.transaction(tx=>inspectTalentIntegrity(tx,actor.workspaceId,target.app.config.contactKey));assert.equal(integrity.relationFailures,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('expired and inactive adult verifications retain history but cannot satisfy the adult filter; quarantining proof removes eligibility',async()=>{
 const {dir,f,t}=await setup();try {
    for(const mode of ['expired','inactive','quarantined']) {
        const p=structuredClone(t.download.payload),d=p.manifest.talent.tables.adultEligibilities[0].data;
        if(mode==='inactive')d.status='INACTIVE';
        const {target}=await restored(f,t,dir,p);
        if(mode==='expired')target.clock.advance(7*86400000);
        if(mode==='quarantined'){const a=target.store.rows('assets')[0]!;assert.equal((await target.owner.cmd('POST',`/assets/${a.id}/quarantine`,{expectedRevision:a.revision})).status,200);}
        const detail=result(await target.owner.raw('GET',`/td2/people/${t.graph.personId}`));
        if(mode==='expired'){await target.owner.login();const fresh=result(await target.owner.raw('GET',`/td2/people/${t.graph.personId}`));assert.equal(fresh.adultState,'UNKNOWN');}else assert.equal(detail.adultState,'UNKNOWN');
        assert.equal(target.store.rows('adultEligibilities')[0]!.state,'VERIFIED_ADULT');
    }
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('adult origin, verification time, active uniqueness and proof omission cannot be forged in a rebuild',async()=>{
 const {dir,f,t}=await setup();try {
    const target=await fixture(),rebuild=new JsonRebuild(target.clock,{sourceContactKey:f.app.config.contactKey,targetContactKey:target.app.config.contactKey}),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
    for(const mode of ['reviewer','time','future','proof','expiry','duplicate','account','evidence']) {
        const p=structuredClone(t.download.payload),row=p.manifest.talent.tables.adultEligibilities[0],d=row.data;
        if(mode==='reviewer')d.verification=null;if(mode==='time')d.verifiedAt=null;if(mode==='future')d.verifiedAt='2099-01-01T00:00:00.000Z';if(mode==='proof')d.evidenceAssetId=null;if(mode==='expiry')d.validUntil=d.verifiedAt;
        if(mode==='evidence')p.manifest.talent.evidence=[];
        if(mode==='duplicate')p.manifest.talent.tables.adultEligibilities.push({...row,id:randomUUID()});if(mode==='account')d.verifiedByMembershipId=actor.membershipId;
        await assert.rejects(target.store.transaction(tx=>rebuild.preview(tx,actor,p)),undefined,mode);assert.equal(target.store.rows('people').length,0);
    }
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('adult export requires reviewer access and its own source grant; changing origin attribution stales old exports',async()=>{
 const {dir,f,t}=await setup();try {
    const b=t.download.payload.manifest.talent;
    await assert.rejects(f.store.transaction(tx=>collectTalentTransfer(tx,{...t.actor,permissions:t.actor.permissions.filter(p=>p!=='sources.review')},f.clock,t.input.selectedIds.people,b.selectedFields,false,true,true)));
    const grant=f.store.rows('usePermissions').find(g=>t.input.usePermissionRefs.includes(g.id)&&g.subjectKind==='SOURCE'&&g.subjectId===t.graph.sourceId)!;
    const limited=result(await f.owner.cmd('POST','/use-permissions',{subjectKind:'SOURCE',subjectId:grant.subjectId,sourceId:grant.sourceId,fields:grant.fields.filter(c=>c!=='person.td2.adultEligibilities'),validUntil:grant.validUntil,evidenceNote:'合成：未批准成年核验信息'})).resourceId;
    assert.equal((await f.owner.cmd('POST','/exports',{...t.input,usePermissionRefs:t.input.usePermissionRefs.map(id=>id===grant.id?limited:id)})).status,422);
    await f.store.transaction(async tx=>{const a=(await tx.get('adultEligibilities',t.adultId))!;await tx.replace('adultEligibilities',{...a,verifiedByMembershipId:null,originalVerificationWorkspaceId:randomUUID(),originalVerificationMembershipId:randomUUID()});});
    assert.equal((await f.owner.raw('POST',`/exports/${t.jobId}/download`,{})).status,409);
 }finally{await rm(dir,{recursive:true,force:true});}
});


test('adult verification uses one event timestamp even when the clock advances between persistence calls',async()=>{
 const {dir,f,t}=await setup();try {
    const now=f.clock.now.bind(f.clock);f.clock.now=()=>{const value=now();f.clock.advance(1);return value;};
    const a=f.store.rows('adultEligibilities').find(a=>a.id===t.adultId)!;
    const response=await f.owner.cmd('POST',`/td2/adult-eligibility/${a.id}/verify`,{schemaVersion:'once-talent-v2.0.0',expectedRevision:a.revision,expectedPersonRevision:f.store.rows('people').find(p=>p.id===a.personId)!.revision,sourceRevision:1,evidenceAssetId:t.asset.id,validUntil:'2026-09-29T00:00:00.000Z'});
    assert.equal(response.status,200,JSON.stringify(response.body));
    const verified=f.store.rows('adultEligibilities').find(a=>a.id===t.adultId)!;
    const evidence=f.store.rows('evidence').filter(e=>e.adultEligibilityId===a.id&&e.reviewedAt===verified.verifiedAt);
    assert.equal(evidence.length,3);assert.equal(verified.updatedAt,verified.verifiedAt);
    for(const e of evidence){assert.equal(e.createdAt,verified.verifiedAt);assert.equal(e.updatedAt,verified.verifiedAt);}
    const exported=await f.store.transaction(tx=>collectTalentTransfer(tx,t.actor,f.clock,t.input.selectedIds.people,t.download.payload.manifest.talent.selectedFields,true,true,true));
    assert.equal(exported.tables.adultEligibilities[0].data.verifiedAt,verified.verifiedAt);
 }finally{await rm(dir,{recursive:true,force:true});}
});
