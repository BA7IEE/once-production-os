import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {homepageFixture,verifyHomepageErasure} from '../support/professional-homepages.ts';
import {MemoryStore} from '../support/memory-store.ts';
import {quarantineHomepages} from '../../packages/core/src/professional-homepage-lifecycle.ts';
import {inspectTalentIntegrity} from '../../packages/core/src/talent-v2-integrity.ts';
import {SUPPLIER_PROFILE_VERSION,SUPPLIER_CONSENT_VERSION} from '../../packages/core/src/supplier-profile-contract.ts';
import {homepageHtml} from '../../apps/api/src/professional-homepage-http.ts';

test('homepage: self publishes a whitelisted immutable version, stable URL/QR, draft isolation and explicit unpublish',async()=>{
 const f=await homepageFixture(new MemoryStore()),before=await f.get();assert.equal(before.state,'DRAFT');
 const p=await f.publish(),view=f.ok(await f.publicRead());assert.equal(view.displayName,f.profile.displayName);assert.equal(view.works[0].responsibility,'导演 · 导演，负责整体创意和现场执导');assert.equal(view.contacts[0].value,f.profile.contacts[0]!.value);
 const html=homepageHtml('<html><head><title>Internal</title></head></html>',{...view,displayName:'<img src=x onerror=alert(1)>',intro:'"/><script>alert(1)</script>'},'https://portfolio.test.invalid/p/'+before.slug);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('Internal'));
 const raw=JSON.stringify(view);for(const forbidden of ['previewDigest','personId','sourceId','scopeId','talentAccountId','fileName','creditId','internalSummary','ciphertext','authorizationEpoch','maintainerId'])assert.equal(raw.includes(forbidden),false,forbidden);
 const publicMedia=await f.app.homepagePublic.media({method:'GET',url:view.cover.url,headers:{},ip:'192.0.2.1'},before.slug,view.cover.key);assert.equal(publicMedia.asset.id,f.asset);
 assert.ok(!view.cover.url.includes(f.asset),'public media addresses have opaque keys, not internal asset IDs');
 const qr=f.ok(await f.a.client.raw('GET','/portal/homepages/'+f.id+'/qr',undefined,f.headers()));assert.equal(qr.url,before.url);assert.match(qr.svg,/<svg/);assert.ok(!qr.svg.includes(f.profile.contacts[0]!.value));
 const saved=f.ok(await f.a.client.raw('PATCH','/portal/homepages/'+f.id,{expectedRevision:p.result.revision,draft:{...f.input,includeIntro:false,contactIds:[]}},f.headers()));
 assert.deepEqual(f.ok(await f.publicRead()),view,'draft edits leave the public version unchanged');await f.publish();const second=f.ok(await f.publicRead());assert.equal(second.intro,'');assert.deepEqual(second.contacts,[]);assert.equal((await f.get()).url,before.url);assert.equal(f.ok(await f.a.client.raw('GET','/portal/homepages/'+f.id+'/qr',undefined,f.headers())).svg,qr.svg);
 assert.equal((await f.a.client.raw('POST','/portal/homepages/'+f.id+'/unpublish',{expectedRevision:saved.revision},f.headers())).status,409,'stale write cannot remove a later publication');
 const current=await f.get();f.ok(await f.a.client.raw('POST','/portal/homepages/'+f.id+'/unpublish',{expectedRevision:current.revision},f.headers()));assert.equal((await f.publicRead()).status,404);await assert.rejects(f.app.homepagePublic.media({method:'GET',url:view.cover.url,headers:{},ip:'192.0.2.1'},before.slug,view.cover.key));
 const integrity=await f.store.transaction(tx=>inspectTalentIntegrity(tx,f.workspaceId,f.app.config.contactKey,f.clock));assert.equal(integrity.relationFailures,0);assert.equal(integrity.professionalFactFailures,0);
});

