ALTER TABLE "memberships" DROP CONSTRAINT "memberships_extraPermissions_check";
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_extraPermissions_check" CHECK ("extraPermissions" <@ ARRAY['sensitive.read','sensitive.write','data.export','data.delete','data.merge','ai.use']::text[]);
CREATE TABLE "aiGrants" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "sourceId" uuid NOT NULL,
  "sourceRevision" integer NOT NULL,
  "sourceProtectionEpoch" integer NOT NULL,
  "scopeId" uuid NOT NULL,
  "scopeRevision" integer NOT NULL,
  "providerIdentityHash" text NOT NULL,
  "configRevision" integer NOT NULL,
  "reviewerId" uuid NOT NULL,
  "validUntil" timestamptz(3) NOT NULL,
  "status" text NOT NULL,
  "evidenceNote" text NOT NULL,
  UNIQUE ("workspaceId","id"),
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
  CHECK ("revision">0),
  FOREIGN KEY ("workspaceId","sourceId") REFERENCES "sources"("workspaceId","id") ON DELETE RESTRICT,
  FOREIGN KEY ("workspaceId","scopeId") REFERENCES "scopes"("workspaceId","id") ON DELETE RESTRICT,
  FOREIGN KEY ("workspaceId","reviewerId") REFERENCES "memberships"("workspaceId","id") ON DELETE RESTRICT,
  CHECK ("status" IN ('ACTIVE','REVOKED') AND "sourceRevision">0 AND "sourceProtectionEpoch">0 AND "scopeRevision">0 AND "configRevision">0)
);

CREATE TABLE "aiTasks" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "runId" uuid NOT NULL,
  "actorId" uuid NOT NULL,
  "taskType" text NOT NULL,
  "personId" uuid,
  "workId" uuid,
  "projectId" uuid,
  "targetRevision" integer,
  "targetProtectionEpoch" integer,
  "targetScopeId" uuid,
  "targetScopeRevision" integer,
  "localeTextId" uuid,
  "localeRevision" integer,
  "inputSpec" jsonb NOT NULL,
  "oldValues" jsonb NOT NULL,
  "output" jsonb NOT NULL,
  "proposalState" text NOT NULL,
  "selectedFields" text[] NOT NULL,
  "discardedFields" text[] NOT NULL,
  UNIQUE ("workspaceId","id"),
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
  CHECK ("revision">0),
  FOREIGN KEY ("workspaceId","runId") REFERENCES "aiRuns"("workspaceId","id") ON DELETE RESTRICT,
  FOREIGN KEY ("workspaceId","actorId") REFERENCES "memberships"("workspaceId","id") ON DELETE RESTRICT,
  FOREIGN KEY ("workspaceId","personId") REFERENCES "people"("workspaceId","id") ON DELETE RESTRICT,
  FOREIGN KEY ("workspaceId","workId") REFERENCES "works"("workspaceId","id") ON DELETE RESTRICT,
  FOREIGN KEY ("workspaceId","projectId") REFERENCES "projects"("workspaceId","id") ON DELETE RESTRICT,
  FOREIGN KEY ("workspaceId","targetScopeId") REFERENCES "scopes"("workspaceId","id") ON DELETE RESTRICT,
  FOREIGN KEY ("workspaceId","localeTextId") REFERENCES "localeTexts"("workspaceId","id") ON DELETE RESTRICT,
  UNIQUE ("workspaceId","runId"),
  CHECK ("taskType" IN ('extract_profile','suggest_tags','draft_locale','parse_search')),
  CHECK ("proposalState" IN ('NONE','PENDING','APPLIED','REJECTED','ERASED')),
  CHECK (("taskType"='parse_search' AND num_nonnulls("personId","workId","projectId")=0 AND "targetRevision" IS NULL) OR ("taskType"<>'parse_search' AND num_nonnulls("personId","workId","projectId")=1 AND "targetRevision">0)),
  CHECK ("proposalState"<>'ERASED' OR ("inputSpec"='{}'::jsonb AND "oldValues"='{}'::jsonb AND "output"='{}'::jsonb))
);

CREATE TABLE "aiDependencies" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "taskId" uuid NOT NULL,
  "sourceId" uuid NOT NULL,
  "grantId" uuid,
  "grantRevision" integer,
  "sourceRevision" integer NOT NULL,
  "protectionEpoch" integer NOT NULL,
  "scopeId" uuid NOT NULL,
  "scopeRevision" integer NOT NULL,
  UNIQUE ("workspaceId","id"),
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
  CHECK ("revision">0),
  FOREIGN KEY ("workspaceId","taskId") REFERENCES "aiTasks"("workspaceId","id") ON DELETE RESTRICT,
  FOREIGN KEY ("workspaceId","sourceId") REFERENCES "sources"("workspaceId","id") ON DELETE RESTRICT,
  FOREIGN KEY ("workspaceId","grantId") REFERENCES "aiGrants"("workspaceId","id") ON DELETE RESTRICT,
  FOREIGN KEY ("workspaceId","scopeId") REFERENCES "scopes"("workspaceId","id") ON DELETE RESTRICT,
  CHECK (("grantId" IS NULL)=("grantRevision" IS NULL))
);

