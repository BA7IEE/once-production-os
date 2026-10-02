import type {Actor,Clock,Config,Person,Source} from './model.ts';
import type {Tx} from './store.ts';
import type {MachineSubmission,TalentSubmissionItem} from './talent-maintenance-model.ts';
import {agentCollectionSchema,agentWorkSchema,IngestionSchemas} from './ingestion-schema.ts';
import type {Parsed} from './validation.ts';
import {invariant,AppError} from './errors.ts';
import {digest} from './json.ts';
import {touch,workspaceRow} from './helpers.ts';
import {sourceCurrent,deletionBlocked,sourceFor} from './policy.ts';
import {periodCurrent,asRow,td2PersonFor} from './talent-v2-graph.ts';
import {collectionMime,applyCollection} from './media-collections.ts';
import {validateCaseDate,applyWorkCase} from './talent-work-cases.ts';
import {workFor} from './production-policy.ts';
import {checkMachineMediaItem} from './media-adoption.ts';
type Review=Parsed<typeof IngestionSchemas.review>;
type Candidate=Pick<TalentSubmissionItem,'clientItemKey'|'kind'|'values'|'dependsOn'>;
const structure=(i:Candidate)=>i.kind==='COLLECTION'?agentCollectionSchema.parse(i.values):agentWorkSchema.parse(i.values);
const ordered=<T extends {id:string}>(rows:T[])=>rows.sort((a,b)=>a.id.localeCompare(b.id));
/** No formal IDs enter candidate values. All references resolve within this exact batch. */
export async function checkStructures(tx:Tx,s:MachineSubmission,items:Candidate[],clock:Clock,config:Config){
 const collections=items.filter(i=>i.kind==='COLLECTION'),works=items.filter(i=>i.kind==='WORK');
 invariant(collections.length<=20&&works.length<=10,'STRUCTURE_ITEM_LIMIT','本批最多20个集合和10个案例',422);
 const identities=new Set<string>();
 for(const item of [...collections,...works]){
  invariant(item.clientItemKey.length<=64,'STRUCTURE_KEY_INVALID','集合和案例键最多64字符',422);
  const p=structure(item),role=items.find(i=>i.clientItemKey===p.roleCandidateKey);
  invariant(p.title.trim().length>0,'TITLE_REQUIRED','请填写明确的集合或案例标题',422);
  invariant(role?.kind==='ROLE','STRUCTURE_ROLE_REQUIRED','集合和案例必须引用本批职业候选',422);
  const keys=p.items.map(i=>i.mediaCandidateKey),deps=[p.roleCandidateKey,...keys];
  invariant(new Set(keys).size===keys.length&&new Set(item.dependsOn).size===item.dependsOn.length&&item.dependsOn.length===deps.length&&deps.every(k=>item.dependsOn.includes(k)),'STRUCTURE_DEPENDENCY_INVALID','依赖须完整且精确包含本批职业和全部素材',422);
  invariant(!p.coverMediaCandidateKey||keys.includes(p.coverMediaCandidateKey),'STRUCTURE_COVER_INVALID','封面须属于本批素材位置',422);
  if(item.kind==='COLLECTION'){
   const c=agentCollectionSchema.parse(item.values),identity=c.roleCandidateKey+':'+c.collectionTypeCode;
   invariant(!identities.has(identity),'DUPLICATE_COLLECTION_IDENTITY','同批集合职业和类型不能重复',422);identities.add(identity);
   invariant(new Set(c.tagCodes).size===c.tagCodes.length,'DUPLICATE_CODE','标签不能重复',422);
   invariant(!['MODEL_CARD','POLAROIDS'].includes(c.collectionTypeCode)||role.values.roleCode==='model','MODEL_ROLE_REQUIRED','模卡和素颜照须绑定模特职业',422);
  }else {
   const w=agentWorkSchema.parse(item.values);validateCaseDate(w);
   for(const [namespace,codes] of [['industry',w.industryCode?[w.industryCode]:[]],['workType',w.workTypeCodes]] as const){invariant(new Set(codes).size===codes.length,'DUPLICATE_CODE','案例类型不能重复',422);for(const code of codes)invariant((await tx.find('dictionary',{workspaceId:s.workspaceId,namespace,code,status:'ACTIVE'})).length>0,'DICTIONARY_CODE_INVALID','案例行业或类型不可用',422);}
  }
  for(const ref of p.items){
   const media=items.find(i=>i.clientItemKey===ref.mediaCandidateKey);invariant(media?.kind==='MEDIA','STRUCTURE_MEDIA_REQUIRED','只能引用本批 worker 已建立的素材候选',422);
   const {a,d}=await checkMachineMediaItem(tx,s,media,clock,config);
   invariant(d.roleCandidateKey===p.roleCandidateKey,'STRUCTURE_MEDIA_ROLE_INVALID','素材和集合/案例须使用同一明确职业',422);
   const type=item.kind==='COLLECTION'?agentCollectionSchema.parse(item.values).collectionTypeCode:'PORTFOLIO';
   invariant(collectionMime(type,a.mime),'COLLECTION_MIME_INVALID','素材类型不符合该集合或案例',422);
   if(ref.mediaCandidateKey===p.coverMediaCandidateKey)invariant(a.mime.startsWith('image/'),'COLLECTION_COVER_INVALID','封面须为图片',422);
  }
 }
}
async function sourceSnapshot(tx:Tx,w:string,ids:Set<string>,clock:Clock){const out=[];for(const id of [...ids].sort()){const s=await workspaceRow(tx,'sources',id,w),scope=s?await workspaceRow(tx,'scopes',s.scopeId,w):null;out.push({source:s,scope,current:!!s&&sourceCurrent(s,clock),blocked:await deletionBlocked(tx,w,'SOURCE',id),bases:ordered(await tx.find('sourceUseBases',{workspaceId:w,sourceId:id}))});}return out;}
async function collectionSnapshot(tx:Tx,w:string,id:string,clock:Clock){const row=await workspaceRow(tx,'mediaCollections',id,w);if(!row)return null;const tags=ordered(await tx.find('mediaCollectionTags',{workspaceId:w,collectionId:id})),placements=ordered(await tx.find('mediaCollectionItems',{workspaceId:w,collectionId:id})),sources=new Set([row.sourceId,...tags.map(t=>t.sourceId)]);const assets=[];for(const p of placements){const a=await workspaceRow(tx,'assets',p.assetId,w),relations=ordered(await tx.find('personMedia',{workspaceId:w,assetId:p.assetId}));if(a?.sourceId)sources.add(a.sourceId);for(const r of relations)if(r.sourceId)sources.add(r.sourceId);assets.push({asset:a,relations});}
 return digest({row,tags,placements,assets,sources:await sourceSnapshot(tx,w,sources,clock)});}
