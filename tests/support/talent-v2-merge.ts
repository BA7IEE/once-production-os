import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../packages/core/src/errors.ts';
import { Application } from '../../packages/core/src/api.ts';
import type { Store } from '../../packages/core/src/store.ts';
import { TALENT_FACT_TABLES, TALENT_SCHEMA_VERSION as schemaVersion } from '../../packages/core/src/talent-v2-model.ts';
import { inspectTalentIntegrity, talentSnapshot } from '../../packages/core/src/talent-v2-integrity.ts';
import { decryptContact } from '../../packages/core/src/crypto.ts';
import { FakeClock, Client, sourceInput, result } from './fixtures.ts';
import { seedProfessionalGraph, expectResponse as ok } from './talent-v2-maintenance.ts';
import { FaultStore } from './fault-store.ts';

export function mergeInput(p: Record<string, any>) {
    return { canonicalId: p.canonical.id, duplicateId: p.duplicate.id,
        expectedCanonicalRevision: p.canonical.revision, expectedDuplicateRevision: p.duplicate.revision,
        previewDigest: p.previewDigest,
        fieldDecisions: p.fieldConflicts.map((x: any) => ({ field: x.field, choice: 'CANONICAL' })),
        collisionDecisions: p.collisions.map((x: any) => ({ collisionId: x.id, choice: 'KEEP_CANONICAL' })),
        professionalDecisions: p.professional.items.map(({ table, id, action }: any) => ({ table, id, action })),
        acknowledgeRevocations: true, acknowledgeMediaDetach: true, reason: '合成验收：人工确认重复身份及专业资料迁移' };
}
export async function mergePreview(store: Store, owner: Client, canonicalId: string, duplicateId: string) {
    const [a, b] = await store.transaction(async tx => [await tx.get('people', canonicalId), await tx.get('people', duplicateId)]);
    return ok(await owner.raw('POST', '/people/merge-preview', { canonicalId, duplicateId,
        expectedCanonicalRevision: a!.revision, expectedDuplicateRevision: b!.revision }), 200);
}

