import type {Clock,FieldEvidence,Person,Source} from './model.ts';
import {digest} from './json.ts';
/** Source.internalUseUntil is the transactional projection of the sole INTERNAL_DIRECTORY
 * basis for a self-submission source. Legacy sources have null and retain their real basis.
 * Revocation changes this gate in the same transaction; no cache/worker is an authorization step. */
export function canUseEvidenceForPurpose(source:Source,clock:Clock,purpose='INTERNAL_DIRECTORY'){
 return purpose==='INTERNAL_DIRECTORY'&&(!source.internalUseUntil||Date.parse(source.internalUseUntil)>clock.now().getTime());
}
export function currentIdentity(person:Person,evidence:FieldEvidence[],available:(id:string)=>Source|null|undefined,raw:(id:string)=>Source|null|undefined=available){
 return (['displayName','aliases','intro'] as const).every(field=>{const rows=evidence.filter(e=>e.personId===person.id&&e.fieldPath===field);const self=rows.some(e=>raw(e.sourceId)?.internalUseUntil&&e.valueDigest===digest(person[field]));return self||!!raw(person.sourceId)?.internalUseUntil||!available(person.sourceId)?rows.some(e=>available(e.sourceId)?.revision===e.sourceRevision&&e.valueDigest===digest(person[field])):true;});
}
/** A reviewed self-text source is scoped to that submission. Existing internal authoring
 * cannot attach new people, professional facts or media under someone else's consent. */
export function sourceAllowsInternalAuthoring(source:Source){return !source.internalUseUntil;}
