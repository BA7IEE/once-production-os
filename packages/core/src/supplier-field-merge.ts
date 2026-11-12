import type {Actor,Clock,Config} from './model.ts';
import type {Tx} from './store.ts';
import type {SupplierFact} from './supplier-field-model.ts';
import type {TalentMergeConflict,TalentConflictDecision} from './talent-v2-merge.ts';
import {supplierFieldSnapshot,supplierFieldScopeBlocker} from './supplier-field-lifecycle.ts';
import {SupplierProfessional} from './supplier-professional.ts';
import {publishedCatalog} from './supplier-field-catalog.ts';
import {sourceFor,requirePermission} from './policy.ts';
import {decryptDraftPayload,encryptDraftPayload} from './private-draft-payload.ts';
import {touch} from './helpers.ts';
import {invariant,AppError} from './errors.ts';

const context=(r:SupplierFact)=>`supplier-fact:${r.workspaceId}:${r.personId}:${r.id}`;
/** Facts retain UUID, group, source, original confirmation and retired history.
 * Conflicting exact-role graphs remain blocked until a dedicated rebinding decision exists. */
export async function scanSupplierMerge(tx:Tx,actor:Actor,clock:Clock,config:Config,canonicalId:string,duplicateId:string){
 const snapshot=await supplierFieldSnapshot(tx,actor.workspaceId,[canonicalId,duplicateId]),blockers:string[]=[],conflicts:TalentMergeConflict[]=[];
 const hidden=await supplierFieldScopeBlocker(tx,actor,snapshot);if(hidden)blockers.push('SUPPLIER_FIELD_HIDDEN_DEPENDENCY');
 if(snapshot.facts.length){requirePermission(actor,'sensitive.read');requirePermission(actor,'sensitive.write');}
 if(snapshot.count>1000)blockers.push('SUPPLIER_FIELD_MERGE_LIMIT');
 for(const id of new Set(snapshot.facts.map(r=>r.sourceId)))try{const source=await sourceFor(tx,actor,id,clock);if(snapshot.facts.some(f=>f.sourceId===id&&f.sourceRevision!==source.revision))blockers.push('SUPPLIER_FIELD_HIDDEN_DEPENDENCY');}catch(e){if(e instanceof AppError&&e.status===404)blockers.push('SUPPLIER_FIELD_HIDDEN_DEPENDENCY');else throw e;}
 const roles=await tx.findIn('personRoles',actor.workspaceId,'personId',[canonicalId,duplicateId]);
 for(const fact of snapshot.facts)if(fact.personRoleId){const r=roles.find(r=>r.id===fact.personRoleId);if(!r||r.personId!==fact.personId||r.roleCode!==fact.roleCode)blockers.push('SUPPLIER_FIELD_ROLE_INVALID');
  if(roles.some(a=>a.personId!==r?.personId&&a.roleCode===r?.roleCode&&a.status==='ACTIVE'&&r?.status==='ACTIVE'&&(!a.validFrom||!r.validUntil||a.validFrom<r.validUntil)&&(!r.validFrom||!a.validUntil||r.validFrom<a.validUntil)))blockers.push('SUPPLIER_FIELD_ROLE_REBIND_REVIEW_REQUIRED');}
 const pro=new SupplierProfessional(clock,config);
 for(const a of snapshot.facts.filter(r=>r.personId===canonicalId&&r.recordKey==='single'&&r.status==='ACTIVE'))for(const b of snapshot.facts.filter(r=>r.personId===duplicateId&&r.recordKey==='single'&&r.status==='ACTIVE'&&r.roleCode===a.roleCode&&r.fieldCode===a.fieldCode)){
  const field=(await publishedCatalog(tx,actor.workspaceId,a.catalogVersion)).definition.fields.find(f=>f.code===a.fieldCode)!;
  const value=async(r:SupplierFact)=>({field:(await publishedCatalog(tx,actor.workspaceId,r.catalogVersion)).definition.fields.find(f=>f.code===r.fieldCode)!,roleCode:r.roleCode,sourceId:r.sourceId,sourceTitle:(await sourceFor(tx,actor,r.sourceId,clock)).title,catalogVersion:r.catalogVersion,answer:await pro.answer(tx,r,snapshot.facts)});
  conflicts.push({table:'supplierFacts',canonicalId:a.id,duplicateId:b.id,code:'SUPPLIER_FIELD_VALUE_REVIEW_REQUIRED',choices:['KEEP_CANONICAL_ACTIVE','KEEP_DUPLICATE_ACTIVE'],canonicalValue:await value(a),duplicateValue:await value(b),dependentCount:snapshot.facts.filter(r=>r.setId===a.id||r.setId===b.id).length});
 }
 return {snapshot,conflicts,blockers:[...new Set(blockers)],items:snapshot.facts.filter(r=>r.personId===duplicateId).map(r=>({table:'supplierFacts',id:r.id,revision:r.revision,action:'MOVE' as const}))};
}
export async function applySupplierMerge(tx:Tx,actor:Actor,clock:Clock,config:Config,plan:Awaited<ReturnType<typeof scanSupplierMerge>>,canonicalId:string,duplicateId:string,decisions:TalentConflictDecision[],mergeDecisionId:string){
 invariant(!plan.blockers.length,'MERGE_BLOCKED','专业扩展事实仍有待核对依赖',409);
 const pro=new SupplierProfessional(clock,config);
 for(const c of plan.conflicts){const d=decisions.find(d=>d.table==='supplierFacts'&&d.canonicalId===c.canonicalId&&d.duplicateId===c.duplicateId);invariant(d&&c.choices.includes(d.choice),'SUPPLIER_FIELD_CONFLICT_REQUIRED','请逐项决定人物专业字段冲突',422);const root=await tx.get('supplierFacts',d.choice==='KEEP_CANONICAL_ACTIVE'?c.duplicateId:c.canonicalId);invariant(root,'MERGE_PREVIEW_STALE','专业事实已变化',409);await pro.retire(tx,root);}
 const ids:string[]=[];
 for(const old of plan.snapshot.facts.filter(r=>r.personId===duplicateId)){const row=(await tx.get('supplierFacts',old.id))!;const next={...touch(row,clock),personId:canonicalId,mergeDecisionId};
  if(row.textCiphertext)next.textCiphertext=encryptDraftPayload(decryptDraftPayload(row.textCiphertext,config.contactKey,context(row)),config.contactKey,context(next));
  await tx.replace('supplierFacts',next);ids.push(row.id);
 }
 return ids;
}
