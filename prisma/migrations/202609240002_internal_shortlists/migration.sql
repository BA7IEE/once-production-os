CREATE TABLE "shortlists" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "projectId" UUID NOT NULL,
  "maintainerId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "brief" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  CONSTRAINT "shortlists_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shortlists_sl1_state_check" CHECK ("status" IN ('DRAFT','ACTIVE','ARCHIVED')),
  CONSTRAINT "shortlists_sl1_revision_check" CHECK ("revision" >= 1)
);
CREATE UNIQUE INDEX "shortlists_workspaceId_id_key" ON "shortlists"("workspaceId","id");
CREATE INDEX "shortlists_sl1_project_idx" ON "shortlists"("workspaceId","projectId");
CREATE INDEX "shortlists_sl1_created_idx" ON "shortlists"("workspaceId","createdAt");
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_projectIdRef_fkey" FOREIGN KEY ("workspaceId","projectId") REFERENCES "projects"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_maintainerIdRef_fkey" FOREIGN KEY ("workspaceId","maintainerId") REFERENCES "memberships"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "shortlistPeople" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "shortlistId" UUID NOT NULL,
  "personId" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "groupLabel" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "addedPersonRevision" INTEGER NOT NULL,
  "addedPersonEpoch" INTEGER NOT NULL,
  "addedSourceRevision" INTEGER NOT NULL,
  "addedSourceEpoch" INTEGER NOT NULL,
  CONSTRAINT "shortlistPeople_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shortlistPeople_sl1_state_check" CHECK ("state" IN ('CANDIDATE','PRIORITY','CONTACTED','NOT_SUITABLE')),
  CONSTRAINT "shortlistPeople_sl1_position_check" CHECK ("position" >= 0)
);
CREATE UNIQUE INDEX "shortlistPeople_workspaceId_id_key" ON "shortlistPeople"("workspaceId","id");
CREATE UNIQUE INDEX "shortlistPeople_parent_person_key" ON "shortlistPeople"("workspaceId","shortlistId","personId");
ALTER TABLE "shortlistPeople" ADD CONSTRAINT "shortlistPeople_parent_position_key" UNIQUE ("workspaceId","shortlistId","position") DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX "shortlistPeople_sl1_person_idx" ON "shortlistPeople"("workspaceId","personId");
ALTER TABLE "shortlistPeople" ADD CONSTRAINT "shortlistPeople_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shortlistPeople" ADD CONSTRAINT "shortlistPeople_shortlistIdRef_fkey" FOREIGN KEY ("workspaceId","shortlistId") REFERENCES "shortlists"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shortlistPeople" ADD CONSTRAINT "shortlistPeople_personIdRef_fkey" FOREIGN KEY ("workspaceId","personId") REFERENCES "people"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "shortlistWorks" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "shortlistId" UUID NOT NULL,
  "workId" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "note" TEXT NOT NULL,
  "addedWorkRevision" INTEGER NOT NULL,
  "addedSourceRevision" INTEGER NOT NULL,
  "addedSourceEpoch" INTEGER NOT NULL,
  CONSTRAINT "shortlistWorks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shortlistWorks_sl1_position_check" CHECK ("position" >= 0)
);
CREATE UNIQUE INDEX "shortlistWorks_workspaceId_id_key" ON "shortlistWorks"("workspaceId","id");
CREATE UNIQUE INDEX "shortlistWorks_parent_work_key" ON "shortlistWorks"("workspaceId","shortlistId","workId");
ALTER TABLE "shortlistWorks" ADD CONSTRAINT "shortlistWorks_parent_position_key" UNIQUE ("workspaceId","shortlistId","position") DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX "shortlistWorks_sl1_work_idx" ON "shortlistWorks"("workspaceId","workId");
ALTER TABLE "shortlistWorks" ADD CONSTRAINT "shortlistWorks_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shortlistWorks" ADD CONSTRAINT "shortlistWorks_shortlistIdRef_fkey" FOREIGN KEY ("workspaceId","shortlistId") REFERENCES "shortlists"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shortlistWorks" ADD CONSTRAINT "shortlistWorks_workIdRef_fkey" FOREIGN KEY ("workspaceId","workId") REFERENCES "works"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
