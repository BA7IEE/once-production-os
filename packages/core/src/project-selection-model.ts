import type {Base} from './model.ts';
export interface ProjectRequirement extends Base {
 projectId:string;sourceId:string;sourceRevision:number;roleCode:string;headcount:number;locationCodes:string[];
 startsOn:string|null;endsOn:string|null;dateNote:string;taskNote:string;necessary:Record<string,unknown>;preferred:Record<string,unknown>;questions:string[];status:'ACTIVE'|'ARCHIVED'|'ERASED';
}
export interface SelectionContext {
 recommendation:string;questions:string[];outcome:'PENDING'|'SELECTED'|'DECLINED';
 price:{amountMinor:number;currency:'CNY'|'USD'|'EUR'|'HKD';unit:'DAY'|'PROJECT'|'HOUR';scope:string;confirmedAt:string;confirmedById:string}|null;
 availability:{startsOn:string;endsOn:string;state:'AVAILABLE'|'UNAVAILABLE'|'TENTATIVE';note:string;confirmedAt:string;confirmedById:string}|null;
 updatedAt:string;updatedById:string;
}
