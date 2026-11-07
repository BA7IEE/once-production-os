import {v,uuid,revision,type Parsed,type Schema} from './validation.ts';
import {invariant} from './errors.ts';
import {digest} from './json.ts';
import {SUPPLIER_FIELDS_VERSION,answerKey,fieldsForRoles,type SupplierFieldCatalog,type ProfessionalDraft,type SupplierField,type FieldComponent} from './supplier-field-contract.ts';
const fieldCode=v.string(60,1,/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){0,3}$/);
const termCode=v.string(60,1,/^[a-z0-9][a-z0-9_-]*$/);
const option=v.object({code:termCode,label:v.string(100,1),aliases:v.array(v.string(100,1),20),status:v.enum(['ACTIVE','DEPRECATED']),replacedBy:v.optional(termCode)});
const scalar={code:fieldCode,label:v.string(100,1),required:v.boolean(),unit:v.optional(v.string(30,1)),min:v.optional(v.number(-1e9,1e9,false)),max:v.optional(v.number(-1e9,1e9,false)),maxLength:v.optional(v.number(1,5000)),options:v.optional(v.array(option,300))};
const component=v.object({...scalar,type:v.enum(['TEXT','NUMBER','BOOLEAN','DATE','CODE','CODE_SET'])});
export const SupplierFieldCatalogSchema=v.object({schemaVersion:v.enum([SUPPLIER_FIELDS_VERSION]),fields:v.array(v.object({...scalar,
 type:v.enum(['TEXT','NUMBER','BOOLEAN','DATE','CODE','CODE_SET','RECORDS']),owner:v.enum(['PERSON','ROLE']),roles:v.array(termCode,30),visibility:v.enum(['SELF_SHARED','INTERNAL']),
 description:v.string(1000),searchable:v.boolean(),ai:v.enum(['SUGGEST','NEVER']),components:v.optional(v.array(component,12,1)),maxItems:v.optional(v.number(1,30))}),150),
 templates:v.array(v.object({code:termCode,label:v.string(100,1),roleCode:v.nullable(termCode),fieldCodes:v.array(fieldCode,50)}),50,1)});
