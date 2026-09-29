-- DEV-07A internal JSON export permissions and frozen dependency manifests.
BEGIN;

ALTER TABLE "memberships" DROP CONSTRAINT "memberships_extraPermissions_check";
ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_extraPermissions_check"
  CHECK ("extraPermissions" <@ ARRAY['sensitive.read','sensitive.write','data.export']::text[]);

ALTER TABLE "people" ADD CONSTRAINT "people_workspaceId_id_sourceId_key" UNIQUE ("workspaceId","id","sourceId");
ALTER TABLE "works" ADD CONSTRAINT "works_workspaceId_id_sourceId_key" UNIQUE ("workspaceId","id","sourceId");
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspaceId_id_sourceId_key" UNIQUE ("workspaceId","id","sourceId");
ALTER TABLE "assets" ADD CONSTRAINT "assets_workspaceId_id_sourceId_key" UNIQUE ("workspaceId","id","sourceId");

CREATE TABLE "usePermissions" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "sourceId" UUID NOT NULL,
  "subjectKind" TEXT NOT NULL,
  "subjectId" UUID NOT NULL,
  "purpose" TEXT NOT NULL,
  "fields" TEXT[] NOT NULL,
  "validFrom" TIMESTAMPTZ(3) NOT NULL,
  "validUntil" TIMESTAMPTZ(3) NOT NULL,
  "status" TEXT NOT NULL,
  "evidenceNote" TEXT NOT NULL,
  "reviewerId" UUID NOT NULL,
  "subjectPersonId" UUID,
  "subjectWorkId" UUID,
  "subjectProjectId" UUID,
  "subjectAssetId" UUID,
  "subjectSourceId" UUID,
  CONSTRAINT "usePermissions_dev07_check_0" CHECK ("revision" > 0),
  CONSTRAINT "usePermissions_dev07_check_1" CHECK ("purpose" = 'INTERNAL_EXPORT'),
  CONSTRAINT "usePermissions_dev07_check_2" CHECK ("status" IN ('ACTIVE','REVOKED')),
  CONSTRAINT "usePermissions_dev07_check_3" CHECK ("validFrom" < "validUntil"),
  CONSTRAINT "usePermissions_dev07_check_4" CHECK (cardinality("fields") BETWEEN 1 AND 33 AND "fields" <@ ARRAY[
'person.displayName','person.aliases','person.roles','person.cityCode','person.languageCodes','person.skillCodes','person.heightCm','person.intro','person.status',
'work.title','work.description','work.industryCode','work.workTypeCodes','work.origin','work.originNote','work.status','work.relations',
'project.title','project.brief','project.locationNote','project.dateNote','project.reviewNote','project.status','project.relations',
'source.title','source.type','source.providerClaim','source.basisMode','source.basisDescription','source.validFrom','source.validUntil','source.status',
'media.identity']::text[]),
  CONSTRAINT "usePermissions_dev07_check_5" CHECK (length("evidenceNote") BETWEEN 4 AND 2000),
  CONSTRAINT "usePermissions_dev07_subject_shape" CHECK (
    ("subjectKind"='PERSON' AND "subjectPersonId"="subjectId" AND "subjectWorkId" IS NULL AND "subjectProjectId" IS NULL AND "subjectAssetId" IS NULL AND "subjectSourceId" IS NULL) OR
    ("subjectKind"='WORK' AND "subjectWorkId"="subjectId" AND "subjectPersonId" IS NULL AND "subjectProjectId" IS NULL AND "subjectAssetId" IS NULL AND "subjectSourceId" IS NULL) OR
    ("subjectKind"='PROJECT' AND "subjectProjectId"="subjectId" AND "subjectPersonId" IS NULL AND "subjectWorkId" IS NULL AND "subjectAssetId" IS NULL AND "subjectSourceId" IS NULL) OR
    ("subjectKind"='ASSET' AND "subjectAssetId"="subjectId" AND "subjectPersonId" IS NULL AND "subjectWorkId" IS NULL AND "subjectProjectId" IS NULL AND "subjectSourceId" IS NULL) OR
    ("subjectKind"='SOURCE' AND "subjectSourceId"="subjectId" AND "subjectSourceId"="sourceId" AND "subjectPersonId" IS NULL AND "subjectWorkId" IS NULL AND "subjectProjectId" IS NULL AND "subjectAssetId" IS NULL)
  )
);
ALTER TABLE "usePermissions" ADD CONSTRAINT "usePermissions_workspaceId_id_key" UNIQUE ("workspaceId","id");
ALTER TABLE "usePermissions" ADD CONSTRAINT "usePermissions_workspaceId_id_sourceId_key" UNIQUE ("workspaceId","id","sourceId");
CREATE INDEX "usePermissions_export_source_idx" ON "usePermissions" ("workspaceId","sourceId","status");
CREATE INDEX "usePermissions_export_subject_idx" ON "usePermissions" ("workspaceId","subjectKind","subjectId");

