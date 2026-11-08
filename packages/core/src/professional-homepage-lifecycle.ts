import type {Actor,Clock} from './model.ts';
import type {Tx} from './store.ts';
import type {ProfessionalHomepage} from './professional-homepage-model.ts';
import type {DeletionItem,DeletionTargetKind} from './deletion-model.ts';
import {digest} from './json.ts';
import {scopeVisible} from './policy.ts';
import {invariant} from './errors.ts';
import {touch} from './helpers.ts';

async function affected(tx:Tx,workspaceId:string,kind:string,id:string){
 const people=new Set([id,...(kind==='PERSON'?(await tx.find('personAliases',{workspaceId,canonicalPersonId:id})).map(a=>a.oldPersonId):[])]);
 return (await tx.find('professionalHomepages',{workspaceId})).filter(h=>h.state!=='ERASED'&&(kind==='PERSON'&&people.has(h.personId)||kind==='SOURCE'&&h.sourceIds.includes(id)||kind==='WORK'&&h.workIds.includes(id)||kind==='ASSET'&&h.assetIds.includes(id)));
}
async function snapshot(tx:Tx,h:ProfessionalHomepage){return {homepage:h,versions:(await tx.find('homepageVersions',{workspaceId:h.workspaceId,homepageId:h.id})).sort((a,b)=>a.id.localeCompare(b.id))};}
const fingerprint=(p:Awaited<ReturnType<typeof snapshot>>)=>'HOMEPAGE_'+digest(p);
async function visible(tx:Tx,actor:Actor,h:ProfessionalHomepage){
 const p=await tx.get('people',h.personId);if(!p||!await scopeVisible(tx,actor,p.scopeId))return false;
 for(const id of h.sourceIds){const s=await tx.get('sources',id);if(!s||!await scopeVisible(tx,actor,s.scopeId))return false;}
 for(const id of h.workIds){const w=await tx.get('works',id);if(!w||!await scopeVisible(tx,actor,w.scopeId))return false;}
 return true;
}
export async function homepageImpacts(tx:Tx,actor:Actor,kind:DeletionTargetKind,id:string){
 const items:Array<{resourceKind:string;resourceId:string;dependencyKind:string;proposedAction:'ERASE_PAYLOAD';evidenceState:'REVIEW_REQUIRED';detailCode:string}>=[],unresolved:string[]=[];
 for(const h of await affected(tx,actor.workspaceId,kind,id)){if(!await visible(tx,actor,h)){unresolved.push('HIDDEN_PROFESSIONAL_HOMEPAGE');continue;}items.push({resourceKind:'professionalHomepage',resourceId:h.id,dependencyKind:'HOMEPAGE_DRAFT_AND_ALL_PUBLIC_VERSIONS',proposedAction:'ERASE_PAYLOAD',evidenceState:'REVIEW_REQUIRED',detailCode:fingerprint(await snapshot(tx,h))});}
 return {items,unresolved};
}
export async function checkHomepageErasure(tx:Tx,actor:Actor,items:DeletionItem[]){for(const i of items.filter(i=>i.resourceKind==='professionalHomepage')){const h=await tx.get('professionalHomepages',i.resourceId);invariant(h&&h.workspaceId===actor.workspaceId&&h.state!=='ERASED'&&await visible(tx,actor,h)&&i.decision==='APPLY_PROPOSED'&&i.detailCode===fingerprint(await snapshot(tx,h)),'HOMEPAGE_ERASURE_PLAN_CHANGED','主页草稿或发布版本已变化，请重新评估删除计划',409);}}
export async function eraseHomepage(tx:Tx,actor:Actor,i:DeletionItem,clock:Clock){
 await checkHomepageErasure(tx,actor,[i]);const h=(await tx.get('professionalHomepages',i.resourceId))!;
 // Remove the live pointer before erasing immutable version ciphertexts.
 await tx.replace('professionalHomepages',{...touch(h,clock),state:'ERASED',draftCiphertext:null,currentVersionId:null});
 for(const v of await tx.find('homepageVersions',{workspaceId:h.workspaceId,homepageId:h.id})){
  const c=await tx.get('talentConsents',v.consentId);if(c&&c.state==='ACTIVE')await tx.replace('talentConsents',{...touch(c,clock),state:'REVOKED',revokedAt:clock.now().toISOString()});
  if(v.state!=='ERASED')await tx.replace('homepageVersions',{...touch(v,clock),state:'ERASED',contentCiphertext:null});
 }
}
export async function assertHomepageErasureClean(tx:Tx,workspaceId:string,kind:string,id:string){invariant(!(await affected(tx,workspaceId,kind,id)).length,'HOMEPAGE_CLEANUP_INCOMPLETE','个人主页及历史版本尚未清理，请重新评估删除依赖',409);}
export async function quarantineHomepages(tx:Tx,workspaceId:string,clock:Clock){
 for(const h of await tx.find('professionalHomepages',{workspaceId}))if(h.state==='PUBLISHED')await tx.replace('professionalHomepages',{...touch(h,clock),state:'UNPUBLISHED',currentVersionId:null});
 for(const v of await tx.find('homepageVersions',{workspaceId}))if(v.state==='PUBLISHED')await tx.replace('homepageVersions',{...touch(v,clock),state:'REVOKED'});
}
