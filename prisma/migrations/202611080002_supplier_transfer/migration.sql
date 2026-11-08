-- Forward 80: immutable extension facts move only with an actual append-only merge decision.
BEGIN;
ALTER TABLE "supplierFacts" ADD COLUMN "mergeDecisionId" uuid, ADD COLUMN "originalConfirmation" jsonb;
ALTER TABLE "supplierFacts" ADD CONSTRAINT supplier_fact_merge_decision FOREIGN KEY ("workspaceId","mergeDecisionId") REFERENCES "personMerges"("workspaceId",id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "supplierFacts" ADD CONSTRAINT supplier_fact_original_confirmation CHECK ("originalConfirmation" IS NULL OR jsonb_typeof("originalConfirmation")='object' AND "originalConfirmation" ?& ARRAY['workspaceId','sourceId','reviewerId','confirmedByTalentId','confirmedAt'] AND "originalConfirmation"->>'sourceId'="sourceId"::text AND ("originalConfirmation"-ARRAY['workspaceId','sourceId','reviewerId','confirmedByTalentId','confirmedAt'])='{}'::jsonb);
CREATE OR REPLACE FUNCTION once_supplier_fact_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE catalog jsonb; f jsonb; c jsonb; actual_role text;
BEGIN
 IF TG_OP='UPDATE' AND NOT (NEW."personId"<>OLD."personId" AND NEW."mergeDecisionId" IS NOT NULL AND NEW."mergeDecisionId" IS DISTINCT FROM OLD."mergeDecisionId" AND (to_jsonb(NEW)-ARRAY['personId','textCiphertext','mergeDecisionId','revision','updatedAt'])=(to_jsonb(OLD)-ARRAY['personId','textCiphertext','mergeDecisionId','revision','updatedAt'])) AND ((to_jsonb(NEW)-ARRAY['revision','updatedAt','status','personRoleId']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','updatedAt','status','personRoleId'])
   OR (NEW."personRoleId" IS DISTINCT FROM OLD."personRoleId" AND NEW."personRoleId" IS NOT NULL)
   OR (OLD.status='RETIRED' AND NEW.status<>'RETIRED')) THEN RAISE EXCEPTION 'SUPPLIER_FACT_IMMUTABLE'; END IF;
 SELECT definition INTO catalog FROM "supplierCatalogs" WHERE "workspaceId"=NEW."workspaceId" AND version=NEW."catalogVersion" AND state='PUBLISHED';
 SELECT item INTO f FROM jsonb_array_elements(catalog->'fields') item WHERE item->>'code'=NEW."fieldCode";
 IF f IS NULL OR f->>'visibility'<>NEW.visibility OR (f->>'owner'='PERSON' AND (NEW."roleCode" IS NOT NULL OR NEW."personRoleId" IS NOT NULL))
   OR (f->>'owner'='ROLE' AND NEW."roleCode" IS NULL) OR (TG_OP='INSERT' AND f->>'owner'='ROLE' AND NEW."personRoleId" IS NULL) THEN RAISE EXCEPTION 'SUPPLIER_FACT_CATALOG_INVALID'; END IF;
 IF NEW."personRoleId" IS NOT NULL THEN
   SELECT "roleCode" INTO actual_role FROM "personRoles" WHERE "workspaceId"=NEW."workspaceId" AND "personId"=NEW."personId" AND id=NEW."personRoleId";
   IF actual_role IS DISTINCT FROM NEW."roleCode" THEN RAISE EXCEPTION 'SUPPLIER_FACT_ROLE_INVALID'; END IF;
 END IF;
 IF NEW."recordKey"='single' THEN
   c=f;
   IF NEW.id<>NEW."setId" OR NEW."componentCode"<>'value' OR NEW."valueType"<>(CASE WHEN f->>'type'='RECORDS' THEN 'STATE' ELSE f->>'type' END) THEN RAISE EXCEPTION 'SUPPLIER_FACT_TYPE_INVALID'; END IF;
 ELSE
   IF f->>'type'<>'RECORDS' OR NEW."recordKey" !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'SUPPLIER_FACT_RECORD_INVALID'; END IF;
   SELECT item INTO c FROM jsonb_array_elements(f->'components') item WHERE item->>'code'=NEW."componentCode";
   IF c IS NULL OR c->>'type'<>NEW."valueType" OR NEW."valueState"<>'KNOWN' THEN RAISE EXCEPTION 'SUPPLIER_FACT_COMPONENT_INVALID'; END IF;
 END IF;
 IF NEW."valueState"='DECLARED_NONE' AND c->>'type' NOT IN ('CODE_SET','RECORDS') THEN RAISE EXCEPTION 'SUPPLIER_FACT_STATE_INVALID'; END IF;
 IF NEW."valueState"='KNOWN' AND NEW."valueType"='CODE' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c->'options') o WHERE o->>'code'=NEW."codeValue") THEN RAISE EXCEPTION 'SUPPLIER_FACT_OPTION_INVALID'; END IF;
 IF NEW."valueState"='KNOWN' AND NEW."valueType"='NUMBER' AND ((c ? 'min' AND NEW."numberValue"<(c->>'min')::float8) OR (c ? 'max' AND NEW."numberValue">(c->>'max')::float8)) THEN RAISE EXCEPTION 'SUPPLIER_FACT_RANGE_INVALID'; END IF;
 IF NEW."textCiphertext" IS NOT NULL AND octet_length(NEW."textCiphertext")>40000 THEN RAISE EXCEPTION 'SUPPLIER_FACT_TEXT_LIMIT'; END IF;
 RETURN NEW;
