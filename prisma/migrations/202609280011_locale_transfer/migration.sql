-- Explicit internal locale fields. Existing grants and applied migrations remain unchanged.
BEGIN;
ALTER TABLE "usePermissions" DROP CONSTRAINT "usePermissions_dev07_check_4";
ALTER TABLE "usePermissions" ADD CONSTRAINT "usePermissions_dev07_check_4" CHECK (cardinality("fields") BETWEEN 1 AND 56 AND "fields" <@ ARRAY[
'person.localeTexts','work.localeTexts','project.localeTexts',
'person.td2.mergeHistory','person.identityEvidence','person.displayName','person.aliases','person.roles','person.cityCode','person.languageCodes','person.skillCodes','person.heightCm','person.intro','person.status',
'work.title','work.description','work.industryCode','work.workTypeCodes','work.origin','work.originNote','work.status','work.relations',
'project.title','project.brief','project.locationNote','project.dateNote','project.reviewNote','project.status','project.relations',
'source.title','source.type','source.providerClaim','source.basisMode','source.basisDescription','source.validFrom','source.validUntil','source.status',
'person.td2.mediaCollections','person.td2.mediaCollectionTags','person.td2.adultEligibilities','media.identity','media.originals','person.td2.personCredentials','person.td2.credentialIdentifiers','person.td2.fieldEvidence','person.td2.representations','person.td2.personExternalRefs','person.td2.personCapabilities','person.td2.talentProfiles','person.td2.personRoles','person.td2.personLanguages','person.td2.talentLocations','person.td2.measurementSets','person.td2.castingProfiles','person.td2.translatorLanguagePairs','person.td2.translatorServiceModes']::text[]);
ALTER TABLE "exports" DROP CONSTRAINT "exports_dev07e_fields_check";
ALTER TABLE "exports" ADD CONSTRAINT "exports_dev07e_fields_check" CHECK (("state"='ERASED' AND cardinality("fields")=0 AND cardinality("usePermissionRefs")=0) OR ("state"<>'ERASED' AND cardinality("usePermissionRefs") BETWEEN 1 AND 1000 AND cardinality("fields") BETWEEN 1 AND 56 AND "fields" <@ ARRAY[
'person.localeTexts','work.localeTexts','project.localeTexts',
'person.td2.mergeHistory','person.identityEvidence','person.displayName','person.aliases','person.roles','person.cityCode','person.languageCodes','person.skillCodes','person.heightCm','person.intro','person.status',
'work.title','work.description','work.industryCode','work.workTypeCodes','work.origin','work.originNote','work.status','work.relations',
'project.title','project.brief','project.locationNote','project.dateNote','project.reviewNote','project.status','project.relations',
'source.title','source.type','source.providerClaim','source.basisMode','source.basisDescription','source.validFrom','source.validUntil','source.status',
'person.td2.mediaCollections','person.td2.mediaCollectionTags','person.td2.adultEligibilities','media.identity','media.originals','person.td2.personCredentials','person.td2.credentialIdentifiers','person.td2.fieldEvidence','person.td2.representations','person.td2.personExternalRefs','person.td2.personCapabilities','person.td2.talentProfiles','person.td2.personRoles','person.td2.personLanguages','person.td2.talentLocations','person.td2.measurementSets','person.td2.castingProfiles','person.td2.translatorLanguagePairs','person.td2.translatorServiceModes']::text[]));
ALTER TABLE "exportDependencies" DROP CONSTRAINT "exportDependencies_dev07_check_1";
ALTER TABLE "exportDependencies" ADD CONSTRAINT "exportDependencies_dev07_check_1" CHECK (cardinality("fields") BETWEEN 1 AND 56 AND "fields" <@ ARRAY[
'person.localeTexts','work.localeTexts','project.localeTexts',
'person.td2.mergeHistory','person.identityEvidence','person.displayName','person.aliases','person.roles','person.cityCode','person.languageCodes','person.skillCodes','person.heightCm','person.intro','person.status',
'work.title','work.description','work.industryCode','work.workTypeCodes','work.origin','work.originNote','work.status','work.relations',
'project.title','project.brief','project.locationNote','project.dateNote','project.reviewNote','project.status','project.relations',
'source.title','source.type','source.providerClaim','source.basisMode','source.basisDescription','source.validFrom','source.validUntil','source.status',
'person.td2.mediaCollections','person.td2.mediaCollectionTags','person.td2.adultEligibilities','media.identity','media.originals','person.td2.personCredentials','person.td2.credentialIdentifiers','person.td2.fieldEvidence','person.td2.representations','person.td2.personExternalRefs','person.td2.personCapabilities','person.td2.talentProfiles','person.td2.personRoles','person.td2.personLanguages','person.td2.talentLocations','person.td2.measurementSets','person.td2.castingProfiles','person.td2.translatorLanguagePairs','person.td2.translatorServiceModes']::text[]);
ALTER TABLE "exports" DROP CONSTRAINT "exports_dev07_check_1";
ALTER TABLE "exports" ADD CONSTRAINT "exports_dev07_check_1" CHECK ("format"='JSON' AND "schemaVersion" IN ('once-export-v1','once-export-v2-talent','once-export-v3-locale'));
ALTER TABLE "localeTexts" ADD COLUMN "originalReviewWorkspaceId" UUID, ADD COLUMN "originalReviewMembershipId" UUID, ADD COLUMN "originalReviewedAt" TIMESTAMPTZ(3), ADD COLUMN "originalReviewTextDigest" TEXT, ADD COLUMN "importedBasis" JSONB;
ALTER TABLE "localeTexts" ADD CONSTRAINT "locale_original_review_complete" CHECK (num_nonnulls("originalReviewWorkspaceId","originalReviewMembershipId","originalReviewedAt","originalReviewTextDigest") IN (0,4));
ALTER TABLE "localeTexts" ADD CONSTRAINT "locale_imported_basis_shape" CHECK ("importedBasis" IS NULL OR (
 jsonb_typeof("importedBasis")='object' AND ("importedBasis"-ARRAY['workspaceId','sourceDigest','textDigest','dependencies'])='{}'::jsonb AND "importedBasis" ?& ARRAY['workspaceId','sourceDigest','textDigest','dependencies'] AND
 jsonb_typeof("importedBasis"->'workspaceId')='string' AND jsonb_typeof("importedBasis"->'sourceDigest')='string' AND jsonb_typeof("importedBasis"->'textDigest')='string' AND ("importedBasis"->>'textDigest') ~ '^[0-9a-f]{64}$' AND
 ("importedBasis"->>'workspaceId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' AND ("importedBasis"->>'sourceDigest') ~ '^[0-9a-f]{64}$' AND
 CASE WHEN jsonb_typeof("importedBasis"->'dependencies')='array' THEN jsonb_array_length("importedBasis"->'dependencies') BETWEEN 2 AND 21 ELSE false END));
ALTER TABLE "localeTexts" ADD CONSTRAINT "locale_erased_provenance_empty" CHECK ("state"<>'ERASED' OR ("originalReviewWorkspaceId" IS NULL AND "originalReviewMembershipId" IS NULL AND "originalReviewedAt" IS NULL AND "originalReviewTextDigest" IS NULL AND "importedBasis" IS NULL));
ALTER TABLE "localeTexts" ADD CONSTRAINT "locale_original_review_text_digest" CHECK ("originalReviewTextDigest" IS NULL OR "originalReviewTextDigest" ~ '^[0-9a-f]{64}$');
COMMIT;
