-- Keep conflicting singleton records at the retired identity, with typed links to the
-- current profile. No source facts or Evidence owners are copied to another source.
ALTER TABLE "talentProfiles" ADD COLUMN "supersededById" uuid;
ALTER TABLE "castingProfiles" ADD COLUMN "supersededById" uuid;
ALTER TABLE "castingProfiles" ADD COLUMN "retiredCurrentMeasurementSetId" uuid;
ALTER TABLE "talentProfiles" ADD CONSTRAINT "talentProfiles_superseded_fk"
 FOREIGN KEY ("workspaceId", "supersededById") REFERENCES "talentProfiles" ("workspaceId", "id") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "castingProfiles" ADD CONSTRAINT "castingProfiles_superseded_fk"
 FOREIGN KEY ("workspaceId", "supersededById") REFERENCES "castingProfiles" ("workspaceId", "id") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "castingProfiles" ADD CONSTRAINT "castingProfiles_retired_measurement_fk"
 FOREIGN KEY ("workspaceId", "retiredCurrentMeasurementSetId") REFERENCES "measurementSets" ("workspaceId", "id") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "talentProfiles" ADD CONSTRAINT "talentProfiles_no_self_supersession" CHECK ("supersededById" IS NULL OR "supersededById" <> "id");
ALTER TABLE "castingProfiles" ADD CONSTRAINT "castingProfiles_retirement_shape" CHECK (
 (("supersededById" IS NULL AND "retiredCurrentMeasurementSetId" IS NULL)
 OR ("supersededById" IS NOT NULL AND "supersededById" <> "id" AND "currentMeasurementSetId" IS NULL)) IS TRUE);
CREATE INDEX "talentProfiles_superseded_idx" ON "talentProfiles" ("workspaceId", "supersededById");
CREATE INDEX "castingProfiles_superseded_idx" ON "castingProfiles" ("workspaceId", "supersededById");

CREATE FUNCTION once_preserve_retired_profile() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE has_history boolean;
BEGIN
 IF TG_OP = 'INSERT' THEN
  IF NEW."supersededById" IS NOT NULL THEN RAISE EXCEPTION 'retirement requires an existing profile' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF OLD."supersededById" IS NOT NULL THEN RAISE EXCEPTION 'retired profile is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 IF NEW."personId" IS DISTINCT FROM OLD."personId" OR NEW."supersededById" IS NOT NULL THEN
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE "workspaceId"=$1 AND "supersededById"=$2)', TG_TABLE_NAME)
   INTO has_history USING OLD."workspaceId", OLD."id";
  IF has_history THEN RAISE EXCEPTION 'cannot change the owner of retained profile history' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW."supersededById" IS NOT NULL THEN
  IF (to_jsonb(NEW) - ARRAY['supersededById','revision','updatedAt','currentMeasurementSetId','retiredCurrentMeasurementSetId'])
    IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['supersededById','revision','updatedAt','currentMeasurementSetId','retiredCurrentMeasurementSetId'])
    OR NEW."revision" <> OLD."revision" + 1 THEN
   RAISE EXCEPTION 'retirement must preserve original facts' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME = 'castingProfiles' AND
    ((to_jsonb(NEW)->'retiredCurrentMeasurementSetId') IS DISTINCT FROM (to_jsonb(OLD)->'currentMeasurementSetId')) THEN
   RAISE EXCEPTION 'retirement must preserve measurement pointer' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "talentProfiles_retirement_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "talentProfiles"
 FOR EACH ROW EXECUTE FUNCTION once_preserve_retired_profile();
CREATE TRIGGER "castingProfiles_retirement_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "castingProfiles"
 FOR EACH ROW EXECUTE FUNCTION once_preserve_retired_profile();

CREATE FUNCTION once_validate_profile_retirement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_person uuid; target_superseded uuid; measurement_person uuid;
BEGIN
 IF NEW."supersededById" IS NULL THEN RETURN NULL; END IF;
 EXECUTE format('SELECT "personId", "supersededById" FROM %I WHERE "workspaceId"=$1 AND "id"=$2', TG_TABLE_NAME)
 INTO target_person, target_superseded USING NEW."workspaceId", NEW."supersededById";
 IF target_person IS NULL OR target_superseded IS NOT NULL OR NOT EXISTS (
  SELECT 1 FROM "personAliases" WHERE "workspaceId"=NEW."workspaceId"
   AND "oldPersonId"=NEW."personId" AND "canonicalPersonId"=target_person
 ) THEN RAISE EXCEPTION 'retirement requires the matching completed identity merge' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME = 'castingProfiles' AND (to_jsonb(NEW)->>'retiredCurrentMeasurementSetId') IS NOT NULL THEN
  SELECT "personId" INTO measurement_person FROM "measurementSets"
   WHERE "workspaceId"=NEW."workspaceId" AND "id"=(to_jsonb(NEW)->>'retiredCurrentMeasurementSetId')::uuid;
  IF measurement_person IS DISTINCT FROM target_person THEN
   RAISE EXCEPTION 'retired measurement belongs to another identity' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "talentProfiles_retirement_lineage" AFTER UPDATE ON "talentProfiles"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION once_validate_profile_retirement();
CREATE CONSTRAINT TRIGGER "castingProfiles_retirement_lineage" AFTER UPDATE ON "castingProfiles"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION once_validate_profile_retirement();

CREATE FUNCTION once_validate_retired_measurement_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM "castingProfiles" h JOIN "castingProfiles" current_profile
   ON current_profile."workspaceId"=h."workspaceId" AND current_profile."id"=h."supersededById"
  WHERE h."workspaceId"=NEW."workspaceId" AND h."retiredCurrentMeasurementSetId"=NEW."id"
   AND current_profile."personId"<>NEW."personId"
 ) THEN RAISE EXCEPTION 'cannot detach retired measurement from merged identity' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "measurementSets_retired_owner" AFTER UPDATE ON "measurementSets"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION once_validate_retired_measurement_owner();