/** Identical assertions run against MemoryStore and PostgreSQL; writes use domain commands. */
export async function verifyProfessionalMerge(app: Application, store: Store, clock: FakeClock, owner: Client) {
    const graph = await seedProfessionalGraph(app, store, clock, owner);
    const person = await graph.current();
    const sourceId = ok(await owner.cmd('POST', '/sources', sourceInput())).resourceId as string;
    const canonicalId = ok(await owner.cmd('POST', '/td2/people', {
        schemaVersion, originSourceId: sourceId, sourceRevision: 1, displayName: '合成保留身份'
    })).resourceId as string;
    const shortlistId = ok(await owner.cmd('POST', '/shortlists', { title: '合成合并职业候选', scopeId: person.scopeId })).resourceId;
    ok(await owner.cmd('POST', `/shortlists/${shortlistId}/items`, {
        expectedRevision: 1, personId: person.id, personRoleId: graph.roleId, personRoleRevision: 1, note: '', workAssetIds: []
    }), 200);
    const snapshot = () => store.transaction(tx => talentSnapshot(tx, person.workspaceId));
    const before = await snapshot();
    const preview = await mergePreview(store, owner, canonicalId, person.id);
    assert.equal(preview.complete, true, JSON.stringify(preview.blockers));
    assert.deepEqual(await snapshot(), before, 'preview performs no graph writes');
    assert.ok(preview.professional.items.some((r: any) => r.id === graph.credentialId));
    assert.ok(preview.professional.items.some((r: any) => r.id === graph.proposalId && r.action === 'STALE_PROPOSAL'));
    assert.equal(JSON.stringify(preview).includes('SYNTHETIC-PRIVATE'), false);
    assert.equal(JSON.stringify(preview).includes('identifierCiphertext'), false);
    const input = mergeInput(preview), key = randomUUID();
    const missingDecision = await owner.cmd('POST', '/people/merge', { ...input, professionalDecisions: input.professionalDecisions.slice(1) });
    assert.equal(missingDecision.status, 422); assert.equal(result(missingDecision).error.code, 'TD2_MERGE_DECISIONS_INCOMPLETE');
    assert.deepEqual(await snapshot(), before);

    const fault = new FaultStore(store);
    fault.afterInsert = (table, row) => { if (table === 'audits' && 'action' in row && row.action === 'person.merge') throw new AppError(503, 'STORE_UNAVAILABLE', 'synthetic merge audit failure'); };
    const faultApp = new Application(fault, app.config, clock), client = new Client(faultApp);
    client.jar = { ...owner.jar }; client.csrf = owner.csrf;
    const failed = await client.cmd('POST', '/people/merge', input, key);
    assert.equal(failed.status, 503); assert.equal(result(failed).error.code, 'STORE_UNAVAILABLE');
    assert.ok(fault.insertTrace.includes('personAliases'), 'failure occurs after graph and alias writes');
    assert.deepEqual(await snapshot(), before, 'all graph changes roll back after the audit insert');
    fault.afterInsert = null;
    ok(await client.cmd('POST', '/people/merge', input, key), 200);
    const after = await snapshot();
    for (const table of TALENT_FACT_TABLES) {
        for (const old of before[table].filter(r => r.personId === person.id)) {
            const row = after[table].find(r => r.id === old.id)!;
            assert.ok(row, table + ': stable ID retained');
            assert.equal(row.personId, canonicalId); assert.equal(row.sourceId, old.sourceId);
            assert.equal(row.revision, Number(old.revision) + 1);
            const { personId: _oldPerson, revision: _oldRev, updatedAt: _oldAt, ...oldValues } = old;
            const { personId: _newPerson, revision: _newRev, updatedAt: _newAt, ...newValues } = row;
            assert.deepEqual(newValues, oldValues, table + ': no fact values replaced');
        }
    }
    assert.equal(after.fieldProposals.find(p => p.id === graph.proposalId)?.state, 'STALE');
    assert.deepEqual(after.evidence, before.evidence, 'typed evidence stays on its unchanged owner UUID');
    const candidate = after.shortlistItems.find(r => r.shortlistId === shortlistId)!;
    assert.equal(candidate.personId, canonicalId); assert.equal(candidate.personRoleId, graph.roleId);
    const credential = after.personCredentials.find(r => r.id === graph.credentialId)!;
    assert.equal(decryptContact(String(credential.identifierCiphertext), app.config.contactKey,
        `credential:${person.workspaceId}:${credential.id}`), 'SYNTHETIC-PRIVATE-9876');
    const integrity = await store.transaction(tx => inspectTalentIntegrity(tx, person.workspaceId, app.config.contactKey));
    assert.equal(integrity.relationFailures, 0); assert.equal(integrity.credentialDecryptFailures, 0);
    const detail = ok(await owner.raw('GET', '/td2/people/' + canonicalId), 200);
    assert.equal(detail.facts.personRoles.length, 2); assert.equal(detail.facts.measurementSets[0].id, graph.measurementId);
    const replay = ok(await client.cmd('POST', '/people/merge', input, key), 200);
    assert.equal(replay.replayed, true); assert.deepEqual(await snapshot(), after);
}

