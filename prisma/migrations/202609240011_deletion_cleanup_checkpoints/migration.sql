-- DEV-07E resumable database cleanup checkpoints. Media/history erasure remains follow-up work.
BEGIN;

ALTER TABLE "deletionRequests"
  DROP CONSTRAINT "deletionRequests_dev07c_state_check";
ALTER TABLE "deletionRequests"
  ADD CONSTRAINT "deletionRequests_dev07e_state_check"
  CHECK ("state" IN ('DRAFT','BLOCKED_FOR_USE','CLEANING','COMPLETED','RETAINED_WITH_BASIS','FAILED'));

DROP INDEX "deletionRequests_one_blocked_target";
CREATE UNIQUE INDEX "deletionRequests_one_restricted_target"
  ON "deletionRequests" ("workspaceId","targetKind","targetId")
  WHERE "state" <> 'DRAFT';

ALTER TABLE "deletionRequests"
  ADD COLUMN "cleanupLeaseToken" UUID,
  ADD COLUMN "cleanupLeaseUntil" TIMESTAMPTZ(3),
  ADD COLUMN "cleanupAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cleanupErrorCode" TEXT,
  ADD COLUMN "cleanupStartedAt" TIMESTAMPTZ(3),
  ADD COLUMN "cleanupCompletedAt" TIMESTAMPTZ(3),
  ADD CONSTRAINT "deletionRequests_dev07e_attempts_check" CHECK ("cleanupAttempts" BETWEEN 0 AND 3),
  ADD CONSTRAINT "deletionRequests_dev07e_lease_shape" CHECK (
    ("cleanupLeaseToken" IS NULL AND "cleanupLeaseUntil" IS NULL)
    OR ("cleanupLeaseToken" IS NOT NULL AND "cleanupLeaseUntil" IS NOT NULL)
  ),
  ADD CONSTRAINT "deletionRequests_dev07e_time_shape" CHECK (
    (("state" IN ('DRAFT','BLOCKED_FOR_USE')) AND "cleanupStartedAt" IS NULL AND "cleanupCompletedAt" IS NULL)
    OR
    (("state" IN ('CLEANING','FAILED')) AND "cleanupStartedAt" IS NOT NULL AND "cleanupCompletedAt" IS NULL)
    OR
    (("state" IN ('COMPLETED','RETAINED_WITH_BASIS')) AND "cleanupStartedAt" IS NOT NULL AND "cleanupCompletedAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "deletionRequests_dev07e_error_shape" CHECK (
    ("state"='FAILED' AND "cleanupErrorCode" IS NOT NULL)
    OR ("state"<>'FAILED')
  );

CREATE INDEX "deletionRequests_cleanup_worker_idx"
  ON "deletionRequests" ("workspaceId","state","cleanupLeaseUntil");

ALTER TABLE "deletionItems"
  ADD COLUMN "cleanupState" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "cleanupCode" TEXT,
  ADD COLUMN "cleanedAt" TIMESTAMPTZ(3),
  ADD CONSTRAINT "deletionItems_dev07e_cleanup_state_check"
    CHECK ("cleanupState" IN ('PENDING','DONE','RETAINED','DEFERRED','FAILED')),
  ADD CONSTRAINT "deletionItems_dev07e_cleanup_shape" CHECK (
    ("cleanupState"='PENDING' AND "cleanupCode" IS NULL AND "cleanedAt" IS NULL)
    OR
    ("cleanupState" IN ('DONE','RETAINED') AND "cleanupCode" IS NULL AND "cleanedAt" IS NOT NULL)
    OR
    ("cleanupState" IN ('DEFERRED','FAILED') AND "cleanupCode" IS NOT NULL AND "cleanedAt" IS NOT NULL)
  );

CREATE INDEX "deletionItems_cleanup_idx"
  ON "deletionItems" ("workspaceId","requestId","cleanupState");

COMMIT;
