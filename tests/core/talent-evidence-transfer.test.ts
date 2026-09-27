import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,result} from '../support/fixtures.ts';
import {controlledTransfer,SOURCE_FIELDS} from '../support/talent-transfer.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import {collectTalentTransfer,EVIDENCE_TRANSFER_CODE} from '../../packages/core/src/talent-transfer.ts';
import {inspectTalentIntegrity} from '../../packages/core/src/talent-v2-integrity.ts';
const setup=async()=>{const f=await fixture();return {f,t:await controlledTransfer(f.app,f.store,f.clock,f.owner,true,true,true,true)};};

test('TD2 evidence export requires explicit person, original field group and every evidence source grant',async()=>{
    const {f,t}=await setup();assert.equal(t.bundle.schemaVersion,'once-talent-transfer-v5');
    const actor=await f.store.transaction(tx=>f.app.identity.authenticate(tx,f.owner.jar.once_session!));
    await assert.rejects(f.store.transaction(tx=>collectTalentTransfer(tx,{...actor,permissions:actor.permissions.filter(p=>p!=='sources.review')},f.clock,t.input.selectedIds.people,t.bundle.selectedFields,true)),(e:any)=>e.status===403);
    assert.ok(t.bundle.evidence!.some(e=>e.sourceId===t.evidenceSource&&e.originalReview?.membershipId===f.membershipId));
    assert.equal((await f.owner.cmd('POST','/exports',{...t.input,usePermissionRefs:t.input.usePermissionRefs.filter(id=>id!==t.evidencePermission)})).status,422);
    for(const fields of [[...SOURCE_FIELDS,EVIDENCE_TRANSFER_CODE],[...SOURCE_FIELDS,'person.td2.personLanguages']]) {
        const grant=result(await f.owner.cmd('POST','/use-permissions',{subjectKind:'SOURCE',subjectId:t.evidenceSource,sourceId:t.evidenceSource,fields,validUntil:'2026-10-01T00:00:00.000Z',evidenceNote:'合成：仅授予一部分字段'})).resourceId;
        assert.equal((await f.owner.cmd('POST','/exports',{...t.input,usePermissionRefs:t.input.usePermissionRefs.map(id=>id===t.evidencePermission?grant:id)})).status,422);
    }
    const permissions=f.store.rows('usePermissions'),person=permissions.find(p=>p.subjectKind==='PERSON'&&p.subjectId===t.graph.personId)!;
    const limited=result(await f.owner.cmd('POST','/use-permissions',{subjectKind:'PERSON',subjectId:person.subjectId,sourceId:person.sourceId,fields:person.fields.filter(c=>c!==EVIDENCE_TRANSFER_CODE),validUntil:'2026-10-01T00:00:00.000Z',evidenceNote:'合成：仅许可资料、不许可证据'})).resourceId;
    assert.equal((await f.owner.cmd('POST','/exports',{...t.input,usePermissionRefs:t.input.usePermissionRefs.map(id=>id===person.id?limited:id)})).status,422);
    assert.equal((await f.owner.cmd('POST','/exports',{...t.input,fields:['person.displayName',EVIDENCE_TRANSFER_CODE,...SOURCE_FIELDS]})).status,422);
});

test('TD2 evidence changes and evidence-only source permission or scope loss stale queued and ready exports',async()=>{
    for(const mode of ['grant','scope','evidence']) {
        const {f,t}=await setup(),job=result(await f.owner.cmd('POST','/exports',t.input)).resourceId;
        if(mode==='grant')assert.equal((await f.owner.cmd('POST',`/use-permissions/${t.evidencePermission}/revoke`,{expectedRevision:1})).status,200);
        if(mode==='scope')await f.store.transaction(async tx=>{const s=(await tx.get('sources',t.evidenceSource!))!;await tx.replace('sources',{...s,scopeId:randomUUID()});});
        if(mode==='evidence')await f.store.transaction(async tx=>{const e=(await tx.find('evidence',{sourceId:t.evidenceSource!}))[0]!;await tx.replace('evidence',{...e,valueDigest:'a'.repeat(64)});});
        const claim=await f.app.exports.claim();assert.ok(claim);assert.equal(claim.id,job);await f.app.exports.process(claim);
        assert.equal(f.store.rows('exports').find(e=>e.id===job)!.state,'STALE');assert.equal((await f.owner.raw('POST',`/exports/${t.jobId}/download`,{})).status,409);
    }
});

