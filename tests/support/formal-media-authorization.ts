import assert from 'node:assert/strict';
import type {Store} from '../../packages/core/src/store.ts';
import {Client,result,sourceInput} from './fixtures.ts';
import {stagingFixture,unitReady,exportStagingScenario} from './media-staging.ts';
import {loadTalentGraph} from '../../packages/core/src/talent-v2-graph.ts';
import {mergePreview} from './talent-v2-merge.ts';

/** Same commands/assertions against Memory and PostgreSQL. No direct auth-row edits. */
export async function formalMediaScenario(store:Store,bound=true,roleBound=false){
 let intake!:Client,formal!:Client,formalScope!:string;
 const ok=async(p:ReturnType<Client['raw']>,status=200)=>{const r=await p;assert.equal(r.status,status,JSON.stringify(r.body));return result(r);};
 const move=async(kind:'person'|'source',id:string,scopeId:string)=>{const row=await store.transaction(tx=>tx.get(kind==='person'?'people':'sources',id));await ok(f.owner.cmd('PATCH',`/records/${kind}/${id}/scope`,{expectedRevision:row!.revision,scopeId}));};
 const f=await stagingFixture(store,bound,async base=>{
  const members=[];
  for(const loginName of ['intake-only','formal-only']){
   const m=await ok(base.owner.raw('POST','/memberships',{loginName,displayName:loginName,role:'ADMIN',extraPermissions:['sensitive.read','sensitive.write']}),201);
   const client=new Client(base.app,'192.0.2.'+(40+members.length));await ok(client.activate(m.activationToken));await ok(client.login(loginName));members.push({client,id:m.membershipId});
  }
  intake=members[0]!.client;formal=members[1]!.client;
  const ownerId=(await ok(base.owner.raw('GET','/me'))).membershipId;
  base.scopeId=(await ok(base.owner.cmd('POST','/scopes',{name:'Only intake A',membershipIds:[ownerId,members[0]!.id]}),201)).resourceId;
  formalScope=(await ok(base.owner.cmd('POST','/scopes',{name:'Formal B',membershipIds:[ownerId,members[1]!.id]}),201)).resourceId;
  base.sourceId=(await ok(base.owner.cmd('POST','/sources',{...sourceInput(),scopeId:formalScope}),201)).resourceId;
  base.personId=(await ok(base.owner.cmd('POST','/directory/talents',{schemaVersion:'once-talent-experience-v1',kind:'TALENT',displayName:'Formal Anna',sourceId:base.sourceId,sourceRevision:1}),201)).resourceId;
 });
 const role=roleBound?(await store.transaction(tx=>tx.find('personRoles',{personId:f.personId})))[0]:null;
 const id=await unitReady(f,role?{context:{kind:'TALENT_SUBMISSION',submissionId:f.submissionId,personRoleId:role.id}}:{}),checks:string[]=[];
 const canonical=await ok(f.owner.cmd('POST','/td2/people',{schemaVersion:'once-talent-v2.1.0',displayName:'Formal canonical',originSourceId:f.sourceId,sourceRevision:1}),201);
 if(bound){const pending=await mergePreview(store,formal,canonical.resourceId,f.personId);assert.equal(pending.complete,false);assert.ok(pending.blockers.some((b:any)=>b.code==='TALENT_MAINTENANCE_HIDDEN_DEPENDENCY'));checks.push('merge-STAGED-keeps-intake-scope');}
 const actor=(client:Client)=>store.transaction(tx=>f.app.identity.authenticate(tx,client.jar.once_session!));
 const readStaged=async(client:Client)=>store.transaction(async tx=>f.app.media.staged(tx,await f.app.identity.authenticate(tx,client.jar.once_session!),id));
 await assert.rejects(readStaged(formal));
 if(!bound)await readStaged(intake); // Unbound reviewer A can read only within intake.
 for(const client of [intake,formal])assert.equal((await client.raw('GET','/assets/'+id)).status,404);
 checks.push('READY-STAGED-denies-formal-B-without-intake');
 await ok(f.a.client.raw('POST','/portal/submissions/'+f.submissionId+'/submit',{expectedRevision:await f.revision()},f.headers()));
 await ok(f.owner.cmd('POST','/talent-submissions/'+f.submissionId+'/decide',{expectedRevision:await f.revision(),acceptedKeys:['name','aliases','intro','media_'+id],publicReason:'采纳正式材料',...(!bound?{createPerson:true,ownershipBasis:'独立核实新申请人',guardianConfirmed:false}:{})}));
 const relation=(await store.transaction(tx=>tx.find('personMedia',{assetId:id})))[0]!;
 if(!bound){await move('person',relation.personId!,formalScope);await move('source',relation.sourceId!,formalScope);}
 const assertReads=async(client:Client,allowed:boolean)=>{
  assert.equal((await client.raw('GET','/assets/'+id)).status,allowed?200:404);
  const list=await ok(client.raw('GET','/assets'));assert.equal(list.items.some((x:any)=>x.id===id),allowed);
  await store.transaction(async tx=>{
   const a=await f.app.identity.authenticate(tx,client.jar.once_session!);
   assert.equal((await loadTalentGraph(tx,a,f.clock)).assetReadable(id),allowed);
   const preview=()=>f.app.media.preview(tx,a,id,{requestId:crypto.randomUUID(),ip:'synthetic'});
   if(allowed)await preview();else await assert.rejects(preview());
  });
 };
 await assertReads(formal,true);await assertReads(intake,false);
 checks.push('ADOPTED-direct-list-preview-TD2-use-formal-Person-Source-not-intake');
 // Full async JSON export runs as employee B, without historical intake scope.
 if(bound){await exportStagingScenario({...f,owner:formal},id);checks.push('formal-B-export-adopted-without-intake');}
 const person=(await store.transaction(tx=>tx.get('people',relation.personId!)))!;

 if(bound){const preview=await mergePreview(store,formal,canonical.resourceId,person.id);assert.equal(preview.complete,!roleBound,JSON.stringify(preview));if(roleBound)assert.deepEqual(preview.blockers.map((b:any)=>b.code),['MEDIA_ROLE_DEPENDENCY_REQUIRES_REVIEW']);checks.push('formal-B-merge-preview-without-historical-intake');}
 // Current formal scope is still mandatory; neither old intake nor ADMIN bypass it.
 const ownerId=(await actor(f.owner)).membershipId,hidden=(await ok(f.owner.cmd('POST','/scopes',{name:'Formal source withheld',membershipIds:[ownerId]}),201)).resourceId;
 await move('person',person.id,hidden);await assertReads(formal,false);await move('person',person.id,formalScope);checks.push('current-person-scope-remains-required');
 await move('source',relation.sourceId!,hidden);await assertReads(formal,false);await assertReads(intake,false);
 if(bound){const current=(await store.transaction(tx=>tx.get('people',person.id)))!;assert.equal((await formal.raw('POST','/people/merge-preview',{canonicalId:canonical.resourceId,duplicateId:person.id,expectedCanonicalRevision:1,expectedDuplicateRevision:current.revision})).status,404);}checks.push('current-formal-source-scope-revocation-denies-all-consumers');
 await move('source',relation.sourceId!,formalScope);await assertReads(formal,true);

 if(role){const p=(await store.transaction(tx=>tx.get('people',person.id)))!;await ok(f.owner.cmd('PATCH','/td2/roles/'+role.id,{schemaVersion:'once-talent-v2.1.0',expectedRevision:role.revision,expectedPersonRevision:p.revision,sourceId:f.sourceId,sourceRevision:1,values:{status:'INACTIVE'}}));await assertReads(formal,false);checks.push('exact-formal-Role-inactivation-denies-direct-list-preview-and-graph');}
 return {checks};
}
