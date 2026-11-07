import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../support/memory-store.ts';
import {supplierFixture,verifySupplierProfiles} from '../support/supplier-profiles.ts';
import {exportMaintenance} from '../support/talent-maintenance.ts';
import {fixture} from '../support/fixtures.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import {emptySupplierProfile} from '../../packages/core/src/supplier-profile-schema.ts';
import {randomUUID} from 'node:crypto';

test('supplier creates a multi-role person directly, with real self provenance, encrypted draft and replay',async()=>{
 await verifySupplierProfiles(new MemoryStore());
});
test('supplier confirmation rolls back every fact if atomic command audit fails',async()=>{
 const store=new MemoryStore(),f=await supplierFixture(store),draft=await f.create();
 const count=async()=>store.transaction(async tx=>({people:(await tx.find('people')).length,sources:(await tx.find('sources')).length,roles:(await tx.find('personRoles')).length}));
 const before=await count();store.failNextAudit=true;
 const response=await f.a.client.raw('POST','/portal/profile-drafts/'+draft.resourceId+'/confirm',{expectedRevision:draft.revision,accepted:true},f.headers());
 assert.ok([500,503].includes(response.status));assert.deepEqual(await count(),before);
 assert.equal((await f.read(draft.resourceId)).state,'DRAFT');
});
test('parallel profile drafts cannot overwrite a newer confirmation, and explicit rebase can resolve it',async()=>{
 const {f,own,personId}=await verifySupplierProfiles(new MemoryStore());
 const input={...f.input,claimId:undefined,grantId:own.grantId,profile:{...own.profile,intro:'本次明确选择的介绍'}};
 const a=f.ok(await f.a.client.raw('POST','/portal/profile-drafts',input,f.headers()));
 const b=f.ok(await f.a.client.raw('POST','/portal/profile-drafts',{...input,profile:{...input.profile,intro:'另一个设备的更新'}},f.headers()));
 f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+b.resourceId+'/confirm',{expectedRevision:b.revision,accepted:true},f.headers()));
 const conflict=await f.a.client.raw('POST','/portal/profile-drafts/'+a.resourceId+'/confirm',{expectedRevision:a.revision,accepted:true},f.headers());
 assert.equal(conflict.status,409);assert.equal((conflict.body as any).error.code,'SUPPLIER_PROFILE_CONFLICT');
 const current=f.ok(await f.a.client.raw('GET','/portal/supplier-profiles/'+personId,undefined,f.headers()));
 const rebased=f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+a.resourceId+'/rebase',{expectedRevision:a.revision,expectedPersonRevision:current.revision,profile:input.profile,conflictsAcknowledged:true},f.headers()));
 f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+a.resourceId+'/confirm',{expectedRevision:rebased.revision,accepted:true},f.headers()));
 const after=f.ok(await f.a.client.raw('GET','/portal/supplier-profiles/'+personId,undefined,f.headers()));assert.equal(after.profile.intro,input.profile.intro);
});
test('ONCE correction of a shared field is visible to its self account and blocks an old draft',async()=>{
 const {f,own,personId}=await verifySupplierProfiles(new MemoryStore());
 const draft=f.ok(await f.a.client.raw('POST','/portal/profile-drafts',{...f.input,claimId:undefined,grantId:own.grantId},f.headers()));
 const proposal=f.ok(await f.owner.cmd('POST','/td2/proposals',{schemaVersion:'once-talent-v2.1.0',ownerKind:'person',ownerId:personId,fieldPath:'intro',expectedRevision:own.revision,sourceId:f.sourceId,sourceRevision:1,proposedValue:'ONCE核对后的共同资料'}),201);
 f.ok(await f.owner.cmd('POST','/td2/proposals/'+proposal.resourceId+'/decide',{schemaVersion:'once-talent-v2.1.0',expectedRevision:proposal.revision,decision:'APPLY'}));
 const after=f.ok(await f.a.client.raw('GET','/portal/supplier-profiles/'+personId,undefined,f.headers()));assert.equal(after.profile.intro,'ONCE核对后的共同资料');
 assert.equal((await f.a.client.raw('POST','/portal/profile-drafts/'+draft.resourceId+'/confirm',{expectedRevision:draft.revision,accepted:true},f.headers())).status,409);
});
test('full length profile text remains readable in an encrypted server draft',async()=>{
 const f=await supplierFixture(new MemoryStore()),draft=f.ok(await f.a.client.raw('POST','/portal/profile-drafts',{...f.input,profile:{...f.profile,intro:'专业经历。'.repeat(1000)}},f.headers()));
 assert.equal((await f.read(draft.resourceId)).profile.intro.length,5000);
});
test('self-confirmed business export preserves the real confirming principal without creating accounts on rebuild',async()=>{
 const {f}=await verifySupplierProfiles(new MemoryStore()),payload=await exportMaintenance({...f,b:f.a});
 const basis=payload.manifest.sources[0].talentBasis;assert.equal(basis.version,'talent-self-basis-v1');assert.equal(basis.confirmedByTalentId,f.a.accountId);assert.ok(!Object.hasOwn(basis,'reviewerId'));
 const target=await fixture(),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
 await target.store.transaction(tx=>rebuild.apply(tx,actor,payload,{requestId:randomUUID(),ip:'test'}));
 assert.equal(target.store.rows('talentAccounts').length,0);assert.equal(target.store.rows('talentAccessGrants').length,0);
 assert.equal(target.store.rows('sourceUseBases')[0]!.importedBasis!.confirmedByTalentId,f.a.accountId);
});
test('revoked supplier consent immediately hides shared fields and the internal directory',async()=>{
 const {f,id,personId}=await verifySupplierProfiles(new MemoryStore()),draft=await f.read(id);
 f.ok(await f.a.client.raw('POST','/portal/consents/'+draft.consent.id+'/revoke',{expectedRevision:draft.consent.revision},f.headers()));
 const own=f.ok(await f.a.client.raw('GET','/portal/supplier-profiles/'+personId,undefined,f.headers()));
 assert.equal(own.profile.displayName,'');assert.equal(own.profile.contacts.length,0);assert.equal(own.profile.roleCodes.length,0);
 const internal=f.ok(await f.owner.raw('POST','/directory/talents/search',{q:'林光'}));assert.equal(internal.total,0);
});

