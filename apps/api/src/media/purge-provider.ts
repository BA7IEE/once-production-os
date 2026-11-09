import type {MediaPurgeIntent,PurgeObject} from '../../../../packages/core/src/media-purge-model.ts';
export type PurgeObjectRef=Pick<MediaPurgeIntent,'uploadId'|'objectToken'>&Pick<PurgeObject,'part'|'bytes'|'hash'>;
export type ObjectPresence='EXISTS'|'MISSING';
export interface MediaPurgeProvider {
 /** Check all known objects first; delete through the namespace receipt, and
  * keep individual absence observations provisional until it succeeds. */
 readonly deferObjectMissingUntilNamespace?:true;
 purgeOwnedNamespace(ref:PurgeObjectRef,signal:AbortSignal):Promise<void>;
 statPurgeObject(ref:PurgeObjectRef,signal:AbortSignal):Promise<ObjectPresence>;
 deleteImmutableObject(ref:PurgeObjectRef,signal:AbortSignal):Promise<void>;
}