CREATE FUNCTION once_ai_business_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'AI business headers must be retained'; END IF;
 IF TG_TABLE_NAME='aiTasks' THEN
  IF (to_jsonb(NEW)-ARRAY['revision','updatedAt','inputSpec','oldValues','output','proposalState','selectedFields','discardedFields']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','updatedAt','inputSpec','oldValues','output','proposalState','selectedFields','discardedFields']) THEN RAISE EXCEPTION 'AI task identity is immutable'; END IF;
  IF NEW."proposalState"<>'ERASED' AND (NEW."inputSpec"<>OLD."inputSpec" OR NEW."oldValues"<>OLD."oldValues") THEN RAISE EXCEPTION 'AI confirmed inputs are immutable'; END IF;
  IF OLD."proposalState" IN ('APPLIED','REJECTED','ERASED') AND NEW."proposalState" NOT IN (OLD."proposalState",'ERASED') THEN RAISE EXCEPTION 'AI proposal is final'; END IF;
  IF OLD."proposalState"<>'NONE' AND NEW."proposalState"<>'ERASED' AND NEW."output"<>OLD."output" THEN RAISE EXCEPTION 'AI proposal output is immutable'; END IF;
 ELSIF TG_TABLE_NAME='aiGrants' THEN
  IF (to_jsonb(NEW)-ARRAY['revision','updatedAt','status','evidenceNote']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','updatedAt','status','evidenceNote']) OR (OLD.status='REVOKED' AND NEW.status<>'REVOKED') OR (NEW."evidenceNote"<>OLD."evidenceNote" AND NOT(NEW.status='REVOKED' AND NEW."evidenceNote"='')) THEN RAISE EXCEPTION 'AI purpose grant is immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ai_task_guard BEFORE UPDATE OR DELETE ON "aiTasks" FOR EACH ROW EXECUTE FUNCTION once_ai_business_guard();
CREATE TRIGGER ai_grant_guard BEFORE UPDATE OR DELETE ON "aiGrants" FOR EACH ROW EXECUTE FUNCTION once_ai_business_guard();
CREATE FUNCTION once_ai_business_consistent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE wid uuid := COALESCE(NEW."workspaceId",OLD."workspaceId");
BEGIN
 IF EXISTS(SELECT 1 FROM "aiDependencies" d JOIN "aiGrants" g ON g.id=d."grantId" WHERE d."workspaceId"=wid AND g."sourceId"<>d."sourceId") THEN RAISE EXCEPTION 'AI grant must match exact source'; END IF;
 IF EXISTS(SELECT 1 FROM "aiTasks" t JOIN "aiRuns" r ON r.id=t."runId" WHERE t."workspaceId"=wid AND t."actorId"<>r."actorId") THEN RAISE EXCEPTION 'AI actor must match reservation'; END IF;
 IF EXISTS(SELECT 1 FROM "aiTasks" t WHERE t."workspaceId"=wid AND t."proposalState"<>'ERASED' AND t."taskType"<>'parse_search' AND NOT EXISTS(SELECT 1 FROM "aiDependencies" d WHERE d."taskId"=t.id AND d."grantId" IS NOT NULL)) THEN RAISE EXCEPTION 'AI source grant dependency required'; END IF;
 IF EXISTS(SELECT 1 FROM "aiTasks" t JOIN "aiDependencies" d ON d."taskId"=t.id WHERE t."workspaceId"=wid AND t."proposalState"='ERASED') THEN RAISE EXCEPTION 'Erased AI content must release dependencies'; END IF;
 IF EXISTS(SELECT 1 FROM "aiTasks" t CROSS JOIN LATERAL jsonb_array_elements(t."inputSpec"->'sources') s WHERE t."workspaceId"=wid AND t."proposalState"<>'ERASED' AND NOT EXISTS(SELECT 1 FROM "aiDependencies" d WHERE d."taskId"=t.id AND d."sourceId"::text=s->>'sourceId' AND d."grantId"::text=s->>'grantId')) THEN RAISE EXCEPTION 'AI selected source dependency missing'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ai_task_consistency AFTER INSERT OR UPDATE ON "aiTasks" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION once_ai_business_consistent();
CREATE CONSTRAINT TRIGGER ai_dependency_consistency AFTER INSERT OR UPDATE OR DELETE ON "aiDependencies" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION once_ai_business_consistent();

ALTER TABLE "aiTasks" ADD CONSTRAINT ai_task_target_kind CHECK (("taskType"<>'extract_profile' OR "personId" IS NOT NULL) AND ("taskType"<>'suggest_tags' OR "workId" IS NOT NULL));