test('homepage: current own account, workspace, SELF grant, exact role, public consent, input whitelist and original receipt',async()=>{
 const f=await homepageFixture(new MemoryStore()),p=await f.publish(),before=await f.get();
 const replay=f.ok(await f.a.client.raw('POST','/portal/homepages/'+f.id+'/publish',p.body,f.headers(f.a,p.key)));assert.equal(replay.replayed,true);assert.equal((await f.store.transaction(tx=>tx.find('homepageVersions'))).length,1);
 const inspected=f.ok(await f.a.client.raw('GET','/portal/commands/'+p.key,undefined,f.headers()));assert.equal(inspected.resourceId,f.id);
 assert.equal((await f.b.client.raw('GET','/portal/homepages/'+f.id,undefined,f.headers(f.b))).status,404);assert.equal((await f.b.client.raw('GET','/portal/commands/'+p.key,undefined,f.headers(f.b))).status,404);
 assert.equal((await f.a.client.raw('POST','/portal/homepages/'+f.id+'/publish',{...p.body,expectedRevision:before.revision,internalPrice:10},f.headers())).status,400);
 assert.equal((await f.a.client.raw('POST','/portal/homepages/'+f.id+'/publish',{...p.body,expectedRevision:before.revision,publicAccepted:false},f.headers())).status,422);
 assert.equal((await f.a.client.raw('PATCH','/portal/homepages/'+f.id,{expectedRevision:before.revision,draft:{...f.input,works:[{...f.input.works[0]!,creditId:randomUUID()}]}},f.headers())).status,409);
 assert.equal((await f.a.client.raw('PATCH','/portal/homepages/'+f.id,{expectedRevision:before.revision,draft:{...f.input,works:[{...f.input.works[0]!,externalUrl:'javascript:alert(1)'}]}},f.headers())).status,422);
 const consent=(await f.store.transaction(tx=>tx.find('talentConsents',{purpose:'PUBLIC_PROFILE'})))[0]!;assert.equal(consent.talentAccountId,f.a.accountId);f.ok(await f.a.client.raw('POST','/portal/consents/'+consent.id+'/revoke',{expectedRevision:consent.revision},f.headers()));assert.equal((await f.publicRead()).status,404);
 const root=(await f.store.transaction(tx=>tx.get('professionalHomepages',f.id)))!;assert.ok(!JSON.stringify(root).includes(f.profile.contacts[0]!.value));
 const grant=(await f.store.transaction(tx=>tx.get('talentAccessGrants',root.grantId)))!;await f.store.transaction(tx=>tx.replace('talentAccessGrants',{...grant,relation:'AGENT'}));assert.equal((await f.a.client.raw('GET','/portal/homepages/'+f.id,undefined,f.headers())).status,404);assert.equal((await f.a.client.raw('GET','/portal/commands/'+p.key,undefined,f.headers())).status,404);
});

test('homepage: source withdrawal, asset quarantine, exact credit removal, expired public consent and recovery stop reads',async()=>{
 const f=await homepageFixture(new MemoryStore());await f.publish();const h=await f.get(),v=(await f.store.transaction(tx=>tx.find('homepageVersions')))[0]!,source=(await f.store.transaction(tx=>tx.get('sources',v.dependencies.sources[0]!.id)))!;
 await f.store.transaction(tx=>tx.replace('sources',{...source,status:'SUSPENDED'}));assert.equal((await f.publicRead()).status,404);await f.store.transaction(tx=>tx.replace('sources',source));
 const asset=(await f.store.transaction(tx=>tx.get('assets',f.asset)))!;await f.store.transaction(tx=>tx.replace('assets',{...asset,state:'QUARANTINED'}));assert.equal((await f.publicRead()).status,404);await f.store.transaction(tx=>tx.replace('assets',asset));
 const c=(await f.store.transaction(tx=>tx.get('workCredits',f.input.works[0]!.creditId)))!;await f.store.transaction(tx=>tx.replace('workCredits',{...c,personRoleId:randomUUID()}));assert.equal((await f.publicRead()).status,404);await f.store.transaction(tx=>tx.replace('workCredits',c));
 const own=(await f.store.transaction(tx=>tx.get('talentAccounts',f.a.accountId)))!;await f.store.transaction(tx=>tx.replace('talentAccounts',{...own,status:'DISABLED'}));assert.equal((await f.publicRead()).status,404);await f.store.transaction(tx=>tx.replace('talentAccounts',own));
 await f.store.transaction(tx=>tx.replace('talentAccounts',{...own,sessionEpoch:own.sessionEpoch+1}));assert.equal((await f.publicRead()).status,404,'public read does not reveal private account/session state');await f.store.transaction(tx=>tx.replace('talentAccounts',own));
 assert.equal((await f.publicRead()).status,200);await f.store.transaction(tx=>quarantineHomepages(tx,f.workspaceId,f.clock));assert.equal((await f.publicRead()).status,404);assert.equal((await f.get()).url,h.url);
 await f.publish();f.clock.advance(181*86400000);assert.equal((await f.publicRead()).status,404);
});

