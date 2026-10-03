import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,member,result,sourceInput} from '../support/fixtures.ts';
import {expectResponse as ok} from '../support/talent-v2-maintenance.ts';
const V='once-talent-v2.1.0',D='once-talent-experience-v1';
async function setupReview(){const f=await fixture(),editor=await member(f,'floweditor'),reviewer=await member(f,'flowreviewer','REVIEWER');
 const id=ok(await editor.client.cmd('POST','/directory/talents',{schemaVersion:D,displayName:'合成核验人才',kind:'TALENT',roleCodes:['model']}),201).resourceId;
 const options=ok(await editor.client.raw('GET',`/people/${id}/source-review-options`),200),publisher=options.publishers.find((p:any)=>p.id!==editor.id);
 const target=options.scopes.find((s:any)=>f.store.rows('scopes').find(t=>t.id===s.id)?.mode==='WORKSPACE').id;
 const input={expectedRevision:options.revision,expectedSourceRevision:options.sourceRevision,reviewerId:reviewer.id,publisherId:publisher.id,targetScopeId:target,expiresAt:'2026-09-29T00:00:00.000Z',acknowledgeLimitedAccess:true};
 return {...f,editor,reviewer,id,input,sourceId:f.store.rows('people').find(p=>p.id===id)!.sourceId};}