/** Conflicting professional graphs exercise both history retention and active-record selection. */
export async function verifyProfessionalConflicts(app: Application, store: Store, clock: FakeClock, owner: Client) {
    const a = await seedProfessionalGraph(app, store, clock, owner), b = await seedProfessionalGraph(app, store, clock, owner);
    const person = await a.current();
    const snapshot = () => store.transaction(tx => talentSnapshot(tx, person.workspaceId));
    const before = await snapshot(), p = await mergePreview(store, owner, a.personId, b.personId);
    assert.equal(p.complete, true, JSON.stringify(p.blockers));
    assert.equal(p.professional.conflicts.length, 7);
    const decisions = p.professional.conflicts.map((c: any) => ({ table: c.table, canonicalId: c.canonicalId, duplicateId: c.duplicateId,
        choice: c.choices.includes('RETAIN_DUPLICATE_HISTORY') ? 'RETAIN_DUPLICATE_HISTORY' : c.table === 'adultEligibilities' ? 'KEEP_DUPLICATE_ACTIVE' : 'KEEP_CANONICAL_ACTIVE' }));
    const input = { ...mergeInput(p), professionalConflicts: decisions }, key = randomUUID();
    assert.equal((await owner.cmd('POST', '/people/merge', { ...input, professionalConflicts: decisions.slice(1) })).status, 422);
    assert.equal((await owner.cmd('POST', '/people/merge', { ...input, professionalConflicts: [...decisions, decisions[0]] })).status, 422);
    const fault = new FaultStore(store);
    fault.afterInsert = (t, r) => { if (t === 'audits' && 'action' in r && r.action === 'person.merge') throw new AppError(503, 'STORE_UNAVAILABLE', 'synthetic conflict audit failure'); };
    const client = new Client(new Application(fault, app.config, clock)); client.jar = { ...owner.jar }; client.csrf = owner.csrf;
    assert.equal((await client.cmd('POST', '/people/merge', input, key)).status, 503);
    assert.ok(fault.insertTrace.includes('personAliases'));
    assert.deepEqual(await snapshot(), before);
    fault.afterInsert = null;
    ok(await client.cmd('POST', '/people/merge', input, key), 200);
    const after = await snapshot();
    for (const table of ['talentProfiles', 'castingProfiles'] as const) {
        const old = before[table].find(r => r.personId === b.personId)!, retained = after[table].find(r => r.id === old.id)!;
        assert.equal(retained.personId, b.personId); assert.equal(retained.sourceId, old.sourceId);
        assert.equal(retained.supersededById, before[table].find(r => r.personId === a.personId)!.id);
        if (table === 'castingProfiles') { assert.equal(retained.currentMeasurementSetId, null); assert.equal(retained.retiredCurrentMeasurementSetId, old.currentMeasurementSetId); }
        for (const [field, value] of Object.entries(old)) if (!['revision', 'updatedAt', 'supersededById', 'currentMeasurementSetId', 'retiredCurrentMeasurementSetId'].includes(field)) assert.deepEqual(retained[field], value);
        await assert.rejects(store.transaction(async tx => tx.remove(table, old.id)), /历史/);
        await assert.rejects(store.transaction(async tx => { const row = (await tx.get(table, old.id))!; await tx.replace(table, { ...row, revision: row.revision + 1 }); }), /只读/);
    }
    assert.deepEqual(after.evidence, before.evidence);
    assert.equal(after.personRoles.find(r => r.id === b.roleId)!.status, 'INACTIVE');
    assert.equal(after.personRoles.find(r => r.id === a.roleId)!.status, 'ACTIVE');
    assert.equal(after.personLanguages.find(r => r.id === b.languageId)!.status, 'INACTIVE');
    assert.equal(after.adultEligibilities.find(r => r.personId === a.personId && r.status === 'ACTIVE')!.sourceId, b.sourceId);
    assert.equal(after.adultEligibilities.filter(r => r.personId === a.personId && r.status === 'ACTIVE').length, 1);
    assert.equal(after.measurementSets.find(r => r.id === b.measurementId)!.personId, a.personId);
    assert.equal(after.personCredentials.find(r => r.id === b.credentialId)!.personRoleId, before.personCredentials.find(r => r.id === b.credentialId)!.personRoleId);
    const deletion = ok(await owner.raw('POST', '/deletion-requests/preview', { targetKind: 'PERSON', targetId: a.personId, expectedRevision: (await a.current()).revision }), 200);
    assert.equal(deletion.complete, false);
    assert.ok(deletion.unresolved.some((r: any) => r.code === 'TD2_MERGE_HISTORY_RETENTION_REQUIRED'));
    const history = ok(await owner.raw('GET', `/people/${a.personId}/merge-history`), 200);
    assert.equal(history.items.length, 2); assert.ok(history.items.every((r: any) => r.record.usable === false && r.originalPersonId === b.personId));
    assert.equal(JSON.stringify(history).includes('SYNTHETIC-PRIVATE'), false);
    const check = await store.transaction(tx => inspectTalentIntegrity(tx, person.workspaceId, app.config.contactKey));
    assert.equal(check.relationFailures, 0); assert.equal(check.credentialDecryptFailures, 0);
    assert.equal(ok(await client.cmd('POST', '/people/merge', input, key), 200).replayed, true);
    assert.deepEqual(await snapshot(), after);
    await store.transaction(async tx => { const source = (await tx.get('sources', b.sourceId))!; await tx.replace('sources', { ...source, status: 'SUSPENDED', revision: source.revision + 1 }); });
    assert.equal(ok(await owner.raw('GET', `/people/${a.personId}/merge-history`), 200).items.length, 0);
}