test('homepage: reviewed erasure clears draft and every encrypted publication; immutable ownership is an explicit merge boundary',async()=>{const f=await homepageFixture(new MemoryStore());await f.publish();await verifyHomepageErasure(f);const people=await f.store.transaction(tx=>tx.find('people')),other=people.find(p=>p.id!==f.personId)!,person=people.find(p=>p.id===f.personId)!;const preview=f.ok(await f.owner.raw('POST','/people/merge-preview',{canonicalId:person.id,duplicateId:other.id,expectedCanonicalRevision:person.revision,expectedDuplicateRevision:other.revision}));assert.ok(preview.blockers.some((b:any)=>b.code==='PROFESSIONAL_HOMEPAGE_MERGE_REVIEW_REQUIRED'));});

test('homepage: ordinary confirmed text changes wait for republication; separate signals and owner export never become leads',async()=>{
 const f=await homepageFixture(new MemoryStore());await f.publish();const original=f.ok(await f.publicRead());
 const draft=f.ok(await f.a.client.raw('POST','/portal/profile-drafts',{schemaVersion:SUPPLIER_PROFILE_VERSION,consentTextVersion:SUPPLIER_CONSENT_VERSION,consentAccepted:true,grantId:f.own.grantId,profile:{...f.profile,displayName:'本人新确认展示名',intro:'本人新确认介绍'}},f.headers()));
 f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+draft.resourceId+'/confirm',{expectedRevision:draft.revision,accepted:true},f.headers()));
 assert.deepEqual(f.ok(await f.publicRead()),original,'ordinary source text edits do not silently update or withdraw the explicit public snapshot');assert.equal((await f.get()).needsReview,true,'replaced contact references require explicit reselection');
 const current=f.ok(await f.a.client.raw('GET','/portal/homepage-options/'+f.personId,undefined,f.headers()));f.ok(await f.a.client.raw('PATCH','/portal/homepages/'+f.id,{expectedRevision:(await f.get()).revision,draft:{...f.input,contactIds:current.contacts.map((c:any)=>c.id)}},f.headers()));
 const exported=f.ok(await f.a.client.raw('GET','/portal/homepages/'+f.id+'/export',undefined,f.headers()));assert.equal(exported.selection.displayName,'本人新确认展示名');assert.equal(exported.selection.works[0].title,'匿名导演代表作');for(const key of ['talentAccountId','personId','sourceId','fileName','ciphertext','/portal/accounts/'])assert.equal(JSON.stringify(exported).includes(key),false,key);
 const key=randomUUID();f.ok(await f.a.client.raw('POST','/portal/homepages/'+f.id+'/copy-link',{},f.headers(f.a,key)));f.ok(await f.a.client.raw('POST','/portal/homepages/'+f.id+'/copy-link',{},f.headers(f.a,key)));f.ok(await f.a.client.raw('POST','/portal/homepages/'+f.id+'/qr-download',{},f.headers()));
 const stats=f.ok(await f.a.client.raw('GET','/portal/homepages/'+f.id+'/activity',undefined,f.headers()));assert.equal(stats.linkCopies,1);assert.equal(stats.qrDownloadClicks,1);assert.equal(stats.pageReads,2);assert.equal(stats.inquiries,'NOT_COLLECTED');
 const events=await f.store.transaction(tx=>tx.find('audits',{action:'homepage.public.read'}));assert.ok(events.every(e=>e.principalKind==='SYSTEM'&&!e.actorId&&!e.talentAccountId));assert.equal((await f.b.client.raw('GET','/portal/homepages/'+f.id+'/export',undefined,f.headers(f.b))).status,404);
});

test('homepage: model parameters are individually selected and known minor records cannot publish',async()=>{
 const f=await homepageFixture(new MemoryStore(),'model');await f.publish();const view=f.ok(await f.publicRead());assert.equal(view.role,'模特');assert.deepEqual(view.measurements.map((r:any)=>r.value),['178','85','65','90']);
 const p=(await f.store.transaction(tx=>tx.find('talentProfiles',{personId:f.personId})))[0]!;await f.store.transaction(tx=>tx.replace('talentProfiles',{...p,birthPrecision:'DECLARED_RANGE',minAgeYears:16,maxAgeYears:17,ageAsOfDate:f.clock.now().toISOString().slice(0,10)}));
 assert.equal((await f.publicRead()).status,404);assert.equal((await f.a.client.raw('GET','/portal/homepage-options/'+f.personId,undefined,f.headers())).status,409);
});

