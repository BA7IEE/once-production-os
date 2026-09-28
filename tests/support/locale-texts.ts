import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Application} from '../../packages/core/src/api.ts';
import {inspectLocaleIntegrity} from '../../packages/core/src/locale-integrity.ts';
import {sourceInput,Client} from './fixtures.ts';
import {FaultStore} from './fault-store.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
import type {FactErasureContext} from './talent-source-fact-erasure.ts';
export async function verifyLocaleTexts(f:FactErasureContext,failureStatus:500|503=500){
 const basisId=ok(await f.owner.cmd('POST','/sources',{...sourceInput(),title:'合成语言依据'})).resourceId as string;
 const created:string[]=[];
 for(const subjectKind of ['PERSON','WORK','PROJECT'] as const){
  const path=subjectKind==='PERSON'?'/people':subjectKind==='WORK'?'/works':'/projects';
  const subjectId=ok(await f.owner.cmd('POST',path,{...(subjectKind==='PERSON'?{displayName:'语言测试人物',roles:['photographer']}:{title:'语言测试'+subjectKind}),inlineSource:sourceInput()})).resourceId as string;
  const input={subjectKind,subjectId,locale:'en',text:'Synthetic internal text.',expectedSubjectRevision:1,sourceRefs:[{id:basisId,expectedRevision:1}],confirmCurrentBasis:true};
  for(const extra of [{locale:'xx'},{sourceRefs:[]},{sourceRefs:[input.sourceRefs[0],input.sourceRefs[0]]},{sourceDigest:'forged'}])assert.ok((await f.owner.cmd('POST','/locale-texts',{...input,...extra})).status>=400);
  const fault=new FaultStore(f.store),faultApp=new Application(fault,f.app.config,f.clock),client=new Client(faultApp);client.jar={...f.owner.jar};client.csrf=f.owner.csrf;
  let fired=false;const errorCheck=(r:any)=>{assert.equal(r.status,failureStatus,JSON.stringify(r.body));assert.equal(fired,true);if(failureStatus===503)assert.equal(r.body.error.code,'STORE_UNAVAILABLE');};
  fault.afterInsert=(table,row)=>{if(table==='audits'&&'action' in row&&row.action==='locale.create'){fired=true;throw new Error('synthetic locale audit failure');}};
  const key=randomUUID();errorCheck(await client.cmd('POST','/locale-texts',input,key));
  assert.equal((await f.store.transaction(tx=>tx.find('localeTexts',{[subjectKind==='PERSON'?'personId':subjectKind==='WORK'?'workId':'projectId']:subjectId}))).length,0);
  fault.afterInsert=null;const id=ok(await client.cmd('POST','/locale-texts',input,key)).resourceId as string;created.push(id);
  assert.equal(ok(await client.cmd('POST','/locale-texts',input,key)).replayed,true);
  assert.equal((await f.owner.cmd('POST','/locale-texts',input)).status,409);
  let detail=ok(await f.owner.raw('GET','/locale-texts/'+id),200);assert.equal(detail.text,input.text);assert.equal(detail.needsReview,false);
  assert.equal(ok(await f.owner.raw('GET',`/locale-texts?subjectKind=${subjectKind}&subjectId=${subjectId}`),200).total,1);
  ok(await f.owner.cmd('PATCH',path+'/'+subjectId,{expectedRevision:1,...(subjectKind==='PERSON'?{displayName:'改后语言人物'}:{title:'改后语言'+subjectKind})}),200);
  detail=ok(await f.owner.raw('GET','/locale-texts/'+id),200);assert.equal(detail.needsReview,true);assert.equal(detail.text,input.text);assert.equal(detail.textRestricted,false);
  const update={expectedRevision:1,expectedSubjectRevision:2,text:'Reviewed against updated subject.',sourceRefs:input.sourceRefs,confirmCurrentBasis:true};
  assert.equal((await client.cmd('PATCH','/locale-texts/'+id,{...update,expectedSubjectRevision:1})).status,409);
  const before=await f.store.transaction(async tx=>({row:await tx.get('localeTexts',id),deps:await tx.find('localeDependencies',{localeTextId:id})}));
  const updateKey=randomUUID();fired=false;fault.afterInsert=(table,row)=>{if(table==='audits'&&'action' in row&&row.action==='locale.update'){fired=true;throw new Error('synthetic locale update audit failure');}};
  errorCheck(await client.cmd('PATCH','/locale-texts/'+id,update,updateKey));
  assert.deepEqual(await f.store.transaction(async tx=>({row:await tx.get('localeTexts',id),deps:await tx.find('localeDependencies',{localeTextId:id})})),before);
  fault.afterInsert=null;ok(await client.cmd('PATCH','/locale-texts/'+id,update,updateKey),200);assert.equal(ok(await f.owner.raw('GET','/locale-texts/'+id),200).needsReview,false);
 }
 const workspaceId=(await f.store.transaction(tx=>tx.get('sources',basisId)))!.workspaceId;
 assert.equal((await f.store.transaction(tx=>inspectLocaleIntegrity(tx,workspaceId))).relationFailures,0);
 ok(await f.owner.cmd('POST',`/sources/${basisId}/suspend`,{expectedRevision:1,reason:'合成语言依据暂停'}),200);
 for(const id of created){assert.equal((await f.owner.raw('GET','/locale-texts/'+id)).status,404);const row=await f.store.transaction(tx=>tx.get('localeTexts',id));assert.ok(row?.text);}
 return {created,basisId};
}

