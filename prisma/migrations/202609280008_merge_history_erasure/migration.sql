-- Dedicated, append-only evidence for reviewed merged-history erasure.
BEGIN;
CREATE TABLE "mergeHistoryErasures" (
 "id" uuid PRIMARY KEY, "workspaceId" uuid NOT NULL, "revision" integer NOT NULL CHECK ("revision"=1),
 "createdAt" timestamptz(3) NOT NULL, "updatedAt" timestamptz(3) NOT NULL,
 "mergeDecisionId" uuid NOT NULL, "personId" uuid NOT NULL, "sourceId" uuid NOT NULL,
 "recordKind" text NOT NULL CHECK ("recordKind" IN ('PERSON','TALENT_PROFILE','CASTING_PROFILE')),
 "recordStatusBefore" text,
 "recordId" uuid NOT NULL, "recordRevision" integer NOT NULL CHECK ("recordRevision">0),
 "recordCreatedAt" timestamptz(3) NOT NULL, "recordUpdatedAt" timestamptz(3) NOT NULL,
 "supersededById" uuid, "retiredMeasurementSetId" uuid, "erasedAt" timestamptz(3) NOT NULL,
 "requestId" uuid, "actorId" uuid,
 "originalWorkspaceId" uuid, "originalRequestId" uuid, "originalActorId" uuid,
 UNIQUE ("workspaceId","id"), UNIQUE ("workspaceId","recordKind","recordId"),
 FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
 FOREIGN KEY ("workspaceId","mergeDecisionId") REFERENCES "personMerges"("workspaceId","id") ON DELETE RESTRICT,
 FOREIGN KEY ("workspaceId","personId") REFERENCES "people"("workspaceId","id") ON DELETE RESTRICT,
 FOREIGN KEY ("workspaceId","sourceId") REFERENCES "sources"("workspaceId","id") ON DELETE RESTRICT,
 FOREIGN KEY ("workspaceId","requestId") REFERENCES "deletionRequests"("workspaceId","id") ON DELETE RESTRICT,
 FOREIGN KEY ("workspaceId","actorId") REFERENCES "memberships"("workspaceId","id") ON DELETE RESTRICT,
 CHECK (("requestId" IS NOT NULL AND "actorId" IS NOT NULL AND "originalWorkspaceId" IS NULL AND "originalRequestId" IS NULL AND "originalActorId" IS NULL)
 OR ("requestId" IS NULL AND "actorId" IS NULL AND "originalWorkspaceId" IS NOT NULL AND "originalRequestId" IS NOT NULL AND "originalActorId" IS NOT NULL)),
 CHECK ("createdAt"="updatedAt" AND "createdAt"="erasedAt" AND "recordCreatedAt"<="recordUpdatedAt" AND "recordUpdatedAt"<="erasedAt"),
 CHECK ((("recordKind"='PERSON' AND "recordStatusBefore" IN ('ARCHIVED','ERASED') AND "recordId"="personId" AND "supersededById" IS NULL AND "retiredMeasurementSetId" IS NULL)
 OR ("recordKind" IN ('TALENT_PROFILE','CASTING_PROFILE') AND "recordStatusBefore" IS NULL AND "supersededById" IS NOT NULL AND "recordId"<>"supersededById" AND ("recordKind"='CASTING_PROFILE' OR "retiredMeasurementSetId" IS NULL))) IS TRUE)
);
CREATE INDEX "mergeHistoryErasures_merge_idx" ON "mergeHistoryErasures"("workspaceId","mergeDecisionId");
ALTER TABLE "personMerges" ADD COLUMN "reasonErasedAt" timestamptz(3);

