import {v,uuid,revision,code} from './validation.ts';
import {DirectoryQuerySchema} from './talent-directory.ts';
const day=v.string(10,10,/^\d{4}-\d{2}-\d{2}$/),questions=v.array(v.string(500,1),20);
export const RequirementValues={roleCode:code,headcount:v.number(1,100),locationCodes:v.array(code,20),startsOn:v.nullable(day),endsOn:v.nullable(day),dateNote:v.string(500),taskNote:v.string(5000),necessary:DirectoryQuerySchema,preferred:DirectoryQuerySchema,questions,status:v.enum(['ACTIVE','ARCHIVED'])};
export const ProjectSelectionSchemas={
 save:v.object({expectedRevision:revision,requirementId:v.optional(uuid),expectedRequirementRevision:v.optional(revision),...RequirementValues}),
 search:v.object({requirementId:uuid,expectedRequirementRevision:revision,page:v.optional(v.number(1,100000)),pageSize:v.optional(v.number(1,100))}),
 nominate:v.object({expectedRevision:revision,requirementId:uuid,expectedRequirementRevision:revision,personId:uuid,personRoleId:uuid,personRoleRevision:revision,workId:v.optional(uuid),workAssetIds:v.array(uuid,12),recommendation:v.string(2000)}),
 clear:v.object({expectedRevision:revision,entryId:uuid,expectedItemRevision:revision,acknowledge:v.enum(['CLEAR_THIS_REQUIREMENT_CONFIRMATIONS'])}),
 link:v.object({expectedRevision:revision,projectId:v.nullable(uuid)}),
 context:v.object({expectedRevision:revision,entryId:uuid,expectedItemRevision:revision,requirementId:uuid,expectedRequirementRevision:revision,recommendation:v.string(5000),questions,outcome:v.enum(['PENDING','SELECTED','DECLINED']),
  price:v.optional(v.nullable(v.object({amountMinor:v.number(0,10000000000),currency:v.enum(['CNY','USD','EUR','HKD']),unit:v.enum(['DAY','PROJECT','HOUR']),scope:v.string(500,4),confirmed:v.enum(['CONFIRMED_FOR_THIS_REQUIREMENT'])}))),
  availability:v.optional(v.nullable(v.object({startsOn:day,endsOn:day,state:v.enum(['AVAILABLE','UNAVAILABLE','TENTATIVE']),note:v.string(1000),confirmed:v.enum(['CONFIRMED_FOR_THIS_REQUIREMENT'])})))})
};
