import type {SupplierFact} from './supplier-field-model.ts';
import type {SupplierFieldSearch} from './supplier-field-contract.ts';
export type {SupplierFieldSearch} from './supplier-field-contract.ts';
import {v,code,type Schema} from './validation.ts';
import type {Actor,Clock} from './model.ts';
import type {Tx} from './store.ts';
import type {loadTalentGraph} from './talent-v2-graph.ts';
import {invariant} from './errors.ts';
import {publishedCatalog} from './supplier-field-catalog.ts';
import {SupplierDay} from './supplier-native-schema.ts';
export const SupplierFieldSearchSchema:Schema<SupplierFieldSearch>=v.object({roleCode:v.optional(code),fields:v.array(v.object({fieldCode:v.string(60,1),state:v.optional(v.enum(['KNOWN','DECLARED_NONE','UNKNOWN','NOT_PROVIDED'])),match:v.optional(v.enum(['ANY','ALL'])),codes:v.optional(v.array(code,30,1)),min:v.optional(v.number(-1e9,1e9,false)),max:v.optional(v.number(-1e9,1e9,false)),from:v.optional(SupplierDay),until:v.optional(SupplierDay),boolean:v.optional(v.boolean())}),10),
 capabilities:v.optional(v.array(v.object({capabilityCode:code,minLevel:v.optional(v.enum(['BASIC','WORKING','PROFESSIONAL']))}),10))});