CREATE TABLE "exports" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "actorId" UUID NOT NULL,
  "format" TEXT NOT NULL,
  "schemaVersion" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "recordManifest" JSONB NOT NULL,
  "fields" TEXT[] NOT NULL,
  "usePermissionRefs" TEXT[] NOT NULL,
  "payload" JSONB,
  "payloadDigest" TEXT,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "errorCode" TEXT,
  "leaseToken" UUID,
  "leaseUntil" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL,
  CONSTRAINT "exports_dev07_check_0" CHECK ("revision" > 0),
  CONSTRAINT "exports_dev07_check_1" CHECK ("format"='JSON' AND "schemaVersion"='once-export-v1'),
  CONSTRAINT "exports_dev07_check_2" CHECK ("state" IN ('QUEUED','READY','STALE','FAILED','ERASED')),
  CONSTRAINT "exports_dev07_check_3" CHECK ("attempts" BETWEEN 0 AND 3),
  CONSTRAINT "exports_dev07_check_4" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "exports_dev07_check_5" CHECK (cardinality("fields") BETWEEN 1 AND 33 AND "fields" <@ ARRAY[
'person.displayName','person.aliases','person.roles','person.cityCode','person.languageCodes','person.skillCodes','person.heightCm','person.intro','person.status',
'work.title','work.description','work.industryCode','work.workTypeCodes','work.origin','work.originNote','work.status','work.relations',
'project.title','project.brief','project.locationNote','project.dateNote','project.reviewNote','project.status','project.relations',
'source.title','source.type','source.providerClaim','source.basisMode','source.basisDescription','source.validFrom','source.validUntil','source.status',
'media.identity']::text[]),
  CONSTRAINT "exports_dev07_check_6" CHECK (cardinality("usePermissionRefs") BETWEEN 1 AND 1000),
  CONSTRAINT "exports_dev07_payload_shape" CHECK (
    ("state"='READY' AND "payload" IS NOT NULL AND length("payloadDigest")=64 AND "leaseToken" IS NULL AND "leaseUntil" IS NULL) OR
    ("state"<>'READY' AND (("payload" IS NULL AND "payloadDigest" IS NULL) OR "state"='ERASED'))
  )
);
ALTER TABLE "exports" ADD CONSTRAINT "exports_workspaceId_id_key" UNIQUE ("workspaceId","id");
CREATE INDEX "exports_actor_idx" ON "exports" ("workspaceId","actorId","createdAt");
CREATE INDEX "exports_worker_idx" ON "exports" ("workspaceId","state","leaseUntil");

CREATE TABLE "exportDependencies" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "exportId" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "sourceId" UUID NOT NULL,
  "sourceRevision" INTEGER NOT NULL,
  "sourceProtectionEpoch" INTEGER NOT NULL,
  "resourceRevision" INTEGER NOT NULL,
  "resourceProtectionEpoch" INTEGER,
  "fields" TEXT[] NOT NULL,
  "usePermissionId" UUID NOT NULL,
  "usePermissionRevision" INTEGER NOT NULL,
  "validUntil" TIMESTAMPTZ(3) NOT NULL,
  "personId" UUID,
  "workId" UUID,
  "projectId" UUID,
  "assetId" UUID,
  "sourceSubjectId" UUID,
  CONSTRAINT "exportDependencies_dev07_check_0" CHECK ("revision" > 0 AND "sourceRevision" > 0 AND "sourceProtectionEpoch" > 0 AND "resourceRevision" > 0 AND "usePermissionRevision" > 0),
  CONSTRAINT "exportDependencies_dev07_check_1" CHECK (cardinality("fields") BETWEEN 1 AND 33 AND "fields" <@ ARRAY[
'person.displayName','person.aliases','person.roles','person.cityCode','person.languageCodes','person.skillCodes','person.heightCm','person.intro','person.status',
'work.title','work.description','work.industryCode','work.workTypeCodes','work.origin','work.originNote','work.status','work.relations',
'project.title','project.brief','project.locationNote','project.dateNote','project.reviewNote','project.status','project.relations',
'source.title','source.type','source.providerClaim','source.basisMode','source.basisDescription','source.validFrom','source.validUntil','source.status',
'media.identity']::text[]),
  CONSTRAINT "exportDependencies_dev07_subject_shape" CHECK (
    ("kind"='PERSON' AND "personId" IS NOT NULL AND "workId" IS NULL AND "projectId" IS NULL AND "assetId" IS NULL AND "sourceSubjectId" IS NULL) OR
    ("kind"='WORK' AND "workId" IS NOT NULL AND "personId" IS NULL AND "projectId" IS NULL AND "assetId" IS NULL AND "sourceSubjectId" IS NULL) OR
    ("kind"='PROJECT' AND "projectId" IS NOT NULL AND "personId" IS NULL AND "workId" IS NULL AND "assetId" IS NULL AND "sourceSubjectId" IS NULL) OR
    ("kind"='ASSET' AND "assetId" IS NOT NULL AND "personId" IS NULL AND "workId" IS NULL AND "projectId" IS NULL AND "sourceSubjectId" IS NULL) OR
    ("kind"='SOURCE' AND "sourceSubjectId"="sourceId" AND "personId" IS NULL AND "workId" IS NULL AND "projectId" IS NULL AND "assetId" IS NULL)
  )
);
ALTER TABLE "exportDependencies" ADD CONSTRAINT "exportDependencies_workspaceId_id_key" UNIQUE ("workspaceId","id");
ALTER TABLE "exportDependencies" ADD CONSTRAINT "exportDependencies_export_person_key" UNIQUE ("workspaceId","exportId","personId");
ALTER TABLE "exportDependencies" ADD CONSTRAINT "exportDependencies_export_work_key" UNIQUE ("workspaceId","exportId","workId");
ALTER TABLE "exportDependencies" ADD CONSTRAINT "exportDependencies_export_project_key" UNIQUE ("workspaceId","exportId","projectId");
ALTER TABLE "exportDependencies" ADD CONSTRAINT "exportDependencies_export_asset_key" UNIQUE ("workspaceId","exportId","assetId");
ALTER TABLE "exportDependencies" ADD CONSTRAINT "exportDependencies_export_source_key" UNIQUE ("workspaceId","exportId","sourceSubjectId");
CREATE INDEX "exportDependencies_source_idx" ON "exportDependencies" ("workspaceId","sourceId","exportId");
CREATE INDEX "exportDependencies_permission_idx" ON "exportDependencies" ("workspaceId","usePermissionId");

