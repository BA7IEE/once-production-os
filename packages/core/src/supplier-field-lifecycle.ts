import type {Actor,Clock} from './model.ts';
import type {Tx} from './store.ts';
import {digest} from './json.ts';
import {scopeVisible} from './policy.ts';
import {touch} from './helpers.ts';
export async function supplierFieldSnapshot(tx:Tx,workspaceId:string,personIds?:string[],sourceId?:string,roleIds:string[]=[]){
 const facts=(await tx.find('supplierFacts',{workspaceId})).filter(r=>(!personIds&&!sourceId&&!roleIds.length)||personIds?.includes(r.personId)||r.sourceId===sourceId||!!r.personRoleId&&roleIds.includes(r.personRoleId)).sort((a,b)=>a.id.localeCompare(b.id));
 const choices=(await tx.findIn('supplierFactChoices',workspaceId,'factId',facts.map(r=>r.id))).sort((a,b)=>a.id.localeCompare(b.id));return {facts,choices,digest:digest({facts,choices}),count:facts.length+choices.length};
}
export async function supplierFieldScopeBlocker(tx:Tx,actor:Actor,snapshot:Awaited<ReturnType<typeof supplierFieldSnapshot>>){
 for(const fact of snapshot.facts){const source=await tx.get('sources',fact.sourceId),person=await tx.get('people',fact.personId);
  if(!source||!person||source.workspaceId!==actor.workspaceId||person.workspaceId!==actor.workspaceId||!await scopeVisible(tx,actor,source.scopeId)||!await scopeVisible(tx,actor,person.scopeId))return 'SUPPLIER_FIELD_HIDDEN_DEPENDENCY';}return null;
}
export async function eraseSupplierFields(tx:Tx,workspaceId:string,personIds:string[]=[],sourceId?:string){
 const snapshot=await supplierFieldSnapshot(tx,workspaceId,personIds,sourceId);for(const c of snapshot.choices)await tx.remove('supplierFactChoices',c.id);for(const f of snapshot.facts)await tx.remove('supplierFacts',f.id);
 // Remove exact exposures with their values. No grants are transferred or widened.
 const ids=new Set(snapshot.facts.map(f=>f.id));for(const grant of await tx.find('talentAccessGrants',{workspaceId}))if(grant.selfExposureManifest.some(e=>e.kind==='supplierField'&&ids.has(e.targetId)))await tx.replace('talentAccessGrants',{...grant,selfExposureManifest:grant.selfExposureManifest.filter(e=>e.kind!=='supplierField'||!ids.has(e.targetId))});
}
export async function detachSupplierRoles(tx:Tx,workspaceId:string,roleIds:string[],clock:Clock){for(const f of await tx.findIn('supplierFacts',workspaceId,'personRoleId',roleIds))await tx.replace('supplierFacts',{...touch(f,clock),personRoleId:null});}
