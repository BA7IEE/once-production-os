import {v,uuid,revision,code,type Parsed} from './validation.ts';
import {invariant} from './errors.ts';
import {ProfessionalDraftSchema} from './supplier-field-validation.ts';
import type {ProfessionalDraft} from './supplier-field-contract.ts';
import {SupplierCapabilitySchema,SupplierCredentialSchema,SupplierTranslationSchema,SupplierDay,SUPPLIER_MEASUREMENT_VALUES} from './supplier-native-schema.ts';

import {SUPPLIER_PROFILE_VERSION,SUPPLIER_CONSENT_VERSION} from './supplier-profile-contract.ts';
export {SUPPLIER_PROFILE_VERSION,SUPPLIER_CONSENT_VERSION,SUPPLIER_FIELD_SCOPE,emptySupplierProfile} from './supplier-profile-contract.ts';
const nullableNumber=(min:number,max:number)=>v.nullable(v.number(min,max,false));
export const SupplierProfileSchema=v.object({
 displayName:v.string(120),aliases:v.array(v.string(120,1),20),intro:v.string(5000),
 roleCodes:v.array(code,20),locationCodes:v.array(code,20),languageCodes:v.array(code,20),skillCodes:v.array(code,30),
 contacts:v.array(v.object({kind:v.enum(['PHONE','EMAIL','WECHAT','OTHER']),value:v.string(200,1)}),10),
 measurements:v.object({heightCm:nullableNumber(50,250),bustCm:nullableNumber(20,250),waistCm:nullableNumber(20,250),hipsCm:nullableNumber(20,250),
  shoeSizeValue:v.optional(v.nullable(v.string(30,1))),shoeSizeSystem:v.optional(v.nullable(v.enum(['EU','US','UK','CN']))),clothingSizeValue:v.optional(v.nullable(v.string(30,1))),clothingSizeSystem:v.optional(v.nullable(v.enum(['INTL','EU','US','UK','CN']))),
  measuredOn:v.optional(v.nullable(SupplierDay)),datePrecision:v.optional(v.enum(['EXACT_DAY','APPROXIMATE','UNKNOWN']))}),
 professional:v.optional(ProfessionalDraftSchema),
 capabilityDetails:v.optional(SupplierCapabilitySchema),credentials:v.optional(SupplierCredentialSchema),translation:v.optional(v.nullable(SupplierTranslationSchema)),
});
type Raw=Parsed<typeof SupplierProfileSchema>;
export type SupplierProfile=Omit<Raw,'professional'|'capabilityDetails'|'credentials'|'translation'|'measurements'> & {professional?:ProfessionalDraft;capabilityDetails?:Raw['capabilityDetails'];credentials?:Raw['credentials'];translation?:Raw['translation'];
 measurements:Pick<Raw['measurements'],'heightCm'|'bustCm'|'waistCm'|'hipsCm'> & Partial<Raw['measurements']>};
export function validateSupplierProfile(value:unknown,confirmed=false):SupplierProfile{
 const profile=SupplierProfileSchema.parse(value);
 for(const field of ['aliases','roleCodes','locationCodes','languageCodes','skillCodes'] as const)
  invariant(new Set(profile[field]).size===profile[field].length,'SUPPLIER_DUPLICATE_VALUE','同类资料不能重复',422);
 invariant(new Set(profile.contacts.map(c=>c.kind+':'+c.value.trim())).size===profile.contacts.length,
  'SUPPLIER_DUPLICATE_CONTACT','联系方式不能重复',422);
 if(confirmed){invariant(profile.displayName.trim().length>0,'SUPPLIER_NAME_REQUIRED','请填写姓名或展示名',422);
  invariant(profile.roleCodes.length>0,'SUPPLIER_ROLE_REQUIRED','请至少选择一个职业',422);}
 if(SUPPLIER_MEASUREMENT_VALUES.some(k=>profile.measurements[k]!=null))invariant(profile.roleCodes.includes('model'),
  'SUPPLIER_MODEL_ROLE_REQUIRED','模特量尺须与模特职业一起保存',422);
 for(const group of ['shoeSize','clothingSize'] as const)invariant(!!profile.measurements[`${group}Value`]===!!profile.measurements[`${group}System`],'SUPPLIER_SIZE_SYSTEM_REQUIRED','鞋码或服装尺码须同时提供数值和尺码体系',422);
 invariant(!profile.measurements.measuredOn||['EXACT_DAY','APPROXIMATE'].includes(profile.measurements.datePrecision??'EXACT_DAY'),'SUPPLIER_MEASUREMENT_DATE','已填写量尺日期时请选择日期精度',422);
 invariant(!profile.measurements.datePrecision||profile.measurements.datePrecision==='UNKNOWN'||!!profile.measurements.measuredOn,'SUPPLIER_MEASUREMENT_DATE','请填写量尺日期或保留未知',422);
 return profile;
}
export const SupplierProfileSchemas={
 create:v.object({schemaVersion:v.enum([SUPPLIER_PROFILE_VERSION]),claimId:v.optional(uuid),grantId:v.optional(uuid),
  consentTextVersion:v.enum([SUPPLIER_CONSENT_VERSION]),consentAccepted:v.boolean(),profile:SupplierProfileSchema}),
 save:v.object({expectedRevision:revision,profile:SupplierProfileSchema}),
 rebase:v.object({expectedRevision:revision,expectedPersonRevision:revision,profile:SupplierProfileSchema,conflictsAcknowledged:v.boolean()}),
 confirm:v.object({expectedRevision:revision,accepted:v.boolean()}),
};
