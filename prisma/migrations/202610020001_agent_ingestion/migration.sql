-- Migration 69. Forward-only; original 1-68 retained byte-for-byte.
ALTER TABLE "servicePrincipals" ADD COLUMN "authorizationEpoch" integer NOT NULL DEFAULT 1 CHECK ("authorizationEpoch">=1);
CREATE FUNCTION machine_authorization_epoch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW."permissionCodes",NEW."scopeId",NEW."defaultMaintainerMembershipId",NEW.status,NEW."expiresAt",NEW."recoveryEpoch") IS DISTINCT FROM (OLD."permissionCodes",OLD."scopeId",OLD."defaultMaintainerMembershipId",OLD.status,OLD."expiresAt",OLD."recoveryEpoch") THEN NEW."authorizationEpoch":=OLD."authorizationEpoch"+1;
 ELSIF NEW."authorizationEpoch"<>OLD."authorizationEpoch" THEN RAISE EXCEPTION 'authorization epoch cannot change without authorization boundary' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER machine_authorization_epoch BEFORE UPDATE ON "servicePrincipals" FOR EACH ROW EXECUTE FUNCTION machine_authorization_epoch();
ALTER TABLE "talentSubmissions" ALTER COLUMN "talentAccountId" DROP NOT NULL, ALTER COLUMN "consentId" DROP NOT NULL,
 ADD COLUMN "principalKind" text NOT NULL DEFAULT 'TALENT', ADD COLUMN "servicePrincipalId" uuid, ADD COLUMN "externalSubmissionKey" text,
 ADD COLUMN "proposedPersonId" uuid, ADD COLUMN "proposedTargetBaseline" jsonb, ADD COLUMN "servicePrincipalAuthorizationEpoch" integer,
 ADD COLUMN "intakeScopeRevision" integer, ADD COLUMN "maintainerId" uuid, ADD COLUMN "sourceDeclaration" jsonb, ADD COLUMN "reviewTargetDecision" text;
ALTER TABLE "talentSubmissions" DROP CONSTRAINT submission_context;
ALTER TABLE "talentSubmissions" ADD CONSTRAINT submission_principal_shape CHECK (((
 ("principalKind"='TALENT' AND "talentAccountId" IS NOT NULL AND "consentId" IS NOT NULL AND "servicePrincipalId" IS NULL AND "externalSubmissionKey" IS NULL AND "proposedPersonId" IS NULL AND "servicePrincipalAuthorizationEpoch" IS NULL AND (("personId" IS NOT NULL AND "grantId" IS NOT NULL) OR ("personId" IS NULL AND "claimId" IS NOT NULL AND "grantId" IS NULL))) OR
 ("principalKind"='MACHINE' AND "talentAccountId" IS NULL AND "consentId" IS NULL AND "claimId" IS NULL AND "grantId" IS NULL AND "servicePrincipalId" IS NOT NULL AND length("externalSubmissionKey") BETWEEN 1 AND 128 AND "servicePrincipalAuthorizationEpoch">=1 AND "intakeScopeRevision">=1 AND "maintainerId" IS NOT NULL AND jsonb_typeof("sourceDeclaration")='object' AND ("personId" IS NULL OR state IN ('APPROVED','PARTIALLY_APPROVED') AND "decidedById" IS NOT NULL AND "reviewTargetDecision" IN ('CREATE_NEW','LINK_EXISTING')))
)) IS TRUE);
ALTER TABLE "talentSubmissions" ADD CONSTRAINT submission_machine_owner_fk FOREIGN KEY ("workspaceId","servicePrincipalId") REFERENCES "servicePrincipals"("workspaceId",id), ADD CONSTRAINT submission_proposed_person_fk FOREIGN KEY ("workspaceId","proposedPersonId") REFERENCES people("workspaceId",id), ADD CONSTRAINT submission_machine_maintainer_fk FOREIGN KEY ("workspaceId","maintainerId") REFERENCES memberships("workspaceId",id), ADD CONSTRAINT submission_machine_key UNIQUE ("workspaceId","servicePrincipalId","externalSubmissionKey"), ADD CONSTRAINT submission_machine_owner_key UNIQUE ("workspaceId",id,"servicePrincipalId");
CREATE FUNCTION submission_principal_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW."principalKind",NEW."servicePrincipalId",NEW."talentAccountId",NEW."externalSubmissionKey",NEW."scopeId",NEW."servicePrincipalAuthorizationEpoch",NEW."intakeScopeRevision",NEW."maintainerId",NEW."recoveryEpoch") IS DISTINCT FROM (OLD."principalKind",OLD."servicePrincipalId",OLD."talentAccountId",OLD."externalSubmissionKey",OLD."scopeId",OLD."servicePrincipalAuthorizationEpoch",OLD."intakeScopeRevision",OLD."maintainerId",OLD."recoveryEpoch") THEN RAISE EXCEPTION 'submission owner and intake authorization immutable' USING ERRCODE='23514'; END IF;
 IF OLD."principalKind"='MACHINE' AND OLD.state<>'DRAFT' AND (NEW."proposedPersonId",NEW."proposedTargetBaseline",NEW."sourceDeclaration",NEW."payloadDigest") IS DISTINCT FROM (OLD."proposedPersonId",OLD."proposedTargetBaseline",OLD."sourceDeclaration",OLD."payloadDigest") THEN RAISE EXCEPTION 'machine frozen target and payload immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER submission_principal_frozen BEFORE UPDATE ON "talentSubmissions" FOR EACH ROW EXECUTE FUNCTION submission_principal_frozen();