export async function verifyLocaleDeletion(f:FactErasureContext,targetKind:'SOURCE'|'PERSON'|'WORK'|'PROJECT'='SOURCE'){
 const sourceId=ok(await f.owner.cmd('POST','/sources',{...sourceInput(),title:'合成待删除语言依据'})).resourceId as string;
 const subjectKind=targetKind==='SOURCE'?'PERSON':targetKind,path=subjectKind==='PERSON'?'/people':subjectKind==='WORK'?'/works':'/projects';
 const personId=ok(await f.owner.cmd('POST',path,{...(subjectKind==='PERSON'?{displayName:'保留人物删除语言依据',roles:['photographer']}:{title:'合成删除语言'+subjectKind}),inlineSource:sourceInput()})).resourceId as string;
 const targetId=targetKind==='SOURCE'?sourceId:personId;
 const input={subjectKind,subjectId:personId,locale:'zh',text:'仅依赖待删来源的合成介绍',expectedSubjectRevision:1,sourceRefs:[{id:sourceId,expectedRevision:1}],confirmCurrentBasis:true};
 const id=ok(await f.owner.cmd('POST','/locale-texts',input)).resourceId as string;
 const preview=ok(await f.owner.raw('POST','/deletion-requests/preview',{targetKind,targetId,expectedRevision:1}),200);assert.equal(preview.complete,true,JSON.stringify(preview.unresolved));
 const requestId=ok(await f.owner.cmd('POST','/deletion-requests',{targetKind,targetId,expectedRevision:1,previewDigest:preview.previewDigest,reason:'合成来源删除连同衍生语言文本'})).resourceId as string;
 const request=()=>f.store.transaction(async tx=>(await tx.get('deletionRequests',requestId))!);
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/block`,{expectedRevision:1,previewDigest:preview.previewDigest,acknowledgeBlock:true}),200);
 const items=await f.store.transaction(tx=>tx.find('deletionItems',{requestId}));assert.equal(items.filter(x=>x.resourceKind==='localeText'&&x.resourceId===id).length,1);
 for(const item of items)if(item.decision==='PENDING')ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/decisions`,{expectedRevision:(await request()).revision,entryId:item.id,decision:'APPLY_PROPOSED',decisionReason:'合成显式清除依赖文本'}),200);
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/plan/freeze`,{expectedRevision:(await request()).revision,acknowledgePlan:true}),200);
 ok(await f.owner.cmd('POST',`/deletion-requests/${requestId}/cleaning/start`,{expectedRevision:(await request()).revision,planDigest:(await request()).planDigest,acknowledgeIrreversible:true}),200);
 const {DeletionCleanup}=await import('../../packages/core/src/deletion-cleanup.ts'),fault=new FaultStore(f.store);let fired=false;
 const before=await f.store.transaction(async tx=>({row:await tx.get('localeTexts',id),deps:await tx.find('localeDependencies',{localeTextId:id})}));
 fault.afterInsert=(table,row)=>{if(table==='audits'&&'action' in row&&row.action==='deletion.cleanup-item'&&'resourceId' in row&&row.resourceId===requestId){fired=true;throw new Error('synthetic locale deletion audit fault');}};
 const worker=new DeletionCleanup(fault,f.clock,f.app.config),claim=await worker.claim();assert.ok(claim);await worker.process(claim);assert.equal(fired,true);
 assert.deepEqual(await f.store.transaction(async tx=>({row:await tx.get('localeTexts',id),deps:await tx.find('localeDependencies',{localeTextId:id})})),before);
 fault.afterInsert=null;const retry=await worker.claim();assert.ok(retry);await worker.process(retry);const final=await f.app.deletionFinalization.claim();assert.ok(final);await f.app.deletionFinalization.finish(final);
 assert.equal((await request()).state,'COMPLETED');assert.equal((await f.store.transaction(tx=>tx.get('sources',sourceId)))!.status==='ERASED',targetKind==='SOURCE');const erased=await f.store.transaction(tx=>tx.get('localeTexts',id));assert.equal(erased!.text,'');assert.equal(erased!.state,'ERASED');assert.equal((await f.store.transaction(tx=>tx.find('localeDependencies',{localeTextId:id}))).length,0);assert.equal((await f.owner.raw('GET',path+'/'+personId)).status,targetKind==='SOURCE'?200:404);assert.equal((await f.owner.raw('GET','/locale-texts/'+id)).status,404);
 return {id,personId,requestId};
}
