import type {Base} from './model.ts';
import type {DocumentDictionary,DocumentManifest,DocumentProposal} from './document-schema.ts';
import type {SupplierProfile} from './supplier-profile-schema.ts';

/** A Source-owned employee inbox. Its id is the Source id; no talent identity is fabricated. */
export interface SupplierInboxBatch extends Base {
 sourceId:string;scopeId:string;maintainerId:string;sourceRevision:number;scopeRevision:number;
 receivedAt:string;recoveryEpoch:string;state:'OPEN'|'CLOSED'|'ERASED';
}
export type InboxMaterialState='WAITING'|'QUEUED'|'PROCESSING'|'READY'|'PAUSED'|'COMPLETE'|'IGNORED'|'ERASED';
export type InboxMaterialKind='UNKNOWN'|'PERSON_PROFILE'|'PORTFOLIO'|'MULTI_PERSON'|'COMPANY_PROFILE'|'SHOOT_BRIEF'|'OTHER';
export interface SupplierInboxMaterial extends Base {
 batchId:string;assetId:string|null;createdById:string;actorId:string;actorRevision:number;userEpoch:number;
 recoveryEpoch:string;state:InboxMaterialState;materialKind:InboxMaterialKind;useAi:boolean;
 personIds:string[];workIds:string[];assetIds:string[];
 leaseToken:string|null;leaseUntil:string|null;runId:string|null;errorCode:string|null;ciphertext:string|null;
}
export interface InboxWorkDraft {
 id:string;title:string;description:string;roleCode:string;brandDisplayName:string;dateText:string;
 assetIds:string[];origins:Array<{chunkId:string;workKey:string}>;
}
export interface InboxSubjectDraft {
 id:string;decision:'CREATE'|'LINK'|'HOLD'|'IGNORE';personId:string|null;expectedPersonRevision:number|null;
 profile:SupplierProfile;evidencePages:number[];professionalReplace:Array<{id:string;revision:number}>;works:InboxWorkDraft[];
 state:'DRAFT'|'APPLIED'|'IGNORED';appliedPersonId:string|null;appliedWorkIds:string[];decidedById:string|null;
}
export interface InboxChunk {
 id:string;pages:number[];manifest:DocumentManifest;proposal:DocumentProposal|null;runId:string|null;actorId:string;sourceRevision:number;
}
export interface InboxMaterialPayload {
 url:string|null;note:string;dictionary:DocumentDictionary;chunks:InboxChunk[];subjects:InboxSubjectDraft[];
 totalPages:number|null;nextPages:number[];attempt:number;aiConfigDigest:string|null;aiPermissionAccepted:boolean;
 pendingManifest:DocumentManifest|null;imageImports:Record<string,string>;requestedImages:string[];
}
export interface SupplierInboxTables {supplierInboxBatches:SupplierInboxBatch;supplierInboxMaterials:SupplierInboxMaterial}