export async function seedRoleCandidates(app: Application,store: Store,clock: FakeClock,owner: Client) {
    const a=await seedProfessionalGraph(app,store,clock,owner),b=await seedProfessionalGraph(app,store,clock,owner);
    const list=ok(await owner.cmd('POST','/shortlists',{title:'合成多职业候选合并',scopeId:(await a.current()).scopeId})).resourceId as string;
    const ids:string[]=[];
    for(const [personId,role,note] of [[a.personId,a.roleId,'主档案模特备注'],[a.personId,a.translatorId,'主档案翻译备注'],[b.personId,b.roleId,'重复档案模特备注'],[b.personId,b.translatorId,'重复档案翻译备注']]) {
        const revision=(await store.transaction(tx=>tx.get('shortlists',list)))!.revision;
        ok(await owner.cmd('POST',`/shortlists/${list}/items`,{expectedRevision:revision,personId,personRoleId:role,personRoleRevision:1,note,workAssetIds:[]}),200);
        ids.push((await store.transaction(tx=>tx.find('shortlistItems',{shortlistId:list}))).find(r=>r.personId===personId&&r.personRoleId===role)!.id);
    }
    return {a,b,list,ids};
}
export async function verifyRoleCandidateMerge(app: Application,store: Store,clock: FakeClock,owner: Client) {
    const {a,b,list,ids}=await seedRoleCandidates(app,store,clock,owner);
    const workspaceId=(await a.current()).workspaceId,snapshot=()=>store.transaction(tx=>talentSnapshot(tx,workspaceId));
    const before=await snapshot(),p=await mergePreview(store,owner,a.personId,b.personId);
    assert.equal(p.complete,true,JSON.stringify(p.blockers));assert.equal(p.collisions.filter((c:any)=>c.kind==='SHORTLIST_ITEM').length,0);
    assert.equal(p.moves.shortlistItems,2);assert.equal(p.professional.items.filter((r:any)=>r.table==='shortlistItems').length,2);
    const input={...mergeInput(p),professionalConflicts:p.professional.conflicts.map((c:any)=>({table:c.table,canonicalId:c.canonicalId,duplicateId:c.duplicateId,choice:c.choices.includes('RETAIN_DUPLICATE_HISTORY')?'RETAIN_DUPLICATE_HISTORY':'KEEP_CANONICAL_ACTIVE'}))};
    assert.equal((await owner.cmd('POST','/people/merge',{...input,professionalDecisions:input.professionalDecisions.filter((r:any)=>r.table!=='shortlistItems')})).status,422);
    const fault=new FaultStore(store);fault.afterInsert=(t,r)=>{if(t==='audits'&&'action' in r&&r.action==='person.merge')throw new AppError(503,'STORE_UNAVAILABLE','synthetic candidate audit failure');};
    const client=new Client(new Application(fault,app.config,clock));client.jar={...owner.jar};client.csrf=owner.csrf;
    const key=randomUUID();assert.equal((await client.cmd('POST','/people/merge',input,key)).status,503);assert.deepEqual(await snapshot(),before);
    fault.afterInsert=null;ok(await client.cmd('POST','/people/merge',input,key),200);
    const after=await snapshot();
    for(const id of ids) {
        const old=before.shortlistItems.find(r=>r.id===id)!,row=after.shortlistItems.find(r=>r.id===id)!;
        assert.ok(row);assert.equal(row.personId,a.personId);assert.equal(row.personRoleId,old.personRoleId);assert.equal(row.note,old.note);assert.equal(row.personRoleRevision,old.personRoleRevision);assert.equal(row.roleContextState,old.roleContextState);
    }
    const detail=ok(await owner.raw('GET','/shortlists/'+list),200);assert.equal(detail.items.length,4);
    assert.equal(detail.items.filter((r:any)=>r.unavailable).length,2,'candidates tied to explicitly deactivated roles remain stored but unavailable');
    assert.equal(ok(await client.cmd('POST','/people/merge',input,key),200).replayed,true);assert.deepEqual(await snapshot(),after);
    assert.equal((await store.transaction(tx=>inspectTalentIntegrity(tx,workspaceId,app.config.contactKey))).relationFailures,0);
}

