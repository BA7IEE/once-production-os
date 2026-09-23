-- WP1 additive internal Works/Projects. No changes to prior migrations.
BEGIN;
CREATE TABLE "works" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "sourceId" UUID NOT NULL,
  "scopeId" UUID NOT NULL,
  "maintainerId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "originNote" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "coverEntryId" UUID,
  CONSTRAINT "works_wp1_check_0" CHECK ("revision" > 0),
  CONSTRAINT "works_wp1_check_1" CHECK (length(btrim("title")) BETWEEN 1 AND 160),
  CONSTRAINT "works_wp1_check_2" CHECK ("origin" IN ('ONCE','EXTERNAL','UNKNOWN')),
  CONSTRAINT "works_wp1_check_3" CHECK ("status" IN ('DRAFT','ACTIVE','ARCHIVED')),
  CONSTRAINT "works_wp1_check_4" CHECK ("origin" <> 'ONCE' OR length(btrim("originNote")) >= 4),
  CONSTRAINT "works_wp1_check_5" CHECK ("status" <> 'ACTIVE' OR "coverEntryId" IS NOT NULL),
  CONSTRAINT "works_wp1_check_6" CHECK (length("description") <= 5000 AND length("originNote") <= 2000)
);
ALTER TABLE "works" ADD CONSTRAINT "works_workspaceId_id_key" UNIQUE ("workspaceId","id");
CREATE INDEX "works_wp1_created_idx" ON "works" ("workspaceId","createdAt");
CREATE TABLE "workAssets" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "workId" UUID NOT NULL,
  "assetId" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  CONSTRAINT "workAssets_wp1_check_0" CHECK ("revision" > 0),
  CONSTRAINT "workAssets_wp1_check_1" CHECK ("position" BETWEEN 0 AND 29)
);
ALTER TABLE "workAssets" ADD CONSTRAINT "workAssets_workspaceId_id_key" UNIQUE ("workspaceId","id");
ALTER TABLE "workAssets" ADD CONSTRAINT "workAssets_workspaceId_workId_id_key" UNIQUE ("workspaceId","workId","id");
ALTER TABLE "workAssets" ADD CONSTRAINT "workAssets_workspaceId_workId_assetId_key" UNIQUE ("workspaceId","workId","assetId");
ALTER TABLE "workAssets" ADD CONSTRAINT "workAssets_workspaceId_workId_position_key" UNIQUE ("workspaceId","workId","position") DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX "workAssets_wp1_created_idx" ON "workAssets" ("workspaceId","createdAt");
CREATE TABLE "workCredits" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "workId" UUID NOT NULL,
  "personId" UUID NOT NULL,
  "roleCode" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  CONSTRAINT "workCredits_wp1_check_0" CHECK ("revision" > 0),
  CONSTRAINT "workCredits_wp1_check_1" CHECK (length("roleCode") BETWEEN 1 AND 60),
  CONSTRAINT "workCredits_wp1_check_2" CHECK (length("note") <= 1000)
);
ALTER TABLE "workCredits" ADD CONSTRAINT "workCredits_workspaceId_id_key" UNIQUE ("workspaceId","id");
ALTER TABLE "workCredits" ADD CONSTRAINT "workCredits_workspaceId_workId_personId_roleCode_key" UNIQUE ("workspaceId","workId","personId","roleCode");
CREATE INDEX "workCredits_wp1_created_idx" ON "workCredits" ("workspaceId","createdAt");
CREATE TABLE "projects" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "sourceId" UUID NOT NULL,
  "scopeId" UUID NOT NULL,
  "maintainerId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "brief" TEXT NOT NULL,
  "locationNote" TEXT NOT NULL,
  "dateNote" TEXT NOT NULL,
  "reviewNote" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  CONSTRAINT "projects_wp1_check_0" CHECK ("revision" > 0),
  CONSTRAINT "projects_wp1_check_1" CHECK (length(btrim("title")) BETWEEN 1 AND 160),
  CONSTRAINT "projects_wp1_check_2" CHECK ("status" IN ('DRAFT','ACTIVE','COMPLETED','ARCHIVED')),
  CONSTRAINT "projects_wp1_check_3" CHECK (length("brief") <= 5000 AND length("locationNote") <= 500 AND length("dateNote") <= 500 AND length("reviewNote") <= 5000)
);
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspaceId_id_key" UNIQUE ("workspaceId","id");
CREATE INDEX "projects_wp1_created_idx" ON "projects" ("workspaceId","createdAt");
CREATE TABLE "projectParticipants" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "projectId" UUID NOT NULL,
  "personId" UUID NOT NULL,
  "roleCode" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  CONSTRAINT "projectParticipants_wp1_check_0" CHECK ("revision" > 0),
  CONSTRAINT "projectParticipants_wp1_check_1" CHECK ("state" IN ('NOMINATED','CONFIRMED','ACTUAL')),
  CONSTRAINT "projectParticipants_wp1_check_2" CHECK ("state" <> 'ACTUAL' OR length(btrim("note")) >= 4),
  CONSTRAINT "projectParticipants_wp1_check_3" CHECK (length("roleCode") BETWEEN 1 AND 60 AND length("note") <= 1000)
);
ALTER TABLE "projectParticipants" ADD CONSTRAINT "projectParticipants_workspaceId_id_key" UNIQUE ("workspaceId","id");
ALTER TABLE "projectParticipants" ADD CONSTRAINT "projectParticipants_workspaceId_projectId_personId_roleCode_key" UNIQUE ("workspaceId","projectId","personId","roleCode");
CREATE INDEX "projectParticipants_wp1_created_idx" ON "projectParticipants" ("workspaceId","createdAt");
CREATE TABLE "projectWorks" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "projectId" UUID NOT NULL,
  "workId" UUID NOT NULL,
  "relation" TEXT NOT NULL,
  CONSTRAINT "projectWorks_wp1_check_0" CHECK ("revision" > 0),
  CONSTRAINT "projectWorks_wp1_check_1" CHECK ("relation" IN ('REFERENCE','DELIVERABLE'))
);
ALTER TABLE "projectWorks" ADD CONSTRAINT "projectWorks_workspaceId_id_key" UNIQUE ("workspaceId","id");
ALTER TABLE "projectWorks" ADD CONSTRAINT "projectWorks_workspaceId_projectId_workId_key" UNIQUE ("workspaceId","projectId","workId");
CREATE INDEX "projectWorks_wp1_created_idx" ON "projectWorks" ("workspaceId","createdAt");
ALTER TABLE "works" ADD CONSTRAINT "works_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "works" ADD CONSTRAINT "works_sourceIdRef_fkey" FOREIGN KEY ("workspaceId","sourceId") REFERENCES "sources"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "works" ADD CONSTRAINT "works_scopeIdRef_fkey" FOREIGN KEY ("workspaceId","scopeId") REFERENCES "scopes"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "works" ADD CONSTRAINT "works_maintainerIdRef_fkey" FOREIGN KEY ("workspaceId","maintainerId") REFERENCES "memberships"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workAssets" ADD CONSTRAINT "workAssets_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workAssets" ADD CONSTRAINT "workAssets_workIdRef_fkey" FOREIGN KEY ("workspaceId","workId") REFERENCES "works"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workAssets" ADD CONSTRAINT "workAssets_assetIdRef_fkey" FOREIGN KEY ("workspaceId","assetId") REFERENCES "assets"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workCredits" ADD CONSTRAINT "workCredits_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workCredits" ADD CONSTRAINT "workCredits_workIdRef_fkey" FOREIGN KEY ("workspaceId","workId") REFERENCES "works"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workCredits" ADD CONSTRAINT "workCredits_personIdRef_fkey" FOREIGN KEY ("workspaceId","personId") REFERENCES "people"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_sourceIdRef_fkey" FOREIGN KEY ("workspaceId","sourceId") REFERENCES "sources"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_scopeIdRef_fkey" FOREIGN KEY ("workspaceId","scopeId") REFERENCES "scopes"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_maintainerIdRef_fkey" FOREIGN KEY ("workspaceId","maintainerId") REFERENCES "memberships"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projectParticipants" ADD CONSTRAINT "projectParticipants_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projectParticipants" ADD CONSTRAINT "projectParticipants_projectIdRef_fkey" FOREIGN KEY ("workspaceId","projectId") REFERENCES "projects"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projectParticipants" ADD CONSTRAINT "projectParticipants_personIdRef_fkey" FOREIGN KEY ("workspaceId","personId") REFERENCES "people"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projectWorks" ADD CONSTRAINT "projectWorks_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projectWorks" ADD CONSTRAINT "projectWorks_projectIdRef_fkey" FOREIGN KEY ("workspaceId","projectId") REFERENCES "projects"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projectWorks" ADD CONSTRAINT "projectWorks_workIdRef_fkey" FOREIGN KEY ("workspaceId","workId") REFERENCES "works"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "works" ADD CONSTRAINT "works_cover_parent_fkey" FOREIGN KEY ("workspaceId","id","coverEntryId") REFERENCES "workAssets"("workspaceId","workId","id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX "works_wp1_sourceId_idx" ON "works" ("workspaceId","sourceId");
CREATE INDEX "projects_wp1_sourceId_idx" ON "projects" ("workspaceId","sourceId");
CREATE INDEX "workAssets_wp1_assetId_idx" ON "workAssets" ("workspaceId","assetId");
CREATE INDEX "workCredits_wp1_personId_idx" ON "workCredits" ("workspaceId","personId");
CREATE INDEX "projectParticipants_wp1_personId_idx" ON "projectParticipants" ("workspaceId","personId");
CREATE INDEX "projectWorks_wp1_workId_idx" ON "projectWorks" ("workspaceId","workId");
COMMIT;