const scalarTypes=['TEXT','NUMBER','BOOLEAN','DATE','CODE','CODE_SET'];
const unique=(xs:string[],message:string)=>invariant(new Set(xs).size===xs.length,'FIELD_CATALOG_DUPLICATE',message,422);
const reserved=new Set(['person.display_name','person.aliases','person.intro','person.roles','person.locations','person.languages','person.contacts','person.capabilities','role.capabilities','model.height_cm','model.bust_cm','model.waist_cm','model.hips_cm','model.shoe_size','model.clothing_size','role.credentials','translator.language_pairs','translator.service_modes']);
export function validateFieldCatalog(input:unknown):SupplierFieldCatalog{
 const c=SupplierFieldCatalogSchema.parse(input) as SupplierFieldCatalog;
 invariant(Buffer.byteLength(JSON.stringify(c))<=1024*1024,'FIELD_CATALOG_LIMIT','字段目录超过大小上限，请减少选项或拆分职业模板',422);
 unique(c.fields.map(f=>f.code),'字段编码不能重复');unique(c.templates.map(t=>t.code),'模板编码不能重复');
 for(const f of c.fields){
  invariant(!reserved.has(f.code),'FIELD_CATALOG_RESERVED','已有主档、能力、量尺及资格必须使用现有类型，不得另建同义扩展字段',422);
  invariant(!f.required,'FIELD_CATALOG_OPTIONAL','本版新增专业字段均为可选，不能阻止旧资料确认',422);
  invariant(f.visibility!=='INTERNAL'||f.ai==='NEVER','FIELD_CATALOG_PRIVATE','内部字段不能提供给 AI',422);
  invariant(f.owner==='ROLE'||f.roles.length===0,'FIELD_CATALOG_OWNER','通用人物字段不能限定职业',422);
  invariant(f.type==='RECORDS'?!!f.components?.length:!f.components,'FIELD_CATALOG_COMPONENTS','成组记录必须声明子字段，普通字段不能包含子字段',422);
  if(f.components)unique(f.components.map(p=>p.code),'成组记录的子字段编码不能重复');
  for(const p of [f,...f.components??[]]){
   invariant(p.min===undefined||p.max===undefined||p.min<=p.max,'FIELD_CATALOG_RANGE','字段数值范围无效',422);
   invariant(p.type==='NUMBER'||p.min===undefined&&p.max===undefined&&p.unit===undefined,'FIELD_CATALOG_NUMBER','仅数值字段可声明范围和单位',422);
   invariant(['CODE','CODE_SET'].includes(p.type)?!!p.options?.length:!p.options,'FIELD_CATALOG_OPTIONS','受控选项仅用于单选与多选字段',422);
   if(p.options){unique(p.options.map(o=>o.code),'选项编码不能重复');for(const o of p.options){unique(o.aliases,'选项别名不能重复');
    invariant(!o.replacedBy||o.status==='DEPRECATED'&&o.replacedBy!==o.code&&p.options.some(n=>n.code===o.replacedBy&&n.status==='ACTIVE'),'FIELD_CATALOG_REPLACEMENT','停用选项只能指向有效的新选项',422);}}
   if(p.options){const names=new Map<string,string>();for(const o of p.options)for(const name of [o.code,o.label,...o.aliases]){const key=name.normalize('NFKC').trim().toLocaleLowerCase();invariant(!names.has(key)||names.get(key)===o.code,'FIELD_CATALOG_ALIAS_AMBIGUOUS','同一字段的选项名称或别名不能同时指向两个编码',422);names.set(key,o.code);}}
   invariant(p.type!=='TEXT'||(p.maxLength??500)<=5000,'FIELD_CATALOG_LENGTH','文本上限过大',422);
  }
 }
 for(const t of c.templates){unique(t.fieldCodes,'模板不能重复绑定字段');for(const code of t.fieldCodes){const f=c.fields.find(f=>f.code===code);
  invariant(f&&(!t.roleCode?f.owner==='PERSON':f.owner==='ROLE'&&(!f.roles.length||f.roles.includes(t.roleCode))),'FIELD_CATALOG_BINDING','模板字段与所属人物或职业不一致',422);}}
 invariant(c.templates.filter(t=>t.roleCode===null).length===1,'FIELD_CATALOG_COMMON','必须有一个通用模板',422);
 unique(c.templates.filter(t=>t.roleCode!==null).map(t=>t.roleCode!),'每个职业仅使用一个模板');
 return c;
}
export function compatibleCatalog(previous:SupplierFieldCatalog,next:SupplierFieldCatalog){
 for(const old of previous.fields){const current=next.fields.find(f=>f.code===old.code);
  invariant(current,'FIELD_CATALOG_HISTORY','已有字段不能删除；可从新模板移除，历史版本仍保留',422);
  invariant(digest([old.type,old.owner,old.unit??null,old.visibility])===digest([current.type,current.owner,current.unit??null,current.visibility]),'FIELD_CATALOG_MEANING','已有字段的类型、所属对象、单位和可见范围不能改变，请另建编码',422);
  invariant(!current.roles.length||old.roles.length>0&&old.roles.every(r=>current.roles.includes(r)),'FIELD_CATALOG_MEANING','已有字段不能缩小适用职业，请从新模板移除而保留旧定义',422);
  invariant((current.maxItems??30)>=(old.maxItems??30),'FIELD_CATALOG_MEANING','已有字段不能降低记录数量上限',422);
  for(const p of [old,...old.components??[]]){const n=p===old?current:current.components?.find(x=>x.code===p.code);
   invariant(n&&n.type===p.type&&(n.unit??null)===(p.unit??null),'FIELD_CATALOG_MEANING','已有子字段不能删除或改类型及单位',422);
   invariant((n.min??-1e9)<=(p.min??-1e9)&&(n.max??1e9)>=(p.max??1e9)&&(n.maxLength??500)>=(p.maxLength??500)&&(!n.required||p.required),'FIELD_CATALOG_MEANING','已有字段不能缩窄范围、缩短长度或变为必填，请使用新编码',422);
   for(const term of p.options??[])invariant(n.options?.some(x=>x.code===term.code),'FIELD_CATALOG_HISTORY','已有选项不能删除，请停用并保留编码',422);
  }
  for(const child of current.components??[])if(!old.components?.some(c=>c.code===child.code))invariant(!child.required,'FIELD_CATALOG_OPTIONAL','已有成组记录新增子字段须为可选',422);
 }
}
export function validateScalar(value:unknown,f:FieldComponent,oldValue?:unknown):unknown{
 if(oldValue!==undefined&&digest(value)===digest(oldValue))return value;
 if(f.type==='TEXT'){const text=v.string(f.maxLength??500,1).parse(value).trim();invariant(text.length>0,'FIELD_TEXT_EMPTY','请填写文字，或选择未提供',422);return text;}
 if(f.type==='NUMBER')return v.number(f.min??-1e9,f.max??1e9,false).parse(value);
 if(f.type==='BOOLEAN')return v.boolean().parse(value);
 if(f.type==='DATE'){const day=v.string(10,10,/^\d{4}-\d{2}-\d{2}$/).parse(value),date=new Date(day+'T00:00:00.000Z');invariant(Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===day,'FIELD_DATE_INVALID','日期无效',422);return day;}
 const values=f.type==='CODE_SET'?v.array(termCode,30,1).parse(value):[termCode.parse(value)];unique(values,'多选不能重复');
 const old=new Set(Array.isArray(oldValue)?oldValue:typeof oldValue==='string'?[oldValue]:[]);
 invariant(values.every(code=>f.options?.some(o=>o.code===code&&(o.status==='ACTIVE'||old.has(code)))),'FIELD_OPTION_INVALID','包含未收录或已停用的选项；旧值可保留，新值需先整理入选项目录',422);
 return f.type==='CODE_SET'?[...values].sort():values[0];
}
export function validateAnswerValue(value:unknown,f:SupplierField,oldValue?:unknown):unknown{
 if(f.type!=='RECORDS')return validateScalar(value,f as FieldComponent,oldValue);
 const rows=v.array(v.object({id:uuid,values:v.unknown()}),f.maxItems??30,1).parse(value);
 unique(rows.map(r=>r.id),'成组记录的标识不能重复');
 return rows.sort((a,b)=>a.id.localeCompare(b.id)).map(row=>{invariant(row.values&&typeof row.values==='object'&&!Array.isArray(row.values),'FIELD_RECORD_INVALID','成组记录必须包含子字段',422);const raw=row.values as Record<string,unknown>;
  invariant(Object.keys(raw).every(k=>f.components!.some(c=>c.code===k)),'FIELD_RECORD_INVALID','成组记录包含未知子字段',422);
  const result:Record<string,unknown>={};for(const c of f.components!){if(Object.hasOwn(raw,c.code)){
   const old=Array.isArray(oldValue)?oldValue.find((r:{id:string})=>r.id===row.id)?.values?.[c.code]:undefined;
   result[c.code]=validateScalar(raw[c.code],c,old);
  }else invariant(!c.required,'FIELD_RECORD_REQUIRED','请填写成组记录中的必填项',422);}
  invariant(Object.keys(result).length>0,'FIELD_RECORD_EMPTY','请补全记录或移除空行',422);return {id:row.id,values:result};});
}
export const ProfessionalDraftSchema:Schema<ProfessionalDraft>=v.object({catalogVersion:v.number(1),catalogDigest:v.string(64,64,/^[a-f0-9]{64}$/),answers:v.array(v.object({fieldCode,roleCode:v.nullable(termCode),state:v.enum(['KNOWN','DECLARED_NONE','UNKNOWN','NOT_PROVIDED']),value:v.optional(v.unknown())}),300)});
export function validateProfessional(input:unknown,catalog:SupplierFieldCatalog,roles:string[],previous?:ProfessionalDraft,internal=false):ProfessionalDraft{
 const data=ProfessionalDraftSchema.parse(input);invariant(Buffer.byteLength(JSON.stringify(data))<=1024*1024,'FIELD_PAYLOAD_LIMIT','专业资料过大，请分批整理',422);
 unique(data.answers.map(answerKey),'同一人物或职业的字段不能重复');
 const fields=fieldsForRoles(catalog,roles,internal);
 for(const old of previous?.answers??[]){const f=catalog.fields.find(f=>f.code===old.fieldCode&&(internal||f.visibility==='SELF_SHARED'));if(f&&!fields.includes(f))fields.push(f);}
 data.answers=data.answers.map(a=>{const f=fields.find(f=>f.code===a.fieldCode);invariant(f&&(f.owner==='PERSON'?a.roleCode===null:a.roleCode!==null&&roles.includes(a.roleCode)&&(!f.roles.length||f.roles.includes(a.roleCode))),'FIELD_NOT_APPLICABLE','字段不适用当前人物或职业模板',422);
  if(a.state==='KNOWN')return {...a,value:validateAnswerValue(a.value,f,previous?.answers.find(p=>answerKey(p)===answerKey(a))?.value)};
  invariant(a.value===undefined,'FIELD_STATE_INVALID','未知、未提供或明确没有时不能夹带值',422);
  invariant(a.state!=='DECLARED_NONE'||['CODE_SET','RECORDS'].includes(f.type),'FIELD_STATE_INVALID','仅多选或成组记录可以明确声明没有',422);return a;
 });return data;
}
export const SupplierCatalogSchemas={create:v.object({baseVersion:v.number(1),definition:SupplierFieldCatalogSchema}),save:v.object({expectedRevision:revision,definition:SupplierFieldCatalogSchema}),publish:v.object({expectedRevision:revision,reason:v.string(1000,4)})};
export type SupplierCatalogInput=Parsed<typeof SupplierFieldCatalogSchema>;
