import type {Actor,Base,Clock} from './model.ts';
import type {Tx} from './store.ts';
import {v,uuid,revision,dateIso} from './validation.ts';
import {base,cas,page,touch,workspaceRow} from './helpers.ts';
import {requirePermission,requireScope,sourceFor} from './policy.ts';
import {projectFor} from './production-policy.ts';
import {invariant,missing,AppError} from './errors.ts';
export interface Brand extends Base {name:string;organizationId:string|null;sourceId:string;scopeId:string;status:'ACTIVE'|'ARCHIVED';}
export interface ProjectParty extends Base {projectId:string;clientOrganizationId:string|null;brandId:string|null;}
export const PARTY_FIELD='project.parties' as const;
export const PartySchemas={
 create:v.object({sourceId:uuid,sourceRevision:revision,name:v.string(160,1),organizationId:v.nullable(uuid)}),
 patch:v.object({expectedRevision:revision,name:v.optional(v.string(160,1)),organizationId:v.optional(v.nullable(uuid)),status:v.optional(v.enum(['ACTIVE','ARCHIVED']))}),
 bind:v.object({expectedRevision:revision,clientOrganizationId:v.nullable(uuid),brandId:v.nullable(uuid)})
};
export async function organizationFor(tx:Tx,actor:Actor,id:string,clock:Clock){const row=await workspaceRow(tx,'organizations',id,actor.workspaceId);if(!row)missing();await requireScope(tx,actor,row.scopeId);await sourceFor(tx,actor,row.sourceId,clock);return row;}
export async function brandFor(tx:Tx,actor:Actor,id:string,clock:Clock){const row=await workspaceRow(tx,'brands',id,actor.workspaceId);if(!row)missing();await requireScope(tx,actor,row.scopeId);await sourceFor(tx,actor,row.sourceId,clock);return row;}
export class ProjectParties{
 readonly clock:Clock;constructor(clock:Clock){this.clock=clock;}
 async create(tx:Tx,actor:Actor,input:unknown){requirePermission(actor,'records.write');invariant(actor.actorKind!=='MACHINE','HUMAN_OPERATION_REQUIRED','品牌资料需要内部成员维护',403);const d=PartySchemas.create.parse(input),s=await sourceFor(tx,actor,d.sourceId,this.clock);cas(s,d.sourceRevision);if(d.organizationId)await organizationFor(tx,actor,d.organizationId,this.clock);invariant(d.name.trim(),'NAME_REQUIRED','品牌名称不能为空',422);const row:Brand={...base(actor.workspaceId,this.clock),name:d.name.trim(),organizationId:d.organizationId,sourceId:s.id,scopeId:s.scopeId,status:'ACTIVE'};await tx.insert('brands',row);return row;}
 async patch(tx:Tx,actor:Actor,id:string,input:unknown){requirePermission(actor,'records.write');invariant(actor.actorKind!=='MACHINE','HUMAN_OPERATION_REQUIRED','品牌资料需要内部成员维护',403);const d=PartySchemas.patch.parse(input),row=await brandFor(tx,actor,id,this.clock);cas(row,d.expectedRevision);invariant(d.name!==undefined||d.organizationId!==undefined||d.status!==undefined,'PATCH_EMPTY','请选择修改内容',422);if(d.organizationId)await organizationFor(tx,actor,d.organizationId,this.clock);if(d.name!==undefined)invariant(d.name.trim(),'NAME_REQUIRED','品牌名称不能为空',422);const next={...touch(row,this.clock),...(d.name!==undefined?{name:d.name.trim()}:{}),...(d.organizationId!==undefined?{organizationId:d.organizationId}:{}),...(d.status!==undefined?{status:d.status}:{})};await tx.replace('brands',next);return next;}
 async list(tx:Tx,actor:Actor,query:Record<string,string>){requirePermission(actor,'records.read');const rows=[];for(const row of await tx.find('brands',{workspaceId:actor.workspaceId})){try{await brandFor(tx,actor,row.id,this.clock);rows.push(await this.dto(tx,actor,row));}catch(e){if(!(e instanceof AppError&&e.status===404))throw e;}}return page(rows,query);}
 async dto(tx:Tx,actor:Actor,row:Brand){let organization:null|{id:string;name:string}=null;if(row.organizationId)try{const o=await organizationFor(tx,actor,row.organizationId,this.clock);organization={id:o.id,name:o.name};}catch(e){if(!(e instanceof AppError&&e.status===404))throw e;}return {id:row.id,name:row.name,revision:row.revision,status:row.status,sourceId:row.sourceId,organization};}
 async get(tx:Tx,actor:Actor,projectId:string){await projectFor(tx,actor,projectId,this.clock);const row=(await tx.find('projectParties',{workspaceId:actor.workspaceId,projectId}))[0];let client:null|{id:string;name:string}=null,brand:null|{id:string;name:string}=null;
  if(row?.clientOrganizationId)try{const o=await organizationFor(tx,actor,row.clientOrganizationId,this.clock);client={id:o.id,name:o.name};}catch(e){if(!(e instanceof AppError&&e.status===404))throw e;}
  if(row?.brandId)try{const b=await brandFor(tx,actor,row.brandId,this.clock);brand={id:b.id,name:b.name};}catch(e){if(!(e instanceof AppError&&e.status===404))throw e;}
  return {client,brand,hasUnavailable:!!row&&(!!row.clientOrganizationId&&!client||!!row.brandId&&!brand)};
 }
 async bind(tx:Tx,actor:Actor,projectId:string,input:unknown){requirePermission(actor,'records.write');invariant(actor.actorKind!=='MACHINE','HUMAN_OPERATION_REQUIRED','项目关系需要内部成员维护',403);const d=PartySchemas.bind.parse(input),p=await projectFor(tx,actor,projectId,this.clock);cas(p,d.expectedRevision);invariant(p.status!=='ARCHIVED','RECORD_ARCHIVED','请先恢复项目再修改关联',409);
  if(d.clientOrganizationId)invariant((await organizationFor(tx,actor,d.clientOrganizationId,this.clock)).status==='ACTIVE','ORGANIZATION_UNAVAILABLE','机构已归档',422);
  if(d.brandId)invariant((await brandFor(tx,actor,d.brandId,this.clock)).status==='ACTIVE','BRAND_UNAVAILABLE','品牌已归档',422);
  const old=(await tx.find('projectParties',{workspaceId:actor.workspaceId,projectId}))[0];const row:ProjectParty={...(old?touch(old,this.clock):base(actor.workspaceId,this.clock)),projectId,clientOrganizationId:d.clientOrganizationId,brandId:d.brandId};if(old)await tx.replace('projectParties',row);else await tx.insert('projectParties',row);const next=touch(p,this.clock);await tx.replace('projects',next);return next;
 }
}
const stamp={id:uuid,revision,createdAt:dateIso,updatedAt:dateIso};
export const PartyTransferSchema=v.object({
 brands:v.array(v.object({...stamp,sourceId:uuid,name:v.string(160,1),organizationId:v.nullable(uuid),status:v.enum(['ACTIVE','ARCHIVED'])}),1000),
 organizations:v.array(v.object({...stamp,sourceId:uuid,name:v.string(200,1),kind:v.enum(['AGENCY','ISSUER','OTHER']),status:v.enum(['ACTIVE','ARCHIVED'])}),1000),
 links:v.array(v.object({...stamp,projectId:uuid,clientOrganizationId:v.nullable(uuid),brandId:v.nullable(uuid)}),1000)
});
export type PartyTransfer=ReturnType<typeof PartyTransferSchema.parse>;
export async function collectParties(tx:Tx,actor:Actor,clock:Clock,projectIds:string[]):Promise<PartyTransfer>{
 const brands=new Map<string,Brand>(),organizations=new Map<string,Awaited<ReturnType<typeof organizationFor>>>(),links=[];
 for(const projectId of [...projectIds].sort()){await projectFor(tx,actor,projectId,clock);for(const row of await tx.find('projectParties',{workspaceId:actor.workspaceId,projectId})){links.push(row);if(row.brandId){const b=await brandFor(tx,actor,row.brandId,clock);brands.set(b.id,b);if(b.organizationId)organizations.set(b.organizationId,await organizationFor(tx,actor,b.organizationId,clock));}if(row.clientOrganizationId)organizations.set(row.clientOrganizationId,await organizationFor(tx,actor,row.clientOrganizationId,clock));}}
 const clean=(r:Base&Record<string,unknown>)=>Object.fromEntries(Object.entries(r).filter(([k])=>!['workspaceId','scopeId'].includes(k)));
 return PartyTransferSchema.parse({brands:[...brands.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(r=>clean(r as unknown as Base&Record<string,unknown>)),organizations:[...organizations.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(r=>clean(r as unknown as Base&Record<string,unknown>)),links:links.map(r=>clean(r as unknown as Base&Record<string,unknown>)).sort((a,b)=>String(a.id).localeCompare(String(b.id)))});
}
export function validateParties(bundle:PartyTransfer,projectIds:Set<string>,sourceIds:Set<string>,clock:Clock){
 for(const r of [...bundle.brands,...bundle.organizations,...bundle.links])invariant(Date.parse(r.createdAt)<=Date.parse(r.updatedAt)&&Date.parse(r.updatedAt)<=clock.now().getTime(),'PARTY_TIME_INVALID','主体记录时间不合法',422);
 for(const r of [...bundle.brands,...bundle.organizations])invariant(r.name.trim().length>0,'PARTY_NAME_INVALID','主体名称不能为空',422);
 const brands=new Set(bundle.brands.map(b=>b.id)),orgs=new Set(bundle.organizations.map(o=>o.id));
 invariant(brands.size===bundle.brands.length&&orgs.size===bundle.organizations.length&&new Set(bundle.links.map(l=>l.projectId)).size===bundle.links.length&&new Set(bundle.links.map(l=>l.id)).size===bundle.links.length,'PARTY_DUPLICATE','主体清单重复',422);
 const usedBrands=new Set(bundle.links.flatMap(l=>l.brandId?[l.brandId]:[])),usedOrgs=new Set([...bundle.links.flatMap(l=>l.clientOrganizationId?[l.clientOrganizationId]:[]),...bundle.brands.flatMap(b=>b.organizationId?[b.organizationId]:[])]);
 invariant([...brands].every(id=>usedBrands.has(id))&&[...orgs].every(id=>usedOrgs.has(id)),'PARTY_ORPHAN','主体清单包含未引用资料',422);
 for(const r of [...bundle.brands,...bundle.organizations])invariant(sourceIds.has(r.sourceId),'PARTY_SOURCE_MISSING','主体缺少来源',422);
 for(const b of bundle.brands)invariant(!b.organizationId||orgs.has(b.organizationId),'PARTY_REFERENCE_MISSING','品牌所属机构缺失',422);
 for(const l of bundle.links)invariant(projectIds.has(l.projectId)&&(!l.brandId||brands.has(l.brandId))&&(!l.clientOrganizationId||orgs.has(l.clientOrganizationId)),'PARTY_REFERENCE_MISSING','项目主体引用缺失',422);
}
export async function applyParties(tx:Tx,actor:Actor,scopeId:string,bundle:PartyTransfer){
 for(const row of bundle.organizations){const old=await tx.get('organizations',row.id);if(old){invariant(old.workspaceId===actor.workspaceId&&old.sourceId===row.sourceId&&old.name===row.name&&old.kind===row.kind&&old.revision===row.revision&&old.status===row.status&&old.createdAt===row.createdAt&&old.updatedAt===row.updatedAt,'PARTY_CONFLICT','机构内容冲突',409);}else await tx.insert('organizations',{...row,workspaceId:actor.workspaceId,scopeId});}
 for(const row of bundle.brands)await tx.insert('brands',{...row,workspaceId:actor.workspaceId,scopeId});
 for(const row of bundle.links)await tx.insert('projectParties',{...row,workspaceId:actor.workspaceId});
}

/** Restore validation also catches malformed imports that database foreign keys alone cannot identify. */
export async function inspectPartyIntegrity(tx:Tx,workspaceId:string){
 const brands=(await tx.find('brands',{workspaceId})).sort((a,b)=>a.id.localeCompare(b.id));
 const links=(await tx.find('projectParties',{workspaceId})).sort((a,b)=>a.id.localeCompare(b.id));
 const blockers=new Set<string>();
 for(const b of brands){
  const source=await workspaceRow(tx,'sources',b.sourceId,workspaceId),scope=await workspaceRow(tx,'scopes',b.scopeId,workspaceId);
  if(!source||source.status==='ERASED'||!scope)blockers.add('BRAND_SOURCE_INVALID');
  if(b.organizationId&&!await workspaceRow(tx,'organizations',b.organizationId,workspaceId))blockers.add('BRAND_ORGANIZATION_MISSING');
 }
 for(const l of links){
  const p=await workspaceRow(tx,'projects',l.projectId,workspaceId);
  if(!p||p.status==='ERASED')blockers.add('PARTY_PROJECT_INVALID');
  if(l.brandId&&!brands.some(b=>b.id===l.brandId))blockers.add('PARTY_BRAND_MISSING');
  if(l.clientOrganizationId&&!await workspaceRow(tx,'organizations',l.clientOrganizationId,workspaceId))blockers.add('PARTY_CLIENT_MISSING');
 }
 return {brands,links,blockers:[...blockers].sort()};
}
