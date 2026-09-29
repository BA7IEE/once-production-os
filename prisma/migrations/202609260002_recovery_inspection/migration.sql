-- DEV-09B persistent restore inspection evidence. Forward-only.
BEGIN;

ALTER TABLE "recoveryRuns"
  ADD COLUMN "checkedAt" TIMESTAMPTZ(3),
  ADD COLUMN "report" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "recoveryRuns"
  DROP CONSTRAINT "recoveryRuns_shape_check";

ALTER TABLE "recoveryRuns"
  ADD CONSTRAINT "recoveryRuns_shape_check" CHECK (
    "revision" > 0
    AND "sourceEpochDigest" ~ '^[a-f0-9]{64}$'
    AND "targetEpochDigest" ~ '^[a-f0-9]{64}$'
    AND "sourceEpochDigest" <> "targetEpochDigest"
    AND "state" IN ('PREPARED','INSPECTED','APPROVED')
    AND "updatedAt" >= "createdAt"
    AND "preparedAt" >= "createdAt"
    AND "revokedSessions" >= 0
    AND "consumedActivations" >= 0
    AND "disabledUsers" >= 0
    AND "disabledMemberships" >= 0
    AND "revokedHandoffs" >= 0
    AND "revokedUsePermissions" >= 0
    AND "invalidatedExports" >= 0
    AND "failedJobs" >= 0
    AND "failedUploads" >= 0
    AND "quarantinedAssets" >= 0
    AND "suspendedSources" >= 0
    AND (
      ("state"='PREPARED'
        AND "checkedAt" IS NULL AND "approvedAt" IS NULL
        AND "reportDigest" IS NULL AND "report"='{}'::jsonb)
      OR
      ("state"='INSPECTED'
        AND "checkedAt" IS NOT NULL AND "approvedAt" IS NULL
        AND "reportDigest" ~ '^[a-f0-9]{64}$'
        AND jsonb_typeof("report")='object' AND "report"<>'{}'::jsonb)
      OR
      ("state"='APPROVED'
        AND "checkedAt" IS NOT NULL AND "approvedAt" IS NOT NULL
        AND "reportDigest" ~ '^[a-f0-9]{64}$'
        AND jsonb_typeof("report")='object' AND "report"<>'{}'::jsonb)
    )
  );

COMMIT;
