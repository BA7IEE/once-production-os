import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,result} from '../support/fixtures.ts';
import {localeMergeFixture,localeMergeInput,verifyLocaleMerge} from '../support/locale-merge.ts';
import {inspectLocaleIntegrity} from '../../packages/core/src/locale-integrity.ts';
test('locale merge preserves both originals, forces re-review, rolls back audit failures and replays exact requests',async()=>{
 const f=await fixture();await verifyLocaleMerge(f);assert.equal((await f.store.transaction(tx=>inspectLocaleIntegrity(tx,f.workspaceId))).relationFailures,0);
});
test('locale merge rejects changed auxiliary sources and hides restricted text from preview',async()=>{
 const {sourceInput}=await import('../support/fixtures.ts');
 const f=await fixture(),t=await localeMergeFixture(f),aux=result(await f.owner.cmd('POST','/sources',sourceInput())).resourceId;
 const edited=await f.owner.cmd('PATCH','/locale-texts/'+t.texts[1],{expectedRevision:1,expectedSubjectRevision:1,text:'Original English 1',sourceRefs:[{id:aux,expectedRevision:1}],confirmCurrentBasis:true});assert.equal(edited.status,200);
 const preview=result(await t.preview()),source=f.store.rows('sources').find(s=>s.id===aux)!;
 await f.store.transaction(tx=>tx.replace('sources',{...source,revision:source.revision+1}));
 assert.equal((await f.owner.cmd('POST','/people/merge',localeMergeInput(preview))).status,409);
 await f.store.transaction(tx=>tx.replace('sources',{...source,status:'SUSPENDED',revision:source.revision+1}));
 const hidden=await t.preview();assert.equal(hidden.status,200);assert.equal(result(hidden).complete,false);assert.equal(JSON.stringify(hidden.body).includes('Original English'),false);
 assert.equal(f.store.rows('personMerges').length,0);
});


