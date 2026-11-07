import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Store} from '../../packages/core/src/store.ts';
import {maintenanceFixture} from './talent-maintenance.ts';
import {result} from './fixtures.ts';
import {emptySupplierProfile,SUPPLIER_PROFILE_VERSION,SUPPLIER_CONSENT_VERSION} from '../../packages/core/src/supplier-profile-schema.ts';

export async function supplierFixture(store:Store){
 const f=await maintenanceFixture(store);
 const headers=(who=f.a,key=randomUUID())=>({'x-once-talent-account':who.accountId,'idempotency-key':key});
 const ok=(response:Awaited<ReturnType<typeof f.a.client.raw>>,status=200)=>{assert.equal(response.status,status,JSON.stringify(response.body));return result(response);};
 const inv=ok(await f.owner.cmd('POST','/talent-invitations',{purpose:'ENROLL',scopeId:f.scopeId,maxUses:10,exposureFields:[]}));
 const issued=ok(await f.owner.raw('POST','/talent-invitations/'+inv.resourceId+'/issue',{expectedRevision:inv.revision}));
 const token=new URLSearchParams(new URL(issued.url).hash.slice(1)).get('t');
 const exchange=ok(await f.a.client.raw('POST','/portal/invitations/exchange',{invitationId:inv.resourceId,token},{'x-once-portal':'1'}));
 const claim=ok(await f.a.client.raw('POST','/portal/claims',{contextId:exchange.contextId,relation:'SELF',applicantKey:'SELF',adultDeclared:true},headers()));
 const profile={...emptySupplierProfile(),displayName:'林光',intro:'导演和摄影师，擅长品牌短片',roleCodes:['director','photographer'],contacts:[{kind:'EMAIL' as const,value:'lin.synthetic@example.com'}]};
 const input={schemaVersion:SUPPLIER_PROFILE_VERSION,consentTextVersion:SUPPLIER_CONSENT_VERSION,consentAccepted:true,claimId:claim.resourceId,profile};
 const create=async()=>ok(await f.a.client.raw('POST','/portal/profile-drafts',input,headers()));
 const read=async(id:string)=>ok(await f.a.client.raw('GET','/portal/profile-drafts/'+id,undefined,headers()));
 return {...f,headers,ok,profile,input,create,read};
}

export async function verifySupplierProfiles(store:Store){
 const f=await supplierFixture(store),{ok,headers}=f;
 const schema=ok(await f.a.client.raw('GET','/portal/profile-schema',undefined,headers()));
 assert.equal(schema.confirmation,'SELF_CONFIRMED_DIRECTLY');
 const draft=await f.create(),id=draft.resourceId;
 assert.equal((await f.b.client.raw('GET','/portal/profile-drafts/'+id,undefined,headers(f.b))).status,404);
 assert.deepEqual((await f.read(id)).profile,f.profile);
 // New structured drafts cannot fall through the historical text-only review flow.
 assert.equal((await f.a.client.raw('PATCH','/portal/submissions/'+id,{expectedRevision:draft.revision,items:[]},headers())).status,409);
 assert.equal((await f.a.client.raw('POST','/portal/submissions/'+id+'/submit',{expectedRevision:draft.revision},headers())).status,409);
 const key=randomUUID(),body={expectedRevision:draft.revision,accepted:true};
 ok(await f.a.client.raw('POST','/portal/profile-drafts/'+id+'/confirm',body,headers(f.a,key)));
 const confirmed=await f.read(id);assert.equal(confirmed.state,'APPROVED');assert.equal(confirmed.confirmationKind,'SELF');
 const personId=confirmed.personId;
 const own=ok(await f.a.client.raw('GET','/portal/supplier-profiles/'+personId,undefined,headers()));
 assert.deepEqual(own.profile,f.profile);
 const saved=await store.transaction(async tx=>({
  person:await tx.get('people',personId),sources:await tx.find('sources',{confirmedByTalentId:f.a.accountId}),
  histories:await tx.find('sourceHistory',{talentAccountId:f.a.accountId}),
  roles:await tx.find('personRoles',{personId}),contacts:await tx.find('contacts',{personId}),
  receipts:await tx.find('receipts'),items:await tx.find('talentSubmissionItems',{submissionId:id}),
 }));
 assert.ok(saved.person);assert.equal(saved.sources.length,1);assert.equal(saved.sources[0]!.reviewedBy,null);
 assert.equal(saved.histories.length,1);assert.equal(saved.histories[0]!.actorId,null);
 assert.deepEqual(saved.roles.map(r=>r.roleCode).sort(),['director','photographer']);
 assert.equal(saved.contacts.length,1);
 for(const table of [saved.receipts,saved.items,saved.contacts])assert.ok(!JSON.stringify(table).includes(f.profile.contacts[0]!.value));
 const replay=ok(await f.a.client.raw('POST','/portal/profile-drafts/'+id+'/confirm',body,headers(f.a,key)));assert.equal(replay.replayed,true);
 assert.equal((await store.transaction(tx=>tx.find('sources',{confirmedByTalentId:f.a.accountId}))).length,1);
 const found=ok(await f.owner.raw('POST','/directory/talents/search',{q:'林光'}));
 assert.ok(found.items.some((p:{id:string})=>p.id===personId),'self-confirmed profile must be usable by ONCE');
 assert.equal((await f.b.client.raw('GET','/portal/supplier-profiles/'+personId,undefined,headers(f.b))).status,404);
 return {f,id,personId,own};
}
