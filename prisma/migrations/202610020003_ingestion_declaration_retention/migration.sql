-- Migration 71: a one-way erasure exception for sensitive candidate declarations.
-- Keep submitted target and payload digest frozen; do not edit migrations 1-70.
CREATE OR REPLACE FUNCTION submission_principal_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW."principalKind",NEW."servicePrincipalId",NEW."talentAccountId",NEW."externalSubmissionKey",NEW."scopeId",NEW."servicePrincipalAuthorizationEpoch",NEW."intakeScopeRevision",NEW."maintainerId",NEW."recoveryEpoch") IS DISTINCT FROM (OLD."principalKind",OLD."servicePrincipalId",OLD."talentAccountId",OLD."externalSubmissionKey",OLD."scopeId",OLD."servicePrincipalAuthorizationEpoch",OLD."intakeScopeRevision",OLD."maintainerId",OLD."recoveryEpoch") THEN RAISE EXCEPTION 'submission owner and intake authorization immutable' USING ERRCODE='23514'; END IF;
 IF OLD."principalKind"='MACHINE' AND OLD.state<>'DRAFT' THEN
  IF (NEW."proposedPersonId",NEW."proposedTargetBaseline",NEW."payloadDigest") IS DISTINCT FROM (OLD."proposedPersonId",OLD."proposedTargetBaseline",OLD."payloadDigest") THEN RAISE EXCEPTION 'machine frozen target and payload immutable' USING ERRCODE='23514'; END IF;
  IF NEW."sourceDeclaration" IS DISTINCT FROM OLD."sourceDeclaration" AND NOT (NEW."sourceDeclaration"='{"erased":true}'::jsonb AND NEW.state IN ('EXPIRED','WITHDRAWN','APPROVED','PARTIALLY_APPROVED','REJECTED') AND NEW."expiresAt"<=NEW."updatedAt") THEN RAISE EXCEPTION 'machine frozen declaration immutable except terminal erasure' USING ERRCODE='23514'; END IF;
 END IF;
 IF OLD."sourceDeclaration"='{"erased":true}'::jsonb AND NEW."sourceDeclaration" IS DISTINCT FROM OLD."sourceDeclaration" THEN RAISE EXCEPTION 'erased declaration cannot revive' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION ingestion_declaration_erasure_gate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s "talentSubmissions";
BEGIN
 SELECT * INTO s FROM "talentSubmissions" WHERE id=NEW.id;
 IF s."principalKind"='MACHINE' AND s."sourceDeclaration"='{"erased":true}'::jsonb AND (s.state NOT IN ('EXPIRED','WITHDRAWN','APPROVED','PARTIALLY_APPROVED','REJECTED') OR s."expiresAt">s."updatedAt" OR EXISTS(SELECT 1 FROM "talentSubmissionItems" i WHERE i."submissionId"=s.id AND i.values<>'{"erased":true}'::jsonb)) THEN RAISE EXCEPTION 'declaration erasure requires terminal expired submission and erased items' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ingestion_declaration_erasure_gate AFTER INSERT OR UPDATE ON "talentSubmissions" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ingestion_declaration_erasure_gate();
