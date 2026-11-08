import type {Actor,Clock} from './model.ts';
import type {Tx} from './store.ts';
import type {loadTalentGraph} from './talent-v2-graph.ts';
import {publishedCatalog} from './supplier-field-catalog.ts';
import {readyAsset} from './production-policy.ts';
import {AppError} from './errors.ts';

export interface DirectoryRoleSummary {personRoleId:string;roleCode:string;works:Array<{id:string;title:string;workTypeCodes:string[];coverAssetId:string|null}>;capabilities:Array<{code:string;label:string;levelCode:string|null}>;tags:string[]}
/** Only the current page is enriched. An exact role, current source and real fact
 * back each summary; this projection never invents experience or a match score. */
export async function supplierRoleSummaries(tx:Tx,actor:Actor,clock:Clock,g:Awaited<ReturnType<typeof loadTalentGraph>>,items:Record<string,unknown>[],filters:{industryCodes?:string[];workTypeCodes?:string[]}={}):Promise<Array<Record<string,unknown>&{roleSummaries:DirectoryRoleSummary[]}>>{
 const peopleIds=items.map(p=>String(p.id)),roleIds=items.flatMap(p=>p.matchingRoleIds as string[]??[]),sourceIds=g.visibility.visibleSourceIds.filter(id=>g.sourceUsable(id)),catalog=await publishedCatalog(tx,actor.workspaceId);
 const tagMap=new Map<string,string[]>();
 if(roleIds.length)for(const field of catalog.definition.fields.filter(f=>f.owner==='ROLE'&&['CODE','CODE_SET'].includes(f.type)&&f.searchable)){
  const roots=await tx.supplierFieldRoots({workspaceId:actor.workspaceId,personIds:peopleIds,roleIds,sourceIds,fieldCode:field.code,visibility:field.visibility,owner:'ROLE'});
  if(roots.length>50000)continue;
  const selected=roots.filter(f=>f.valueState==='KNOWN').slice(0,300),choices=await tx.findIn('supplierFactChoices',actor.workspaceId,'factId',selected.filter(r=>r.valueType==='CODE_SET').map(r=>r.id));
  for(const r of selected){const codes=r.valueType==='CODE_SET'?choices.filter(c=>c.factId===r.id).map(c=>c.code):r.codeValue?[r.codeValue]:[],labels=codes.map(code=>field.options?.find(o=>o.code===code)?.label).filter((s):s is string=>!!s),key=r.personRoleId!;
   if(!labels.length)continue;const tags=tagMap.get(key)??[],tag=field.label+'：'+labels.slice(0,4).join(' / ')+(labels.length>4?' 等':'');if(!tags.includes(tag)&&tags.length<8)tags.push(tag);tagMap.set(key,tags);
  }
 }
 const result=[];for(const item of items){const personId=String(item.id),summaries:DirectoryRoleSummary[]=[];
  for(const id of item.matchingRoleIds as string[]??[]){const role=g.fact('personRoles',id);if(!role||role.personId!==personId||!g.usable('personRoles',role))continue;
   const works:DirectoryRoleSummary['works']=[],seen=new Set<string>();
   for(const c of g.personRows('workCredits',personId)){if(c.personRoleId!==id||!c.sourceId||!g.sourceUsable(c.sourceId)||seen.has(c.workId))continue;const w=g.record('works',c.workId);
    if(!w||w.status!=='ACTIVE'||!g.sourceUsable(w.sourceId)||!g.visibility.scopeVisible(w.scopeId)||g.visibility.blocked('WORK',w.id))continue;
    if(filters.industryCodes?.length&&(!w.industryCode||!filters.industryCodes.includes(w.industryCode))||filters.workTypeCodes?.length&&!filters.workTypeCodes.some(code=>w.workTypeCodes.includes(code)))continue;
    seen.add(w.id);let coverAssetId:string|null=null;
    if(w.coverEntryId&&actor.permissions.includes('assets.read')){const entry=await tx.get('workAssets',w.coverEntryId);if(entry?.workId===w.id)try{const a=await readyAsset(tx,actor,entry.assetId,clock);if(a.mime.startsWith('image/'))coverAssetId=a.id;}catch(e){if(!(e instanceof AppError&&[403,404,409].includes(e.status)))throw e;}}
    works.push({id:w.id,title:w.title,workTypeCodes:w.workTypeCodes,coverAssetId});if(works.length>=3)break;
   }
   const capabilities:DirectoryRoleSummary['capabilities']=[];for(const c of g.personRows('personCapabilities',personId)){if(c.personRoleId!==id||!g.usable('personCapabilities',c as never))continue;const def=g.rows('capabilityDefinitions').find(d=>d.code===c.capabilityCode&&d.status==='ACTIVE');if(def&&!capabilities.some(v=>v.code===c.capabilityCode))capabilities.push({code:c.capabilityCode,label:def.labelZh,levelCode:c.levelCode});if(capabilities.length>=6)break;}
   summaries.push({personRoleId:id,roleCode:String(role.roleCode),works,capabilities,tags:tagMap.get(id)??[]});
  }
  result.push({...item,roleSummaries:summaries});
 }return result;
}
