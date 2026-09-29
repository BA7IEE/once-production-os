-- DEV-09B harden persisted restore inspection evidence against forged shapes.
BEGIN;

ALTER TABLE "recoveryRuns"
  ADD CONSTRAINT "recoveryRuns_inspection_report_check" CHECK (
    "state"='PREPARED'
    OR (
      "checkedAt" IS NOT NULL
      AND "checkedAt" >= "preparedAt"
      AND "report"->>'schemaVersion' = 'once-recovery-check-v1'
      AND "report"->>'recoveryRunId' = "id"::text
      AND "report"->>'workspaceId' = "workspaceId"::text
      AND "report"->>'targetEpochDigest' = "targetEpochDigest"
      AND ("report"->>'databaseStateDigest') ~ '^[a-f0-9]{64}$'
      AND ("report"->>'migrationDigest') ~ '^[a-f0-9]{64}$'
      AND ("report"->>'contactKeyDigest') ~ '^[a-f0-9]{64}$'
      AND jsonb_typeof("report"->'migrationMatch') = 'boolean'
      AND jsonb_typeof("report"->'contactCount') = 'number'
      AND jsonb_typeof("report"->'contactDecryptFailures') = 'number'
      AND jsonb_typeof("report"->'blockers') = 'array'
      AND jsonb_typeof("report"->'media') = 'object'
      AND ("report"->'media'->>'provider') IN ('disabled','local')
      AND ("report"->'media'->>'identityDigest') ~ '^[a-f0-9]{64}$'
      AND jsonb_typeof("report"->'media'->'expectedAssetIds') = 'array'
      AND jsonb_typeof("report"->'media'->'verifiedAssetIds') = 'array'
      AND jsonb_typeof("report"->'media'->'missingAssetIds') = 'array'
      AND jsonb_typeof("report"->'media'->'mismatchAssetIds') = 'array'
      AND ("state"<>'APPROVED' OR "approvedAt" >= "checkedAt")
    )
  );

COMMIT;