CREATE FUNCTION once_history_erasure_request_valid(w uuid,r uuid,m uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS (
 SELECT 1 FROM "deletionRequests" d JOIN "personMerges" pm ON pm."workspaceId"=d."workspaceId" AND pm."id"=m
 JOIN "deletionItems" i ON i."workspaceId"=d."workspaceId" AND i."requestId"=d."id"
 WHERE d."workspaceId"=w AND d."id"=r AND d."state"='CLEANING'
 AND d."targetKind"='PERSON' AND d."targetId" IN (pm."canonicalPersonId",pm."duplicatePersonId")
 AND d."planDigest" IS NOT NULL AND d."executionPlanDigest" IS NOT NULL
 AND i."resourceKind"='talentGraph' AND i."resourceId"=d."targetId"
 AND i."decision"='APPLY_PROPOSED' AND i."resolvedAction"='ERASE_PAYLOAD'
 AND i."cleanupState" IN ('PENDING','FAILED'));
$$;
CREATE FUNCTION once_validate_history_erasure() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original_row jsonb; table_name text; merge_row "personMerges"%ROWTYPE;
BEGIN
 SELECT * INTO merge_row FROM "personMerges" WHERE "workspaceId"=NEW."workspaceId" AND "id"=NEW."mergeDecisionId";
 IF merge_row."id" IS NULL OR merge_row."duplicatePersonId"<>NEW."personId" THEN
  RAISE EXCEPTION 'history erasure identity does not match original merge' USING ERRCODE='23514';
 END IF;
 IF NEW."requestId" IS NULL THEN RETURN NEW; END IF;
 IF NOT once_history_erasure_request_valid(NEW."workspaceId",NEW."requestId",NEW."mergeDecisionId") OR NOT EXISTS (
  SELECT 1 FROM "deletionRequests" WHERE "workspaceId"=NEW."workspaceId" AND "id"=NEW."requestId" AND "cleanupStartedById"=NEW."actorId") THEN
  RAISE EXCEPTION 'history erasure requires frozen active deletion request' USING ERRCODE='23514';
 END IF;
 table_name=CASE NEW."recordKind" WHEN 'PERSON' THEN 'people' WHEN 'TALENT_PROFILE' THEN 'talentProfiles' ELSE 'castingProfiles' END;
 EXECUTE format('SELECT to_jsonb(r) FROM %I r WHERE "workspaceId"=$1 AND "id"=$2',table_name) INTO original_row USING NEW."workspaceId",NEW."recordId";
 IF original_row IS NULL OR (original_row->>'revision')::integer<>NEW."recordRevision"
 OR (original_row->>'sourceId')::uuid<>NEW."sourceId"
 OR (original_row->>'createdAt')::timestamptz<>NEW."recordCreatedAt"
 OR (original_row->>'updatedAt')::timestamptz<>NEW."recordUpdatedAt" THEN
  RAISE EXCEPTION 'history erasure original snapshot changed' USING ERRCODE='23514';
 END IF;
 IF NEW."recordKind"='PERSON' THEN
  IF original_row->>'status' IS DISTINCT FROM NEW."recordStatusBefore" OR NEW."recordStatusBefore" NOT IN ('ARCHIVED','ERASED') THEN RAISE EXCEPTION 'only merged archived or already minimal identity can be recorded here' USING ERRCODE='23514'; END IF;
 ELSE
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(merge_row."decisionManifest"->'professionalConflicts','[]'::jsonb)) c
   WHERE c->>'table'=table_name AND c->>'duplicateId'=NEW."recordId"::text AND c->>'canonicalId'=NEW."supersededById"::text AND c->>'choice'='RETAIN_DUPLICATE_HISTORY') THEN
   RAISE EXCEPTION 'erased profile lineage is absent from original merge choice' USING ERRCODE='23514';
  END IF;
  IF (original_row->>'personId')::uuid<>NEW."personId" OR (original_row->>'supersededById')::uuid IS DISTINCT FROM NEW."supersededById"
  OR (NEW."recordKind"='CASTING_PROFILE' AND (original_row->>'retiredCurrentMeasurementSetId')::uuid IS DISTINCT FROM NEW."retiredMeasurementSetId") THEN
   RAISE EXCEPTION 'history erasure lineage changed' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "mergeHistoryErasures_validate" BEFORE INSERT ON "mergeHistoryErasures" FOR EACH ROW EXECUTE FUNCTION once_validate_history_erasure();
