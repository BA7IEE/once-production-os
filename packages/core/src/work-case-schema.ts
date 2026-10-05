import {v,uuid,revision,code,type Parsed} from './validation.ts';
const media=v.object({referenceKind:v.enum(['SUBMISSION_STAGED_ASSET','EXISTING_ADOPTED_ASSET_REFERENCE']),assetId:uuid});
export const workPlanSchema=v.object({clientItemKey:v.string(64,1,/^[A-Za-z0-9_-]+$/),mode:v.enum(['CREATE_EXTERNAL_WORK','LINK_EXISTING_WORK']),targetWorkId:v.nullable(uuid),expectedWorkRevision:v.nullable(revision),personRoleId:v.nullable(uuid),declaredRoleCode:v.nullable(code),title:v.string(160,1),description:v.string(5000),caseDate:v.nullable(v.string(100,1)),datePrecision:v.enum(['UNKNOWN','YEAR','MONTH','DAY','APPROXIMATE']),location:v.string(500),industryCode:v.nullable(code),workTypeCodes:v.array(code,10),brandDisplayName:v.string(200),creditNote:v.string(1000),coverAssetId:v.nullable(uuid),items:v.array(media,30)});
export type WorkPlan=Parsed<typeof workPlanSchema>;
export const workDecisionSchema=v.object({clientItemKey:v.string(64,1),decision:v.enum(['CREATE_NEW','LINK_EXISTING']),targetWorkId:v.nullable(uuid),expectedWorkRevision:v.nullable(revision),basis:v.string(2000,4)});
export type WorkDecision=Parsed<typeof workDecisionSchema>;
export const WorkCaseSchemas={draft:v.object({expectedRevision:revision,works:v.array(workPlanSchema,10)})};
