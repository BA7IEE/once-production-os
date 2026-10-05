import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,sourceInput,result} from '../support/fixtures.ts';
import {aiBusinessFixture} from '../support/ai-business.ts';
import {expectResponse as ok} from '../support/talent-v2-maintenance.ts';
test('maintenance lists reach records beyond 100 and export rechecks every selected permission',async()=>{
 const f=await fixture(),member=f.store.rows('memberships')[0]!;
 await f.store.transaction(tx=>tx.replace('memberships',{...member,extraPermissions:[...member.extraPermissions,'data.export']}));
 const source=ok(await f.owner.cmd('POST','/sources',sourceInput())).resourceId,people:string[]=[],permits:string[]=[];
 for(let i=0;i<105;i++){
  f.clock.advance(1);
  const person=ok(await f.owner.cmd('POST','/directory/talents',{schemaVersion:'once-talent-experience-v1',displayName:'维护分页 '+String(i).padStart(3,'0'),kind:'TALENT',roleCodes:['model'],sourceId:source,sourceRevision:1})).resourceId;people.push(person);
  permits.push(ok(await f.owner.cmd('POST','/use-permissions',{sourceId:source,subjectKind:'PERSON',subjectId:person,fields:['person.displayName'],validUntil:'2026-11-30T00:00:00.000Z',evidenceNote:'Synthetic pagination permission'})).resourceId);
 }
 const first=ok(await f.owner.raw('GET','/people?page=1&pageSize=20'),200),last=ok(await f.owner.raw('GET','/people?page=6&pageSize=20'),200);
 assert.equal(first.total,105);assert.equal(first.items[0].id,people[104]);assert.equal(last.items.length,5);assert.equal(last.items.at(-1).id,people[0]);
 assert.equal(ok(await f.owner.raw('GET','/people?q='+encodeURIComponent('维护分页 000')+'&page=1&pageSize=20'),200).items[0].id,people[0]);
 const permissionFirst=ok(await f.owner.raw('GET','/use-permissions?page=1&pageSize=20'),200),permissionLast=ok(await f.owner.raw('GET','/use-permissions?page=6&pageSize=20'),200),chosen=[permissionFirst.items[0],permissionLast.items.at(-1)];
 assert.equal(permissionFirst.total,105);assert.equal(permissionLast.items.length,5);
 const input={format:'JSON',selectedIds:{people:chosen.map(p=>p.subjectId),works:[],projects:[]},fields:['person.displayName'],usePermissionRefs:chosen.map(p=>p.id)};
 const receipt=ok(await f.owner.cmd('POST','/exports',input),202),job=f.store.rows('exports').find(row=>row.id===receipt.resourceId)!;
 assert.deepEqual(new Set(job.usePermissionRefs),new Set(input.usePermissionRefs));
 ok(await f.owner.cmd('POST',`/use-permissions/${chosen[1].id}/revoke`,{expectedRevision:1}),200);
 const before=f.store.rows('exports').length,denied=await f.owner.cmd('POST','/exports',input);assert.equal(denied.status,409);assert.equal(result(denied).error.code,'EXPORT_PERMISSION_INACTIVE');assert.equal(f.store.rows('exports').length,before,'one invalid off-page selection must reject the complete export');
});
test('AI grant paging has deterministic ordering and keeps the older grant reachable',async()=>{
 const f=await fixture(),t=await aiBusinessFixture(f);
 for(let i=0;i<104;i++)ok(await f.owner.cmd('POST','/ai-grants',{sourceId:t.source,expectedRevision:1,validUntil:'2026-12-01T00:00:00.000Z',evidenceNote:'Synthetic pagination grant',confirmTextOnly:true}),201);
 const read=async(page:number)=>ok(await f.owner.raw('GET',`/ai-grants?page=${page}&pageSize=20`),200);
 const first=await read(1),again=await read(1),last=await read(6);assert.equal(first.total,105);assert.deepEqual(first.items,again.items);assert.equal(last.items.at(-1).id,t.grant);assert.equal(last.items.length,5);
});