END; $$;

CREATE FUNCTION once_supplier_fact_merge_decision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."personId" IS DISTINCT FROM OLD."personId" THEN
  IF NOT EXISTS (SELECT 1 FROM "personMerges" m JOIN "personAliases" a ON a."mergeDecisionId"=m.id AND a."workspaceId"=m."workspaceId"
   WHERE m.id=NEW."mergeDecisionId" AND m."workspaceId"=NEW."workspaceId" AND m."canonicalPersonId"=NEW."personId" AND m."duplicatePersonId"=OLD."personId"
    AND a."oldPersonId"=OLD."personId" AND a."canonicalPersonId"=NEW."personId" AND (m."decisionManifest"->'supplierFacts') @> jsonb_build_array(NEW.id::text)) THEN RAISE EXCEPTION 'SUPPLIER_FACT_MERGE_DECISION_REQUIRED'; END IF;
 END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER supplier_fact_merge_provenance AFTER UPDATE ON "supplierFacts" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION once_supplier_fact_merge_decision();
-- PR-03D forward export field allowlist. Existing grants acquire no new fields.
ALTER TABLE "usePermissions" DROP CONSTRAINT "usePermissions_dev07_check_4";
ALTER TABLE "usePermissions" ADD CONSTRAINT "usePermissions_dev07_check_4" CHECK (cardinality("fields") BETWEEN 1 AND 63 AND "fields" <@ ARRAY[
'person.td2.supplierFields','person.td2.birthDate','project.parties','person.localeTexts','work.localeTexts','project.localeTexts',
'person.td2.mergeHistory','person.identityEvidence','person.displayName','person.aliases','person.roles','person.cityCode','person.languageCodes','person.skillCodes','person.heightCm','person.intro','person.status',
'work.caseDate','work.datePrecision','work.location','work.brandDisplayName','work.title','work.description','work.industryCode','work.workTypeCodes','work.origin','work.originNote','work.status','work.relations',
'project.title','project.brief','project.locationNote','project.dateNote','project.reviewNote','project.status','project.relations',
'source.title','source.type','source.providerClaim','source.basisMode','source.basisDescription','source.validFrom','source.validUntil','source.status',
'person.td2.mediaCollections','person.td2.mediaCollectionTags','person.td2.adultEligibilities','media.identity','media.originals','person.td2.personCredentials','person.td2.credentialIdentifiers','person.td2.fieldEvidence','person.td2.representations','person.td2.personExternalRefs','person.td2.personCapabilities','person.td2.talentProfiles','person.td2.personRoles','person.td2.personLanguages','person.td2.talentLocations','person.td2.measurementSets','person.td2.castingProfiles','person.td2.translatorLanguagePairs','person.td2.translatorServiceModes']::text[]);
ALTER TABLE "exports" DROP CONSTRAINT "exports_dev07e_fields_check";
ALTER TABLE "exports" ADD CONSTRAINT "exports_dev07e_fields_check" CHECK (("state"='ERASED' AND cardinality("fields")=0 AND cardinality("usePermissionRefs")=0) OR ("state"<>'ERASED' AND cardinality("usePermissionRefs") BETWEEN 1 AND 1000 AND cardinality("fields") BETWEEN 1 AND 63 AND "fields" <@ ARRAY[
'person.td2.supplierFields','person.td2.birthDate','project.parties','person.localeTexts','work.localeTexts','project.localeTexts',
'person.td2.mergeHistory','person.identityEvidence','person.displayName','person.aliases','person.roles','person.cityCode','person.languageCodes','person.skillCodes','person.heightCm','person.intro','person.status',
'work.caseDate','work.datePrecision','work.location','work.brandDisplayName','work.title','work.description','work.industryCode','work.workTypeCodes','work.origin','work.originNote','work.status','work.relations',
'project.title','project.brief','project.locationNote','project.dateNote','project.reviewNote','project.status','project.relations',
'source.title','source.type','source.providerClaim','source.basisMode','source.basisDescription','source.validFrom','source.validUntil','source.status',
'person.td2.mediaCollections','person.td2.mediaCollectionTags','person.td2.adultEligibilities','media.identity','media.originals','person.td2.personCredentials','person.td2.credentialIdentifiers','person.td2.fieldEvidence','person.td2.representations','person.td2.personExternalRefs','person.td2.personCapabilities','person.td2.talentProfiles','person.td2.personRoles','person.td2.personLanguages','person.td2.talentLocations','person.td2.measurementSets','person.td2.castingProfiles','person.td2.translatorLanguagePairs','person.td2.translatorServiceModes']::text[]));
ALTER TABLE "exportDependencies" DROP CONSTRAINT "exportDependencies_dev07_check_1";
ALTER TABLE "exportDependencies" ADD CONSTRAINT "exportDependencies_dev07_check_1" CHECK (cardinality("fields") BETWEEN 1 AND 63 AND "fields" <@ ARRAY[
'person.td2.supplierFields','person.td2.birthDate','project.parties','person.localeTexts','work.localeTexts','project.localeTexts',
'person.td2.mergeHistory','person.identityEvidence','person.displayName','person.aliases','person.roles','person.cityCode','person.languageCodes','person.skillCodes','person.heightCm','person.intro','person.status',
'work.caseDate','work.datePrecision','work.location','work.brandDisplayName','work.title','work.description','work.industryCode','work.workTypeCodes','work.origin','work.originNote','work.status','work.relations',
'project.title','project.brief','project.locationNote','project.dateNote','project.reviewNote','project.status','project.relations',
'source.title','source.type','source.providerClaim','source.basisMode','source.basisDescription','source.validFrom','source.validUntil','source.status',
'person.td2.mediaCollections','person.td2.mediaCollectionTags','person.td2.adultEligibilities','media.identity','media.originals','person.td2.personCredentials','person.td2.credentialIdentifiers','person.td2.fieldEvidence','person.td2.representations','person.td2.personExternalRefs','person.td2.personCapabilities','person.td2.talentProfiles','person.td2.personRoles','person.td2.personLanguages','person.td2.talentLocations','person.td2.measurementSets','person.td2.castingProfiles','person.td2.translatorLanguagePairs','person.td2.translatorServiceModes']::text[]);


COMMIT;
