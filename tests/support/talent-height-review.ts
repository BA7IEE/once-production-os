import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Application} from '../../packages/core/src/api.ts';
import type {Store} from '../../packages/core/src/store.ts';
import {TALENT_SCHEMA_VERSION as schemaVersion} from '../../packages/core/src/talent-v2-model.ts';
import {Client,FakeClock,sourceInput} from './fixtures.ts';
import {FaultStore} from './fault-store.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
export async function verifyHeightReview(f:{app:Application;store:Store;clock:FakeClock;owner:Client},failureStatus:500|503=500){
 const sourceId=ok(await f.owner.cmd('POST','/sources',sourceInput())).resourceId as string;
 const personId=ok(await f.owner.cmd('POST','/people',{sourceId,displayName:'合成旧身高待确认',roles:['model'],heightCm:178})).resourceId as string;
 const person=async()=>(await f.store.transaction(tx=>tx.get('people',personId)))!;
 const reviews=()=>f.store.transaction(tx=>tx.find('talentMigrationReviews',{personId,reason:'HEIGHT_SEMANTICS_REQUIRED'}));
 ok(await f.owner.cmd('POST',`/td2/people/${personId}/enroll`,{schemaVersion,expectedRevision:1,sourceRevision:1}),200);assert.equal((await reviews())[0]?.state,'PENDING');
 const add=async(slug:string,values:Record<string,unknown>)=>ok(await f.owner.cmd('POST',`/td2/people/${personId}/${slug}`,{schemaVersion,expectedPersonRevision:(await person()).revision,sourceId,sourceRevision:1,values})).resourceId as string;
 await add('casting',{});const shoe=await add('measurements',{measuredOn:'2026-09-22',datePrecision:'EXACT_DAY',shoeSizeValue:'38',shoeSizeSystem:'EU'});
 ok(await f.owner.cmd('POST',`/td2/measurements/${shoe}/confirm`,{schemaVersion,expectedRevision:1,expectedPersonRevision:(await person()).revision,sourceRevision:1}),200);
 assert.equal((await reviews())[0]?.state,'PENDING','a confirmed shoe size cannot resolve an ambiguous legacy height');assert.equal(ok(await f.owner.raw('GET',`/people/${personId}`),200).heightCm,null);
 const height=await add('measurements',{measuredOn:'2026-09-23',datePrecision:'EXACT_DAY',heightCm:176,supersedesId:shoe});
 const fault=new FaultStore(f.store),client=new Client(new Application(fault,f.app.config,f.clock));client.jar={...f.owner.jar};client.csrf=f.owner.csrf;
 let auditFaultFired=false;fault.afterInsert=table=>{if(table==='audits'){auditFaultFired=true;throw new Error('synthetic height review audit failure');}};
 const key=randomUUID(),input={schemaVersion,expectedRevision:1,expectedPersonRevision:(await person()).revision,sourceRevision:1};const failed=await client.cmd('POST',`/td2/measurements/${height}/confirm`,input,key);assert.equal(failed.status,failureStatus);assert.equal(auditFaultFired,true);if(failureStatus===503)assert.equal((failed.body as any).error.code,'STORE_UNAVAILABLE');
 assert.equal((await reviews())[0]?.state,'PENDING');assert.equal((await f.store.transaction(tx=>tx.get('measurementSets',height)))?.status,'DRAFT');assert.equal((await f.store.transaction(tx=>tx.get('measurementSets',shoe)))?.status,'CONFIRMED');
 fault.afterInsert=null;ok(await client.cmd('POST',`/td2/measurements/${height}/confirm`,input,key),200);const reviewed=(await reviews())[0]!;assert.equal(reviewed.state,'RESOLVED');assert.ok(reviewed.resolvedAt);assert.ok(reviewed.resolvedById);assert.equal(ok(await f.owner.raw('GET',`/people/${personId}`),200).heightCm,176);assert.equal((await person()).heightCm,178,'frozen legacy evidence stays untouched');assert.equal(ok(await client.cmd('POST',`/td2/measurements/${height}/confirm`,input,key),200).replayed,true);
}