test('TD2 malformed evidence owner, field, source revision, identity, review timestamp or unknown secret fails before writes',async()=>{
    const {t}=await setup(),target=await fixture(),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
    for(const mode of ['owner','field','source','revision','duplicate','time','review','secret','table']) {
        const p=structuredClone(t.download.payload),e=p.manifest.talent.evidence.find((e:any)=>e.originalReview);
        if(mode==='owner')e.ownerId=randomUUID();
        if(mode==='field')e.fieldPath='identifierCiphertext';
        if(mode==='source')e.sourceId=randomUUID();
        if(mode==='revision')e.sourceRevision=999;
        if(mode==='duplicate')p.manifest.talent.evidence.push(e);
        if(mode==='time')e.updatedAt='2099-01-01T00:00:00.000Z';
        if(mode==='review')e.originalReview.reviewedAt='2000-01-01T00:00:00.000Z';
        if(mode==='secret')e.rawText='must not be accepted';
        if(mode==='table')e.ownerKind='personCredentials';
        await assert.rejects(target.store.transaction(tx=>rebuild.apply(tx,actor,p,{requestId:randomUUID(),ip:'test'})),undefined,mode);
        assert.equal(target.store.rows('people').length,0);assert.equal(target.store.rows('evidence').length,0);
    }
});

test('TD2 repeat transfer retains original reviewer attribution without creating target accounts or new approval',async()=>{
    const {t}=await setup(),target=await fixture(),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
    await target.store.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'}));
    assert.equal(target.store.rows('memberships').length,1);
    const again=await target.store.transaction(tx=>collectTalentTransfer(tx,actor,target.clock,t.input.selectedIds.people,t.bundle.selectedFields,true));
    assert.deepEqual(again.evidence,t.bundle.evidence);
    const original=target.store.rows('evidence').find(e=>e.originalReviewMembershipId)!;
    assert.equal(original.reviewerId,null);assert.equal(original.reviewedAt,null);
    await target.store.transaction(tx=>tx.replace('evidence',{...original,originalReviewMembershipId:null}));
    assert.ok((await target.store.transaction(tx=>inspectTalentIntegrity(tx,actor.workspaceId,target.app.config.contactKey))).relationFailures>0);
});

test('TD2 historical field digests remain unchanged and excluded professional evidence does not enter the bundle',async()=>{
    const {f,t}=await setup(),prior=f.store.rows('evidence').filter(e=>e.personLanguageId===t.secondLanguage);
    const row=f.store.rows('personLanguages').find(r=>r.id===t.secondLanguage)!;
    assert.equal((await f.owner.cmd('PATCH',`/td2/languages/${row.id}`,{schemaVersion:'once-talent-v2.0.0',expectedRevision:row.revision,expectedPersonRevision:(await t.graph.current()).revision,sourceId:t.secondSource,sourceRevision:1,values:{speakingLevelCode:'FLUENT'}})).status,200);
    const actor=await f.store.transaction(tx=>f.app.identity.authenticate(tx,f.owner.jar.once_session!));
    const bundle=await f.store.transaction(tx=>collectTalentTransfer(tx,actor,f.clock,t.input.selectedIds.people,t.bundle.selectedFields,true));
    for(const e of prior)assert.equal(bundle.evidence!.find(x=>x.id===e.id)!.valueDigest,e.valueDigest);
    assert.ok(bundle.evidence!.filter(e=>e.ownerId===row.id&&e.fieldPath==='speakingLevelCode').length>=2);
    assert.ok(!JSON.stringify(bundle).includes(t.graph.credentialId));
    const target=await fixture(),rebuild=new JsonRebuild(target.clock),targetActor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
    const payload=structuredClone(t.download.payload);payload.manifest.talent=bundle;
    await target.store.transaction(tx=>rebuild.apply(tx,targetActor,payload,{requestId:randomUUID(),ip:'test'}));
    for(const e of prior)assert.equal(target.store.rows('evidence').find(x=>x.id===e.id)!.valueDigest,e.valueDigest);
    await f.store.transaction(async tx=>{for(let i=0;i<500;i++)await tx.insert('evidence',{...prior[0]!,id:randomUUID()});});
    await assert.rejects(f.store.transaction(tx=>collectTalentTransfer(tx,actor,f.clock,t.input.selectedIds.people,t.bundle.selectedFields,true)),(e:any)=>e.code==='TD2_EXPORT_LIMIT');
});
