-- Provider-neutral accounting; no prompt payloads and no automatic dispatch.
CREATE TABLE "aiBudgets" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "period" text NOT NULL,
  "currency" text NOT NULL,
  "reservedUnits" integer NOT NULL,
  "settledUnits" integer NOT NULL,
  "frozen" boolean NOT NULL,
  UNIQUE ("workspaceId","id"),
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
  CHECK ("revision">0),
  UNIQUE ("workspaceId","period","currency"),
  CHECK ("reservedUnits">=0 AND "settledUnits">=0),
  CHECK ("currency" ~ '^[A-Z]{3}$' AND "period" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);

CREATE TABLE "aiRuns" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "actorId" uuid NOT NULL,
  "budgetId" uuid NOT NULL,
  "requestKey" text NOT NULL,
  "requestDigest" text NOT NULL,
  "inputDigest" text NOT NULL,
  "providerIdentityHash" text NOT NULL,
  "configRevision" integer NOT NULL,
  "recoveryEpoch" text NOT NULL,
  "state" text NOT NULL,
  "reservedUnits" integer NOT NULL,
  "settledUnits" integer,
  "cancelRequested" boolean NOT NULL,
  UNIQUE ("workspaceId","id"),
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
  CHECK ("revision">0),
  FOREIGN KEY ("workspaceId","budgetId") REFERENCES "aiBudgets"("workspaceId","id") ON DELETE RESTRICT,
  FOREIGN KEY ("workspaceId","actorId") REFERENCES "memberships"("workspaceId","id") ON DELETE RESTRICT,
  UNIQUE ("workspaceId","actorId","requestKey"),
  CHECK ("reservedUnits">0 AND ("settledUnits" IS NULL OR "settledUnits">=0) AND "configRevision">0),
  CHECK ("state" IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED','UNKNOWN')),
  CHECK (("settledUnits" IS NULL) = ("state" IN ('QUEUED','RUNNING','UNKNOWN'))),
  CHECK ("requestDigest" ~ '^[a-f0-9]{64}$' AND "inputDigest" ~ '^[a-f0-9]{64}$' AND "providerIdentityHash" ~ '^[a-f0-9]{64}$')
);

CREATE TABLE "aiAttempts" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "runId" uuid NOT NULL,
  "attemptNo" integer NOT NULL,
  "state" text NOT NULL,
  "requestDigest" text NOT NULL,
  "providerIdempotencyKey" text NOT NULL,
  "settlementDigest" text,
  UNIQUE ("workspaceId","id"),
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
  CHECK ("revision">0),
  FOREIGN KEY ("workspaceId","runId") REFERENCES "aiRuns"("workspaceId","id") ON DELETE RESTRICT,
  UNIQUE ("workspaceId","runId","attemptNo"),
  UNIQUE ("providerIdempotencyKey"),
  CHECK ("attemptNo" BETWEEN 1 AND 3),
  CHECK ("state" IN ('MAY_HAVE_EXECUTED','UNKNOWN','SUCCEEDED','NOT_EXECUTED')),
  CHECK (("settlementDigest" IS NULL) = ("state" IN ('MAY_HAVE_EXECUTED','UNKNOWN'))),
  CHECK ("requestDigest" ~ '^[a-f0-9]{64}$' AND ("settlementDigest" IS NULL OR "settlementDigest" ~ '^[a-f0-9]{64}$'))
);
CREATE UNIQUE INDEX "aiAttempts_one_unresolved" ON "aiAttempts"("workspaceId","runId") WHERE "state" IN ('MAY_HAVE_EXECUTED','UNKNOWN');

