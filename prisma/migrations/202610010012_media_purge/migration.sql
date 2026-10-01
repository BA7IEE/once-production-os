-- 67: durable staged-media purge plan; existing migrations are immutable.
CREATE TABLE "mediaPurgeIntents" (
 "id" uuid PRIMARY KEY, "workspaceId" uuid NOT NULL REFERENCES "workspaces"("id"),
 "revision" integer NOT NULL CHECK ("revision">0), "createdAt" timestamptz(3) NOT NULL,"updatedAt" timestamptz(3) NOT NULL,
 "assetId" uuid NOT NULL UNIQUE,"uploadId" uuid NOT NULL,"objectToken" uuid NOT NULL,
 "state" text NOT NULL CHECK (state IN ('ELIGIBLE','CLAIMED','DELETE_PENDING','DELETE_UNKNOWN','DELETE_CONFIRMED','ERASED','SKIPPED')),
 "objects" jsonb NOT NULL CHECK(jsonb_typeof(objects)='array' AND jsonb_array_length(objects) BETWEEN 1 AND 2),
 "leaseToken" uuid,"leaseUntil" timestamptz(3),"recoveryEpoch" text NOT NULL,"attempts" integer NOT NULL CHECK(attempts>=0),
 "nextAttemptAt" timestamptz(3) NOT NULL,"lastCode" text,"purgedAt" timestamptz(3),
 UNIQUE("workspaceId","id"),
 FOREIGN KEY("workspaceId","assetId") REFERENCES "assets"("workspaceId","id"),
 FOREIGN KEY("workspaceId","uploadId") REFERENCES "uploads"("workspaceId","id"),
 CHECK ("assetId"="uploadId"), CHECK (("leaseToken" IS NULL)=("leaseUntil" IS NULL)),
 CHECK ((state='ERASED')=("purgedAt" IS NOT NULL)),
 CHECK(state NOT IN ('ELIGIBLE','SKIPPED','ERASED') OR "leaseToken" IS NULL)
);
CREATE INDEX "mediaPurgeIntents_state_nextAttemptAt_leaseUntil_idx" ON "mediaPurgeIntents"(state,"nextAttemptAt","leaseUntil");
CREATE INDEX "personMedia_purge_due_idx" ON "personMedia"("retainUntil","assetId") WHERE "usageState" IN ('STAGED','RETIRED') AND "purgedAt" IS NULL;
-- Typed bounded object plan and immutable object identity across lease retries.
CREATE FUNCTION once_purge_object_plan_valid(plan jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT count(*) BETWEEN 1 AND 2 AND count(DISTINCT x->>'part')=count(*)
 AND bool_and(x->>'part' IN ('original','preview') AND x->>'state' IN ('PENDING','UNKNOWN','MISSING')
 AND (x->>'bytes')::bigint>0 AND x->>'hash' ~ '^[a-f0-9]{64}$')
 AND bool_or(x->>'part'='original') FROM jsonb_array_elements(plan) x
$$;
ALTER TABLE "mediaPurgeIntents" ADD CONSTRAINT "mediaPurge_object_plan_check" CHECK(once_purge_object_plan_valid(objects));
CREATE FUNCTION once_purge_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW."assetId",NEW."uploadId",NEW."workspaceId",NEW."objectToken") IS DISTINCT FROM (OLD."assetId",OLD."uploadId",OLD."workspaceId",OLD."objectToken") THEN RAISE EXCEPTION 'purge identity immutable'; END IF;
 IF NEW.state IN ('DELETE_CONFIRMED','ERASED') AND EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.objects) o WHERE o->>'state'<>'MISSING') THEN RAISE EXCEPTION 'purge not confirmed'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER media_purge_identity_guard BEFORE INSERT OR UPDATE ON "mediaPurgeIntents" FOR EACH ROW EXECUTE FUNCTION once_purge_identity_guard();
