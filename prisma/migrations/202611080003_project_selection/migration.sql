-- Forward 81: project-scoped requirements and optional candidate-list context.
BEGIN;
CREATE TABLE "projectRequirements" (
 id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL REFERENCES workspaces(id),"createdAt" timestamptz(3) NOT NULL,"updatedAt" timestamptz(3) NOT NULL,revision integer NOT NULL CHECK(revision>=1),
 "projectId" uuid NOT NULL,"sourceId" uuid NOT NULL,"sourceRevision" integer NOT NULL CHECK("sourceRevision">0),"roleCode" text NOT NULL,"headcount" integer NOT NULL CHECK("headcount" BETWEEN 1 AND 100),
 "locationCodes" text[] NOT NULL,"startsOn" text,"endsOn" text,"dateNote" text NOT NULL,"taskNote" text NOT NULL,necessary jsonb NOT NULL,preferred jsonb NOT NULL,questions text[] NOT NULL,status text NOT NULL CHECK(status IN ('ACTIVE','ARCHIVED','ERASED')),
 UNIQUE("workspaceId",id),FOREIGN KEY("workspaceId","projectId") REFERENCES projects("workspaceId",id),FOREIGN KEY("workspaceId","sourceId") REFERENCES sources("workspaceId",id),
 CHECK(jsonb_typeof(necessary)='object' AND jsonb_typeof(preferred)='object'),CHECK(cardinality("locationCodes")<=20 AND cardinality(questions)<=20),
 CHECK(("startsOn" IS NULL OR "startsOn" ~ '^\d{4}-\d{2}-\d{2}$') AND ("endsOn" IS NULL OR "endsOn" ~ '^\d{4}-\d{2}-\d{2}$') AND ("startsOn" IS NULL OR "endsOn" IS NULL OR "startsOn"<="endsOn")),
 CHECK(status<>'ERASED' OR ("dateNote"='' AND "taskNote"='' AND necessary='{}' AND preferred='{}' AND cardinality(questions)=0 AND cardinality("locationCodes")=0 AND "startsOn" IS NULL AND "endsOn" IS NULL))
);
CREATE INDEX "projectRequirements_workspaceId_projectId_status_idx" ON "projectRequirements"("workspaceId","projectId",status);
CREATE INDEX "projectRequirements_workspaceId_sourceId_idx" ON "projectRequirements"("workspaceId","sourceId");
ALTER TABLE shortlists ADD COLUMN "projectId" uuid,ADD CONSTRAINT shortlist_project_fk FOREIGN KEY("workspaceId","projectId") REFERENCES projects("workspaceId",id);
ALTER TABLE "shortlistItems" ADD COLUMN "requirementId" uuid,ADD COLUMN "requirementRevision" integer,ADD COLUMN "selectionCiphertext" text,
 ADD CONSTRAINT selection_requirement_fk FOREIGN KEY("workspaceId","requirementId") REFERENCES "projectRequirements"("workspaceId",id),
 ADD CONSTRAINT selection_context_check CHECK (("requirementId" IS NULL AND "requirementRevision" IS NULL AND "selectionCiphertext" IS NULL) OR ("requirementId" IS NOT NULL AND "requirementRevision">0 AND "selectionCiphertext" IS NOT NULL AND octet_length("selectionCiphertext")<=60000));
CREATE FUNCTION once_project_selection_context() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='shortlists' THEN
  IF NEW."projectId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM projects p WHERE p.id=NEW."projectId" AND p."workspaceId"=NEW."workspaceId" AND p."scopeId"=NEW."scopeId") THEN RAISE EXCEPTION 'PROJECT_LIST_SCOPE_MISMATCH'; END IF;
 ELSIF TG_TABLE_NAME='projectRequirements' THEN
  IF NOT EXISTS(SELECT 1 FROM projects p WHERE p.id=NEW."projectId" AND p."workspaceId"=NEW."workspaceId" AND p."sourceId"=NEW."sourceId") THEN RAISE EXCEPTION 'REQUIREMENT_SOURCE_MISMATCH'; END IF;
 ELSIF TG_TABLE_NAME='shortlistItems' THEN
  IF NEW."requirementId" IS NOT NULL AND (TG_OP='INSERT' OR NEW."requirementId" IS DISTINCT FROM OLD."requirementId" OR NEW."requirementRevision" IS DISTINCT FROM OLD."requirementRevision" OR NEW."selectionCiphertext" IS DISTINCT FROM OLD."selectionCiphertext" OR NEW."personRoleId" IS DISTINCT FROM OLD."personRoleId") AND NOT EXISTS(SELECT 1 FROM shortlists l JOIN "projectRequirements" r ON r."workspaceId"=l."workspaceId" AND r."projectId"=l."projectId" JOIN "personRoles" role ON role."workspaceId"=NEW."workspaceId" AND role.id=NEW."personRoleId" AND role."personId"=NEW."personId" AND role."roleCode"=r."roleCode" WHERE l.id=NEW."shortlistId" AND l."workspaceId"=NEW."workspaceId" AND r.id=NEW."requirementId") THEN RAISE EXCEPTION 'SELECTION_REQUIREMENT_ROLE_MISMATCH'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER project_list_context BEFORE INSERT OR UPDATE ON shortlists FOR EACH ROW EXECUTE FUNCTION once_project_selection_context();
CREATE TRIGGER requirement_source_context BEFORE INSERT OR UPDATE ON "projectRequirements" FOR EACH ROW EXECUTE FUNCTION once_project_selection_context();
CREATE TRIGGER selection_requirement_context BEFORE INSERT OR UPDATE ON "shortlistItems" FOR EACH ROW EXECUTE FUNCTION once_project_selection_context();
COMMIT;
