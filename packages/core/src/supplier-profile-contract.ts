/** Browser-safe values; validation and cryptography stay in the server schema. */
import type {SupplierProfile} from './supplier-profile-schema.ts';
export type {SupplierProfile} from './supplier-profile-schema.ts';
export const SUPPLIER_PROFILE_VERSION='once-supplier-profile-v1';
export const SUPPLIER_CONSENT_VERSION='internal-directory-profile-media-work-2026-11-v1';
export const SUPPLIER_FIELD_SCOPE=['displayName','aliases','intro','profile','roles','locations','languages','capabilities','contacts','measurements','media','work'] as const;
export function emptySupplierProfile():SupplierProfile{return {displayName:'',aliases:[],intro:'',roleCodes:[],locationCodes:[],languageCodes:[],skillCodes:[],contacts:[],measurements:{heightCm:null,bustCm:null,waistCm:null,hipsCm:null}};}