export async function verifyUnknownRoleCandidateMerge(app: Application, store: Store, clock: FakeClock, owner: Client) {
    for (const choice of ['KEEP_CANONICAL', 'KEEP_DUPLICATE'] as const) {
        const {a,b,list,ids}=await seedRoleCandidates(app,store,clock,owner);
        const workspaceId=(await a.current()).workspaceId, reviews=[randomUUID(),randomUUID()];
        await store.transaction(async tx=>{
            for(const [index,id] of [ids[0]!,ids[2]!].entries()) {
                const row=(await tx.get('shortlistItems',id))!;
                await tx.replace('shortlistItems',{...row,personRoleId:null,personRoleRevision:null,roleContextState:'LEGACY_REVIEW'});
                await tx.insert('talentMigrationReviews',{id:reviews[index]!,workspaceId,createdAt:clock.now().toISOString(),updatedAt:clock.now().toISOString(),revision:1,personId:row.personId,shortlistItemId:id,previousShortlistItemIds:[],reason:'SHORTLIST_ROLE_REQUIRED',state:'PENDING',resolvedAt:null,resolvedById:null});
            }
        });
        const snapshot=()=>store.transaction(tx=>talentSnapshot(tx,workspaceId)),before=await snapshot();
        const p=await mergePreview(store,owner,a.personId,b.personId);assert.equal(p.complete,true,JSON.stringify(p.blockers));
        assert.equal(p.collisions.filter((c:any)=>c.kind==='SHORTLIST_ITEM').length,1);
        const input={...mergeInput(p),collisionDecisions:p.collisions.map((c:any)=>({collisionId:c.id,choice})),professionalConflicts:p.professional.conflicts.map((c:any)=>({table:c.table,canonicalId:c.canonicalId,duplicateId:c.duplicateId,choice:c.choices.includes('RETAIN_DUPLICATE_HISTORY')?'RETAIN_DUPLICATE_HISTORY':'KEEP_CANONICAL_ACTIVE'}))};
        assert.equal((await owner.cmd('POST','/people/merge',{...input,collisionDecisions:[]})).status,422);
        const fault=new FaultStore(store);fault.afterInsert=(t,r)=>{if(t==='audits'&&'action' in r&&r.action==='person.merge')throw new AppError(503,'STORE_UNAVAILABLE','synthetic review merge audit failure');};
        const client=new Client(new Application(fault,app.config,clock));client.jar={...owner.jar};client.csrf=owner.csrf;
        const key=randomUUID();assert.equal((await client.cmd('POST','/people/merge',input,key)).status,503);assert.deepEqual(await snapshot(),before);
        fault.afterInsert=null;ok(await client.cmd('POST','/people/merge',input,key),200);
        const after=await snapshot(),kept=choice==='KEEP_CANONICAL'?ids[0]!:ids[2]!,removed=choice==='KEEP_CANONICAL'?ids[2]!:ids[0]!;
        assert.equal(after.shortlistItems.some(r=>r.id===removed),false);
        const candidate=after.shortlistItems.find(r=>r.id===kept)!;
        assert.equal(candidate.personId,a.personId);assert.equal(candidate.personRoleId,null);assert.equal(candidate.roleContextState,'LEGACY_REVIEW');
        assert.equal(candidate.note,before.shortlistItems.find(r=>r.id===kept)!.note);
        for(const id of reviews) {
            const old=before.talentMigrationReviews.find(r=>r.id===id)!,row=after.talentMigrationReviews.find(r=>r.id===id)!;
            assert.equal(row.personId,a.personId);assert.equal(row.shortlistItemId,kept);assert.equal(row.state,'PENDING');assert.equal(row.reason,old.reason);
            assert.equal(row.resolvedAt,null);assert.equal(row.resolvedById,null);assert.equal(row.createdAt,old.createdAt);
            assert.deepEqual(row.previousShortlistItemIds,old.shortlistItemId===removed?[removed]:[]);
        }
        assert.equal(ok(await client.cmd('POST','/people/merge',input,key),200).replayed,true);assert.deepEqual(await snapshot(),after);
        assert.equal((await store.transaction(tx=>inspectTalentIntegrity(tx,workspaceId,app.config.contactKey))).relationFailures,0);
        const role=await store.transaction(tx=>tx.get('personRoles',a.roleId));
        const root=await store.transaction(tx=>tx.get('shortlists',list));
        ok(await owner.cmd('POST',`/td2/shortlists/${list}/role`,{schemaVersion,expectedRevision:root!.revision,itemId:kept,personRoleId:role!.id,personRoleRevision:role!.revision}),200);
        const resolved=await snapshot();
        for(const id of reviews){const row=resolved.talentMigrationReviews.find(r=>r.id===id)!;assert.equal(row.state,'RESOLVED');assert.ok(row.resolvedById);assert.deepEqual(row.previousShortlistItemIds,after.talentMigrationReviews.find(r=>r.id===id)!.previousShortlistItemIds);}
    }
}

