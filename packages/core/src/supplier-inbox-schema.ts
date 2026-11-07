import {v,uuid,revision,dateIso,SourceInput,code} from './validation.ts';
export const InboxKindSchema=v.enum(['UNKNOWN','PERSON_PROFILE','PORTFOLIO','MULTI_PERSON','COMPANY_PROFILE','SHOOT_BRIEF','OTHER']);
const subject=v.object({id:uuid,decision:v.enum(['CREATE','LINK','HOLD','IGNORE']),personId:v.nullable(uuid),expectedPersonRevision:v.nullable(revision),
 profile:v.unknown(),evidencePages:v.array(v.number(1,100),100),professionalReplace:v.array(v.object({id:uuid,revision}),300),
 works:v.array(v.object({id:uuid,title:v.string(160),description:v.string(5000),roleCode:v.string(60),brandDisplayName:v.string(200),dateText:v.string(100),assetIds:v.array(uuid,30),origins:v.array(v.object({chunkId:uuid,workKey:v.string(100,1)}),30)}),20)});
export const SupplierInboxSchemas={
 create:v.object({source:SourceInput,receivedAt:dateIso}),
 add:v.object({expectedRevision:revision,assetId:v.nullable(uuid),url:v.nullable(v.string(2000,1)),note:v.string(2000)}),
 start:v.object({expectedRevision:revision,materialId:uuid,expectedMaterialRevision:revision,useAi:v.boolean(),aiAccepted:v.boolean()}),
 save:v.object({expectedRevision:revision,materialId:uuid,expectedMaterialRevision:revision,materialKind:InboxKindSchema,subjects:v.array(subject,20)}),
 apply:v.object({expectedRevision:revision,materialId:uuid,expectedMaterialRevision:revision,subjectId:uuid,confirmOwnership:v.boolean()}),
 control:v.object({expectedRevision:revision,materialId:uuid,expectedMaterialRevision:revision,action:v.enum(['RESUME','HOLD','IGNORE','ERASE']),aiRetryAccepted:v.boolean()}),
 images:v.object({expectedRevision:revision,materialId:uuid,expectedMaterialRevision:revision,imageKeys:v.array(v.string(160,1),10,1)}),
 close:v.object({expectedRevision:revision,closed:v.boolean()}),
};
