import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,member,result,sourceInput} from '../support/fixtures.ts';
import {emptySupplierProfile} from '../../packages/core/src/supplier-profile-contract.ts';
import {inspectTalentIntegrity} from '../../packages/core/src/talent-v2-integrity.ts';

async function setup(){const f=await fixture();const ok=(r:any,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.body));return result(r);};
 const batch=ok(await f.owner.cmd('POST','/supplier-inbox',{source:{...sourceInput(),title:'合成员工收件',providerClaim:'同行经许可提供的合成材料'},receivedAt:f.clock.now().toISOString()}),201);
 const read=async()=>ok(await f.owner.raw('GET','/supplier-inbox/'+batch.resourceId));
 const add=async(url='https://example.invalid/portfolio?private=synthetic')=>{const b=await read();ok(await f.owner.cmd('POST','/supplier-inbox/'+b.id+'/materials',{expectedRevision:b.revision,assetId:null,url,note:'受控人工网址记录，不抓取网页'}));return read();};
 const subject=(name:string,role='photographer')=>({id:randomUUID(),decision:'CREATE',personId:null,expectedPersonRevision:null,profile:{...emptySupplierProfile(),displayName:name,roleCodes:[role],intro:'员工核对的合成经历'},evidencePages:[],professionalReplace:[],works:[]});
 const save=async(b:any,m:any,subjects:any[],materialKind='PERSON_PROFILE')=>ok(await f.owner.cmd('POST','/supplier-inbox/'+b.id+'/review',{expectedRevision:b.revision,materialId:m.id,expectedMaterialRevision:m.revision,materialKind,subjects}));
 const adopt=async(b:any,m:any,subjectId:string,key=randomUUID())=>f.owner.cmd('POST','/supplier-inbox/'+b.id+'/adopt',{expectedRevision:b.revision,materialId:m.id,expectedMaterialRevision:m.revision,subjectId,confirmOwnership:true},key);
 return {...f,ok,read,add,subject,save,adopt,batch};
}
test('employee inbox records true employee provenance, encrypted drafts and explicit multiple-person ownership atomically',async()=>{
 const f=await setup();let b=await f.add(),m=b.materials[0],first=f.subject('合成摄影甲'),second=f.subject('合成导演乙','director');
 await f.save(b,m,[first,second],'MULTI_PERSON');b=await f.read();m=b.materials[0];
 assert.equal(f.store.rows('people').length,0);assert.ok(!JSON.stringify(f.store.rows('supplierInboxMaterials')).includes('private=synthetic'));
 const key=randomUUID(),bodyRevision={b,m};f.ok(await f.adopt(b,m,first.id,key));assert.equal(f.store.rows('people').length,1);
 const replay=f.ok(await f.adopt(bodyRevision.b,bodyRevision.m,first.id,key));assert.equal(replay.replayed,true);assert.equal(f.store.rows('people').length,1);
 b=await f.read();m=b.materials[0];assert.equal(m.state,'READY');assert.equal(m.payload.subjects.find((s:any)=>s.id===first.id).state,'APPLIED');
 f.ok(await f.adopt(b,m,second.id));b=await f.read();m=b.materials[0];assert.equal(m.state,'COMPLETE');assert.equal(f.store.rows('people').length,2);
 assert.equal(f.store.rows('talentAccounts').length,0);assert.equal(f.store.rows('talentConsents').length,0);
 const source=f.store.rows('sources').find(s=>s.id===b.id)!;assert.equal(source.reviewedBy,f.membershipId);assert.equal(source.confirmedByTalentId??null,null);
 assert.ok(m.payload.subjects.every((s:any)=>s.decidedById===f.membershipId));
 const integrity=await f.store.transaction(tx=>inspectTalentIntegrity(tx,f.workspaceId,f.app.config.contactKey,f.clock));assert.equal(integrity.relationFailures,0);assert.equal(integrity.professionalFactFailures,0);
});
test('company introductions cannot be adopted as a person and audit failure rolls back the entire employee adoption',async()=>{
 const f=await setup();let b=await f.add(),m=b.materials[0],s=f.subject('待核对的合成人物');await f.save(b,m,[s],'COMPANY_PROFILE');b=await f.read();m=b.materials[0];assert.equal((await f.adopt(b,m,s.id)).status,422);assert.equal(f.store.rows('people').length,0);
 await f.save(b,m,[s],'PERSON_PROFILE');b=await f.read();m=b.materials[0];const before=structuredClone(f.store.rows('supplierInboxMaterials'));f.store.failNextAudit=true;
 assert.equal((await f.adopt(b,m,s.id)).status,500);assert.equal(f.store.rows('people').length,0);assert.deepEqual(f.store.rows('supplierInboxMaterials'),before);
 f.ok(await f.adopt(b,m,s.id));assert.equal(f.store.rows('people').length,1);
});
test('multiple materials explicitly supplement one current Person, preserve identity and reject stale revisions',async()=>{
 const f=await setup();let b=await f.add(),m=b.materials[0],s=f.subject('合成同一人物');await f.save(b,m,[s]);b=await f.read();m=b.materials[0];f.ok(await f.adopt(b,m,s.id));
 const person=f.store.rows('people')[0]!;b=await f.add('https://example.invalid/second');m=b.materials.find((m:any)=>m.state==='WAITING');
 const second={...f.subject('不得覆盖的另一个名字','director'),decision:'LINK',personId:person.id,expectedPersonRevision:person.revision};await f.save(b,m,[second]);b=await f.read();m=b.materials.find((m:any)=>m.id===m.id&&m.state==='WAITING');
 await f.store.transaction(async tx=>{const p=(await tx.get('people',person.id))!;await tx.replace('people',{...p,revision:p.revision+1});});
 assert.equal((await f.adopt(b,m,second.id)).status,409);
 second.expectedPersonRevision=(await f.store.transaction(tx=>tx.get('people',person.id)))!.revision;await f.save(b,m,[second]);b=await f.read();m=b.materials.find((x:any)=>x.assetId===null&&x.state==='WAITING');
 f.ok(await f.adopt(b,m,second.id));assert.equal(f.store.rows('people').length,1);assert.equal(f.store.rows('people')[0]!.displayName,'合成同一人物');assert.deepEqual(f.store.rows('personRoles').map(r=>r.roleCode).sort(),['director','photographer']);
});
test('employee scope and source withdrawal fence inbox reads',async()=>{
 const f=await setup(),viewer=await member(f,'inbox_viewer','VIEWER');let b=await f.add();assert.equal((await viewer.client.raw('GET','/supplier-inbox/'+b.id)).status,403);
 const state=f.store.rows('sources').find(s=>s.id===b.id)!;f.ok(await f.owner.cmd('POST','/sources/'+state.id+'/suspend',{expectedRevision:state.revision,reason:'合成撤回收件来源'}));assert.equal((await f.owner.raw('GET','/supplier-inbox/'+b.id)).status,404);
 assert.equal((await f.owner.raw('GET','/supplier-inbox')).status,200);assert.equal(f.ok(await f.owner.raw('GET','/supplier-inbox')).items.length,0);
});

