import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Store} from '../../packages/core/src/store.ts';
import type {Table} from '../../packages/core/src/model.ts';
import {AppError} from '../../packages/core/src/errors.ts';
import {base} from '../../packages/core/src/helpers.ts';
import {agentMediaFixture} from './agent-media.ts';
import {Client} from './fixtures.ts';

/** Shared MemoryStore/PrismaStore scenario. All media processing uses bounded synthetic bytes. */
export async function ingestionRejectionScenario(inner:Store){
 const f=await agentMediaFixture(inner),checks:string[]=[];
 const path=(id:string)=>'/ingestion-review/submissions/'+id;
 const rows=(table:Table)=>f.store.transaction(async tx=>(await tx.find(table)).sort((a,b)=>a.id.localeCompare(b.id)));
 const formalTables=['people','sources','sourceHistory','sourceAttributions','sourceUseBases','evidence','personRoles','talentProfiles','castingProfiles','measurementSets','works','workCredits','mediaCollections','talentAccessGrants'] as const;
 const formal=async()=>Object.fromEntries(await Promise.all(formalTables.map(async t=>[t,await rows(t)])));
 const reject=(id:string,client=f.owner,key=randomUUID())=>f.review(id,[]).then(body=>client.cmd('POST',path(id)+'/review',body,key));
 const dto=async(id:string,client=f.owner)=>f.expect(client.raw('GET',path(id)));
 const pending=async()=>f.expect(f.owner.raw('POST','/review/search',{view:'TODO',kind:'INGESTION',page:1,pageSize:100}));
 const denied=async(p:Promise<any>,code:string,status=409)=>{const r=await p;assert.equal(r.status,status,JSON.stringify(r.body));assert.equal(r.body.error.code,code);};
 const seed=await f.draft('rejection-formal-target');await f.submit(seed);await f.expect(f.owner.cmd('POST',path(seed)+'/review',await f.review(seed)));
 const person=(await rows('people'))[0]!.id,stale=await f.draft('stale-target',person),gate=await f.draft('reject-security'),dict=await f.draft('retired-dictionary'),revoked=await f.draft('revoked-principal'),deadline=await f.draft('elapsed-retention'),closed=await f.draft('purge-already-started');
 const media=await f.ready(deadline,'elapsed-media'),closedMedia=await f.ready(closed,'closed-media'),retiredMedia=await f.ready(gate,'retired-media');
 for(const id of [stale,gate,dict,revoked,deadline,closed])await f.submit(id);
 const limited=await f.expect(f.owner.raw('POST','/memberships',{loginName:'intake-reviewer',displayName:'仅接收范围审核员',role:'VIEWER',extraPermissions:['talent.review']}),201),reviewer=new Client(f.app);
 await f.expect(reviewer.activate(limited.activationToken));await f.expect(reviewer.login('intake-reviewer'));
 const member=(await f.store.transaction(tx=>tx.get('memberships',limited.membershipId)))!,scopeMember={...base(f.w,f.clock),scopeId:f.intake.resourceId,membershipId:member.id};await f.store.transaction(tx=>tx.insert('scopeMembers',scopeMember));
 // This reviewer cannot read the formal target or write formal facts, but can close intake material.
 await f.expect(reviewer.raw('GET','/td2/people/'+person),404);
 await f.store.transaction(async tx=>{const p=(await tx.get('people',person))!;await tx.replace('people',{...p,revision:p.revision+1});});
 assert.equal((await dto(stale,reviewer)).canReject,true);assert.equal((await dto(stale)).canAdopt,false);
 await denied(f.owner.cmd('POST',path(stale)+'/review',await f.review(stale,undefined,person)),'TARGET_REBASE_REQUIRED');
 const beforeFormal=await formal(),frozen=(await f.store.transaction(tx=>tx.get('talentSubmissions',stale)))!,items=await f.store.transaction(tx=>tx.find('talentSubmissionItems',{submissionId:stale}));
 const snapshot=async()=>({formal:await formal(),roots:await rows('talentSubmissions'),items:await rows('talentSubmissionItems'),relations:await rows('personMedia'),receipts:await rows('receipts'),audits:await rows('audits')});
 const key=randomUUID(),body=await f.review(stale,[]);
 for(const failure of ['audits','receipts']){const before=await snapshot();f.store.afterInsert=table=>{if(table===failure)throw new AppError(503,'REJECTION_FAULT','synthetic rejection rollback');};try{await f.expect(reviewer.cmd('POST',path(stale)+'/review',body,key),503);}finally{f.store.afterInsert=null;}assert.deepEqual(await snapshot(),before);}
 await f.expect(reviewer.cmd('POST',path(stale)+'/review',body,key));await f.expect(reviewer.cmd('POST',path(stale)+'/review',body,key));
 assert.equal((await f.expect(reviewer.raw('POST','/commands/inspect',{operation:'ingestionReview.review',commandKey:key}))).found,true);
 const after=(await f.store.transaction(tx=>tx.get('talentSubmissions',stale)))!;assert.equal(after.state,'REJECTED');assert.equal(after.personId,null);assert.equal(after.revision,frozen.revision+1);assert.equal(after.decidedById,member.id);
 for(const field of ['sourceDeclaration','payloadDigest','proposedTargetBaseline'] as const)assert.deepEqual(after[field],frozen[field]);
 for(const item of await f.store.transaction(tx=>tx.find('talentSubmissionItems',{submissionId:stale}))){const old=items.find(i=>i.id===item.id)!;for(const field of ['values','baseline','targetId'] as const)assert.deepEqual(item[field],old[field]);assert.equal(item.state,'REJECTED');assert.equal(item.appliedId,null);}
 assert.deepEqual(await formal(),beforeFormal);assert.equal((await rows('receipts')).filter(r=>'commandKey' in r&&r.commandKey===key).length,1);
 assert.equal((await rows('audits')).filter(r=>'action' in r&&r.action==='ingestionReview.review'&&'resourceId' in r&&r.resourceId===stale).length,1);
 checks.push('stale-target-rejected-by-intake-only-reviewer-without-formal-write-or-content-change','audit-and-receipt-faults-rollback-and-original-key-replays-once');
 // Current privileges govern new rejection, read, and receipt inspection/replay alike.
 const inspect=()=>reviewer.raw('POST','/commands/inspect',{operation:'ingestionReview.review',commandKey:key});
 await f.store.transaction(tx=>tx.replace('memberships',{...member,extraPermissions:[]}));await f.expect(reject(gate,reviewer),403);
 await f.expect(reviewer.raw('GET',path(stale)),403);await f.expect(inspect(),403);await f.expect(reviewer.cmd('POST',path(stale)+'/review',body,key),403);await f.store.transaction(tx=>tx.replace('memberships',member));
 await f.store.transaction(tx=>tx.remove('scopeMembers',scopeMember.id));await f.expect(reject(gate,reviewer),404);await f.expect(reviewer.raw('GET',path(stale)),404);await f.expect(inspect(),404);await f.expect(reviewer.cmd('POST',path(stale)+'/review',body,key),404);await f.store.transaction(tx=>tx.insert('scopeMembers',scopeMember));
 await f.store.transaction(tx=>tx.replace('memberships',{...member,status:'DISABLED'}));await f.expect(reject(gate,reviewer),401);await f.store.transaction(tx=>tx.replace('memberships',member));
 const root=(await f.store.transaction(tx=>tx.get('talentSubmissions',gate)))!;await f.store.transaction(tx=>tx.replace('talentSubmissions',{...root,recoveryEpoch:'old-recovery'}));await denied(reject(gate),'INGESTION_AUTHORIZATION_CHANGED');await f.expect(f.owner.raw('GET',path(gate)),409);await f.store.transaction(tx=>tx.replace('talentSubmissions',root));
 const workspace=(await f.store.transaction(tx=>tx.get('workspaces',f.w)))!;await f.store.transaction(tx=>tx.replace('workspaces',{...workspace,recoveryEpoch:'old-workspace'}));await f.expect(reject(gate),503);await f.store.transaction(tx=>tx.replace('workspaces',workspace));
 f.app.config.ingestionEnabled=false;await f.expect(reject(gate),503);f.app.config.ingestionEnabled=true;
 await f.expect(f.owner.raw('POST',path(gate)+'/review',await f.review(gate,[]),{'idempotency-key':randomUUID(),'x-csrf-token':'invalid'}),403);await f.expect(f.machine('POST',path(gate)+'/review',await f.review(gate,[])),403);
 for(const extra of [{acceptedKeys:['name']},{targetPersonId:person},{formalScopeId:f.formal.resourceId},{collectionDecisions:[]},{workDecisions:[]}])await denied(f.owner.cmd('POST',path(gate)+'/review',{...await f.review(gate,[]),...extra}),'REVIEW_DECISION_INVALID',422);
 await f.store.transaction(tx=>tx.replace('talentSubmissions',{...root,payloadDigest:'0'.repeat(64)}));assert.equal((await dto(gate)).canReject,false);await denied(reject(gate),'SUBMISSION_DIGEST_MISMATCH');await f.store.transaction(tx=>tx.replace('talentSubmissions',root));
 await f.store.transaction(async tx=>{const a=(await tx.get('assets',retiredMedia))!,r=(await tx.find('personMedia',{assetId:retiredMedia}))[0]!;await tx.replace('assets',{...a,usageState:'RETIRED'});await tx.replace('personMedia',{...r,usageState:'RETIRED',retiredAt:f.clock.now().toISOString()});});assert.equal((await dto(gate)).canAdopt,false);assert.equal((await dto(gate)).canReject,true);
 const retiredSnapshot=await f.store.transaction(async tx=>({asset:await tx.get('assets',retiredMedia),relations:await tx.find('personMedia',{assetId:retiredMedia}),upload:await tx.get('uploads',retiredMedia)}));
 checks.push('current-membership-permission-intake-scope-recovery-switch-csrf-and-machine-boundaries','reject-refuses-mixed-adoption-input-and-corrupt-frozen-content');
 // A elapsed root may be closed while still SUBMITTED; an already EXPIRED root cannot be decided.
 const expiredAt=new Date(f.clock.now().getTime()-1000).toISOString();
 const expire=async(id:string)=>f.store.transaction(async tx=>{const s=(await tx.get('talentSubmissions',id))!;await tx.replace('talentSubmissions',{...s,expiresAt:expiredAt});for(const r of await tx.find('personMedia',{submissionId:id}))await tx.replace('personMedia',{...r,retainUntil:expiredAt});});
 await expire(deadline);const lease=await f.app.mediaPurge.claim();assert.equal(lease?.assetId,media);assert.equal((await dto(deadline)).canAdopt,false);assert.ok((await pending()).items.some((s:any)=>s.id===deadline));
 const asset=(await f.store.transaction(tx=>tx.get('assets',media)))!;await f.expect(reject(deadline));assert.equal((await f.store.transaction(tx=>tx.get('talentSubmissions',deadline)))!.expiresAt,expiredAt);assert.equal((await f.store.transaction(tx=>tx.find('personMedia',{submissionId:deadline})))[0]!.retainUntil,expiredAt);assert.deepEqual(await f.store.transaction(tx=>tx.get('mediaPurgeIntents',lease!.id)),lease);assert.deepEqual(await f.store.transaction(tx=>tx.get('assets',media)),asset);
 await f.app.mediaPurge.beginDelete(lease!);await f.app.mediaPurge.objectResult(lease!,'original','MISSING');await f.app.mediaPurge.objectResult(lease!,'preview','MISSING');await f.app.mediaPurge.finalize(lease!);assert.equal((await f.store.transaction(tx=>tx.get('assets',media)))!.state,'ERASED');
 await expire(closed);const closedLease=await f.app.mediaPurge.claim();assert.equal(closedLease?.assetId,closedMedia);await f.app.mediaPurge.beginDelete(closedLease!);assert.equal((await dto(closed)).canReject,false);await denied(reject(closed),'SUBMISSION_CLOSED');
 checks.push('rejection-never-extends-expiry-or-revives-media-and-preserves-live-purge-lease','purge-expired-submission-cannot-be-decided-again');
 const code=(await f.store.transaction(tx=>tx.find('dictionary',{workspaceId:f.w,namespace:'role',code:'model'})))[0]!,shortExpiry=new Date(f.clock.now().getTime()+86400000).toISOString();await f.store.transaction(async tx=>{const s=(await tx.get('talentSubmissions',dict))!;await tx.replace('talentSubmissions',{...s,expiresAt:shortExpiry});await tx.replace('dictionary',{...code,status:'INACTIVE'});});assert.equal((await dto(dict)).canReject,true);assert.equal((await dto(dict)).canAdopt,false);await denied(f.owner.cmd('POST',path(dict)+'/review',await f.review(dict)),'DICTIONARY_CODE_INVALID',422);await f.expect(reject(dict));assert.equal((await f.store.transaction(tx=>tx.get('talentSubmissions',dict)))!.expiresAt,shortExpiry);await f.store.transaction(tx=>tx.replace('dictionary',code));
 const principal=(await f.store.transaction(tx=>tx.get('servicePrincipals',f.principal.resourceId)))!;await f.store.transaction(tx=>tx.replace('servicePrincipals',{...principal,expiresAt:expiredAt}));assert.equal((await dto(revoked)).canReject,true);assert.equal((await dto(revoked)).canAdopt,false);await f.expect(f.machine('GET','/ingestion/submissions/'+revoked),401);await f.store.transaction(tx=>tx.replace('servicePrincipals',principal));
 await f.expect(f.owner.cmd('POST','/td2/principals/'+principal.id+'/revoke',{schemaVersion:'once-talent-v2.1.0',expectedRevision:principal.revision}));assert.equal((await dto(revoked)).canReject,true);assert.equal((await dto(revoked)).canAdopt,false);await denied(f.owner.cmd('POST',path(revoked)+'/review',await f.review(revoked)),'INGESTION_AUTHORIZATION_CHANGED');await f.expect(f.machine('GET','/ingestion/submissions/'+revoked),401);
 assert.ok((await f.expect(f.owner.raw('GET','/ingestion-review/submissions'))).items.some((s:any)=>s.id===revoked));assert.ok((await pending()).items.some((s:any)=>s.id===revoked));assert.equal((await f.expect(f.owner.raw('GET','/review/INGESTION/'+revoked))).canReject,true);const revokeKey=randomUUID(),revokeBody=await f.review(revoked,[]);await f.expect(f.owner.cmd('POST',path(revoked)+'/review',revokeBody,revokeKey));await f.expect(f.owner.cmd('POST',path(revoked)+'/review',revokeBody,revokeKey));assert.equal((await f.expect(f.owner.raw('POST','/commands/inspect',{operation:'ingestionReview.review',commandKey:revokeKey}))).found,true);await f.expect(reject(gate));assert.deepEqual(await formal(),beforeFormal);
 checks.push('retired-dictionary-and-expired-or-revoked-principal-block-adoption-not-internal-rejection','revoked-machine-read-stays-blocked-current-internal-receipt-remains-recoverable');
 assert.deepEqual(await f.store.transaction(async tx=>({asset:await tx.get('assets',retiredMedia),relations:await tx.find('personMedia',{assetId:retiredMedia}),upload:await tx.get('uploads',retiredMedia)})),retiredSnapshot);checks.push('short-future-expiry-and-retired-media-remain-unchanged-after-rejection');
 return {checks};
}
