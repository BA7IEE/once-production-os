import type {Actor,Clock} from './model.ts';
import type {Tx} from './store.ts';
import type {SupplierFact,SupplierCatalog} from './supplier-field-model.ts';
import type {TalentTransfer} from './talent-transfer.ts';
import type {CredentialRebuildKeys} from './credential-transfer-crypto.ts';
import {v,uuid,revision,dateIso,type Schema} from './validation.ts';
import {validateFieldCatalog,validateProfessional,compatibleCatalog} from './supplier-field-validation.ts';
import {publishedCatalog,ensureBuiltinCatalog} from './supplier-field-catalog.ts';
import {supplierFieldSnapshot,supplierFieldScopeBlocker} from './supplier-field-lifecycle.ts';
import {digest,parseStrictJson} from './json.ts';
import {invariant} from './errors.ts';
import {sourceFor,requirePermission} from './policy.ts';
import {decryptDraftPayload,encryptDraftPayload} from './private-draft-payload.ts';
import {base} from './helpers.ts';
import type {ProfessionalAnswer,SupplierFieldCatalog} from './supplier-field-contract.ts';

export const SUPPLIER_TRANSFER_CODE='person.td2.supplierFields' as const;
export const SUPPLIER_TRANSFER_VERSION='once-talent-transfer-v16' as const;
const origin=v.object({workspaceId:uuid,sourceId:uuid,reviewerId:v.nullable(uuid),confirmedByTalentId:v.nullable(uuid),confirmedAt:v.nullable(dateIso)});
const fact=v.object({id:uuid,createdAt:dateIso,updatedAt:dateIso,revision,personId:uuid,personRoleId:v.nullable(uuid),roleCode:v.nullable(v.string(60,1)),sourceId:uuid,sourceRevision:revision,catalogVersion:revision,setId:uuid,fieldCode:v.string(60,1),recordKey:v.string(60,1),componentCode:v.string(60,1),valueType:v.enum(['STATE','TEXT','NUMBER','BOOLEAN','DATE','CODE','CODE_SET']),valueState:v.enum(['KNOWN','DECLARED_NONE','UNKNOWN','NOT_PROVIDED']),numberValue:v.nullable(v.number(-1e12,1e12,false)),booleanValue:v.nullable(v.boolean()),dateValue:v.nullable(v.string(10,10)),codeValue:v.nullable(v.string(100,1)),textCiphertext:v.nullable(v.string(40000,1)),status:v.enum(['ACTIVE','RETIRED']),visibility:v.enum(['SELF_SHARED','INTERNAL']),mergeDecisionId:v.nullable(uuid),originalConfirmation:origin});
const shape=v.object({version:v.enum(['once-supplier-transfer-v1']),contextWorkspaceId:uuid,catalogs:v.array(v.object({version:revision,digest:v.string(64,64),definition:v.unknown()}),30,1),facts:v.array(fact,1000),choices:v.array(v.object({id:uuid,createdAt:dateIso,updatedAt:dateIso,revision,factId:uuid,code:v.string(100,1)}),5000)});
export interface SupplierTransfer {version:'once-supplier-transfer-v1';contextWorkspaceId:string;catalogs:Array<{version:number;digest:string;definition:SupplierFieldCatalog}>;facts:Array<Omit<SupplierFact,'workspaceId'|'originalConfirmation'|'mergeDecisionId'>&{mergeDecisionId:string|null;originalConfirmation:{workspaceId:string;sourceId:string;reviewerId:string|null;confirmedByTalentId:string|null;confirmedAt:string|null}}>;choices:Array<{id:string;createdAt:string;updatedAt:string;revision:number;factId:string;code:string}>}
export const SupplierTransferSchema:Schema<SupplierTransfer>={json:shape.json,parse(input,path){const data=shape.parse(input,path);return {...data,catalogs:data.catalogs.map(c=>{const definition=validateFieldCatalog(c.definition);invariant(digest(definition)===c.digest,'SUPPLIER_CATALOG_DIGEST','目录定义与摘要不一致',422);return {...c,definition};})} as SupplierTransfer;}};

