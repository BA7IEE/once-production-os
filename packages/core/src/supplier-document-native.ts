import {v} from './validation.ts';
import {SupplierCapabilitySchema,SupplierCredentialSchema,SupplierTranslationSchema,SupplierDay} from './supplier-native-schema.ts';
import type {DocumentDictionary} from './document-schema.ts';
import {invariant} from './errors.ts';
export const NativeDocumentFields=['capabilityDetails','credentials','translation','measurementDetails'] as const;
const measurement=v.object({shoeSizeValue:v.optional(v.string(30,1)),shoeSizeSystem:v.optional(v.enum(['EU','US','UK','CN'])),clothingSizeValue:v.optional(v.string(30,1)),clothingSizeSystem:v.optional(v.enum(['INTL','EU','US','UK','CN'])),measuredOn:v.optional(SupplierDay),datePrecision:v.optional(v.enum(['EXACT_DAY','APPROXIMATE']))});
export function validateNativeDocumentValue(field:typeof NativeDocumentFields[number],input:unknown,dictionary:DocumentDictionary):unknown{
 invariant(dictionary.native,'DOCUMENT_NATIVE_CATALOG','解析缺少专业能力目录',422);
 if(field==='capabilityDetails'){const rows=SupplierCapabilitySchema.parse(input);invariant(rows.length>0&&new Set(rows.map(c=>c.roleCode+':'+c.capabilityCode)).size===rows.length,'DOCUMENT_NATIVE_EMPTY','能力建议为空或重复',422);
  for(const c of rows){const definition=dictionary.native.capabilities.find(d=>d.code===c.capabilityCode);invariant(definition&&dictionary.roles.includes(c.roleCode)&&(!definition.applicableRoleCodes.length||definition.applicableRoleCodes.includes(c.roleCode))&&(!c.levelCode||definition.levelSchemeCode==='ABILITY_5'&&['BASIC','WORKING','PROFESSIONAL'].includes(c.levelCode)),'DOCUMENT_NATIVE_CODE','能力、职业或等级不在当前目录中',422);}return rows;}
 if(field==='credentials'){const rows=SupplierCredentialSchema.parse(input);invariant(rows.length>0,'DOCUMENT_NATIVE_EMPTY','资格建议为空',422);for(const c of rows)invariant((!c.roleCode||dictionary.roles.includes(c.roleCode))&&(!c.issuedOn||!c.expiresOn||c.issuedOn<=c.expiresOn),'DOCUMENT_NATIVE_CREDENTIAL','资格职业或时间无效',422);return rows;}
 if(field==='translation'){const value=SupplierTranslationSchema.parse(input);invariant(dictionary.roles.includes('translator')&&(value.pairs.length>0||value.modeCodes.length>0),'DOCUMENT_NATIVE_EMPTY','没有明确的翻译方向或服务方式',422);
  for(const pair of value.pairs)invariant(pair.sourceLanguageCode!==pair.targetLanguageCode&&dictionary.languages.includes(pair.sourceLanguageCode)&&dictionary.languages.includes(pair.targetLanguageCode),'DOCUMENT_NATIVE_LANGUAGE','语言方向未收录或无效',422);return value;}
 const value=measurement.parse(input);invariant(Object.keys(value).length>0&&!!value.shoeSizeValue===!!value.shoeSizeSystem&&!!value.clothingSizeValue===!!value.clothingSizeSystem,'DOCUMENT_NATIVE_MEASUREMENT','鞋码和服装尺码须同时给出明确的体系，不能由 AI 猜测',422);return value;
}
