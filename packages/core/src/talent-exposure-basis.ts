import type {Clock,Source} from './model.ts';
import type {Tx} from './store.ts';
import {missing} from './errors.ts';
/** Legacy employee Sources retain their original policy. Consent/review-backed Sources
 * also require a live typed basis; a stale manifest never substitutes for this check. */
export async function requireExposureBasis(tx:Tx,s:Source,clock:Clock,fields?:string[]){
 if(s.internalUseUntil==null)return;
 const bases=await tx.find('sourceUseBases',{workspaceId:s.workspaceId,sourceId:s.id,purpose:'INTERNAL_DIRECTORY',state:'ACTIVE'});
 for(const b of bases){if(Date.parse(b.validUntil)<=clock.now().getTime()||fields&&!fields.some(f=>b.fieldScope.includes(f)))continue;
  if(b.importedBasis)return;
  if(b.basisKind==='INTERNAL_REVIEW'&&b.reviewerId&&b.submissionId&&b.sourceAttributionId&&b.reviewBasis?.trim())return;
  if((b.basisKind??'TALENT_CONSENT')==='TALENT_CONSENT'&&b.consentId){const c=await tx.get('talentConsents',b.consentId);if(c&&c.workspaceId===s.workspaceId&&c.state==='ACTIVE'&&c.revision===b.consentRevision&&Date.parse(c.validUntil)>clock.now().getTime())return;}
 }
 missing();
}
