import type {Clock} from './model.ts';
import type {Tx} from './store.ts';
import {invariant} from './errors.ts';
import {workspaceRow} from './helpers.ts';
import {SUPPLIER_CONSENT_VERSION} from './supplier-profile-schema.ts';
export const WORK_CONSENT_VERSION='internal-directory-media-work-2026-10-v1';
export const isWorkConsentVersion=(version:string)=>version===WORK_CONSENT_VERSION||version===SUPPLIER_CONSENT_VERSION;
export async function requireWorkConsent(tx:Tx,workspaceId:string,accountId:string,consentId:string|undefined,personId:string|null,clock:Clock){
 const c=consentId?await workspaceRow(tx,'talentConsents',consentId,workspaceId):null;
 invariant(c&&c.talentAccountId===accountId&&c.personId===personId&&c.purpose==='INTERNAL_DIRECTORY'&&c.state==='ACTIVE'&&isWorkConsentVersion(c.textVersion)&&c.fieldScope.includes('work')&&c.fieldScope.includes('media')&&Date.parse(c.validUntil)>clock.now().getTime(),'WORK_CONSENT_REQUIRED','请明确同意本批媒体及作品案例事实用于内部人才目录',409);
 return c;
}
