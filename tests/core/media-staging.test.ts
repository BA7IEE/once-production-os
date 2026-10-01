import test from 'node:test';
import {MemoryStore} from '../support/memory-store.ts';
import {stagingScenario,stagingSecurityScenario} from '../support/media-staging.ts';
test('PR03 bound talent staged media and atomic multi-source adoption',async()=>{await stagingScenario(new MemoryStore());});
test('PR03 unbound ENROLL owns new media and adopts without fake membership/source',async()=>{await stagingScenario(new MemoryStore(),false);});

test('PR03 review scope, rollback, source isolation and revoked worker',async()=>{await stagingSecurityScenario(new MemoryStore());});
import {exportStagingScenario,unitOriginal,unitPreview} from '../support/media-staging.ts';
import {fixture} from '../support/fixtures.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import assert from 'node:assert/strict';
test('PR03 business JSON keeps adopted source/relation but never reconstructs external authorization',async()=>{
 const {f,id}=await stagingScenario(new MemoryStore());const payload=await exportStagingScenario(f,id),target=await fixture();target.clock.value=f.clock.value;
 const rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));const root=await mkdtemp(join(await realpath(tmpdir()),'once-media-rebuild-'));try{const input=join(root,'input');await mkdir(input,{mode:0o700});await writeFile(join(input,id+'.original.bin'),unitOriginal);await writeFile(join(input,id+'.preview.jpg'),unitPreview);const verified=await prepareRebuildMedia(payload,actor.workspaceId,{REBUILD_MEDIA_INPUT_DIR:input,REBUILD_MEDIA_TARGET_DIR:join(root,'target')},true);const ready=new JsonRebuild(target.clock,undefined,verified);await target.store.transaction(tx=>ready.apply(tx,actor,payload,{requestId:crypto.randomUUID(),ip:'test'}));
 assert.equal(target.store.rows('talentAccounts').length,0);assert.equal(target.store.rows('talentAccessGrants').length,0);assert.equal(target.store.rows('personMedia')[0]!.usageState,'ADOPTED');assert.equal(target.store.rows('personMedia')[0]!.importedOrigin!.talentAccountId,f.a.accountId); }finally{await rm(root,{recursive:true,force:true});}
});

import {mkdtemp,mkdir,writeFile,realpath,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {prepareRebuildMedia} from '../../scripts/rebuild-media.ts';
import {stagingLifecycleScenario} from '../support/media-staging.ts';
for(const kind of ['merge','adopted-merge','delete','expiry'] as const)test('PR03 media lifecycle '+kind,async()=>{await stagingLifecycleScenario(new MemoryStore(),kind);});
import {stagingWorkerScenario,stagingConcurrencyScenario} from '../support/media-staging.ts';
for(const stop of ['grant','withdraw','consent','recovery'] as const)test('PR03 worker revalidates '+stop,async()=>{await stagingWorkerScenario(new MemoryStore(),stop);});
test('PR03 concurrent upload commands use stable principal and submission CAS',async()=>{await stagingConcurrencyScenario(new MemoryStore());});
import {stagingFixture,unitReady} from '../support/media-staging.ts';
import {mergePreview} from '../support/talent-v2-merge.ts';
test('PR03 exact Role cannot borrow another person and pinned Role merge fails closed',async()=>{
 const store=new MemoryStore(),f=await stagingFixture(store),role=store.rows('personRoles').find(r=>r.personId===f.personId)!;
 const foreign=await f.expect(f.owner.cmd('POST','/directory/talents',{schemaVersion:'once-talent-experience-v1',kind:'TALENT',displayName:'另一个人',sourceId:f.sourceId,sourceRevision:1}),201),wrong=store.rows('personRoles').find(r=>r.personId===foreign.resourceId)!;
 const denied=await f.a.client.raw('POST','/portal/uploads',{context:{kind:'TALENT_SUBMISSION',submissionId:f.submissionId,personRoleId:wrong.id},expectedSubmissionRevision:await f.revision(),fileName:'wrong.jpg',mime:'image/jpeg',expectedBytes:100,sha256:'a'.repeat(64)},f.headers());assert.equal(denied.status,409);assert.equal(store.rows('uploads').length,0);
 const id=await unitReady(f,{context:{kind:'TALENT_SUBMISSION',submissionId:f.submissionId,personRoleId:role.id}});const preview=await mergePreview(store,f.owner,foreign.resourceId,f.personId);assert.equal(preview.complete,false);assert.ok(preview.blockers.some((b:any)=>b.code==='MEDIA_ROLE_DEPENDENCY_REQUIRES_REVIEW'));assert.equal(store.rows('personMedia').find(r=>r.assetId===id)!.personRoleId,role.id);
});
test('PR03 retiring a draft file revokes read but never fakes failure or releases bytes',async()=>{
 const store=new MemoryStore(),f=await stagingFixture(store),id=await unitReady(f),a=store.rows('assets')[0]!;
 await f.expect(f.a.client.raw('POST','/portal/assets/'+id+'/retire',{expectedRevision:a.revision},f.headers()));const relation=store.rows('personMedia')[0]!;assert.equal(relation.usageState,'RETIRED');assert.equal(Date.parse(relation.retainUntil!)-f.clock.now().getTime(),7*86400000);assert.equal(store.rows('uploads')[0]!.state,'READY');assert.equal(store.rows('uploads')[0]!.purgedAt,null);await assert.rejects(store.transaction(tx=>f.app.media.staged(tx,f.actor,id)));assert.equal(store.rows('talentSubmissionItems').filter(x=>x.kind==='MEDIA').length,0);
});