/** A chosen occupation cannot borrow credits or hidden media from another occupation/context. */
export async function verifyCandidateRoleContext(app:Application,store:Store,clock:FakeClock,owner:Client) {
    const g=await seedProfessionalGraph(app,store,clock,owner),person=await g.current();
    const workSource=ok(await owner.cmd('POST','/sources',sourceInput())).resourceId;
    const work=ok(await owner.cmd('POST','/works',{title:'合成仅翻译署名作品',sourceId:workSource})).resourceId;
    ok(await owner.cmd('POST',`/works/${work}/credits`,{expectedRevision:1,personId:g.personId,roleCode:'translator',note:'合成翻译贡献'}),200);
    const list=ok(await owner.cmd('POST','/shortlists',{title:'合成职业核对',scopeId:person.scopeId})).resourceId;
    const body={expectedRevision:1,personId:g.personId,workId:work,workAssetIds:[],note:'原候选备注'};
    const mismatch=await owner.cmd('POST',`/shortlists/${list}/items`,{...body,personRoleId:g.roleId,personRoleRevision:1});
    assert.equal(mismatch.status,422);assert.equal(result(mismatch).error.code,'WORK_ROLE_MISMATCH');
    assert.equal((await store.transaction(tx=>tx.find('shortlistItems',{shortlistId:list}))).length,0);
    ok(await owner.cmd('POST',`/shortlists/${list}/items`,{...body,personRoleId:g.translatorId,personRoleRevision:1}),200);
    const item=(await store.transaction(tx=>tx.find('shortlistItems',{shortlistId:list})))[0]!;
    assert.equal(ok(await owner.raw('GET',`/shortlists/${list}`),200).items[0].unavailable,false);
    const credit=(await store.transaction(tx=>tx.find('workCredits',{workId:work})))[0]!;
    const workBefore=(await store.transaction(tx=>tx.get('works',work)))!;
    ok(await owner.cmd('POST',`/works/${work}/credits/remove`,{expectedRevision:workBefore.revision,entryId:credit.id}),200);
    assert.deepEqual(ok(await owner.raw('GET',`/shortlists/${list}`),200).items[0],{id:item.id,position:0,unavailable:true});
    const workAfter=(await store.transaction(tx=>tx.get('works',work)))!;
    ok(await owner.cmd('POST',`/works/${work}/credits`,{expectedRevision:workAfter.revision,personId:g.personId,roleCode:'model',note:'合成更正职业贡献'}),200);
    const reviewId=randomUUID();
    await store.transaction(async tx=>{
        const row=(await tx.get('shortlistItems',item.id))!;await tx.replace('shortlistItems',{...row,personRoleId:null,personRoleRevision:null,roleContextState:'LEGACY_REVIEW'});
        await tx.insert('talentMigrationReviews',{id:reviewId,workspaceId:person.workspaceId,createdAt:clock.now().toISOString(),updatedAt:clock.now().toISOString(),revision:1,personId:person.id,shortlistItemId:item.id,previousShortlistItemIds:[],reason:'SHORTLIST_ROLE_REQUIRED',state:'PENDING',resolvedAt:null,resolvedById:null});
    });
    const preview=ok(await owner.raw('GET',`/shortlists/${list}`),200),candidate=preview.items[0];
    assert.equal(candidate.unavailable,true);assert.equal(candidate.roleReview.person.id,person.id);assert.deepEqual(candidate.roleReview.roles.map((r:any)=>r.id),[g.roleId]);assert.equal(candidate.note,undefined);
    const input={schemaVersion,expectedRevision:preview.revision,itemId:item.id,personRoleId:g.roleId,personRoleRevision:1};
    assert.equal((await owner.cmd('POST',`/td2/shortlists/${list}/role`,{...input,personRoleId:g.translatorId})).status,409);
    const source=(await store.transaction(tx=>tx.get('sources',workSource)))!;
    ok(await owner.cmd('POST',`/sources/${workSource}/suspend`,{expectedRevision:source.revision,reason:'合成作品依据暂停'}),200);
    assert.deepEqual(ok(await owner.raw('GET',`/shortlists/${list}`),200).items[0],{id:item.id,position:0,unavailable:true});
    const hidden=await owner.cmd('POST',`/td2/shortlists/${list}/role`,input);assert.equal(hidden.status,409);assert.equal(result(hidden).error.code,'SHORTLIST_CONTEXT_UNAVAILABLE');
    assert.equal((await store.transaction(tx=>tx.get('talentMigrationReviews',reviewId)))!.state,'PENDING');
    const suspended=(await store.transaction(tx=>tx.get('sources',workSource)))!;
    ok(await owner.cmd('POST',`/sources/${workSource}/review`,{expectedRevision:suspended.revision,basisDescription:'合成重新确认作品依据',validUntil:source.validUntil}),200);
    const before=await store.transaction(tx=>talentSnapshot(tx,person.workspaceId)),fault=new FaultStore(store);
    fault.afterInsert=(t,r)=>{if(t==='audits'&&'action' in r&&r.action==='td2.shortlist.role')throw new AppError(503,'STORE_UNAVAILABLE','synthetic role review audit failure');};
    const client=new Client(new Application(fault,app.config,clock));client.jar={...owner.jar};client.csrf=owner.csrf;
    const key=randomUUID();assert.equal((await client.cmd('POST',`/td2/shortlists/${list}/role`,input,key)).status,503);
    assert.deepEqual(await store.transaction(tx=>talentSnapshot(tx,person.workspaceId)),before);
    fault.afterInsert=null;ok(await client.cmd('POST',`/td2/shortlists/${list}/role`,input,key),200);
    assert.equal((await store.transaction(tx=>tx.get('talentMigrationReviews',reviewId)))!.state,'RESOLVED');
    assert.equal(ok(await owner.raw('GET',`/shortlists/${list}`),200).items[0].roleCode,'model');
    assert.equal(ok(await client.cmd('POST',`/td2/shortlists/${list}/role`,input,key),200).replayed,true);
}

