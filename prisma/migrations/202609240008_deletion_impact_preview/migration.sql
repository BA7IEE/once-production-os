-- DEV-07B deletion impact preview + draft request only. No object blocking or cleanup execution.
BEGIN;

ALTER TABLE "memberships" DROP CONSTRAINT "memberships_extraPermissions_check";
ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_extraPermissions_check"
  CHECK ("extraPermissions" <@ ARRAY['sensitive.read','sensitive.write','data.export','data.delete']::text[]);

CREATE TABLE "deletionRequests" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "actorId" UUID NOT NULL,
  "targetKind" TEXT NOT NULL,
  "targetId" UUID NOT NULL,
  "targetSourceId" UUID NOT NULL,
  "targetRevision" INTEGER NOT NULL,
  "targetProtectionEpoch" INTEGER,
  "state" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "previewDigest" TEXT NOT NULL,
  "impactCount" INTEGER NOT NULL,
  "reviewRequiredCount" INTEGER NOT NULL,
  "unresolvedCount" INTEGER NOT NULL,
  "targetPersonId" UUID,
  "targetWorkId" UUID,
  "targetProjectId" UUID,
  "targetAssetId" UUID,
  "targetSourceSubjectId" UUID,
  CONSTRAINT "deletionRequests_dev07b_check_0" CHECK ("revision" > 0 AND "targetRevision" > 0),
  CONSTRAINT "deletionRequests_dev07b_check_1" CHECK ("state" = 'DRAFT'),
  CONSTRAINT "deletionRequests_dev07b_check_2" CHECK (length("reason") BETWEEN 4 AND 2000),
  CONSTRAINT "deletionRequests_dev07b_check_3" CHECK ("previewDigest" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "deletionRequests_dev07b_check_4" CHECK ("impactCount" BETWEEN 0 AND 1000 AND "reviewRequiredCount" BETWEEN 0 AND "impactCount" AND "unresolvedCount" = 0),
  CONSTRAINT "deletionRequests_dev07b_target_shape" CHECK (
    ("targetKind"='PERSON' AND "targetPersonId"="targetId" AND "targetWorkId" IS NULL AND "targetProjectId" IS NULL AND "targetAssetId" IS NULL AND "targetSourceSubjectId" IS NULL) OR
    ("targetKind"='WORK' AND "targetWorkId"="targetId" AND "targetPersonId" IS NULL AND "targetProjectId" IS NULL AND "targetAssetId" IS NULL AND "targetSourceSubjectId" IS NULL) OR
    ("targetKind"='PROJECT' AND "targetProjectId"="targetId" AND "targetPersonId" IS NULL AND "targetWorkId" IS NULL AND "targetAssetId" IS NULL AND "targetSourceSubjectId" IS NULL) OR
    ("targetKind"='ASSET' AND "targetAssetId"="targetId" AND "targetPersonId" IS NULL AND "targetWorkId" IS NULL AND "targetProjectId" IS NULL AND "targetSourceSubjectId" IS NULL) OR
    ("targetKind"='SOURCE' AND "targetSourceSubjectId"="targetId" AND "targetSourceSubjectId"="targetSourceId" AND "targetPersonId" IS NULL AND "targetWorkId" IS NULL AND "targetProjectId" IS NULL AND "targetAssetId" IS NULL)
  )
);
ALTER TABLE "deletionRequests" ADD CONSTRAINT "deletionRequests_workspaceId_id_key" UNIQUE ("workspaceId","id");
CREATE INDEX "deletionRequests_actor_idx" ON "deletionRequests" ("workspaceId","actorId","createdAt");
CREATE INDEX "deletionRequests_target_idx" ON "deletionRequests" ("workspaceId","targetKind","targetId");

CREATE TABLE "deletionItems" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "requestId" UUID NOT NULL,
  "resourceKind" TEXT NOT NULL,
  "resourceId" UUID NOT NULL,
  "dependencyKind" TEXT NOT NULL,
  "proposedAction" TEXT NOT NULL,
  "evidenceState" TEXT NOT NULL,
  "detailCode" TEXT NOT NULL,
  CONSTRAINT "deletionItems_dev07b_check_0" CHECK ("revision" > 0),
  CONSTRAINT "deletionItems_dev07b_check_1" CHECK ("proposedAction" IN ('ERASE_PAYLOAD','REMOVE_RELATION','REVOKE_PERMISSION','ERASE_DERIVATIVE','REVIEW_RETENTION','RETAIN_MINIMAL_HEADER')),
  CONSTRAINT "deletionItems_dev07b_check_2" CHECK ("evidenceState" IN ('PROVEN','REVIEW_REQUIRED')),
  CONSTRAINT "deletionItems_dev07b_check_3" CHECK (length("resourceKind") BETWEEN 1 AND 60 AND length("dependencyKind") BETWEEN 1 AND 100 AND length("detailCode") BETWEEN 1 AND 120)
);
ALTER TABLE "deletionItems" ADD CONSTRAINT "deletionItems_workspaceId_id_key" UNIQUE ("workspaceId","id");
ALTER TABLE "deletionItems" ADD CONSTRAINT "deletionItems_exact_impact_key" UNIQUE ("workspaceId","requestId","resourceKind","resourceId","dependencyKind","proposedAction");
CREATE INDEX "deletionItems_request_idx" ON "deletionItems" ("workspaceId","requestId","evidenceState");

ALTER TABLE "deletionRequests" ADD CONSTRAINT "deletionRequests_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deletionRequests" ADD CONSTRAINT "deletionRequests_actorIdRef_fkey" FOREIGN KEY ("workspaceId","actorId") REFERENCES "memberships"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deletionRequests" ADD CONSTRAINT "deletionRequests_targetSourceIdRef_fkey" FOREIGN KEY ("workspaceId","targetSourceId") REFERENCES "sources"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deletionRequests" ADD CONSTRAINT "deletionRequests_targetPersonRef_fkey" FOREIGN KEY ("workspaceId","targetPersonId","targetSourceId") REFERENCES "people"("workspaceId","id","sourceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deletionRequests" ADD CONSTRAINT "deletionRequests_targetWorkRef_fkey" FOREIGN KEY ("workspaceId","targetWorkId","targetSourceId") REFERENCES "works"("workspaceId","id","sourceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deletionRequests" ADD CONSTRAINT "deletionRequests_targetProjectRef_fkey" FOREIGN KEY ("workspaceId","targetProjectId","targetSourceId") REFERENCES "projects"("workspaceId","id","sourceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deletionRequests" ADD CONSTRAINT "deletionRequests_targetAssetRef_fkey" FOREIGN KEY ("workspaceId","targetAssetId","targetSourceId") REFERENCES "assets"("workspaceId","id","sourceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deletionRequests" ADD CONSTRAINT "deletionRequests_targetSourceSubjectRef_fkey" FOREIGN KEY ("workspaceId","targetSourceSubjectId") REFERENCES "sources"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deletionItems" ADD CONSTRAINT "deletionItems_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deletionItems" ADD CONSTRAINT "deletionItems_requestRef_fkey" FOREIGN KEY ("workspaceId","requestId") REFERENCES "deletionRequests"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
