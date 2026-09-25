-- DEV-07F finalization states and one-way erased root/history shapes.
BEGIN;

ALTER TABLE "deletionRequests"
  DROP CONSTRAINT "deletionRequests_dev07e_state_check";
ALTER TABLE "deletionRequests"
  ADD CONSTRAINT "deletionRequests_dev07f_state_check"
  CHECK ("state" IN ('DRAFT','BLOCKED_FOR_USE','CLEANING','COMPLETED','RETAINED_WITH_BASIS','FAILED'));

ALTER TABLE "deletionRequests"
  ADD COLUMN "finalizationDigest" TEXT,
  ADD COLUMN "finalizedAt" TIMESTAMPTZ(3),
  ADD COLUMN "finalizationLeaseToken" UUID,
  ADD COLUMN "finalizationLeaseUntil" TIMESTAMPTZ(3),
  ADD COLUMN "finalizationAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "finalizationErrorCode" TEXT,
  ADD CONSTRAINT "deletionRequests_dev07f_finalization_shape" CHECK (
    ("state" IN ('DRAFT','BLOCKED_FOR_USE') AND "finalizationDigest" IS NULL AND "finalizedAt" IS NULL
      AND "finalizationLeaseToken" IS NULL AND "finalizationLeaseUntil" IS NULL AND "finalizationAttempts"=0 AND "finalizationErrorCode" IS NULL)
    OR
    ("state"='CLEANING' AND "finalizationDigest" IS NULL AND "finalizedAt" IS NULL
      AND "finalizationAttempts" BETWEEN 0 AND 3
      AND (("finalizationLeaseToken" IS NULL AND "finalizationLeaseUntil" IS NULL)
        OR ("finalizationLeaseToken" IS NOT NULL AND "finalizationLeaseUntil" IS NOT NULL)))
    OR
    ("state" IN ('COMPLETED','RETAINED_WITH_BASIS') AND "finalizationDigest" ~ '^[0-9a-f]{64}$'
      AND "finalizedAt" IS NOT NULL AND "finalizationLeaseToken" IS NULL AND "finalizationLeaseUntil" IS NULL
      AND "finalizationAttempts" BETWEEN 1 AND 3 AND "finalizationErrorCode" IS NULL)
    OR
    ("state"='FAILED' AND "finalizationDigest" IS NULL AND "finalizedAt" IS NULL
      AND "finalizationLeaseToken" IS NULL AND "finalizationLeaseUntil" IS NULL
      AND "finalizationAttempts"=3 AND length("finalizationErrorCode") BETWEEN 1 AND 120)
  );

CREATE INDEX "deletionRequests_finalization_worker_idx"
  ON "deletionRequests" ("workspaceId","state","finalizationLeaseUntil");

ALTER TABLE "deletionItems" DROP CONSTRAINT "deletionItems_dev07e_action_check";
ALTER TABLE "deletionItems"
  ADD CONSTRAINT "deletionItems_dev07f_action_check" CHECK (
    "resolvedAction" IS NULL OR "resolvedAction" IN
      ('ERASE_PAYLOAD','REMOVE_RELATION','REVOKE_PERMISSION','ERASE_DERIVATIVE','RETAIN_MINIMAL_HEADER',
       'RETAIN_WITH_BASIS','REBIND_SOURCE','DETACH_PERSON'));

ALTER TABLE "sources" DROP CONSTRAINT "sources_status_check";
ALTER TABLE "sources" ADD CONSTRAINT "sources_status_check"
  CHECK ("status" IN ('RECEIVED','CONFIRMED','SUSPENDED','ERASED'));
ALTER TABLE "sources" ADD CONSTRAINT "sources_dev07f_erased_shape" CHECK (
  "status"<>'ERASED' OR ("title"='[ERASED]' AND "type"='MANUAL' AND "providerClaim"='' AND "textPayload"=''
    AND "basisMode"='INTERNAL_USE' AND "basisDescription"='[ERASED]' AND "reviewedBy" IS NULL AND "reviewedAt" IS NULL));

ALTER TABLE "people" DROP CONSTRAINT "people_status_check";
ALTER TABLE "people" ADD CONSTRAINT "people_status_check"
  CHECK ("status" IN ('DRAFT','ACTIVE','ARCHIVED','ERASED'));
ALTER TABLE "people" ADD CONSTRAINT "people_dev07f_erased_shape" CHECK (
  "status"<>'ERASED' OR ("displayName"='[ERASED]' AND "aliases"=ARRAY[]::text[] AND "roles"=ARRAY['erased']::text[]
    AND "cityCode" IS NULL AND "languageCodes"=ARRAY[]::text[] AND "skillCodes"=ARRAY[]::text[]
    AND "heightCm" IS NULL AND "intro"=''));

ALTER TABLE "works" DROP CONSTRAINT "works_wp1_check_3";
ALTER TABLE "works" ADD CONSTRAINT "works_wp1_check_3"
  CHECK ("status" IN ('DRAFT','ACTIVE','ARCHIVED','ERASED'));
ALTER TABLE "works" ADD CONSTRAINT "works_dev07f_erased_shape" CHECK (
  "status"<>'ERASED' OR ("title"='[ERASED]' AND "description"='' AND "industryCode" IS NULL
    AND "workTypeCodes"=ARRAY[]::text[] AND "origin"='UNKNOWN' AND "originNote"='' AND "coverEntryId" IS NULL));

