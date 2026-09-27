import {SOURCE_IDENTITY_EVIDENCE,identityWithdrawal,identityWithdrawalFields} from './talent-source-identity-evidence.ts';
import {validateIdentityRetention,IDENTITY_DEPENDENCY,validateIdentityDependency} from './talent-identity-retention.ts';
import {snapshotTalentSourceAssets,applyTalentAssetGraph} from './talent-asset-erasure.ts';
import type { Actor, Clock, Source, TableMap } from './model.ts';
import type { Tx } from './store.ts';
import type { DeletionItem, DeletionRequest } from './deletion-model.ts';
import { TALENT_FACT_TABLES, TALENT_OWNER_TABLES, TALENT_V2_TABLES } from './talent-v2-model.ts';
import { TD2_FACTS, type FactTable } from './talent-v2-schema.ts';
import { talentSnapshot } from './talent-v2-integrity.ts';
import { invariant } from './errors.ts';
import { digest } from './json.ts';
import { scopeVisible, sourceCurrent, deletionBlocked, requirePermission } from './policy.ts';
import { base, touch } from './helpers.ts';
import { deletionWorkerActor } from './deletion-worker-policy.ts';
type Row = {id:string;workspaceId:string;[key:string]:unknown};
export const SOURCE_FACT_GROUP='talentSourceFactGraph';
export const SOURCE_FACT_ITEM='talentSourceFact';
type Selected={table:FactTable;row:Row};
const key=(table:string,id:unknown)=>table+':'+id;
const ownerSelected=(r:Row, selected:Map<string,Selected>)=>Object.entries(TALENT_OWNER_TABLES).some(([field,table])=>selected.has(key(table,r[field])));
const parentReferences=[['personRoleId','personRoles'],['collectionId','mediaCollections'],['currentMeasurementSetId','measurementSets'],['supersedesId','measurementSets']] as const;
export async function sourceFactGraph(tx:Tx,actor:Actor,sourceId:string,clock:Clock) {
 requirePermission(actor,'records.read');
 const data=await talentSnapshot(tx,actor.workspaceId),selected=new Map<string,Selected>();
 const media=await snapshotTalentSourceAssets(tx,actor,sourceId);
 const ownedHeaders=data.people.filter(p=>p.sourceId===sourceId),ownedPeople=ownedHeaders.filter(p=>p.status!=='ERASED'),ownedIds=new Set(ownedHeaders.map(p=>p.id));
 for(const table of TALENT_FACT_TABLES)for(const row of data[table])if(row.sourceId===sourceId||ownedIds.has(String(row.personId))||(table==='representations'&&ownedIds.has(String(row.agentPersonId))))selected.set(key(table,row.id),{table,row});
 for(const record of data.evidence.filter(e=>e.sourceId===sourceId))for(const [field,table] of Object.entries(TALENT_OWNER_TABLES))if(record[field]&&TALENT_FACT_TABLES.includes(table as FactTable)){const row=data[table].find(r=>r.id===record[field]);if(row)selected.set(key(table,row.id),{table:table as FactTable,row});}
 // Expose every affected child as an explicit decision. No automatic cascade into another source's facts.
 let changed=true;
 while(changed){changed=false;for(const table of TALENT_FACT_TABLES)for(const row of data[table]){
  if(selected.has(key(table,row.id)))continue;
  if(parentReferences.some(([field,parent])=>selected.has(key(parent,row[field])))
    ||(table!=='talentProfiles'&&table!=='personLanguages'&&[...selected.values()].some(o=>o.table==='talentProfiles'&&o.row.personId===row.personId))) {
   selected.set(key(table,row.id),{table,row});changed=true;
  }
 }}
 const rows=[...selected.values()].sort((a,b)=>key(a.table,a.row.id).localeCompare(key(b.table,b.row.id)));
 const foreignIds=[...new Set(data.evidence.filter(e=>e.sourceId===sourceId&&e.personId&&!ownedIds.has(String(e.personId))).map(e=>String(e.personId)))];
 const identityWithdrawals=[];
 for(const id of foreignIds)identityWithdrawals.push(await identityWithdrawal(data,tx,actor,sourceId,id,[...new Set(data.evidence.filter(e=>e.sourceId===sourceId&&e.personId===id).map(e=>String(e.fieldPath)))].sort(),clock));
 const evidence=data.evidence.filter(e=>e.sourceId===sourceId||ownerSelected(e,selected)||ownedIds.has(String(e.personId)));
 const proposals=data.fieldProposals.filter(e=>e.sourceId===sourceId||ownerSelected(e,selected)||ownedIds.has(String(e.personId)));
 const identityDependencies:Array<{table:string;row:TableMap['contacts'|'uploads'|'workCredits'|'projectParticipants']}>=[];
 for(const table of ['contacts','uploads','workCredits','projectParticipants'] as const)for(const row of await tx.find(table,{workspaceId:actor.workspaceId}))if(ownedIds.has(String(row.personId)))identityDependencies.push({table,row});
 const collectionItems=data.mediaCollectionItems.filter(i=>selected.has(key('mediaCollections',i.collectionId)));
 const candidates=data.shortlistItems.filter(i=>selected.has(key('personRoles',i.personRoleId))||ownedIds.has(String(i.personId)));
 const lists=(await tx.find('shortlists',{workspaceId:actor.workspaceId})).filter(l=>candidates.some(c=>c.shortlistId===l.id));
 const proposalOwners=proposals.filter(p=>p.sourceId===sourceId).flatMap(p=>Object.entries(TALENT_OWNER_TABLES).flatMap(([field,table])=>data[table].filter(r=>r.id===p[field]).map(row=>({table,row}))));
 const candidateAssets=(await tx.find('shortlistItemAssets',{workspaceId:actor.workspaceId})).filter(a=>candidates.some(c=>c.id===a.itemId));
 const works=(await tx.find('works',{workspaceId:actor.workspaceId})).filter(w=>candidates.some(c=>c.workId===w.id)||identityDependencies.some(d=>'workId' in d.row&&d.row.workId===w.id));
 const projects=(await tx.find('projects',{workspaceId:actor.workspaceId})).filter(p=>identityDependencies.some(d=>'projectId' in d.row&&d.row.projectId===p.id));
 const assets=data.assets.filter(a=>ownedIds.has(String(a.personId))||candidateAssets.some(r=>r.assetId===a.id)||collectionItems.some(i=>i.assetId===a.id)||rows.some(o=>o.row.evidenceAssetId===a.id));
 const parents=[...rows.flatMap(o=>parentReferences.flatMap(([field,table])=>data[table].filter(r=>r.id===o.row[field]))),...data.talentProfiles.filter(p=>rows.some(o=>o.row.personId===p.personId))];
 const organizations=data.organizations.filter(r=>rows.some(o=>o.row.agencyOrganizationId===r.id||o.row.issuerOrganizationId===r.id));
 const reviews=data.talentMigrationReviews.filter(r=>candidates.some(c=>c.id===r.shortlistItemId)||ownedIds.has(String(r.personId)));
 const people=data.people.filter(p=>ownedIds.has(p.id)||foreignIds.includes(p.id)||rows.some(o=>o.row.personId===p.id)||proposalOwners.some(o=>(o.table==='people'?o.row.id:o.row.personId)===p.id)||rows.some(o=>o.row.agentPersonId===p.id)||assets.some(a=>a.personId===p.id));
 const sourceIds=new Set([sourceId,...rows.map(o=>o.row.sourceId),...evidence.map(e=>e.sourceId),...proposals.map(p=>p.sourceId),...people.map(p=>p.sourceId),...proposalOwners.map(o=>o.row.sourceId),...identityDependencies.flatMap(d=>'sourceId' in d.row?[d.row.sourceId]:[]),...projects.map(p=>p.sourceId),...works.map(w=>w.sourceId),...assets.map(a=>a.sourceId),...parents.map(p=>p.sourceId),...organizations.map(o=>o.sourceId)]);
 const sources=data.sources.filter(s=>sourceIds.has(s.id));
 const scopes=data.scopes.filter(s=>[...people,...sources,...lists,...works,...projects,...assets,...organizations].some(r=>r.scopeId===s.id));
 let blocker:string|null=sources.length!==sourceIds.size?'TD2_SOURCE_OWNER_MISSING':null;
 for(const withdrawal of identityWithdrawals)if(withdrawal.blocker)blocker=withdrawal.blocker;
 if(data.personAliases.some(a=>ownedIds.has(String(a.oldPersonId))||ownedIds.has(String(a.canonicalPersonId))))blocker='TD2_MERGE_HISTORY_RETENTION_REQUIRED';
 if(media.blocker)blocker=media.blocker;
 if(TALENT_V2_TABLES.some(t=>!TALENT_FACT_TABLES.includes(t as FactTable)&&t!=='fieldProposals'&&data[t].some(r=>r.sourceId===sourceId)))blocker='TD2_SOURCE_RETENTION_REVIEW_REQUIRED';
 if(rows.length>500)blocker='TD2_SOURCE_FACT_LIMIT';
 if(rows.some(o=>o.row.supersededById)||(['talentProfiles','castingProfiles'] as const).some(t=>data[t].some(r=>r.supersededById&&selected.has(key(t,r.supersededById))||r.retiredCurrentMeasurementSetId&&selected.has(key('measurementSets',r.retiredCurrentMeasurementSetId)))))blocker='TD2_MERGE_HISTORY_RETENTION_REQUIRED';
 if(rows.some(o=>o.row.identifierCiphertext)&&!actor.permissions.includes('sensitive.write'))blocker='TD2_SENSITIVE_WRITE_REQUIRED';
 for(const row of [...people,...sources,...lists,...works,...projects,...assets,...organizations])if(!await scopeVisible(tx,actor,String(row.scopeId)))blocker='TD2_HIDDEN_DEPENDENCY';
 for(const person of people)if(!(person.status==='ERASED'&&ownedIds.has(person.id))&&(person.status==='ERASED'||await deletionBlocked(tx,actor.workspaceId,'PERSON',person.id)))blocker=blocker??'TD2_SOURCE_OWNER_UNAVAILABLE';
 const graphDigest=digest({...(identityWithdrawals.length?{identityWithdrawals}:{}),ownedPeople,identityDependencies,projects,media:media.detailCode,rows,evidence,proposals,proposalOwners,collectionItems,candidates,candidateAssets,works,assets,parents,organizations,reviews,lists,
  people:people.map(p=>({id:p.id,scopeId:p.scopeId})),scopes,sources:sources.map(s=>s.id===sourceId?{id:s.id,scopeId:s.scopeId}:s)});
 return {data,media,identityWithdrawals,ownedPeople,ownedIds,reviews,selected,rows,evidence,proposals,collectionItems,candidates,lists,people,sources,blocker,
  detailCode:`TD2_SOURCE_FACT_GRAPH_${Buffer.from(graphDigest,'hex').toString('base64url')}:F${rows.length}:C${candidates.length}:I${collectionItems.length}:M${media.ownedAssets.length}:Q${media.credentials.length}:A${media.adults.length}:L${media.links.length}:H${ownedPeople.length}`};
}
function factContentDigest(row:Row){const {revision,updatedAt,...content}=row;return digest(content);}
export function sourceFactItemCode(o:Selected){return `TD2_SOURCE_FACT_${o.table}:${factContentDigest(o.row)}`;}
export function parseSourceFactItem(item:Pick<DeletionItem,'detailCode'|'resourceId'>):FactTable {
 const table=item.detailCode.split(':')[0]!.replace('TD2_SOURCE_FACT_','') as FactTable;
 invariant(TALENT_FACT_TABLES.includes(table),'TD2_SOURCE_FACT_UNREGISTERED','专业资料清理类型未登记',409);return table;
}
async function supportedRetention(tx:Tx,actor:Actor,sourceId:string,o:Selected,basisId:string,clock:Clock) {
 requirePermission(actor,'sources.review');
 invariant(!o.row.identifierCiphertext,'TD2_SOURCE_SECRET_RETENTION_REQUIRED','受限编号须先完成独立保留核验或显式清除，不能随普通事实保留',409);
 invariant(!(o.table==='adultEligibilities'&&o.row.state==='VERIFIED_ADULT')&&!(o.table==='personCredentials'&&o.row.status==='VERIFIED'),
  'TD2_VERIFIED_ORIGIN_RETENTION_REQUIRED','已核验资格的原始核验依据须另行处置，不能只按普通字段保留',409);
 const evidence=await tx.find('evidence',{workspaceId:actor.workspaceId,[TD2_FACTS[o.table].ownerKey]:o.row.id} as never);
 if(o.table==='adultEligibilities'&&o.row.originalVerificationWorkspaceId)invariant(evidence.some(e=>e.sourceId!==sourceId&&e.fieldPath==='state'&&e.valueDigest===digest('VERIFIED_ADULT')&&e.originalReviewWorkspaceId===o.row.originalVerificationWorkspaceId&&e.originalReviewMembershipId===o.row.originalVerificationMembershipId&&e.originalReviewedAt===o.row.verifiedAt),'TD2_SOURCE_VERIFICATION_HISTORY_REQUIRED','原成年核验历史必须保留，不能用其他核验归属替换',409);
 const sources=await tx.find('sources',{workspaceId:actor.workspaceId}),allowed=new Map<string,Source>();
 for(const s of sources)if(s.id!==sourceId&&sourceCurrent(s,clock)&&await scopeVisible(tx,actor,s.scopeId)&&!await deletionBlocked(tx,actor.workspaceId,'SOURCE',s.id))allowed.set(s.id,s);
 invariant(allowed.has(basisId),'RETENTION_BASIS_CHANGED','保留来源当前不可用',409);
 // Include nulls and time restrictions: deleting an unsupported bound must never extend validity.
 for(const field of Object.keys(TD2_FACTS[o.table].fields))invariant(evidence.some(e=>e.fieldPath===field&&e.valueDigest===digest(o.row[field]??null)&&allowed.get(e.sourceId)?.revision===e.sourceRevision),
  'TD2_SOURCE_FACT_BASIS_INCOMPLETE','该资料仍有字段缺少独立且匹配当前值的已登记依据，请先核验后再保留',409);
 invariant(evidence.some(e=>e.sourceId===basisId&&e.sourceRevision===allowed.get(basisId)!.revision&&e.valueDigest===digest(o.row[e.fieldPath]??null)),
  'TD2_SOURCE_FACT_BASIS_MISMATCH','所选保留来源没有登记为该资料的当前字段依据',409);
}
export async function validateSourceFactDecision(tx:Tx,actor:Actor,request:DeletionRequest,item:DeletionItem,basisId:string,clock:Clock) {
 const table=parseSourceFactItem(item),row=await tx.get(table,item.resourceId);
 invariant(row&&sourceFactItemCode({table,row:row as unknown as Row})===item.detailCode,'TD2_ERASURE_GRAPH_STALE','资料已变化，请重新检查删除计划',409);
 await supportedRetention(tx,actor,request.targetId,{table,row:row as unknown as Row},basisId,clock);
}
export async function validateSourceFactPlan(tx:Tx,actor:Actor,request:DeletionRequest,items:DeletionItem[],clock:Clock) {
 const group=items.find(i=>i.resourceKind===SOURCE_FACT_GROUP);if(!group)return;
 const g=await sourceFactGraph(tx,actor,request.targetId,clock);
 invariant(!g.blocker&&g.detailCode===group.detailCode,'TD2_ERASURE_GRAPH_STALE','专业资料或依赖发生变化，拒绝旧清理计划',409);
 const identityItems=items.filter(i=>i.resourceKind===SOURCE_IDENTITY_EVIDENCE);
 invariant(identityItems.length===g.identityWithdrawals.length&&g.identityWithdrawals.every(w=>identityItems.some(i=>i.resourceId===w.personId&&i.detailCode===w.detailCode&&i.decision==='APPLY_PROPOSED')),'TD2_SOURCE_IDENTITY_DECISIONS_INCOMPLETE','须逐项确认独立身份字段依据的撤回',409);
 const erasedPeople=new Set<string>();
 for(const person of g.ownedPeople){
  const item=items.find(i=>i.resourceKind==='person'&&i.resourceId===person.id);
  invariant(item&&item.decision!=='PENDING','TD2_SOURCE_IDENTITY_RETENTION_REQUIRED','须逐项决定人物身份的删除或有据保留',409);
  if(item.decision==='RETAIN_WITH_BASIS'){invariant(item.retentionSourceId,'RETENTION_BASIS_MISSING','身份保留依据缺失',409);await validateIdentityRetention(tx,actor,person as unknown as TableMap['people'],item.retentionSourceId,clock,item);}
  else erasedPeople.add(person.id);
 }
 for(const item of items)if(item.dependencyKind===IDENTITY_DEPENDENCY&&item.decision==='RETAIN_WITH_BASIS')await validateIdentityDependency(tx,actor,request.targetId,item,items,clock);
 const decisions=new Map(items.filter(i=>i.resourceKind===SOURCE_FACT_ITEM).map(i=>[key(parseSourceFactItem(i),i.resourceId),i]));
 invariant(decisions.size===g.rows.length,'TD2_SOURCE_DECISIONS_INCOMPLETE','专业资料决定不完整',409);
 for(const o of g.rows){const item=decisions.get(key(o.table,o.row.id));invariant(item&&item.detailCode===sourceFactItemCode(o)&&item.decision!=='PENDING','TD2_SOURCE_DECISIONS_INCOMPLETE','专业资料决定未完成',409);
  if(item.decision!=='RETAIN_WITH_BASIS')continue;
  invariant(!erasedPeople.has(String(o.row.personId))&&!erasedPeople.has(String(o.row.agentPersonId)),'TD2_SOURCE_PERSON_ERASED','不能保留归属或代表人身份已决定删除的专业资料',409);
  invariant(!g.media.ownedAssets.some(a=>a.id===o.row.evidenceAssetId),'TD2_SOURCE_RETAINED_PROOF_ERASED','不能保留仍指向本次待删除原件的证明资料，请明确删除或先完成证明失效与重新核验',409);
  invariant(!!item.retentionSourceId,'RETENTION_BASIS_MISSING','保留资料缺少独立依据',409);
  await supportedRetention(tx,actor,request.targetId,o,item.retentionSourceId,clock);
  for(const [field,parent] of parentReferences)if(g.selected.has(key(parent,o.row[field])))invariant(decisions.get(key(parent,o.row[field]))?.decision==='RETAIN_WITH_BASIS','TD2_SOURCE_PARENT_ERASED','不能保留依赖已决定删除的上级资料，请重新核对逐项决定',409);
  if(o.table!=='talentProfiles'&&o.table!=='personLanguages')for(const profile of g.rows.filter(r=>r.table==='talentProfiles'&&r.row.personId===o.row.personId))invariant(decisions.get(key(profile.table,profile.row.id))?.decision==='RETAIN_WITH_BASIS','TD2_SOURCE_PARENT_ERASED','不能删除专业主档案却保留下级专业资料',409);
 }
 return {g,decisions,erasedPeople};
}
export async function eraseSourceFacts(tx:Tx,request:DeletionRequest,item:DeletionItem,clock:Clock) {
 invariant(request.targetKind==='SOURCE'&&request.targetId===item.resourceId,'TD2_ERASURE_TARGET_INVALID','专业来源清理必须绑定来源申请',409);
 const actor=await deletionWorkerActor(tx,request),items=await tx.find('deletionItems',{workspaceId:request.workspaceId,requestId:request.id});
 const checked=await validateSourceFactPlan(tx,actor,request,items,clock);invariant(checked,'TD2_SOURCE_DECISIONS_INCOMPLETE','专业来源清理计划缺失',409);
 const {g,decisions,erasedPeople}=checked,erased=new Map([...g.selected].filter(([id])=>decisions.get(id)!.decision!=='RETAIN_WITH_BASIS'));
 invariant(g.media.ownedAssets.every(a=>items.some(i=>i.resourceKind==='asset'&&i.resourceId===a.id&&i.resolvedAction==='ERASE_PAYLOAD')),'TD2_SOURCE_MEDIA_PLAN_INCOMPLETE','联合清理缺少原件删除计划',409);
 // Both snapshots were checked before any change. Media invalidation and fact decisions share this transaction.
 await applyTalentAssetGraph(tx,actor,g.media,clock);
 for(const row of g.proposals)if(row.sourceId===request.targetId||ownerSelected(row,erased)||erasedPeople.has(String(row.personId)))await tx.remove('fieldProposals',row.id);
 for(const row of g.evidence)if(row.sourceId===request.targetId||ownerSelected(row,erased)||erasedPeople.has(String(row.personId)))await tx.remove('evidence',row.id);
 for(const row of g.collectionItems)if(erased.has(key('mediaCollections',row.collectionId))&&await tx.get('mediaCollectionItems',row.id))await tx.remove('mediaCollectionItems',row.id);
 for(const row of g.reviews)if(erasedPeople.has(String(row.personId)))await tx.remove('talentMigrationReviews',row.id);
 for(const old of g.candidates)if(erased.has(key('personRoles',old.personRoleId))){
  const row=(await tx.get('shortlistItems',old.id))!;await tx.replace('shortlistItems',{...touch(row,clock),personRoleId:null,personRoleRevision:null,roleContextState:'LEGACY_REVIEW'});
  if(!erasedPeople.has(String(row.personId))&&!(await tx.find('talentMigrationReviews',{workspaceId:request.workspaceId,shortlistItemId:row.id,reason:'SHORTLIST_ROLE_REQUIRED',state:'PENDING'})).length)await tx.insert('talentMigrationReviews',{...base(request.workspaceId,clock),personId:row.personId,shortlistItemId:row.id,previousShortlistItemIds:[],reason:'SHORTLIST_ROLE_REQUIRED',state:'PENDING',resolvedAt:null,resolvedById:null});
 }
 const order:FactTable[]=['mediaCollectionTags','mediaCollections','personCredentials','representations','translatorLanguagePairs','translatorServiceModes','adultEligibilities','castingProfiles','measurementSets','personCapabilities','talentLocations','personLanguages','personExternalRefs','personRoles','talentProfiles'];
 for(const table of order)for(const o of erased.values())if(o.table===table)await tx.remove(table,o.row.id);
 for(const p of g.people){const row=(await tx.get('people',p.id))!;await tx.replace('people',touch(row,clock));}
 for(const l of g.lists)if(g.candidates.some(c=>c.shortlistId===l.id&&erased.has(key('personRoles',c.personRoleId))))await tx.replace('shortlists',touch(l,clock));
}
/** The group performed all decisions atomically; individual plan entries only record their receipts. */
export async function assertSourceFactGroupDone(tx:Tx,request:DeletionRequest) {
 invariant((await tx.find('deletionItems',{workspaceId:request.workspaceId,requestId:request.id})).some(i=>i.resourceKind===SOURCE_FACT_GROUP&&i.cleanupState==='DONE'),
  'TD2_SOURCE_GROUP_NOT_DONE','专业资料整组清理尚未成功，不得单独处理关联项',409);
}
/** Retained origins remain historical IDs; no evidence reviewer or source is rewritten. */
export async function assertSourceFactRetentionComplete(tx:Tx,workspaceId:string,sourceId:string,clock:Clock):Promise<boolean> {
 const requests=await tx.find('deletionRequests',{workspaceId,targetKind:'SOURCE',targetId:sourceId});
 const request=requests.find(r=>r.state==='CLEANING');if(!request)return false;
 const items=await tx.find('deletionItems',{workspaceId,requestId:request.id});
 if(!items.some(i=>i.resourceKind===SOURCE_FACT_GROUP&&i.cleanupState==='DONE'))return false;
 const actor=await deletionWorkerActor(tx,request),graph=await sourceFactGraph(tx,actor,sourceId,clock);
 invariant(!graph.blocker,'TD2_CLEANUP_INCOMPLETE','保留资料或关联范围发生变化，不能完成来源清理',409);
 for(const item of items)if(item.decision==='RETAIN_WITH_BASIS'){const basis=graph.data.sources.find(s=>s.id===item.retentionSourceId);invariant(basis&&basis.revision===item.retentionSourceRevision&&basis.protectionEpoch===item.retentionSourceProtectionEpoch&&sourceCurrent(basis as unknown as Source,clock)&&await scopeVisible(tx,actor,String(basis.scopeId))&&!await deletionBlocked(tx,workspaceId,'SOURCE',basis.id),'RETENTION_BASIS_CHANGED','保留依据已变化，不能完成来源清理',409);}
 const data=graph.data;
 for(const item of items.filter(i=>i.resourceKind===SOURCE_IDENTITY_EVIDENCE)){const w=await identityWithdrawal(data,tx,actor,sourceId,item.resourceId,identityWithdrawalFields(item),clock);invariant(!w.blocker&&item.cleanupState==='DONE'&&w.detailCode===item.detailCode,'TD2_IDENTITY_RETENTION_CHANGED','身份字段或保留依据已经变化，不能完成来源清理',409);}
 for(const item of items)if(item.dependencyKind===IDENTITY_DEPENDENCY&&item.decision==='RETAIN_WITH_BASIS')await validateIdentityDependency(tx,actor,sourceId,item,items,clock);
 for(const person of data.people.filter(p=>p.sourceId===sourceId&&p.status!=='ERASED')){
  const item=items.find(i=>i.resourceKind==='person'&&i.resourceId===person.id);
  invariant(item?.decision==='RETAIN_WITH_BASIS'&&item.cleanupState==='DONE'&&item.retentionSourceId,'TD2_CLEANUP_INCOMPLETE','人物身份尚未完成独立依据保留处置',409);
  await validateIdentityRetention(tx,actor,person as unknown as TableMap['people'],item.retentionSourceId,clock,item);
 }
 invariant(!data.evidence.some(e=>e.sourceId===sourceId)&&!data.fieldProposals.some(p=>p.sourceId===sourceId),'TD2_CLEANUP_INCOMPLETE','来源字段证据或建议仍未清理',409);
 for(const table of TALENT_V2_TABLES)for(const row of data[table])if(row.sourceId===sourceId){
  invariant(TALENT_FACT_TABLES.includes(table as FactTable),'TD2_CLEANUP_INCOMPLETE','存在未登记来源清理关系',409);
  const o={table:table as FactTable,row},item=items.find(i=>i.resourceKind===SOURCE_FACT_ITEM&&i.resourceId===row.id&&parseSourceFactItem(i)===table);
  invariant(item?.decision==='RETAIN_WITH_BASIS'&&item.cleanupState==='DONE'&&item.detailCode===sourceFactItemCode(o)&&item.retentionSourceId,'TD2_CLEANUP_INCOMPLETE','仍有未经独立依据确认的来源资料',409);
  await supportedRetention(tx,actor,sourceId,o,item.retentionSourceId,clock);
 }
 return true;
}
