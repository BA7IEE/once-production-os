import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Application } from '../../packages/core/src/api.ts';
import type { Store } from '../../packages/core/src/store.ts';
import type { FakeClock, Client } from './fixtures.ts';
import { sourceInput } from './fixtures.ts';
import { seedProfessionalGraph, expectResponse as ok } from './talent-v2-maintenance.ts';
const schemaVersion='once-talent-v2.0.0';
export async function verifyTalentEvidenceHistory(app: Application, store: Store, clock: FakeClock, owner: Client) {
 const g=await seedProfessionalGraph(app,store,clock,owner);
 const second=ok(await owner.cmd('POST','/sources',{...sourceInput(),title:'合成另一份字段依据'})).resourceId as string;
 ok(await owner.cmd('POST','/td2/evidence',{schemaVersion,ownerKind:'personLanguages',ownerId:g.languageId,fieldPath:'speakingLevelCode',expectedRevision:1,sourceId:second,sourceRevision:1}),200);
 const path=`/td2/evidence?ownerKind=personLanguages&ownerId=${g.languageId}&fieldPath=speakingLevelCode`;
 const first=ok(await owner.raw('GET',path+'&page=1&pageSize=1'),200),next=ok(await owner.raw('GET',path+'&page=2&pageSize=1'),200);
 assert.equal(first.total,2);assert.equal(next.total,2);assert.notEqual(first.items[0].id,next.items[0].id);
 assert.ok([...first.items,...next.items].every(e=>e.supportsCurrentValue));assert.equal([...first.items,...next.items].filter(e=>e.review?.origin==='CURRENT').length,1);
 assert.equal(JSON.stringify(first).includes('valueDigest'),false);assert.equal(JSON.stringify(first).includes('identifierCiphertext'),false);
 ok(await owner.cmd('POST',`/sources/${second}/suspend`,{expectedRevision:1,reason:'合成依据暂停'}),200);
 const paused=ok(await owner.raw('GET',path),200).items.find((e:any)=>e.source.id===second);assert.equal(paused.supportsCurrentValue,false);assert.equal(paused.valueMatchesCurrent,true);assert.equal(paused.source.current,false);assert.equal(paused.source.revisionMatches,false);
 ok(await owner.cmd('PATCH',`/td2/languages/${g.languageId}`,{schemaVersion,expectedRevision:1,expectedPersonRevision:(await g.current()).revision,sourceId:g.sourceId,sourceRevision:1,values:{speakingLevelCode:'FLUENT'}}),200);
 const changed=ok(await owner.raw('GET',path),200);assert.equal(changed.total,3);assert.equal(changed.items.filter((e:any)=>e.supportsCurrentValue).length,1);assert.equal(changed.items.filter((e:any)=>!e.valueMatchesCurrent).length,2);
 // Synthetic imported history has a different original workspace/reviewer, never a current membership.
 const originalWorkspace=randomUUID(),originalMember=randomUUID(),reviewedAt=clock.now().toISOString();
 await store.transaction(async tx=>{const e=(await tx.find('evidence',{sourceId:second,personLanguageId:g.languageId,fieldPath:'speakingLevelCode'}))[0]!;await tx.replace('evidence',{...e,reviewerId:null,reviewedAt:null,originalReviewWorkspaceId:originalWorkspace,originalReviewMembershipId:originalMember,originalReviewedAt:reviewedAt});});
 const historical=ok(await owner.raw('GET',path),200).items.find((e:any)=>e.source.id===second);assert.deepEqual(historical.review,{origin:'ORIGINAL',workspaceId:originalWorkspace,membershipId:originalMember,reviewedAt});assert.equal(historical.supportsCurrentValue,false);
 assert.equal((await owner.raw('GET',`/td2/evidence?ownerKind=personCredentials&ownerId=${g.credentialId}&fieldPath=identifierCiphertext`)).status,422);
 assert.equal((await owner.raw('GET',path+'&unexpected=true')).status,400);
 assert.equal((await owner.raw('GET',`/td2/evidence?ownerKind=constructor&ownerId=${g.languageId}&fieldPath=name`)).status,400);
 const machine=await app.handle({method:'GET',url:'/api/v1'+path,ip:'192.0.2.200',body:'',headers:{authorization:'Bearer '+g.token}});assert.equal(machine.status,403);
 return {g,second,path};
}
