import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Application} from '../../packages/core/src/api.ts';
import type {Store} from '../../packages/core/src/store.ts';
import {Application as App} from '../../packages/core/src/api.ts';
import {DeletionCleanup} from '../../packages/core/src/deletion-cleanup.ts';
import {inspectPartyIntegrity} from '../../packages/core/src/project-parties.ts';
import {FaultStore} from './fault-store.ts';
import {Client,FakeClock,sourceInput,result} from './fixtures.ts';
import {TALENT_SCHEMA_VERSION as schemaVersion} from '../../packages/core/src/talent-v2-model.ts';
type F={app:Application;store:Store;clock:FakeClock;owner:Client};
const ok=async(p:ReturnType<Client['raw']>,status=200)=>{const r=await p;assert.equal(r.status,status,JSON.stringify(r.body));return result(r);};
export async function seedParties(f:F){
 const {owner,store}=f;
 const sourceId=(await ok(owner.cmd('POST','/sources',sourceInput()),201)).resourceId as string;
 const orgSource=(await ok(owner.cmd('POST','/sources',sourceInput()),201)).resourceId as string;
 const brandSource=(await ok(owner.cmd('POST','/sources',sourceInput()),201)).resourceId as string;
 const projectId=(await ok(owner.cmd('POST','/projects',{title:'合成客户品牌项目',sourceId}),201)).resourceId as string;
 const organizationId=(await ok(owner.cmd('POST','/td2/organizations',{schemaVersion,sourceId:orgSource,sourceRevision:1,name:'独立客户机构',kind:'OTHER'}),201)).resourceId as string;
 const brandId=(await ok(owner.cmd('POST','/brands',{sourceId:brandSource,sourceRevision:1,name:'独立品牌',organizationId}),201)).resourceId as string;
 const input={expectedRevision:1,clientOrganizationId:organizationId,brandId},key=randomUUID();
 await ok(owner.cmd('POST',`/projects/${projectId}/parties`,input,key));assert.equal((await ok(owner.cmd('POST',`/projects/${projectId}/parties`,input,key))).replayed,true);
 assert.equal((await owner.cmd('POST',`/projects/${projectId}/parties`,input)).status,409);
 const project=await ok(owner.raw('GET',`/projects/${projectId}`));assert.equal(project.parties.brand.id,brandId);assert.equal(project.parties.client.id,organizationId);
 const row=(await store.transaction(tx=>tx.get('brands',brandId)))!;assert.deepEqual((await store.transaction(tx=>inspectPartyIntegrity(tx,row.workspaceId))).blockers,[]);
 return {sourceId,orgSource,brandSource,projectId,organizationId,brandId};
}
export async function verifyParties(f:F){
 const g=await seedParties(f),{owner,store,clock,app}=f;
 // Throw after the actual audit insert; the field write and command receipt must roll back together.
 const fault=new FaultStore(store);fault.afterInsert=(table)=>{if(table==='audits')throw new Error('synthetic brand audit failure');};
 const failedApp=new App(fault,app.config,clock),failed=new Client(failedApp);failed.jar={...owner.jar};failed.csrf=owner.csrf;
 const key=randomUUID(),patch={expectedRevision:1,name:'审计通过后才改名'};
 assert.ok((await failed.cmd('PATCH',`/brands/${g.brandId}`,patch,key)).status>=500);
 assert.equal((await store.transaction(tx=>tx.get('brands',g.brandId)))?.name,'独立品牌');
 await ok(owner.cmd('PATCH',`/brands/${g.brandId}`,patch,key));
 await ok(owner.cmd('POST',`/sources/${g.orgSource}/suspend`,{expectedRevision:1,reason:'合成机构来源暂停'}));
 const detail=await ok(owner.raw('GET',`/projects/${g.projectId}`));assert.equal(detail.parties.client,null);assert.equal(detail.parties.hasUnavailable,true);assert.ok(!JSON.stringify(detail.parties).includes(g.organizationId));
 await ok(owner.cmd('PATCH',`/brands/${g.brandId}`,{expectedRevision:2,status:'ARCHIVED'}));
 assert.equal((await store.transaction(tx=>tx.get('brands',g.brandId)))?.organizationId,g.organizationId,'status-only changes preserve unavailable organization');
 await ok(owner.cmd('POST',`/sources/${g.brandSource}/suspend`,{expectedRevision:1,reason:'合成品牌来源暂停'}));
 assert.equal((await owner.cmd('PATCH',`/brands/${g.brandId}`,patch,key)).status,404,'replay rechecks current source');
 assert.equal((await ok(owner.raw('GET',`/projects/${g.projectId}`))).parties.brand,null);
 return g;
}
export async function exportParties(f:F){
 const g=await seedParties(f),{owner,app}=f;
 const sourceFields=['source.title','source.type','source.providerClaim','source.basisMode','source.basisDescription','source.validFrom','source.validUntil','source.status'];
 const fields=['project.title','project.brief','project.locationNote','project.dateNote','project.reviewNote','project.status','project.parties',...sourceFields];
 const grant=async(kind:string,id:string,sourceId:string,fields:string[])=>(await ok(owner.cmd('POST','/use-permissions',{subjectKind:kind,subjectId:id,sourceId,fields,validUntil:'2026-10-15T00:00:00.000Z',evidenceNote:'合成明确批准客户品牌完整重建'}),201)).resourceId as string;
 const refs=[await grant('PROJECT',g.projectId,g.sourceId,fields.filter(x=>x.startsWith('project.')))];
 for(const id of [g.sourceId,g.orgSource])refs.push(await grant('SOURCE',id,id,[...sourceFields,'project.parties']));
 const input={format:'JSON',selectedIds:{people:[],works:[],projects:[g.projectId]},fields,usePermissionRefs:refs};
 assert.equal((await owner.cmd('POST','/exports',input)).status,422,'brand origin requires its own explicit export permission');
 refs.push(await grant('SOURCE',g.brandSource,g.brandSource,[...sourceFields,'project.parties']));
 const id=(await ok(owner.cmd('POST','/exports',input),202)).resourceId as string;
 const claim=await app.exports.claim();assert.equal(claim?.id,id);await app.exports.process(claim!);
 const payload=(await ok(owner.raw('POST',`/exports/${id}/download`,{}))).payload;
 assert.equal(payload.manifest.parties.brands[0].id,g.brandId);assert.equal(payload.manifest.parties.organizations[0].id,g.organizationId);
 await ok(owner.cmd('PATCH',`/brands/${g.brandId}`,{expectedRevision:1,name:'新的品牌名称'}));
 assert.equal((await owner.raw('POST',`/exports/${id}/download`,{})).status,409,'changed brand blocks stale frozen export');
 return {g,payload};
}
export async function erasePartySource(f:F,target:"brand"|"organization"="brand"){
 const g=await seedParties(f),{owner,store,app,clock}=f;
 const targetId=target==='brand'?g.brandSource:g.orgSource;
 const preview=await ok(owner.raw('POST','/deletion-requests/preview',{targetKind:'SOURCE',targetId,expectedRevision:1}));
 const id=(await ok(owner.cmd('POST','/deletion-requests',{targetKind:'SOURCE',targetId,expectedRevision:1,previewDigest:preview.previewDigest,reason:'合成清理品牌来源且保留独立客户'}),201)).resourceId as string;
 await ok(owner.cmd('POST',`/deletion-requests/${id}/block`,{expectedRevision:1,previewDigest:preview.previewDigest,acknowledgeBlock:true}));
 const req=async()=>(await store.transaction(tx=>tx.get('deletionRequests',id)))!;
 for(const item of await store.transaction(tx=>tx.find('deletionItems',{requestId:id})))if(item.decision==='PENDING')await ok(owner.cmd('POST',`/deletion-requests/${id}/decisions`,{expectedRevision:(await req()).revision,entryId:item.id,decision:'APPLY_PROPOSED',decisionReason:'合成明确确认逐项清理'}));
 await ok(owner.cmd('POST',`/deletion-requests/${id}/plan/freeze`,{expectedRevision:(await req()).revision,acknowledgePlan:true}));
 await ok(owner.cmd('POST',`/deletion-requests/${id}/cleaning/start`,{expectedRevision:(await req()).revision,planDigest:(await req()).planDigest,acknowledgeIrreversible:true}));
 const cleanup=new DeletionCleanup(store,clock,app.config);const claim=await cleanup.claim();assert.ok(claim);await cleanup.process(claim);
 const final=await app.deletionFinalization.claim();assert.ok(final,JSON.stringify(await req()));await app.deletionFinalization.finish(final);
 assert.equal((await req()).state,'COMPLETED');if(target==='brand')assert.equal(await store.transaction(tx=>tx.get('brands',g.brandId)),null);else assert.equal((await store.transaction(tx=>tx.get('brands',g.brandId)))?.organizationId,null);
 const row=(await store.transaction(tx=>tx.find('projectParties',{projectId:g.projectId})))[0]!;assert.equal(row.brandId,target==='brand'?null:g.brandId);assert.equal(row.clientOrganizationId,target==='brand'?g.organizationId:null);
 if(target==='brand')assert.ok(await store.transaction(tx=>tx.get('organizations',g.organizationId)));else assert.equal(await store.transaction(tx=>tx.get('organizations',g.organizationId)),null);return g;
}
