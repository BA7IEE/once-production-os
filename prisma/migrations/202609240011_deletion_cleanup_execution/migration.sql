-- DEV-07E plan-driven dependency cleanup. Root-target finalization and special media/history cleanup remain separate.
BEGIN;

ALTER TABLE "deletionRequests"
  DROP CONSTRAINT "deletionRequests_dev07c_state_check";
ALTER TABLE "deletionRequests"
  ADD CONSTRAINT "deletionRequests_dev07e_state_check"
  CHECK ("state" IN ('DRAFT','BLOCKED_FOR_USE','CLEANING'));

ALTER TABLE "deletionRequests"
  ADD COLUMN "executionPlanDigest" TEXT,
  ADD COLUMN "cleanupStartedAt" TIMESTAMPTZ(3),
  ADD COLUMN "cleanupStartedById" UUID,
  ADD COLUMN "cleanupLeaseToken" UUID,
  ADD COLUMN "cleanupLeaseUntil" TIMESTAMPTZ(3),
  ADD COLUMN "dependencyCleanupCompletedAt" TIMESTAMPTZ(3),
  ADD COLUMN "cleanupErrorCode" TEXT,
  ADD CONSTRAINT "deletionRequests_dev07e_cleanup_shape" CHECK (
    ("state" <> 'CLEANING' AND "executionPlanDigest" IS NULL AND "cleanupStartedAt" IS NULL
      AND "cleanupStartedById" IS NULL AND "cleanupLeaseToken" IS NULL AND "cleanupLeaseUntil" IS NULL
      AND "dependencyCleanupCompletedAt" IS NULL AND "cleanupErrorCode" IS NULL)
    OR
    ("state" = 'CLEANING' AND "planDigest" ~ '^[0-9a-f]{64}$' AND "executionPlanDigest" ~ '^[0-9a-f]{64}$'
      AND "cleanupStartedAt" IS NOT NULL AND "cleanupStartedById" IS NOT NULL)
  );

ALTER TABLE "deletionRequests"
  ADD CONSTRAINT "deletionRequests_cleanupStartedByRef_fkey"
  FOREIGN KEY ("workspaceId","cleanupStartedById") REFERENCES "memberships"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "deletionRequests_cleanup_worker_idx"
  ON "deletionRequests" ("workspaceId","state","cleanupLeaseUntil");

ALTER TABLE "deletionItems"
  ADD COLUMN "resolvedAction" TEXT,
  ADD COLUMN "cleanupState" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN "cleanupAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cleanupEvidenceDigest" TEXT,
  ADD COLUMN "cleanupErrorCode" TEXT,
  ADD COLUMN "cleanedAt" TIMESTAMPTZ(3),
  ADD CONSTRAINT "deletionItems_dev07e_action_check" CHECK (
    "resolvedAction" IS NULL OR "resolvedAction" IN
      ('ERASE_PAYLOAD','REMOVE_RELATION','REVOKE_PERMISSION','ERASE_DERIVATIVE','RETAIN_MINIMAL_HEADER','RETAIN_WITH_BASIS')),
  ADD CONSTRAINT "deletionItems_dev07e_cleanup_state_check" CHECK (
    "cleanupState" IN ('NOT_STARTED','PENDING','DONE','WAITING_EXTERNAL','FAILED')),
  ADD CONSTRAINT "deletionItems_dev07e_cleanup_attempts_check" CHECK ("cleanupAttempts" BETWEEN 0 AND 3),
  ADD CONSTRAINT "deletionItems_dev07e_cleanup_shape" CHECK (
    ("cleanupState"='NOT_STARTED' AND "resolvedAction" IS NULL AND "cleanupAttempts"=0
      AND "cleanupEvidenceDigest" IS NULL AND "cleanupErrorCode" IS NULL AND "cleanedAt" IS NULL)
    OR
    ("cleanupState"='PENDING' AND "resolvedAction" IS NOT NULL
      AND "cleanupEvidenceDigest" IS NULL AND "cleanedAt" IS NULL)
    OR
    ("cleanupState"='DONE' AND "resolvedAction" IS NOT NULL AND "cleanupEvidenceDigest" ~ '^[0-9a-f]{64}$'
      AND "cleanupErrorCode" IS NULL AND "cleanedAt" IS NOT NULL)
    OR
    ("cleanupState"='WAITING_EXTERNAL' AND "resolvedAction" IS NOT NULL AND length("cleanupErrorCode") BETWEEN 1 AND 120
      AND "cleanupEvidenceDigest" IS NULL AND "cleanedAt" IS NULL)
    OR
    ("cleanupState"='FAILED' AND "resolvedAction" IS NOT NULL AND "cleanupAttempts" > 0
      AND length("cleanupErrorCode") BETWEEN 1 AND 120 AND "cleanupEvidenceDigest" IS NULL AND "cleanedAt" IS NULL)
  );

CREATE INDEX "deletionItems_cleanup_idx"
  ON "deletionItems" ("workspaceId","requestId","cleanupState","cleanupAttempts");

-- An erased export keeps only its minimal header; frozen manifest/payload/field refs are removed.
ALTER TABLE "exports" DROP CONSTRAINT "exports_dev07_check_5";
ALTER TABLE "exports" DROP CONSTRAINT "exports_dev07_check_6";
ALTER TABLE "exports"
  ADD CONSTRAINT "exports_dev07e_fields_check" CHECK (
    ("state"='ERASED' AND cardinality("fields")=0 AND cardinality("usePermissionRefs")=0)
    OR
    ("state"<>'ERASED' AND cardinality("fields") BETWEEN 1 AND 33 AND cardinality("usePermissionRefs") BETWEEN 1 AND 1000)
  );

COMMIT;
