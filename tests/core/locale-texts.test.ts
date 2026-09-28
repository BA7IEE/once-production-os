import {test} from 'node:test';
import {fixture} from '../support/fixtures.ts';
import {verifyLocaleTexts,verifyLocaleDeletion} from '../support/locale-texts.ts';
test('internal locale texts retain current typed dependencies and roll back audit failures for people, works and projects',async()=>{await verifyLocaleTexts(await fixture());});
test('source erasure clears locale text and dependencies atomically while preserving its person',async()=>{await verifyLocaleDeletion(await fixture());});

import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPerson,sourceInput,member} from '../support/fixtures.ts';
import {expectResponse as ok} from '../support/talent-v2-maintenance.ts';
import {inspectLocaleIntegrity} from '../../packages/core/src/locale-integrity.ts';
test('locale protection changes restrict content until explicit re-review; current scope and replay permissions apply',async()=>{
 const f=await fixture(),personId=await createPerson(f.owner),person=f.store.rows('people')[0]!,sourceId=ok(await f.owner.cmd('POST','/sources',sourceInput())).resourceId as string;
 const body={subjectKind:'PERSON',subjectId:personId,locale:'en',text:'PRIVATE_LOCALE_CONTENT',expectedSubjectRevision:1,sourceRefs:[{id:sourceId,expectedRevision:1}],confirmCurrentBasis:true},key=randomUUID(),id=ok(await f.owner.cmd('POST','/locale-texts',body,key)).resourceId as string;
 const viewer=await member(f,'localeviewer','VIEWER');ok(await viewer.client.raw('GET','/locale-texts/'+id),200);assert.equal((await viewer.client.cmd('PATCH','/locale-texts/'+id,{expectedRevision:1,text:'bad',expectedSubjectRevision:1,sourceRefs:body.sourceRefs,confirmCurrentBasis:true})).status,403);
 const scopeId=ok(await f.owner.cmd('POST','/scopes',{name:'文本范围变化',membershipIds:[f.membershipId]})).resourceId as string;
 ok(await f.owner.cmd('PATCH',`/records/person/${personId}/scope`,{expectedRevision:1,scopeId}),200);
 assert.equal((await viewer.client.raw('GET','/locale-texts/'+id)).status,404);
 const restricted=ok(await f.owner.raw('GET','/locale-texts/'+id),200);assert.equal(restricted.text,'');assert.equal(restricted.textRestricted,true);assert.equal(restricted.needsReview,true);
 ok(await f.owner.cmd('PATCH','/locale-texts/'+id,{expectedRevision:1,text:'重新按当前范围整理',expectedSubjectRevision:restricted.subjectRevision,sourceRefs:body.sourceRefs,confirmCurrentBasis:true}),200);
 assert.equal(ok(await f.owner.raw('GET','/locale-texts/'+id),200).textRestricted,false);
 const machine=ok(await f.owner.raw('POST','/td2/principals',{schemaVersion:'once-talent-v2.0.0',displayName:'语言机器拒绝',scopeId,defaultMaintainerMembershipId:f.membershipId,permissionCodes:['records.read','talent.fact.write'],expiresAt:new Date(f.clock.now().getTime()+3600000).toISOString()}));
 assert.equal((await f.app.handle({method:'GET',url:'/api/v1/locale-texts/'+id,ip:'192.0.2.207',headers:{authorization:'Bearer '+machine.token},body:'{}'})).status,403);
 ok(await f.owner.cmd('POST',`/sources/${sourceId}/suspend`,{expectedRevision:1,reason:'停用语言来源'}),200);
 assert.equal((await f.owner.cmd('POST','/locale-texts',body,key)).status,404);
 assert.equal(ok(await f.owner.raw('GET',`/locale-texts?subjectKind=PERSON&subjectId=${personId}`),200).total,0);
 assert.equal((await f.owner.cmd('PATCH','/locale-texts/'+id,{expectedRevision:2,text:'不能删掉不可读来源洗白',expectedSubjectRevision:restricted.subjectRevision,sourceRefs:[{id:person.sourceId,expectedRevision:1}],confirmCurrentBasis:true})).status,404);
});
test('locale recovery inspection rejects missing roots, altered source digest and cross-workspace dependencies',async()=>{
 const f=await fixture(),personId=await createPerson(f.owner),sourceId=f.store.rows('people')[0]!.sourceId;
 const id=ok(await f.owner.cmd('POST','/locale-texts',{subjectKind:'PERSON',subjectId:personId,locale:'zh',text:'合成恢复文本',expectedSubjectRevision:1,sourceRefs:[{id:sourceId,expectedRevision:1}],confirmCurrentBasis:false})).resourceId as string;
 assert.equal((await f.store.transaction(tx=>inspectLocaleIntegrity(tx,f.workspaceId))).relationFailures,0);
 const duplicateId=await createPerson(f.owner,'含文本合并阻断');
 const merge=ok(await f.owner.raw('POST','/people/merge-preview',{canonicalId:personId,duplicateId,expectedCanonicalRevision:1,expectedDuplicateRevision:1}),200);assert.equal(merge.complete,false);assert.ok(merge.blockers.some((b:any)=>b.code==='LOCALE_MERGE_REVIEW_REQUIRED'));
 const permissionId=ok(await f.owner.cmd('POST','/use-permissions',{sourceId,subjectKind:'PERSON',subjectId:personId,fields:['person.displayName'],validUntil:'2026-10-15T00:00:00.000Z',evidenceNote:'合成明确批准内部导出字段'})).resourceId;
 const blockedExport=await f.owner.cmd('POST','/exports',{format:'JSON',selectedIds:{people:[personId],works:[],projects:[]},fields:['person.displayName'],usePermissionRefs:[permissionId]});assert.equal(blockedExport.status,409);assert.equal((blockedExport.body as any).error.code,'LOCALE_TRANSFER_NOT_READY');assert.equal(f.store.rows('exports').length,0);

 const validText=f.store.rows('localeTexts')[0]!,validRoot=f.store.rows('localeDependencies').find(d=>d.kind==='PERSON')!;
 await f.store.transaction(async tx=>{const row=(await tx.get('localeTexts',id))!;await tx.replace('localeTexts',{...row,sourceDigest:'0'.repeat(64)});});
 assert.ok((await f.store.transaction(tx=>inspectLocaleIntegrity(tx,f.workspaceId))).blockers.includes('LOCALE_GRAPH_INVALID'));
 assert.equal((await f.owner.raw('GET','/locale-texts/'+id)).status,409);
 assert.equal((await f.owner.cmd('PATCH','/locale-texts/'+id,{expectedRevision:1,text:'不能覆盖损坏的旧依据',expectedSubjectRevision:1,sourceRefs:[{id:sourceId,expectedRevision:1}],confirmCurrentBasis:true})).status,409);
 await f.store.transaction(async tx=>{const deps=await tx.find('localeDependencies',{localeTextId:id});await tx.remove('localeDependencies',deps.find(d=>d.kind==='PERSON')!.id);});
 assert.ok((await f.store.transaction(tx=>inspectLocaleIntegrity(tx,f.workspaceId))).relationFailures>0);
 await f.store.transaction(async tx=>{await tx.replace('localeTexts',validText);await tx.insert('localeDependencies',validRoot);const source=(await tx.get('sources',sourceId))!;await tx.replace('sources',{...source,workspaceId:randomUUID()});});
 assert.ok((await f.store.transaction(tx=>inspectLocaleIntegrity(tx,f.workspaceId))).relationFailures>0);
});

for(const kind of ['PERSON','WORK','PROJECT'] as const)test(kind+' erasure clears its locale derivatives and rolls back failed cleanup audits',async()=>{await verifyLocaleDeletion(await fixture(),kind);});
