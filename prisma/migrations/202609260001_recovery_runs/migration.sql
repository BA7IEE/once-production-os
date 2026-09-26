-- DEV-09A recovery preparation evidence. Forward-only migration.
BEGIN;

CREATE TABLE "recoveryRuns" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "actorId" UUID NOT NULL,
  "sourceEpochDigest" TEXT NOT NULL,
  "targetEpochDigest" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "preparedAt" TIMESTAMPTZ(3) NOT NULL,
  "approvedAt" TIMESTAMPTZ(3),
  "reportDigest" TEXT,
  "revokedSessions" INTEGER NOT NULL,
  "consumedActivations" INTEGER NOT NULL,
  "disabledUsers" INTEGER NOT NULL,
  "disabledMemberships" INTEGER NOT NULL,
  "revokedHandoffs" INTEGER NOT NULL,
  "revokedUsePermissions" INTEGER NOT NULL,
  "invalidatedExports" INTEGER NOT NULL,
  "failedJobs" INTEGER NOT NULL,
  "failedUploads" INTEGER NOT NULL,
  "quarantinedAssets" INTEGER NOT NULL,
  "suspendedSources" INTEGER NOT NULL,
  CONSTRAINT "recoveryRuns_shape_check" CHECK (
    "revision" > 0
    AND "sourceEpochDigest" ~ '^[a-f0-9]{64}$'
    AND "targetEpochDigest" ~ '^[a-f0-9]{64}$'
    AND "sourceEpochDigest" <> "targetEpochDigest"
    AND "state" IN ('PREPARED','APPROVED')
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
      ("state"='PREPARED' AND "approvedAt" IS NULL AND "reportDigest" IS NULL)
      OR
      ("state"='APPROVED' AND "approvedAt" IS NOT NULL AND "reportDigest" ~ '^[a-f0-9]{64}$')
    )
  ),
  CONSTRAINT "recoveryRuns_workspace_fkey" FOREIGN KEY ("workspaceId")
    REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recoveryRuns_actorIdRef_fkey" FOREIGN KEY ("workspaceId","actorId")
    REFERENCES "memberships"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "recoveryRuns_workspaceId_id_key"
  ON "recoveryRuns"("workspaceId","id");
CREATE UNIQUE INDEX "recoveryRuns_workspaceId_targetEpochDigest_key"
  ON "recoveryRuns"("workspaceId","targetEpochDigest");
CREATE INDEX "recoveryRuns_idx_0"
  ON "recoveryRuns"("workspaceId","createdAt");

COMMIT;
