import type { Base } from './model.ts';
export const LEGACY_TALENT_SCHEMA_VERSION = 'once-talent-v2.0.0' as const;
export const TALENT_SCHEMA_VERSION = 'once-talent-v2.1.0' as const;
export interface TalentProfile extends Base {
    supersededById?: string | null;
    personId: string;
    sourceId: string;
    genderCode?: 'FEMALE'|'MALE'|'NON_BINARY'|'OTHER'|null;
    birthPrecision?: 'UNKNOWN'|'EXACT_DATE'|'YEAR_ONLY'|'DECLARED_RANGE';
    birthDate?: string|null; birthYear?: number|null; minAgeYears?: number|null; maxAgeYears?: number|null; ageAsOfDate?: string|null;
    nationalityCodes?: string[]; coverAssetId?: string|null;
    internalSummary: string;
    status: 'ACTIVE' | 'ARCHIVED';
}
export interface PersonRole extends Base {
    personId: string;
    sourceId: string;
    castingMarketCode?: 'UNCLASSIFIED'|'DOMESTIC'|'INTERNATIONAL';
    experienceCode?: 'UNSPECIFIED'|'AMATEUR'|'PROFESSIONAL';
    styleCodes?: string[]; serviceCodes?: string[];
    roleCode: string;
    validFrom: string | null;
    validUntil: string | null;
    status: 'ACTIVE' | 'INACTIVE';
}
export interface CapabilityDefinition extends Base {
    code: string;
    labelZh: string;
    labelEn: string;
    aliases: string[];
    applicableRoleCodes: string[];
    levelSchemeCode: string | null;
    semanticVersion: string;
    schemaVersion: string;
    status: 'ACTIVE' | 'INACTIVE';
}
export interface PersonCapability extends Base {
    personId: string;
    sourceId: string;
    personRoleId: string | null;
    capabilityCode: string;
    levelCode: 'BASIC' | 'WORKING' | 'PROFESSIONAL' | 'FLUENT' | 'NATIVE' | null;
    validFrom: string | null;
    validUntil: string | null;
    status: 'ACTIVE' | 'INACTIVE';
}
export interface PersonLanguage extends Base {
    personId: string;
    sourceId: string;
    languageCode: string;
    speakingLevelCode: 'BASIC' | 'WORKING' | 'PROFESSIONAL' | 'FLUENT' | 'NATIVE' | null;
    listeningLevelCode: 'BASIC' | 'WORKING' | 'PROFESSIONAL' | 'FLUENT' | 'NATIVE' | null;
    readingLevelCode: 'BASIC' | 'WORKING' | 'PROFESSIONAL' | 'FLUENT' | 'NATIVE' | null;
    writingLevelCode: 'BASIC' | 'WORKING' | 'PROFESSIONAL' | 'FLUENT' | 'NATIVE' | null;
    verifiedAt: string | null;
    validFrom: string | null;
    validUntil: string | null;
    status: 'ACTIVE' | 'INACTIVE';
}
export interface TalentLocation extends Base {
    personId: string;
    sourceId: string;
    locationCode: string;
    relationCode: 'BASE' | 'SERVICE';
    verifiedAt: string | null;
    validFrom: string | null;
    validUntil: string | null;
    status: 'ACTIVE' | 'INACTIVE';
}
export interface CastingProfile extends Base {
    supersededById?: string | null;
    retiredCurrentMeasurementSetId?: string | null;
    personId: string;
    sourceId: string;
    hairColorCode: 'BLACK' | 'BROWN' | 'BLONDE' | 'RED' | 'GRAY' | 'WHITE' | 'OTHER' | null;
    eyeColorCode: 'BLACK' | 'BROWN' | 'BLUE' | 'GREEN' | 'GRAY' | 'HAZEL' | 'OTHER' | null;
    appearanceObservedOn: string | null;
    currentMeasurementSetId: string | null;
}
export interface MeasurementSet extends Base {
    personId: string;
    sourceId: string;
    measuredOn: string|null;
    reportedAt?:string|null;
    datePrecision: 'EXACT_DAY' | 'APPROXIMATE' | 'UNKNOWN';
    heightCm: number | null;
    bustCm: number | null;
    waistCm: number | null;
    hipsCm: number | null;
    shoeSizeValue: string | null;
    shoeSizeSystem: 'EU' | 'US' | 'UK' | 'CN' | null;
    clothingSizeValue: string | null;
    clothingSizeSystem: 'INTL' | 'EU' | 'US' | 'UK' | 'CN' | null;
    supersedesId: string | null;
    status: 'DRAFT' | 'CONFIRMED' | 'SUPERSEDED';
}
export interface AdultEligibility extends Base {
    originalVerificationWorkspaceId?: string | null;
    originalVerificationMembershipId?: string | null;
    personId: string;
    sourceId: string;
    state: 'UNKNOWN' | 'SELF_DECLARED_ADULT' | 'VERIFIED_ADULT' | 'RESTRICTED';
    verifiedByMembershipId: string | null;
    verifiedAt: string | null;
    validUntil: string | null;
    evidenceAssetId: string | null;
    status: 'ACTIVE' | 'INACTIVE';
}
export interface TalentOrganization extends Base {
    name: string;
    kind: 'AGENCY' | 'ISSUER' | 'OTHER';
    sourceId: string;
    scopeId: string;
    status: 'ACTIVE' | 'ARCHIVED';
}
export interface Representation extends Base {
    personId: string;
    sourceId: string;
    personRoleId: string | null;
    agencyOrganizationId: string | null;
    agentPersonId: string | null;
    relationCode: 'AGENT' | 'AGENCY' | 'MANAGER';
    territoryCode: string | null;
    validFrom: string | null;
    validUntil: string | null;
    status: 'ACTIVE' | 'INACTIVE';
}
export interface PersonExternalRef extends Base {
    personId: string;
    sourceId: string;
    providerCode: 'WECHAT' | 'XIAOHONGSHU' | 'INSTAGRAM' | 'AGENCY_INTERNAL' | 'SUPPLIER_SYSTEM';
    namespaceCode: string;
    issuerOrganizationId: string | null;
    externalKey: string;
    state: 'OBSERVED' | 'VERIFIED' | 'REVOKED';
    verifiedAt: string | null;
}
export interface PersonCredential extends Base {
    personId: string;
    sourceId: string;
    personRoleId: string | null;
    credentialTypeCode: 'DRONE_LICENSE' | 'TRANSLATION_CERTIFICATE' | 'DIVING_CERTIFICATE' | 'EQUIPMENT_CERTIFICATE' | 'OTHER';
    issuerOrganizationId: string | null;
    issuerName: string | null;
    identifierCiphertext: string | null;
    maskedIdentifier: string | null;
    issuedOn: string | null;
    expiresOn: string | null;
    evidenceAssetId: string | null;
    status: 'UNVERIFIED' | 'VERIFIED' | 'REVOKED';
}
export interface TranslatorLanguagePair extends Base {
    personId: string;
    sourceId: string;
    personRoleId: string;
    sourceLanguageCode: string;
    targetLanguageCode: string;
    status: 'ACTIVE' | 'INACTIVE';
}
export interface TranslatorServiceMode extends Base {
    personId: string;
    sourceId: string;
    personRoleId: string;
    modeCode: 'BUSINESS_MEETING' | 'ON_SET' | 'ESCORT' | 'CONSECUTIVE' | 'SIMULTANEOUS' | 'WRITTEN';
    status: 'ACTIVE' | 'INACTIVE';
}
export interface MediaCollection extends Base {
    personId: string;
    sourceId: string;
    personRoleId: string | null;
    collectionTypeCode: 'MODEL_CARD' | 'POLAROIDS' | 'PORTFOLIO' | 'SHOWREEL' | 'INTRO_VIDEO' | 'OTHER';
    title: string;
    status: 'ACTIVE' | 'ARCHIVED';
}
export interface MediaCollectionTag extends Base {
    personId: string;
    sourceId: string;
    collectionId: string;
    tagCode: 'FASHION' | 'BEAUTY' | 'COMMERCIAL' | 'LINGERIE' | 'RUNWAY' | 'LIFESTYLE' | 'INDUSTRIAL' | 'PRODUCT';
}
export interface MediaCollectionItem extends Base {
    personId: string;
    collectionId: string;
    assetId: string;
    orderIndex: number;
    caption: string;
    featured: boolean;
}
export interface ServicePrincipal extends Base {
    displayName: string;
    scopeId: string;
    permissionCodes: string[];
    defaultMaintainerMembershipId: string;
    credentialHash: string | null;
    keyVersion: number;
    expiresAt: string | null;
    recoveryEpoch: string;
    status: 'ACTIVE' | 'REVOKED';
}
export interface FieldProposal extends Base {
    personId: string | null;
    talentProfileId: string | null;
    personRoleId: string | null;
    personCapabilityId: string | null;
    personLanguageId: string | null;
    talentLocationId: string | null;
    castingProfileId: string | null;
    measurementSetId: string | null;
    adultEligibilityId: string | null;
    representationId: string | null;
    personExternalRefId: string | null;
    personCredentialId: string | null;
    translatorLanguagePairId: string | null;
    translatorServiceModeId: string | null;
    mediaCollectionId: string | null;
    mediaCollectionTagId: string | null;
    fieldPath: string;
    proposedValue: unknown;
    valueDigest: string;
    sourceId: string;
    sourceRevision: number;
    originType: 'IMPORT' | 'AGENT' | 'AI';
    actorId: string | null;
    servicePrincipalId: string | null;
    baseRevision: number;
    schemaVersion: string;
    state: 'PENDING' | 'APPLIED' | 'REJECTED' | 'STALE';
    decidedAt: string | null;
    decidedById: string | null;
}
export interface TalentMigrationReview extends Base {
    /** Prior candidate UUIDs, appended when an explicit identity merge keeps the other candidate. */
    previousShortlistItemIds?: string[];
    personId: string;
    shortlistItemId: string | null;
    reason: 'HEIGHT_SEMANTICS_REQUIRED' | 'SHORTLIST_ROLE_REQUIRED';
    state: 'PENDING' | 'RESOLVED';
    resolvedAt: string | null;
    resolvedById: string | null;
}
export interface TalentV2Tables {
    talentProfiles: TalentProfile;
    personRoles: PersonRole;
    capabilityDefinitions: CapabilityDefinition;
    personCapabilities: PersonCapability;
    personLanguages: PersonLanguage;
    talentLocations: TalentLocation;
    castingProfiles: CastingProfile;
    measurementSets: MeasurementSet;
    adultEligibilities: AdultEligibility;
    organizations: TalentOrganization;
    representations: Representation;
    personExternalRefs: PersonExternalRef;
    personCredentials: PersonCredential;
    translatorLanguagePairs: TranslatorLanguagePair;
    translatorServiceModes: TranslatorServiceMode;
    mediaCollections: MediaCollection;
    mediaCollectionTags: MediaCollectionTag;
    mediaCollectionItems: MediaCollectionItem;
    servicePrincipals: ServicePrincipal;
    fieldProposals: FieldProposal;
    talentMigrationReviews: TalentMigrationReview;
}
export const TALENT_V2_TABLES = ["talentProfiles", "personRoles", "capabilityDefinitions", "personCapabilities", "personLanguages", "talentLocations", "castingProfiles", "measurementSets", "adultEligibilities", "organizations", "representations", "personExternalRefs", "personCredentials", "translatorLanguagePairs", "translatorServiceModes", "mediaCollections", "mediaCollectionTags", "mediaCollectionItems", "servicePrincipals", "fieldProposals", "talentMigrationReviews"] as const;
export const TALENT_FACT_TABLES = ["talentProfiles", "personRoles", "personCapabilities", "personLanguages", "talentLocations", "castingProfiles", "measurementSets", "adultEligibilities", "representations", "personExternalRefs", "personCredentials", "translatorLanguagePairs", "translatorServiceModes", "mediaCollections", "mediaCollectionTags"] as const;
export const TALENT_OWNER_TABLES = {"personId": "people", "talentProfileId": "talentProfiles", "personRoleId": "personRoles", "personCapabilityId": "personCapabilities", "personLanguageId": "personLanguages", "talentLocationId": "talentLocations", "castingProfileId": "castingProfiles", "measurementSetId": "measurementSets", "adultEligibilityId": "adultEligibilities", "representationId": "representations", "personExternalRefId": "personExternalRefs", "personCredentialId": "personCredentials", "translatorLanguagePairId": "translatorLanguagePairs", "translatorServiceModeId": "translatorServiceModes", "mediaCollectionId": "mediaCollections", "mediaCollectionTagId": "mediaCollectionTags"} as const;
export type TalentOwnerField = keyof typeof TALENT_OWNER_TABLES;
export type TalentOwnerRefs = {[K in TalentOwnerField]: string | null};
export const TALENT_OWNER_EMPTY: TalentOwnerRefs = {"personId": null, "talentProfileId": null, "personRoleId": null, "personCapabilityId": null, "personLanguageId": null, "talentLocationId": null, "castingProfileId": null, "measurementSetId": null, "adultEligibilityId": null, "representationId": null, "personExternalRefId": null, "personCredentialId": null, "translatorLanguagePairId": null, "translatorServiceModeId": null, "mediaCollectionId": null, "mediaCollectionTagId": null};
