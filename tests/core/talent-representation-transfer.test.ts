import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,result} from '../support/fixtures.ts';
import {controlledTransfer,SOURCE_FIELDS} from '../support/talent-transfer.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
const setup=async()=>{const f=await fixture();return {f,t:await controlledTransfer(f.app,f.store,f.clock,f.owner,true,true,true)};};

test('TD2 representatives require explicit person selection and grants plus the actual organization source group',async()=>{
    const {f,t}=await setup();
    assert.equal(t.bundle.schemaVersion,'once-talent-transfer-v15');assert.equal(t.bundle.organizations!.length,1);
    assert.equal((await f.owner.cmd('POST','/exports',{...t.input,selectedIds:{...t.input.selectedIds,people:[t.graph.personId]}})).status,422);
    assert.equal((await f.owner.cmd('POST','/exports',{...t.input,usePermissionRefs:t.input.usePermissionRefs.filter(id=>id!==t.agentPermission)})).status,422);
    const onlyExternal=result(await f.owner.cmd('POST','/use-permissions',{subjectKind:'SOURCE',subjectId:t.organizationSource,sourceId:t.organizationSource,fields:[...SOURCE_FIELDS,'person.td2.personExternalRefs'],validUntil:'2026-10-01T00:00:00.000Z',evidenceNote:'合成：只批准标识，不批准代表关系'})).resourceId;
    const denied=await f.owner.cmd('POST','/exports',{...t.input,usePermissionRefs:t.input.usePermissionRefs.map(id=>id===t.organizationPermission?onlyExternal:id)});assert.equal(denied.status,422);
    const onlyRepresentations={...t.input,fields:t.input.fields.filter(c=>c!=='person.td2.personExternalRefs'&&c!=='person.td2.personCapabilities')};
    const job=result(await f.owner.cmd('POST','/exports',onlyRepresentations)).resourceId;
    const claim=await f.app.exports.claim();assert.ok(claim);assert.equal(claim.id,job);await f.app.exports.process(claim);
    const downloaded=await f.owner.raw('POST',`/exports/${job}/download`,{});assert.equal(downloaded.status,200,JSON.stringify(downloaded.body));
    assert.equal(result(downloaded).payload.manifest.talent.organizations.length,1);
    assert.equal(result(downloaded).payload.manifest.talent.tables.personExternalRefs.length,0);
});

test('TD2 representation rebuild rejects ambiguous subjects, absent agents, foreign roles, and invalid periods atomically',async()=>{
    const {t}=await setup(),target=await fixture(),rebuild=new JsonRebuild(target.clock);
    const actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
    for(const mode of ['both','neither','self','absent','role','period','organization']) {
        const payload=structuredClone(t.download.payload),row=payload.manifest.talent.tables.representations.find((r:any)=>r.data.agentPersonId);
        if(mode==='both')row.data.agencyOrganizationId=t.organizationId;
        if(mode==='neither')row.data.agentPersonId=null;
        if(mode==='self')row.data.agentPersonId=row.personId;
        if(mode==='absent')row.data.agentPersonId=randomUUID();
        if(mode==='role')row.data.personRoleId=randomUUID();
        if(mode==='period'){row.data.validFrom='2026-10-01T00:00:00.000Z';row.data.validUntil='2026-09-01T00:00:00.000Z';}
        if(mode==='organization')payload.manifest.talent.tables.representations.find((r:any)=>r.data.agencyOrganizationId).data.agencyOrganizationId=randomUUID();
        await assert.rejects(target.store.transaction(tx=>rebuild.apply(tx,actor,payload,{requestId:randomUUID(),ip:'test'})),undefined,mode);
        assert.equal(target.store.rows('people').length,0);assert.equal(target.store.rows('organizations').length,0);
    }
});

test('TD2 representative grant or visibility loss and relationship changes invalidate queued and ready files',async()=>{
    for(const mode of ['grant','scope','relationship']) {
        const {f,t}=await setup(),job=result(await f.owner.cmd('POST','/exports',t.input)).resourceId;
        if(mode==='grant')assert.equal((await f.owner.cmd('POST',`/use-permissions/${t.agentPermission}/revoke`,{expectedRevision:1})).status,200);
        if(mode==='scope')await f.store.transaction(async tx=>{const row=(await tx.get('people',t.agentId!))!;await tx.replace('people',{...row,scopeId:randomUUID()});});
        if(mode==='relationship')await f.store.transaction(async tx=>{const row=(await tx.find('representations',{personId:t.graph.personId}))[0]!;await tx.replace('representations',{...row,status:'INACTIVE',revision:row.revision+1});});
        const claim=await f.app.exports.claim();assert.ok(claim);assert.equal(claim.id,job);await f.app.exports.process(claim);
        assert.equal(f.store.rows('exports').find(r=>r.id===job)!.state,'STALE');
        assert.equal((await f.owner.raw('POST',`/exports/${t.jobId}/download`,{})).status,409);
    }
});

test('TD2 current external export excludes unselected representatives',async()=>{
    const f=await fixture(),t=await controlledTransfer(f.app,f.store,f.clock,f.owner,true,true),target=await fixture();
    assert.equal(t.bundle.schemaVersion,'once-talent-transfer-v15');assert.deepEqual(t.bundle.tables.representations,[]);
    await f.store.transaction(async tx=>{const row=(await tx.find('representations',{personId:t.graph.personId}))[0]!;await tx.replace('representations',{...row,status:'INACTIVE',revision:row.revision+1});});
    assert.equal(result(await f.owner.raw('POST',`/exports/${t.jobId}/download`,{})).sha256,t.download.sha256);
    const rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
    await target.store.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'}));
    assert.equal(target.store.rows('representations').length,0);assert.equal(target.store.rows('people').length,1);
});
