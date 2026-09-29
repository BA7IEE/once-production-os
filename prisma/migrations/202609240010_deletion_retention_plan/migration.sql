-- DEV-07D retention decisions and frozen cleanup plan only. No CLEANING or erasure execution.
BEGIN;

ALTER TABLE "deletionRequests"
  ADD COLUMN "planDigest" TEXT,
  ADD COLUMN "planFrozenAt" TIMESTAMPTZ(3),
  ADD COLUMN "planFrozenById" UUID,
  ADD CONSTRAINT "deletionRequests_dev07d_plan_shape" CHECK (
    ("planDigest" IS NULL AND "planFrozenAt" IS NULL AND "planFrozenById" IS NULL)
    OR
    ("planDigest" ~ '^[0-9a-f]{64}$' AND "planFrozenAt" IS NOT NULL AND "planFrozenById" IS NOT NULL AND "state" <> 'DRAFT')
  );

ALTER TABLE "deletionItems"
  ADD COLUMN "decision" TEXT,
  ADD COLUMN "decisionReason" TEXT,
  ADD COLUMN "retentionSourceId" UUID,
  ADD COLUMN "retentionSourceRevision" INTEGER,
  ADD COLUMN "retentionSourceProtectionEpoch" INTEGER,
  ADD COLUMN "decidedById" UUID,
  ADD COLUMN "decidedAt" TIMESTAMPTZ(3);

UPDATE "deletionItems"
SET "decision" = CASE WHEN "evidenceState" = 'PROVEN' THEN 'APPLY_PROPOSED' ELSE 'PENDING' END,
    "decisionReason" = CASE WHEN "evidenceState" = 'PROVEN' THEN 'AUTO_PROVEN' ELSE '' END;

ALTER TABLE "deletionItems"
  ALTER COLUMN "decision" SET NOT NULL,
  ALTER COLUMN "decisionReason" SET NOT NULL,
  ADD CONSTRAINT "deletionItems_dev07d_decision_check" CHECK ("decision" IN ('PENDING','APPLY_PROPOSED','RETAIN_WITH_BASIS')),
  ADD CONSTRAINT "deletionItems_dev07d_decision_shape" CHECK (
    ("decision"='PENDING' AND "evidenceState"='REVIEW_REQUIRED' AND "decisionReason"='' AND "retentionSourceId" IS NULL
      AND "retentionSourceRevision" IS NULL AND "retentionSourceProtectionEpoch" IS NULL AND "decidedById" IS NULL AND "decidedAt" IS NULL)
    OR
    ("decision"='APPLY_PROPOSED' AND "retentionSourceId" IS NULL AND "retentionSourceRevision" IS NULL AND "retentionSourceProtectionEpoch" IS NULL
      AND (
        ("evidenceState"='PROVEN' AND "decisionReason"='AUTO_PROVEN' AND "decidedById" IS NULL AND "decidedAt" IS NULL)
        OR
        ("evidenceState"='REVIEW_REQUIRED' AND length("decisionReason") BETWEEN 4 AND 2000 AND "decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL)
      ))
    OR
    ("decision"='RETAIN_WITH_BASIS' AND "evidenceState"='REVIEW_REQUIRED' AND length("decisionReason") BETWEEN 4 AND 2000
      AND "retentionSourceId" IS NOT NULL AND "retentionSourceRevision" > 0 AND "retentionSourceProtectionEpoch" > 0
      AND "decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL)
  );

ALTER TABLE "deletionRequests"
  ADD CONSTRAINT "deletionRequests_planFrozenByRef_fkey"
  FOREIGN KEY ("workspaceId","planFrozenById") REFERENCES "memberships"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deletionItems"
  ADD CONSTRAINT "deletionItems_retentionSourceRef_fkey"
  FOREIGN KEY ("workspaceId","retentionSourceId") REFERENCES "sources"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "deletionItems_decidedByRef_fkey"
  FOREIGN KEY ("workspaceId","decidedById") REFERENCES "memberships"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "deletionItems_pending_decision_idx" ON "deletionItems" ("workspaceId","requestId","decision");
CREATE INDEX "deletionItems_retention_source_idx" ON "deletionItems" ("workspaceId","retentionSourceId");

COMMIT;