export async function collectSupplierTransfer(tx:Tx,actor:Actor,clock:Clock,peopleIds:string[]):Promise<SupplierTransfer>{
 requirePermission(actor,'sensitive.read');const snapshot=await supplierFieldSnapshot(tx,actor.workspaceId,peopleIds);
 invariant(!await supplierFieldScopeBlocker(tx,actor,snapshot),'SUPPLIER_TRANSFER_RESTRICTED','专业事实存在受限来源，不能遗漏后导出',409);
 invariant(snapshot.facts.length<=1000&&snapshot.choices.length<=5000,'SUPPLIER_TRANSFER_LIMIT','本次专业事实过多，请拆分人物',422);
 const facts=[];for(const f of snapshot.facts){const source=await sourceFor(tx,actor,f.sourceId,clock);invariant(source.revision===f.sourceRevision,'SUPPLIER_TRANSFER_SOURCE_CHANGED','专业事实的原来源版本已变化，请先核对',409);
  const {workspaceId,...data}=f;facts.push({...data,mergeDecisionId:f.mergeDecisionId??null,originalConfirmation:f.originalConfirmation??{workspaceId,sourceId:f.sourceId,reviewerId:source.reviewedBy??null,confirmedByTalentId:source.confirmedByTalentId??null,confirmedAt:source.selfConfirmedAt??source.reviewedAt??null}});}
 const catalogs=[];for(const version of new Set([1,...facts.map(f=>f.catalogVersion)])){const c=await publishedCatalog(tx,actor.workspaceId,version);catalogs.push({version:c.version,digest:c.definitionDigest,definition:c.definition});}
 return SupplierTransferSchema.parse({version:'once-supplier-transfer-v1',contextWorkspaceId:actor.workspaceId,catalogs:catalogs.sort((a,b)=>a.version-b.version),facts,choices:snapshot.choices.map(({workspaceId,...r})=>r)});
}
function plaintext(bundle:SupplierTransfer,f:SupplierTransfer['facts'][number],keys?:CredentialRebuildKeys){
 invariant(keys?.sourceContactKey.length===32&&keys.targetContactKey.length===32,'REBUILD_SUPPLIER_KEYS_REQUIRED','专业文字重建需要原环境与目标环境密钥',422);
 try{return parseStrictJson(decryptDraftPayload(f.textCiphertext!,keys.sourceContactKey,`supplier-fact:${bundle.contextWorkspaceId}:${f.personId}:${f.id}`));}catch{invariant(false,'REBUILD_SUPPLIER_DECRYPT_FAILED','专业文字解密失败；未写入任何资料',422);}
}
/** Complete graph validation runs before any insert; the DB then enforces the same typed cells. */
export async function validateSupplierRebuild(tx:Tx,actor:Actor,clock:Clock,bundle:TalentTransfer,sources:Array<{id:string;revision:number}>,keys?:CredentialRebuildKeys){
 const s=bundle.supplier;if(!s)return;requirePermission(actor,'sensitive.write');
 const unique=(rows:Array<{id:string}>)=>new Set(rows.map(r=>r.id)).size===rows.length;
 invariant(unique(s.facts)&&unique(s.choices)&&new Set(s.catalogs.map(c=>c.version)).size===s.catalogs.length,'SUPPLIER_TRANSFER_DUPLICATE','专业事实、选项或目录重复',422);
 const current=await tx.find('supplierCatalogs',{workspaceId:actor.workspaceId}),fallback=await publishedCatalog(tx,actor.workspaceId);
 const definitions=[...current.map(c=>({version:c.version,digest:c.definitionDigest,definition:c.definition})),{version:fallback.version,digest:fallback.definitionDigest,definition:fallback.definition}];
 for(const c of s.catalogs){for(const d of definitions){invariant(d.version!==c.version||d.digest===c.digest,'SUPPLIER_CATALOG_CONFLICT','目标目录的版本编号含义不同，停止重建',409);
   const from=d.definition,to=c.definition;for(const f of from.fields){const target=to.fields.find(n=>n.code===f.code);if(target){for(const old of [f,...f.components??[]]){const part=old===f?target:target.components?.find(c=>c.code===old.code);for(const option of old.options??[]){const other=part?.options?.find(o=>o.code===option.code);invariant(!other||other.label===option.label,'SUPPLIER_CATALOG_MEANING','相同选项编码的含义不同，停止重建',409);}}compatibleCatalog({...from,fields:[f],templates:[]},{...to,fields:[target],templates:[]});}}}
  for(const roleCode of new Set([...c.definition.fields.flatMap(f=>f.roles),...c.definition.templates.flatMap(t=>t.roleCode?[t.roleCode]:[])]))invariant((await tx.find('dictionary',{workspaceId:actor.workspaceId,namespace:'role',code:roleCode})).length,'SUPPLIER_CATALOG_ROLE','目标缺少字段目录引用的职业',409);
 }
 const roles=bundle.tables.personRoles,people=new Set(bundle.tables.talentProfiles.map(p=>p.personId));
 for(const f of s.facts){const root=s.facts.find(r=>r.id===f.setId),catalog=s.catalogs.find(c=>c.version===f.catalogVersion),field=catalog?.definition.fields.find(c=>c.code===f.fieldCode),source=sources.find(r=>r.id===f.sourceId);
  invariant(people.has(f.personId)&&root&&root.recordKey==='single'&&root.personId===f.personId&&root.sourceId===f.sourceId&&root.sourceRevision===f.sourceRevision&&root.fieldCode===f.fieldCode&&root.catalogVersion===f.catalogVersion&&root.personRoleId===f.personRoleId&&root.status===f.status&&field&&field.visibility===f.visibility&&source?.revision===f.sourceRevision&&f.originalConfirmation.sourceId===f.sourceId,'SUPPLIER_TRANSFER_REFERENCE','专业事实的归属、来源、目录或记录组不完整',422);
  invariant(f.id===root.id||field.type==='RECORDS'&&f.recordKey!=='single','SUPPLIER_TRANSFER_COMPONENT','普通字段不能夹带记录分项',422);
  invariant(field.owner==='PERSON'?f.personRoleId===null&&f.roleCode===null:roles.some(r=>r.id===f.personRoleId&&r.personId===f.personId&&r.data.roleCode===f.roleCode),'SUPPLIER_TRANSFER_ROLE','专业事实缺少精确职业关系',422);
  invariant(!f.mergeDecisionId||bundle.mergeHistory?.decisions.some(d=>d.id===f.mergeDecisionId),'SUPPLIER_TRANSFER_MERGE_HISTORY','合并过的专业事实须连同合并历史迁移',422);
  const cells=['numberValue','booleanValue','dateValue','codeValue','textCiphertext'] as const,expected={NUMBER:'numberValue',BOOLEAN:'booleanValue',DATE:'dateValue',CODE:'codeValue',TEXT:'textCiphertext'} as const;
  const cell=expected[f.valueType as keyof typeof expected];invariant(f.valueState==='KNOWN'?cells.every(k=>cell===k?f[k]!==null:f[k]===null):cells.every(k=>f[k]===null),'SUPPLIER_TRANSFER_VALUE','专业事实的类型和值不一致',422);
  if(f.textCiphertext){invariant(typeof plaintext(s,f,keys)==='string','SUPPLIER_TRANSFER_VALUE','专业文字值格式无效',422);}
  invariant(Date.parse(f.updatedAt)<=clock.now().getTime()&&Date.parse(f.createdAt)<=Date.parse(f.updatedAt),'SUPPLIER_TRANSFER_TIME','专业事实时间无效',422);
 }
 for(const c of s.choices)invariant(s.facts.some(f=>f.id===c.factId&&f.valueType==='CODE_SET'&&f.valueState==='KNOWN')&&s.choices.filter(n=>n.factId===c.factId&&n.code===c.code).length===1,'SUPPLIER_TRANSFER_CHOICES','专业选项存在重复或缺少所属事实',422);
 const scalar=(f:SupplierTransfer['facts'][number])=>f.valueType==='TEXT'?plaintext(s,f,keys):f.valueType==='CODE_SET'?s.choices.filter(c=>c.factId===f.id).map(c=>c.code):f.numberValue??f.booleanValue??f.dateValue??f.codeValue;
 for(const root of s.facts.filter(r=>r.recordKey==='single')){const c=s.catalogs.find(c=>c.version===root.catalogVersion)!,field=c.definition.fields.find(f=>f.code===root.fieldCode)!,a:ProfessionalAnswer={fieldCode:root.fieldCode,roleCode:root.roleCode,state:root.valueState};
  invariant(root.id===root.setId&&root.componentCode==='value'&&root.valueType===(field.type==='RECORDS'?'STATE':field.type),'SUPPLIER_TRANSFER_TYPE','专业字段类型与目录不符',422);
  if(root.valueState==='KNOWN'){if(field.type==='RECORDS'){const records=new Map<string,Record<string,unknown>>();for(const f of s.facts.filter(f=>f.setId===root.id&&f.id!==root.id)){const component=field.components?.find(c=>c.code===f.componentCode);invariant(component?.type===f.valueType&&f.valueState==='KNOWN','SUPPLIER_TRANSFER_COMPONENT','记录组分项类型不符',422);const values=records.get(f.recordKey)??{};invariant(!Object.hasOwn(values,f.componentCode),'SUPPLIER_TRANSFER_COMPONENT','记录组分项重复',422);values[f.componentCode]=scalar(f);records.set(f.recordKey,values);}a.value=[...records].map(([id,values])=>({id,values}));}else a.value=scalar(root);}
  const input={catalogVersion:c.version,catalogDigest:c.digest,answers:[a]};const historical=structuredClone(c.definition);for(const field of historical.fields)for(const part of [field,...field.components??[]])for(const option of part.options??[])option.status='ACTIVE';validateProfessional(input,historical,roles.filter(r=>r.personId===root.personId).map(r=>String(r.data.roleCode)),undefined,true);
 }
}
export async function applySupplierRebuild(tx:Tx,actor:Actor,clock:Clock,bundle:TalentTransfer,keys?:CredentialRebuildKeys){
 const s=bundle.supplier;if(!s)return;await ensureBuiltinCatalog(tx,actor.workspaceId,clock);
 for(const c of s.catalogs)if(!(await tx.find('supplierCatalogs',{workspaceId:actor.workspaceId,version:c.version})).length){const row:SupplierCatalog={...base(actor.workspaceId,clock),version:c.version,baseVersion:null,state:'PUBLISHED',definition:c.definition,definitionDigest:c.digest,publishedById:actor.membershipId,publishedAt:clock.now().toISOString(),publishReason:'隔离业务重建：按原目录定义和摘要导入',origin:'MEMBER'};await tx.insert('supplierCatalogs',row);}
 for(const f of s.facts){const next:SupplierFact={...f,workspaceId:actor.workspaceId};if(f.textCiphertext)next.textCiphertext=encryptDraftPayload(JSON.stringify(plaintext(s,f,keys)),keys!.targetContactKey,`supplier-fact:${actor.workspaceId}:${f.personId}:${f.id}`);await tx.insert('supplierFacts',next);}
 for(const c of s.choices)await tx.insert('supplierFactChoices',{...c,workspaceId:actor.workspaceId});
}
