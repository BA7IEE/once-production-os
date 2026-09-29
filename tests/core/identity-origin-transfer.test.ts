import {test} from 'node:test';
import {fixture} from '../support/fixtures.ts';
import {roundTripRetainedIdentity} from '../support/identity-origin-transfer.ts';
test('TD2 v13 identity export and rebuild preserve erased origin and current independent proof',async()=>{await roundTripRetainedIdentity(await fixture(),await fixture());});

test('TD2 v13 rebuild rejects missing, stale or forged identity provenance before any writes',async()=>{
 const {default:assert}=await import('node:assert/strict');const {randomUUID}=await import('node:crypto');
 const {exportRetainedIdentity}=await import('../support/identity-origin-transfer.ts');const {JsonRebuild}=await import('../../packages/core/src/rebuild.ts');
 const t=await exportRetainedIdentity(await fixture()),target=await fixture(),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
 for(const mode of ['field','evidence','digest','revision','expiry','live-origin','payload','collision','old-version','legacy-field']){
  const payload=structuredClone(t.download.payload),bundle=payload.manifest.talent;
  if(mode==='field')delete payload.manifest.people[0].data.aliases;
  if(mode==='evidence')bundle.identityEvidence=bundle.identityEvidence.filter((e:any)=>e.fieldPath!=='intro');
  if(mode==='digest')bundle.identityEvidence[0].valueDigest='a'.repeat(64);
  if(mode==='revision')bundle.identityEvidence[0].sourceRevision++;
  if(mode==='expiry')payload.manifest.sources[0].data.validUntil='2026-09-23T07:59:00.000Z';
  if(mode==='live-origin')bundle.retainedOrigins[0].status='CONFIRMED';
  if(mode==='payload')bundle.retainedOrigins[0].providerClaim='must not restore erased text';
  if(mode==='collision')bundle.retainedOrigins[0].id=payload.manifest.sources[0].id;
  if(mode==='old-version')bundle.schemaVersion='once-talent-transfer-v12';
  if(mode==='legacy-field')payload.manifest.people[0].data.roles=['model'];
  await assert.rejects(target.store.transaction(tx=>rebuild.apply(tx,actor,payload,{requestId:randomUUID(),ip:'test'})),undefined,mode);
  assert.equal(target.store.rows('sources').length,0);assert.equal(target.store.rows('people').length,0);
 }
});

test('TD2 retained identity permissions and command replays recheck the independent basis',async()=>{
 const {default:assert}=await import('node:assert/strict');const {exportRetainedIdentity}=await import('../support/identity-origin-transfer.ts');
 const f=await fixture(),t=await exportRetainedIdentity(f);
 const without={...t.personPermitInput};delete (without as any).retentionBasisSourceId;assert.equal((await f.owner.cmd('POST','/use-permissions',without)).status,404);
 assert.equal((await f.owner.cmd('POST','/use-permissions',{...t.personPermitInput,subjectKind:'SOURCE',subjectId:t.person.basisId,sourceId:t.person.basisId})).status,422);
 assert.equal((await f.owner.cmd('POST','/exports',t.input)).status,202);
 const basis=f.store.rows('sources').find(s=>s.id===t.person.basisId)!;
 assert.equal((await f.owner.cmd('POST',`/sources/${basis.id}/suspend`,{expectedRevision:basis.revision,reason:'合成保留身份独立依据暂停'})).status,200);
 assert.equal((await f.owner.raw('POST',`/exports/${t.jobId}/download`,{})).status,409);
 assert.equal((await f.owner.cmd('POST','/use-permissions',t.personPermitInput,t.personPermitKey)).status,404);
 assert.equal((await f.owner.raw('GET','/use-permissions')).status,200);
 assert.equal((await f.owner.cmd('POST',`/use-permissions/${t.personPermission}/revoke`,{expectedRevision:1})).status,200);
});

test('TD2 v13 jointly rebuilds retained identity and its typed professional records from the same erased origin',async()=>{await roundTripRetainedIdentity(await fixture(),await fixture(),undefined,true);});
