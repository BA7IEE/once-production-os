-- Explicit professional transfer whitelist; existing permissions remain unchanged.
BEGIN;
ALTER TABLE "usePermissions" DROP CONSTRAINT "usePermissions_dev07_check_4";
ALTER TABLE "usePermissions" ADD CONSTRAINT "usePermissions_dev07_check_4" CHECK (cardinality("fields") BETWEEN 1 AND 50 AND "fields" <@ ARRAY[
'person.displayName','person.aliases','person.roles','person.cityCode','person.languageCodes','person.skillCodes','person.heightCm','person.intro','person.status',
'work.title','work.description','work.industryCode','work.workTypeCodes','work.origin','work.originNote','work.status','work.relations',
'project.title','project.brief','project.locationNote','project.dateNote','project.reviewNote','project.status','project.relations',
'source.title','source.type','source.providerClaim','source.basisMode','source.basisDescription','source.validFrom','source.validUntil','source.status',
'person.td2.mediaCollections','person.td2.mediaCollectionTags','media.identity','media.originals','person.td2.personCredentials','person.td2.credentialIdentifiers','person.td2.fieldEvidence','person.td2.representations','person.td2.personExternalRefs','person.td2.personCapabilities','person.td2.talentProfiles','person.td2.personRoles','person.td2.personLanguages','person.td2.talentLocations','person.td2.measurementSets','person.td2.castingProfiles','person.td2.translatorLanguagePairs','person.td2.translatorServiceModes']::text[]);
ALTER TABLE "exports" DROP CONSTRAINT "exports_dev07e_fields_check";
ALTER TABLE "exports" ADD CONSTRAINT "exports_dev07e_fields_check" CHECK (("state"='ERASED' AND cardinality("fields")=0 AND cardinality("usePermissionRefs")=0) OR ("state"<>'ERASED' AND cardinality("usePermissionRefs") BETWEEN 1 AND 1000 AND cardinality("fields") BETWEEN 1 AND 50 AND "fields" <@ ARRAY[
'person.displayName','person.aliases','person.roles','person.cityCode','person.languageCodes','person.skillCodes','person.heightCm','person.intro','person.status',
'work.title','work.description','work.industryCode','work.workTypeCodes','work.origin','work.originNote','work.status','work.relations',
'project.title','project.brief','project.locationNote','project.dateNote','project.reviewNote','project.status','project.relations',
'source.title','source.type','source.providerClaim','source.basisMode','source.basisDescription','source.validFrom','source.validUntil','source.status',
'person.td2.mediaCollections','person.td2.mediaCollectionTags','media.identity','media.originals','person.td2.personCredentials','person.td2.credentialIdentifiers','person.td2.fieldEvidence','person.td2.representations','person.td2.personExternalRefs','person.td2.personCapabilities','person.td2.talentProfiles','person.td2.personRoles','person.td2.personLanguages','person.td2.talentLocations','person.td2.measurementSets','person.td2.castingProfiles','person.td2.translatorLanguagePairs','person.td2.translatorServiceModes']::text[]));
ALTER TABLE "exportDependencies" DROP CONSTRAINT "exportDependencies_dev07_check_1";
ALTER TABLE "exportDependencies" ADD CONSTRAINT "exportDependencies_dev07_check_1" CHECK (cardinality("fields") BETWEEN 1 AND 50 AND "fields" <@ ARRAY[
'person.displayName','person.aliases','person.roles','person.cityCode','person.languageCodes','person.skillCodes','person.heightCm','person.intro','person.status',
'work.title','work.description','work.industryCode','work.workTypeCodes','work.origin','work.originNote','work.status','work.relations',
'project.title','project.brief','project.locationNote','project.dateNote','project.reviewNote','project.status','project.relations',
'source.title','source.type','source.providerClaim','source.basisMode','source.basisDescription','source.validFrom','source.validUntil','source.status',
'person.td2.mediaCollections','person.td2.mediaCollectionTags','media.identity','media.originals','person.td2.personCredentials','person.td2.credentialIdentifiers','person.td2.fieldEvidence','person.td2.representations','person.td2.personExternalRefs','person.td2.personCapabilities','person.td2.talentProfiles','person.td2.personRoles','person.td2.personLanguages','person.td2.talentLocations','person.td2.measurementSets','person.td2.castingProfiles','person.td2.translatorLanguagePairs','person.td2.translatorServiceModes']::text[]);
COMMIT;
