import {localeBasisDigest} from '../../packages/core/src/locale-basis.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from '../support/fixtures.ts';
import {localeTransfer,eraseImportedLocaleSource} from '../support/locale-transfer.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import {expectResponse as ok} from '../support/talent-v2-maintenance.ts';
import {digest} from '../../packages/core/src/json.ts';
test('locale transfer uses actual permissions and rebuilds typed dependencies without inventing local review',async()=>{
 const f=await fixture(),t=await localeTransfer(f),target=await fixture(),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
 const preview=await target.store.transaction(tx=>rebuild.preview(tx,actor,t.download.payload));assert.equal(preview.localeTexts,3);assert.equal(preview.localeDependencies,6);
 target.store.failNextAudit=true;await assert.rejects(target.store.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'})),/injected audit/);assert.equal(target.store.rows('localeTexts').length,0);assert.equal(target.store.rows('sources').length,0);
 await target.store.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'}));
 for(const original of t.download.payload.manifest.locales.texts){const row=target.store.rows('localeTexts').find(r=>r.id===original.id)!;assert.equal(row.state,'DRAFT');assert.equal(row.reviewedBy,null);assert.equal(row.originalReviewMembershipId,f.membershipId);assert.equal(row.originalReviewWorkspaceId,f.workspaceId);assert.equal(row.originalReviewTextDigest,digest(original.text));assert.equal(row.text,original.text);assert.deepEqual(row.importedBasis!.dependencies,original.dependencies);assert.notEqual(row.sourceDigest,original.sourceDigest);const detail=ok(await target.owner.raw('GET','/locale-texts/'+row.id),200);assert.equal(detail.needsReview,true);assert.equal(detail.textRestricted,false);}
});
test('locale edit without a parent revision change and evidence-only permission revocation both stale a ready export',async()=>{
 for(const mode of ['edit','permission']){const f=await fixture(),t=await localeTransfer(f);if(mode==='edit')ok(await f.owner.cmd('PATCH','/locale-texts/'+t.localeIds[0],{expectedRevision:1,expectedSubjectRevision:1,text:'Changed only locale.',sourceRefs:[{id:t.basisId,expectedRevision:1}],confirmCurrentBasis:true}),200);else ok(await f.owner.cmd('POST','/use-permissions/'+t.input.usePermissionRefs.at(-1)+'/revoke',{expectedRevision:1}),200);assert.equal((await f.owner.raw('POST','/exports/'+t.jobId+'/download',{})).status,409);}
});
test('locale rebuild rejects broken roots, forged original review association, missing source and omitted digest before any writes',async()=>{
 const f=await fixture(),t=await localeTransfer(f),target=await fixture(),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
 for(const mode of ['root','rootEpoch','source','reviewText','reviewSpace','reviewTime','digest','duplicate','version','extra']){
  const payload=structuredClone(t.download.payload),row=payload.manifest.locales.texts[0];
  if(mode==='root')row.personId=randomUUID();if(mode==='rootEpoch'){const dep=row.dependencies.find((d:any)=>d.kind!=='SOURCE');dep.resourceProtectionEpoch=dep.kind==='PERSON'?null:1;row.sourceDigest=localeBasisDigest(row.dependencies);}if(mode==='source')payload.manifest.sources=payload.manifest.sources.filter((s:any)=>s.id!==t.basisId);if(mode==='reviewText')row.originalReview.textDigest='0'.repeat(64);if(mode==='reviewSpace')row.originalReview.workspaceId=randomUUID();if(mode==='reviewTime')row.originalReview.reviewedAt='2000-01-01T00:00:00.000Z';if(mode==='digest')row.sourceDigest='0'.repeat(64);if(mode==='duplicate')payload.manifest.locales.texts.push(row);if(mode==='version'){payload.schemaVersion='once-export-v1';payload.manifest.schemaVersion='once-export-v1';}if(mode==='extra')row.secret='not accepted';
  await assert.rejects(target.store.transaction(tx=>rebuild.apply(tx,actor,payload,{requestId:randomUUID(),ip:'test'})),undefined,mode);assert.equal(target.store.rows('localeTexts').length,0);assert.equal(target.store.rows('sources').length,0);
 }
});
test('a second locale export retains original review and bounded original basis, while edits distinguish earlier reviewed text',async()=>{
 const f=await fixture(),t=await localeTransfer(f),target=await fixture(),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
 await target.store.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'}));assert.equal(target.store.rows('usePermissions').length,0);
 const refs=[];for(const grant of f.store.rows('usePermissions'))refs.push(ok(await target.owner.cmd('POST','/use-permissions',{sourceId:grant.sourceId,subjectKind:grant.subjectKind,subjectId:grant.subjectId,fields:grant.fields,validUntil:grant.validUntil,evidenceNote:'合成目标库明确重新批准语言文本迁移'})).resourceId);
 const jobId=ok(await target.owner.cmd('POST','/exports',{...t.input,usePermissionRefs:refs}),202).resourceId,claim=await target.app.exports.claim();assert.ok(claim);await target.app.exports.process(claim);const again=ok(await target.owner.raw('POST','/exports/'+jobId+'/download',{}),200).payload;
 for(const row of again.manifest.locales.texts){const original=t.download.payload.manifest.locales.texts.find((r:any)=>r.id===row.id);assert.equal(row.state,'DRAFT');assert.deepEqual(row.originalReview,original.originalReview);assert.deepEqual(row.importedBasis.dependencies,original.dependencies);assert.equal(row.importedBasis.workspaceId,original.workspaceId);}
 const third=await fixture(),next=new JsonRebuild(third.clock),thirdActor=await third.store.transaction(tx=>next.actorFromTarget(tx,'owner'));await third.store.transaction(tx=>next.apply(tx,thirdActor,again,{requestId:randomUUID(),ip:'test'}));assert.deepEqual(third.store.rows('localeTexts')[0]!.importedBasis,target.store.rows('localeTexts')[0]!.importedBasis);
 const id=t.localeIds[0]!;ok(await target.owner.cmd('PATCH','/locale-texts/'+id,{expectedRevision:1,expectedSubjectRevision:1,text:'另行修改后的草稿',sourceRefs:[{id:t.basisId,expectedRevision:1}],confirmCurrentBasis:false}),200);const edited=ok(await target.owner.raw('GET','/locale-texts/'+id),200);assert.equal(edited.originalReview.matchesCurrentText,false);assert.equal(edited.needsReview,true);assert.equal((await target.owner.raw('POST','/exports/'+jobId+'/download',{})).status,409);
});

test('source cleanup erases imported locale provenance along with bodies and current dependencies',async()=>{const f=await fixture(),t=await localeTransfer(f),target=await fixture(),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));await target.store.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'}));await eraseImportedLocaleSource(target,t.basisId);});