export async function filterSupplierFields(tx:Tx,actor:Actor,clock:Clock,graph:Awaited<ReturnType<typeof loadTalentGraph>>,items:Record<string,unknown>[],query:SupplierFieldSearch){
 const catalog=await publishedCatalog(tx,actor.workspaceId),catalogFields=catalog.definition.fields;
 invariant(!query.capabilities?.length||query.roleCode,'FIELD_SEARCH_ROLE','能力筛选须选择对应职业',400);
 invariant(new Set(query.fields.map(f=>f.fieldCode)).size===query.fields.length,'FIELD_SEARCH_DUPLICATE','同一专业字段不能重复筛选',400);
 for(const q of query.capabilities??[]){const definition=graph.rows('capabilityDefinitions').find(d=>d.code===q.capabilityCode&&d.status==='ACTIVE');invariant(definition&&(!definition.applicableRoleCodes.length||definition.applicableRoleCodes.includes(query.roleCode!))&&(!q.minLevel||definition.levelSchemeCode==='ABILITY_5'),'FIELD_SEARCH_CAPABILITY','能力代码、职业或熟练度体系无效',400);}
 invariant(new Set(query.capabilities?.map(c=>c.capabilityCode)).size===(query.capabilities?.length??0),'FIELD_SEARCH_DUPLICATE','同一能力不能重复筛选',400);
 const idSet=new Set(items.map(p=>String(p.id))),facts:SupplierFact[]=[];
 for(const q of query.fields){const f=catalogFields.find(f=>f.code===q.fieldCode);invariant(f&&f.searchable&&!['TEXT','RECORDS'].includes(f.type),'FIELD_SEARCH_INVALID','该字段不支持结构化筛选',400);
  invariant(f.owner==='PERSON'||query.roleCode&&(!f.roles.length||f.roles.includes(query.roleCode)),'FIELD_SEARCH_ROLE','专业字段与所选职业不匹配',400);
  invariant(!q.codes||['CODE','CODE_SET'].includes(f.type)&&q.codes.every(c=>f.options?.some(o=>o.code===c)),'FIELD_SEARCH_CODE','筛选包含未收录的选项',400);
  invariant(q.min===undefined&&q.max===undefined||f.type==='NUMBER','FIELD_SEARCH_TYPE','范围筛选须用于数值字段',400);
  invariant(!q.from&&!q.until||f.type==='DATE','FIELD_SEARCH_TYPE','日期筛选须用于日期字段',400);
  invariant(q.boolean===undefined||f.type==='BOOLEAN','FIELD_SEARCH_TYPE','是 / 否筛选须用于布尔字段',400);
  invariant(q.min===undefined||q.max===undefined||q.min<=q.max,'FIELD_SEARCH_RANGE','数值范围无效',400);
  invariant(!q.from||!q.until||q.from<=q.until,'FIELD_SEARCH_RANGE','日期范围无效',400);
  invariant(!q.state||q.state==='KNOWN'||!q.codes&&q.min===undefined&&q.max===undefined&&!q.from&&!q.until&&q.boolean===undefined,'FIELD_SEARCH_STATE','未知、未提供或明确没有不能同时带值筛选',400);
  const rows=await tx.find('supplierFacts',{workspaceId:actor.workspaceId,fieldCode:q.fieldCode,recordKey:'single',status:'ACTIVE'});invariant(rows.length<=50000,'FIELD_SEARCH_LIMIT','该字段的资料量较大，请增加职业或人员条件',503);
  for(const r of rows)if(idSet.has(r.personId)&&r.visibility===f.visibility&&graph.sourceUsable(r.sourceId)&&graph.source(r.sourceId)?.revision===r.sourceRevision&&(!r.personRoleId||!!graph.fact('personRoles',r.personRoleId)&&graph.usable('personRoles',graph.fact('personRoles',r.personRoleId)!)))facts.push(r);
 }
 const choices=await tx.findIn('supplierFactChoices',actor.workspaceId,'factId',facts.filter(r=>r.valueType==='CODE_SET').map(r=>r.id)),codes=new Map<string,string[]>();for(const c of choices){const group=codes.get(c.factId)??[];group.push(c.code);codes.set(c.factId,group);}
 const byOwner=new Map<string,SupplierFact[]>();for(const row of facts){const key=row.personId+':'+(row.personRoleId??'person')+':'+row.fieldCode,rows=byOwner.get(key)??[];rows.push(row);byOwner.set(key,rows);}
 const matchField=(personId:string,roleId:string|null,q:SupplierFieldSearch['fields'][number])=>{const field=catalogFields.find(f=>f.code===q.fieldCode)!,rows=byOwner.get(personId+':'+(field.owner==='PERSON'?'person':roleId)+':'+q.fieldCode)??[];
  if(q.state==='NOT_PROVIDED'&&!rows.length)return true;
  return rows.some(r=>{if(r.valueState!==(q.state??'KNOWN'))return false;
   const values=r.valueType==='CODE_SET'?codes.get(r.id)??[]:r.codeValue?[r.codeValue]:[];
   return (!q.codes||(q.match==='ALL'?q.codes.every(c=>values.includes(c)):q.codes.some(c=>values.includes(c))))&&(q.min===undefined||r.numberValue!==null&&r.numberValue>=q.min)&&(q.max===undefined||r.numberValue!==null&&r.numberValue<=q.max)&&(!q.from||r.dateValue!==null&&r.dateValue>=q.from)&&(!q.until||r.dateValue!==null&&r.dateValue<=q.until)&&(q.boolean===undefined||r.booleanValue===q.boolean);
  });
 };
 const ranks:Record<string,number>={BASIC:1,WORKING:2,PROFESSIONAL:3};
 return items.flatMap(item=>{const personId=String(item.id),roles=(item.matchingRoleIds as string[]??[]).filter(id=>!query.roleCode||graph.fact('personRoles',id)?.roleCode===query.roleCode),matching=roles.filter(roleId=>query.fields.every(q=>matchField(personId,roleId,q))&&(query.capabilities??[]).every(q=>graph.personRows('personCapabilities',personId).some(c=>c.personRoleId===roleId&&c.capabilityCode===q.capabilityCode&&graph.usable('personCapabilities',c as never)&&(!q.minLevel||c.levelCode&&ranks[c.levelCode]!==undefined&&ranks[c.levelCode]!>=ranks[q.minLevel]!))));
  if(query.roleCode||query.fields.some(q=>catalogFields.find(f=>f.code===q.fieldCode)?.owner==='ROLE')||query.capabilities?.length)return matching.length?[{...item,matchingRoleIds:matching}]:[];
  return query.fields.every(q=>matchField(personId,null,q))?[item]:[];
 });
}
