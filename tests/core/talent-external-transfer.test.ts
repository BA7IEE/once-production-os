import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,result} from '../support/fixtures.ts';
import {controlledTransfer} from '../support/talent-transfer.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';

const external = async()=>{const f=await fixture();return {f,t:await controlledTransfer(f.app,f.store,f.clock,f.owner,true,true)};};
test('TD2 external identity export requires issuing-source permission and remains fail-closed on organization changes',async()=>{
    for(const mode of ['name','scope','source','grant']) {
        const {f,t}=await external();
        assert.equal(t.bundle.schemaVersion,'once-talent-transfer-v15');assert.equal(t.bundle.organizations!.length,1);
        assert.deepEqual(t.bundle.tables.personExternalRefs.map(r=>r.data.state).sort(),['OBSERVED','REVOKED','VERIFIED']);
        const queued=result(await f.owner.cmd('POST','/exports',t.input)).resourceId;
        if(mode==='name'||mode==='scope') await f.store.transaction(async tx=>{const row=(await tx.get('organizations',t.organizationId!))!;await tx.replace('organizations',{...row,...(mode==='name'?{name:'机构名称变更',revision:row.revision+1}:{scopeId:randomUUID()})});});
        if(mode==='source') await f.store.transaction(async tx=>{const row=(await tx.get('sources',t.organizationSource!))!;await tx.replace('sources',{...row,status:'SUSPENDED',protectionEpoch:row.protectionEpoch+1});});
        if(mode==='grant') assert.equal((await f.owner.cmd('POST',`/use-permissions/${t.organizationPermission}/revoke`,{expectedRevision:1})).status,200);
        const claim=await f.app.exports.claim();assert.ok(claim);assert.equal(claim.id,queued);await f.app.exports.process(claim);
        assert.equal(f.store.rows('exports').find(r=>r.id===queued)!.state,'STALE',mode);
        const denied=await f.owner.raw('POST',`/exports/${t.jobId}/download`,{});assert.equal(denied.status,409,mode);
        assert.equal(JSON.stringify(denied.body).includes('synthetic-member'),false);
        const next=await f.owner.cmd('POST','/exports',t.input);
        if(mode==='name')assert.equal(next.status,202);else assert.ok(next.status>=400,mode);
    }
});

test('TD2 external rebuild rejects ambiguous identities, missing or unrelated organizations, missing sources and fabricated verification',async()=>{
    const {t}=await external(),target=await fixture(),rebuild=new JsonRebuild(target.clock);
    const actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
    for(const mode of ['duplicate','missing','extra','source','private','unverified','observed','future','length']) {
        const payload=structuredClone(t.download.payload),bundle=payload.manifest.talent;
        const verified=bundle.tables.personExternalRefs.find((r:any)=>r.data.state==='VERIFIED');
        if(mode==='duplicate')bundle.tables.personExternalRefs.push({...verified,id:randomUUID()});
        if(mode==='missing')bundle.organizations=[];
        if(mode==='extra')bundle.organizations.push({...bundle.organizations[0],id:randomUUID()});
        if(mode==='source')bundle.organizations[0].sourceId=randomUUID();
        if(mode==='private')bundle.organizations[0].cookie='must-never-transfer';
        if(mode==='unverified')verified.data.verifiedAt=null;
        if(mode==='observed')verified.data.state='OBSERVED';
        if(mode==='future')verified.data.verifiedAt='2099-01-01T00:00:00.000Z';
        if(mode==='length')verified.data.externalKey='x'.repeat(301);
        await assert.rejects(target.store.transaction(tx=>rebuild.apply(tx,actor,payload,{requestId:randomUUID(),ip:'test'})),undefined,mode);
        assert.equal(target.store.rows('people').length,0);assert.equal(target.store.rows('organizations').length,0);
    }
});

test('TD2 external roundtrip preserves revoked and observed identities without letting them resolve as verified',async()=>{
    const {t}=await external(),target=await fixture(),rebuild=new JsonRebuild(target.clock);
    const actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
    await target.store.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'}));
    const verified=t.bundle.tables.personExternalRefs.find(r=>r.data.state==='VERIFIED')!;
    const query=new URLSearchParams({providerCode:'AGENCY_INTERNAL',namespaceCode:'staff',issuerOrganizationId:t.organizationId!,externalKey:'synthetic-member'});
    const resolved=await target.owner.raw('GET','/td2/resolve?'+query);assert.equal(resolved.status,200,JSON.stringify(resolved.body));assert.equal(result(resolved).externalRefId,verified.id);
    const observed=t.bundle.tables.personExternalRefs.find(r=>r.data.state==='OBSERVED')!;
    assert.equal((await target.owner.raw('GET','/td2/resolve?'+new URLSearchParams({providerCode:'WECHAT',namespaceCode:'synthetic',externalKey:String(observed.data.externalKey)}))).status,404);
    assert.equal(target.store.rows('personExternalRefs').filter(r=>r.state==='REVOKED').length,1);
});

test('TD2 current capability export excludes unrelated external identities and organizations',async()=>{
    const f=await fixture(),t=await controlledTransfer(f.app,f.store,f.clock,f.owner),target=await fixture();
    assert.equal(t.bundle.schemaVersion,'once-talent-transfer-v15');assert.deepEqual(t.bundle.organizations,[]);assert.deepEqual(t.bundle.tables.personExternalRefs,[]);
    await f.store.transaction(async tx=>{const row=(await tx.get('personExternalRefs',t.graph.externalRefId))!;await tx.replace('personExternalRefs',{...row,state:'REVOKED',revision:row.revision+1});});
    assert.equal(result(await f.owner.raw('POST',`/exports/${t.jobId}/download`,{})).sha256,t.download.sha256);
    const rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
    await target.store.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'}));
    assert.equal(target.store.rows('personCapabilities').length,1);assert.equal(target.store.rows('personExternalRefs').length,0);assert.equal(target.store.rows('organizations').length,0);
});
