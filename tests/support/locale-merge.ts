import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Application} from '../../packages/core/src/api.ts';
import {FaultStore} from './fault-store.ts';
import {Client,sourceInput} from './fixtures.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
import type {FactErasureContext} from './talent-source-fact-erasure.ts';
export function localeMergeInput(p:any){return {canonicalId:p.canonical.id,duplicateId:p.duplicate.id,expectedCanonicalRevision:p.canonical.revision,expectedDuplicateRevision:p.duplicate.revision,previewDigest:p.previewDigest,fieldDecisions:p.fieldConflicts.map((x:any)=>({field:x.field,choice:'CANONICAL'})),collisionDecisions:p.collisions.map((x:any)=>({collisionId:x.id,choice:'KEEP_CANONICAL'})),professionalDecisions:p.professional.items.map(({table,id,action}:any)=>({table,id,action})),professionalConflicts:[],localeDecisions:p.locales.map((g:any)=>({locale:g.locale,selectedTextId:g.options.find((o:any)=>o.personId===p.duplicate.id)?.id??g.options[0].id})),acknowledgeRevocations:true,acknowledgeMediaDetach:true,reason:'人工确认合成重复身份与每种语言正文'};}
export async function localeMergeFixture(f:FactErasureContext){
 const people:string[]=[],texts:string[]=[],sources:string[]=[];
 for(let i=0;i<2;i++){
  const sourceId=ok(await f.owner.cmd('POST','/sources',{...sourceInput(),title:'合并语言来源'+i})).resourceId as string;sources.push(sourceId);
  const personId=ok(await f.owner.cmd('POST','/td2/people',{schemaVersion:'once-talent-v2.0.0',originSourceId:sourceId,sourceRevision:1,displayName:'合并语言人物'+i})).resourceId as string;people.push(personId);
  texts.push(ok(await f.owner.cmd('POST','/locale-texts',{subjectKind:'PERSON',subjectId:personId,locale:'en',text:'Original English '+i,expectedSubjectRevision:1,sourceRefs:[{id:sourceId,expectedRevision:1}],confirmCurrentBasis:true})).resourceId as string);
 }
 const preview=()=>f.owner.raw('POST','/people/merge-preview',{canonicalId:people[0],duplicateId:people[1],expectedCanonicalRevision:1,expectedDuplicateRevision:1});
 return {people,texts,sources,preview};
}
export async function verifyLocaleMerge(f:FactErasureContext,failureStatus:500|503=500){
 const t=await localeMergeFixture(f),p=ok(await t.preview(),200);assert.equal(p.complete,true);assert.equal(p.locales.length,1);assert.equal(p.locales[0].options.length,2);
 const input=localeMergeInput(p),before=await f.store.transaction(async tx=>({people:await tx.find('people'),texts:await tx.find('localeTexts'),deps:await tx.find('localeDependencies')}));
 assert.equal((await f.owner.cmd('POST','/people/merge',{...input,localeDecisions:[]})).status,422);
 const fault=new FaultStore(f.store),app=new Application(fault,f.app.config,f.clock),client=new Client(app);client.jar={...f.owner.jar};client.csrf=f.owner.csrf;let fired=false;
 fault.afterInsert=(table,row)=>{if(table==='audits'&&'action'in row&&row.action==='person.merge'){fired=true;throw new Error('synthetic locale merge audit failure');}};
 const key=randomUUID(),failed=await client.cmd('POST','/people/merge',input,key);assert.equal(failed.status,failureStatus,JSON.stringify(failed.body));assert.equal(fired,true);
 assert.deepEqual(await f.store.transaction(async tx=>({people:await tx.find('people'),texts:await tx.find('localeTexts'),deps:await tx.find('localeDependencies')})),before);
 fault.afterInsert=null;ok(await client.cmd('POST','/people/merge',input,key),200);assert.equal(ok(await client.cmd('POST','/people/merge',input,key),200).replayed,true);
 const current=ok(await f.owner.raw('GET','/locale-texts/'+t.texts[0]),200);assert.equal(current.text,'Original English 1');assert.equal(current.state,'DRAFT');assert.equal(current.needsReview,true);assert.equal(current.history.length,2);assert.deepEqual(current.history.map((h:any)=>h.text).sort(),['Original English 0','Original English 1']);
 const old=await f.store.transaction(tx=>tx.get('localeTexts',t.texts[1]!));assert.equal(old!.state,'ERASED');assert.equal(old!.text,'');assert.equal((await f.owner.raw('GET','/locale-texts/'+t.texts[1])).status,404);
 const update={expectedRevision:current.revision,expectedSubjectRevision:current.subjectRevision,text:'Reviewed merged English',sourceRefs:current.sources.map((s:any)=>({id:s.id,expectedRevision:s.revision})),confirmCurrentBasis:true};
 assert.equal((await f.owner.cmd('PATCH','/locale-texts/'+current.id,{...update,sourceRefs:update.sourceRefs.slice(0,1)})).status,422);
 ok(await f.owner.cmd('PATCH','/locale-texts/'+current.id,update),200);const reviewed=ok(await f.owner.raw('GET','/locale-texts/'+current.id),200);assert.equal(reviewed.needsReview,false);assert.deepEqual(reviewed.history,current.history);
 return {...t,current:reviewed};
}
