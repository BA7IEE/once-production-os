import {decryptContact} from '../../packages/core/src/crypto.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Application } from '../../packages/core/src/api.ts';
import type { Store } from '../../packages/core/src/store.ts';
import { AppError } from '../../packages/core/src/errors.ts';
import { CREDENTIAL_IDENTIFIER_CODE, EVIDENCE_TRANSFER_CODE, transferRows, TRANSFER_CODES, TRANSFER_TABLES, TALENT_EXPORT_VERSION, type TalentTransfer } from '../../packages/core/src/talent-transfer.ts';
import { JsonRebuild } from '../../packages/core/src/rebuild.ts';
import { digest } from '../../packages/core/src/json.ts';
import { inspectTalentIntegrity } from '../../packages/core/src/talent-v2-integrity.ts';
import { FaultStore } from './fault-store.ts';
import { seedProfessionalGraph, expectResponse as ok } from './talent-v2-maintenance.ts';
import { FakeClock, Client, sourceInput } from './fixtures.ts';
export const SOURCE_FIELDS = ['source.title','source.type','source.providerClaim','source.basisMode','source.basisDescription','source.validFrom','source.validUntil','source.status'];
export async function controlledTransfer(app: Application, store: Store, clock: FakeClock, owner: Client, includeCapabilities = true, includeExternal = false, includeRepresentations = false, includeEvidence = false, includeCredentials = false) {
    const graph = await seedProfessionalGraph(app, store, clock, owner);
    const secondSource = ok(await owner.cmd('POST','/sources',{...sourceInput(),title:'第二份专业来源'})).resourceId as string;
    const secondLanguage = ok(await owner.cmd('POST',`/td2/people/${graph.personId}/languages`,{schemaVersion:'once-talent-v2.0.0',expectedPersonRevision:(await graph.current()).revision,sourceId:secondSource,sourceRevision:1,values:{languageCode:'zh',speakingLevelCode:'NATIVE'}})).resourceId as string;
    let organizationId: string|null=null, organizationSource: string|null=null;
    if(includeExternal) {
        organizationSource=ok(await owner.cmd('POST','/sources',{...sourceInput(),title:'关联机构独立来源'})).resourceId as string;
        organizationId=ok(await owner.cmd('POST','/td2/organizations',{schemaVersion:'once-talent-v2.0.0',sourceId:organizationSource,sourceRevision:1,name:'合成签发机构',kind:'ISSUER'})).resourceId as string;
        for(const revoked of [true,false]) {
            const id=ok(await owner.cmd('POST',`/td2/people/${graph.personId}/external-refs`,{schemaVersion:'once-talent-v2.0.0',expectedPersonRevision:(await graph.current()).revision,sourceId:graph.sourceId,sourceRevision:1,values:{providerCode:'AGENCY_INTERNAL',namespaceCode:'staff',externalKey:'synthetic-member',issuerOrganizationId:organizationId}})).resourceId as string;
            ok(await owner.cmd('POST',`/td2/external-refs/${id}/verify`,{schemaVersion:'once-talent-v2.0.0',expectedRevision:1,expectedPersonRevision:(await graph.current()).revision,sourceRevision:1}),200);
            if(revoked) ok(await owner.cmd('POST',`/td2/external-refs/${id}/revoke`,{schemaVersion:'once-talent-v2.0.0',expectedRevision:2,expectedPersonRevision:(await graph.current()).revision,sourceRevision:1}),200);
        }
    }
    let agentId: string|null=null;
    if(includeRepresentations) {
        agentId=(await store.transaction(tx=>tx.find('representations',{personId:graph.personId})))[0]!.agentPersonId;
        if(organizationId) ok(await owner.cmd('POST',`/td2/people/${graph.personId}/representations`,{schemaVersion:'once-talent-v2.0.0',expectedPersonRevision:(await graph.current()).revision,sourceId:graph.sourceId,sourceRevision:1,values:{agencyOrganizationId:organizationId,relationCode:'AGENCY',personRoleId:graph.roleId,validUntil:'2026-11-01T00:00:00.000Z',status:'INACTIVE'}}));
    }
    if(includeCredentials) {
        const revoked=await graph.add('personCredentials',{credentialTypeCode:'TRANSLATION_CERTIFICATE',personRoleId:graph.translatorId,issuerOrganizationId:organizationId,issuerName:organizationId?null:'合成签发方',issuedOn:'2020-01-01',expiresOn:'2021-01-01'});
        ok(await owner.cmd('POST',`/td2/credentials/${revoked}/identifier`,{schemaVersion:'once-talent-v2.0.0',expectedRevision:1,expectedPersonRevision:(await graph.current()).revision,identifier:'SYNTHETIC-REVOKED-1234'}),200);
        ok(await owner.cmd('POST',`/td2/credentials/${revoked}/revoke`,{schemaVersion:'once-talent-v2.0.0',expectedRevision:2,expectedPersonRevision:(await graph.current()).revision,sourceRevision:1}),200);
        await graph.add('personCredentials',{credentialTypeCode:'OTHER',issuerName:'合成无编号资质'});
    }
    let evidenceSource:string|null=null;
    if(includeEvidence) {
        evidenceSource=ok(await owner.cmd('POST','/sources',{...sourceInput(),title:'字段证据独立来源'})).resourceId as string;
        ok(await owner.cmd('POST','/td2/evidence',{schemaVersion:'once-talent-v2.0.0',ownerKind:'personLanguages',ownerId:graph.languageId,fieldPath:'speakingLevelCode',expectedRevision:(await store.transaction(tx=>tx.get('personLanguages',graph.languageId)))!.revision,sourceId:evidenceSource,sourceRevision:1}),200);
    }
    const permission = async(kind: string,id: string,sourceId: string,fields: string[]) => ok(await owner.cmd('POST','/use-permissions',{subjectKind:kind,subjectId:id,sourceId,fields,validUntil:'2026-10-01T00:00:00.000Z',evidenceNote:'合成验收：明确允许所列资料内部重建'})).resourceId as string;
    const codes = TRANSFER_CODES.filter(c=>(includeCapabilities || c!=='person.td2.personCapabilities')&&(includeExternal || c!=='person.td2.personExternalRefs')&&(includeRepresentations || c!=='person.td2.representations')&&(includeCredentials || c!=='person.td2.personCredentials'));
    const evidenceCodes=[...(includeEvidence?[EVIDENCE_TRANSFER_CODE]:[]),...(includeCredentials?[CREDENTIAL_IDENTIFIER_CODE]:[])];
    const personFields = ['person.displayName','person.aliases','person.intro','person.status',...codes,...evidenceCodes];
    const personPermission = await permission('PERSON',graph.personId,graph.sourceId,personFields);
    const agentPermission=agentId?await permission('PERSON',agentId,graph.sourceId,personFields):null;
    const primaryPermission = await permission('SOURCE',graph.sourceId,graph.sourceId,[...SOURCE_FIELDS,...codes,...evidenceCodes]);
    const secondaryPermission = await permission('SOURCE',secondSource,secondSource,[...SOURCE_FIELDS,'person.td2.personLanguages',...(includeEvidence?[EVIDENCE_TRANSFER_CODE]:[])]);
    const organizationPermission=organizationSource?await permission('SOURCE',organizationSource,organizationSource,[...SOURCE_FIELDS,'person.td2.personExternalRefs',...(includeRepresentations?['person.td2.representations']:[]),...(includeCredentials?['person.td2.personCredentials']:[])]):null;
    const evidencePermission=evidenceSource?await permission('SOURCE',evidenceSource,evidenceSource,[...SOURCE_FIELDS,'person.td2.personLanguages',EVIDENCE_TRANSFER_CODE]):null;
    const input = {format:'JSON',selectedIds:{people:[graph.personId,...(agentId?[agentId]:[])],works:[],projects:[]},fields:[...personFields,...SOURCE_FIELDS],usePermissionRefs:[personPermission,primaryPermission,secondaryPermission,...(agentPermission?[agentPermission]:[]),...(organizationPermission?[organizationPermission]:[]),...(evidencePermission?[evidencePermission]:[])]};
    if(organizationPermission) assert.equal((await owner.cmd('POST','/exports',{...input,usePermissionRefs:input.usePermissionRefs.filter(id=>id!==organizationPermission)})).status,422,'issuing organization needs its own source grant');
    const before = await store.transaction(tx=>tx.find('exports'));
    assert.equal((await owner.cmd('POST','/exports',{...input,usePermissionRefs:[personPermission]})).status,422,'person permission alone cannot authorize fact sources');
    assert.equal((await store.transaction(tx=>tx.find('exports'))).length,before.length);
    const jobId = ok(await owner.cmd('POST','/exports',input),202).resourceId as string;
    const claim = await app.exports.claim(); assert.ok(claim); assert.equal(claim.id,jobId); await app.exports.process(claim);
    const download = ok(await owner.raw('POST',`/exports/${jobId}/download`,{}),200);
    assert.equal(download.sha256,digest(download.payload)); assert.equal(download.payload.schemaVersion,TALENT_EXPORT_VERSION);
    const bundle = download.payload.manifest.talent as TalentTransfer;
    assert.equal(bundle.tables.personLanguages.find(r=>r.id===secondLanguage)!.sourceId,secondSource);
    assert.equal(bundle.tables.translatorLanguagePairs[0]!.data.personRoleId,graph.translatorId);
    assert.equal(bundle.tables.castingProfiles[0]!.data.currentMeasurementSetId,graph.measurementId);
    const encoded=JSON.stringify(download.payload);
    for (const secret of ['SYNTHETIC-PRIVATE','SYNTHETIC-REVOKED',...(!includeCredentials?['identifierCiphertext']:[]),'credentialHash','proposedValue',...(!includeExternal?['personExternalRefs']:[]),'mediaCollections','adultEligibilities']) assert.equal(encoded.includes(secret),false,secret+' must not enter this whitelist');
    return {evidenceSource,evidencePermission,agentId,agentPermission,organizationId,organizationSource,organizationPermission,graph,secondSource,secondLanguage,jobId,input,download,bundle,secondaryPermission};
}
export async function roundTripTransfer(source: {app:Application;store:Store;clock:FakeClock;owner:Client}, target: {app:Application;store:Store;clock:FakeClock;apply?: (payload: unknown, sha256: string) => Promise<void>}) {
    const transfer = await controlledTransfer(source.app,source.store,source.clock,source.owner,true,true,true,true,true);
    const rebuild = new JsonRebuild(target.clock,{sourceContactKey:source.app.config.contactKey,targetContactKey:target.app.config.contactKey}), actor = await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
    const preview = await target.store.transaction(tx=>rebuild.preview(tx,actor,transfer.download.payload));
    assert.equal(preview.schemaVersion,TALENT_EXPORT_VERSION); assert.equal(preview.professionalRecords,19);
    assert.equal(preview.capabilityDefinitions,1);assert.equal(preview.organizations,1);
    const malformed=structuredClone(transfer.download.payload); malformed.manifest.talent.tables.translatorLanguagePairs[0].data.personRoleId=randomUUID();
    await assert.rejects(target.store.transaction(tx=>rebuild.preview(tx,actor,malformed)),/专业关联/);
    const crossPerson=structuredClone(transfer.download.payload), foreignPerson=randomUUID();
    crossPerson.manifest.people.push({...crossPerson.manifest.people[0],id:foreignPerson});
    crossPerson.manifest.talent.tables.translatorLanguagePairs[0].personId=foreignPerson;
    await assert.rejects(target.store.transaction(tx=>rebuild.preview(tx,actor,crossPerson)),/专业关联/);
    const unknown=structuredClone(transfer.download.payload); unknown.manifest.talent.tables.talentProfiles[0].data.identifierCiphertext='forbidden';
    await assert.rejects(target.store.transaction(tx=>rebuild.preview(tx,actor,unknown)),/未知字段/);
    const fault = new FaultStore(target.store); fault.afterInsert=(table,row)=>{if(table==='audits'&&'action' in row&&row.action==='rebuild.apply')throw new AppError(503,'STORE_UNAVAILABLE','synthetic rebuild audit failure');};
    await assert.rejects(fault.transaction(tx=>rebuild.apply(tx,actor,transfer.download.payload,{requestId:randomUUID(),ip:'test'})),/synthetic rebuild audit/);
    assert.ok(fault.insertTrace.includes('translatorLanguagePairs'));assert.ok(fault.insertTrace.includes('evidence'));
    assert.equal((await target.store.transaction(tx=>tx.find('evidence'))).length,0);
    assert.equal((await target.store.transaction(tx=>tx.find('people'))).length,0);
    assert.equal((await target.store.transaction(tx=>tx.find('capabilityDefinitions'))).length,0);
    assert.equal((await target.store.transaction(tx=>tx.find('organizations'))).length,0);
    if (target.apply) await target.apply(transfer.download.payload,transfer.download.sha256);
    else await target.store.transaction(tx=>rebuild.apply(tx,actor,transfer.download.payload,{requestId:randomUUID(),ip:'test'}));
    for (const table of TRANSFER_TABLES) for (const row of transferRows(transfer.bundle,table)) {
        const restored=await target.store.transaction(tx=>tx.get(table,row.id)); assert.ok(restored);
        assert.equal(restored.personId,row.personId); assert.equal(restored.sourceId,row.sourceId); assert.equal(restored.revision,row.revision);
        for (const [key,value] of Object.entries(row.data)) {
            const actual=(restored as unknown as Record<string,unknown>)[key];
            if(table==='personCredentials'&&key==='identifierCiphertext'&&value) {
                assert.notEqual(actual,value);
                assert.equal(decryptContact(String(actual),target.app.config.contactKey,`credential:${actor.workspaceId}:${row.id}`),decryptContact(String(value),source.app.config.contactKey,`credential:${transfer.bundle.identifierContextWorkspaceId}:${row.id}`));
            }else assert.deepEqual(actual,value,table+'.'+key);
        }
    }
    for (const definition of transfer.bundle.capabilityDefinitions??[]) {
        const restored = await target.store.transaction(tx=>tx.get('capabilityDefinitions',definition.id));
        assert.ok(restored); const {workspaceId,...actual}=restored; assert.deepEqual(actual,definition);
    }
    for (const organization of transfer.bundle.organizations??[]) {
        const restored=await target.store.transaction(tx=>tx.get('organizations',organization.id));assert.ok(restored);
        const {workspaceId,scopeId,...actual}=restored;assert.deepEqual(actual,organization);
        const source=await target.store.transaction(tx=>tx.get('sources',organization.sourceId));assert.equal(scopeId,source!.scopeId);
    }
    const evidence=await target.store.transaction(tx=>tx.find('evidence'));
    assert.equal(evidence.length,transfer.bundle.evidence!.length);assert.ok(evidence.length>0);
    for(const original of transfer.bundle.evidence!) {
        const row=evidence.find(e=>e.id===original.id)!;assert.ok(row);
        assert.equal(row.sourceId,original.sourceId);assert.equal(row.sourceRevision,original.sourceRevision);assert.equal(row.valueDigest,original.valueDigest);
        assert.equal(row.reviewerId,null);assert.equal(row.reviewedAt,null);
        assert.equal(row.originalReviewWorkspaceId,original.originalReview?.workspaceId??null);assert.equal(row.originalReviewMembershipId,original.originalReview?.membershipId??null);assert.equal(row.originalReviewedAt,original.originalReview?.reviewedAt??null);
    }
    assert.equal((await target.store.transaction(tx=>tx.find('servicePrincipals'))).length,0);
    const integrity=await target.store.transaction(tx=>inspectTalentIntegrity(tx,actor.workspaceId,target.app.config.contactKey)); assert.equal(integrity.relationFailures,0);assert.equal(integrity.credentialDecryptFailures,0);assert.equal(integrity.credentialCount,2);
    await assert.rejects(target.store.transaction(tx=>rebuild.apply(tx,actor,transfer.download.payload,{requestId:randomUUID(),ip:'test'})),/业务数据/);
    ok(await source.owner.cmd('POST',`/use-permissions/${transfer.secondaryPermission}/revoke`,{expectedRevision:1}),200);
    assert.equal((await source.owner.raw('POST',`/exports/${transfer.jobId}/download`,{})).status,409);
    return transfer;
}
