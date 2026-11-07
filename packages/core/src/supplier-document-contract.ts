/** Shared, browser-safe limits and states for durable whole-document processing. */
export const DOCUMENT_BATCH_LIMITS = Object.freeze({pages:100,pagesPerChunk:4,documentsPerDraft:5,jobsPerDraft:200,chunkAttempts:3});
export const DOCUMENT_ACTIVE_STATES = ['PENDING','PROCESSING','IMAGE_PENDING','IMAGE_PROCESSING','BATCH_RUNNING','BATCH_PAUSED'] as const;
export function documentActive(state:string){return (DOCUMENT_ACTIVE_STATES as readonly string[]).includes(state);}
export interface DocumentBatchSummary {
 id:string;revision:number;assetId:string;state:string;useAi:boolean;totalPages:number|null;
 completedPages:number[];failedPages:number[];pendingPages:number[];reviewPages:number[];
 chunks:number;completedChunks:number;errorCode:string|null;retryMayCharge:boolean;retryAllowed:boolean;
}
export interface DocumentWorkDraft {
 clientItemKey:string;title:string;roleCode:string|null;imageCount:number;canAppend:boolean;
}
