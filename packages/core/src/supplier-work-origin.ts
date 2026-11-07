import type {TalentSubmissionItem} from './talent-maintenance-model.ts';
import {digest} from './json.ts';

export interface DocumentWorkOrigin {
 assetId:string;sha256:string;jobId:string;workKey:string;
 evidence:Array<{page:number;bbox:number[]|null;kind:'TEXT'|'VISUAL'}>;
}
export function documentWorkKey(jobId:string,workKey:string){return 'document-'+digest({jobId,workKey}).slice(0,32);}
/** Server-authored provenance only; work form input cannot replace these origins. */
export function documentWorkOrigins(item:TalentSubmissionItem):DocumentWorkOrigin[]{
 return Array.isArray(item.baseline.originDocuments)?item.baseline.originDocuments as DocumentWorkOrigin[]:[];
}
export function documentWorkContains(item:TalentSubmissionItem,jobId:string,workKey:string){
 return item.clientItemKey===documentWorkKey(jobId,workKey)||documentWorkOrigins(item).some(o=>o.jobId===jobId&&o.workKey===workKey);
}