-- Keep request identity and settled evidence immutable. Ledger rows contain only
-- minimal accounting metadata, so business payload erasure must not remove them.
CREATE FUNCTION once_ai_ledger_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'AI ledger history is immutable'; END IF;
 IF TG_TABLE_NAME='aiRuns' THEN
  IF (to_jsonb(NEW)-ARRAY['revision','updatedAt','state','settledUnits','cancelRequested']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['revision','updatedAt','state','settledUnits','cancelRequested']) OR
     (OLD."settledUnits" IS NOT NULL AND (NEW."settledUnits" IS DISTINCT FROM OLD."settledUnits" OR NEW."state"<>OLD."state")) OR
     (OLD."cancelRequested" AND NOT NEW."cancelRequested") THEN RAISE EXCEPTION 'AI request identity is immutable'; END IF;
 ELSIF TG_TABLE_NAME='aiAttempts' THEN
  IF (to_jsonb(NEW)-ARRAY['revision','updatedAt','state','settlementDigest']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['revision','updatedAt','state','settlementDigest']) OR
     (OLD."settlementDigest" IS NOT NULL AND (NEW."settlementDigest" IS DISTINCT FROM OLD."settlementDigest" OR NEW."state"<>OLD."state")) OR
     (OLD."state"='UNKNOWN' AND NEW."state"='MAY_HAVE_EXECUTED') THEN RAISE EXCEPTION 'AI attempt identity is immutable'; END IF;
 ELSE
  IF NEW."workspaceId"<>OLD."workspaceId" OR NEW."period"<>OLD."period" OR NEW."currency"<>OLD."currency" OR (OLD."frozen" AND NOT NEW."frozen") THEN RAISE EXCEPTION 'AI budget identity is immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ai_run_guard BEFORE UPDATE OR DELETE ON "aiRuns" FOR EACH ROW EXECUTE FUNCTION once_ai_ledger_guard();
CREATE TRIGGER ai_attempt_guard BEFORE UPDATE OR DELETE ON "aiAttempts" FOR EACH ROW EXECUTE FUNCTION once_ai_ledger_guard();
CREATE TRIGGER ai_budget_guard BEFORE UPDATE OR DELETE ON "aiBudgets" FOR EACH ROW EXECUTE FUNCTION once_ai_ledger_guard();

CREATE FUNCTION once_ai_ledger_consistent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM "aiBudgets" b WHERE b."workspaceId"=NEW."workspaceId" AND (
   b."reservedUnits" <> COALESCE((SELECT SUM(r."reservedUnits") FROM "aiRuns" r WHERE r."budgetId"=b.id AND r."settledUnits" IS NULL),0) OR
   b."settledUnits" <> COALESCE((SELECT SUM(r."settledUnits") FROM "aiRuns" r WHERE r."budgetId"=b.id),0)))
 THEN RAISE EXCEPTION 'AI budget and reservation totals differ'; END IF;
 IF EXISTS (
  SELECT 1 FROM "aiRuns" r WHERE r."workspaceId"=NEW."workspaceId" AND (
   (r.state='RUNNING' AND NOT EXISTS(SELECT 1 FROM "aiAttempts" a WHERE a."runId"=r.id AND a.state='MAY_HAVE_EXECUTED')) OR
   (r.state='UNKNOWN' AND NOT EXISTS(SELECT 1 FROM "aiAttempts" a WHERE a."runId"=r.id AND a.state='UNKNOWN')) OR
   (r.state NOT IN ('RUNNING','UNKNOWN') AND EXISTS(SELECT 1 FROM "aiAttempts" a WHERE a."runId"=r.id AND a.state IN ('MAY_HAVE_EXECUTED','UNKNOWN'))) OR
   (r.state='QUEUED' AND EXISTS(SELECT 1 FROM "aiAttempts" a WHERE a."runId"=r.id AND a.state<>'NOT_EXECUTED'))))
 THEN RAISE EXCEPTION 'AI run and attempt states differ'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ai_run_consistent AFTER INSERT OR UPDATE ON "aiRuns" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION once_ai_ledger_consistent();
CREATE CONSTRAINT TRIGGER ai_attempt_consistent AFTER INSERT OR UPDATE ON "aiAttempts" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION once_ai_ledger_consistent();
CREATE CONSTRAINT TRIGGER ai_budget_consistent AFTER INSERT OR UPDATE ON "aiBudgets" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION once_ai_ledger_consistent();
