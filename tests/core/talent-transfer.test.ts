import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, result, member } from '../support/fixtures.ts';
import { controlledTransfer, roundTripTransfer } from '../support/talent-transfer.ts';
import { TRANSFER_CODES } from '../../packages/core/src/talent-transfer.ts';

test('TD2 explicit person and fact-source permits export a typed whitelist and atomically rebuild stable relationships',async()=>{
    await roundTripTransfer(await fixture(),await fixture());
});
test('TD2 frozen professional downloads fail closed after fact changes, source revocation, or disabled requestor',async()=>{
    for(const mode of ['fact','source','permission']) {
        const f=await fixture(), t=await controlledTransfer(f.app,f.store,f.clock,f.owner);
        if(mode==='fact') await f.store.transaction(async tx=>{const row=(await tx.get('personLanguages',t.secondLanguage))!;await tx.replace('personLanguages',{...row,speakingLevelCode:'BASIC',revision:row.revision+1});});
        if(mode==='source') await f.store.transaction(async tx=>{const row=(await tx.get('sources',t.secondSource))!;await tx.replace('sources',{...row,status:'SUSPENDED',protectionEpoch:row.protectionEpoch+1});});
        if(mode==='permission') await f.store.transaction(async tx=>{const row=(await tx.get('memberships',f.membershipId))!;await tx.replace('memberships',{...row,status:'DISABLED'});});
        const response=await f.owner.raw('POST',`/exports/${t.jobId}/download`,{});assert.ok(response.status>=400);assert.equal(JSON.stringify(response.body).includes(t.secondLanguage),false);
    }
});
test('TD2 selected dependencies are explicit and unsupported typed fields cannot be smuggled into export',async()=>{
    const f=await fixture(),t=await controlledTransfer(f.app,f.store,f.clock,f.owner);
    const missing={...t.input,fields:t.input.fields.filter(x=>x!=='person.td2.personRoles')};
    assert.equal((await f.owner.cmd('POST','/exports',missing)).status,422);
    const unknown={...t.input,fields:[...t.input.fields,'person.td2.adultEligibilities']};
    assert.equal((await f.owner.cmd('POST','/exports',unknown)).status,400);
    const viewer=await member(f,'transfer_no_action','VIEWER');assert.equal((await viewer.client.cmd('POST','/exports',t.input)).status,403);
    assert.equal(TRANSFER_CODES.length,14);
});

test('TD2 foreign-source field evidence cannot be silently flattened and worker rechecks revoked grants',async()=>{
    const f=await fixture(),t=await controlledTransfer(f.app,f.store,f.clock,f.owner);
    const secondJob=result(await f.owner.cmd('POST','/exports',t.input)).resourceId;
    assert.ok(secondJob);
    const revoked=await f.owner.cmd('POST',`/use-permissions/${t.secondaryPermission}/revoke`,{expectedRevision:1});assert.equal(revoked.status,200);
    const claim=await f.app.exports.claim();assert.ok(claim);await f.app.exports.process(claim);
    assert.equal(f.store.rows('exports').find(r=>r.id===secondJob)!.state,'STALE');
    const f2=await fixture(),t2=await controlledTransfer(f2.app,f2.store,f2.clock,f2.owner);
    const language=f2.store.rows('personLanguages').find(r=>r.id===t2.graph.languageId)!;
    const evidence=await f2.owner.cmd('POST','/td2/evidence',{schemaVersion:'once-talent-v2.0.0',ownerKind:'personLanguages',ownerId:language.id,fieldPath:'speakingLevelCode',expectedRevision:language.revision,sourceId:t2.secondSource,sourceRevision:1});
    assert.equal(evidence.status,200,JSON.stringify(evidence.body));
    const denied=await f2.owner.cmd('POST','/exports',t2.input);assert.equal(denied.status,409);assert.equal(result(denied).error.code,'TD2_EXPORT_EVIDENCE_UNSUPPORTED');
    assert.equal((await f2.owner.raw('POST',`/exports/${t2.jobId}/download`,{})).status,409);
});

test('TD2 capability transfer preserves only referenced definitions and stales queued or ready exports when meaning changes',async()=>{
    const f=await fixture(),t=await controlledTransfer(f.app,f.store,f.clock,f.owner);
    const definition=t.bundle.capabilityDefinitions![0]!;
    assert.equal(t.bundle.capabilityDefinitions!.length,1);
    const unused=await f.owner.cmd('POST','/td2/capability-definitions',{schemaVersion:'once-talent-v2.0.0',code:'unrelated-capability',labelZh:'无关能力',labelEn:'Unused',aliases:[],applicableRoleCodes:[],levelSchemeCode:null,semanticVersion:'1.0.0'});
    assert.equal(unused.status,201,JSON.stringify(unused.body));
    assert.equal((await f.owner.raw('POST',`/exports/${t.jobId}/download`,{})).status,200,'unrelated catalog entries do not stale a selected export');
    const queued=result(await f.owner.cmd('POST','/exports',t.input)).resourceId;
    const changed=await f.owner.cmd('PATCH',`/td2/capability-definitions/${definition.id}`,{schemaVersion:'once-talent-v2.0.0',expectedRevision:definition.revision,labelZh:'已修订能力含义'});assert.equal(changed.status,200,JSON.stringify(changed.body));
    const claim=await f.app.exports.claim();assert.ok(claim);assert.equal(claim.id,queued);await f.app.exports.process(claim);
    assert.equal(f.store.rows('exports').find(r=>r.id===queued)!.state,'STALE');
    assert.equal((await f.owner.raw('POST',`/exports/${t.jobId}/download`,{})).status,409);
});

