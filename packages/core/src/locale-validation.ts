import {v,uuid,revision} from './validation.ts';
export const localeSubjectKind=v.enum(['PERSON','WORK','PROJECT']);
const sourceRef=v.object({id:uuid,expectedRevision:revision});
const content={text:v.string(10000,1),sourceRefs:v.array(sourceRef,20,1),expectedSubjectRevision:revision,confirmCurrentBasis:v.boolean()};
export const LocaleSchemas={
 create:v.object({subjectKind:localeSubjectKind,subjectId:uuid,locale:v.enum(['zh','en']),...content}),
 update:v.object({expectedRevision:revision,...content})
};
