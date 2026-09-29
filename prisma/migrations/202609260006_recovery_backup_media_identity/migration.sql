-- DEV-09D replace interim approval media guard with stable backup identity semantics.
BEGIN;

ALTER TABLE "recoveryRuns"
  DROP CONSTRAINT "recoveryRuns_approval_media_check";

ALTER TABLE "recoveryRuns"
  ADD CONSTRAINT "recoveryRuns_report_backup_media_check" CHECK (
    "state"='PREPARED'
    OR (
      ("report"->'media'->>'backupIdentityDigest') ~ '^[a-f0-9]{64}$'
    )
  );

ALTER TABLE "recoveryRuns"
  ADD CONSTRAINT "recoveryRuns_approval_media_check" CHECK (
    "state"<>'APPROVED'
    OR (
      ("approval"->>'mediaIdentityDigest') ~ '^[a-f0-9]{64}$'
      AND ("approval"->>'mediaIdentityDigest') = ("report"->'media'->>'backupIdentityDigest')
    )
  );

COMMIT;
