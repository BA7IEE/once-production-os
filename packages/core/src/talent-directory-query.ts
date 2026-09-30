import type {Actor,Clock} from './model.ts';
import type {Tx} from './store.ts';
import {loadVisibility} from './visibility.ts';
import {loadTalentGraph} from './talent-v2-graph.ts';
import {searchTalentV2} from './talent-v2-search.ts';
import {DirectoryQuerySchema} from './talent-directory.ts';
import {requirePermission} from './policy.ts';
import {invariant} from './errors.ts';
export interface DirectoryDatabaseQuery {workspaceId:string;visibleScopeIds:string[];asOf:string;now:string;query:Record<string,string>;phase:'CANDIDATES'|'PAGE';verifiedIds?:string[];page?:number;pageSize?:number}
export interface DirectoryDatabaseResult {ids:string[];total:number}
/** SQL narrows potential matches. Core projection remains the authority for per-field evidence.
 * Only verified IDs enter SQL deduplication/paging; source/evidence checks share the transaction lock. */
export async function queryTalentDirectory(tx:Tx,actor:Actor,clock:Clock,input:unknown){
 requirePermission(actor,'records.read');const data=DirectoryQuerySchema.parse(input),query=Object.fromEntries(Object.entries(data).filter(([k,v])=>v!==undefined&&!(k==='ageUnknown'&&v===false)).map(([k,v])=>[k,String(v)]));
 const visibility=await loadVisibility(tx,actor,clock),base={workspaceId:actor.workspaceId,visibleScopeIds:visibility.visibleScopeIds,asOf:clock.now().toISOString().slice(0,10),now:clock.now().toISOString()};
 const candidates=new Set<string>();
 for(const omitted of [[],['gender'],['market'],['experience'],['role'],['language'],['location']]){const rest={...query};for(const k of omitted)delete rest[k];const r=await tx.talentDirectoryQuery({...base,query:rest,phase:'CANDIDATES'});for(const id of r.ids)candidates.add(id);}
 invariant(candidates.size<=50000,'TD2_DATASET_LIMIT','当前查询规模超出核验范围，请增加条件',503);
 const graph=await loadTalentGraph(tx,actor,clock,[...candidates]),reference=await searchTalentV2(tx,actor,clock,query,{graph,all:true,facets:true});
 const verified=reference.items.filter((p:Record<string,unknown>)=>candidates.has(String(p.id))),page=Number(query.page??1),pageSize=Number(query.pageSize??20);
 const result=await tx.talentDirectoryQuery({...base,query,phase:'PAGE',verifiedIds:verified.map((p:Record<string,unknown>)=>String(p.id)),page,pageSize});
 const items=new Map(verified.map((p:Record<string,unknown>)=>[String(p.id),p]));return {...reference,total:result.total,page,pageSize,items:result.ids.map(id=>items.get(id)!)};
}