export async function verifyLegacyCandidateEnrollment(app:Application,store:Store,clock:FakeClock,owner:Client) {
    const id=ok(await owner.cmd('POST','/people',{displayName:'合成既有候选升级',roles:['model','translator'],inlineSource:sourceInput()})).resourceId;
    const person=(await store.transaction(tx=>tx.get('people',id)))!;
    const list=ok(await owner.cmd('POST','/shortlists',{title:'合成升级前候选',scopeId:person.scopeId})).resourceId;
    ok(await owner.cmd('POST',`/shortlists/${list}/items`,{expectedRevision:1,personId:id,note:'历史职业尚未明确',workAssetIds:[]}),200);
    const item=(await store.transaction(tx=>tx.find('shortlistItems',{shortlistId:list})))[0]!;
    const before=await store.transaction(tx=>talentSnapshot(tx,person.workspaceId));
    const source=(await store.transaction(tx=>tx.get('sources',person.sourceId)))!;
    const input={schemaVersion,expectedRevision:person.revision,sourceRevision:source.revision},key=randomUUID();
    const fault=new FaultStore(store);fault.afterInsert=(t,r)=>{if(t==='audits'&&'action' in r&&r.action==='td2.person.enroll')throw new AppError(503,'STORE_UNAVAILABLE','synthetic enrollment audit failure');};
    const client=new Client(new Application(fault,app.config,clock));client.jar={...owner.jar};client.csrf=owner.csrf;
    assert.equal((await client.cmd('POST',`/td2/people/${id}/enroll`,input,key)).status,503);assert.deepEqual(await store.transaction(tx=>talentSnapshot(tx,person.workspaceId)),before);
    fault.afterInsert=null;ok(await client.cmd('POST',`/td2/people/${id}/enroll`,input,key),200);
    const after=(await store.transaction(tx=>tx.get('shortlistItems',item.id)))!;assert.equal(after.roleContextState,'LEGACY_REVIEW');assert.equal(after.personRoleId??null,null);assert.equal(after.note,item.note);
    assert.equal((await store.transaction(tx=>tx.find('talentMigrationReviews',{shortlistItemId:item.id,state:'PENDING'}))).length,1);
    const view=ok(await owner.raw('GET',`/shortlists/${list}`),200);assert.equal(view.revision,3);assert.equal(view.items[0].roleReview.roles.length,2);
    assert.equal(ok(await client.cmd('POST',`/td2/people/${id}/enroll`,input,key),200).replayed,true);
    const role=(await store.transaction(tx=>tx.find('personRoles',{personId:id,roleCode:'model'})))[0]!;
    ok(await owner.cmd('POST',`/shortlists/${list}/items`,{expectedRevision:view.revision,personId:id,personRoleId:role.id,personRoleRevision:role.revision,workAssetIds:[],note:'独立明确职业候选'}),200);
    const root=(await store.transaction(tx=>tx.get('shortlists',list)))!;
    const duplicate=await owner.cmd('POST',`/td2/shortlists/${list}/role`,{schemaVersion,expectedRevision:root.revision,itemId:item.id,personRoleId:role.id,personRoleRevision:role.revision});
    assert.equal(duplicate.status,409);assert.equal(result(duplicate).error.code,'DUPLICATE_LINK');
    assert.equal((await store.transaction(tx=>tx.get('shortlistItems',item.id)))!.personRoleId??null,null);
    assert.equal((await store.transaction(tx=>tx.find('talentMigrationReviews',{shortlistItemId:item.id,state:'PENDING'}))).length,1);
}
