CREATE TABLE "aiApprovals" (
 "id" uuid PRIMARY KEY, "workspaceId" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE RESTRICT,
 "createdAt" timestamptz(3) NOT NULL, "updatedAt" timestamptz(3) NOT NULL, "revision" integer NOT NULL CHECK ("revision">0),
 "configDigest" text NOT NULL CHECK ("configDigest" ~ '^[a-f0-9]{64}$'), "reviewerId" uuid NOT NULL,
 "configRevision" integer NOT NULL CHECK ("configRevision">0),
 "enabled" boolean NOT NULL, "recoveryEpoch" text NOT NULL,
 UNIQUE("workspaceId","id"), UNIQUE("workspaceId","configDigest"),
 FOREIGN KEY ("workspaceId","reviewerId") REFERENCES "memberships"("workspaceId","id") ON DELETE RESTRICT
);
CREATE FUNCTION once_ai_approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'AI approvals must be disabled, not deleted'; END IF;
 IF ROW(NEW."id",NEW."workspaceId",NEW."createdAt",NEW."configDigest",NEW."configRevision",NEW."recoveryEpoch") IS DISTINCT FROM ROW(OLD."id",OLD."workspaceId",OLD."createdAt",OLD."configDigest",OLD."configRevision",OLD."recoveryEpoch") THEN RAISE EXCEPTION 'AI approval identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ai_approval_guard BEFORE UPDATE OR DELETE ON "aiApprovals" FOR EACH ROW EXECUTE FUNCTION once_ai_approval_guard();

CREATE TABLE "aiBudgetReleases" (
 "id" uuid PRIMARY KEY, "workspaceId" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE RESTRICT,
 "createdAt" timestamptz(3) NOT NULL, "updatedAt" timestamptz(3) NOT NULL, "revision" integer NOT NULL CHECK ("revision"=1),
 "budgetId" uuid NOT NULL, "budgetRevision" integer NOT NULL CHECK ("budgetRevision">0), "approvalId" uuid NOT NULL, "reviewerId" uuid NOT NULL,
 UNIQUE("workspaceId","id"), UNIQUE("workspaceId","budgetId","budgetRevision"),
 FOREIGN KEY ("workspaceId","reviewerId") REFERENCES "memberships"("workspaceId","id") ON DELETE RESTRICT,
 FOREIGN KEY ("workspaceId","budgetId") REFERENCES "aiBudgets"("workspaceId","id") ON DELETE RESTRICT,
 FOREIGN KEY ("workspaceId","approvalId") REFERENCES "aiApprovals"("workspaceId","id") ON DELETE RESTRICT
);
CREATE FUNCTION once_ai_release_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'AI budget releases are immutable';
END $$;
CREATE TRIGGER ai_release_guard BEFORE UPDATE OR DELETE ON "aiBudgetReleases" FOR EACH ROW EXECUTE FUNCTION once_ai_release_guard();
CREATE OR REPLACE FUNCTION once_ai_ledger_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF NEW."workspaceId"<>OLD."workspaceId" OR NEW."period"<>OLD."period" OR NEW."currency"<>OLD."currency" OR (OLD."frozen" AND NOT NEW."frozen" AND NOT EXISTS(
    SELECT 1 FROM "aiBudgetReleases" r JOIN "aiApprovals" a ON a."id"=r."approvalId" AND a."workspaceId"=r."workspaceId"
    WHERE r."workspaceId"=OLD."workspaceId" AND r."budgetId"=OLD."id" AND r."budgetRevision"=OLD."revision" AND a."enabled"
   )) THEN RAISE EXCEPTION 'AI budget identity is immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE TABLE "aiReconciliations" (
 "id" uuid PRIMARY KEY, "workspaceId" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE RESTRICT,
 "createdAt" timestamptz(3) NOT NULL, "updatedAt" timestamptz(3) NOT NULL, "revision" integer NOT NULL CHECK ("revision"=1),
 "attemptId" uuid NOT NULL, "reviewerId" uuid NOT NULL, "evidenceSourceId" uuid NOT NULL,
 "sourceRevision" integer NOT NULL CHECK ("sourceRevision">0), "protectionEpoch" integer NOT NULL CHECK ("protectionEpoch">0),
 "outcome" text NOT NULL CHECK ("outcome" IN ('SUCCEEDED','NOT_EXECUTED')), "amountUnits" integer NOT NULL CHECK ("amountUnits">=0),
 CHECK ("outcome"<>'NOT_EXECUTED' OR "amountUnits"=0),
 UNIQUE("workspaceId","id"), UNIQUE("workspaceId","attemptId"),
 FOREIGN KEY ("workspaceId","attemptId") REFERENCES "aiAttempts"("workspaceId","id") ON DELETE RESTRICT,
 FOREIGN KEY ("workspaceId","reviewerId") REFERENCES "memberships"("workspaceId","id") ON DELETE RESTRICT,
 FOREIGN KEY ("workspaceId","evidenceSourceId") REFERENCES "sources"("workspaceId","id") ON DELETE RESTRICT
);
CREATE TRIGGER ai_reconciliation_guard BEFORE UPDATE OR DELETE ON "aiReconciliations" FOR EACH ROW EXECUTE FUNCTION once_ai_release_guard();
