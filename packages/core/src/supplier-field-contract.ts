/** Shared presentation contract. Facts are validated against an immutable published catalog. */
export const SUPPLIER_FIELDS_VERSION='once-supplier-fields-v1' as const;
export const VALUE_STATES=['KNOWN','DECLARED_NONE','UNKNOWN','NOT_PROVIDED'] as const;
export type ValueState=typeof VALUE_STATES[number];
export type ScalarType='TEXT'|'NUMBER'|'BOOLEAN'|'DATE'|'CODE'|'CODE_SET';
export type FieldOption={code:string;label:string;aliases:string[];status:'ACTIVE'|'DEPRECATED';replacedBy?:string};
export type FieldComponent={code:string;label:string;type:ScalarType;required:boolean;unit?:string;min?:number;max?:number;maxLength?:number;options?:FieldOption[]};
export type SupplierField=Omit<FieldComponent,'type'> & {owner:'PERSON'|'ROLE';roles:string[];type:ScalarType|'RECORDS';
 visibility:'SELF_SHARED'|'INTERNAL';description:string;searchable:boolean;ai:'SUGGEST'|'NEVER';components?:FieldComponent[];maxItems?:number};
export type SupplierTemplate={code:string;label:string;roleCode:string|null;fieldCodes:string[]};
export type SupplierFieldCatalog={schemaVersion:typeof SUPPLIER_FIELDS_VERSION;fields:SupplierField[];templates:SupplierTemplate[]};
export type ProfessionalRecord={id:string;values:Record<string,unknown>};
export type ProfessionalAnswer={fieldCode:string;roleCode:string|null;state:ValueState;value?:unknown};
export type ProfessionalDraft={catalogVersion:number;catalogDigest:string;answers:ProfessionalAnswer[]};
export type SupplierCatalogView={version:number;digest:string;definition:SupplierFieldCatalog};
export interface SupplierFieldFilter {fieldCode:string;state?:ValueState;match?:'ANY'|'ALL';codes?:string[];min?:number;max?:number;from?:string;until?:string;boolean?:boolean}
export interface SupplierFieldSearch {roleCode?:string;fields:SupplierFieldFilter[];capabilities?:Array<{capabilityCode:string;minLevel?:'BASIC'|'WORKING'|'PROFESSIONAL'}>}
export const answerKey=(answer:Pick<ProfessionalAnswer,'fieldCode'|'roleCode'>)=>`${answer.roleCode??'person'}:${answer.fieldCode}`;
export function fieldsForRoles(catalog:SupplierFieldCatalog,roles:string[],internal=false){
 const codes=new Set(catalog.templates.filter(t=>t.roleCode===null||roles.includes(t.roleCode)).flatMap(t=>t.fieldCodes));
 return catalog.fields.filter(f=>codes.has(f.code)&&(internal||f.visibility==='SELF_SHARED'));
}
