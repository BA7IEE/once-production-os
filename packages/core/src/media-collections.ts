import {mediaConsentVersion} from './media-validation.ts';
import {requireMediaExposure} from './talent-media-exposure.ts';
import {syncMediaRetention} from './media-adoption.ts';
import type {Actor,Clock,Config,Person,Source} from './model.ts';
import type {MediaCollection} from './talent-v2-model.ts';
import type {MediaAsset} from './media-model.ts';
import type {TalentActor} from './talent-auth-model.ts';
import type {TalentSubmission,TalentSubmissionItem} from './talent-maintenance-model.ts';
import {TalentV2} from './talent-v2.ts';
import type {Tx} from './store.ts';
import {v,uuid,revision,type Parsed} from './validation.ts';
import {base,touch,cas,workspaceRow} from './helpers.ts';
import {invariant,missing} from './errors.ts';
import {sourceFor,sourceCurrent,deletionBlocked,requirePermission} from './policy.ts';
import {mediaUsage} from './media-model.ts';
import {adoptedMediaFor,talentUploadContext} from './media-ownership.ts';
import {TalentMaintenance} from './talent-maintenance.ts';
import {td2PersonFor,periodCurrent} from './talent-v2-graph.ts';
import {digest} from './json.ts';
export const COLLECTION_TYPES=['MODEL_CARD','POLAROIDS','PORTFOLIO','SHOWREEL','INTRO_VIDEO','OTHER'] as const;
/** Versioned product catalog. Historical tags remain readable; authoring checks ACTIVE. */
export const COLLECTION_TAG_CATALOG=Object.freeze({version:'collection-tags-v1',entries:['FASHION','BEAUTY','COMMERCIAL','LINGERIE','RUNWAY','LIFESTYLE','INDUSTRIAL','PRODUCT'].map(code=>({code,status:'ACTIVE'}))});
const item=v.object({referenceKind:v.enum(['SUBMISSION_STAGED_ASSET','EXISTING_ADOPTED_ASSET_REFERENCE']),assetId:uuid,caption:v.string(1000),featured:v.boolean()});
export const collectionPlanSchema=v.object({clientItemKey:v.string(64,1,/^[A-Za-z0-9_-]+$/),targetCollectionId:v.nullable(uuid),expectedCollectionRevision:v.nullable(revision),personRoleId:v.nullable(uuid),collectionTypeCode:v.enum(COLLECTION_TYPES),title:v.string(200,1),isCurrent:v.boolean(),coverAssetId:v.nullable(uuid),tagCodes:v.array(v.enum(['FASHION','BEAUTY','COMMERCIAL','LINGERIE','RUNWAY','LIFESTYLE','INDUSTRIAL','PRODUCT']),8),items:v.array(item,200)});
export type CollectionPlan=Parsed<typeof collectionPlanSchema>;
export const CollectionSchemas={draft:v.object({expectedRevision:revision,collections:v.array(collectionPlanSchema,10)}),save:v.object({schemaVersion:v.enum(['once-talent-v2.1.0']),expectedPersonRevision:revision,sourceId:uuid,sourceRevision:revision,collection:collectionPlanSchema})};
export function compatibleCollectionRole(collectionRole:string|null,assetRole:string|null){return assetRole===null||assetRole===collectionRole;}
export function collectionMime(type:string,mime:string){return type==='MODEL_CARD'?mime.startsWith('image/')||mime==='application/pdf':type==='POLAROIDS'?mime.startsWith('image/'):['SHOWREEL','INTRO_VIDEO'].includes(type)?mime==='video/mp4':mime.startsWith('image/')||mime==='video/mp4';}
export function assertCollectionTags(codes:readonly string[],catalog:ReadonlyArray<{code:string;status:string}>=COLLECTION_TAG_CATALOG.entries){invariant(new Set(codes).size===codes.length&&codes.every(code=>catalog.some(t=>t.code===code&&t.status==='ACTIVE')),'COLLECTION_TAG_INVALID','内容标签重复、未知或已停用',422);}
function shape(plan:CollectionPlan){invariant(new Set(plan.items.map(i=>i.assetId)).size===plan.items.length,'COLLECTION_ASSET_EXISTS','同一集合不能重复引用素材',422);assertCollectionTags(plan.tagCodes);invariant(!plan.coverAssetId||plan.items.some(i=>i.assetId===plan.coverAssetId),'COLLECTION_COVER_INVALID','封面必须属于本集合',422);invariant(!!plan.targetCollectionId===!!plan.expectedCollectionRevision,'COLLECTION_REVISION_REQUIRED','修改已有集合须携带其版本',422);}
export async function collectionAssetFor(tx:Tx,actor:Actor,collection:Pick<MediaCollection,'personId'|'personRoleId'|'collectionTypeCode'>,id:string,clock:Clock,bindInternal=false){
 requirePermission(actor,'assets.read');const a=await workspaceRow(tx,'assets',id,actor.workspaceId);if(!a||a.state!=='READY')missing();await adoptedMediaFor(tx,actor,a,clock);
 let r=(await tx.find('personMedia',{workspaceId:actor.workspaceId,assetId:id,usageState:'ADOPTED'}))[0];
 if(!r&&bindInternal&&a.sourceId&&!a.personId){const u=await tx.get('uploads',a.uploadId);invariant(u&&(u.contextKind??'INTERNAL_SOURCE')==='INTERNAL_SOURCE'&&(u.principalKind??'INTERNAL')==='INTERNAL','COLLECTION_ASSET_OWNER','素材没有正式归属',422);r={...base(actor.workspaceId,clock),personId:collection.personId,personRoleId:null,assetId:a.id,sourceId:a.sourceId,submissionId:null,usageState:'ADOPTED',purpose:'SUBMITTED_MATERIAL',protectionEpoch:1,retainUntil:null,retiredAt:null,purgedAt:null};await tx.insert('personMedia',r);}
 // Frozen INTERNAL_SOURCE records retain their exact, existing Person ownership. They are not a wildcard by source.
 invariant((r?.personId??a.personId)===collection.personId&&compatibleCollectionRole(collection.personRoleId,r?.personRoleId??null),'COLLECTION_ASSET_OWNER','素材不属于当前人物或职业',422);
 invariant(collectionMime(collection.collectionTypeCode,a.mime),'COLLECTION_MEDIA_TYPE','该类型集合不接受此文件格式',422);return a;
}
async function currentSource(tx:Tx,workspaceId:string,id:string,clock:Clock){const s=await workspaceRow(tx,'sources',id,workspaceId);if(!s||!sourceCurrent(s,clock)||await deletionBlocked(tx,workspaceId,'SOURCE',id))missing();return s;}
/** Talent authority comes from the current account and grant, never an invented Membership. */
export async function talentFormalAsset(tx:Tx,actor:TalentActor,id:string,clock:Clock,config:Config){
 const m=new TalentMaintenance(clock,config);await m.account(tx,actor.workspaceId,actor.talentAccountId);const a=await workspaceRow(tx,'assets',id,actor.workspaceId);
 if(!a||a.state!=='READY'||mediaUsage(a)!=='ADOPTED'||await deletionBlocked(tx,actor.workspaceId,'ASSET',id))missing();
 const r=(await tx.find('personMedia',{workspaceId:actor.workspaceId,assetId:id,usageState:'ADOPTED'}))[0];
 if(r?(!r.personId||!r.sourceId||r.retiredAt||r.purgedAt):(!a.personId||!a.sourceId))missing();
 const relation=r??{personId:a.personId!,personRoleId:null,sourceId:a.sourceId!};
 await requireMediaExposure(tx,actor,relation.personId!,'mediaAsset',id,clock,config);
 return {asset:a,relation};
}

