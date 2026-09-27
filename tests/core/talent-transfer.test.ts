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
    const unknown={...t.input,fields:[...t.input.fields,'person.td2.personCredentials']};
    assert.equal((await f.owner.cmd('POST','/exports',unknown)).status,400);
    const viewer=await member(f,'transfer_no_action','VIEWER');assert.equal((await viewer.client.cmd('POST','/exports',t.input)).status,403);
    assert.equal(TRANSFER_CODES.length,8);
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
