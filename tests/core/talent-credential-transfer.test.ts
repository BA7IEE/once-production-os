import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {chmodSync,mkdtempSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fixture,result,sourceInput} from '../support/fixtures.ts';
import {controlledTransfer,SOURCE_FIELDS} from '../support/talent-transfer.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import {collectTalentTransfer,CREDENTIAL_IDENTIFIER_CODE} from '../../packages/core/src/talent-transfer.ts';
import {loadCredentialRebuildKeys} from '../../scripts/rebuild-credential-keys.ts';
const setup=async()=>{const f=await fixture();return {f,t:await controlledTransfer(f.app,f.store,f.clock,f.owner,true,true,true,true,true)};};

test('TD2 credential identifiers require separate record/source grants and current sensitive read permission',async()=>{
    const {f,t}=await setup();assert.equal(t.bundle.schemaVersion,'once-talent-transfer-v6');assert.equal(t.bundle.tables.personCredentials.length,3);
    const missing=await f.owner.cmd('POST','/exports',{...t.input,fields:t.input.fields.filter(c=>c!==CREDENTIAL_IDENTIFIER_CODE)});
    assert.equal(missing.status,422);assert.equal(result(missing).error.code,'TD2_CREDENTIAL_IDENTIFIER_GRANT_REQUIRED');
    for(const kind of ['PERSON','SOURCE']) {
        const grant=f.store.rows('usePermissions').find(p=>p.subjectKind===kind&&p.subjectId===(kind==='PERSON'?t.graph.personId:t.graph.sourceId))!;
        const limited=result(await f.owner.cmd('POST','/use-permissions',{subjectKind:kind,subjectId:grant.subjectId,sourceId:grant.sourceId,fields:grant.fields.filter(c=>c!==CREDENTIAL_IDENTIFIER_CODE),validUntil:'2026-10-01T00:00:00.000Z',evidenceNote:'合成：批准资质但不批准编号'})).resourceId;
        assert.equal((await f.owner.cmd('POST','/exports',{...t.input,usePermissionRefs:t.input.usePermissionRefs.map(id=>id===grant.id?limited:id)})).status,422);
    }
    const actor=await f.store.transaction(tx=>f.app.identity.authenticate(tx,f.owner.jar.once_session!));
    await assert.rejects(f.store.transaction(tx=>collectTalentTransfer(tx,{...actor,permissions:actor.permissions.filter(p=>p!=='sensitive.read')},f.clock,t.input.selectedIds.people,t.bundle.selectedFields,true,true)),(e:any)=>e.status===403);
    assert.ok(!JSON.stringify(t.download).includes('SYNTHETIC-PRIVATE'));
});

test('TD2 credential key, context, mask, ciphertext and target permission failures leave the target empty',async()=>{
    const {f,t}=await setup(),target=await fixture(),keys={sourceContactKey:f.app.config.contactKey,targetContactKey:target.app.config.contactKey};
    const initial=new JsonRebuild(target.clock,keys),actor=await target.store.transaction(tx=>initial.actorFromTarget(tx,'owner'));
    for(const mode of ['missing','wrong','context','mask','ciphertext','write']) {
        const payload=structuredClone(t.download.payload),row=payload.manifest.talent.tables.personCredentials.find((r:any)=>r.data.identifierCiphertext);
        if(mode==='context')payload.manifest.talent.identifierContextWorkspaceId=randomUUID();
        if(mode==='mask')row.data.maskedIdentifier='***0000';
        if(mode==='ciphertext')row.data.identifierCiphertext+='a';
        const rebuild=new JsonRebuild(target.clock,mode==='missing'?undefined:mode==='wrong'?{...keys,sourceContactKey:randomBytes(32)}:keys);
        if(mode==='write')await target.store.transaction(async tx=>{const m=(await tx.get('memberships',target.membershipId))!;await tx.replace('memberships',{...m,extraPermissions:m.extraPermissions.filter(p=>p!=='sensitive.write')});});
        await assert.rejects(target.store.transaction(tx=>rebuild.apply(tx,actor,payload,{requestId:randomUUID(),ip:'test'})),(e:any)=>{assert.ok(!e.message.includes('SYNTHETIC-PRIVATE'));return true;},mode);
        assert.equal(target.store.rows('people').length,0);assert.equal(target.store.rows('personCredentials').length,0);assert.equal(target.store.rows('evidence').length,0);
    }
});

