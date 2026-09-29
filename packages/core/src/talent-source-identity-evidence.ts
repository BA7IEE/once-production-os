import type {Actor,Clock,Person,Source} from './model.ts';
import type {Tx} from './store.ts';
import type {DeletionItem} from './deletion-model.ts';
import type {talentSnapshot} from './talent-v2-integrity.ts';
import {PERSON_PAYLOAD_FIELDS,identityContent} from './talent-identity-retention.ts';
import {sourceCurrent,scopeVisible,deletionBlocked} from './policy.ts';
import {digest} from './json.ts';
import {invariant} from './errors.ts';
export const SOURCE_IDENTITY_EVIDENCE='talentSourceIdentityEvidence';
type Snapshot=Awaited<ReturnType<typeof talentSnapshot>>;
export function identityWithdrawalFields(item:Pick<DeletionItem,'detailCode'>){
 const match=/^TD2_SOURCE_IDENTITY_([1-9][0-9]{0,2}):[A-Za-z0-9_-]{43}$/.exec(item.detailCode),mask=Number(match?.[1]);
 invariant(match&&mask<256,'TD2_SOURCE_IDENTITY_PLAN_INVALID','身份字段清理计划格式无效',409);
 return PERSON_PAYLOAD_FIELDS.filter((_,i)=>(mask&(1<<i))!==0);
}
/** Freeze surviving proof separately from the records to be removed, so completion can recheck it. */
export async function identityWithdrawal(data:Snapshot,tx:Tx,actor:Actor,sourceId:string,personId:string,fields:readonly string[],clock:Clock){
 const person=data.people.find(p=>p.id===personId),known=fields.filter(f=>(PERSON_PAYLOAD_FIELDS as readonly string[]).includes(f));
 const evidence=data.evidence.filter(e=>e.personId===personId&&e.sourceId!==sourceId&&fields.includes(String(e.fieldPath)));
 const sources=data.sources.filter(s=>s.id===person?.sourceId||evidence.some(e=>e.sourceId===s.id));
 let blocker:string|null=!person||person.sourceId===sourceId||person.status==='ERASED'||await deletionBlocked(tx,actor.workspaceId,'PERSON',personId)?'TD2_SOURCE_OWNER_UNAVAILABLE':null;
 if(!fields.length||known.length!==fields.length)blocker='TD2_SOURCE_IDENTITY_FIELD_UNREGISTERED';
 for(const row of [...(person?[person]:[]),...sources])if(!await scopeVisible(tx,actor,String(row.scopeId)))blocker='TD2_HIDDEN_DEPENDENCY';
 const current=new Map<string,number>();
 for(const s of sources)if(s.id!==sourceId&&sourceCurrent(s as unknown as Source,clock)&&s.basisMode==='INTERNAL_USE'&&!await deletionBlocked(tx,actor.workspaceId,'SOURCE',s.id))current.set(s.id,Number(s.revision));
 if(person)for(const field of fields)if(!evidence.some(e=>e.fieldPath===field&&e.valueDigest===digest(person[field]??null)&&current.get(String(e.sourceId))===e.sourceRevision))blocker=blocker??'TD2_SOURCE_INDEPENDENT_EVIDENCE_REQUIRED';
 const mask=PERSON_PAYLOAD_FIELDS.reduce((m,f,i)=>m|(fields.includes(f)?1<<i:0),0);
 const hash=digest({person:person?identityContent(person as unknown as Person):null,evidence,sources});
 return {personId,fields:[...fields],blocker,detailCode:`TD2_SOURCE_IDENTITY_${mask}:${Buffer.from(hash,'hex').toString('base64url')}`};
}
