import type {Base} from './model.ts';
export type PurgeState='ELIGIBLE'|'CLAIMED'|'DELETE_PENDING'|'DELETE_UNKNOWN'|'DELETE_CONFIRMED'|'ERASED'|'SKIPPED';
export type PurgeObject={part:'original'|'preview';bytes:number;hash:string;state:'PENDING'|'UNKNOWN'|'MISSING'};
/** One immutable plan per asset. Object names are derived server-side, never caller supplied. */
export interface MediaPurgeIntent extends Base {
 assetId:string;uploadId:string;objectToken:string;state:PurgeState;objects:PurgeObject[];
 leaseToken:string|null;leaseUntil:string|null;recoveryEpoch:string;attempts:number;
 nextAttemptAt:string;lastCode:string|null;purgedAt:string|null;
}
export const PURGE_LIMITS=Object.freeze({batch:4,scan:32,leaseMs:60000,retryMs:300000,tickMs:60000});
export const irreversiblePurge=(s:PurgeState)=>['DELETE_PENDING','DELETE_UNKNOWN','DELETE_CONFIRMED','ERASED'].includes(s);
