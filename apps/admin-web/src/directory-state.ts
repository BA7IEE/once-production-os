import type {Me} from './dto.ts';
import {DIRECTORY_DIMENSIONS} from '../../../packages/core/src/talent-directory-contract.ts';
import type {SupplierFieldSearch,SupplierFieldFilter} from '../../../packages/core/src/supplier-field-contract.ts';
export type DirectoryDraft=Record<string,string|string[]>;
export interface CandidateContext {personId:string;personRoleId:string|null;pendingRole?:true}
export interface DirectoryState {query:DirectoryDraft;draft:DirectoryDraft;professionalQuery:SupplierFieldSearch;professionalDraft:SupplierFieldSearch;page:number;selected:CandidateContext[];roleChoices:Record<string,string>}
export const emptyDirectoryState=():DirectoryState=>({query:{mode:'TALENT'},draft:{mode:'TALENT'},professionalQuery:{fields:[]},professionalDraft:{fields:[]},page:1,selected:[],roleChoices:{}});
const uuid=(x:unknown):string=>{if(typeof x!=='string'||!(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/).test(x))throw new Error('Invalid ID');return x;};
export const directoryRequest=(draft:DirectoryDraft)=>Object.fromEntries(Object.entries(draft).filter(([,value])=>value!==''&&(!Array.isArray(value)||value.length)).map(([key,value])=>[key,['ageMin','ageMax','heightMin','heightMax','page','pageSize'].includes(key)?Number(value):key==='ageUnknown'?value==='true':value]));
/** History contains only bounded filter codes and scalar comparisons, never fact DTOs or free text. */
function professionalState(raw:unknown,draft=false):SupplierFieldSearch{
 const record=(value:unknown,keys:string[])=>{if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).some(k=>!keys.includes(k)))throw new Error('Invalid professional state');return value as Record<string,unknown>;};
 const term=(value:unknown,allowEmpty=false)=>{if(typeof value!=='string'||!(allowEmpty&&value===''||/^[a-z0-9][a-z0-9_-]{0,59}$/.test(value)))throw new Error('Invalid professional code');return value;};
 const d=record(raw,['roleCode','fields','capabilities']);
 if(!Array.isArray(d.fields)||d.fields.length>10)throw new Error('Invalid professional filters');
 const fields=d.fields.map(value=>{
  const f=record(value,['fieldCode','state','match','codes','min','max','from','until','boolean']);
  if(typeof f.fieldCode!=='string'||f.fieldCode.length>60||!(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){0,3}$/).test(f.fieldCode))throw new Error('Invalid field code');
  if(f.state!==undefined&&(typeof f.state!=='string'||!['KNOWN','DECLARED_NONE','UNKNOWN','NOT_PROVIDED'].includes(f.state))||f.match!==undefined&&(typeof f.match!=='string'||!['ANY','ALL'].includes(f.match)))throw new Error('Invalid professional enum');
  if(f.codes!==undefined){if(!Array.isArray(f.codes)||f.codes.length<1||f.codes.length>30||new Set(f.codes).size!==f.codes.length)throw new Error('Invalid professional choices');f.codes.forEach(c=>term(c));}
  for(const key of ['min','max'])if(f[key]!==undefined&&(typeof f[key]!=='number'||!Number.isFinite(f[key])||Math.abs(f[key])>1e9))throw new Error('Invalid professional range');
  for(const key of ['from','until'])if(f[key]!==undefined){const day=f[key];if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)throw new Error('Invalid professional date');}
  if(f.boolean!==undefined&&typeof f.boolean!=='boolean')throw new Error('Invalid professional boolean');
  if(!draft&&(f.min!==undefined&&f.max!==undefined&&Number(f.min)>Number(f.max)||f.from!==undefined&&f.until!==undefined&&String(f.from)>String(f.until)||f.state!==undefined&&f.state!=='KNOWN'&&['codes','min','max','from','until','boolean'].some(k=>f[k]!==undefined)))throw new Error('Invalid applied professional condition');
  return Object.fromEntries(Object.entries(f).filter(([,v])=>v!==undefined)) as unknown as SupplierFieldFilter;
 });
 const result:SupplierFieldSearch={fields};if(d.roleCode!==undefined)result.roleCode=term(d.roleCode);
 if(d.capabilities!==undefined){if(!Array.isArray(d.capabilities)||d.capabilities.length>10)throw new Error('Invalid capabilities');result.capabilities=d.capabilities.map(value=>{const c=record(value,['capabilityCode','minLevel']),capabilityCode=term(c.capabilityCode,draft);if(c.minLevel!==undefined&&(typeof c.minLevel!=='string'||!['BASIC','WORKING','PROFESSIONAL'].includes(c.minLevel)))throw new Error('Invalid capability level');return {capabilityCode,...(c.minLevel!==undefined?{minLevel:c.minLevel as 'BASIC'|'WORKING'|'PROFESSIONAL'}:{})};});}
 if(!draft&&(new Set(fields.map(f=>f.fieldCode)).size!==fields.length||new Set(result.capabilities?.map(c=>c.capabilityCode)).size!==(result.capabilities?.length??0)||!!result.capabilities?.length&&!result.roleCode))throw new Error('Invalid applied professional filters');
 return structuredClone(result);
}
export function safeDirectoryState(raw:unknown):DirectoryState{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid directory state');
 const d=raw as DirectoryState;if(Object.keys(d).sort().join(',')!=='draft,page,professionalDraft,professionalQuery,query,roleChoices,selected')throw new Error('Unknown directory state');
 const query=(value:DirectoryDraft)=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid query');const result:DirectoryDraft={};for(const [k,v]of Object.entries(value)){
 if(Object.hasOwn(DIRECTORY_DIMENSIONS,k)){const list=Array.isArray(v)?v:[v];if(list.length>20||new Set(list).size!==list.length||list.some(c=>typeof c!=='string'||!(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,59}$/).test(c)))throw new Error('Invalid selection');if(list.length)result[k]=list;}
 else if(k==='q'){if(typeof v!=='string'||v.length>160)throw new Error('Invalid search');result[k]=v;}
 else if(['mode','status','ageUnknown'].includes(k)){const allowed:Record<string,string[]>={mode:['ALL','TALENT','CONTACT'],status:['DRAFT','ACTIVE','ARCHIVED'],ageUnknown:['true','false','']};if(typeof v!=='string'||!allowed[k]!.includes(v))throw new Error('Invalid enum');if(v)result[k]=v;}
 else if(['ageMin','ageMax','heightMin','heightMax'].includes(k)){if(typeof v!=='string'||v!==''&&(!Number.isFinite(Number(v))||Number(v)<0||Number(v)>260))throw new Error('Invalid range');if(v)result[k]=v;}
 else throw new Error('Unknown query field');}return result;};
 const roleChoices:Record<string,string>={};if(!d.roleChoices||typeof d.roleChoices!=='object'||Object.keys(d.roleChoices).length>200)throw new Error('Invalid choices');for(const [id,role]of Object.entries(d.roleChoices))if(role!=='')roleChoices[uuid(id)]=uuid(role);
 if(!Array.isArray(d.selected)||d.selected.length>200)throw new Error('Invalid selection');const selected=d.selected.map(s=>{if(!s||!['personId,personRoleId','pendingRole,personId,personRoleId'].includes(Object.keys(s).sort().join(','))||s.pendingRole!==undefined&&(s.pendingRole!==true||s.personRoleId!==null))throw new Error('Unknown candidate data');return {personId:uuid(s.personId),personRoleId:s.personRoleId===null?null:uuid(s.personRoleId),...(s.pendingRole?{pendingRole:true as const}:{})};});if(new Set(selected.map(s=>s.personId+':'+s.personRoleId)).size!==selected.length)throw new Error('Duplicate choice');
 if(!Number.isSafeInteger(d.page)||d.page<1||d.page>100000)throw new Error('Invalid page');return {query:query(d.query),draft:query(d.draft),professionalQuery:professionalState(d.professionalQuery),professionalDraft:professionalState(d.professionalDraft,true),page:d.page,selected,roleChoices};
}
let active:{membershipId:string;scope:string}|null=null;
/** Noncredential session namespace. Old entries are rejected even after logout and same-user login. */
export function bindDirectoryIdentity(me:Me){active=me.directoryStateScope?{membershipId:me.membershipId,scope:me.directoryStateScope}:null;sanitizeEntry();}
function envelope(){const d=history.state?.onceDirectory;return active&&d?.version===2&&d.membershipId===active.membershipId&&d.scope===active.scope?d:null;}
function sanitizeEntry(){if(history.state?.onceDirectory&&!envelope())history.replaceState(null,'');}
export function clearDirectoryMemory(){active=null;history.replaceState(null,'');}
window.addEventListener('once-session-expired',clearDirectoryMemory);
window.addEventListener('popstate',sanitizeEntry);
export function readDirectoryState(surface:'library'|'candidate'):DirectoryState{try{return safeDirectoryState(envelope()?.views?.[surface]);}catch{return emptyDirectoryState();}}
export function saveDirectoryState(surface:'library'|'candidate',state:DirectoryState){if(!active)return;try{const old=envelope(),views:Record<string,DirectoryState>={};for(const key of ['library','candidate'] as const)if(old?.views?.[key])views[key]=safeDirectoryState(old.views[key]);views[surface]=safeDirectoryState(state);history.replaceState({onceDirectory:{version:2,...active,surface,views}},'');}catch{/* Invalid drafts never enter history. */}}
export function navigateDirectoryPath(path:string){history.pushState(history.state,'',path);}
