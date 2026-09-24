-- DEV-06 internal structured search/shortlists. Additive only; no customer/share state.
BEGIN;

ALTER TABLE "workAssets"
  ADD CONSTRAINT "workAssets_workspaceId_workId_id_assetId_key"
  UNIQUE ("workspaceId","workId","id","assetId");

CREATE TABLE "shortlists" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "scopeId" UUID NOT NULL,
  "maintainerId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "brief" TEXT NOT NULL,
  CONSTRAINT "shortlists_dev06_check_0" CHECK ("revision" > 0),
  CONSTRAINT "shortlists_dev06_check_1" CHECK (length(btrim("title")) BETWEEN 1 AND 160),
  CONSTRAINT "shortlists_dev06_check_2" CHECK (length("brief") <= 5000)
);
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_workspaceId_id_key" UNIQUE ("workspaceId","id");
CREATE INDEX "shortlists_dev06_scope_idx" ON "shortlists" ("workspaceId","scopeId","updatedAt");

CREATE TABLE "shortlistItems" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "shortlistId" UUID NOT NULL,
  "personId" UUID NOT NULL,
  "workId" UUID,
  "position" INTEGER NOT NULL,
  "note" TEXT NOT NULL,
  "addedPersonRevision" INTEGER NOT NULL,
  "addedPersonSourceRevision" INTEGER NOT NULL,
  "addedWorkRevision" INTEGER,
  "addedWorkSourceRevision" INTEGER,
  CONSTRAINT "shortlistItems_dev06_check_0" CHECK ("revision" > 0),
  CONSTRAINT "shortlistItems_dev06_check_1" CHECK ("position" BETWEEN 0 AND 99),
  CONSTRAINT "shortlistItems_dev06_check_2" CHECK (length("note") <= 2000),
  CONSTRAINT "shortlistItems_dev06_check_3" CHECK ("addedPersonRevision" > 0 AND "addedPersonSourceRevision" > 0),
  CONSTRAINT "shortlistItems_dev06_check_4" CHECK (
    ("workId" IS NULL AND "addedWorkRevision" IS NULL AND "addedWorkSourceRevision" IS NULL)
    OR
    ("workId" IS NOT NULL AND "addedWorkRevision" > 0 AND "addedWorkSourceRevision" > 0)
  )
);
ALTER TABLE "shortlistItems" ADD CONSTRAINT "shortlistItems_workspaceId_id_key" UNIQUE ("workspaceId","id");
ALTER TABLE "shortlistItems" ADD CONSTRAINT "shortlistItems_workspaceId_id_workId_key" UNIQUE ("workspaceId","id","workId");
ALTER TABLE "shortlistItems" ADD CONSTRAINT "shortlistItems_workspaceId_shortlistId_position_key" UNIQUE ("workspaceId","shortlistId","position") DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX "shortlistItems_dev06_person_idx" ON "shortlistItems" ("workspaceId","personId");
CREATE INDEX "shortlistItems_dev06_work_idx" ON "shortlistItems" ("workspaceId","workId");

CREATE TABLE "shortlistItemAssets" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "itemId" UUID NOT NULL,
  "assetId" UUID NOT NULL,
  "workId" UUID NOT NULL,
  "workAssetId" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  CONSTRAINT "shortlistItemAssets_dev06_check_0" CHECK ("revision" > 0),
  CONSTRAINT "shortlistItemAssets_dev06_check_1" CHECK ("position" BETWEEN 0 AND 11)
);
ALTER TABLE "shortlistItemAssets" ADD CONSTRAINT "shortlistItemAssets_workspaceId_id_key" UNIQUE ("workspaceId","id");
ALTER TABLE "shortlistItemAssets" ADD CONSTRAINT "shortlistItemAssets_workspaceId_itemId_workAssetId_key" UNIQUE ("workspaceId","itemId","workAssetId");
ALTER TABLE "shortlistItemAssets" ADD CONSTRAINT "shortlistItemAssets_workspaceId_itemId_position_key" UNIQUE ("workspaceId","itemId","position") DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX "shortlistItemAssets_dev06_asset_idx" ON "shortlistItemAssets" ("workspaceId","assetId");

ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_workspace_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_scopeIdRef_fkey"
  FOREIGN KEY ("workspaceId","scopeId") REFERENCES "scopes"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_maintainerIdRef_fkey"
  FOREIGN KEY ("workspaceId","maintainerId") REFERENCES "memberships"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shortlistItems" ADD CONSTRAINT "shortlistItems_workspace_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shortlistItems" ADD CONSTRAINT "shortlistItems_shortlistIdRef_fkey"
  FOREIGN KEY ("workspaceId","shortlistId") REFERENCES "shortlists"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shortlistItems" ADD CONSTRAINT "shortlistItems_personIdRef_fkey"
  FOREIGN KEY ("workspaceId","personId") REFERENCES "people"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shortlistItems" ADD CONSTRAINT "shortlistItems_workIdRef_fkey"
  FOREIGN KEY ("workspaceId","workId") REFERENCES "works"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shortlistItemAssets" ADD CONSTRAINT "shortlistItemAssets_workspace_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shortlistItemAssets" ADD CONSTRAINT "shortlistItemAssets_itemRef_fkey"
  FOREIGN KEY ("workspaceId","itemId","workId")
  REFERENCES "shortlistItems"("workspaceId","id","workId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shortlistItemAssets" ADD CONSTRAINT "shortlistItemAssets_workAssetRef_fkey"
  FOREIGN KEY ("workspaceId","workId","workAssetId","assetId")
  REFERENCES "workAssets"("workspaceId","workId","id","assetId") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
