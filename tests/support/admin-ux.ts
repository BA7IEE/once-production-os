import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Application} from '../../packages/core/src/api.ts';
import type {Store} from '../../packages/core/src/store.ts';
import {Client,FakeClock,result,sourceInput} from './fixtures.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
export type UxSystem={app:Application;store:Store;clock:FakeClock;owner:Client;membershipId:string;workspaceId:string};
export async function uxTalent(f:UxSystem,name:string,roles=['model'],client=f.owner,sourceId?:string){
 const source=sourceId??ok(await client.cmd('POST','/sources',sourceInput(client!==f.owner)),201).resourceId;
 const id=ok(await client.cmd('POST','/directory/talents',{schemaVersion:'once-talent-experience-v1',displayName:name,kind:'TALENT',roleCodes:roles,sourceId:source,sourceRevision:1}),201).resourceId;
 return {id,sourceId:source};
}
export async function uxChoice(f:UxSystem,ids:string[]){return ok(await f.owner.raw('POST','/shortlists/selection',{personIds:ids}),200).items;}
export async function uxList(f:UxSystem){const scope=(await f.store.transaction(tx=>tx.find('scopes',{workspaceId:f.workspaceId,mode:'WORKSPACE'})))[0]!;return ok(await f.owner.cmd('POST','/shortlists',{title:'合成选角清单',scopeId:scope.id}),201).resourceId as string;}
export const uxEntry=(p:any,role=p.roles[0])=>({personId:p.id,expectedPersonRevision:p.revision,personRoleId:role.id,personRoleRevision:role.revision});
export async function batchScenario(f:UxSystem){
 const a=await uxTalent(f,'合成多职业候选',['model','actor']),b=await uxTalent(f,'合成单职业候选'),list=await uxList(f),choices=await uxChoice(f,[a.id,b.id]);
 const key=randomUUID(),input={expectedRevision:1,entries:choices.map((p:any)=>uxEntry(p))};
 const receipt=ok(await f.owner.cmd('POST',`/shortlists/${list}/batch`,input,key),200);assert.deepEqual(receipt.summary,{added:2,existing:0});
 const replay=ok(await f.owner.cmd('POST',`/shortlists/${list}/batch`,input,key),200);assert.equal(replay.replayed,true);assert.deepEqual(replay.summary,receipt.summary);
 assert.equal((await f.store.transaction(tx=>tx.find('shortlistItems',{shortlistId:list}))).length,2);
 const before=await f.store.transaction(tx=>tx.find('receipts')),auditCount=(await f.store.transaction(tx=>tx.find('audits'))).length;
 const inspected=ok(await f.owner.raw('POST','/commands/inspect',{operation:'shortlist.batchAdd',commandKey:key}),200);assert.equal(inspected.found,true);assert.equal(inspected.result.operationId,receipt.operationId);assert.equal(JSON.stringify(inspected).includes('合成多职业候选'),false);
 assert.equal((await f.store.transaction(tx=>tx.find('receipts'))).length,before.length);assert.equal((await f.store.transaction(tx=>tx.find('audits'))).length,auditCount);
 const duplicate=ok(await f.owner.cmd('POST',`/shortlists/${list}/batch`,{expectedRevision:receipt.revision,entries:input.entries}),200);assert.deepEqual(duplicate.summary,{added:0,existing:2});assert.equal(duplicate.revision,receipt.revision);
 const otherRole=choices[0].roles.find((r:any)=>r.id!==input.entries[0].personRoleId);const separate=ok(await f.owner.cmd('POST',`/shortlists/${list}/batch`,{expectedRevision:receipt.revision,entries:[uxEntry(choices[0],otherRole)]}),200);assert.deepEqual(separate.summary,{added:1,existing:0});
 const fresh=await uxTalent(f,'合成不得部分加入'),projection=(await uxChoice(f,[fresh.id]))[0],count=(await f.store.transaction(tx=>tx.find('shortlistItems',{shortlistId:list}))).length;
 const denied=await f.owner.cmd('POST',`/shortlists/${list}/batch`,{expectedRevision:separate.revision,entries:[uxEntry(projection),{...uxEntry(choices[0]),personRoleRevision:999}]});assert.equal(denied.status,409);assert.equal((await f.store.transaction(tx=>tx.find('shortlistItems',{shortlistId:list}))).length,count);
 assert.equal((await f.owner.cmd('POST',`/shortlists/${list}/batch`,{expectedRevision:separate.revision,entries:[uxEntry(projection),uxEntry(projection)]})).status,422);
 assert.equal((await f.owner.cmd('POST',`/shortlists/${list}/batch`,{expectedRevision:1,entries:[uxEntry(projection)]})).status,409);
 ok(await f.owner.cmd('POST',`/sources/${fresh.sourceId}/suspend`,{expectedRevision:1,reason:'合成来源失效'}),200);
 const hidden=(await uxChoice(f,[fresh.id]))[0];assert.deepEqual(hidden,{id:fresh.id,unavailable:true});
 return {list,key,receipt,checks:['exact-person-role-summary-and-replay','read-inspection-no-command-audit','duplicates-preserve-revision','same-person-different-role','stale-role-atomic-rejection','stale-list-and-duplicate-input-rejection','source-loss-minimal-placeholder']};
}
export async function uxImage(f:UxSystem,personId:string,sourceId:string){
 f.app.config.mediaEnabled=true;const bytes=12,hash='a'.repeat(64),id=ok(await f.owner.cmd('POST','/uploads',{sourceId,personId,expectedSourceRevision:1,fileName:'synthetic.png',mime:'image/png',expectedBytes:bytes,sha256:hash}),201).resourceId;
 const as=<T>(fn:(tx:any,actor:any)=>Promise<T>)=>f.store.transaction(async tx=>fn(tx,await f.app.identity.authenticate(tx,f.owner.jar.once_session!)));
 const receiving=await as((tx,a)=>f.app.media.beginReceive(tx,a,id,bytes));await as((tx,a)=>f.app.media.finishReceive(tx,a,id,receiving.receiveToken!,bytes,hash));
 const upload=(await f.store.transaction(tx=>tx.get('uploads',id)))!;ok(await f.owner.cmd('POST',`/uploads/${id}/complete`,{expectedRevision:upload.revision}),202);const claim=(await f.app.media.claim())!;assert.equal(claim.id,id);await f.app.media.finish(claim,{mime:'image/png',sha256:hash,bytes,width:2,height:3,previewBytes:10,previewHash:'b'.repeat(64)});return id as string;
}
export async function caseScenario(f:UxSystem){
 const t=await uxTalent(f,'合成作品署名人才'),a=await uxImage(f,t.id,t.sourceId),p=(await uxChoice(f,[t.id]))[0];
 const input={expectedPersonRevision:p.revision,personRoleId:p.roles[0].id,expectedRoleRevision:p.roles[0].revision,sourceId:t.sourceId,sourceRevision:1,title:'合成完整案例',description:'明确记录本人的真实参与',caseDate:null,datePrecision:'UNKNOWN',location:'',brandDisplayName:'合成品牌',industryCode:null,workTypeCodes:[],origin:'EXTERNAL',originNote:'合成外部资料',creditNote:'合成模特署名',assetIds:[a],coverAssetId:a};
 const key=randomUUID(),r=ok(await f.owner.cmd('POST',`/people/${t.id}/work-cases`,input,key),200);assert.equal(result(await f.owner.cmd('POST',`/people/${t.id}/work-cases`,input,key)).replayed,true);
 const credits=await f.store.transaction(tx=>tx.find('workCredits',{workId:r.resourceId}));assert.equal(credits.length,1);assert.equal(credits[0]!.personRoleId,p.roles[0].id);assert.equal(credits[0]!.sourceId,t.sourceId);
 const cases=ok(await f.owner.raw('GET',`/people/${t.id}/work-cases`),200);assert.equal(cases.items[0].brandDisplayName,'合成品牌');assert.equal(cases.items[0].caseDate,null);assert.equal(cases.items[0].coverAssetId,a);
 const listed=ok(await f.owner.raw('GET','/works'),200);assert.equal(listed.items.find((w:any)=>w.id===r.resourceId).coverAssetId,a);
 const noMedia=await f.store.transaction(async tx=>{const actor=await f.app.identity.authenticate(tx,f.owner.jar.once_session!);return f.app.portfolio.list(tx,{...actor,permissions:actor.permissions.filter(p=>p!=='assets.read')},{});});assert.equal(noMedia.items.find(w=>w.id===r.resourceId)!.coverAssetId,null);
 const count=(await f.store.transaction(tx=>tx.find('works'))).length;
 assert.equal((await f.owner.cmd('POST',`/people/${t.id}/work-cases`,{...input,expectedRoleRevision:999})).status,409);
 assert.equal((await f.owner.cmd('POST',`/people/${t.id}/work-cases`,{...input,assetIds:[a,a]})).status,422);
 const other=await uxTalent(f,'合成其他作品资料'),otherAsset=await uxImage(f,other.id,other.sourceId);assert.equal((await f.owner.cmd('POST',`/people/${t.id}/work-cases`,{...input,assetIds:[otherAsset],coverAssetId:otherAsset})).status,422);
 assert.equal((await f.store.transaction(tx=>tx.find('works'))).length,count);
 return {checks:['case-credit-assets-one-command','exact-role-provenance','ack-replay-no-second-work','unknown-date-preserved','stale-role-duplicate-and-other-person-media-rollback']};
}