ALTER TABLE "sourceAttributions" ADD COLUMN "principalKind" text NOT NULL DEFAULT 'TALENT', ADD COLUMN "servicePrincipalId" uuid;
ALTER TABLE "sourceAttributions" DROP CONSTRAINT attribution_live_or_imported;
ALTER TABLE "sourceAttributions" ADD CONSTRAINT attribution_principal_shape CHECK ((("principalKind" IN ('TALENT','MACHINE')) AND (
 ("importedBasis" IS NOT NULL AND "submissionId" IS NULL AND "talentAccountId" IS NULL AND "consentId" IS NULL AND "servicePrincipalId" IS NULL) OR
 ("importedBasis" IS NULL AND "principalKind"='TALENT' AND "submissionId" IS NOT NULL AND "talentAccountId" IS NOT NULL AND "consentId" IS NOT NULL AND "servicePrincipalId" IS NULL) OR
 ("importedBasis" IS NULL AND "principalKind"='MACHINE' AND "submissionId" IS NOT NULL AND "servicePrincipalId" IS NOT NULL AND "talentAccountId" IS NULL AND "consentId" IS NULL)
)) IS TRUE), ADD CONSTRAINT attribution_machine_submission_fk FOREIGN KEY ("workspaceId","submissionId","servicePrincipalId") REFERENCES "talentSubmissions"("workspaceId",id,"servicePrincipalId"), ADD CONSTRAINT attribution_machine_owner_fk FOREIGN KEY ("workspaceId","servicePrincipalId") REFERENCES "servicePrincipals"("workspaceId",id), ADD CONSTRAINT attribution_review_key UNIQUE ("workspaceId",id,"sourceId","submissionId","servicePrincipalId","reviewerId");
ALTER TABLE "sourceUseBases" ALTER COLUMN "consentRevision" DROP NOT NULL, ADD COLUMN "basisKind" text NOT NULL DEFAULT 'TALENT_CONSENT', ADD COLUMN "submissionId" uuid, ADD COLUMN "sourceAttributionId" uuid, ADD COLUMN "servicePrincipalId" uuid, ADD COLUMN "reviewerId" uuid, ADD COLUMN "reviewBasis" text;
ALTER TABLE "sourceUseBases" DROP CONSTRAINT basis_live_or_imported;
ALTER TABLE "sourceUseBases" ADD CONSTRAINT basis_typed_shape CHECK (((
 cardinality("fieldScope")>0 AND "validUntil">"createdAt" AND
 (("basisKind"='TALENT_CONSENT' AND "consentRevision">0 AND "consentRevision" IS NOT NULL AND ("consentId" IS NOT NULL AND "importedBasis" IS NULL OR "consentId" IS NULL AND "importedBasis" IS NOT NULL) AND "submissionId" IS NULL AND "sourceAttributionId" IS NULL AND "servicePrincipalId" IS NULL AND "reviewerId" IS NULL AND "reviewBasis" IS NULL) OR
 ("basisKind"='INTERNAL_REVIEW' AND "consentId" IS NULL AND "consentRevision" IS NULL AND (("importedBasis" IS NULL AND "submissionId" IS NOT NULL AND "sourceAttributionId" IS NOT NULL AND "servicePrincipalId" IS NOT NULL AND "reviewerId" IS NOT NULL AND length(trim("reviewBasis"))>0) OR ("importedBasis" IS NOT NULL AND "submissionId" IS NULL AND "sourceAttributionId" IS NULL AND "servicePrincipalId" IS NULL AND "reviewerId" IS NULL AND "reviewBasis" IS NULL AND "importedBasis"->>'basisKind'='INTERNAL_REVIEW' AND length("importedBasis"->>'reviewerId')>0 AND length("importedBasis"->>'reviewBasisDigest')>0))))
)) IS TRUE), ADD CONSTRAINT basis_internal_attribution_fk FOREIGN KEY ("workspaceId","sourceAttributionId","sourceId","submissionId","servicePrincipalId","reviewerId") REFERENCES "sourceAttributions"("workspaceId",id,"sourceId","submissionId","servicePrincipalId","reviewerId");
-- Existing projection gate covers Source state/expiry/withdrawal for both typed branches.

ALTER TABLE "sourceUseBases" ADD CONSTRAINT basis_internal_bounded CHECK ("basisKind"<>'INTERNAL_REVIEW' OR "validUntil"<="createdAt"+interval '365 days');
CREATE FUNCTION ingestion_internal_review_gate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b "sourceUseBases"; s "talentSubmissions"; a "sourceAttributions"; src sources;
BEGIN
 SELECT * INTO b FROM "sourceUseBases" WHERE id=NEW.id;
 IF b."basisKind"='INTERNAL_REVIEW' AND b."importedBasis" IS NULL THEN
  SELECT * INTO s FROM "talentSubmissions" WHERE id=b."submissionId";
  SELECT * INTO a FROM "sourceAttributions" WHERE id=b."sourceAttributionId";
  SELECT * INTO src FROM sources WHERE id=b."sourceId";
  IF s."principalKind"<>'MACHINE' OR s.state NOT IN ('APPROVED','PARTIALLY_APPROVED') OR s."decidedById" IS DISTINCT FROM b."reviewerId" OR s."personId" IS NULL OR a."principalKind"<>'MACHINE' OR src."reviewedBy" IS DISTINCT FROM b."reviewerId" THEN RAISE EXCEPTION 'internal review basis requires actual finalized review' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ingestion_internal_review_gate AFTER INSERT OR UPDATE ON "sourceUseBases" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ingestion_internal_review_gate();
