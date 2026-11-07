import {v,code,type Schema} from './validation.ts';
import {validateScalar} from './supplier-field-validation.ts';
export const SupplierDay:Schema<string>={json:{type:'string',format:'date'},parse(value){return validateScalar(value,{code:'date',label:'日期',type:'DATE',required:false}) as string;}};
export const SupplierCapabilitySchema=v.array(v.object({roleCode:code,capabilityCode:v.string(80,1,/^[a-z0-9_]+$/),levelCode:v.nullable(v.enum(['BASIC','WORKING','PROFESSIONAL','FLUENT','NATIVE']))}),100);
export const SupplierCredentialSchema=v.array(v.object({roleCode:v.nullable(code),credentialTypeCode:v.enum(['DRONE_LICENSE','TRANSLATION_CERTIFICATE','DIVING_CERTIFICATE','EQUIPMENT_CERTIFICATE','OTHER']),credentialName:v.string(200,1),issuerName:v.nullable(v.string(200,1)),issuedOn:v.nullable(SupplierDay),expiresOn:v.nullable(SupplierDay)}),30);
export const SupplierTranslationSchema=v.object({pairs:v.array(v.object({sourceLanguageCode:code,targetLanguageCode:code}),30),modeCodes:v.array(v.enum(['BUSINESS_MEETING','ON_SET','ESCORT','CONSECUTIVE','SIMULTANEOUS','WRITTEN']),6)});
export * from './supplier-native-contract.ts';
