import {v} from './validation.ts';
export const CommandInspectionSchema=v.object({operation:v.string(120,1),commandKey:v.string(128,8)});
export const ReviewQuerySchema=v.object({view:v.enum(['TODO','SENT','DONE']),kind:v.enum(['ALL','CLAIM','SUBMISSION','SOURCE_REVIEW','INGESTION']),page:v.number(1,100000,true),pageSize:v.number(1,100,true)});
