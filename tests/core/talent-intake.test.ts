import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, member, result, sourceInput } from '../support/fixtures.ts';
const path = '/directory/talents';
const input = {schemaVersion:'once-talent-experience-v1',displayName:'合成模特',kind:'TALENT'};

test('TE intake: name-only creates one typed model and a real restricted temporary source', async () => {
 const f=await fixture(),r=await f.owner.cmd('POST',path,input);assert.equal(r.status,201,JSON.stringify(r.body));
 const p=f.store.rows('people')[0]!,s=f.store.rows('sources')[0]!;
 assert.equal(result(r).resourceId,p.id);assert.equal(result(r).revision,p.revision);
 assert.equal(f.store.rows('talentProfiles').length,1);assert.equal(f.store.rows('personRoles')[0]!.roleCode,'model');
 assert.equal(s.maintainerId,f.membershipId);assert.equal(s.reviewedBy,null);assert.equal(s.status,'RECEIVED');assert.equal(s.basisMode,'TEMP_ORGANIZE');
 assert.equal(Date.parse(s.validUntil)-f.clock.now().getTime(),7*24*60*60*1000);
 assert.equal(f.store.rows('scopeMembers').filter(r=>r.scopeId===s.scopeId).length,1);
 assert.equal(f.store.rows('sourceHistory')[0]!.actorId,f.membershipId);
 assert.equal((await f.owner.raw('GET',`/td2/people/${p.id}`)).status,200);
 const other=await member(f,'other');assert.equal((await other.client.raw('GET',`/td2/people/${p.id}`)).status,404);
 const list=await other.client.raw('GET','/people');assert.equal(result(list).total,0);
});
test('TE intake: multiple roles share one person; contact enrollment preserves its identity',async()=>{
 const f=await fixture();assert.equal((await f.owner.cmd('POST',path,{...input,roleCodes:['model','actor','kol']})).status,201);
 assert.equal(f.store.rows('people').length,1);assert.equal(f.store.rows('personRoles').length,3);
 const r=await f.owner.cmd('POST',path,{...input,kind:'CONTACT',displayName:'合成联系人'}),id=result(r).resourceId;
 assert.equal(r.status,201);assert.equal(f.store.rows('talentProfiles').length,1);
 assert.equal((await f.owner.cmd('POST',`/td2/people/${id}/enroll`,{schemaVersion:'once-talent-v2.0.0',expectedRevision:1,sourceRevision:1})).status,200);
 assert.equal(f.store.rows('people').length,2);assert.equal(f.store.rows('talentProfiles').find(p=>p.personId===id)?.personId,id);
});
test('TE intake: original key replay creates no duplicate; changed body conflicts; expired source blocks replay',async()=>{
 const f=await fixture(),key=randomUUID(),r=await f.owner.cmd('POST',path,input,key);assert.equal(r.status,201);
 const again=await f.owner.cmd('POST',path,input,key);assert.equal(again.status,201);assert.equal(result(again).replayed,true);assert.equal(result(again).resourceId,result(r).resourceId);
 assert.equal((await f.owner.cmd('POST',path,{...input,displayName:'不同内容'},key)).status,409);assert.equal(f.store.rows('people').length,1);assert.equal(f.store.rows('sources').length,1);
 f.clock.advance(7*24*60*60*1000);await f.owner.login();assert.equal((await f.owner.cmd('POST',path,input,key)).status,404);
});
test('TE intake: existing source CAS and role validation produce no orphan records',async()=>{
 const f=await fixture(),src=await f.owner.cmd('POST','/sources',sourceInput()),sourceId=result(src).resourceId;
 for(const payload of [{roleCodes:['made-up']},{roleCodes:['model','model']},{roleCodes:[]},{kind:'CONTACT',roleCodes:['model']},{sourceId},{sourceId,sourceRevision:2},{displayName:'   '},{verifiedAt:'2026-01-01'}]){
  assert.ok((await f.owner.cmd('POST',path,{...input,...payload})).status>=400);assert.equal(f.store.rows('people').length,0);assert.equal(f.store.rows('sources').length,1);
 }
 assert.equal((await f.owner.cmd('POST',path,{...input,sourceId,sourceRevision:1})).status,201);assert.equal(f.store.rows('sources').length,1);
});
test('TE intake: audit failure rolls back scope/source/person/profile/roles/receipt; same key can retry',async()=>{
 const f=await fixture(),counts=['people','sources','sourceHistory','scopes','scopeMembers','talentProfiles','personRoles','evidence','receipts'] as const;
 const before=counts.map(table=>f.store.rows(table).length),key=randomUUID();f.store.failNextAudit=true;
 assert.equal((await f.owner.cmd('POST',path,input,key)).status,500);assert.deepEqual(counts.map(table=>f.store.rows(table).length),before);
 assert.equal((await f.owner.cmd('POST',path,input,key)).status,201);assert.equal(f.store.rows('people').length,1);
});
test('TE intake: viewer cannot create and suspended source cannot be borrowed',async()=>{
 const f=await fixture(),viewer=await member(f,'view','VIEWER');assert.equal((await viewer.client.cmd('POST',path,input)).status,403);
 const src=await f.owner.cmd('POST','/sources',sourceInput()),sourceId=result(src).resourceId;
 assert.equal((await f.owner.cmd('POST',`/sources/${sourceId}/suspend`,{expectedRevision:1,reason:'合成暂停'})).status,200);
 assert.ok((await f.owner.cmd('POST',path,{...input,sourceId,sourceRevision:2})).status>=400);assert.equal(f.store.rows('people').length,0);
});
