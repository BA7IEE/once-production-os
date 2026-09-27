import {test} from 'node:test';
import {fixture} from '../support/fixtures.ts';
import {roundTripErasedHistory} from '../support/merge-erasure-transfer.ts';
test('TD2 v14 export and rebuild explicitly preserve historical erasure without restoring deleted profiles or old identity payload',async()=>{await roundTripErasedHistory(await fixture(),await fixture());});


test('TD2 v14 rejects incomplete erasure lineage, payload resurrection, fabricated reason or old format before writes',async()=>{
 const {default:assert}=await import('node:assert/strict');const {randomUUID}=await import('node:crypto');
 const {exportErasedHistory}=await import('../support/merge-erasure-transfer.ts');const {JsonRebuild}=await import('../../packages/core/src/rebuild.ts');
 const t=await exportErasedHistory(await fixture()),target=await fixture(),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
 for(const mode of ['no-person-marker','no-profile-marker','duplicate','person-payload','profile-resurrection','reason-payload','reason-flag','future-time','origin','old-version','wrong-source','wrong-profile-parent']){
  const payload=structuredClone(t.download.payload),b=payload.manifest.talent,h=b.mergeHistory;
  if(mode==='no-person-marker')h.erasures=h.erasures.filter((e:any)=>e.recordKind!=='PERSON');
  if(mode==='no-profile-marker')h.erasures=h.erasures.filter((e:any)=>e.recordKind!=='TALENT_PROFILE');
  if(mode==='duplicate')h.erasures.push({...h.erasures[0],id:randomUUID()});
  if(mode==='person-payload')h.people[0].displayName='must not resurrect';
  if(mode==='profile-resurrection'){const e=h.erasures.find((e:any)=>e.recordKind==='TALENT_PROFILE');h.talentProfiles.push({...b.tables.talentProfiles[0],id:e.recordId,personId:e.personId,supersededById:e.supersededById});}
  if(mode==='reason-payload')h.decisions[0].decisionManifest.reason='must not resurrect';
  if(mode==='reason-flag')delete h.decisions[0].reasonErasedAt;
  if(mode==='future-time')h.erasures[0].recordUpdatedAt='2099-01-01T00:00:00.000Z';
  if(mode==='origin')delete h.erasures[0].origin;
  if(mode==='old-version')b.schemaVersion='once-talent-transfer-v11';
  if(mode==='wrong-source')h.erasures.find((e:any)=>e.recordKind==='PERSON').sourceId=payload.manifest.people[0].sourceId;
  if(mode==='wrong-profile-parent')h.erasures.find((e:any)=>e.recordKind==='TALENT_PROFILE').supersededById=randomUUID();
  await assert.rejects(target.store.transaction(tx=>rebuild.apply(tx,actor,payload,{requestId:randomUUID(),ip:'test'})),undefined,mode);
  assert.equal(target.store.rows('people').length,0);assert.equal(target.store.rows('sources').length,0);assert.equal(target.store.rows('mergeHistoryErasures').length,0);
 }
});