test('TD2 credential attachment, verified status, invalid issuer, dates and private evidence cannot be smuggled into rebuild',async()=>{
    const {f,t}=await setup(),target=await fixture(),rebuild=new JsonRebuild(target.clock,{sourceContactKey:f.app.config.contactKey,targetContactKey:target.app.config.contactKey}),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
    for(const mode of ['attachment','verified','issuer','dates','pair','role','privateEvidence']) {
        const payload=structuredClone(t.download.payload),row=payload.manifest.talent.tables.personCredentials[0];
        if(mode==='attachment')row.data.evidenceAssetId=randomUUID();
        if(mode==='verified')row.data.status='VERIFIED';
        if(mode==='issuer'){row.data.issuerName=null;row.data.issuerOrganizationId=null;}
        if(mode==='dates'){row.data.issuedOn='2026-01-01';row.data.expiresOn='2025-01-01';}
        if(mode==='pair'){row.data.identifierCiphertext=null;row.data.maskedIdentifier='***1234';}
        if(mode==='role')row.data.personRoleId=randomUUID();
        if(mode==='privateEvidence')payload.manifest.talent.evidence.push({...payload.manifest.talent.evidence[0],id:randomUUID(),ownerKind:'personCredentials',ownerId:row.id,fieldPath:'identifierCiphertext'});
        await assert.rejects(target.store.transaction(tx=>rebuild.apply(tx,actor,payload,{requestId:randomUUID(),ip:'test'})),undefined,mode);assert.equal(target.store.rows('people').length,0);
    }
    await f.store.transaction(async tx=>{const row=(await tx.get('personCredentials',t.graph.credentialId))!;await tx.replace('personCredentials',{...row,evidenceAssetId:randomUUID()});});
    const denied=await f.owner.cmd('POST','/exports',t.input);assert.equal(denied.status,409);assert.equal(result(denied).error.code,'TD2_CREDENTIAL_MEDIA_UNSUPPORTED');
});

test('TD2 changed identifiers, revoked identifier grants and lost sensitive permission stale queued and ready exports',async()=>{
    for(const mode of ['identifier','grant','permission']) {
        const {f,t}=await setup(),job=result(await f.owner.cmd('POST','/exports',t.input)).resourceId;
        if(mode==='identifier')assert.equal((await f.owner.cmd('POST',`/td2/credentials/${t.graph.credentialId}/identifier`,{schemaVersion:'once-talent-v2.0.0',expectedRevision:2,expectedPersonRevision:(await t.graph.current()).revision,identifier:'SYNTHETIC-UPDATED-5555'})).status,200);
        if(mode==='grant'){const grant=f.store.rows('usePermissions').find(p=>p.subjectKind==='PERSON'&&p.subjectId===t.graph.personId)!;assert.equal((await f.owner.cmd('POST',`/use-permissions/${grant.id}/revoke`,{expectedRevision:1})).status,200);}
        if(mode==='permission')await f.store.transaction(async tx=>{const m=(await tx.get('memberships',f.membershipId))!;await tx.replace('memberships',{...m,extraPermissions:m.extraPermissions.filter(p=>p!=='sensitive.read')});});
        const claim=await f.app.exports.claim();assert.ok(claim);assert.equal(claim.id,job);await f.app.exports.process(claim);
        assert.equal(f.store.rows('exports').find(j=>j.id===job)!.state,'STALE');assert.equal((await f.owner.raw('POST',`/exports/${t.jobId}/download`,{})).status,409);
    }
});

