import type {MediaPurgeIntent,PurgeObject} from '../../../../packages/core/src/media-purge-model.ts';
export type PurgeObjectRef=Pick<MediaPurgeIntent,'uploadId'|'objectToken'>&Pick<PurgeObject,'part'|'bytes'|'hash'>;
export type ObjectPresence='EXISTS'|'MISSING';
export interface MediaPurgeProvider {
 purgeOwnedNamespace(ref:PurgeObjectRef,signal:AbortSignal):Promise<void>;
 statPurgeObject(ref:PurgeObjectRef,signal:AbortSignal):Promise<ObjectPresence>;
 deleteImmutableObject(ref:PurgeObjectRef,signal:AbortSignal):Promise<void>;
}