test('TD2 capability rebuild rejects omitted, unrelated, duplicate, invalid-role and invalid-level definitions before writes',async()=>{
    const source=await fixture(),target=await fixture(),t=await controlledTransfer(source.app,source.store,source.clock,source.owner);
    const {JsonRebuild}=await import('../../packages/core/src/rebuild.ts');
    const rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
    for(const mode of ['missing','unrelated','duplicate','role','level','private','dictionary','future']) {
        const payload=structuredClone(t.download.payload),bundle=payload.manifest.talent;
        if(mode==='missing')bundle.capabilityDefinitions=[];
        if(mode==='unrelated')bundle.capabilityDefinitions.push({...bundle.capabilityDefinitions[0],id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',code:'unrelated'});
        if(mode==='duplicate')bundle.capabilityDefinitions.push(bundle.capabilityDefinitions[0]);
        if(mode==='role')bundle.capabilityDefinitions[0].applicableRoleCodes=['translator'];
        if(mode==='level')bundle.capabilityDefinitions[0].levelSchemeCode=null;
        if(mode==='private')bundle.capabilityDefinitions[0].credentialHash='forbidden';
        if(mode==='dictionary')bundle.capabilityDefinitions[0].applicableRoleCodes=['model','unknown-role'];
        if(mode==='future')bundle.capabilityDefinitions[0].updatedAt='2099-01-01T00:00:00.000Z';
        await assert.rejects(target.store.transaction(tx=>rebuild.apply(tx,actor,payload,{requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',ip:'test'})),undefined,mode);
        assert.equal(target.store.rows('people').length,0);assert.equal(target.store.rows('capabilityDefinitions').length,0);
    }
});

test('TD2 original eight-group v1 exports keep their shape and rebuild without capability definitions',async()=>{
    const source=await fixture(),target=await fixture(),t=await controlledTransfer(source.app,source.store,source.clock,source.owner,false);
    assert.equal(t.bundle.schemaVersion,'once-talent-transfer-v1');
    assert.equal('personCapabilities' in t.bundle.tables,false);assert.equal('capabilityDefinitions' in t.bundle,false);
    await source.store.transaction(async tx=>{const row=(await tx.find('capabilityDefinitions'))[0]!;await tx.replace('capabilityDefinitions',{...row,labelZh:'旧文件不引用这个定义',revision:row.revision+1});});
    const downloaded=await source.owner.raw('POST',`/exports/${t.jobId}/download`,{});assert.equal(downloaded.status,200);assert.equal(result(downloaded).sha256,t.download.sha256);
    const {JsonRebuild}=await import('../../packages/core/src/rebuild.ts');
    const rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
    const preview=await target.store.transaction(tx=>rebuild.preview(tx,actor,t.download.payload));assert.equal(preview.professionalRecords,10);assert.equal(preview.capabilityDefinitions,0);
    await target.store.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',ip:'test'}));
    assert.equal(target.store.rows('capabilityDefinitions').length,0);assert.equal(target.store.rows('personRoles').length,2);
});

test('TD2 shared inactive capability definitions and nullable role or level survive rebuild without reactivation',async()=>{
    const source=await fixture(),target=await fixture(),t=await controlledTransfer(source.app,source.store,source.clock,source.owner);
    const definition=t.bundle.capabilityDefinitions![0]!;
    const added=await source.owner.cmd('POST',`/td2/people/${t.graph.personId}/capabilities`,{schemaVersion:'once-talent-v2.0.0',expectedPersonRevision:(await t.graph.current()).revision,sourceId:t.graph.sourceId,sourceRevision:1,values:{capabilityCode:definition.code}});
    assert.equal(added.status,201,JSON.stringify(added.body));
    assert.equal((await source.owner.cmd('PATCH',`/td2/capability-definitions/${definition.id}`,{schemaVersion:'once-talent-v2.0.0',expectedRevision:definition.revision,status:'INACTIVE'})).status,200);
    const job=result(await source.owner.cmd('POST','/exports',t.input)).resourceId;
    const claim=await source.app.exports.claim();assert.ok(claim);assert.equal(claim.id,job);await source.app.exports.process(claim);
    const download=await source.owner.raw('POST',`/exports/${job}/download`,{});assert.equal(download.status,200,JSON.stringify(download.body));
    const payload=result(download).payload;assert.equal(payload.manifest.talent.capabilityDefinitions.length,1);
    const {JsonRebuild}=await import('../../packages/core/src/rebuild.ts');
    const rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
    await target.store.transaction(tx=>rebuild.apply(tx,actor,payload,{requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',ip:'test'}));
    assert.equal(target.store.rows('personCapabilities').length,2);assert.equal(target.store.rows('capabilityDefinitions')[0]!.status,'INACTIVE');
    const restored=target.store.rows('personCapabilities').find(r=>r.id===result(added).resourceId)!;assert.equal(restored.personRoleId,null);assert.equal(restored.levelCode,null);
});
