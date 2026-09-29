import {test} from 'node:test';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture} from '../support/fixtures.ts';
import {verifyCombinedSourceErasure} from '../support/talent-source-combined-erasure.ts';
test('TD2 combined source cleanup retains independently supported facts and collection, erases role and shared originals with atomic audit rollback',async()=>{
 const root=await mkdtemp(join(await realpath(tmpdir()),'once-combined-source-'));
 try{await verifyCombinedSourceErasure(await fixture(),root);}finally{await rm(root,{recursive:true,force:true});}
});
test('TD2 combined source plan refuses retained proof pointing at an original scheduled for erasure',async()=>{
 const {default:assert}=await import('node:assert/strict');const {seedSharedProof}=await import('../support/talent-asset-erasure.ts');const {seedSourceFacts,prepareSourceFacts}=await import('../support/talent-source-fact-erasure.ts');const {expectResponse:ok}=await import('../support/talent-v2-maintenance.ts');
 const f=await fixture(),root=await mkdtemp(join(await realpath(tmpdir()),'once-combined-proof-'));
 try{
  const media=await seedSharedProof(f,root,true),s=await seedSourceFacts(f,media.g,media.mediaSourceId);
  const credentialId=ok(await f.owner.cmd('POST',`/td2/people/${s.g.personId}/credentials`,{schemaVersion:'once-talent-v2.0.0',expectedPersonRevision:(await s.g.current()).revision,sourceId:s.sourceId,sourceRevision:1,values:{credentialTypeCode:'OTHER',issuerName:'合成未核验附件',evidenceAssetId:media.assetId}})).resourceId as string;
  await s.prove('personCredentials',credentialId);
  const r=await prepareSourceFacts(f,s,[s.languageId,credentialId],5);
  const response=await f.owner.cmd('POST',`/deletion-requests/${r.requestId}/plan/freeze`,{expectedRevision:(await r.current()).revision,acknowledgePlan:true});
  assert.equal(ok(response,409).error.code,'TD2_SOURCE_RETAINED_PROOF_ERASED');assert.equal((await r.current()).state,'BLOCKED_FOR_USE');
  assert.equal((await f.store.transaction(tx=>tx.get('personCredentials',credentialId)))!.evidenceAssetId,media.assetId);await media.provider.verifyAsset((await f.store.transaction(tx=>tx.get('assets',media.assetId)))!);
 }finally{await rm(root,{recursive:true,force:true});}
});