test('recovery invalidates old employee inbox commands, including receipt replay',async()=>{
 const f=await setup(),b=await f.add(),m=b.materials[0],key=randomUUID(),body={expectedRevision:b.revision,materialId:m.id,expectedMaterialRevision:m.revision,action:'HOLD',aiRetryAccepted:false};
 f.ok(await f.owner.cmd('POST','/supplier-inbox/'+b.id+'/control',body,key));
 f.app.config.recoveryEpoch=randomUUID();
 assert.equal((await f.owner.raw('GET','/supplier-inbox/'+b.id)).status,503);
 assert.equal((await f.owner.cmd('POST','/supplier-inbox/'+b.id+'/control',body,key)).status,503);
});

test('an employee unresolved AI attempt blocks new paid inbox requests without relying on old Source visibility or disclosing another actor',async()=>{const f=await fixture(),{ledgerFixture}=await import('../support/ai-ledger.ts'),{assertEmployeeInboxAiResolved}=await import('../../packages/core/src/supplier-inbox.ts'),l=await ledgerFixture(f.store,f.clock),run=await l.reserve(),attempt=await l.begin(run.id),actor={workspaceId:f.workspaceId,membershipId:f.membershipId},other=await member(f,'other_inbox_ai','EDITOR');
 await assert.rejects(f.store.transaction(tx=>assertEmployeeInboxAiResolved(tx,actor)),(e:unknown)=>{assert.equal((e as any).code,'AI_OUTCOME_RECONCILE_REQUIRED');assert.equal(String(e).includes(run.id),false);return true;});await f.store.transaction(tx=>assertEmployeeInboxAiResolved(tx,{workspaceId:f.workspaceId,membershipId:other.id}));await l.unknown(attempt.id);await assert.rejects(f.store.transaction(tx=>assertEmployeeInboxAiResolved(tx,actor)));await l.settle(attempt.id,'NOT_EXECUTED',0);await f.store.transaction(tx=>assertEmployeeInboxAiResolved(tx,actor));});