test('an incomplete exposure cannot silently clear or reveal unshared staff fields',async()=>{
 const {f,own,personId}=await verifySupplierProfiles(new MemoryStore());
 await f.store.transaction(async tx=>{const grant=(await tx.get('talentAccessGrants',own.grantId))!;await tx.replace('talentAccessGrants',{...grant,selfExposureManifest:grant.selfExposureManifest.filter(e=>e.kind==='person'&&e.field==='displayName')});});
 const profile={...emptySupplierProfile(),displayName:'本人更新名字',roleCodes:['photographer']};
 const draft=f.ok(await f.a.client.raw('POST','/portal/profile-drafts',{...f.input,claimId:undefined,grantId:own.grantId,profile},f.headers()));
 f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+draft.resourceId+'/confirm',{expectedRevision:draft.revision,accepted:true},f.headers()));
 assert.equal((await f.store.transaction(tx=>tx.get('people',personId)))!.intro,f.profile.intro);
 const visible=f.ok(await f.a.client.raw('GET','/portal/supplier-profiles/'+personId,undefined,f.headers()));assert.equal(visible.profile.intro,'');
 assert.equal((await f.store.transaction(tx=>tx.find('personRoles',{personId,roleCode:'director'})))[0]!.status,'ACTIVE');
});
test('a renewed self profile remains searchable when its older consent is revoked',async()=>{
 const {f,own,personId,id}=await verifySupplierProfiles(new MemoryStore()),old=await f.read(id);
 const draft=f.ok(await f.a.client.raw('POST','/portal/profile-drafts',{...f.input,claimId:undefined,grantId:own.grantId},f.headers()));
 f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+draft.resourceId+'/confirm',{expectedRevision:draft.revision,accepted:true},f.headers()));
 f.ok(await f.a.client.raw('POST','/portal/consents/'+old.consent.id+'/revoke',{expectedRevision:old.consent.revision},f.headers()));
 const internal=f.ok(await f.owner.raw('POST','/directory/talents/search',{q:'林光',role:'director'}));assert.ok(internal.items.some((p:{id:string})=>p.id===personId));
});
