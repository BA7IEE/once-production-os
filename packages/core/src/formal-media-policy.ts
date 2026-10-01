import type {Clock,Person,TableMap} from './model.ts';
import type {MediaAsset,PersonMedia} from './media-model.ts';
import {mediaUsage} from './media-model.ts';
import type {DeletionTargetKind} from './deletion-model.ts';

/** Transaction-local policy shared by direct reads and batched projections.
 * Adoption replaces intake authority with the formal relation; immutable upload
 * scope remains historical provenance, never an additional grant or restriction. */
export function formalRelationReadable(asset:MediaAsset,relation:PersonMedia,context:{
 workspaceId:string;clock:Clock;person:Person|null|undefined;role:TableMap['personRoles']|null|undefined;
 personAliased:boolean;scopeVisible:(id:string)=>boolean;sourceVisible:(id:string)=>boolean;
 blocked:(kind:DeletionTargetKind,id:string)=>boolean;
}):boolean{
 const {person,role,clock,workspaceId,scopeVisible,sourceVisible,blocked}=context;
 if(asset.workspaceId!==workspaceId||relation.workspaceId!==workspaceId||relation.assetId!==asset.id
  ||mediaUsage(asset)!=='ADOPTED'||relation.usageState!=='ADOPTED'||relation.retiredAt||relation.purgedAt
  ||asset.state==='ERASED'||blocked('ASSET',asset.id)||!relation.sourceId||!sourceVisible(relation.sourceId))return false;
 if(!person||person.workspaceId!==workspaceId||person.id!==relation.personId||person.status==='ERASED'
  ||context.personAliased||blocked('PERSON',person.id)||!scopeVisible(person.scopeId))return false;
 if(relation.personRoleId){
  if(!role||role.workspaceId!==workspaceId||role.id!==relation.personRoleId||role.personId!==person.id||role.status!=='ACTIVE'
   ||!sourceVisible(role.sourceId)||!(!role.validFrom||Date.parse(role.validFrom)<=clock.now().getTime())
   ||!(!role.validUntil||Date.parse(role.validUntil)>clock.now().getTime()))return false;
 }
 return true;
}
