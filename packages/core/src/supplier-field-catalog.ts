import type {Actor,Clock} from './model.ts';
import type {Tx} from './store.ts';
import {base,cas,touch,workspaceRow} from './helpers.ts';
import {digest} from './json.ts';
import {invariant,missing} from './errors.ts';
import {requirePermission} from './policy.ts';
import {DEFAULT_SUPPLIER_FIELD_CATALOG} from './supplier-field-defaults.ts';
import {compatibleCatalog,validateFieldCatalog,SupplierCatalogSchemas as S} from './supplier-field-validation.ts';
import type {SupplierCatalog} from './supplier-field-model.ts';
import type {SupplierCatalogView,SupplierFieldCatalog} from './supplier-field-contract.ts';
export function catalogView(row:Pick<SupplierCatalog,'version'|'definition'|'definitionDigest'>,internal=false):SupplierCatalogView{
 const definition=structuredClone(row.definition);if(!internal){definition.fields=definition.fields.filter(f=>f.visibility==='SELF_SHARED');const codes=new Set(definition.fields.map(f=>f.code));definition.templates=definition.templates.map(t=>({...t,fieldCodes:t.fieldCodes.filter(c=>codes.has(c))}));}
 return {version:row.version,digest:row.definitionDigest,definition};
}
export async function publishedCatalog(tx:Tx,workspaceId:string,version?:number):Promise<Pick<SupplierCatalog,'version'|'definition'|'definitionDigest'>>{
 const rows=(await tx.find('supplierCatalogs',{workspaceId,state:'PUBLISHED'})).filter(c=>version===undefined||c.version===version).sort((a,b)=>b.version-a.version);
 if(rows[0])return rows[0];
 invariant(version===undefined||version===1,'FIELD_CATALOG_UNAVAILABLE','资料对应的字段版本不可用，请保留草稿并联系 ONCE',409);
 return {version:1,definition:structuredClone(DEFAULT_SUPPLIER_FIELD_CATALOG),definitionDigest:digest(DEFAULT_SUPPLIER_FIELD_CATALOG)};
}
export async function ensureBuiltinCatalog(tx:Tx,workspaceId:string,clock:Clock){
 const existing=(await tx.find('supplierCatalogs',{workspaceId,version:1}))[0];if(existing)return existing;
 const definition=validateFieldCatalog(DEFAULT_SUPPLIER_FIELD_CATALOG),row:SupplierCatalog={...base(workspaceId,clock),version:1,baseVersion:null,state:'PUBLISHED',definition,
  definitionDigest:digest(definition),publishedById:null,publishedAt:clock.now().toISOString(),publishReason:'系统初始专业字段目录；不包含人员事实',origin:'SYSTEM'};
 await tx.insert('supplierCatalogs',row);return row;
}
async function catalogRolesValid(tx:Tx,workspaceId:string,catalog:SupplierFieldCatalog){const dictionary=await tx.find('dictionary',{workspaceId,namespace:'role'});for(const code of new Set([...catalog.fields.flatMap(f=>f.roles),...catalog.templates.flatMap(t=>t.roleCode?[t.roleCode]:[])]))invariant(dictionary.some(d=>d.code===code),'FIELD_CATALOG_ROLE_UNKNOWN','模板包含未登记的职业，请先在分类字典登记',422);}
export class SupplierFieldCatalogs{
 readonly clock:Clock;
 constructor(clock:Clock){this.clock=clock;}
 async list(tx:Tx,actor:Actor){requirePermission(actor,'catalog.manage');const current=await publishedCatalog(tx,actor.workspaceId);return {current:catalogView(current,true),drafts:(await tx.find('supplierCatalogs',{workspaceId:actor.workspaceId,state:'DRAFT'})).map(r=>({...catalogView(r,true),id:r.id,revision:r.revision,baseVersion:r.baseVersion})),history:(await tx.find('supplierCatalogs',{workspaceId:actor.workspaceId,state:'PUBLISHED'})).map(r=>({id:r.id,version:r.version,digest:r.definitionDigest,publishedAt:r.publishedAt,publishReason:r.publishReason}))};}
 async access(tx:Tx,actor:Actor,id:string){requirePermission(actor,'catalog.manage');const row=await workspaceRow(tx,'supplierCatalogs',id,actor.workspaceId);if(!row)missing();return row;}
 async create(tx:Tx,actor:Actor,input:unknown){requirePermission(actor,'catalog.manage');const d=S.create.parse(input);await ensureBuiltinCatalog(tx,actor.workspaceId,this.clock);
  const current=await publishedCatalog(tx,actor.workspaceId);invariant(d.baseVersion===current.version,'FIELD_CATALOG_CONFLICT','字段目录已有新版本，请重新读取后修改',409);
  const definition=validateFieldCatalog(d.definition);await catalogRolesValid(tx,actor.workspaceId,definition);compatibleCatalog(current.definition,definition);
  const rows=await tx.find('supplierCatalogs',{workspaceId:actor.workspaceId});const row:SupplierCatalog={...base(actor.workspaceId,this.clock),version:Math.max(...rows.map(c=>c.version))+1,baseVersion:current.version,state:'DRAFT',definition,definitionDigest:digest(definition),publishedById:null,publishedAt:null,publishReason:'',origin:'MEMBER'};
  await tx.insert('supplierCatalogs',row);return row;
 }
 async save(tx:Tx,actor:Actor,id:string,input:unknown){const d=S.save.parse(input),row=await this.access(tx,actor,id);cas(row,d.expectedRevision);invariant(row.state==='DRAFT','FIELD_CATALOG_IMMUTABLE','已发布版本不能修改，请创建新版本',409);
  const definition=validateFieldCatalog(d.definition),base=await publishedCatalog(tx,actor.workspaceId,row.baseVersion!);compatibleCatalog(base.definition,definition);await catalogRolesValid(tx,actor.workspaceId,definition);
  const next={...touch(row,this.clock),definition,definitionDigest:digest(definition)};await tx.replace('supplierCatalogs',next);return next;
 }
 async publish(tx:Tx,actor:Actor,id:string,input:unknown){const d=S.publish.parse(input),row=await this.access(tx,actor,id);cas(row,d.expectedRevision);invariant(row.state==='DRAFT','FIELD_CATALOG_IMMUTABLE','字段版本已发布',409);
  const current=await publishedCatalog(tx,actor.workspaceId);invariant(row.baseVersion===current.version,'FIELD_CATALOG_CONFLICT','已有其他目录先发布，请基于最新版本重新整理',409);compatibleCatalog(current.definition,validateFieldCatalog(row.definition));
  const next:SupplierCatalog={...touch(row,this.clock),state:'PUBLISHED',publishedById:actor.membershipId,publishedAt:this.clock.now().toISOString(),publishReason:d.reason};await tx.replace('supplierCatalogs',next);return next;
 }
}