ALTER TABLE "usePermissions" ADD CONSTRAINT "usePermissions_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usePermissions" ADD CONSTRAINT "usePermissions_sourceIdRef_fkey" FOREIGN KEY ("workspaceId","sourceId") REFERENCES "sources"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usePermissions" ADD CONSTRAINT "usePermissions_reviewerIdRef_fkey" FOREIGN KEY ("workspaceId","reviewerId") REFERENCES "memberships"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usePermissions" ADD CONSTRAINT "usePermissions_subjectPersonRef_fkey" FOREIGN KEY ("workspaceId","subjectPersonId","sourceId") REFERENCES "people"("workspaceId","id","sourceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usePermissions" ADD CONSTRAINT "usePermissions_subjectWorkRef_fkey" FOREIGN KEY ("workspaceId","subjectWorkId","sourceId") REFERENCES "works"("workspaceId","id","sourceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usePermissions" ADD CONSTRAINT "usePermissions_subjectProjectRef_fkey" FOREIGN KEY ("workspaceId","subjectProjectId","sourceId") REFERENCES "projects"("workspaceId","id","sourceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usePermissions" ADD CONSTRAINT "usePermissions_subjectAssetRef_fkey" FOREIGN KEY ("workspaceId","subjectAssetId","sourceId") REFERENCES "assets"("workspaceId","id","sourceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usePermissions" ADD CONSTRAINT "usePermissions_subjectSourceRef_fkey" FOREIGN KEY ("workspaceId","subjectSourceId") REFERENCES "sources"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exports" ADD CONSTRAINT "exports_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exports" ADD CONSTRAINT "exports_actorIdRef_fkey" FOREIGN KEY ("workspaceId","actorId") REFERENCES "memberships"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exportDependencies" ADD CONSTRAINT "exportDependencies_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exportDependencies" ADD CONSTRAINT "exportDependencies_exportRef_fkey" FOREIGN KEY ("workspaceId","exportId") REFERENCES "exports"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exportDependencies" ADD CONSTRAINT "exportDependencies_sourceIdRef_fkey" FOREIGN KEY ("workspaceId","sourceId") REFERENCES "sources"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exportDependencies" ADD CONSTRAINT "exportDependencies_usePermissionRef_fkey" FOREIGN KEY ("workspaceId","usePermissionId","sourceId") REFERENCES "usePermissions"("workspaceId","id","sourceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exportDependencies" ADD CONSTRAINT "exportDependencies_personRef_fkey" FOREIGN KEY ("workspaceId","personId","sourceId") REFERENCES "people"("workspaceId","id","sourceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exportDependencies" ADD CONSTRAINT "exportDependencies_workRef_fkey" FOREIGN KEY ("workspaceId","workId","sourceId") REFERENCES "works"("workspaceId","id","sourceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exportDependencies" ADD CONSTRAINT "exportDependencies_projectRef_fkey" FOREIGN KEY ("workspaceId","projectId","sourceId") REFERENCES "projects"("workspaceId","id","sourceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exportDependencies" ADD CONSTRAINT "exportDependencies_assetRef_fkey" FOREIGN KEY ("workspaceId","assetId","sourceId") REFERENCES "assets"("workspaceId","id","sourceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exportDependencies" ADD CONSTRAINT "exportDependencies_sourceSubjectRef_fkey" FOREIGN KEY ("workspaceId","sourceSubjectId") REFERENCES "sources"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
