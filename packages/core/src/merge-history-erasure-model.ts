import type {Base} from './model.ts';
export interface MergeHistoryErasure extends Base {
 mergeDecisionId:string; personId:string; sourceId:string;
 recordStatusBefore:'ARCHIVED'|'ERASED'|null;
 recordKind:'PERSON'|'TALENT_PROFILE'|'CASTING_PROFILE'; recordId:string;recordRevision:number;
 recordCreatedAt:string;recordUpdatedAt:string;supersededById:string|null;retiredMeasurementSetId:string|null;erasedAt:string;
 requestId:string|null;actorId:string|null;
 originalWorkspaceId:string|null;originalRequestId:string|null;originalActorId:string|null;
}