test('homepage: renewed explicit SELF grant can republish at the original address while old versions stay revoked',async()=>{
 const f=await homepageFixture(new MemoryStore());await f.publish();const before=await f.get(),old=(await f.store.transaction(tx=>tx.get('talentAccessGrants',f.own.grantId)))!,next={...old,id:randomUUID(),revision:1};
 await f.store.transaction(async tx=>{await tx.replace('talentAccessGrants',{...old,state:'REVOKED',authorizationEpoch:old.authorizationEpoch+1});await tx.insert('talentAccessGrants',next);});assert.equal((await f.publicRead()).status,404);
 const asset=(await f.store.transaction(tx=>tx.get('assets',f.asset)))!,credit=(await f.store.transaction(tx=>tx.get('workCredits',f.input.works[0]!.creditId)))!;
 f.ok(await f.owner.cmd('POST','/talent-grants/'+next.id+'/exposure',{expectedRevision:1,decision:'ALLOW',fields:[],assets:[{id:asset.id,expectedRevision:asset.revision}],collections:[],credits:[{id:credit.id,expectedRevision:credit.revision}],approvalBasis:'合成验收：重新核对本人资料和精确案例展示依据'}));
 const readable=await f.get();assert.equal(readable.url,before.url);await f.publish();assert.equal((await f.publicRead()).status,200);assert.equal((await f.get()).url,before.url);
 const versions=await f.store.transaction(tx=>tx.find('homepageVersions',{homepageId:f.id}));assert.equal(versions.filter(v=>v.state==='PUBLISHED').length,1);assert.equal(versions.find(v=>v.state==='PUBLISHED')!.dependencies.grantId,next.id);
});

test('homepage: after reviewed erasure a fresh selection gets a new address and cannot revive the erased page',async()=>{
 const f=await homepageFixture(new MemoryStore(),'director',true);await f.publish();const before=await f.get();await verifyHomepageErasure(f);
 const draft={...f.input,coverAssetId:null,works:[{creditId:f.options.works[1].credit.id,assetIds:[],externalUrl:'https://example.com/remaining-confirmed-case'}]},created=f.ok(await f.a.client.raw('POST','/portal/homepages',{personId:f.personId,draft},f.headers()));
 const current=f.ok(await f.a.client.raw('GET','/portal/homepages/'+created.resourceId,undefined,f.headers()));assert.notEqual(current.slug,before.slug);assert.equal((await f.publicRead()).status,404);assert.equal((await f.a.client.raw('POST','/portal/homepages',{personId:f.personId,draft},f.headers())).status,409);
 f.ok(await f.a.client.raw('POST','/portal/homepages/'+current.id+'/publish',{expectedRevision:current.revision,previewDigest:f.ok(await f.a.client.raw('GET','/portal/homepages/'+current.id+'/preview',undefined,f.headers())).previewDigest,expiresAt:new Date(f.clock.now().getTime()+86400000).toISOString(),consentVersion:'once-public-homepage-v1',publicAccepted:true,mediaRightsAccepted:true,adultDeclared:true},f.headers()));assert.equal((await f.a.client.raw('GET','/public/homepages/'+current.slug)).status,200);assert.equal((await f.publicRead()).status,404);
});

test('homepage: a changed source label between preview and publish requires a fresh preview and creates no version',async()=>{
 const f=await homepageFixture(new MemoryStore()),body=await f.publishBody();
 const role=(await f.store.transaction(tx=>tx.find('dictionary',{namespace:'role',code:'director'})))[0]!;await f.store.transaction(tx=>tx.replace('dictionary',{...role,labelZh:'导演（名称更新）',revision:role.revision+1}));
 const denied=await f.a.client.raw('POST','/portal/homepages/'+f.id+'/publish',body,f.headers());assert.equal(denied.status,409);assert.equal((denied.body as any).error.code,'HOMEPAGE_PREVIEW_STALE');assert.equal((await f.store.transaction(tx=>tx.find('homepageVersions'))).length,0);assert.equal((await f.publicRead()).status,404);
 await f.publish();assert.equal(f.ok(await f.publicRead()).role,'导演（名称更新）');
});
