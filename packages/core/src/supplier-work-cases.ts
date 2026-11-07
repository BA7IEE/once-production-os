import type {Clock,Config,Person,Source} from './model.ts';
import type {Work,WorkCredit} from './production-model.ts';
import type {TalentActor} from './talent-auth-model.ts';
import type {TalentSubmissionItem} from './talent-maintenance-model.ts';
import type {Tx} from './store.ts';
import {base,workspaceRow} from './helpers.ts';
import {invariant} from './errors.ts';
import {workPlanSchema} from './work-case-schema.ts';
import {talentFormalAsset} from './media-collections.ts';

/** Creates a new, explicitly self-declared case. Shared works and other people's
 * credits are never rewritten by a supplier profile confirmation. */
export async function applySupplierWork(tx:Tx,actor:TalentActor,person:Person,source:Source,item:TalentSubmissionItem,clock:Clock,config:Config){
 const p=workPlanSchema.parse(item.values);
 invariant(p.mode==='CREATE_EXTERNAL_WORK'&&!p.targetWorkId,'SUPPLIER_NEW_WORK_REQUIRED','此入口只新建本人作品案例，关联已有共同作品请由 ONCE 整理',409);
 const role=p.personRoleId?await workspaceRow(tx,'personRoles',p.personRoleId,actor.workspaceId):(await tx.find('personRoles',{workspaceId:actor.workspaceId,personId:person.id,roleCode:p.declaredRoleCode!,status:'ACTIVE'}))[0];
 invariant(role?.personId===person.id&&role.status==='ACTIVE','WORK_ROLE_REQUIRED','请先在本人资料中选择作品对应职业',422);
 let work:Work={...base(actor.workspaceId,clock),sourceId:source.id,scopeId:person.scopeId,maintainerId:person.maintainerId,
  title:p.title.trim(),description:p.description,caseDate:p.caseDate,datePrecision:p.datePrecision,location:p.location,brandDisplayName:p.brandDisplayName,
  industryCode:p.industryCode,workTypeCodes:p.workTypeCodes,origin:'EXTERNAL',originNote:'供应商本人声明并确认；来源 '+source.id,status:'ACTIVE',coverEntryId:null};
 await tx.insert('works',work);
 const credit:WorkCredit={...base(actor.workspaceId,clock),workId:work.id,personId:person.id,personRoleId:role.id,sourceId:source.id,roleCode:role.roleCode,note:p.creditNote};await tx.insert('workCredits',credit);
 for(const [position,ref] of p.items.entries()){
  const {asset,relation}=await talentFormalAsset(tx,actor,ref.assetId,clock,config);
  invariant(relation.personId===person.id&&(!relation.personRoleId||relation.personRoleId===role.id),'WORK_ASSET_OWNER','作品素材不属于本人的对应职业',409);
  const entry={...base(actor.workspaceId,clock),workId:work.id,assetId:asset.id,position};await tx.insert('workAssets',entry);
  if(p.coverAssetId===asset.id){invariant(asset.mime.startsWith('image/'),'WORK_COVER_INVALID','封面须为图片',422);work={...work,coverEntryId:entry.id};}
 }
 await tx.replace('works',work);return {work,credit};
}
