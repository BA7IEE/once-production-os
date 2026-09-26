-- DEV-09E replace zero-delta approval guard with fully-resolved delta evidence.
BEGIN;

ALTER TABLE "recoveryRuns"
  DROP CONSTRAINT "recoveryRuns_approval_evidence_check";

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
      AND ("approval"->>'deltaResolutionDigest') ~ '^[a-f0-9]{64}$'
      AND jsonb_typeof("approval"->'deltaResolution')='object'
      AND ("approval"->'deltaResolution'->>'schemaVersion')='once-recovery-delta-v1'
      AND jsonb_typeof("approval"->'deltaResolution'->'backupSequence')='number'
      AND jsonb_typeof("approval"->'deltaResolution'->'currentSequence')='number'
      AND jsonb_typeof("approval"->'deltaResolution'->'postBackupEntries')='number'
      AND jsonb_typeof("approval"->'deltaResolution'->'resolved')='number'
      AND ("approval"->'deltaResolution'->'unresolved')='0'::jsonb
      AND jsonb_typeof("approval"->'deltaResolution'->'items')='array'
      AND jsonb_typeof("approval"->'safetyJournal')='object'
      AND ("approval"->'safetyJournal'->>'journalId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND jsonb_typeof("approval"->'safetyJournal'->'backupSequence')='number'
      AND jsonb_typeof("approval"->'safetyJournal'->'currentSequence')='number'
      AND jsonb_typeof("approval"->'safetyJournal'->'postBackupEntries')='number'
      AND ("approval"->'safetyJournal'->>'backupHeadHash') ~ '^[a-f0-9]{64}$'
      AND ("approval"->'safetyJournal'->>'currentHeadHash') ~ '^[a-f0-9]{64}$'
      AND ("approval"->'deltaResolution'->'backupSequence') = ("approval"->'safetyJournal'->'backupSequence')
      AND ("approval"->'deltaResolution'->'currentSequence') = ("approval"->'safetyJournal'->'currentSequence')
      AND ("approval"->'deltaResolution'->'postBackupEntries') = ("approval"->'safetyJournal'->'postBackupEntries')
    )
  );

COMMIT;