ALTER TABLE "projects" DROP CONSTRAINT "projects_wp1_check_2";
ALTER TABLE "projects" ADD CONSTRAINT "projects_wp1_check_2"
  CHECK ("status" IN ('DRAFT','ACTIVE','COMPLETED','ARCHIVED','ERASED'));
ALTER TABLE "projects" ADD CONSTRAINT "projects_dev07f_erased_shape" CHECK (
  "status"<>'ERASED' OR ("title"='[ERASED]' AND "brief"='' AND "locationNote"='' AND "dateNote"='' AND "reviewNote"=''));

ALTER TABLE "uploads" DROP CONSTRAINT "uploads_m1_check_3";
ALTER TABLE "uploads" DROP CONSTRAINT "uploads_m1_check_7";
ALTER TABLE "uploads" DROP CONSTRAINT "uploads_m1_check_9";
ALTER TABLE "uploads" DROP CONSTRAINT "uploads_m1_check_10";
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_m1_check_3"
  CHECK (("state"='ERASED' AND "expectedBytes"=0) OR ("state"<>'ERASED' AND "expectedBytes" BETWEEN 1 AND 30000000));
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_m1_check_7"
  CHECK ("state" IN ('OPEN','RECEIVING','UPLOADED','QUEUED','PROCESSING','READY','FAILED','CANCELLED','ERASED'));
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_m1_check_9"
  CHECK ("state" NOT IN ('RECEIVING','UPLOADED','QUEUED','PROCESSING','READY') OR "receiveToken" IS NOT NULL);
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_m1_check_10"
  CHECK ("purgedAt" IS NULL OR "state" IN ('FAILED','CANCELLED','ERASED'));
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_dev07f_erased_shape" CHECK (
  "state"<>'ERASED' OR ("fileName"='[ERASED]' AND "expectedHash"=repeat('0',64) AND "expectedBytes"=0
    AND "personId" IS NULL AND "personScopeId" IS NULL AND "personEpoch" IS NULL AND "personScopeRevision" IS NULL
    AND "receiveToken" IS NULL AND "leaseToken" IS NULL AND "leaseUntil" IS NULL AND "purgedAt" IS NOT NULL));

ALTER TABLE "assets" DROP CONSTRAINT "assets_m1_check_3";
ALTER TABLE "assets" DROP CONSTRAINT "assets_m1_check_4";
ALTER TABLE "assets" DROP CONSTRAINT "assets_m1_check_5";
ALTER TABLE "assets" DROP CONSTRAINT "assets_m1_check_6";
ALTER TABLE "assets" ADD CONSTRAINT "assets_m1_check_3"
  CHECK ("state" IN ('READY','QUARANTINED','ERASED'));
ALTER TABLE "assets" ADD CONSTRAINT "assets_m1_check_4"
  CHECK (("state"='ERASED' AND "bytes"=0) OR ("state"<>'ERASED' AND "bytes" BETWEEN 1 AND 30000000));
ALTER TABLE "assets" ADD CONSTRAINT "assets_m1_check_5"
  CHECK (("state"='ERASED' AND "previewBytes"=0) OR ("state"<>'ERASED' AND "previewBytes" BETWEEN 1 AND 5000000));
ALTER TABLE "assets" ADD CONSTRAINT "assets_m1_check_6"
  CHECK (("state"='ERASED' AND "width"=0 AND "height"=0) OR
    ("state"<>'ERASED' AND "width">0 AND "height">0 AND "width"::bigint*"height"::bigint<=60000000));
ALTER TABLE "assets" ADD CONSTRAINT "assets_dev07f_erased_shape" CHECK (
  "state"<>'ERASED' OR ("fileName"='[ERASED]' AND "sha256"=repeat('0',64) AND "previewHash"=repeat('0',64)
    AND "bytes"=0 AND "width"=0 AND "height"=0 AND "previewBytes"=0
    AND "objectToken"='00000000-0000-0000-0000-000000000000'::uuid AND "personId" IS NULL));

-- Allow exactly one one-way SourceHistory payload redaction. All identity/version/audit columns remain immutable.
CREATE OR REPLACE FUNCTION once_source_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE'
       AND OLD."snapshot"->>'erased' IS DISTINCT FROM 'true'
       AND NEW."snapshot" = jsonb_build_object(
            'id', OLD."sourceId"::text,
            'workspaceId', OLD."workspaceId"::text,
            'revision', OLD."sourceRevision",
            'scopeId', OLD."scopeId"::text,
            'erased', true)
       AND NEW."id"=OLD."id" AND NEW."workspaceId"=OLD."workspaceId" AND NEW."revision"=OLD."revision"
       AND NEW."sourceId"=OLD."sourceId" AND NEW."sourceRevision"=OLD."sourceRevision" AND NEW."scopeId"=OLD."scopeId"
       AND NEW."actorId" IS NOT DISTINCT FROM OLD."actorId" AND NEW."action"=OLD."action"
       AND NEW."baselineOnly"=OLD."baselineOnly" AND NEW."basisAmbiguous"=OLD."basisAmbiguous"
       AND NEW."createdAt"=OLD."createdAt"
       AND NEW."decisionReason" IS NOT DISTINCT FROM
            (CASE WHEN OLD."decisionReason" IS NULL THEN NULL::text ELSE '[ERASED]' END)
    THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'sourceHistory is append-only; only reviewed one-way payload redaction is allowed'
        USING ERRCODE = '55000';
END;
$$;

COMMIT;