test('editor private intake -> reviewer accepts evidence -> designated publisher shares; native endpoints stay closed until publish',async()=>{
 const f=await setupReview(),key=randomUUID();assert.equal((await f.owner.raw('GET',`/sources/${f.sourceId}`)).status,404);
 const task=ok(await f.editor.client.cmd('POST',`/people/${f.id}/source-reviews`,f.input,key),201).resourceId;
 assert.equal(ok(await f.reviewer.client.raw('GET',`/source-reviews/${task}`),200).source,null);
 ok(await f.reviewer.client.cmd('POST',`/source-reviews/${task}/accept`,{expectedRevision:1}),200);
 assert.equal(ok(await f.reviewer.client.raw('GET',`/source-reviews/${task}`),200).person.id,f.id);
 assert.equal((await f.reviewer.client.raw('GET',`/sources/${f.sourceId}`)).status,404);
 assert.equal((await f.reviewer.client.raw('GET',`/directory/talents/${f.id}`)).status,404);
 ok(await f.reviewer.client.cmd('POST',`/source-reviews/${task}/review`,{expectedRevision:2,basisDescription:'合成：明确允许团队内部核验使用',validUntil:'2026-12-31T00:00:00.000Z'}),200);
 assert.equal(f.store.rows('sources')[0]!.basisMode,'INTERNAL_USE');assert.equal((await f.owner.raw('GET',`/sources/${f.sourceId}`)).status,404);
 const body={expectedRevision:3,confirmScope:true},publishKey=randomUUID();f.store.failNextAudit=true;
 assert.equal((await f.owner.cmd('POST',`/source-reviews/${task}/publish`,body,publishKey)).status,500);assert.equal(f.store.rows('sourceReviews')[0]!.state,'REVIEWED');assert.equal((await f.owner.raw('GET',`/sources/${f.sourceId}`)).status,404);
 ok(await f.owner.cmd('POST',`/source-reviews/${task}/publish`,body,publishKey),200);assert.equal(result(await f.owner.cmd('POST',`/source-reviews/${task}/publish`,body,publishKey)).replayed,true);
 assert.equal((await f.owner.raw('GET',`/directory/talents/${f.id}`)).status,200);assert.equal((await f.owner.raw('GET',`/sources/${f.sourceId}`)).status,200);
 assert.equal(ok(await f.reviewer.client.raw('GET',`/source-reviews/${task}`),200).source,null);
 assert.equal(result(await f.editor.client.cmd('POST',`/people/${f.id}/source-reviews`,f.input,key)).replayed,true);
});
test('review revocation closes limited material access, outsider cannot read task; changes invalidate accepted task',async()=>{
 const f=await setupReview(),outsider=await member(f,'flowoutsider','ADMIN');
 const task=ok(await f.editor.client.cmd('POST',`/people/${f.id}/source-reviews`,f.input),201).resourceId;
 assert.equal((await outsider.client.raw('GET',`/source-reviews/${task}`)).status,404);
 ok(await f.reviewer.client.cmd('POST',`/source-reviews/${task}/accept`,{expectedRevision:1}),200);
 ok(await f.editor.client.cmd('PATCH',`/sources/${f.sourceId}`,{expectedRevision:1,title:'合成：来源修改'}),200);
 assert.equal(ok(await f.reviewer.client.raw('GET',`/source-reviews/${task}`),200).effectiveState,'INVALIDATED');
 assert.equal((await f.reviewer.client.cmd('POST',`/source-reviews/${task}/review`,{expectedRevision:2,basisDescription:'不能使用过时授权',validUntil:'2026-12-31T00:00:00.000Z'})).status,409);
 ok(await f.editor.client.cmd('POST',`/source-reviews/${task}/revoke`,{expectedRevision:2}),200);
 assert.equal(ok(await f.reviewer.client.raw('GET',`/source-reviews/${task}`),200).source,null);
});
test('expired owner draft can enter a fresh limited review, but expiry never renews itself',async()=>{
 const f=await setupReview();f.clock.advance(8*86400000);await f.editor.client.login('floweditor');await f.reviewer.client.login('flowreviewer');
 assert.equal((await f.editor.client.raw('GET',`/directory/talents/${f.id}`)).status,404);
 const c=ok(await f.editor.client.raw('GET','/source-reviews/candidates'),200);assert.equal(c.items[0].id,f.id);assert.match(c.items[0].displayName,/已过期/);
 const task=ok(await f.editor.client.cmd('POST',`/people/${f.id}/source-reviews`,{...f.input,expiresAt:'2026-10-06T00:00:00.000Z'}),201).resourceId;
 ok(await f.reviewer.client.cmd('POST',`/source-reviews/${task}/accept`,{expectedRevision:1}),200);
 assert.equal(f.store.rows('sources')[0]!.basisMode,'TEMP_ORGANIZE');assert.equal((await f.editor.client.raw('GET',`/directory/talents/${f.id}`)).status,404);
});
test('typed import creates searchable talent roles and city; ordinary contact stays a contact',async()=>{
 const f=await fixture(),sourceId=ok(await f.owner.cmd('POST','/sources',sourceInput()),201).resourceId;
 const batch=ok(await f.owner.cmd('POST','/imports/preview',{schemaVersion:'once-talent-import-v2',sourceId,rows:[{displayName:'合成导入模特',roles:['model'],cityCode:'shenzhen'},{displayName:'合成普通联系人',kind:'CONTACT',roles:[]}]}),201).resourceId;
 ok(await f.owner.cmd('POST',`/imports/${batch}/commit`,{expectedRevision:1,selectedRows:[0,1]}),202);const claim=await f.app.imports.claim();assert.equal(claim!.type,'IMPORT_TALENTS_V2');await f.app.imports.process(claim!);
 assert.equal(f.store.rows('jobs')[0]!.state,'SUCCEEDED');assert.equal(f.store.rows('talentProfiles').length,1);assert.equal(f.store.rows('talentLocations')[0]!.locationCode,'shenzhen');
 assert.equal(ok(await f.owner.raw('POST','/directory/talents/search',{mode:'TALENT',role:'model',location:'shenzhen'}),200).total,1);
 assert.equal(ok(await f.owner.raw('POST','/directory/talents/search',{mode:'CONTACT'}),200).total,1);
});
test('legacy batch semantics remain stable, explicit repair is bounded, replayable and works after preview expiry',async()=>{
 const f=await fixture(),sourceId=ok(await f.owner.cmd('POST','/sources',sourceInput()),201).resourceId;
 const batch=ok(await f.owner.cmd('POST','/imports/preview',{sourceId,rows:[{displayName:'合成旧导入',roles:['model'],cityCode:'shenzhen'}]}),201).resourceId;
 ok(await f.owner.cmd('POST',`/imports/${batch}/commit`,{expectedRevision:1,selectedRows:[0]}),202);const claim=await f.app.imports.claim();assert.equal(claim!.type,'IMPORT_PEOPLE');await f.app.imports.process(claim!);assert.equal(f.store.rows('talentProfiles').length,0);
 f.clock.advance(2*86400000);await f.owner.login();const preview=ok(await f.owner.raw('GET',`/imports/${batch}/upgrade-preview`),200);assert.equal(preview.rows[0].state,'READY');
 const {index,personId,expectedPersonRevision,sourceRevision}=preview.rows[0],input={expectedRevision:preview.revision,confirm:true,entries:[{index,personId,expectedPersonRevision,sourceRevision}]},key=randomUUID();
 f.store.failNextAudit=true;assert.equal((await f.owner.cmd('POST',`/imports/${batch}/upgrade`,input,key)).status,500);assert.equal(f.store.rows('talentProfiles').length,0);
 ok(await f.owner.cmd('POST',`/imports/${batch}/upgrade`,input,key),200);assert.equal(result(await f.owner.cmd('POST',`/imports/${batch}/upgrade`,input,key)).replayed,true);assert.equal(f.store.rows('personRoles').length,1);
 assert.equal(ok(await f.owner.raw('GET',`/imports/${batch}/upgrade-preview`),200).rows[0].state,'COMPLETE');
});
test('multi-source core correction uses individual bases, preserves atomic rollback and rejects stale selected facts',async()=>{
 const f=await fixture(),s1=ok(await f.owner.cmd('POST','/sources',sourceInput()),201).resourceId,s2=ok(await f.owner.cmd('POST','/sources',sourceInput()),201).resourceId;
 const id=ok(await f.owner.cmd('POST','/directory/talents',{schemaVersion:D,displayName:'合成多来源',kind:'TALENT',roleCodes:['actor'],sourceId:s1,sourceRevision:1}),201).resourceId;
 const person=()=>f.store.rows('people').find(p=>p.id===id)!;
 const model=ok(await f.owner.cmd('POST',`/td2/people/${id}/roles`,{schemaVersion:V,expectedPersonRevision:person().revision,sourceId:s2,sourceRevision:1,values:{roleCode:'model'}}),201).resourceId;
 const profile=f.store.rows('talentProfiles')[0]!,input={schemaVersion:D,expectedRevision:person().revision,sourceId:s1,sourceRevision:1,bases:{profile:{sourceId:s1,sourceRevision:1,recordId:profile.id,expectedRevision:profile.revision},model:{sourceId:s2,sourceRevision:1,recordId:model,expectedRevision:1}},profile:{genderCode:'FEMALE'},model:{experienceCode:'PROFESSIONAL'}};
 assert.equal((await f.owner.cmd('PATCH',`/directory/talents/${id}`,{...input,bases:{...input.bases,model:{...input.bases.model,expectedRevision:2}}})).status,409);assert.equal(f.store.rows('talentProfiles')[0]!.genderCode,null);
 ok(await f.owner.cmd('PATCH',`/directory/talents/${id}`,input),200);assert.equal(f.store.rows('personRoles').find(r=>r.id===model)!.experienceCode,'PROFESSIONAL');assert.equal(f.store.rows('talentProfiles')[0]!.genderCode,'FEMALE');
});
test('shared source cannot enter single-person review or silently reveal another identity',async()=>{
 const f=await setupReview();ok(await f.editor.client.cmd('POST','/directory/talents',{schemaVersion:D,displayName:'另一个合成人物',kind:'TALENT',sourceId:f.sourceId,sourceRevision:1}),201);
 const r=await f.editor.client.cmd('POST',`/people/${f.id}/source-reviews`,f.input);assert.equal(r.status,409);assert.equal(result(r).error.code,'REVIEW_SHARED_SOURCE');assert.equal(f.store.rows('sourceReviews').length,0);
});
test('raw evidence requires a qualified reviewer, and grant invalidates when membership changes',async()=>{
 const f=await setupReview(),sensitive=await member(f,'flowraw','EDITOR',['sensitive.write']);
 await f.store.transaction(async tx=>{const member=(await tx.get('memberships',f.editor.id))!;await tx.replace('memberships',{...member,extraPermissions:['sensitive.write'],revision:member.revision+1});});
 ok(await f.editor.client.cmd('PATCH',`/sources/${f.sourceId}`,{expectedRevision:1,textPayload:'合成受限证据原文'}),200);
 let options=ok(await f.editor.client.raw('GET',`/people/${f.id}/source-review-options`),200);assert.ok(!options.reviewers.some((r:any)=>r.id===f.reviewer.id));assert.ok(!options.reviewers.some((r:any)=>r.id===sensitive.id));
 const reviewer=await member(f,'flowrawreviewer','REVIEWER',['sensitive.read']);options=ok(await f.editor.client.raw('GET',`/people/${f.id}/source-review-options`),200);
 const task=ok(await f.editor.client.cmd('POST',`/people/${f.id}/source-reviews`,{...f.input,expectedSourceRevision:2,reviewerId:reviewer.id}),201).resourceId;
 ok(await reviewer.client.cmd('POST',`/source-reviews/${task}/accept`,{expectedRevision:1}),200);assert.equal(ok(await reviewer.client.raw('GET',`/source-reviews/${task}`),200).source.textPayload,'合成受限证据原文');
 await f.store.transaction(async tx=>{const m=(await tx.get('memberships',reviewer.id))!;await tx.replace('memberships',{...m,extraPermissions:[],revision:m.revision+1});});
 const stale=ok(await reviewer.client.raw('GET',`/source-reviews/${task}`),200);assert.equal(stale.effectiveState,'INVALIDATED');assert.equal(stale.source,null);
 assert.ok(!JSON.stringify(f.store.rows('audits')).includes('合成受限证据原文'));
});
test('restored workspace epoch invalidates an accepted source review',async()=>{
 const f=await setupReview(),task=ok(await f.editor.client.cmd('POST',`/people/${f.id}/source-reviews`,f.input),201).resourceId;ok(await f.reviewer.client.cmd('POST',`/source-reviews/${task}/accept`,{expectedRevision:1}),200);
 f.app.config.recoveryEpoch='new-recovery-epoch';await f.store.transaction(async tx=>{const w=(await tx.get('workspaces',f.workspaceId))!;await tx.replace('workspaces',{...w,recoveryEpoch:f.app.config.recoveryEpoch});});
 assert.equal((await f.reviewer.client.raw('GET',`/source-reviews/${task}`)).status,503);ok(await f.reviewer.client.login('flowreviewer'),200);
 const response=ok(await f.reviewer.client.raw('GET',`/source-reviews/${task}`),200);assert.equal(response.effectiveState,'INVALIDATED');assert.equal(response.source,null);
});
test('core city correction targets the selected period instead of the first historical BASE row',async()=>{
 const f=await fixture(),sourceId=ok(await f.owner.cmd('POST','/sources',sourceInput()),201).resourceId,id=ok(await f.owner.cmd('POST','/directory/talents',{schemaVersion:D,displayName:'合成分期常驻地',kind:'TALENT',sourceId,sourceRevision:1}),201).resourceId;
 const cities=f.store.rows('dictionary').filter(d=>d.namespace==='city'&&d.status==='ACTIVE');assert.ok(cities.length>=2);const rev=()=>f.store.rows('people').find(p=>p.id===id)!.revision;
 const make=async(values:any)=>ok(await f.owner.cmd('POST',`/td2/people/${id}/locations`,{schemaVersion:V,sourceId,sourceRevision:1,expectedPersonRevision:rev(),values:{locationCode:cities[0]!.code,relationCode:'BASE',...values}}),201).resourceId;
 const old=await make({validUntil:'2026-09-01T00:00:00.000Z'}),current=await make({validFrom:'2026-09-02T00:00:00.000Z'});
 ok(await f.owner.cmd('PATCH',`/directory/talents/${id}`,{schemaVersion:D,expectedRevision:rev(),sourceId,sourceRevision:1,bases:{location:{recordId:current,expectedRevision:1,sourceId,sourceRevision:1}},locationCode:cities[1]!.code}),200);
 assert.equal(f.store.rows('talentLocations').find(r=>r.id===old)!.locationCode,cities[0]!.code);assert.equal(f.store.rows('talentLocations').find(r=>r.id===current)!.locationCode,cities[1]!.code);
});
test('unsupported import worker format fails before creating records',async()=>{
 const f=await fixture(),sourceId=ok(await f.owner.cmd('POST','/sources',sourceInput()),201).resourceId;
 const batch=ok(await f.owner.cmd('POST','/imports/preview',{schemaVersion:'once-talent-import-v2',sourceId,rows:[{displayName:'合成版本错误',roles:['model']}]}),201).resourceId;
 ok(await f.owner.cmd('POST',`/imports/${batch}/commit`,{expectedRevision:1,selectedRows:[0]}),202);
 await f.store.transaction(async tx=>{const j=(await tx.find('jobs'))[0]!;await tx.replace('jobs',{...j,type:'IMPORT_PEOPLE'});});assert.equal(await f.app.imports.claim(),null);assert.equal(f.store.rows('jobs')[0]!.errorCode,'IMPORT_VERSION_UNSUPPORTED');assert.equal(f.store.rows('people').length,0);
});
test('portal receipt lookup is account-bound and returns only the authorized command result',async()=>{
 const {MemoryStore}=await import('../support/memory-store.ts'),{authFixture,loginTalent}=await import('../support/talent-auth.ts');const f=await authFixture(new MemoryStore()),a=await loginTalent(f,'receipt@example.com'),b=await loginTalent(f,'other-receipt@example.com'),key=randomUUID(),headers={'x-once-talent-account':a.accountId,'idempotency-key':key};
 const original=ok(await a.client.raw('POST','/portal/auth/revoke-other-sessions',{},headers),200);
 const found=ok(await a.client.raw('GET','/portal/commands/'+key,undefined,headers),200);assert.equal(found.operationId,original.operationId);assert.deepEqual(Object.keys(found).sort(),['operationId','resourceId','revision','state']);
 assert.equal((await b.client.raw('GET','/portal/commands/'+key,undefined,{'x-once-talent-account':b.accountId})).status,404);assert.equal((await b.client.raw('GET','/portal/commands/'+key,undefined,headers)).status,409);
});
