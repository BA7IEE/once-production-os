-- Talent Domain 2.0 R1 foundation. Additive migration; existing root UUIDs are preserved.
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE "talentProfiles" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "personId" uuid NOT NULL,
  "sourceId" uuid NOT NULL,
  "internalSummary" text NOT NULL,
  "status" text NOT NULL,
  CONSTRAINT "talentProfiles_workspaceId_id_key" UNIQUE ("workspaceId", "id"),
  CONSTRAINT "talentProfiles_workspaceId_personId_id_key" UNIQUE ("workspaceId", "personId", "id")
);
CREATE INDEX "talentProfiles_td2_created_idx" ON "talentProfiles" ("workspaceId", "createdAt");
ALTER TABLE "talentProfiles" ADD CONSTRAINT "talentProfiles_td2_revision" CHECK (("revision" > 0) IS TRUE);
ALTER TABLE "talentProfiles" ADD CONSTRAINT "talentProfiles_td2_status" CHECK (("status" IN ('ACTIVE','ARCHIVED')) IS TRUE);
CREATE TABLE "personRoles" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "personId" uuid NOT NULL,
  "sourceId" uuid NOT NULL,
  "roleCode" text NOT NULL,
  "validFrom" timestamptz(3),
  "validUntil" timestamptz(3),
  "status" text NOT NULL,
  CONSTRAINT "personRoles_workspaceId_id_key" UNIQUE ("workspaceId", "id"),
  CONSTRAINT "personRoles_workspaceId_personId_id_key" UNIQUE ("workspaceId", "personId", "id")
);
CREATE INDEX "personRoles_td2_created_idx" ON "personRoles" ("workspaceId", "createdAt");
ALTER TABLE "personRoles" ADD CONSTRAINT "personRoles_td2_revision" CHECK (("revision" > 0) IS TRUE);
ALTER TABLE "personRoles" ADD CONSTRAINT "personRoles_td2_status" CHECK (("status" IN ('ACTIVE','INACTIVE')) IS TRUE);
ALTER TABLE "personRoles" ADD CONSTRAINT "personRoles_td2_period" CHECK (("validFrom" IS NULL OR "validUntil" IS NULL OR "validFrom" < "validUntil") IS TRUE);
CREATE TABLE "capabilityDefinitions" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "code" text NOT NULL,
  "labelZh" text NOT NULL,
  "labelEn" text NOT NULL,
  "aliases" text[] NOT NULL,
  "applicableRoleCodes" text[] NOT NULL,
  "levelSchemeCode" text,
  "semanticVersion" text NOT NULL,
  "schemaVersion" text NOT NULL,
  "status" text NOT NULL,
  CONSTRAINT "capabilityDefinitions_workspaceId_id_key" UNIQUE ("workspaceId", "id")
);
CREATE INDEX "capabilityDefinitions_td2_created_idx" ON "capabilityDefinitions" ("workspaceId", "createdAt");
ALTER TABLE "capabilityDefinitions" ADD CONSTRAINT "capabilityDefinitions_td2_revision" CHECK (("revision" > 0) IS TRUE);
ALTER TABLE "capabilityDefinitions" ADD CONSTRAINT "capabilityDefinitions_td2_status" CHECK (("status" IN ('ACTIVE','INACTIVE')) IS TRUE);
CREATE TABLE "personCapabilities" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "personId" uuid NOT NULL,
  "sourceId" uuid NOT NULL,
  "personRoleId" uuid,
  "capabilityCode" text NOT NULL,
  "levelCode" text,
  "validFrom" timestamptz(3),
  "validUntil" timestamptz(3),
  "status" text NOT NULL,
  CONSTRAINT "personCapabilities_workspaceId_id_key" UNIQUE ("workspaceId", "id"),
  CONSTRAINT "personCapabilities_workspaceId_personId_id_key" UNIQUE ("workspaceId", "personId", "id")
);
CREATE INDEX "personCapabilities_td2_created_idx" ON "personCapabilities" ("workspaceId", "createdAt");
ALTER TABLE "personCapabilities" ADD CONSTRAINT "personCapabilities_td2_revision" CHECK (("revision" > 0) IS TRUE);
ALTER TABLE "personCapabilities" ADD CONSTRAINT "personCapabilities_td2_levelCode" CHECK (("levelCode" IS NULL OR "levelCode" IN ('BASIC','WORKING','PROFESSIONAL','FLUENT','NATIVE')) IS TRUE);
ALTER TABLE "personCapabilities" ADD CONSTRAINT "personCapabilities_td2_status" CHECK (("status" IN ('ACTIVE','INACTIVE')) IS TRUE);
ALTER TABLE "personCapabilities" ADD CONSTRAINT "personCapabilities_td2_period" CHECK (("validFrom" IS NULL OR "validUntil" IS NULL OR "validFrom" < "validUntil") IS TRUE);
CREATE TABLE "personLanguages" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "personId" uuid NOT NULL,
  "sourceId" uuid NOT NULL,
  "languageCode" text NOT NULL,
  "speakingLevelCode" text,
  "listeningLevelCode" text,
  "readingLevelCode" text,
  "writingLevelCode" text,
  "verifiedAt" timestamptz(3),
  "validFrom" timestamptz(3),
  "validUntil" timestamptz(3),
  "status" text NOT NULL,
  CONSTRAINT "personLanguages_workspaceId_id_key" UNIQUE ("workspaceId", "id"),
  CONSTRAINT "personLanguages_workspaceId_personId_id_key" UNIQUE ("workspaceId", "personId", "id")
);
CREATE INDEX "personLanguages_td2_created_idx" ON "personLanguages" ("workspaceId", "createdAt");
ALTER TABLE "personLanguages" ADD CONSTRAINT "personLanguages_td2_revision" CHECK (("revision" > 0) IS TRUE);
ALTER TABLE "personLanguages" ADD CONSTRAINT "personLanguages_td2_speakingLevelCode" CHECK (("speakingLevelCode" IS NULL OR "speakingLevelCode" IN ('BASIC','WORKING','PROFESSIONAL','FLUENT','NATIVE')) IS TRUE);
ALTER TABLE "personLanguages" ADD CONSTRAINT "personLanguages_td2_listeningLevelCode" CHECK (("listeningLevelCode" IS NULL OR "listeningLevelCode" IN ('BASIC','WORKING','PROFESSIONAL','FLUENT','NATIVE')) IS TRUE);
ALTER TABLE "personLanguages" ADD CONSTRAINT "personLanguages_td2_readingLevelCode" CHECK (("readingLevelCode" IS NULL OR "readingLevelCode" IN ('BASIC','WORKING','PROFESSIONAL','FLUENT','NATIVE')) IS TRUE);
ALTER TABLE "personLanguages" ADD CONSTRAINT "personLanguages_td2_writingLevelCode" CHECK (("writingLevelCode" IS NULL OR "writingLevelCode" IN ('BASIC','WORKING','PROFESSIONAL','FLUENT','NATIVE')) IS TRUE);
ALTER TABLE "personLanguages" ADD CONSTRAINT "personLanguages_td2_status" CHECK (("status" IN ('ACTIVE','INACTIVE')) IS TRUE);
ALTER TABLE "personLanguages" ADD CONSTRAINT "personLanguages_td2_period" CHECK (("validFrom" IS NULL OR "validUntil" IS NULL OR "validFrom" < "validUntil") IS TRUE);
CREATE TABLE "talentLocations" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "personId" uuid NOT NULL,
  "sourceId" uuid NOT NULL,
  "locationCode" text NOT NULL,
  "relationCode" text NOT NULL,
  "verifiedAt" timestamptz(3),
  "validFrom" timestamptz(3),
  "validUntil" timestamptz(3),
  "status" text NOT NULL,
  CONSTRAINT "talentLocations_workspaceId_id_key" UNIQUE ("workspaceId", "id"),
  CONSTRAINT "talentLocations_workspaceId_personId_id_key" UNIQUE ("workspaceId", "personId", "id")
);
CREATE INDEX "talentLocations_td2_created_idx" ON "talentLocations" ("workspaceId", "createdAt");
ALTER TABLE "talentLocations" ADD CONSTRAINT "talentLocations_td2_revision" CHECK (("revision" > 0) IS TRUE);
ALTER TABLE "talentLocations" ADD CONSTRAINT "talentLocations_td2_relationCode" CHECK (("relationCode" IN ('BASE','SERVICE')) IS TRUE);
ALTER TABLE "talentLocations" ADD CONSTRAINT "talentLocations_td2_status" CHECK (("status" IN ('ACTIVE','INACTIVE')) IS TRUE);
ALTER TABLE "talentLocations" ADD CONSTRAINT "talentLocations_td2_period" CHECK (("validFrom" IS NULL OR "validUntil" IS NULL OR "validFrom" < "validUntil") IS TRUE);
CREATE TABLE "castingProfiles" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "personId" uuid NOT NULL,
  "sourceId" uuid NOT NULL,
  "hairColorCode" text,
  "eyeColorCode" text,
  "appearanceObservedOn" text,
  "currentMeasurementSetId" uuid,
  CONSTRAINT "castingProfiles_workspaceId_id_key" UNIQUE ("workspaceId", "id"),
  CONSTRAINT "castingProfiles_workspaceId_personId_id_key" UNIQUE ("workspaceId", "personId", "id")
);
CREATE INDEX "castingProfiles_td2_created_idx" ON "castingProfiles" ("workspaceId", "createdAt");
ALTER TABLE "castingProfiles" ADD CONSTRAINT "castingProfiles_td2_revision" CHECK (("revision" > 0) IS TRUE);
ALTER TABLE "castingProfiles" ADD CONSTRAINT "castingProfiles_td2_hairColorCode" CHECK (("hairColorCode" IS NULL OR "hairColorCode" IN ('BLACK','BROWN','BLONDE','RED','GRAY','WHITE','OTHER')) IS TRUE);
ALTER TABLE "castingProfiles" ADD CONSTRAINT "castingProfiles_td2_eyeColorCode" CHECK (("eyeColorCode" IS NULL OR "eyeColorCode" IN ('BLACK','BROWN','BLUE','GREEN','GRAY','HAZEL','OTHER')) IS TRUE);
ALTER TABLE "castingProfiles" ADD CONSTRAINT "castingProfiles_td2_appearanceObservedOn" CHECK (("appearanceObservedOn" IS NULL OR ("appearanceObservedOn" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND to_char("appearanceObservedOn"::date,'YYYY-MM-DD')="appearanceObservedOn")) IS TRUE);
CREATE TABLE "measurementSets" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "personId" uuid NOT NULL,
  "sourceId" uuid NOT NULL,
  "measuredOn" text NOT NULL,
  "datePrecision" text NOT NULL,
  "heightCm" double precision,
  "bustCm" double precision,
  "waistCm" double precision,
  "hipsCm" double precision,
  "shoeSizeValue" text,
  "shoeSizeSystem" text,
  "clothingSizeValue" text,
  "clothingSizeSystem" text,
  "supersedesId" uuid,
  "status" text NOT NULL,
  CONSTRAINT "measurementSets_workspaceId_id_key" UNIQUE ("workspaceId", "id"),
  CONSTRAINT "measurementSets_workspaceId_personId_id_key" UNIQUE ("workspaceId", "personId", "id")
);
CREATE INDEX "measurementSets_td2_created_idx" ON "measurementSets" ("workspaceId", "createdAt");
ALTER TABLE "measurementSets" ADD CONSTRAINT "measurementSets_td2_revision" CHECK (("revision" > 0) IS TRUE);
ALTER TABLE "measurementSets" ADD CONSTRAINT "measurementSets_td2_measuredOn" CHECK ((("measuredOn" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND to_char("measuredOn"::date,'YYYY-MM-DD')="measuredOn")) IS TRUE);
ALTER TABLE "measurementSets" ADD CONSTRAINT "measurementSets_td2_datePrecision" CHECK (("datePrecision" IN ('EXACT_DAY','APPROXIMATE')) IS TRUE);
ALTER TABLE "measurementSets" ADD CONSTRAINT "measurementSets_td2_shoeSizeSystem" CHECK (("shoeSizeSystem" IS NULL OR "shoeSizeSystem" IN ('EU','US','UK','CN')) IS TRUE);
ALTER TABLE "measurementSets" ADD CONSTRAINT "measurementSets_td2_clothingSizeSystem" CHECK (("clothingSizeSystem" IS NULL OR "clothingSizeSystem" IN ('INTL','EU','US','UK','CN')) IS TRUE);
ALTER TABLE "measurementSets" ADD CONSTRAINT "measurementSets_td2_status" CHECK (("status" IN ('DRAFT','CONFIRMED','SUPERSEDED')) IS TRUE);
CREATE TABLE "adultEligibilities" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "personId" uuid NOT NULL,
  "sourceId" uuid NOT NULL,
  "state" text NOT NULL,
  "verifiedByMembershipId" uuid,
  "verifiedAt" timestamptz(3),
  "validUntil" timestamptz(3),
  "evidenceAssetId" uuid,
  "status" text NOT NULL,
  CONSTRAINT "adultEligibilities_workspaceId_id_key" UNIQUE ("workspaceId", "id"),
  CONSTRAINT "adultEligibilities_workspaceId_personId_id_key" UNIQUE ("workspaceId", "personId", "id")
);
CREATE INDEX "adultEligibilities_td2_created_idx" ON "adultEligibilities" ("workspaceId", "createdAt");
ALTER TABLE "adultEligibilities" ADD CONSTRAINT "adultEligibilities_td2_revision" CHECK (("revision" > 0) IS TRUE);
ALTER TABLE "adultEligibilities" ADD CONSTRAINT "adultEligibilities_td2_state" CHECK (("state" IN ('UNKNOWN','SELF_DECLARED_ADULT','VERIFIED_ADULT','RESTRICTED')) IS TRUE);
ALTER TABLE "adultEligibilities" ADD CONSTRAINT "adultEligibilities_td2_status" CHECK (("status" IN ('ACTIVE','INACTIVE')) IS TRUE);
CREATE TABLE "organizations" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "name" text NOT NULL,
  "kind" text NOT NULL,
  "sourceId" uuid NOT NULL,
  "scopeId" uuid NOT NULL,
  "status" text NOT NULL,
  CONSTRAINT "organizations_workspaceId_id_key" UNIQUE ("workspaceId", "id")
);
CREATE INDEX "organizations_td2_created_idx" ON "organizations" ("workspaceId", "createdAt");
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_td2_revision" CHECK (("revision" > 0) IS TRUE);
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_td2_kind" CHECK (("kind" IN ('AGENCY','ISSUER','OTHER')) IS TRUE);
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_td2_status" CHECK (("status" IN ('ACTIVE','ARCHIVED')) IS TRUE);
CREATE TABLE "representations" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "personId" uuid NOT NULL,
  "sourceId" uuid NOT NULL,
  "personRoleId" uuid,
  "agencyOrganizationId" uuid,
  "agentPersonId" uuid,
  "relationCode" text NOT NULL,
  "territoryCode" text,
  "validFrom" timestamptz(3),
  "validUntil" timestamptz(3),
  "status" text NOT NULL,
  CONSTRAINT "representations_workspaceId_id_key" UNIQUE ("workspaceId", "id"),
  CONSTRAINT "representations_workspaceId_personId_id_key" UNIQUE ("workspaceId", "personId", "id")
);
CREATE INDEX "representations_td2_created_idx" ON "representations" ("workspaceId", "createdAt");
ALTER TABLE "representations" ADD CONSTRAINT "representations_td2_revision" CHECK (("revision" > 0) IS TRUE);
ALTER TABLE "representations" ADD CONSTRAINT "representations_td2_relationCode" CHECK (("relationCode" IN ('AGENT','AGENCY','MANAGER')) IS TRUE);
ALTER TABLE "representations" ADD CONSTRAINT "representations_td2_status" CHECK (("status" IN ('ACTIVE','INACTIVE')) IS TRUE);
ALTER TABLE "representations" ADD CONSTRAINT "representations_td2_period" CHECK (("validFrom" IS NULL OR "validUntil" IS NULL OR "validFrom" < "validUntil") IS TRUE);
CREATE TABLE "personExternalRefs" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "personId" uuid NOT NULL,
  "sourceId" uuid NOT NULL,
  "providerCode" text NOT NULL,
  "namespaceCode" text NOT NULL,
  "issuerOrganizationId" uuid,
  "externalKey" text NOT NULL,
  "state" text NOT NULL,
  "verifiedAt" timestamptz(3),
  CONSTRAINT "personExternalRefs_workspaceId_id_key" UNIQUE ("workspaceId", "id"),
  CONSTRAINT "personExternalRefs_workspaceId_personId_id_key" UNIQUE ("workspaceId", "personId", "id")
);
CREATE INDEX "personExternalRefs_td2_created_idx" ON "personExternalRefs" ("workspaceId", "createdAt");
ALTER TABLE "personExternalRefs" ADD CONSTRAINT "personExternalRefs_td2_revision" CHECK (("revision" > 0) IS TRUE);
ALTER TABLE "personExternalRefs" ADD CONSTRAINT "personExternalRefs_td2_providerCode" CHECK (("providerCode" IN ('WECHAT','XIAOHONGSHU','INSTAGRAM','AGENCY_INTERNAL','SUPPLIER_SYSTEM')) IS TRUE);
ALTER TABLE "personExternalRefs" ADD CONSTRAINT "personExternalRefs_td2_state" CHECK (("state" IN ('OBSERVED','VERIFIED','REVOKED')) IS TRUE);
CREATE TABLE "personCredentials" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "personId" uuid NOT NULL,
  "sourceId" uuid NOT NULL,
  "personRoleId" uuid,
  "credentialTypeCode" text NOT NULL,
  "issuerOrganizationId" uuid,
  "issuerName" text,
  "identifierCiphertext" text,
  "maskedIdentifier" text,
  "issuedOn" text,
  "expiresOn" text,
  "evidenceAssetId" uuid,
  "status" text NOT NULL,
  CONSTRAINT "personCredentials_workspaceId_id_key" UNIQUE ("workspaceId", "id"),
  CONSTRAINT "personCredentials_workspaceId_personId_id_key" UNIQUE ("workspaceId", "personId", "id")
);
CREATE INDEX "personCredentials_td2_created_idx" ON "personCredentials" ("workspaceId", "createdAt");
ALTER TABLE "personCredentials" ADD CONSTRAINT "personCredentials_td2_revision" CHECK (("revision" > 0) IS TRUE);
ALTER TABLE "personCredentials" ADD CONSTRAINT "personCredentials_td2_credentialTypeCode" CHECK (("credentialTypeCode" IN ('DRONE_LICENSE','TRANSLATION_CERTIFICATE','DIVING_CERTIFICATE','EQUIPMENT_CERTIFICATE','OTHER')) IS TRUE);
ALTER TABLE "personCredentials" ADD CONSTRAINT "personCredentials_td2_issuedOn" CHECK (("issuedOn" IS NULL OR ("issuedOn" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND to_char("issuedOn"::date,'YYYY-MM-DD')="issuedOn")) IS TRUE);
ALTER TABLE "personCredentials" ADD CONSTRAINT "personCredentials_td2_expiresOn" CHECK (("expiresOn" IS NULL OR ("expiresOn" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND to_char("expiresOn"::date,'YYYY-MM-DD')="expiresOn")) IS TRUE);
ALTER TABLE "personCredentials" ADD CONSTRAINT "personCredentials_td2_status" CHECK (("status" IN ('UNVERIFIED','VERIFIED','REVOKED')) IS TRUE);
CREATE TABLE "translatorLanguagePairs" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "personId" uuid NOT NULL,
  "sourceId" uuid NOT NULL,
  "personRoleId" uuid NOT NULL,
  "sourceLanguageCode" text NOT NULL,
  "targetLanguageCode" text NOT NULL,
  "status" text NOT NULL,
  CONSTRAINT "translatorLanguagePairs_workspaceId_id_key" UNIQUE ("workspaceId", "id"),
  CONSTRAINT "translatorLanguagePairs_workspaceId_personId_id_key" UNIQUE ("workspaceId", "personId", "id")
);
CREATE INDEX "translatorLanguagePairs_td2_created_idx" ON "translatorLanguagePairs" ("workspaceId", "createdAt");
ALTER TABLE "translatorLanguagePairs" ADD CONSTRAINT "translatorLanguagePairs_td2_revision" CHECK (("revision" > 0) IS TRUE);
ALTER TABLE "translatorLanguagePairs" ADD CONSTRAINT "translatorLanguagePairs_td2_status" CHECK (("status" IN ('ACTIVE','INACTIVE')) IS TRUE);
CREATE TABLE "translatorServiceModes" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "personId" uuid NOT NULL,
  "sourceId" uuid NOT NULL,
  "personRoleId" uuid NOT NULL,
  "modeCode" text NOT NULL,
  "status" text NOT NULL,
  CONSTRAINT "translatorServiceModes_workspaceId_id_key" UNIQUE ("workspaceId", "id"),
  CONSTRAINT "translatorServiceModes_workspaceId_personId_id_key" UNIQUE ("workspaceId", "personId", "id")
);
CREATE INDEX "translatorServiceModes_td2_created_idx" ON "translatorServiceModes" ("workspaceId", "createdAt");
ALTER TABLE "translatorServiceModes" ADD CONSTRAINT "translatorServiceModes_td2_revision" CHECK (("revision" > 0) IS TRUE);
ALTER TABLE "translatorServiceModes" ADD CONSTRAINT "translatorServiceModes_td2_modeCode" CHECK (("modeCode" IN ('BUSINESS_MEETING','ON_SET','ESCORT','CONSECUTIVE','SIMULTANEOUS','WRITTEN')) IS TRUE);
ALTER TABLE "translatorServiceModes" ADD CONSTRAINT "translatorServiceModes_td2_status" CHECK (("status" IN ('ACTIVE','INACTIVE')) IS TRUE);
CREATE TABLE "mediaCollections" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "personId" uuid NOT NULL,
  "sourceId" uuid NOT NULL,
  "personRoleId" uuid,
  "collectionTypeCode" text NOT NULL,
  "title" text NOT NULL,
  "status" text NOT NULL,
  CONSTRAINT "mediaCollections_workspaceId_id_key" UNIQUE ("workspaceId", "id"),
  CONSTRAINT "mediaCollections_workspaceId_personId_id_key" UNIQUE ("workspaceId", "personId", "id")
);
CREATE INDEX "mediaCollections_td2_created_idx" ON "mediaCollections" ("workspaceId", "createdAt");
ALTER TABLE "mediaCollections" ADD CONSTRAINT "mediaCollections_td2_revision" CHECK (("revision" > 0) IS TRUE);
ALTER TABLE "mediaCollections" ADD CONSTRAINT "mediaCollections_td2_collectionTypeCode" CHECK (("collectionTypeCode" IN ('MODEL_CARD','POLAROIDS','PORTFOLIO','SHOWREEL','INTRO_VIDEO','OTHER')) IS TRUE);
ALTER TABLE "mediaCollections" ADD CONSTRAINT "mediaCollections_td2_status" CHECK (("status" IN ('ACTIVE','ARCHIVED')) IS TRUE);
CREATE TABLE "mediaCollectionTags" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "personId" uuid NOT NULL,
  "sourceId" uuid NOT NULL,
  "collectionId" uuid NOT NULL,
  "tagCode" text NOT NULL,
  CONSTRAINT "mediaCollectionTags_workspaceId_id_key" UNIQUE ("workspaceId", "id"),
  CONSTRAINT "mediaCollectionTags_workspaceId_personId_id_key" UNIQUE ("workspaceId", "personId", "id")
);
CREATE INDEX "mediaCollectionTags_td2_created_idx" ON "mediaCollectionTags" ("workspaceId", "createdAt");
ALTER TABLE "mediaCollectionTags" ADD CONSTRAINT "mediaCollectionTags_td2_revision" CHECK (("revision" > 0) IS TRUE);
ALTER TABLE "mediaCollectionTags" ADD CONSTRAINT "mediaCollectionTags_td2_tagCode" CHECK (("tagCode" IN ('FASHION','BEAUTY','COMMERCIAL','LINGERIE','RUNWAY','LIFESTYLE','INDUSTRIAL','PRODUCT')) IS TRUE);
CREATE TABLE "mediaCollectionItems" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "personId" uuid NOT NULL,
  "collectionId" uuid NOT NULL,
  "assetId" uuid NOT NULL,
  "orderIndex" integer NOT NULL,
  "caption" text NOT NULL,
  "featured" boolean NOT NULL,
  CONSTRAINT "mediaCollectionItems_workspaceId_id_key" UNIQUE ("workspaceId", "id"),
  CONSTRAINT "mediaCollectionItems_workspaceId_personId_id_key" UNIQUE ("workspaceId", "personId", "id")
);
CREATE INDEX "mediaCollectionItems_td2_created_idx" ON "mediaCollectionItems" ("workspaceId", "createdAt");
ALTER TABLE "mediaCollectionItems" ADD CONSTRAINT "mediaCollectionItems_td2_revision" CHECK (("revision" > 0) IS TRUE);
CREATE TABLE "servicePrincipals" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "displayName" text NOT NULL,
  "scopeId" uuid NOT NULL,
  "permissionCodes" text[] NOT NULL,
  "defaultMaintainerMembershipId" uuid NOT NULL,
  "credentialHash" text,
  "keyVersion" integer NOT NULL,
  "expiresAt" timestamptz(3),
  "recoveryEpoch" text NOT NULL,
  "status" text NOT NULL,
  CONSTRAINT "servicePrincipals_workspaceId_id_key" UNIQUE ("workspaceId", "id")
);
CREATE INDEX "servicePrincipals_td2_created_idx" ON "servicePrincipals" ("workspaceId", "createdAt");
ALTER TABLE "servicePrincipals" ADD CONSTRAINT "servicePrincipals_td2_revision" CHECK (("revision" > 0) IS TRUE);
ALTER TABLE "servicePrincipals" ADD CONSTRAINT "servicePrincipals_td2_status" CHECK (("status" IN ('ACTIVE','REVOKED')) IS TRUE);
CREATE TABLE "fieldProposals" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "personId" uuid,
  "talentProfileId" uuid,
  "personRoleId" uuid,
  "personCapabilityId" uuid,
  "personLanguageId" uuid,
  "talentLocationId" uuid,
  "castingProfileId" uuid,
  "measurementSetId" uuid,
  "adultEligibilityId" uuid,
  "representationId" uuid,
  "personExternalRefId" uuid,
  "personCredentialId" uuid,
  "translatorLanguagePairId" uuid,
  "translatorServiceModeId" uuid,
  "mediaCollectionId" uuid,
  "mediaCollectionTagId" uuid,
  "fieldPath" text NOT NULL,
  "proposedValue" jsonb NOT NULL,
  "valueDigest" text NOT NULL,
  "sourceId" uuid NOT NULL,
  "sourceRevision" integer NOT NULL,
  "originType" text NOT NULL,
  "actorId" uuid,
  "servicePrincipalId" uuid,
  "baseRevision" integer NOT NULL,
  "schemaVersion" text NOT NULL,
  "state" text NOT NULL,
  "decidedAt" timestamptz(3),
  "decidedById" uuid,
  CONSTRAINT "fieldProposals_workspaceId_id_key" UNIQUE ("workspaceId", "id")
);
CREATE INDEX "fieldProposals_td2_created_idx" ON "fieldProposals" ("workspaceId", "createdAt");
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_td2_revision" CHECK (("revision" > 0) IS TRUE);
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_td2_originType" CHECK (("originType" IN ('IMPORT','AGENT','AI')) IS TRUE);
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_td2_state" CHECK (("state" IN ('PENDING','APPLIED','REJECTED','STALE')) IS TRUE);
CREATE TABLE "talentMigrationReviews" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "personId" uuid NOT NULL,
  "shortlistItemId" uuid,
  "reason" text NOT NULL,
  "state" text NOT NULL,
  "resolvedAt" timestamptz(3),
  "resolvedById" uuid,
  CONSTRAINT "talentMigrationReviews_workspaceId_id_key" UNIQUE ("workspaceId", "id"),
  CONSTRAINT "talentMigrationReviews_workspaceId_personId_id_key" UNIQUE ("workspaceId", "personId", "id")
);
CREATE INDEX "talentMigrationReviews_td2_created_idx" ON "talentMigrationReviews" ("workspaceId", "createdAt");
ALTER TABLE "talentMigrationReviews" ADD CONSTRAINT "talentMigrationReviews_td2_revision" CHECK (("revision" > 0) IS TRUE);
ALTER TABLE "talentMigrationReviews" ADD CONSTRAINT "talentMigrationReviews_td2_reason" CHECK (("reason" IN ('HEIGHT_SEMANTICS_REQUIRED','SHORTLIST_ROLE_REQUIRED')) IS TRUE);
ALTER TABLE "talentMigrationReviews" ADD CONSTRAINT "talentMigrationReviews_td2_state" CHECK (("state" IN ('PENDING','RESOLVED')) IS TRUE);
ALTER TABLE "evidence" ALTER COLUMN "personId" DROP NOT NULL, ALTER COLUMN "reviewerId" DROP NOT NULL, ALTER COLUMN "reviewedAt" DROP NOT NULL;
ALTER TABLE "evidence" ADD COLUMN "talentProfileId" uuid;
ALTER TABLE "evidence" ADD COLUMN "personRoleId" uuid;
ALTER TABLE "evidence" ADD COLUMN "personCapabilityId" uuid;
ALTER TABLE "evidence" ADD COLUMN "personLanguageId" uuid;
ALTER TABLE "evidence" ADD COLUMN "talentLocationId" uuid;
ALTER TABLE "evidence" ADD COLUMN "castingProfileId" uuid;
ALTER TABLE "evidence" ADD COLUMN "measurementSetId" uuid;
ALTER TABLE "evidence" ADD COLUMN "adultEligibilityId" uuid;
ALTER TABLE "evidence" ADD COLUMN "representationId" uuid;
ALTER TABLE "evidence" ADD COLUMN "personExternalRefId" uuid;
ALTER TABLE "evidence" ADD COLUMN "personCredentialId" uuid;
ALTER TABLE "evidence" ADD COLUMN "translatorLanguagePairId" uuid;
ALTER TABLE "evidence" ADD COLUMN "translatorServiceModeId" uuid;
ALTER TABLE "evidence" ADD COLUMN "mediaCollectionId" uuid;
ALTER TABLE "evidence" ADD COLUMN "mediaCollectionTagId" uuid;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_td2_exact_owner" CHECK ((num_nonnulls("personId","talentProfileId","personRoleId","personCapabilityId","personLanguageId","talentLocationId","castingProfileId","measurementSetId","adultEligibilityId","representationId","personExternalRefId","personCredentialId","translatorLanguagePairId","translatorServiceModeId","mediaCollectionId","mediaCollectionTagId") = 1) IS TRUE);
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_td2_value_digest" CHECK (("valueDigest" ~ '^[a-f0-9]{64}$') IS TRUE);
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_td2_exact_owner" CHECK ((num_nonnulls("personId","talentProfileId","personRoleId","personCapabilityId","personLanguageId","talentLocationId","castingProfileId","measurementSetId","adultEligibilityId","representationId","personExternalRefId","personCredentialId","translatorLanguagePairId","translatorServiceModeId","mediaCollectionId","mediaCollectionTagId") = 1) IS TRUE);
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_td2_value_digest" CHECK (("valueDigest" ~ '^[a-f0-9]{64}$') IS TRUE);
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_td2_review_pair" CHECK ((("reviewerId" IS NULL) = ("reviewedAt" IS NULL)) IS TRUE);
ALTER TABLE "receipts" ADD COLUMN "servicePrincipalId" uuid;
ALTER TABLE "receipts" ALTER COLUMN "actorId" DROP NOT NULL;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_td2_actor" CHECK ((num_nonnulls("actorId","servicePrincipalId") = 1) IS TRUE);
CREATE UNIQUE INDEX "receipts_machine_command_key" ON "receipts" ("workspaceId","servicePrincipalId","operation","commandKey") WHERE "servicePrincipalId" IS NOT NULL;
ALTER TABLE "audits" ADD COLUMN "servicePrincipalId" uuid;
ALTER TABLE "audits" ADD CONSTRAINT "audits_td2_actor" CHECK ((num_nonnulls("actorId","servicePrincipalId") <= 1) IS TRUE);
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_td2_actor" CHECK ((num_nonnulls("actorId","servicePrincipalId")=1) IS TRUE);
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_td2_decision" CHECK ((("state"='PENDING' AND "decidedAt" IS NULL AND "decidedById" IS NULL) OR ("state"<>'PENDING' AND "decidedAt" IS NOT NULL AND "decidedById" IS NOT NULL)) IS TRUE);
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_td2_schema" CHECK (("schemaVersion"='once-talent-v2.0.0' AND "baseRevision">0 AND "sourceRevision">0) IS TRUE);
ALTER TABLE "shortlistItems" ADD COLUMN "personRoleId" uuid;
ALTER TABLE "shortlistItems" ADD COLUMN "personRoleRevision" integer;
ALTER TABLE "shortlistItems" ADD COLUMN "roleContextState" text;
ALTER TABLE "shortlistItems" ADD CONSTRAINT "shortlistItems_td2_role_context" CHECK ((("personRoleId" IS NULL AND "personRoleRevision" IS NULL AND ("roleContextState" IS NULL OR "roleContextState"='LEGACY_REVIEW')) OR ("personRoleId" IS NOT NULL AND "personRoleRevision">0 AND "roleContextState"='BOUND')) IS TRUE);
ALTER TABLE "talentProfiles" ADD CONSTRAINT "talentProfiles_personId_td2_unique" UNIQUE ("workspaceId", "personId");
ALTER TABLE "castingProfiles" ADD CONSTRAINT "castingProfiles_personId_td2_unique" UNIQUE ("workspaceId", "personId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "capabilityDefinitions" ADD CONSTRAINT "capabilityDefinitions_code_td2_unique" UNIQUE ("workspaceId", "code");
ALTER TABLE "mediaCollectionTags" ADD CONSTRAINT "mediaCollectionTags_collectionId_tagCode_td2_unique" UNIQUE ("workspaceId", "collectionId", "tagCode") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "translatorServiceModes" ADD CONSTRAINT "translatorServiceModes_personRoleId_modeCode_td2_unique" UNIQUE ("workspaceId", "personRoleId", "modeCode") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "translatorLanguagePairs" ADD CONSTRAINT "translatorLanguagePairs_personRoleId_sourceLang_75fc13495a86" UNIQUE ("workspaceId", "personRoleId", "sourceLanguageCode", "targetLanguageCode") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "mediaCollectionItems" ADD CONSTRAINT "mediaCollectionItems_collectionId_assetId_td2_unique" UNIQUE ("workspaceId", "collectionId", "assetId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "mediaCollectionItems" ADD CONSTRAINT "mediaCollectionItems_collectionId_orderIndex_td2_unique" UNIQUE ("workspaceId", "collectionId", "orderIndex") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personRoles" ADD CONSTRAINT "personRoles_active_period_td2" EXCLUDE USING gist ("workspaceId" WITH =, "personId" WITH =, "roleCode" WITH =, tstzrange("validFrom","validUntil",'[)') WITH &&) WHERE ("status"='ACTIVE') DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personLanguages" ADD CONSTRAINT "personLanguages_active_period_td2" EXCLUDE USING gist ("workspaceId" WITH =, "personId" WITH =, "languageCode" WITH =, tstzrange("validFrom","validUntil",'[)') WITH &&) WHERE ("status"='ACTIVE') DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "talentLocations" ADD CONSTRAINT "talentLocations_active_period_td2" EXCLUDE USING gist ("workspaceId" WITH =, "personId" WITH =, tstzrange("validFrom","validUntil",'[)') WITH &&) WHERE ("status"='ACTIVE' AND "relationCode"='BASE') DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX "adultEligibilities_active_td2" ON "adultEligibilities" ("workspaceId","personId") WHERE "status"='ACTIVE';
CREATE UNIQUE INDEX "personExternalRefs_exact_td2" ON "personExternalRefs" ("workspaceId","providerCode","namespaceCode",COALESCE("issuerOrganizationId",'00000000-0000-0000-0000-000000000000'::uuid),"externalKey") WHERE "state"<>'REVOKED';
ALTER TABLE "personExternalRefs" ADD CONSTRAINT "personExternalRefs_td2_external_key" CHECK ((length("externalKey") BETWEEN 1 AND 300 AND length("namespaceCode")<=120) IS TRUE);
ALTER TABLE "personExternalRefs" ADD CONSTRAINT "personExternalRefs_td2_verified" CHECK (("state"<>'VERIFIED' OR "verifiedAt" IS NOT NULL) IS TRUE);
ALTER TABLE "representations" ADD CONSTRAINT "representations_td2_representative" CHECK ((num_nonnulls("agencyOrganizationId","agentPersonId")>=1 AND ("agentPersonId" IS NULL OR "agentPersonId"<>"personId")) IS TRUE);
ALTER TABLE "measurementSets" ADD CONSTRAINT "measurementSets_td2_shoe" CHECK ((("shoeSizeValue" IS NULL)=("shoeSizeSystem" IS NULL)) IS TRUE);
ALTER TABLE "measurementSets" ADD CONSTRAINT "measurementSets_td2_clothing" CHECK ((("clothingSizeValue" IS NULL)=("clothingSizeSystem" IS NULL)) IS TRUE);
ALTER TABLE "measurementSets" ADD CONSTRAINT "measurementSets_td2_heightCm" CHECK (("heightCm" IS NULL OR "heightCm" BETWEEN 30 AND 260) IS TRUE);
ALTER TABLE "measurementSets" ADD CONSTRAINT "measurementSets_td2_bustCm" CHECK (("bustCm" IS NULL OR "bustCm" BETWEEN 20 AND 250) IS TRUE);
ALTER TABLE "measurementSets" ADD CONSTRAINT "measurementSets_td2_waistCm" CHECK (("waistCm" IS NULL OR "waistCm" BETWEEN 20 AND 250) IS TRUE);
ALTER TABLE "measurementSets" ADD CONSTRAINT "measurementSets_td2_hipsCm" CHECK (("hipsCm" IS NULL OR "hipsCm" BETWEEN 20 AND 250) IS TRUE);
ALTER TABLE "measurementSets" ADD CONSTRAINT "measurementSets_td2_has_value" CHECK ((num_nonnulls("heightCm","bustCm","waistCm","hipsCm","shoeSizeValue","clothingSizeValue")>=1) IS TRUE);
ALTER TABLE "adultEligibilities" ADD CONSTRAINT "adultEligibilities_td2_verified" CHECK (("state"<>'VERIFIED_ADULT' OR ("verifiedAt" IS NOT NULL AND "verifiedByMembershipId" IS NOT NULL)) IS TRUE);
ALTER TABLE "personCredentials" ADD CONSTRAINT "personCredentials_td2_cipher_pair" CHECK ((("identifierCiphertext" IS NULL)=("maskedIdentifier" IS NULL)) IS TRUE);
ALTER TABLE "personCredentials" ADD CONSTRAINT "personCredentials_td2_dates" CHECK (("issuedOn" IS NULL OR "expiresOn" IS NULL OR "issuedOn"<= "expiresOn") IS TRUE);
ALTER TABLE "personCredentials" ADD CONSTRAINT "personCredentials_td2_issuer" CHECK (("issuerOrganizationId" IS NOT NULL OR ("issuerName" IS NOT NULL AND length("issuerName")>0)) IS TRUE);
ALTER TABLE "mediaCollectionItems" ADD CONSTRAINT "mediaCollectionItems_td2_order" CHECK (("orderIndex">=0) IS TRUE);
ALTER TABLE "translatorLanguagePairs" ADD CONSTRAINT "translatorLanguagePairs_td2_direction" CHECK (("sourceLanguageCode"<>"targetLanguageCode") IS TRUE);
ALTER TABLE "servicePrincipals" ADD CONSTRAINT "servicePrincipals_td2_credential" CHECK (("keyVersion">0 AND (("status"='ACTIVE' AND "credentialHash" ~ '^[a-f0-9]{64}$') OR ("status"='REVOKED' AND "credentialHash" IS NULL))) IS TRUE);
ALTER TABLE "servicePrincipals" ADD CONSTRAINT "servicePrincipals_td2_permissions" CHECK (("permissionCodes" <@ ARRAY['records.read','sources.read','talent.propose','talent.fact.write']::text[] AND cardinality("permissionCodes")>0) IS TRUE);
ALTER TABLE "talentProfiles" ADD CONSTRAINT "talentProfiles_workspaceId_td2_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "talentProfiles" ADD CONSTRAINT "talentProfiles_personId_td2_fk" FOREIGN KEY ("workspaceId", "personId") REFERENCES "people" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "talentProfiles" ADD CONSTRAINT "talentProfiles_sourceId_td2_fk" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "personRoles" ADD CONSTRAINT "personRoles_workspaceId_td2_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personRoles" ADD CONSTRAINT "personRoles_personId_td2_fk" FOREIGN KEY ("workspaceId", "personId") REFERENCES "people" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personRoles" ADD CONSTRAINT "personRoles_sourceId_td2_fk" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "capabilityDefinitions" ADD CONSTRAINT "capabilityDefinitions_workspaceId_td2_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "personCapabilities" ADD CONSTRAINT "personCapabilities_workspaceId_td2_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personCapabilities" ADD CONSTRAINT "personCapabilities_personId_td2_fk" FOREIGN KEY ("workspaceId", "personId") REFERENCES "people" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personCapabilities" ADD CONSTRAINT "personCapabilities_sourceId_td2_fk" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personCapabilities" ADD CONSTRAINT "personCapabilities_personRoleId_td2_fk" FOREIGN KEY ("workspaceId", "personId", "personRoleId") REFERENCES "personRoles" ("workspaceId", "personId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personLanguages" ADD CONSTRAINT "personLanguages_workspaceId_td2_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personLanguages" ADD CONSTRAINT "personLanguages_personId_td2_fk" FOREIGN KEY ("workspaceId", "personId") REFERENCES "people" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personLanguages" ADD CONSTRAINT "personLanguages_sourceId_td2_fk" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "talentLocations" ADD CONSTRAINT "talentLocations_workspaceId_td2_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "talentLocations" ADD CONSTRAINT "talentLocations_personId_td2_fk" FOREIGN KEY ("workspaceId", "personId") REFERENCES "people" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "talentLocations" ADD CONSTRAINT "talentLocations_sourceId_td2_fk" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "castingProfiles" ADD CONSTRAINT "castingProfiles_workspaceId_td2_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "castingProfiles" ADD CONSTRAINT "castingProfiles_personId_td2_fk" FOREIGN KEY ("workspaceId", "personId") REFERENCES "people" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "castingProfiles" ADD CONSTRAINT "castingProfiles_sourceId_td2_fk" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "castingProfiles" ADD CONSTRAINT "castingProfiles_currentMeasurementSetId_td2_fk" FOREIGN KEY ("workspaceId", "personId", "currentMeasurementSetId") REFERENCES "measurementSets" ("workspaceId", "personId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "measurementSets" ADD CONSTRAINT "measurementSets_workspaceId_td2_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "measurementSets" ADD CONSTRAINT "measurementSets_personId_td2_fk" FOREIGN KEY ("workspaceId", "personId") REFERENCES "people" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "measurementSets" ADD CONSTRAINT "measurementSets_sourceId_td2_fk" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "measurementSets" ADD CONSTRAINT "measurementSets_supersedesId_td2_fk" FOREIGN KEY ("workspaceId", "personId", "supersedesId") REFERENCES "measurementSets" ("workspaceId", "personId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "adultEligibilities" ADD CONSTRAINT "adultEligibilities_workspaceId_td2_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "adultEligibilities" ADD CONSTRAINT "adultEligibilities_personId_td2_fk" FOREIGN KEY ("workspaceId", "personId") REFERENCES "people" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "adultEligibilities" ADD CONSTRAINT "adultEligibilities_sourceId_td2_fk" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "adultEligibilities" ADD CONSTRAINT "adultEligibilities_evidenceAssetId_td2_fk" FOREIGN KEY ("workspaceId", "evidenceAssetId") REFERENCES "assets" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "adultEligibilities" ADD CONSTRAINT "adultEligibilities_verifiedByMembershipId_td2_fk" FOREIGN KEY ("workspaceId", "verifiedByMembershipId") REFERENCES "memberships" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_workspaceId_td2_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_sourceId_td2_fk" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_scopeId_td2_fk" FOREIGN KEY ("workspaceId", "scopeId") REFERENCES "scopes" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "representations" ADD CONSTRAINT "representations_workspaceId_td2_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "representations" ADD CONSTRAINT "representations_personId_td2_fk" FOREIGN KEY ("workspaceId", "personId") REFERENCES "people" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "representations" ADD CONSTRAINT "representations_sourceId_td2_fk" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "representations" ADD CONSTRAINT "representations_personRoleId_td2_fk" FOREIGN KEY ("workspaceId", "personId", "personRoleId") REFERENCES "personRoles" ("workspaceId", "personId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "representations" ADD CONSTRAINT "representations_agencyOrganizationId_td2_fk" FOREIGN KEY ("workspaceId", "agencyOrganizationId") REFERENCES "organizations" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "representations" ADD CONSTRAINT "representations_agentPersonId_td2_fk" FOREIGN KEY ("workspaceId", "agentPersonId") REFERENCES "people" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personExternalRefs" ADD CONSTRAINT "personExternalRefs_workspaceId_td2_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personExternalRefs" ADD CONSTRAINT "personExternalRefs_personId_td2_fk" FOREIGN KEY ("workspaceId", "personId") REFERENCES "people" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personExternalRefs" ADD CONSTRAINT "personExternalRefs_sourceId_td2_fk" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personExternalRefs" ADD CONSTRAINT "personExternalRefs_issuerOrganizationId_td2_fk" FOREIGN KEY ("workspaceId", "issuerOrganizationId") REFERENCES "organizations" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personCredentials" ADD CONSTRAINT "personCredentials_workspaceId_td2_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personCredentials" ADD CONSTRAINT "personCredentials_personId_td2_fk" FOREIGN KEY ("workspaceId", "personId") REFERENCES "people" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personCredentials" ADD CONSTRAINT "personCredentials_sourceId_td2_fk" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personCredentials" ADD CONSTRAINT "personCredentials_personRoleId_td2_fk" FOREIGN KEY ("workspaceId", "personId", "personRoleId") REFERENCES "personRoles" ("workspaceId", "personId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personCredentials" ADD CONSTRAINT "personCredentials_evidenceAssetId_td2_fk" FOREIGN KEY ("workspaceId", "evidenceAssetId") REFERENCES "assets" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personCredentials" ADD CONSTRAINT "personCredentials_issuerOrganizationId_td2_fk" FOREIGN KEY ("workspaceId", "issuerOrganizationId") REFERENCES "organizations" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "translatorLanguagePairs" ADD CONSTRAINT "translatorLanguagePairs_workspaceId_td2_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "translatorLanguagePairs" ADD CONSTRAINT "translatorLanguagePairs_personId_td2_fk" FOREIGN KEY ("workspaceId", "personId") REFERENCES "people" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "translatorLanguagePairs" ADD CONSTRAINT "translatorLanguagePairs_sourceId_td2_fk" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "translatorLanguagePairs" ADD CONSTRAINT "translatorLanguagePairs_personRoleId_td2_fk" FOREIGN KEY ("workspaceId", "personId", "personRoleId") REFERENCES "personRoles" ("workspaceId", "personId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "translatorServiceModes" ADD CONSTRAINT "translatorServiceModes_workspaceId_td2_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "translatorServiceModes" ADD CONSTRAINT "translatorServiceModes_personId_td2_fk" FOREIGN KEY ("workspaceId", "personId") REFERENCES "people" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "translatorServiceModes" ADD CONSTRAINT "translatorServiceModes_sourceId_td2_fk" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "translatorServiceModes" ADD CONSTRAINT "translatorServiceModes_personRoleId_td2_fk" FOREIGN KEY ("workspaceId", "personId", "personRoleId") REFERENCES "personRoles" ("workspaceId", "personId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "mediaCollections" ADD CONSTRAINT "mediaCollections_workspaceId_td2_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "mediaCollections" ADD CONSTRAINT "mediaCollections_personId_td2_fk" FOREIGN KEY ("workspaceId", "personId") REFERENCES "people" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "mediaCollections" ADD CONSTRAINT "mediaCollections_sourceId_td2_fk" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "mediaCollections" ADD CONSTRAINT "mediaCollections_personRoleId_td2_fk" FOREIGN KEY ("workspaceId", "personId", "personRoleId") REFERENCES "personRoles" ("workspaceId", "personId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "mediaCollectionTags" ADD CONSTRAINT "mediaCollectionTags_workspaceId_td2_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "mediaCollectionTags" ADD CONSTRAINT "mediaCollectionTags_personId_td2_fk" FOREIGN KEY ("workspaceId", "personId") REFERENCES "people" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "mediaCollectionTags" ADD CONSTRAINT "mediaCollectionTags_sourceId_td2_fk" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "mediaCollectionTags" ADD CONSTRAINT "mediaCollectionTags_collectionId_td2_fk" FOREIGN KEY ("workspaceId", "personId", "collectionId") REFERENCES "mediaCollections" ("workspaceId", "personId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "mediaCollectionItems" ADD CONSTRAINT "mediaCollectionItems_workspaceId_td2_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "mediaCollectionItems" ADD CONSTRAINT "mediaCollectionItems_personId_td2_fk" FOREIGN KEY ("workspaceId", "personId") REFERENCES "people" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "mediaCollectionItems" ADD CONSTRAINT "mediaCollectionItems_collectionId_td2_fk" FOREIGN KEY ("workspaceId", "personId", "collectionId") REFERENCES "mediaCollections" ("workspaceId", "personId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "mediaCollectionItems" ADD CONSTRAINT "mediaCollectionItems_assetId_td2_fk" FOREIGN KEY ("workspaceId", "assetId") REFERENCES "assets" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "servicePrincipals" ADD CONSTRAINT "servicePrincipals_workspaceId_td2_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "servicePrincipals" ADD CONSTRAINT "servicePrincipals_scopeId_td2_fk" FOREIGN KEY ("workspaceId", "scopeId") REFERENCES "scopes" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "servicePrincipals" ADD CONSTRAINT "servicePrincipals_defaultMaintainerMembershipId_td2_fk" FOREIGN KEY ("workspaceId", "defaultMaintainerMembershipId") REFERENCES "memberships" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_workspaceId_td2_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_sourceId_td2_fk" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_actorId_td2_fk" FOREIGN KEY ("workspaceId", "actorId") REFERENCES "memberships" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_decidedById_td2_fk" FOREIGN KEY ("workspaceId", "decidedById") REFERENCES "memberships" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_servicePrincipalId_td2_fk" FOREIGN KEY ("workspaceId", "servicePrincipalId") REFERENCES "servicePrincipals" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "talentMigrationReviews" ADD CONSTRAINT "talentMigrationReviews_workspaceId_td2_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "talentMigrationReviews" ADD CONSTRAINT "talentMigrationReviews_personId_td2_fk" FOREIGN KEY ("workspaceId", "personId") REFERENCES "people" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "talentMigrationReviews" ADD CONSTRAINT "talentMigrationReviews_resolvedById_td2_fk" FOREIGN KEY ("workspaceId", "resolvedById") REFERENCES "memberships" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "talentMigrationReviews" ADD CONSTRAINT "talentMigrationReviews_shortlistItemId_td2_fk" FOREIGN KEY ("workspaceId", "shortlistItemId") REFERENCES "shortlistItems" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_personId_td2_fk" FOREIGN KEY ("workspaceId", "personId") REFERENCES "people" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_talentProfileId_td2_fk" FOREIGN KEY ("workspaceId", "talentProfileId") REFERENCES "talentProfiles" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_talentProfileId_td2_fk" FOREIGN KEY ("workspaceId", "talentProfileId") REFERENCES "talentProfiles" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_personRoleId_td2_fk" FOREIGN KEY ("workspaceId", "personRoleId") REFERENCES "personRoles" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_personRoleId_td2_fk" FOREIGN KEY ("workspaceId", "personRoleId") REFERENCES "personRoles" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_personCapabilityId_td2_fk" FOREIGN KEY ("workspaceId", "personCapabilityId") REFERENCES "personCapabilities" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_personCapabilityId_td2_fk" FOREIGN KEY ("workspaceId", "personCapabilityId") REFERENCES "personCapabilities" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_personLanguageId_td2_fk" FOREIGN KEY ("workspaceId", "personLanguageId") REFERENCES "personLanguages" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_personLanguageId_td2_fk" FOREIGN KEY ("workspaceId", "personLanguageId") REFERENCES "personLanguages" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_talentLocationId_td2_fk" FOREIGN KEY ("workspaceId", "talentLocationId") REFERENCES "talentLocations" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_talentLocationId_td2_fk" FOREIGN KEY ("workspaceId", "talentLocationId") REFERENCES "talentLocations" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_castingProfileId_td2_fk" FOREIGN KEY ("workspaceId", "castingProfileId") REFERENCES "castingProfiles" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_castingProfileId_td2_fk" FOREIGN KEY ("workspaceId", "castingProfileId") REFERENCES "castingProfiles" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_measurementSetId_td2_fk" FOREIGN KEY ("workspaceId", "measurementSetId") REFERENCES "measurementSets" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_measurementSetId_td2_fk" FOREIGN KEY ("workspaceId", "measurementSetId") REFERENCES "measurementSets" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_adultEligibilityId_td2_fk" FOREIGN KEY ("workspaceId", "adultEligibilityId") REFERENCES "adultEligibilities" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_adultEligibilityId_td2_fk" FOREIGN KEY ("workspaceId", "adultEligibilityId") REFERENCES "adultEligibilities" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_representationId_td2_fk" FOREIGN KEY ("workspaceId", "representationId") REFERENCES "representations" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_representationId_td2_fk" FOREIGN KEY ("workspaceId", "representationId") REFERENCES "representations" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_personExternalRefId_td2_fk" FOREIGN KEY ("workspaceId", "personExternalRefId") REFERENCES "personExternalRefs" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_personExternalRefId_td2_fk" FOREIGN KEY ("workspaceId", "personExternalRefId") REFERENCES "personExternalRefs" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_personCredentialId_td2_fk" FOREIGN KEY ("workspaceId", "personCredentialId") REFERENCES "personCredentials" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_personCredentialId_td2_fk" FOREIGN KEY ("workspaceId", "personCredentialId") REFERENCES "personCredentials" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_translatorLanguagePairId_td2_fk" FOREIGN KEY ("workspaceId", "translatorLanguagePairId") REFERENCES "translatorLanguagePairs" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_translatorLanguagePairId_td2_fk" FOREIGN KEY ("workspaceId", "translatorLanguagePairId") REFERENCES "translatorLanguagePairs" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_translatorServiceModeId_td2_fk" FOREIGN KEY ("workspaceId", "translatorServiceModeId") REFERENCES "translatorServiceModes" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_translatorServiceModeId_td2_fk" FOREIGN KEY ("workspaceId", "translatorServiceModeId") REFERENCES "translatorServiceModes" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_mediaCollectionId_td2_fk" FOREIGN KEY ("workspaceId", "mediaCollectionId") REFERENCES "mediaCollections" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_mediaCollectionId_td2_fk" FOREIGN KEY ("workspaceId", "mediaCollectionId") REFERENCES "mediaCollections" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_mediaCollectionTagId_td2_fk" FOREIGN KEY ("workspaceId", "mediaCollectionTagId") REFERENCES "mediaCollectionTags" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_mediaCollectionTagId_td2_fk" FOREIGN KEY ("workspaceId", "mediaCollectionTagId") REFERENCES "mediaCollectionTags" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_servicePrincipalId_td2_fk" FOREIGN KEY ("workspaceId", "servicePrincipalId") REFERENCES "servicePrincipals" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "audits" ADD CONSTRAINT "audits_servicePrincipalId_td2_fk" FOREIGN KEY ("workspaceId", "servicePrincipalId") REFERENCES "servicePrincipals" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "shortlistItems" ADD CONSTRAINT "shortlistItems_personRoleId_td2_fk" FOREIGN KEY ("workspaceId", "personId", "personRoleId") REFERENCES "personRoles" ("workspaceId", "personId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personRoles" ADD CONSTRAINT "personRoles_talentProfile_td2_fk" FOREIGN KEY ("workspaceId", "personId") REFERENCES "talentProfiles" ("workspaceId", "personId") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personCapabilities" ADD CONSTRAINT "personCapabilities_talentProfile_td2_fk" FOREIGN KEY ("workspaceId", "personId") REFERENCES "talentProfiles" ("workspaceId", "personId") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "talentLocations" ADD CONSTRAINT "talentLocations_talentProfile_td2_fk" FOREIGN KEY ("workspaceId", "personId") REFERENCES "talentProfiles" ("workspaceId", "personId") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "personCapabilities" ADD CONSTRAINT "personCapabilities_capabilityCode_td2_fk" FOREIGN KEY ("workspaceId", "capabilityCode") REFERENCES "capabilityDefinitions" ("workspaceId", "code") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='"people"'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%cardinality(roles)%' LOOP
 EXECUTE format('ALTER TABLE "people" DROP CONSTRAINT %I',c.conname); END LOOP;
END $$;
ALTER TABLE "people" ADD CONSTRAINT "people_td2_role_compat" CHECK ((cardinality("roles") BETWEEN 0 AND 10) IS TRUE);
CREATE FUNCTION once_td2_measurement_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD."status" IN ('CONFIRMED','SUPERSEDED') AND NEW."status" = 'DRAFT' THEN RAISE EXCEPTION 'confirmed measurement cannot return to draft'; END IF;
 IF OLD."status" IN ('CONFIRMED','SUPERSEDED') AND
 (to_jsonb(NEW)-ARRAY['personId','status','updatedAt','revision','supersedesId']) IS DISTINCT FROM
 (to_jsonb(OLD)-ARRAY['personId','status','updatedAt','revision','supersedesId']) THEN
 RAISE EXCEPTION 'confirmed measurements are immutable; create a new measured version'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER measurementSets_td2_immutable BEFORE UPDATE ON "measurementSets" FOR EACH ROW EXECUTE FUNCTION once_td2_measurement_immutable();
INSERT INTO "talentProfiles" ("id","workspaceId","createdAt","updatedAt","revision","personId","sourceId","internalSummary","status")
 SELECT gen_random_uuid(),"workspaceId","createdAt","updatedAt",1,"id","sourceId",'','ACTIVE' FROM "people" WHERE "status"<>'ERASED' AND cardinality("roles")>0;
INSERT INTO "personRoles" ("id","workspaceId","createdAt","updatedAt","revision","personId","sourceId","roleCode","validFrom","validUntil","status")
 SELECT gen_random_uuid(),p."workspaceId",p."createdAt",p."updatedAt",1,p."id",p."sourceId",r,NULL,NULL,'ACTIVE' FROM "people" p CROSS JOIN LATERAL (SELECT DISTINCT unnest(p."roles") r) x WHERE p."status"<>'ERASED';
INSERT INTO "capabilityDefinitions" ("id","workspaceId","createdAt","updatedAt","revision","code","labelZh","labelEn","aliases","applicableRoleCodes","levelSchemeCode","semanticVersion","schemaVersion","status")
 SELECT gen_random_uuid(),"workspaceId","createdAt","updatedAt",1,"code","labelZh","labelEn",ARRAY[]::text[],ARRAY[]::text[],NULL,'1.0.0','once-talent-v2.0.0',"status" FROM "dictionary" WHERE "namespace"='skill';
INSERT INTO "personCapabilities" ("id","workspaceId","createdAt","updatedAt","revision","personId","sourceId","personRoleId","capabilityCode","levelCode","validFrom","validUntil","status")
 SELECT gen_random_uuid(),p."workspaceId",p."createdAt",p."updatedAt",1,p."id",p."sourceId",NULL,s,NULL,NULL,NULL,'ACTIVE' FROM "people" p CROSS JOIN LATERAL (SELECT DISTINCT unnest(p."skillCodes") s) x JOIN "talentProfiles" t ON t."workspaceId"=p."workspaceId" AND t."personId"=p."id";
INSERT INTO "personLanguages" ("id","workspaceId","createdAt","updatedAt","revision","personId","sourceId","languageCode","speakingLevelCode","listeningLevelCode","readingLevelCode","writingLevelCode","verifiedAt","validFrom","validUntil","status")
 SELECT gen_random_uuid(),p."workspaceId",p."createdAt",p."updatedAt",1,p."id",p."sourceId",l,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'ACTIVE' FROM "people" p CROSS JOIN LATERAL (SELECT DISTINCT unnest(p."languageCodes") l) x WHERE p."status"<>'ERASED';
INSERT INTO "talentLocations" ("id","workspaceId","createdAt","updatedAt","revision","personId","sourceId","locationCode","relationCode","verifiedAt","validFrom","validUntil","status")
 SELECT gen_random_uuid(),p."workspaceId",p."createdAt",p."updatedAt",1,p."id",p."sourceId",p."cityCode",'BASE',NULL,NULL,NULL,'ACTIVE' FROM "people" p JOIN "talentProfiles" t ON t."workspaceId"=p."workspaceId" AND t."personId"=p."id" WHERE p."cityCode" IS NOT NULL;
INSERT INTO "talentMigrationReviews" ("id","workspaceId","createdAt","updatedAt","revision","personId","shortlistItemId","reason","state","resolvedAt","resolvedById")
 SELECT gen_random_uuid(),"workspaceId",now(),now(),1,"id",NULL,'HEIGHT_SEMANTICS_REQUIRED','PENDING',NULL,NULL FROM "people" WHERE "status"<>'ERASED' AND "heightCm" IS NOT NULL;
UPDATE "shortlistItems" i SET "personRoleId"=r.id,"personRoleRevision"=1,"roleContextState"='BOUND' FROM
 (SELECT "workspaceId","personId",min("id"::text)::uuid id FROM "personRoles" WHERE "status"='ACTIVE' GROUP BY "workspaceId","personId" HAVING count(*)=1) r
 WHERE r."workspaceId"=i."workspaceId" AND r."personId"=i."personId";
UPDATE "shortlistItems" SET "roleContextState"='LEGACY_REVIEW' WHERE "personRoleId" IS NULL;
INSERT INTO "talentMigrationReviews" ("id","workspaceId","createdAt","updatedAt","revision","personId","shortlistItemId","reason","state","resolvedAt","resolvedById")
 SELECT gen_random_uuid(),"workspaceId",now(),now(),1,"personId","id",'SHORTLIST_ROLE_REQUIRED','PENDING',NULL,NULL FROM "shortlistItems" WHERE "personRoleId" IS NULL;
COMMIT;
