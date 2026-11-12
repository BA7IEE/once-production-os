import type {Actor,Clock,Config} from './model.ts';
import type {Tx} from './store.ts';
import type {DeletionItem,DeletionTargetKind} from './deletion-model.ts';
import type {SupplierInboxMaterial,SupplierInboxBatch} from './supplier-inbox-model.ts';
import {scopeVisible,requireScope,sourceFor} from './policy.ts';
import {digest} from './json.ts';
import {invariant} from './errors.ts';
import {SupplierInbox} from './supplier-inbox.ts';

const fingerprint=(m:SupplierInboxMaterial,b:SupplierInboxBatch)=>'INBOX_'+digest({id:m.id,batchId:b.id,sourceId:b.sourceId,scopeId:b.scopeId,sourceRevision:b.sourceRevision,scopeRevision:b.scopeRevision,ciphertext:m.ciphertext,personIds:m.personIds,workIds:m.workIds,assetIds:m.assetIds});
export async function inboxErasureImpacts(tx:Tx,actor:Actor,kind:DeletionTargetKind,id:string){
 const batches=await tx.find('supplierInboxBatches',{workspaceId:actor.workspaceId}),items=[],unresolved=[];
 const people=new Set([id,...(kind==='PERSON'?(await tx.find('personAliases',{workspaceId:actor.workspaceId,canonicalPersonId:id})).map(a=>a.oldPersonId):[])]);
 for(const m of await tx.find('supplierInboxMaterials',{workspaceId:actor.workspaceId})){
  const b=batches.find(b=>b.id===m.batchId);if(!b||m.state==='ERASED'||!(kind==='SOURCE'&&b.sourceId===id||kind==='PERSON'&&m.personIds.some(p=>people.has(p))||kind==='WORK'&&m.workIds.includes(id)||kind==='ASSET'&&m.assetIds.includes(id)))continue;
  const source=await tx.get('sources',b.sourceId);
  if(!await scopeVisible(tx,actor,b.scopeId)||!source||!await scopeVisible(tx,actor,source.scopeId)){unresolved.push('HIDDEN_SUPPLIER_INBOX_DEPENDENCY');continue;}
  items.push({resourceKind:'supplierInboxMaterial',resourceId:m.id,dependencyKind:'SUPPLIER_INBOX_DERIVATIVE',proposedAction:'ERASE_PAYLOAD' as const,evidenceState:'REVIEW_REQUIRED' as const,detailCode:fingerprint(m,b)});
 }return {items,unresolved};
}
export async function assertInboxFinalizationClean(tx:Tx,workspaceId:string,kind:string,id:string){
 const people=new Set([id,...(kind==='PERSON'?(await tx.find('personAliases',{workspaceId,canonicalPersonId:id})).map(a=>a.oldPersonId):[])]);
 for(const m of await tx.find('supplierInboxMaterials',{workspaceId}))if(m.state!=='ERASED'){
  const b=kind==='SOURCE'?await tx.get('supplierInboxBatches',m.batchId):null;
  invariant(!(kind==='SOURCE'&&b?.sourceId===id||kind==='PERSON'&&m.personIds.some(p=>people.has(p))||kind==='WORK'&&m.workIds.includes(id)||kind==='ASSET'&&m.assetIds.includes(id)),'INBOX_CLEANUP_INCOMPLETE','收件派生内容尚未完成清理，请重新评估删除依赖',409);
 }
}
export async function checkInboxErasure(tx:Tx,actor:Actor,items:DeletionItem[],clock:Clock){
 for(const item of items.filter(i=>i.resourceKind==='supplierInboxMaterial')){const m=await tx.get('supplierInboxMaterials',item.resourceId),b=m?await tx.get('supplierInboxBatches',m.batchId):null;
  invariant(m&&b&&m.workspaceId===actor.workspaceId&&m.state!=='ERASED'&&item.detailCode===fingerprint(m,b),'INBOX_ERASURE_CHANGED','收件材料或主体归属已变化，请重新生成删除计划',409);
  await requireScope(tx,actor,b.scopeId);await sourceFor(tx,actor,b.sourceId,clock,false,true);
  invariant(item.decision==='APPLY_PROPOSED','INBOX_ERASURE_REQUIRED','已删除主体的收件派生内容须清理；独立原件由其来源规则单独处理',409);
 }
}
export async function eraseInboxItem(tx:Tx,actor:Actor,item:DeletionItem,clock:Clock,config:Config){await checkInboxErasure(tx,actor,[item],clock);const m=(await tx.get('supplierInboxMaterials',item.resourceId))!;await new SupplierInbox(clock,config).eraseMaterial(tx,m);}
