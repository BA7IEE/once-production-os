BEGIN;
-- Forward-only PR-01b. Existing identities, sources and historical facts are unchanged.
ALTER TABLE "talentProfiles"
 ADD COLUMN "genderCode" text,
 ADD COLUMN "birthPrecision" text NOT NULL DEFAULT 'UNKNOWN',
 ADD COLUMN "birthDate" text, ADD COLUMN "birthYear" integer,
 ADD COLUMN "minAgeYears" integer, ADD COLUMN "maxAgeYears" integer,
 ADD COLUMN "ageAsOfDate" text, ADD COLUMN "nationalityCodes" text[] NOT NULL DEFAULT '{}',
 ADD COLUMN "coverAssetId" uuid;
ALTER TABLE "personRoles"
 ADD COLUMN "castingMarketCode" text NOT NULL DEFAULT 'UNCLASSIFIED',
 ADD COLUMN "experienceCode" text NOT NULL DEFAULT 'UNSPECIFIED',
 ADD COLUMN "styleCodes" text[] NOT NULL DEFAULT '{}',
 ADD COLUMN "serviceCodes" text[] NOT NULL DEFAULT '{}';
ALTER TABLE "talentProfiles" ADD CONSTRAINT "talent_demographics_branch" CHECK ((
 ("birthPrecision"='UNKNOWN' AND "birthDate" IS NULL AND "birthYear" IS NULL AND "minAgeYears" IS NULL AND "maxAgeYears" IS NULL AND "ageAsOfDate" IS NULL) OR
 ("birthPrecision"='EXACT_DATE' AND "birthDate" IS NOT NULL AND to_char("birthDate"::date,'YYYY-MM-DD')="birthDate" AND "birthYear" IS NULL AND "minAgeYears" IS NULL AND "maxAgeYears" IS NULL AND "ageAsOfDate" IS NULL) OR
 ("birthPrecision"='YEAR_ONLY' AND "birthYear" BETWEEN 1900 AND 9999 AND "birthDate" IS NULL AND "minAgeYears" IS NULL AND "maxAgeYears" IS NULL AND "ageAsOfDate" IS NULL) OR
 ("birthPrecision"='DECLARED_RANGE' AND "minAgeYears" BETWEEN 0 AND 130 AND "maxAgeYears" BETWEEN "minAgeYears" AND 130 AND "ageAsOfDate" IS NOT NULL AND to_char("ageAsOfDate"::date,'YYYY-MM-DD')="ageAsOfDate" AND "birthDate" IS NULL AND "birthYear" IS NULL)
) IS TRUE);
ALTER TABLE "talentProfiles" ADD CONSTRAINT "talent_gender_code" CHECK ("genderCode" IS NULL OR "genderCode" IN ('FEMALE','MALE','NON_BINARY','OTHER'));
ALTER TABLE "personRoles" ADD CONSTRAINT "model_business_codes" CHECK (
 "castingMarketCode" IN ('UNCLASSIFIED','DOMESTIC','INTERNATIONAL') AND "experienceCode" IN ('UNSPECIFIED','AMATEUR','PROFESSIONAL') AND
 ("roleCode"='model' OR ("castingMarketCode"='UNCLASSIFIED' AND "experienceCode"='UNSPECIFIED')));
ALTER TABLE "talentProfiles" ADD CONSTRAINT "talent_cover_fk" FOREIGN KEY ("workspaceId","coverAssetId") REFERENCES "assets"("workspaceId","id") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "measurementSets" ADD COLUMN "reportedAt" timestamptz(3);
ALTER TABLE "measurementSets" ADD CONSTRAINT "measurement_reported_time" CHECK ("reportedAt" IS NULL OR ("reportedAt">="createdAt" AND "reportedAt"<="updatedAt"));
ALTER TABLE "measurementSets" ALTER COLUMN "measuredOn" DROP NOT NULL;
ALTER TABLE "measurementSets" DROP CONSTRAINT "measurementSets_td2_measuredOn", DROP CONSTRAINT "measurementSets_td2_datePrecision";
ALTER TABLE "measurementSets" ADD CONSTRAINT "measurement_date_precision" CHECK ((
 ("datePrecision"='UNKNOWN' AND "measuredOn" IS NULL) OR
 ("datePrecision" IN ('EXACT_DAY','APPROXIMATE') AND "measuredOn" IS NOT NULL AND to_char("measuredOn"::date,'YYYY-MM-DD')="measuredOn")) IS TRUE);
ALTER TABLE "dictionary" DROP CONSTRAINT "dictionary_namespace_check";
ALTER TABLE "dictionary" ADD CONSTRAINT "dictionary_namespace_check" CHECK ("namespace" IN ('role','city','language','skill','industry','workType','nationality','roleStyle','roleService'));
CREATE INDEX "talent_gender_birth_idx" ON "talentProfiles"("workspaceId","genderCode","birthPrecision");
CREATE INDEX "model_business_idx" ON "personRoles"("workspaceId","roleCode","castingMarketCode","experienceCode");
-- These are selectable dictionary entries, never inferred attributes. Names remain admin-maintainable.
INSERT INTO "dictionary" ("id","workspaceId","createdAt","updatedAt","revision","namespace","code","labelZh","labelEn","status")
SELECT gen_random_uuid(),w.id,now(),now(),1,x.ns,x.code,x.zh,x.en,'ACTIVE' FROM "workspaces" w CROSS JOIN (VALUES
 ('nationality','CN','中国','China'),('nationality','US','美国','United States'),('nationality','GB','英国','United Kingdom'),('nationality','FR','法国','France'),('nationality','RU','俄罗斯','Russia'),('nationality','BR','巴西','Brazil'),
 ('roleStyle','natural','自然','Natural'),('roleStyle','sport','运动','Sport'),('roleStyle','fashion','时尚','Fashion'),('roleStyle','business','商务','Business'),
 ('roleService','print','平面','Print'),('roleService','ecommerce','电商','E-commerce'),('roleService','runway','走秀','Runway'),('roleService','advertising','广告','Advertising')
) x(ns,code,zh,en) ON CONFLICT ("workspaceId","namespace","code") DO NOTHING;

