import type {Me} from './dto.ts';
import {DIRECTORY_DIMENSIONS} from '../../../packages/core/src/talent-directory-contract.ts';
export type DirectoryDraft=Record<string,string|string[]>;
export interface CandidateContext {personId:string;personRoleId:string|null;pendingRole?:true}
export interface DirectoryState {query:DirectoryDraft;draft:DirectoryDraft;page:number;selected:CandidateContext[];roleChoices:Record<string,string>}
export const emptyDirectoryState=():DirectoryState=>({query:{mode:'TALENT'},draft:{mode:'TALENT'},page:1,selected:[],roleChoices:{}});
const uuid=(x:unknown):string=>{if(typeof x!=='string'||!(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/).test(x))throw new Error('Invalid ID');return x;};
export const directoryRequest=(draft:DirectoryDraft)=>Object.fromEntries(Object.entries(draft).filter(([,value])=>value!==''&&(!Array.isArray(value)||value.length)).map(([key,value])=>[key,['ageMin','ageMax','heightMin','heightMax','page','pageSize'].includes(key)?Number(value):key==='ageUnknown'?value==='true':value]));
export function safeDirectoryState(raw:unknown):DirectoryState{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid directory state');
 const d=raw as DirectoryState;if(Object.keys(d).sort().join(',')!=='draft,page,query,roleChoices,selected')throw new Error('Unknown directory state');
 const query=(value:DirectoryDraft)=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid query');const result:DirectoryDraft={};for(const [k,v]of Object.entries(value)){
 if(Object.hasOwn(DIRECTORY_DIMENSIONS,k)){const list=Array.isArray(v)?v:[v];if(list.length>20||new Set(list).size!==list.length||list.some(c=>typeof c!=='string'||!(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,59}$/).test(c)))throw new Error('Invalid selection');if(list.length)result[k]=list;}
 else if(k==='q'){if(typeof v!=='string'||v.length>160)throw new Error('Invalid search');result[k]=v;}
 else if(['mode','status','ageUnknown'].includes(k)){const allowed:Record<string,string[]>={mode:['ALL','TALENT','CONTACT'],status:['DRAFT','ACTIVE','ARCHIVED'],ageUnknown:['true','false','']};if(typeof v!=='string'||!allowed[k]!.includes(v))throw new Error('Invalid enum');if(v)result[k]=v;}
 else if(['ageMin','ageMax','heightMin','heightMax'].includes(k)){if(typeof v!=='string'||v!==''&&(!Number.isFinite(Number(v))||Number(v)<0||Number(v)>260))throw new Error('Invalid range');if(v)result[k]=v;}
 else throw new Error('Unknown query field');}return result;};
 const roleChoices:Record<string,string>={};if(!d.roleChoices||typeof d.roleChoices!=='object'||Object.keys(d.roleChoices).length>200)throw new Error('Invalid choices');for(const [id,role]of Object.entries(d.roleChoices))if(role!=='')roleChoices[uuid(id)]=uuid(role);
 if(!Array.isArray(d.selected)||d.selected.length>200)throw new Error('Invalid selection');const selected=d.selected.map(s=>{if(!s||!['personId,personRoleId','pendingRole,personId,personRoleId'].includes(Object.keys(s).sort().join(','))||s.pendingRole!==undefined&&(s.pendingRole!==true||s.personRoleId!==null))throw new Error('Unknown candidate data');return {personId:uuid(s.personId),personRoleId:s.personRoleId===null?null:uuid(s.personRoleId),...(s.pendingRole?{pendingRole:true as const}:{})};});if(new Set(selected.map(s=>s.personId+':'+s.personRoleId)).size!==selected.length)throw new Error('Duplicate choice');
 if(!Number.isSafeInteger(d.page)||d.page<1||d.page>100000)throw new Error('Invalid page');return {query:query(d.query),draft:query(d.draft),page:d.page,selected,roleChoices};
}
let active:{membershipId:string;scope:string}|null=null;
/** Noncredential session namespace. Old entries are rejected even after logout and same-user login. */
export function bindDirectoryIdentity(me:Me){active=me.directoryStateScope?{membershipId:me.membershipId,scope:me.directoryStateScope}:null;sanitizeEntry();}
function envelope(){const d=history.state?.onceDirectory;return active&&d?.version===1&&d.membershipId===active.membershipId&&d.scope===active.scope?d:null;}
function sanitizeEntry(){if(history.state?.onceDirectory&&!envelope())history.replaceState(null,'');}
export function clearDirectoryMemory(){active=null;history.replaceState(null,'');}
window.addEventListener('once-session-expired',clearDirectoryMemory);
window.addEventListener('popstate',sanitizeEntry);
export function readDirectoryState(surface:'library'|'candidate'):DirectoryState{try{return safeDirectoryState(envelope()?.views?.[surface]);}catch{return emptyDirectoryState();}}
export function saveDirectoryState(surface:'library'|'candidate',state:DirectoryState){if(!active)return;try{const old=envelope(),views:Record<string,DirectoryState>={};for(const key of ['library','candidate'] as const)if(old?.views?.[key])views[key]=safeDirectoryState(old.views[key]);views[surface]=safeDirectoryState(state);history.replaceState({onceDirectory:{version:1,...active,surface,views}},'');}catch{/* Invalid drafts never enter history. */}}
export function navigateDirectoryPath(path:string){history.pushState(history.state,'',path);}
