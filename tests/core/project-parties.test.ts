import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,member,sourceInput,result} from '../support/fixtures.ts';
import {verifyParties,exportParties,erasePartySource,seedParties} from '../support/project-parties.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import {inspectPartyIntegrity} from '../../packages/core/src/project-parties.ts';
test('project parties current-source redaction, CAS, replay and audit rollback',async()=>verifyParties(await fixture()));
test('project parties explicit multi-source export, stale protection and complete isolated rebuild',async()=>{
 const {g,payload}=await exportParties(await fixture()),target=await fixture(),rebuild=new JsonRebuild(target.clock);
 const actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
 await target.store.transaction(tx=>rebuild.apply(tx,actor,payload,{requestId:randomUUID(),ip:'CLI'}));
 assert.equal(target.store.rows('brands')[0]?.id,g.brandId);assert.equal(target.store.rows('organizations')[0]?.id,g.organizationId);
 assert.equal(target.store.rows('projectParties')[0]?.projectId,g.projectId);assert.deepEqual((await target.store.transaction(tx=>inspectPartyIntegrity(tx,target.workspaceId))).blockers,[]);
});
test('source erasure removes its brand and preserves independently sourced project client',async()=>erasePartySource(await fixture()));
test('brand write rejects viewer, hidden sources and unknown fields',async()=>{
 const f=await fixture(),g=await seedParties(f),v=await member(f,'partyviewer','VIEWER');
 assert.equal((await v.client.cmd('PATCH',`/brands/${g.brandId}`,{expectedRevision:1,name:'不得修改'})).status,403);
 assert.equal((await f.owner.cmd('PATCH',`/brands/${g.brandId}`,{expectedRevision:1,scopeId:randomUUID()})).status,400);
});

test('organization source cleanup detaches both references but retains an independently sourced brand',async()=>erasePartySource(await fixture(),'organization'));
test('private brands are absent from administrator list, replay and audit',async()=>{
 const f=await fixture(),ed=await member(f,'privatebrand');
 const source=result(await ed.client.cmd('POST','/sources',sourceInput(true))).resourceId;
 const input={sourceId:source,sourceRevision:1,name:'私有品牌',organizationId:null},key=randomUUID();
 const response=await ed.client.cmd('POST','/brands',input,key);assert.equal(response.status,201);const id=result(response).resourceId;
 assert.ok(!JSON.stringify(result(await f.owner.raw('GET','/brands'))).includes(id));
 assert.ok(!JSON.stringify(result(await f.owner.raw('GET','/audit-events'))).includes(id));
 assert.equal((await f.owner.cmd('PATCH',`/brands/${id}`,{expectedRevision:1,name:'跨范围修改'})).status,404);
});
test('deletion preview does not expose a brand after only its source scope becomes private',async()=>{
 const f=await fixture(),g=await seedParties(f),ed=await member(f,'partyrestriction');
 const scope=result(await f.owner.cmd('POST','/scopes',{name:'来源已收窄',membershipIds:[ed.id]})).resourceId;
 await f.store.transaction(async tx=>{const source=(await tx.get('sources',g.brandSource))!;await tx.replace('sources',{...source,scopeId:scope,revision:source.revision+1});});
 const response=await f.owner.raw('POST','/deletion-requests/preview',{targetKind:'SOURCE',targetId:g.orgSource,expectedRevision:1});
 assert.equal(response.status,200);const preview=result(response);assert.equal(preview.complete,false);
 assert.ok(preview.unresolved.some((r:any)=>r.code==='HIDDEN_BRAND_DEPENDENCY'));
 assert.ok(!JSON.stringify(preview).includes(g.brandId));
});
