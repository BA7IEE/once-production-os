import { v, uuid, revision, dateIso, code, type Schema } from './validation.ts';
import { invariant } from './errors.ts';
import { TALENT_SCHEMA_VERSION } from './talent-v2-model.ts';
export const TD2_FACTS = {
  "talentProfiles": {
    "slug": "profile",
    "ownerKey": "talentProfileId",
    "fields": {
      "internalSummary": "text",
      "status": "enum:ACTIVE,ARCHIVED"
    },
    "required": [],
    "immutable": [],
    "period": false
  },
  "personRoles": {
    "slug": "roles",
    "ownerKey": "personRoleId",
    "fields": {
      "roleCode": "text",
      "validFrom": "time?",
      "validUntil": "time?",
      "status": "enum:ACTIVE,INACTIVE"
    },
    "required": [
      "roleCode"
    ],
    "immutable": [
      "roleCode"
    ],
    "period": true
  },
  "personCapabilities": {
    "slug": "capabilities",
    "ownerKey": "personCapabilityId",
    "fields": {
      "personRoleId": "uuid?",
      "capabilityCode": "text",
      "levelCode": "enum:BASIC,WORKING,PROFESSIONAL,FLUENT,NATIVE?",
      "validFrom": "time?",
      "validUntil": "time?",
      "status": "enum:ACTIVE,INACTIVE"
    },
    "required": [
      "capabilityCode"
    ],
    "immutable": [
      "personRoleId",
      "capabilityCode"
    ],
    "period": true
  },
  "personLanguages": {
    "slug": "languages",
    "ownerKey": "personLanguageId",
    "fields": {
      "languageCode": "text",
      "speakingLevelCode": "enum:BASIC,WORKING,PROFESSIONAL,FLUENT,NATIVE?",
      "listeningLevelCode": "enum:BASIC,WORKING,PROFESSIONAL,FLUENT,NATIVE?",
      "readingLevelCode": "enum:BASIC,WORKING,PROFESSIONAL,FLUENT,NATIVE?",
      "writingLevelCode": "enum:BASIC,WORKING,PROFESSIONAL,FLUENT,NATIVE?",
      "validFrom": "time?",
      "validUntil": "time?",
      "status": "enum:ACTIVE,INACTIVE"
    },
    "required": [
      "languageCode"
    ],
    "immutable": [
      "languageCode"
    ],
    "period": true
  },
  "talentLocations": {
    "slug": "locations",
    "ownerKey": "talentLocationId",
    "fields": {
      "locationCode": "text",
      "relationCode": "enum:BASE,SERVICE",
      "validFrom": "time?",
      "validUntil": "time?",
      "status": "enum:ACTIVE,INACTIVE"
    },
    "required": [
      "locationCode",
      "relationCode"
    ],
    "immutable": [],
    "period": true
  },
  "castingProfiles": {
    "slug": "casting",
    "ownerKey": "castingProfileId",
    "fields": {
      "hairColorCode": "enum:BLACK,BROWN,BLONDE,RED,GRAY,WHITE,OTHER?",
      "eyeColorCode": "enum:BLACK,BROWN,BLUE,GREEN,GRAY,HAZEL,OTHER?",
      "appearanceObservedOn": "day?"
    },
    "required": [],
    "immutable": [],
    "period": false
  },
  "measurementSets": {
    "slug": "measurements",
    "ownerKey": "measurementSetId",
    "fields": {
      "measuredOn": "day",
      "datePrecision": "enum:EXACT_DAY,APPROXIMATE",
      "heightCm": "float?",
      "bustCm": "float?",
      "waistCm": "float?",
      "hipsCm": "float?",
      "shoeSizeValue": "text?",
      "shoeSizeSystem": "enum:EU,US,UK,CN?",
      "clothingSizeValue": "text?",
      "clothingSizeSystem": "enum:INTL,EU,US,UK,CN?",
      "supersedesId": "uuid?"
    },
    "required": [
      "measuredOn",
      "datePrecision"
    ],
    "immutable": [
      "supersedesId"
    ],
    "period": false
  },
  "adultEligibilities": {
    "slug": "adult-eligibility",
    "ownerKey": "adultEligibilityId",
    "fields": {
      "state": "enum:UNKNOWN,SELF_DECLARED_ADULT,RESTRICTED",
      "validUntil": "time?",
      "evidenceAssetId": "uuid?",
      "status": "enum:ACTIVE,INACTIVE"
    },
    "required": [
      "state"
    ],
    "immutable": [
      "evidenceAssetId"
    ],
    "period": false
  },
  "representations": {
    "slug": "representations",
    "ownerKey": "representationId",
    "fields": {
      "personRoleId": "uuid?",
      "agencyOrganizationId": "uuid?",
      "agentPersonId": "uuid?",
      "relationCode": "enum:AGENT,AGENCY,MANAGER",
      "territoryCode": "text?",
      "validFrom": "time?",
      "validUntil": "time?",
      "status": "enum:ACTIVE,INACTIVE"
    },
    "required": [
      "relationCode"
    ],
    "immutable": [
      "personRoleId",
      "agencyOrganizationId",
      "agentPersonId"
    ],
    "period": true
  },
  "personExternalRefs": {
    "slug": "external-refs",
    "ownerKey": "personExternalRefId",
    "fields": {
      "providerCode": "enum:WECHAT,XIAOHONGSHU,INSTAGRAM,AGENCY_INTERNAL,SUPPLIER_SYSTEM",
      "namespaceCode": "text",
      "issuerOrganizationId": "uuid?",
      "externalKey": "text"
    },
    "required": [
      "providerCode",
      "namespaceCode",
      "externalKey"
    ],
    "immutable": [
      "providerCode",
      "namespaceCode",
      "issuerOrganizationId",
      "externalKey"
    ],
    "period": false
  },
  "personCredentials": {
    "slug": "credentials",
    "ownerKey": "personCredentialId",
    "fields": {
      "personRoleId": "uuid?",
      "credentialTypeCode": "enum:DRONE_LICENSE,TRANSLATION_CERTIFICATE,DIVING_CERTIFICATE,EQUIPMENT_CERTIFICATE,OTHER",
      "issuerOrganizationId": "uuid?",
      "issuerName": "text?",
      "issuedOn": "day?",
      "expiresOn": "day?",
      "evidenceAssetId": "uuid?"
    },
    "required": [
      "credentialTypeCode"
    ],
    "immutable": [
      "personRoleId",
      "issuerOrganizationId",
      "evidenceAssetId"
    ],
    "period": false
  },
  "translatorLanguagePairs": {
    "slug": "translation-pairs",
    "ownerKey": "translatorLanguagePairId",
    "fields": {
      "personRoleId": "uuid",
      "sourceLanguageCode": "text",
      "targetLanguageCode": "text",
      "status": "enum:ACTIVE,INACTIVE"
    },
    "required": [
      "personRoleId",
      "sourceLanguageCode",
      "targetLanguageCode"
    ],
    "immutable": [
      "personRoleId",
      "sourceLanguageCode",
      "targetLanguageCode"
    ],
    "period": false
  },
  "translatorServiceModes": {
    "slug": "translation-modes",
    "ownerKey": "translatorServiceModeId",
    "fields": {
      "personRoleId": "uuid",
      "modeCode": "enum:BUSINESS_MEETING,ON_SET,ESCORT,CONSECUTIVE,SIMULTANEOUS,WRITTEN",
      "status": "enum:ACTIVE,INACTIVE"
    },
    "required": [
      "personRoleId",
      "modeCode"
    ],
    "immutable": [
      "personRoleId",
      "modeCode"
    ],
    "period": false
  },
  "mediaCollections": {
    "slug": "collections",
    "ownerKey": "mediaCollectionId",
    "fields": {
      "personRoleId": "uuid?",
      "collectionTypeCode": "enum:MODEL_CARD,POLAROIDS,PORTFOLIO,SHOWREEL,INTRO_VIDEO,OTHER",
      "title": "text",
      "status": "enum:ACTIVE,ARCHIVED"
    },
    "required": [
      "collectionTypeCode",
      "title"
    ],
    "immutable": [
      "personRoleId"
    ],
    "period": false
  },
  "mediaCollectionTags": {
    "slug": "collection-tags",
    "ownerKey": "mediaCollectionTagId",
    "fields": {
      "collectionId": "uuid",
      "tagCode": "enum:FASHION,BEAUTY,COMMERCIAL,LINGERIE,RUNWAY,LIFESTYLE,INDUSTRIAL,PRODUCT"
    },
    "required": [
      "collectionId",
      "tagCode"
    ],
    "immutable": [
      "collectionId",
      "tagCode"
    ],
    "period": false
  }
} as const;
export type FactTable = keyof typeof TD2_FACTS;
export type FactRow = import('./model.ts').Base & { personId: string; sourceId: string; [key: string]: unknown };
export const TD2_TABLES = Object.keys(TD2_FACTS) as FactTable[];
export const VERSION = v.enum([TALENT_SCHEMA_VERSION]);
export const day: Schema<string> = { json: { type: 'string', format: 'date' }, parse(x, path='') {
    const value = v.string(10,10,/^\d{4}-\d{2}-\d{2}$/).parse(x,path);
    const time = new Date(value+'T00:00:00.000Z');
    invariant(Number.isFinite(time.getTime()) && time.toISOString().slice(0,10)===value,
        'VALIDATION_FAILED','日期必须是真实日历日期',400); return value;
}};
export function fieldSchema(type: string, name: string): Schema<unknown> {
    if(type.endsWith('?')) return v.nullable(fieldSchema(type.slice(0,-1),name));
    if(type.startsWith('enum:')) return v.enum(type.slice(5).split(','));
    if(type==='uuid') return uuid;
    if(type==='time') return dateIso;
    if(type==='day') return day;
    if(type==='float') return v.number(name==='heightCm'?40:10,name==='heightCm'?260:300,false);
    if(type==='int') return v.number(0,10000);
    if(type==='bool') return v.boolean();
    if(type==='texts') return v.array(v.string(120,1),30);
    if(name==='namespaceCode') return v.string(80,0,/^[a-zA-Z0-9._:-]*$/);
    if(name==='internalSummary') return v.string(5000);
    if(name==='externalKey') return v.string(180,1);
    if(name.endsWith('Code')) return code;
    return v.string(name==='title'?200:1000,name==='title'?1:0);
}
export function valuesSchema(table: FactTable, patch=false): Schema<Record<string,unknown>> {
    const def=TD2_FACTS[table], shape: Record<string,Schema<unknown>>={};
    for(const [key,type] of Object.entries(def.fields)){
        if(patch && (def.immutable as readonly string[]).includes(key)) continue;
        const schema=fieldSchema(type,key);
        shape[key]=!patch && (def.required as readonly string[]).includes(key)? schema:v.optional(schema);
    }
    return v.object(shape);
}
export const FACT_SCHEMAS = Object.fromEntries(TD2_TABLES.map(table=>[table,{
    create:v.object({schemaVersion:VERSION,expectedPersonRevision:revision,sourceId:uuid,sourceRevision:revision,values:valuesSchema(table)}),
    patch:v.object({schemaVersion:VERSION,expectedPersonRevision:revision,expectedRevision:revision,sourceId:uuid,sourceRevision:revision,values:valuesSchema(table,true)})
}])) as Record<FactTable,{create:Schema<FactInput>;patch:Schema<FactInput>}>;
export interface FactInput {schemaVersion:string;expectedPersonRevision:number;expectedRevision?:number;sourceId:string;sourceRevision:number;values:Record<string,unknown>}
export const TD2Schemas={
    personCreate:v.object({schemaVersion:VERSION,originSourceId:uuid,sourceRevision:revision,displayName:v.string(120,1),aliases:v.optional(v.array(v.string(120,1),20)),intro:v.optional(v.string(5000)),createTalent:v.optional(v.boolean())}),
    personPatch:v.object({schemaVersion:VERSION,expectedRevision:revision,displayName:v.optional(v.string(120,1)),aliases:v.optional(v.array(v.string(120,1),20)),intro:v.optional(v.string(5000)),status:v.optional(v.enum(['DRAFT','ACTIVE','ARCHIVED']))}),
    enroll:v.object({schemaVersion:VERSION,expectedRevision:revision,sourceRevision:revision}),
    heightReviewDismiss:v.object({schemaVersion:VERSION,expectedRevision:revision,expectedPersonRevision:revision,sourceRevision:revision,resolution:v.enum(['DO_NOT_USE_LEGACY_HEIGHT']),acknowledge:v.boolean()}),
    credentialSecretClear:v.object({schemaVersion:VERSION,expectedRevision:revision,expectedPersonRevision:revision,sourceRevision:revision,acknowledge:v.boolean()}),
    factConfirm:v.object({schemaVersion:VERSION,expectedRevision:revision,expectedPersonRevision:revision,sourceRevision:revision}),
    adultVerify:v.object({schemaVersion:VERSION,expectedRevision:revision,expectedPersonRevision:revision,sourceRevision:revision,evidenceAssetId:uuid,validUntil:dateIso}),
    evidence:v.object({schemaVersion:VERSION,ownerKind:v.enum(['person',...TD2_TABLES]),ownerId:uuid,fieldPath:v.string(80,1),expectedRevision:revision,sourceId:uuid,sourceRevision:revision}),
    proposal:v.object({schemaVersion:VERSION,ownerKind:v.enum(['person',...TD2_TABLES]),ownerId:uuid,fieldPath:v.string(80,1),expectedRevision:revision,sourceId:uuid,sourceRevision:revision,proposedValue:v.unknown()}),
    decide:v.object({schemaVersion:VERSION,expectedRevision:revision,decision:v.enum(['APPLY','REJECT'])}),
    registryCreate:v.object({schemaVersion:VERSION,code,labelZh:v.string(120,1),labelEn:v.string(120),aliases:v.array(v.string(120,1),30),applicableRoleCodes:v.array(code,20),levelSchemeCode:v.nullable(v.enum(['ABILITY_5'])),semanticVersion:v.string(30,5,/^\d+\.\d+\.\d+$/)}),
    registryPatch:v.object({schemaVersion:VERSION,expectedRevision:revision,labelZh:v.optional(v.string(120,1)),labelEn:v.optional(v.string(120)),status:v.optional(v.enum(['ACTIVE','INACTIVE']))}),
    organization:v.object({schemaVersion:VERSION,sourceId:uuid,sourceRevision:revision,name:v.string(200,1),kind:v.enum(['AGENCY','ISSUER','OTHER'])}),
    collectionAdd:v.object({schemaVersion:VERSION,expectedRevision:revision,expectedPersonRevision:revision,assetId:uuid,caption:v.optional(v.string(1000)),featured:v.optional(v.boolean())}),
    collectionRemove:v.object({schemaVersion:VERSION,expectedRevision:revision,expectedPersonRevision:revision,itemId:uuid}),
    collectionOrder:v.object({schemaVersion:VERSION,expectedRevision:revision,expectedPersonRevision:revision,itemIds:v.array(uuid,200,1)}),
    credentialSecret:v.object({schemaVersion:VERSION,expectedRevision:revision,expectedPersonRevision:revision,identifier:v.string(180,1)}),
    principalCreate:v.object({schemaVersion:VERSION,displayName:v.string(120,1),scopeId:uuid,defaultMaintainerMembershipId:uuid,permissionCodes:v.array(v.enum(['records.read','sources.read','talent.propose','talent.fact.write']),4,1),expiresAt:dateIso}),
    principalChange:v.object({schemaVersion:VERSION,expectedRevision:revision}),
    shortlistRole:v.object({schemaVersion:VERSION,expectedRevision:revision,itemId:uuid,personRoleId:uuid,personRoleRevision:revision})
};
export const OWNER_KEYS = {person:'personId',...Object.fromEntries(TD2_TABLES.map(t=>[t,TD2_FACTS[t].ownerKey]))} as Record<string,string>;
export function rowDefaults(table: FactTable): Record<string,unknown> {
    const raw:Record<string,unknown>={};
    for(const [key,type] of Object.entries(TD2_FACTS[table].fields) as [string,string][]){
        raw[key]=type.endsWith('?')?null:type==='texts'?[]:type.startsWith('enum:')?type.slice(5).split(',')[0]:type==='bool'?false:type==='int'?0:'';
    }
    if(table==='measurementSets') raw.status='DRAFT';
    if(table==='personCredentials') {raw.status='UNVERIFIED';raw.identifierCiphertext=null;raw.maskedIdentifier=null;}
    if(table==='personExternalRefs') {raw.state='OBSERVED';raw.verifiedAt=null;}
    if(table==='personLanguages'||table==='talentLocations') raw.verifiedAt=null;
    if(table==='adultEligibilities') {raw.verifiedAt=null;raw.verifiedByMembershipId=null;raw.originalVerificationWorkspaceId=null;raw.originalVerificationMembershipId=null;}
    if(table==='castingProfiles') raw.currentMeasurementSetId=null;
    return raw;
}