-- Explicit grant for newly introduced restricted birth dates.
-- Extend the existing field allowlist; previous grants do not gain birth-date permission.
ALTER TABLE "usePermissions" DROP CONSTRAINT "usePermissions_dev07_check_4";
ALTER TABLE "usePermissions" ADD CONSTRAINT "usePermissions_dev07_check_4" CHECK (cardinality("fields") BETWEEN 1 AND 58 AND "fields" <@ ARRAY[
'person.td2.birthDate','project.parties','person.localeTexts','work.localeTexts','project.localeTexts',
'person.td2.mergeHistory','person.identityEvidence','person.displayName','person.aliases','person.roles','person.cityCode','person.languageCodes','person.skillCodes','person.heightCm','person.intro','person.status',
'work.title','work.description','work.industryCode','work.workTypeCodes','work.origin','work.originNote','work.status','work.relations',
'project.title','project.brief','project.locationNote','project.dateNote','project.reviewNote','project.status','project.relations',
'source.title','source.type','source.providerClaim','source.basisMode','source.basisDescription','source.validFrom','source.validUntil','source.status',
'person.td2.mediaCollections','person.td2.mediaCollectionTags','person.td2.adultEligibilities','media.identity','media.originals','person.td2.personCredentials','person.td2.credentialIdentifiers','person.td2.fieldEvidence','person.td2.representations','person.td2.personExternalRefs','person.td2.personCapabilities','person.td2.talentProfiles','person.td2.personRoles','person.td2.personLanguages','person.td2.talentLocations','person.td2.measurementSets','person.td2.castingProfiles','person.td2.translatorLanguagePairs','person.td2.translatorServiceModes']::text[]);
ALTER TABLE "exports" DROP CONSTRAINT "exports_dev07e_fields_check";
ALTER TABLE "exports" ADD CONSTRAINT "exports_dev07e_fields_check" CHECK (("state"='ERASED' AND cardinality("fields")=0 AND cardinality("usePermissionRefs")=0) OR ("state"<>'ERASED' AND cardinality("usePermissionRefs") BETWEEN 1 AND 1000 AND cardinality("fields") BETWEEN 1 AND 58 AND "fields" <@ ARRAY[
'person.td2.birthDate','project.parties','person.localeTexts','work.localeTexts','project.localeTexts',
'person.td2.mergeHistory','person.identityEvidence','person.displayName','person.aliases','person.roles','person.cityCode','person.languageCodes','person.skillCodes','person.heightCm','person.intro','person.status',
'work.title','work.description','work.industryCode','work.workTypeCodes','work.origin','work.originNote','work.status','work.relations',
'project.title','project.brief','project.locationNote','project.dateNote','project.reviewNote','project.status','project.relations',
'source.title','source.type','source.providerClaim','source.basisMode','source.basisDescription','source.validFrom','source.validUntil','source.status',
'person.td2.mediaCollections','person.td2.mediaCollectionTags','person.td2.adultEligibilities','media.identity','media.originals','person.td2.personCredentials','person.td2.credentialIdentifiers','person.td2.fieldEvidence','person.td2.representations','person.td2.personExternalRefs','person.td2.personCapabilities','person.td2.talentProfiles','person.td2.personRoles','person.td2.personLanguages','person.td2.talentLocations','person.td2.measurementSets','person.td2.castingProfiles','person.td2.translatorLanguagePairs','person.td2.translatorServiceModes']::text[]));
ALTER TABLE "exportDependencies" DROP CONSTRAINT "exportDependencies_dev07_check_1";
ALTER TABLE "exportDependencies" ADD CONSTRAINT "exportDependencies_dev07_check_1" CHECK (cardinality("fields") BETWEEN 1 AND 58 AND "fields" <@ ARRAY[
'person.td2.birthDate','project.parties','person.localeTexts','work.localeTexts','project.localeTexts',
'person.td2.mergeHistory','person.identityEvidence','person.displayName','person.aliases','person.roles','person.cityCode','person.languageCodes','person.skillCodes','person.heightCm','person.intro','person.status',
'work.title','work.description','work.industryCode','work.workTypeCodes','work.origin','work.originNote','work.status','work.relations',
'project.title','project.brief','project.locationNote','project.dateNote','project.reviewNote','project.status','project.relations',
'source.title','source.type','source.providerClaim','source.basisMode','source.basisDescription','source.validFrom','source.validUntil','source.status',
'person.td2.mediaCollections','person.td2.mediaCollectionTags','person.td2.adultEligibilities','media.identity','media.originals','person.td2.personCredentials','person.td2.credentialIdentifiers','person.td2.fieldEvidence','person.td2.representations','person.td2.personExternalRefs','person.td2.personCapabilities','person.td2.talentProfiles','person.td2.personRoles','person.td2.personLanguages','person.td2.talentLocations','person.td2.measurementSets','person.td2.castingProfiles','person.td2.translatorLanguagePairs','person.td2.translatorServiceModes']::text[]);

ALTER TABLE "fieldProposals" DROP CONSTRAINT "fieldProposals_td2_schema";
ALTER TABLE "fieldProposals" ADD CONSTRAINT "fieldProposals_td2_schema" CHECK (("schemaVersion" IN ('once-talent-v2.0.0','once-talent-v2.1.0') AND "baseRevision">0 AND "sourceRevision">0) IS TRUE);
COMMIT;
