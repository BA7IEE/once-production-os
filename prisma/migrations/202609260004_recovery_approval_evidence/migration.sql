-- DEV-09C zero-delta recovery approval evidence. Forward-only.
BEGIN;

ALTER TABLE "recoveryRuns"
  ADD COLUMN "approvalDigest" TEXT,
  ADD COLUMN "approval" JSONB NOT NULL DEFAULT '{}'::jsonb;

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
        AND "reportDigest" IS NULL AND "report"='{}'::jsonb
        AND "approvalDigest" IS NULL AND "approval"='{}'::jsonb)
      OR
      ("state"='INSPECTED'
        AND "checkedAt" IS NOT NULL AND "approvedAt" IS NULL
        AND "reportDigest" ~ '^[a-f0-9]{64}$'
        AND jsonb_typeof("report")='object' AND "report"<>'{}'::jsonb
        AND "approvalDigest" IS NULL AND "approval"='{}'::jsonb)
      OR
      ("state"='APPROVED'
        AND "checkedAt" IS NOT NULL AND "approvedAt" IS NOT NULL AND "approvedAt" >= "checkedAt"
        AND "reportDigest" ~ '^[a-f0-9]{64}$'
        AND jsonb_typeof("report")='object' AND "report"<>'{}'::jsonb
        AND "approvalDigest" ~ '^[a-f0-9]{64}$'
        AND jsonb_typeof("approval")='object' AND "approval"<>'{}'::jsonb)
    )
  );

ALTER TABLE "recoveryRuns"
  ADD CONSTRAINT "recoveryRuns_approval_evidence_check" CHECK (
    "state"<>'APPROVED'
    OR (
      "approval"->>'schemaVersion'='once-recovery-approval-v1'
      AND ("approval"->>'backupId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND ("approval"->>'backupManifestDigest') ~ '^[a-f0-9]{64}$'
      AND ("approval"->>'databaseSha256') ~ '^[a-f0-9]{64}$'
      AND ("approval"->>'recoveryEpochDigest') = "sourceEpochDigest"
      AND ("approval"->>'contactKeyDigest') = ("report"->>'contactKeyDigest')
      AND ("approval"->>'migrationDigest') = ("report"->>'migrationDigest')
      AND ("approval"->>'reportDigest') = "reportDigest"
      AND jsonb_typeof("approval"->'safetyJournal')='object'
      AND ("approval"->'safetyJournal'->>'journalId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND jsonb_typeof("approval"->'safetyJournal'->'backupSequence')='number'
      AND jsonb_typeof("approval"->'safetyJournal'->'currentSequence')='number'
      AND jsonb_typeof("approval"->'safetyJournal'->'postBackupEntries')='number'
      AND ("approval"->'safetyJournal'->'backupSequence') = ("approval"->'safetyJournal'->'currentSequence')
      AND ("approval"->'safetyJournal'->'postBackupEntries') = '0'::jsonb
      AND ("approval"->'safetyJournal'->>'backupHeadHash') ~ '^[a-f0-9]{64}$'
      AND ("approval"->'safetyJournal'->>'currentHeadHash') = ("approval"->'safetyJournal'->>'backupHeadHash')
    )
  );

COMMIT;