test('TD2 rebuild key files reject missing, public, symlink and malformed keys without disclosing contents',async()=>{
    const {f,t}=await setup(),dir=mkdtempSync(join(tmpdir(),'once-key-policy-'));
    try {
        const source=join(dir,'source'),target=join(dir,'target'),link=join(dir,'link');
        writeFileSync(source,f.app.config.contactKey.toString('hex'),{mode:0o600});writeFileSync(target,randomBytes(32).toString('hex'),{mode:0o600});symlinkSync(source,link);
        const env={REBUILD_SOURCE_CONTACT_KEY_FILE:source,CONTACT_KEY_FILE:target};assert.ok(loadCredentialRebuildKeys(t.download.payload,env));
        for(const mode of ['missing','public','link','malformed']) {
            if(mode==='public')chmodSync(source,0o644);else chmodSync(source,0o600);
            if(mode==='malformed')writeFileSync(source,'SYNTHETIC-PRIVATE-INVALID');
            assert.throws(()=>loadCredentialRebuildKeys(t.download.payload,{...env,...(mode==='missing'?{CONTACT_KEY_FILE:undefined}:{}),...(mode==='link'?{REBUILD_SOURCE_CONTACT_KEY_FILE:link}:{})}),(e:any)=>e.code==='REBUILD_CREDENTIAL_KEY_FILE_INVALID'&&!e.message.includes('SYNTHETIC-PRIVATE'));
        }
    } finally {rmSync(dir,{recursive:true,force:true});}
});

test('TD2 v5 remains unchanged and rebuilds without key files or unrelated credentials',async()=>{
    const f=await fixture(),t=await controlledTransfer(f.app,f.store,f.clock,f.owner,true,true,true,true),target=await fixture();
    assert.equal(t.bundle.schemaVersion,'once-talent-transfer-v5');assert.equal('personCredentials' in t.bundle.tables,false);assert.equal('identifierContextWorkspaceId' in t.bundle,false);
    assert.equal(loadCredentialRebuildKeys(t.download.payload,{CONTACT_KEY_FILE:'nonexistent'}),undefined);
    const rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
    await target.store.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'}));assert.equal(target.store.rows('personCredentials').length,0);
});

test('TD2 credentials with no identifier export and rebuild without granting sensitive fields or providing keys',async()=>{
    const f=await fixture(),source=result(await f.owner.cmd('POST','/sources',sourceInput())).resourceId;
    const person=result(await f.owner.cmd('POST','/td2/people',{schemaVersion:'once-talent-v2.0.0',originSourceId:source,sourceRevision:1,displayName:'合成无编号人才',createTalent:true})).resourceId;
    const credential=result(await f.owner.cmd('POST',`/td2/people/${person}/credentials`,{schemaVersion:'once-talent-v2.0.0',expectedPersonRevision:1,sourceId:source,sourceRevision:1,values:{credentialTypeCode:'OTHER',issuerName:'合成签发方'}})).resourceId;
    const codes=['person.td2.talentProfiles','person.td2.personCredentials'],personFields=['person.displayName','person.status',...codes],refs=[];
    for(const [kind,id,fields] of [['PERSON',person,personFields],['SOURCE',source,[...SOURCE_FIELDS,...codes]]] as const)refs.push(result(await f.owner.cmd('POST','/use-permissions',{subjectKind:kind,subjectId:id,sourceId:source,fields,validUntil:'2026-10-01T00:00:00.000Z',evidenceNote:'合成：不授予编号读取或迁移'})).resourceId);
    const created=await f.owner.cmd('POST','/exports',{format:'JSON',selectedIds:{people:[person],works:[],projects:[]},fields:[...personFields,...SOURCE_FIELDS],usePermissionRefs:refs});assert.equal(created.status,202,JSON.stringify(created.body));
    const job=result(created).resourceId,claim=await f.app.exports.claim();assert.ok(claim);await f.app.exports.process(claim);
    const download=await f.owner.raw('POST',`/exports/${job}/download`,{});assert.equal(download.status,200);const payload=result(download).payload;
    assert.equal(payload.manifest.talent.credentialIdentifiersIncluded,false);assert.equal(loadCredentialRebuildKeys(payload,{}),undefined);
    const target=await fixture(),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
    await target.store.transaction(tx=>rebuild.apply(tx,actor,payload,{requestId:randomUUID(),ip:'test'}));assert.equal(target.store.rows('personCredentials').find(r=>r.id===credential)!.identifierCiphertext,null);
});