CREATE FUNCTION once_history_erasure_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'history erasure evidence is append-only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER "mergeHistoryErasures_immutable" BEFORE UPDATE OR DELETE ON "mergeHistoryErasures" FOR EACH ROW EXECUTE FUNCTION once_history_erasure_immutable();

CREATE OR REPLACE FUNCTION once_preserve_retired_profile() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE has_history boolean;
BEGIN
 IF TG_OP = 'INSERT' THEN
  IF NEW."supersededById" IS NOT NULL THEN RAISE EXCEPTION 'retirement requires an existing profile' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' AND OLD."supersededById" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "mergeHistoryErasures" e WHERE e."workspaceId"=OLD."workspaceId" AND e."recordId"=OLD."id"
  AND e."recordKind"=CASE TG_TABLE_NAME WHEN 'talentProfiles' THEN 'TALENT_PROFILE' ELSE 'CASTING_PROFILE' END
  AND e."recordRevision"=OLD."revision" AND e."personId"=OLD."personId" AND e."sourceId"=OLD."sourceId"
  AND e."supersededById"=OLD."supersededById" AND e."requestId" IS NOT NULL
  AND once_history_erasure_request_valid(e."workspaceId",e."requestId",e."mergeDecisionId")
 ) THEN RETURN OLD; END IF;
 IF OLD."supersededById" IS NOT NULL THEN RAISE EXCEPTION 'retired profile is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 IF NEW."personId" IS DISTINCT FROM OLD."personId" OR NEW."supersededById" IS NOT NULL THEN
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE "workspaceId"=$1 AND "supersededById"=$2)', TG_TABLE_NAME)
   INTO has_history USING OLD."workspaceId", OLD."id";
  IF has_history THEN RAISE EXCEPTION 'cannot change the owner of retained profile history' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW."supersededById" IS NOT NULL THEN
  IF (to_jsonb(NEW) - ARRAY['supersededById','revision','updatedAt','currentMeasurementSetId','retiredCurrentMeasurementSetId'])
    IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['supersededById','revision','updatedAt','currentMeasurementSetId','retiredCurrentMeasurementSetId'])
    OR NEW."revision" <> OLD."revision" + 1 THEN
   RAISE EXCEPTION 'retirement must preserve original facts' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME = 'castingProfiles' AND
    ((to_jsonb(NEW)->'retiredCurrentMeasurementSetId') IS DISTINCT FROM (to_jsonb(OLD)->'currentMeasurementSetId')) THEN
   RAISE EXCEPTION 'retirement must preserve measurement pointer' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION once_person_merge_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='personMerges' AND TG_OP='UPDATE' THEN
  IF OLD."reasonErasedAt" IS NULL AND NEW."reasonErasedAt" IS NOT NULL
  AND NEW."revision"=OLD."revision"+1 AND NEW."updatedAt"=NEW."reasonErasedAt"
  AND NEW."decisionManifest"=jsonb_set(OLD."decisionManifest",'{reason}','"[ERASED]"'::jsonb,false)
  AND (to_jsonb(NEW)-ARRAY['revision','updatedAt','decisionManifest','reasonErasedAt'])=(to_jsonb(OLD)-ARRAY['revision','updatedAt','decisionManifest','reasonErasedAt'])
  AND EXISTS (SELECT 1 FROM "mergeHistoryErasures" e WHERE e."workspaceId"=OLD."workspaceId" AND e."mergeDecisionId"=OLD."id"
    AND e."erasedAt"=NEW."reasonErasedAt" AND e."requestId" IS NOT NULL
    AND once_history_erasure_request_valid(e."workspaceId",e."requestId",e."mergeDecisionId")) THEN RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION 'person merge history is append-only except reviewed one-way reason erasure' USING ERRCODE='23514';
