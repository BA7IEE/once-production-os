-- DEV-09D bind APPROVED recovery evidence to restore-check media identity.
BEGIN;

ALTER TABLE "recoveryRuns"
  ADD CONSTRAINT "recoveryRuns_approval_media_check" CHECK (
    "state"<>'APPROVED'
    OR (
      ("approval"->>'mediaIdentityDigest') ~ '^[a-f0-9]{64}$'
      AND ("approval"->>'mediaIdentityDigest') = ("report"->'media'->>'identityDigest')
    )
  );

COMMIT;
