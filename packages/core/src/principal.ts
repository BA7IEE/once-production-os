import type {CommandPrincipal} from './talent-auth-model.ts';
import {invariant} from './errors.ts';
type PrincipalFields={principalKind:'INTERNAL'|'MACHINE'|'TALENT';actorId:string|null;servicePrincipalId:string|null;talentAccountId:string|null};
type SystemFields={principalKind:'SYSTEM';actorId:null;servicePrincipalId:null;talentAccountId:null};
export function principalFields(actor:CommandPrincipal):PrincipalFields;
export function principalFields(actor:CommandPrincipal|null):PrincipalFields|SystemFields;
export function principalFields(actor:CommandPrincipal|null):PrincipalFields|SystemFields {
 if(!actor)return {principalKind:'SYSTEM' as const,actorId:null,servicePrincipalId:null,talentAccountId:null};
 if(actor.actorKind==='TALENT')return {principalKind:'TALENT' as const,actorId:null,servicePrincipalId:null,talentAccountId:actor.talentAccountId};
 if(actor.actorKind==='MACHINE')return {principalKind:'MACHINE' as const,actorId:null,servicePrincipalId:actor.servicePrincipalId!,talentAccountId:null};
 return {principalKind:'INTERNAL' as const,actorId:actor.membershipId,servicePrincipalId:null,talentAccountId:null};
}
/** Old in-memory fixtures omit the additive kind; persisted records always have it. */
export function normalizePrincipalRow<T extends object>(row:T,systemAllowed:boolean):T {
 const r=row as T & {principalKind?:string;actorId?:string|null;servicePrincipalId?:string|null;talentAccountId?:string|null};
 const fields={actorId:r.actorId??null,servicePrincipalId:r.servicePrincipalId??null,talentAccountId:r.talentAccountId??null};
 const kind=r.principalKind??(fields.talentAccountId?'TALENT':fields.servicePrincipalId?'MACHINE':fields.actorId?'INTERNAL':'SYSTEM');
 const selected=kind==='INTERNAL'?fields.actorId:kind==='MACHINE'?fields.servicePrincipalId:kind==='TALENT'?fields.talentAccountId:null;
 const count=Object.values(fields).filter(x=>x!==null).length;
 invariant(kind==='SYSTEM'?systemAllowed&&count===0:!!selected&&count===1,'PRINCIPAL_INVALID','操作主体无效',400);
 return {...row,...fields,principalKind:kind};
}
