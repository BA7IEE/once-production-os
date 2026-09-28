-- Internal language texts: current scoped dependencies, never a second Person.

-- Append-only migration after 42 frozen migrations. No old business rows are rewritten.

CREATE TABLE "localeTexts" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "personId" UUID,
  "workId" UUID,
  "projectId" UUID,
  "locale" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "sourceDigest" TEXT NOT NULL,
  "reviewedBy" UUID,
  "reviewedAt" TIMESTAMPTZ(3),
  UNIQUE ("workspaceId","id"),
  CHECK ("revision">0),
  CONSTRAINT "localeTexts_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "localeTexts_person_fkey" FOREIGN KEY ("workspaceId","personId") REFERENCES "people" ("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "localeTexts_work_fkey" FOREIGN KEY ("workspaceId","workId") REFERENCES "works" ("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "localeTexts_project_fkey" FOREIGN KEY ("workspaceId","projectId") REFERENCES "projects" ("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "localeTexts_reviewer_fkey" FOREIGN KEY ("workspaceId","reviewedBy") REFERENCES "memberships" ("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK (num_nonnulls("personId","workId","projectId")=1),
  CHECK ("locale" IN ('zh','en')),
  CHECK ("state" IN ('DRAFT','REVIEWED','ERASED')),
  CHECK ("sourceDigest" ~ '^[a-f0-9]{64}$'),
  CHECK (("state"='REVIEWED' AND "reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL) OR ("state"<>'REVIEWED' AND "reviewedBy" IS NULL AND "reviewedAt" IS NULL)),
  CHECK (("state"='ERASED' AND "text"='') OR ("state"<>'ERASED' AND length("text") BETWEEN 1 AND 10000))
);

CREATE INDEX "localeTexts_workspaceId_personId_idx" ON "localeTexts" ("workspaceId","personId");

CREATE INDEX "localeTexts_workspaceId_workId_idx" ON "localeTexts" ("workspaceId","workId");

CREATE INDEX "localeTexts_workspaceId_projectId_idx" ON "localeTexts" ("workspaceId","projectId");

CREATE UNIQUE INDEX "localeTexts_personId_locale_live_uq" ON "localeTexts" ("workspaceId","personId","locale") WHERE "state"<>'ERASED' AND "personId" IS NOT NULL;

CREATE UNIQUE INDEX "localeTexts_workId_locale_live_uq" ON "localeTexts" ("workspaceId","workId","locale") WHERE "state"<>'ERASED' AND "workId" IS NOT NULL;

CREATE UNIQUE INDEX "localeTexts_projectId_locale_live_uq" ON "localeTexts" ("workspaceId","projectId","locale") WHERE "state"<>'ERASED' AND "projectId" IS NOT NULL;

CREATE TABLE "localeDependencies" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "localeTextId" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "personId" UUID,
  "workId" UUID,
  "projectId" UUID,
  "sourceSubjectId" UUID,
  "sourceId" UUID NOT NULL,
  "sourceRevision" INTEGER NOT NULL,
  "sourceProtectionEpoch" INTEGER NOT NULL,
  "sourceScopeId" UUID NOT NULL,
  "sourceScopeRevision" INTEGER NOT NULL,
  "resourceRevision" INTEGER NOT NULL,
  "resourceProtectionEpoch" INTEGER,
  "resourceScopeId" UUID NOT NULL,
  "resourceScopeRevision" INTEGER NOT NULL,
  UNIQUE ("workspaceId","id"),
  CHECK ("revision">0),
  CONSTRAINT "localeDependencies_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "localeDependencies_localeText_fkey" FOREIGN KEY ("workspaceId","localeTextId") REFERENCES "localeTexts" ("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "localeDependencies_person_fkey" FOREIGN KEY ("workspaceId","personId") REFERENCES "people" ("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "localeDependencies_work_fkey" FOREIGN KEY ("workspaceId","workId") REFERENCES "works" ("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "localeDependencies_project_fkey" FOREIGN KEY ("workspaceId","projectId") REFERENCES "projects" ("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "localeDependencies_sourceSubject_fkey" FOREIGN KEY ("workspaceId","sourceSubjectId") REFERENCES "sources" ("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "localeDependencies_source_fkey" FOREIGN KEY ("workspaceId","sourceId") REFERENCES "sources" ("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "localeDependencies_sourceScope_fkey" FOREIGN KEY ("workspaceId","sourceScopeId") REFERENCES "scopes" ("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "localeDependencies_resourceScope_fkey" FOREIGN KEY ("workspaceId","resourceScopeId") REFERENCES "scopes" ("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK (num_nonnulls("personId","workId","projectId","sourceSubjectId")=1),
  CHECK (("kind"='PERSON' AND "personId" IS NOT NULL) OR ("kind"='WORK' AND "workId" IS NOT NULL) OR ("kind"='PROJECT' AND "projectId" IS NOT NULL) OR ("kind"='SOURCE' AND "sourceSubjectId" IS NOT NULL AND "sourceSubjectId"="sourceId")),
  CHECK ("sourceRevision">0 AND "sourceProtectionEpoch">0 AND "sourceScopeRevision">0 AND "resourceRevision">0 AND "resourceScopeRevision">0 AND ("resourceProtectionEpoch" IS NULL OR "resourceProtectionEpoch">0))
);

CREATE INDEX "localeDependencies_workspaceId_personId_idx" ON "localeDependencies" ("workspaceId","personId");

CREATE INDEX "localeDependencies_workspaceId_workId_idx" ON "localeDependencies" ("workspaceId","workId");

CREATE INDEX "localeDependencies_workspaceId_projectId_idx" ON "localeDependencies" ("workspaceId","projectId");

CREATE INDEX "localeDependencies_workspaceId_localeTextId_idx" ON "localeDependencies" ("workspaceId","localeTextId");

CREATE INDEX "localeDependencies_workspaceId_sourceId_idx" ON "localeDependencies" ("workspaceId","sourceId");

CREATE INDEX "localeDependencies_workspaceId_sourceSubjectId_idx" ON "localeDependencies" ("workspaceId","sourceSubjectId");

CREATE FUNCTION locale_dependency_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent "localeTexts";
BEGIN
 SELECT * INTO parent FROM "localeTexts" WHERE "id"=NEW."localeTextId" AND "workspaceId"=NEW."workspaceId";
 IF parent."id" IS NULL OR (NEW."kind"='PERSON' AND NEW."personId" IS DISTINCT FROM parent."personId") OR (NEW."kind"='WORK' AND NEW."workId" IS DISTINCT FROM parent."workId") OR (NEW."kind"='PROJECT' AND NEW."projectId" IS DISTINCT FROM parent."projectId") THEN RAISE EXCEPTION 'locale dependency owner mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER locale_dependency_owner_guard BEFORE INSERT OR UPDATE ON "localeDependencies" FOR EACH ROW EXECUTE FUNCTION locale_dependency_owner_guard();

CREATE UNIQUE INDEX "localeDependencies_owner_once_uq" ON "localeDependencies" ("workspaceId","localeTextId","kind",COALESCE("personId","workId","projectId","sourceSubjectId"));

CREATE FUNCTION locale_subject_immutable_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId" OR NEW."personId" IS DISTINCT FROM OLD."personId" OR NEW."workId" IS DISTINCT FROM OLD."workId" OR NEW."projectId" IS DISTINCT FROM OLD."projectId" OR NEW."locale" IS DISTINCT FROM OLD."locale" THEN RAISE EXCEPTION 'locale subject and language are immutable' USING ERRCODE='23514'; END IF;
 IF OLD."state"='ERASED' AND (NEW."state"<>'ERASED' OR NEW."text"<>'') THEN RAISE EXCEPTION 'erased locale cannot be restored' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER locale_subject_immutable_guard BEFORE UPDATE ON "localeTexts" FOR EACH ROW EXECUTE FUNCTION locale_subject_immutable_guard();

CREATE FUNCTION locale_dependency_completeness_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id UUID; parent "localeTexts"; roots INTEGER; sources INTEGER; total INTEGER;
BEGIN
 IF TG_TABLE_NAME='localeTexts' THEN parent_id=COALESCE(NEW."id",OLD."id"); ELSE parent_id=COALESCE(NEW."localeTextId",OLD."localeTextId"); END IF;
 SELECT * INTO parent FROM "localeTexts" WHERE "id"=parent_id;
 IF parent."id" IS NULL THEN RETURN NULL; END IF;
 SELECT count(*) FILTER (WHERE "kind"<>'SOURCE'),count(*) FILTER (WHERE "kind"='SOURCE'),count(*) INTO roots,sources,total FROM "localeDependencies" WHERE "localeTextId"=parent_id AND "workspaceId"=parent."workspaceId";
 IF (parent."state"='ERASED' AND total<>0) OR (parent."state"<>'ERASED' AND (roots<>1 OR sources<1 OR sources>20 OR total<>roots+sources)) THEN RAISE EXCEPTION 'locale dependencies incomplete' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER locale_text_dependencies_complete AFTER INSERT OR UPDATE ON "localeTexts" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION locale_dependency_completeness_guard();
CREATE CONSTRAINT TRIGGER locale_dependencies_complete AFTER INSERT OR UPDATE OR DELETE ON "localeDependencies" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION locale_dependency_completeness_guard();
