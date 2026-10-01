-- 68: forward-only correction after migration 67 was applied to retained fixtures.
-- SQL CHECK accepts NULL. Reject missing/null object fields explicitly.
CREATE OR REPLACE FUNCTION once_purge_object_plan_valid(plan jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT coalesce(jsonb_typeof(plan)='array' AND jsonb_array_length(plan) BETWEEN 1 AND 2
 AND NOT EXISTS (
   SELECT 1 FROM jsonb_array_elements(plan) x
   WHERE jsonb_typeof(x)<>'object' OR NOT (x ?& ARRAY['part','bytes','hash','state'])
   OR (x - ARRAY['part','bytes','hash','state']) <> '{}'::jsonb
   OR jsonb_typeof(x->'part')<>'string' OR jsonb_typeof(x->'state')<>'string'
   OR jsonb_typeof(x->'hash')<>'string' OR jsonb_typeof(x->'bytes')<>'number'
   OR coalesce(x->>'part' NOT IN ('original','preview'),true)
   OR coalesce(x->>'state' NOT IN ('PENDING','UNKNOWN','MISSING'),true)
   OR coalesce(x->>'hash' !~ '^[a-f0-9]{64}$',true)
   OR coalesce(x->>'bytes' !~ '^[1-9][0-9]{0,8}$',true)
 ) AND (SELECT count(DISTINCT x->>'part')=count(*) AND bool_or(x->>'part'='original') FROM jsonb_array_elements(plan) x),false)
$$;
-- Revalidate all existing plans under the stricter function, without rewriting data.
ALTER TABLE "mediaPurgeIntents" DROP CONSTRAINT "mediaPurge_object_plan_check";
ALTER TABLE "mediaPurgeIntents" ADD CONSTRAINT "mediaPurge_object_plan_check" CHECK(once_purge_object_plan_valid(objects));
CREATE OR REPLACE FUNCTION once_purge_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
   IF (NEW."assetId",NEW."uploadId",NEW."workspaceId",NEW."objectToken") IS DISTINCT FROM
      (OLD."assetId",OLD."uploadId",OLD."workspaceId",OLD."objectToken") THEN RAISE EXCEPTION 'purge identity immutable'; END IF;
   IF (SELECT jsonb_agg(x - 'state' ORDER BY x->>'part') FROM jsonb_array_elements(NEW.objects) x)
      IS DISTINCT FROM (SELECT jsonb_agg(x - 'state' ORDER BY x->>'part') FROM jsonb_array_elements(OLD.objects) x)
      THEN RAISE EXCEPTION 'purge object identity immutable'; END IF;
   IF OLD.state IN ('DELETE_PENDING','DELETE_UNKNOWN','DELETE_CONFIRMED','ERASED')
      AND NEW.state IN ('ELIGIBLE','CLAIMED','SKIPPED') THEN RAISE EXCEPTION 'purge fence irreversible'; END IF;
   IF OLD.state='ERASED' AND NEW.state<>'ERASED' THEN RAISE EXCEPTION 'purge finalized immutable'; END IF;
 END IF;
 IF NEW.state IN ('DELETE_CONFIRMED','ERASED') AND EXISTS(
   SELECT 1 FROM jsonb_array_elements(NEW.objects) o WHERE (o->>'state') IS DISTINCT FROM 'MISSING')
   THEN RAISE EXCEPTION 'purge not confirmed'; END IF;
 RETURN NEW;
END $$;
