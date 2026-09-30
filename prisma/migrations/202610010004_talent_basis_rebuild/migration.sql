-- Forward-only: migration58 has already been applied to the disposable acceptance database.
ALTER TABLE "sourceAttributions" ALTER COLUMN "submissionId" DROP NOT NULL, ALTER COLUMN "talentAccountId" DROP NOT NULL, ALTER COLUMN "consentId" DROP NOT NULL, ADD COLUMN "importedBasis" jsonb;
ALTER TABLE "sourceUseBases" ALTER COLUMN "consentId" DROP NOT NULL, ADD COLUMN "importedBasis" jsonb;
ALTER TABLE "sourceAttributions" ADD CONSTRAINT attribution_live_or_imported CHECK (("importedBasis" IS NULL AND "submissionId" IS NOT NULL AND "talentAccountId" IS NOT NULL AND "consentId" IS NOT NULL) OR ("importedBasis" IS NOT NULL AND "submissionId" IS NULL AND "talentAccountId" IS NULL AND "consentId" IS NULL));
ALTER TABLE "sourceUseBases" ADD CONSTRAINT basis_live_or_imported CHECK (("importedBasis" IS NULL AND "consentId" IS NOT NULL) OR ("importedBasis" IS NOT NULL AND "consentId" IS NULL));
-- These keys support ownership FKs, preventing a valid account + another person's claim.
ALTER TABLE "talentClaims" ADD CONSTRAINT claim_account_target_key UNIQUE ("workspaceId",id,"talentAccountId","targetPersonId");
ALTER TABLE "talentAccessGrants" ADD CONSTRAINT grant_claim_account_person_fk FOREIGN KEY ("workspaceId","claimId","talentAccountId","personId") REFERENCES "talentClaims" ("workspaceId",id,"talentAccountId","targetPersonId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "talentAccessGrants" ADD CONSTRAINT grant_account_person_key UNIQUE ("workspaceId",id,"talentAccountId","personId");
ALTER TABLE "talentSubmissions" ADD CONSTRAINT submission_grant_account_person_fk FOREIGN KEY ("workspaceId","grantId","talentAccountId","personId") REFERENCES "talentAccessGrants" ("workspaceId",id,"talentAccountId","personId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "talentConsents" ADD CONSTRAINT consent_account_key UNIQUE ("workspaceId",id,"talentAccountId");
ALTER TABLE "talentSubmissions" ADD CONSTRAINT submission_consent_account_fk FOREIGN KEY ("workspaceId","consentId","talentAccountId") REFERENCES "talentConsents" ("workspaceId",id,"talentAccountId");
CREATE FUNCTION talent_text_item_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_state text;
BEGIN
 SELECT state INTO parent_state FROM "talentSubmissions" WHERE id=OLD."submissionId" AND "workspaceId"=OLD."workspaceId";
 IF parent_state <> 'DRAFT' AND (TG_OP='DELETE' OR (NEW.values,NEW.baseline,NEW."clientItemKey",NEW."kind",NEW."targetId",NEW."dependencyGroup",NEW."dependsOn",NEW."submissionId",NEW."workspaceId") IS DISTINCT FROM (OLD.values,OLD.baseline,OLD."clientItemKey",OLD."kind",OLD."targetId",OLD."dependencyGroup",OLD."dependsOn",OLD."submissionId",OLD."workspaceId")) THEN
   IF TG_OP='UPDATE' AND NEW.values='{"erased":true}'::jsonb AND NEW.baseline='{}'::jsonb AND NEW."submissionId"=OLD."submissionId" AND NEW."workspaceId"=OLD."workspaceId" THEN RETURN NEW; END IF;
   RAISE EXCEPTION 'submitted talent text is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER talent_text_item_frozen BEFORE UPDATE OR DELETE ON "talentSubmissionItems" FOR EACH ROW EXECUTE FUNCTION talent_text_item_frozen();
CREATE FUNCTION talent_internal_basis_gate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM "sourceUseBases" b JOIN sources s ON s.id=b."sourceId" AND s."workspaceId"=b."workspaceId" LEFT JOIN "talentConsents" c ON c.id=b."consentId" AND c."workspaceId"=b."workspaceId"
 WHERE s.status<>'ERASED' AND (s."internalUseUntil" IS NULL OR s."internalUseUntil">b."validUntil" OR (b.state='REVOKED' OR c.state='REVOKED') AND s."internalUseUntil">CURRENT_TIMESTAMP OR c.id IS NOT NULL AND (b."validUntil">c."validUntil" OR b.purpose<>c.purpose))) THEN
 RAISE EXCEPTION 'talent source use basis gate mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER talent_source_basis_gate AFTER INSERT OR UPDATE ON sources DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION talent_internal_basis_gate();
CREATE CONSTRAINT TRIGGER talent_use_basis_gate AFTER INSERT OR UPDATE ON "sourceUseBases" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION talent_internal_basis_gate();
CREATE CONSTRAINT TRIGGER talent_consent_basis_gate AFTER INSERT OR UPDATE ON "talentConsents" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION talent_internal_basis_gate();