test('merged originals survive controlled export and rebuild; unrelated history sources are rejected',async()=>{
 const {localeTransfer}=await import('../support/locale-transfer.ts'),{JsonRebuild}=await import('../../packages/core/src/rebuild.ts');
 const source=await fixture(),t=await localeTransfer(source,true),target=await fixture(),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
 target.clock.value=source.clock.value;
 const original=t.download.payload.manifest.locales.texts.find((r:any)=>r.id===t.localeIds[0]);assert.equal(original.mergeHistory.length,2);assert.ok(Date.parse(original.originalReview.reviewedAt)<Date.parse(original.createdAt));
 const bad=structuredClone(t.download.payload);bad.manifest.sources=bad.manifest.sources.filter((r:any)=>r.id!==t.basisId);
 await assert.rejects(target.store.transaction(tx=>rebuild.apply(tx,actor,bad,{requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',ip:'test'})));assert.equal(target.store.rows('people').length,0);
 await target.store.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',ip:'test'}));
 const text=target.store.rows('localeTexts').find(r=>r.id===t.localeIds[0])!;assert.deepEqual(text.mergeHistory,original.mergeHistory);
 assert.equal((await fRead(target,text.id)).history.length,2);assert.equal((await target.store.transaction(tx=>inspectLocaleIntegrity(tx,target.workspaceId))).relationFailures,0);
});
async function fRead(f:Awaited<ReturnType<typeof fixture>>,id:string){const response=await f.owner.raw('GET','/locale-texts/'+id);assert.equal(response.status,200,JSON.stringify(response.body));return result(response);}

test('a later merge retains prior originals without nesting, and old identity deletion includes dependent text',async()=>{
 const {sourceInput}=await import('../support/fixtures.ts'),{affectedLocales,localeErasureSnapshot,eraseLocale}=await import('../../packages/core/src/locale-maintenance.ts');
 const f=await fixture(),t=await verifyLocaleMerge(f);
 const source=result(await f.owner.cmd('POST','/sources',sourceInput())).resourceId;
 const duplicateId=result(await f.owner.cmd('POST','/td2/people',{schemaVersion:'once-talent-v2.0.0',originSourceId:source,sourceRevision:1,displayName:'第三份语言档案'})).resourceId;
 const textId=result(await f.owner.cmd('POST','/locale-texts',{subjectKind:'PERSON',subjectId:duplicateId,locale:'en',text:'Third English',expectedSubjectRevision:1,sourceRefs:[{id:source,expectedRevision:1}],confirmCurrentBasis:false})).resourceId;
 const preview=result(await f.owner.raw('POST','/people/merge-preview',{canonicalId:t.people[0],duplicateId,expectedCanonicalRevision:2,expectedDuplicateRevision:1}));
 const response=await f.owner.cmd('POST','/people/merge',localeMergeInput(preview));assert.equal(response.status,200,JSON.stringify(response.body));
 const current=await fRead(f,t.texts[0]!);assert.equal(current.history.length,4);assert.equal(current.text,'Third English');assert.equal(f.store.rows('localeTexts').find(r=>r.id===textId)!.state,'ERASED');
 const row=f.store.rows('localeTexts').find(r=>r.id===current.id)!;assert.ok(row.mergeHistory!.every(h=>!('mergeHistory'in h)));
 assert.ok((await f.store.transaction(tx=>affectedLocales(tx,f.workspaceId,[['PERSON',new Set([t.people[1]!])]]))).includes(current.id));
 const {JsonRebuild}=await import('../../packages/core/src/rebuild.ts');const actor=await f.store.transaction(tx=>new JsonRebuild(f.clock).actorFromTarget(tx,'owner'));
 await f.store.transaction(async tx=>{const snapshot=await localeErasureSnapshot(tx,actor,current.id);await eraseLocale(tx,actor,{resourceKind:'localeText',resourceId:current.id,decision:'APPLY_PROPOSED',cleanupState:'PENDING',detailCode:snapshot.detailCode} as any,f.clock);});
 const erased=f.store.rows('localeTexts').find(r=>r.id===current.id)!;assert.equal(erased.mergeHistory,null);assert.equal(erased.text,'');assert.equal((await f.store.transaction(tx=>inspectLocaleIntegrity(tx,f.workspaceId))).relationFailures,0);
});


test('language choices are explicit even for one-sided text and cannot select another language',async()=>{
 const f=await fixture(),t=await localeMergeFixture(f);
 const zh=result(await f.owner.cmd('POST','/locale-texts',{subjectKind:'PERSON',subjectId:t.people[1],locale:'zh',text:'只在重复档案中的中文',expectedSubjectRevision:1,sourceRefs:[{id:t.sources[1],expectedRevision:1}],confirmCurrentBasis:false})).resourceId;
 const p=result(await t.preview()),input=localeMergeInput(p);assert.equal(p.locales.length,2);
 assert.equal((await f.owner.cmd('POST','/people/merge',{...input,localeDecisions:input.localeDecisions.filter((c:any)=>c.locale==='en')})).status,422);
 assert.equal((await f.owner.cmd('POST','/people/merge',{...input,localeDecisions:input.localeDecisions.map((c:any)=>({...c,selectedTextId:zh}))})).status,422);
 const response=await f.owner.cmd('POST','/people/merge',input);assert.equal(response.status,200,JSON.stringify(response.body));
 const listed=result(await f.owner.raw('GET','/locale-texts?subjectKind=PERSON&subjectId='+t.people[0]));assert.equal(listed.total,2);
 const chinese=listed.items.find((r:any)=>r.locale==='zh');assert.equal(chinese.text,'只在重复档案中的中文');assert.equal(chinese.history.length,1);assert.notEqual(chinese.id,zh);assert.equal(chinese.state,'DRAFT');
});

test('review timestamps use one event instant even when the clock advances between calls',async()=>{
 const f=await fixture();f.clock.now=()=>new Date(++f.clock.value);
 const t=await localeMergeFixture(f);
 for(const row of f.store.rows('localeTexts'))assert.equal(row.reviewedAt,row.updatedAt);
 const old=f.store.rows('localeTexts')[0]!;
 const changed=await f.owner.cmd('PATCH','/locale-texts/'+old.id,{expectedRevision:old.revision,expectedSubjectRevision:1,text:'Single review instant',sourceRefs:[{id:t.sources[0],expectedRevision:1}],confirmCurrentBasis:true});assert.equal(changed.status,200);
 const updated=f.store.rows('localeTexts').find(r=>r.id===old.id)!;assert.equal(updated.reviewedAt,updated.updatedAt);
});
