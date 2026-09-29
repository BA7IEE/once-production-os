import {v,uuid,revision,dateIso} from './validation.ts';
import type {LocaleDependency,LocaleText} from './locale-model.ts';
import {localeStructureValid} from './locale-basis.ts';
export const LocaleDependencySchema=v.object({
 id:uuid,workspaceId:uuid,createdAt:dateIso,updatedAt:dateIso,revision,localeTextId:uuid,
 kind:v.enum(['PERSON','WORK','PROJECT','SOURCE']),personId:v.nullable(uuid),workId:v.nullable(uuid),projectId:v.nullable(uuid),sourceSubjectId:v.nullable(uuid),
 sourceId:uuid,sourceRevision:revision,sourceProtectionEpoch:revision,sourceScopeId:uuid,sourceScopeRevision:revision,
 resourceRevision:revision,resourceProtectionEpoch:v.nullable(revision),resourceScopeId:uuid,resourceScopeRevision:revision
});
export interface ImportedLocaleBasis {workspaceId:string;sourceDigest:string;textDigest:string;dependencies:LocaleDependency[];}
export const LocaleBasisSchema=v.object({workspaceId:uuid,sourceDigest:v.string(64,64,/^[a-f0-9]{64}$/),textDigest:v.string(64,64,/^[a-f0-9]{64}$/),dependencies:v.array(LocaleDependencySchema,21,2)});
export const LocaleReviewSchema=v.object({workspaceId:uuid,membershipId:uuid,reviewedAt:dateIso,textDigest:v.string(64,64,/^[a-f0-9]{64}$/)});
export function importedLocaleBasisValid(row:LocaleText){
 if(!row.importedBasis)return true;
 try{const basis=LocaleBasisSchema.parse(row.importedBasis);return localeStructureValid({...row,workspaceId:basis.workspaceId,sourceDigest:basis.sourceDigest,state:'DRAFT',reviewedBy:null,reviewedAt:null},basis.dependencies);}catch{return false;}
}