END $$;
ALTER TABLE "personMerges" ADD CONSTRAINT "personMerges_reason_erasure_shape" CHECK (
 "reasonErasedAt" IS NULL OR ("decisionManifest"->>'reason'='[ERASED]' AND "completedAt"<="reasonErasedAt" AND "reasonErasedAt"<="updatedAt") IS TRUE);
CREATE FUNCTION once_validate_merge_reason_erasure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."reasonErasedAt" IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM "mergeHistoryErasures" e WHERE e."workspaceId"=NEW."workspaceId" AND e."mergeDecisionId"=NEW."id" AND e."erasedAt"=NEW."reasonErasedAt") THEN
 RAISE EXCEPTION 'redacted merge reason requires matching explicit erasure evidence' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "personMerges_reason_erasure_evidence" AFTER INSERT OR UPDATE ON "personMerges"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION once_validate_merge_reason_erasure();

CREATE OR REPLACE FUNCTION once_person_alias_no_chain() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."oldPersonId" = NEW."canonicalPersonId" THEN
    RAISE EXCEPTION 'person alias cannot self-reference' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (
      SELECT 1 FROM "people" p
      WHERE p."workspaceId"=NEW."workspaceId" AND p."id"=NEW."oldPersonId" AND (p."status"='ARCHIVED' OR (p."status"='ERASED' AND EXISTS (
        SELECT 1 FROM "mergeHistoryErasures" e WHERE e."workspaceId"=p."workspaceId" AND e."recordKind"='PERSON'
        AND e."recordId"=p."id" AND e."mergeDecisionId"=NEW."mergeDecisionId")))
  ) THEN
    RAISE EXCEPTION 'person alias old identity must be archived first' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
      SELECT 1 FROM "personAliases" pa
      WHERE pa."workspaceId"=NEW."workspaceId" AND pa."oldPersonId"=NEW."canonicalPersonId"
        AND pa."id"<>NEW."id"
  ) THEN
    RAISE EXCEPTION 'person alias canonical cannot itself be an alias' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
      SELECT 1 FROM "personAliases" pa
      WHERE pa."workspaceId"=NEW."workspaceId" AND pa."canonicalPersonId"=NEW."oldPersonId"
        AND pa."id"<>NEW."id"
  ) THEN
    RAISE EXCEPTION 'person alias old id cannot already be canonical' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION once_history_erasure_final_shape() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE table_name text; still_exists boolean; merge_row "personMerges"%ROWTYPE;
BEGIN
 IF NEW."recordKind"='PERSON' THEN
  IF NOT EXISTS(SELECT 1 FROM "people" WHERE "workspaceId"=NEW."workspaceId" AND "id"=NEW."recordId" AND "status"='ERASED') THEN
   RAISE EXCEPTION 'identity erasure evidence requires actual minimal identity' USING ERRCODE='23514'; END IF;
 ELSE
  table_name=CASE NEW."recordKind" WHEN 'TALENT_PROFILE' THEN 'talentProfiles' ELSE 'castingProfiles' END;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE "workspaceId"=$1 AND "id"=$2)',table_name) INTO still_exists USING NEW."workspaceId",NEW."recordId";
  IF still_exists THEN RAISE EXCEPTION 'erased historical profile still contains payload' USING ERRCODE='23514'; END IF;
  SELECT * INTO merge_row FROM "personMerges" WHERE "workspaceId"=NEW."workspaceId" AND "id"=NEW."mergeDecisionId";
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(merge_row."decisionManifest"->'professionalConflicts','[]'::jsonb)) c
   WHERE c->>'table'=table_name AND c->>'duplicateId'=NEW."recordId"::text AND c->>'canonicalId'=NEW."supersededById"::text AND c->>'choice'='RETAIN_DUPLICATE_HISTORY') THEN
   RAISE EXCEPTION 'erasure marker lacks original profile lineage' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "mergeHistoryErasures_final_shape" AFTER INSERT ON "mergeHistoryErasures"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION once_history_erasure_final_shape();

COMMIT;