async function workSnapshot(tx:Tx,w:string,id:string,clock:Clock){const row=await workspaceRow(tx,'works',id,w);if(!row)return null;const assets=ordered(await tx.find('workAssets',{workspaceId:w,workId:id})),credits=ordered(await tx.find('workCredits',{workspaceId:w,workId:id})),sources=new Set([row.sourceId,...credits.flatMap(c=>c.sourceId?[c.sourceId]:[])]),roles=[];for(const c of credits)if(c.personRoleId){const r=await workspaceRow(tx,'personRoles',c.personRoleId,w);roles.push(r);if(r)sources.add(r.sourceId);}
 const media=[];for(const e of assets){const asset=await workspaceRow(tx,'assets',e.assetId,w),relations=ordered(await tx.find('personMedia',{workspaceId:w,assetId:e.assetId}));if(asset?.sourceId)sources.add(asset.sourceId);for(const r of relations)if(r.sourceId)sources.add(r.sourceId);media.push({asset,relations});}
 return digest({row,scope:await workspaceRow(tx,'scopes',row.scopeId,w),assets,media,credits,roles,blocked:await deletionBlocked(tx,w,'WORK',id),sources:await sourceSnapshot(tx,w,sources,clock)});}
async function identityCollections(tx:Tx,s:MachineSubmission,item:TalentSubmissionItem,clock:Clock){if(!s.proposedPersonId)return [];const p=agentCollectionSchema.parse(item.values),roleItem=(await tx.find('talentSubmissionItems',{workspaceId:s.workspaceId,submissionId:s.id,clientItemKey:p.roleCandidateKey}))[0]!,roles=(await tx.find('personRoles',{workspaceId:s.workspaceId,personId:s.proposedPersonId,roleCode:String(roleItem.values.roleCode),status:'ACTIVE'})).filter(r=>periodCurrent(asRow(r),clock));invariant(roles.length<=1,'ROLE_REBASE_REQUIRED','目标职业存在冲突，请先内部处理',409);if(!roles.length)return [];return ordered(await tx.find('mediaCollections',{workspaceId:s.workspaceId,personId:s.proposedPersonId,personRoleId:roles[0]!.id,collectionTypeCode:p.collectionTypeCode,status:'ACTIVE'}));}
/** Private submit-time catalog: IDs/digests are never returned to MACHINE. Internal LINK may only choose a frozen target, never a later-created Work. */
export async function freezeStructures(tx:Tx,s:MachineSubmission,items:TalentSubmissionItem[],clock:Clock){
 let workCatalog:Record<string,string>={};if(items.some(i=>i.kind==='WORK')){const works=await tx.find('works',{workspaceId:s.workspaceId,status:'ACTIVE'});invariant(works.length<=1000,'WORK_BASELINE_LIMIT','工作区案例超过本批冻结上限，请联系内部人员',409);for(const w of works)workCatalog[w.id]=(await workSnapshot(tx,s.workspaceId,w.id,clock))!;}
 for(const i of items.filter(i=>['COLLECTION','WORK'].includes(i.kind))){const collections:Record<string,string>={};if(i.kind==='COLLECTION')for(const c of await identityCollections(tx,s,i,clock))collections[c.id]=(await collectionSnapshot(tx,s.workspaceId,c.id,clock))!;const next={...touch(i,clock),baseline:{version:'agent-structures-v1',...(i.kind==='WORK'?{works:workCatalog}:{collections})}};await tx.replace('talentSubmissionItems',next);}
}
export async function checkStructureReview(tx:Tx,actor:Actor,s:MachineSubmission,items:TalentSubmissionItem[],accepted:Set<string>,d:Review,clock:Clock){
 const selected=items.filter(i=>accepted.has(i.clientItemKey));
 for(const [kind,decisions] of [['COLLECTION',d.collectionDecisions??[]],['WORK',d.workDecisions??[]]] as const){const keys=selected.filter(i=>i.kind===kind).map(i=>i.clientItemKey);invariant(new Set(decisions.map(x=>x.clientItemKey)).size===decisions.length&&decisions.length===keys.length&&decisions.every(x=>keys.includes(x.clientItemKey)),'STRUCTURE_DECISION_REQUIRED','每个采纳的集合和案例须有且仅有一个明确审核决定',422);}
 for(const item of selected.filter(i=>i.kind==='COLLECTION')){
  const plan=d.collectionDecisions!.find(x=>x.clientItemKey===item.clientItemKey)!,frozen=item.baseline.collections as Record<string,string>,current=await identityCollections(tx,s,item,clock),now:Record<string,string>={};for(const c of current)now[c.id]=(await collectionSnapshot(tx,s.workspaceId,c.id,clock))!;
  invariant(item.baseline.version==='agent-structures-v1'&&digest(frozen)===digest(now),'COLLECTION_REBASE_REQUIRED','集合、素材位置、标签或来源已变化，请重新提交',409);
  invariant(!!plan.targetCollectionId===!!plan.expectedCollectionRevision,'COLLECTION_REVISION_REQUIRED','更新集合须明确指定冻结集合及版本',422);
  if(current.length){invariant(plan.targetCollectionId&&Object.hasOwn(frozen,plan.targetCollectionId),'COLLECTION_IDENTITY_EXISTS','该职业和类型已有集合，须明确更新现有版本',409);const c=current.find(c=>c.id===plan.targetCollectionId)!;invariant(c.revision===plan.expectedCollectionRevision,'COLLECTION_REBASE_REQUIRED','集合版本已变化',409);// applyCollection repeats current formal Person/Role/Source authorization.
  }else invariant(!plan.targetCollectionId,'COLLECTION_TARGET_INVALID','本批未冻结该正式集合',422);
 }
 for(const item of selected.filter(i=>i.kind==='WORK')){const p=d.workDecisions!.find(x=>x.clientItemKey===item.clientItemKey)!;invariant(p.basis.trim().length>=4,'WORK_REVIEW_BASIS_REQUIRED','每个案例须有明确审核依据',422);
  if(p.decision==='CREATE_EXTERNAL_WORK')invariant(!p.targetWorkId&&!p.expectedWorkRevision,'WORK_DECISION_INVALID','新建外部案例不能指定正式目标',422);
  else {invariant(p.targetWorkId&&p.expectedWorkRevision,'WORK_TARGET_REQUIRED','关联须选择明确案例及版本',422);const catalog=item.baseline.works as Record<string,string>|undefined;invariant(item.baseline.version==='agent-structures-v1'&&catalog&&Object.hasOwn(catalog,p.targetWorkId)&&catalog[p.targetWorkId]===await workSnapshot(tx,s.workspaceId,p.targetWorkId,clock),'WORK_REBASE_REQUIRED','案例事实、来源、封面、素材或署名已变化，请重新提交',409);const w=await workFor(tx,actor,p.targetWorkId,clock);invariant(w.status==='ACTIVE'&&w.revision===p.expectedWorkRevision,'WORK_REBASE_REQUIRED','案例当前版本已变化',409);}
 }
}
export async function applyStructures(tx:Tx,actor:Actor,person:Person,source:Source,items:TalentSubmissionItem[],d:Review,applied:Map<string,string>,clock:Clock,config:Config){
 const roleId=(key:string)=>{const id=applied.get(key);invariant(id,'ROLE_ADOPTION_REQUIRED','依赖职业未采纳',409);return id;};const assetId=(key:string)=>{const id=applied.get(key);invariant(id,'MEDIA_ADOPTION_REQUIRED','依赖素材未采纳',409);return id;};
 for(const item of items.filter(i=>i.kind==='COLLECTION')){const p=agentCollectionSchema.parse(item.values),decision=d.collectionDecisions!.find(x=>x.clientItemKey===item.clientItemKey)!;const c=await applyCollection(tx,actor,person,source,{...decision,personRoleId:roleId(p.roleCandidateKey),collectionTypeCode:p.collectionTypeCode,title:p.title,isCurrent:p.isCurrent,coverAssetId:p.coverMediaCandidateKey?assetId(p.coverMediaCandidateKey):null,tagCodes:p.tagCodes,items:p.items.map(i=>({referenceKind:'EXISTING_ADOPTED_ASSET_REFERENCE',assetId:assetId(i.mediaCandidateKey),caption:i.caption,featured:i.featured}))},clock,config);applied.set(item.clientItemKey,c.id);}
 for(const item of items.filter(i=>i.kind==='WORK')){const p=agentWorkSchema.parse(item.values),decision=d.workDecisions!.find(x=>x.clientItemKey===item.clientItemKey)!;const {roleCandidateKey:_,coverMediaCandidateKey:__,items:___,...facts}=p;const outcome=await applyWorkCase(tx,actor,person,source,{...item,baseline:{},values:{...facts,clientItemKey:item.clientItemKey,mode:decision.decision,targetWorkId:null,expectedWorkRevision:null,personRoleId:roleId(p.roleCandidateKey),declaredRoleCode:null,coverAssetId:p.coverMediaCandidateKey?assetId(p.coverMediaCandidateKey):null,items:p.items.map(i=>({referenceKind:'EXISTING_ADOPTED_ASSET_REFERENCE',assetId:assetId(i.mediaCandidateKey)}))}},{...decision,decision:decision.decision==='CREATE_EXTERNAL_WORK'?'CREATE_NEW':'LINK_EXISTING'},clock,'外部 Agent 声明外部案例，经内部审核；完整依据见正式来源 '+source.id);applied.set(item.clientItemKey,outcome.work.id);}
}
export async function structureReviewOptions(tx:Tx,actor:Actor,s:MachineSubmission,items:TalentSubmissionItem[],clock:Clock){const collections:Array<{clientItemKey:string;id:string;title:string;revision:number}>=[],works:Array<{id:string;title:string;revision:number}>=[];if(!actor.permissions.includes('records.read'))return {collections,works};for(const i of items.filter(i=>i.kind==='COLLECTION'))for(const c of await identityCollections(tx,s,i,clock)){try{await td2PersonFor(tx,actor,c.personId);await sourceFor(tx,actor,c.sourceId,clock,false);if(c.personRoleId){const role=await workspaceRow(tx,'personRoles',c.personRoleId,s.workspaceId);if(!role||role.personId!==c.personId||role.status!=='ACTIVE'||!periodCurrent(asRow(role),clock))continue;await sourceFor(tx,actor,role.sourceId,clock);}collections.push({clientItemKey:i.clientItemKey,id:c.id,title:c.title,revision:c.revision});}catch(e){if(!(e instanceof AppError&&[403,404].includes(e.status)))throw e;}}
 const ids=new Set(items.filter(i=>i.kind==='WORK').flatMap(i=>Object.keys(i.baseline.works as Record<string,string>??{})));for(const id of ids)try{const w=await workFor(tx,actor,id,clock);if(w.status!=='ACTIVE')continue;works.push({id:w.id,title:w.title,revision:w.revision});}catch(e){if(!(e instanceof AppError&&[403,404].includes(e.status)))throw e;}
 return {collections,works};}
