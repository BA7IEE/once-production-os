import type {Base} from './model.ts';
/** Accounting only: never put prompts, source text, credentials or provider bodies here. */
export interface AiBudget extends Base {
 period:string;currency:string;reservedUnits:number;settledUnits:number;frozen:boolean;
}
export interface AiRun extends Base {
 actorId:string;budgetId:string;requestKey:string;requestDigest:string;inputDigest:string;
 providerIdentityHash:string;configRevision:number;recoveryEpoch:string;
 state:'QUEUED'|'RUNNING'|'SUCCEEDED'|'FAILED'|'CANCELLED'|'UNKNOWN';
 reservedUnits:number;settledUnits:number|null;cancelRequested:boolean;
}
export interface AiAttempt extends Base {
 runId:string;attemptNo:number;state:'MAY_HAVE_EXECUTED'|'UNKNOWN'|'SUCCEEDED'|'NOT_EXECUTED';
 requestDigest:string;providerIdempotencyKey:string;settlementDigest:string|null;
}
export interface AiLedgerConfig {
 enabled:boolean;providerIdentityHash:string;configRevision:number;recoveryEpoch:string;
 currency:string;perTaskLimitUnits:number;dailyLimitUnits:number;maxAttempts:number;
}
