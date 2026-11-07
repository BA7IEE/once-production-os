import type {Base} from './model.ts';
import type {SupplierFieldCatalog,ScalarType,ValueState} from './supplier-field-contract.ts';
export interface SupplierCatalog extends Base {version:number;baseVersion:number|null;state:'DRAFT'|'PUBLISHED';definition:SupplierFieldCatalog;definitionDigest:string;publishedById:string|null;publishedAt:string|null;publishReason:string;origin:'SYSTEM'|'MEMBER'}
/** One typed scalar, or one cell of a repeated record. Metadata JSON never contains person facts. */
export interface SupplierFact extends Base {personId:string;personRoleId:string|null;roleCode:string|null;sourceId:string;sourceRevision:number;catalogVersion:number;setId:string;fieldCode:string;recordKey:string;componentCode:string;
 valueType:ScalarType|'STATE';valueState:ValueState;numberValue:number|null;booleanValue:boolean|null;dateValue:string|null;codeValue:string|null;textCiphertext:string|null;status:'ACTIVE'|'RETIRED';visibility:'SELF_SHARED'|'INTERNAL'}
export interface SupplierFactChoice extends Base {factId:string;code:string}
export interface SupplierFieldTables {supplierCatalogs:SupplierCatalog;supplierFacts:SupplierFact;supplierFactChoices:SupplierFactChoice}