export async function validateCollectionDraft(tx:Tx,s:TalentSubmission,plan:CollectionPlan,clock:Clock,config:Config){
 shape(plan);const consent=await tx.get('talentConsents',s.consentId);invariant(consent?.state==='ACTIVE'&&mediaConsentVersion(consent.textVersion)&&consent.fieldScope.includes('media')&&consent.validUntil>clock.now().toISOString(),'MEDIA_CONSENT_REQUIRED','请先明确同意本批媒体内部使用',409);const actor:TalentActor={actorKind:'TALENT',workspaceId:s.workspaceId,talentAccountId:s.talentAccountId,sessionId:'',sessionEpoch:0};
 await new TalentMaintenance(clock,config).submissionAccess(tx,actor,s.id,true);
 if(plan.personRoleId){const role=await workspaceRow(tx,'personRoles',plan.personRoleId,s.workspaceId);if(!s.personId||!role||role.personId!==s.personId||role.status!=='ACTIVE'||!periodCurrent(role as unknown as Record<string,unknown>,clock))missing();await currentSource(tx,s.workspaceId,role.sourceId,clock);}
 if(plan.targetCollectionId){const c=await workspaceRow(tx,'mediaCollections',plan.targetCollectionId,s.workspaceId);if(!c||c.personId!==s.personId||c.personRoleId!==plan.personRoleId)missing();cas(c,plan.expectedCollectionRevision!);invariant(c.collectionTypeCode===plan.collectionTypeCode,'COLLECTION_IDENTITY_CONFLICT','集合类型不能修改，请新建集合',409);await requireMediaExposure(tx,actor,c.personId,'mediaCollection',c.id,clock,config);}
 const dependencies:string[]=[];
 for(const ref of plan.items){let a:MediaAsset;
  if(ref.referenceKind==='EXISTING_ADOPTED_ASSET_REFERENCE'){invariant(!!s.personId,'ENROLL_EXISTING_ASSET_DENIED','未绑定申请只能使用本次新上传素材',422);const f=await talentFormalAsset(tx,actor,ref.assetId,clock,config);invariant(f.relation.personId===s.personId&&compatibleCollectionRole(plan.personRoleId,f.relation.personRoleId),'COLLECTION_ASSET_OWNER','素材人物或职业不匹配',422);a=f.asset;}
  else {const asset=await workspaceRow(tx,'assets',ref.assetId,s.workspaceId),u=asset?await tx.get('uploads',asset.uploadId):null;
   invariant(asset&&u&&asset.state==='READY'&&mediaUsage(asset)==='STAGED'&&u.submissionId===s.id&&u.talentAccountId===s.talentAccountId&&compatibleCollectionRole(plan.personRoleId,u.personRoleId??null),'COLLECTION_STAGED_OWNER','只可选择本次提交内已就绪的素材',422);await talentUploadContext(tx,{...actor,sessionEpoch:u.actorEpoch},u,clock,config,false);a=asset;
   const child=(await tx.find('talentSubmissionItems',{workspaceId:s.workspaceId,submissionId:s.id,kind:'MEDIA'})).find(i=>i.values.assetId===a.id);invariant(child,'COLLECTION_STAGED_OWNER','素材审核条目不存在',409);dependencies.push(child.clientItemKey);
  }
  invariant(collectionMime(plan.collectionTypeCode,a.mime),'COLLECTION_MEDIA_TYPE','集合类型与文件格式不匹配',422);
  if(plan.coverAssetId===a.id)invariant(a.mime.startsWith('image/'),'COLLECTION_COVER_INVALID','请明确选择一张照片作为封面，PDF不自动生成封面',422);
 }
 return dependencies;
}
/** Applies after media adoption in the SAME review transaction. Bytes/upload attribution never change. */
export async function applyCollection(tx:Tx,actor:Actor,p:Person,source:Source,plan:CollectionPlan,clock:Clock,config:Config){
 shape(plan);let old=plan.targetCollectionId?await workspaceRow(tx,'mediaCollections',plan.targetCollectionId,actor.workspaceId):null;
 if(plan.targetCollectionId){if(!old||old.personId!==p.id||old.personRoleId!==plan.personRoleId)missing();cas(old,plan.expectedCollectionRevision!);invariant(old.collectionTypeCode===plan.collectionTypeCode,'COLLECTION_IDENTITY_CONFLICT','集合类型不能修改，请新建集合',409);await sourceFor(tx,actor,old.sourceId,clock);}
 if(plan.personRoleId){const r=await workspaceRow(tx,'personRoles',plan.personRoleId,actor.workspaceId);invariant(r&&r.personId===p.id&&r.status==='ACTIVE'&&periodCurrent(r as unknown as Record<string,unknown>,clock),'COLLECTION_ROLE_INVALID','当前职业不可用',409);await sourceFor(tx,actor,r.sourceId,clock);}
 const row:MediaCollection={...(old?touch(old,clock):base(actor.workspaceId,clock)),personId:p.id,sourceId:source.id,personRoleId:plan.personRoleId,collectionTypeCode:plan.collectionTypeCode,title:plan.title,status:'ACTIVE',coverAssetId:plan.coverAssetId,isCurrent:plan.isCurrent};
 for(const item of plan.items){const a=await collectionAssetFor(tx,actor,row,item.assetId,clock,true);if(item.assetId===plan.coverAssetId)invariant(a.mime.startsWith('image/'),'COLLECTION_COVER_INVALID','封面须为图片',422);}
 if(plan.isCurrent)for(const other of await tx.find('mediaCollections',{workspaceId:actor.workspaceId,personId:p.id,personRoleId:plan.personRoleId,collectionTypeCode:plan.collectionTypeCode}))if(other.id!==row.id&&other.isCurrent){await sourceFor(tx,actor,other.sourceId,clock,false);const next={...touch(other,clock),isCurrent:false};await tx.replace('mediaCollections',next);const basis=source;await new TalentV2(clock,config).evidenceFor(tx,actor,'mediaCollections',next as unknown as Record<string,unknown>,['isCurrent'],basis.id,basis.revision,true);}
 const before=old?await tx.find('mediaCollectionItems',{workspaceId:actor.workspaceId,collectionId:old.id}):[];for(const i of before)if(!plan.items.some(r=>r.assetId===i.assetId))await collectionAssetFor(tx,actor,old!,i.assetId,clock);
 if(old)await tx.replace('mediaCollections',row);else await tx.insert('mediaCollections',row);
 for(const i of before)if(!plan.items.some(r=>r.assetId===i.assetId))await tx.remove('mediaCollectionItems',i.id);
 for(const [orderIndex,i] of plan.items.entries()){const previous=before.find(r=>r.assetId===i.assetId);const value={...(previous?touch(previous,clock):base(actor.workspaceId,clock)),personId:p.id,collectionId:row.id,assetId:i.assetId,orderIndex,caption:i.caption,featured:i.featured};if(previous)await tx.replace('mediaCollectionItems',value);else await tx.insert('mediaCollectionItems',value);}
 const tags=await tx.find('mediaCollectionTags',{workspaceId:actor.workspaceId,collectionId:row.id});
 for(const code of new Set([...tags.map(t=>t.tagCode),...plan.tagCodes])){const previous=tags.find(t=>t.tagCode===code),status=plan.tagCodes.includes(code as CollectionPlan['tagCodes'][number])?'ACTIVE' as const:'ARCHIVED' as const;const tag={...(previous?touch(previous,clock):base(actor.workspaceId,clock)),personId:p.id,collectionId:row.id,sourceId:source.id,tagCode:code,status};if(previous)await tx.replace('mediaCollectionTags',tag);else await tx.insert('mediaCollectionTags',tag);await new TalentV2(clock,config).evidenceFor(tx,actor,'mediaCollectionTags',tag,['tagCode','status'],source.id,source.revision,true);}await new TalentV2(clock,config).evidenceFor(tx,actor,'mediaCollections',row as unknown as Record<string,unknown>,['personRoleId','collectionTypeCode','title','status','coverAssetId','isCurrent'],source.id,source.revision,true);
 return row;
}
export async function saveInternalCollection(tx:Tx,actor:Actor,personId:string,input:unknown,clock:Clock,config:Config){requirePermission(actor,'records.write');invariant(actor.actorKind!=='MACHINE','HUMAN_REVIEW_REQUIRED','集合整理需内部人员操作',403);const d=CollectionSchemas.save.parse(input);invariant(d.collection.items.every(i=>i.referenceKind==='EXISTING_ADOPTED_ASSET_REFERENCE'),'COLLECTION_REFERENCE_KIND','正式集合只接受已采纳素材引用',422);const p=await td2PersonFor(tx,actor,personId);cas(p,d.expectedPersonRevision);const source=await sourceFor(tx,actor,d.sourceId,clock);cas(source,d.sourceRevision);invariant(!source.internalUseUntil,'TALENT_BASIS_SCOPED','内部新增材料须选用独立内部来源',409);const row=await applyCollection(tx,actor,p,source,d.collection,clock,config);await tx.replace('people',touch(p,clock));return row;}
export async function saveCollectionDrafts(tx:Tx,actor:TalentActor,id:string,input:unknown,clock:Clock,config:Config){const d=CollectionSchemas.draft.parse(input),s=await new TalentMaintenance(clock,config).submissionAccess(tx,actor,id,true);cas(s,d.expectedRevision);invariant(s.state==='DRAFT','SUBMISSION_IMMUTABLE','提交后不能修改集合',409);invariant(new Set(d.collections.map(c=>c.clientItemKey)).size===d.collections.length,'DUPLICATE_ITEM','集合条目键不能重复',422);invariant(new Set(d.collections.filter(c=>c.targetCollectionId).map(c=>c.targetCollectionId)).size===d.collections.filter(c=>c.targetCollectionId).length,'DUPLICATE_COLLECTION','同一集合只能有一个修改方案',422);invariant(new Set(d.collections.filter(c=>c.isCurrent).map(c=>(c.personRoleId??'person')+':'+c.collectionTypeCode)).size===d.collections.filter(c=>c.isCurrent).length,'COLLECTION_CURRENT_CONFLICT','同一职业和类型只能指定一个当前版本',422);const previous=await tx.find('talentSubmissionItems',{workspaceId:s.workspaceId,submissionId:id});const plans=[];for(const plan of d.collections){invariant(!previous.some(i=>i.kind!=='COLLECTION'&&i.clientItemKey===plan.clientItemKey),'DUPLICATE_ITEM','条目键已使用',422);plans.push({plan,dependsOn:await validateCollectionDraft(tx,s,plan,clock,config)});}
 for(const i of previous.filter(i=>i.kind==='COLLECTION'))await tx.remove('talentSubmissionItems',i.id);
 for(const {plan,dependsOn} of plans){const old=plan.targetCollectionId?await tx.get('mediaCollections',plan.targetCollectionId):null;await tx.insert('talentSubmissionItems',{...base(s.workspaceId,clock),submissionId:id,clientItemKey:plan.clientItemKey,kind:'COLLECTION',targetId:plan.targetCollectionId,values:plan,baseline:old?{collectionRevision:old.revision,collectionDigest:digest(old)}:{},dependencyGroup:plan.clientItemKey,dependsOn,state:'PENDING',appliedId:null});}
 const next={...touch(s,clock),expiresAt:new Date(clock.now().getTime()+90*86400000).toISOString()};await tx.replace('talentSubmissions',next);await syncMediaRetention(tx,next,clock);return next;
}
export function submissionCollectionPlan(i:TalentSubmissionItem){return collectionPlanSchema.parse(i.values);}
export async function portalCollections(tx:Tx,actor:TalentActor,personId:string,clock:Clock,config:Config){
 const m=new TalentMaintenance(clock,config);const profile=await m.profile(tx,actor,personId),collections=[],assets:Array<{id:string;fileName:string;mime:string;personRoleId:string|null}>=[];
 const grant=(await tx.get('talentAccessGrants',profile.grantId))!;
 for(const id of new Set(grant.selfExposureManifest.filter(e=>e.kind==='mediaAsset').map(e=>e.targetId)))try{const {asset,relation}=await talentFormalAsset(tx,actor,id,clock,config);if(relation.personId===personId)assets.push({id:asset.id,fileName:asset.fileName,mime:asset.mime,personRoleId:relation.personRoleId});}catch(e){if((e as {status?:number}).status!==404)throw e;}
 for(const c of await tx.find('mediaCollections',{workspaceId:actor.workspaceId,personId,status:'ACTIVE'})){
  try{await requireMediaExposure(tx,actor,personId,'mediaCollection',c.id,clock,config);if(c.personRoleId){const r=await tx.get('personRoles',c.personRoleId);if(!r||r.status!=='ACTIVE'||!periodCurrent(r as unknown as Record<string,unknown>,clock))continue;await currentSource(tx,actor.workspaceId,r.sourceId,clock);}}catch(e){if((e as {status?:number}).status===404)continue;throw e;}
  const rows=await tx.find('mediaCollectionItems',{workspaceId:actor.workspaceId,collectionId:c.id});const items=rows.filter(i=>assets.some(a=>a.id===i.assetId)).sort((a,b)=>a.orderIndex-b.orderIndex).map(i=>({id:i.id,assetId:i.assetId,caption:i.caption,featured:i.featured,orderIndex:i.orderIndex,asset:assets.find(a=>a.id===i.assetId)}));
  const tagCodes=[];for(const t of (await tx.find('mediaCollectionTags',{workspaceId:actor.workspaceId,collectionId:c.id})).filter(t=>t.status!=='ARCHIVED'))try{await currentSource(tx,actor.workspaceId,t.sourceId,clock);tagCodes.push(t.tagCode);}catch(e){if((e as {status?:number}).status!==404)throw e;}
  collections.push({id:c.id,revision:c.revision,title:c.title,personRoleId:c.personRoleId,collectionTypeCode:c.collectionTypeCode,isCurrent:c.isCurrent??false,coverAssetId:items.some(i=>i.assetId===c.coverAssetId)?c.coverAssetId:null,tagCodes,items});
 }
 const roles=[];for(const r of await tx.find('personRoles',{workspaceId:actor.workspaceId,personId,status:'ACTIVE'}))try{if(!periodCurrent(r as unknown as Record<string,unknown>,clock))continue;await currentSource(tx,actor.workspaceId,r.sourceId,clock);roles.push({id:r.id,roleCode:r.roleCode});}catch(e){if((e as {status?:number}).status!==404)throw e;}
 return {personId,grantId:profile.grantId,collections,assets,roles};
}
