-- DEV-07E harden cleanup CHECK constraints against PostgreSQL NULL/UNKNOWN semantics.
BEGIN;

ALTER TABLE "deletionRequests"
  DROP CONSTRAINT "deletionRequests_dev07e_cleanup_shape";
ALTER TABLE "deletionRequests"
  ADD CONSTRAINT "deletionRequests_dev07e_cleanup_shape" CHECK (
    ("state" <> 'CLEANING'
      AND "executionPlanDigest" IS NULL
      AND "cleanupStartedAt" IS NULL
      AND "cleanupStartedById" IS NULL
      AND "cleanupLeaseToken" IS NULL
      AND "cleanupLeaseUntil" IS NULL
      AND "dependencyCleanupCompletedAt" IS NULL
      AND "cleanupErrorCode" IS NULL)
    OR
    ("state" = 'CLEANING'
      AND "planDigest" IS NOT NULL
      AND "planDigest" ~ '^[0-9a-f]{64}$'
      AND "executionPlanDigest" IS NOT NULL
      AND "executionPlanDigest" ~ '^[0-9a-f]{64}$'
      AND "cleanupStartedAt" IS NOT NULL
      AND "cleanupStartedById" IS NOT NULL)
  );

ALTER TABLE "deletionItems"
  DROP CONSTRAINT "deletionItems_dev07e_cleanup_shape";
ALTER TABLE "deletionItems"
  ADD CONSTRAINT "deletionItems_dev07e_cleanup_shape" CHECK (
    ("cleanupState"='NOT_STARTED'
      AND "resolvedAction" IS NULL
      AND "cleanupAttempts"=0
      AND "cleanupEvidenceDigest" IS NULL
      AND "cleanupErrorCode" IS NULL
      AND "cleanedAt" IS NULL)
    OR
    ("cleanupState"='PENDING'
      AND "resolvedAction" IS NOT NULL
      AND "cleanupEvidenceDigest" IS NULL
      AND "cleanupErrorCode" IS NULL
      AND "cleanedAt" IS NULL)
    OR
    ("cleanupState"='DONE'
      AND "resolvedAction" IS NOT NULL
      AND "cleanupEvidenceDigest" IS NOT NULL
      AND "cleanupEvidenceDigest" ~ '^[0-9a-f]{64}$'
      AND "cleanupErrorCode" IS NULL
      AND "cleanedAt" IS NOT NULL)
    OR
    ("cleanupState"='WAITING_EXTERNAL'
      AND "resolvedAction" IS NOT NULL
      AND "cleanupErrorCode" IS NOT NULL
      AND length("cleanupErrorCode") BETWEEN 1 AND 120
      AND "cleanupEvidenceDigest" IS NULL
      AND "cleanedAt" IS NULL)
    OR
    ("cleanupState"='FAILED'
      AND "resolvedAction" IS NOT NULL
      AND "cleanupAttempts" > 0
      AND "cleanupErrorCode" IS NOT NULL
      AND length("cleanupErrorCode") BETWEEN 1 AND 120
      AND "cleanupEvidenceDigest" IS NULL
      AND "cleanedAt" IS NULL)
  );

COMMIT;
