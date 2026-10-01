-- 62: media origin, real uploader and business use. Migrations 1–61 are unchanged.
ALTER TABLE "uploads" ALTER COLUMN "actorId" DROP NOT NULL,
 ALTER COLUMN "sourceId" DROP NOT NULL, ALTER COLUMN "sourceRevision" DROP NOT NULL, ALTER COLUMN "sourceEpoch" DROP NOT NULL,
 ADD COLUMN "contextKind" text NOT NULL DEFAULT 'INTERNAL_SOURCE',
 ADD COLUMN "principalKind" text NOT NULL DEFAULT 'INTERNAL',
 ADD COLUMN "talentAccountId" uuid, ADD COLUMN "servicePrincipalId" uuid,
 ADD COLUMN "submissionId" uuid, ADD COLUMN "personRoleId" uuid,
 ADD COLUMN "grantEpoch" integer, ADD COLUMN "recoveryEpoch" text;
ALTER TABLE "uploads" ADD CONSTRAINT upload_talent_fk FOREIGN KEY ("workspaceId","talentAccountId") REFERENCES "talentAccounts"("workspaceId",id),
 ADD CONSTRAINT upload_machine_fk FOREIGN KEY ("workspaceId","servicePrincipalId") REFERENCES "servicePrincipals"("workspaceId",id),
 ADD CONSTRAINT upload_role_fk FOREIGN KEY ("workspaceId","personId","personRoleId") REFERENCES "personRoles"("workspaceId","personId",id),
 ADD CONSTRAINT upload_principal_xor CHECK (
 ("principalKind"='INTERNAL' AND "actorId" IS NOT NULL AND "talentAccountId" IS NULL AND "servicePrincipalId" IS NULL AND "contextKind"='INTERNAL_SOURCE' AND "sourceId" IS NOT NULL AND "sourceRevision" IS NOT NULL AND "sourceEpoch" IS NOT NULL AND "submissionId" IS NULL)
 OR ("principalKind"='TALENT' AND "actorId" IS NULL AND "talentAccountId" IS NOT NULL AND "servicePrincipalId" IS NULL AND "contextKind"='TALENT_SUBMISSION' AND "sourceId" IS NULL AND "sourceRevision" IS NULL AND "sourceEpoch" IS NULL AND "submissionId" IS NOT NULL AND "recoveryEpoch" IS NOT NULL)
 ),
 ADD CONSTRAINT upload_role_owner CHECK ("personRoleId" IS NULL OR "personId" IS NOT NULL);
-- AGENT_SUBMISSION is a reserved API type. Persistence is fail-closed until PR-04 provides a real submission owner/FK.
ALTER TABLE "talentSubmissions" ADD CONSTRAINT submission_media_owner_key UNIQUE ("workspaceId",id,"talentAccountId");
ALTER TABLE "uploads" ADD CONSTRAINT upload_submission_owner_fk FOREIGN KEY ("workspaceId","submissionId","talentAccountId") REFERENCES "talentSubmissions"("workspaceId",id,"talentAccountId");
ALTER TABLE "assets" ALTER COLUMN "sourceId" DROP NOT NULL,
 ADD COLUMN "usageState" text NOT NULL DEFAULT 'ADOPTED',
 ADD COLUMN "protectionEpoch" integer NOT NULL DEFAULT 1,
 ADD CONSTRAINT asset_usage_state CHECK ("usageState" IN ('STAGED','ADOPTED','RETIRED') AND "protectionEpoch">0),
 ADD CONSTRAINT asset_origin_usage CHECK ("sourceId" IS NULL OR "usageState"='ADOPTED' OR state='ERASED');
CREATE TABLE "personMedia" (
 id uuid PRIMARY KEY, "workspaceId" uuid NOT NULL REFERENCES "workspaces"(id),
 "createdAt" timestamptz(3) NOT NULL, "updatedAt" timestamptz(3) NOT NULL,
 revision integer NOT NULL CHECK(revision>0),
 "personId" uuid, "personRoleId" uuid, "assetId" uuid NOT NULL, "sourceId" uuid, "submissionId" uuid,
 purpose text NOT NULL CHECK(purpose='SUBMITTED_MATERIAL'),
 "usageState" text NOT NULL CHECK("usageState" IN ('STAGED','ADOPTED','RETIRED')),
 "protectionEpoch" integer NOT NULL CHECK("protectionEpoch">0),
 "retainUntil" timestamptz(3), "retiredAt" timestamptz(3), "purgedAt" timestamptz(3),
 UNIQUE("workspaceId",id), UNIQUE("workspaceId","assetId"),
 FOREIGN KEY("workspaceId","personId") REFERENCES "people"("workspaceId",id),
 FOREIGN KEY("workspaceId","personId","personRoleId") REFERENCES "personRoles"("workspaceId","personId",id),
 FOREIGN KEY("workspaceId","assetId") REFERENCES "assets"("workspaceId",id),
 FOREIGN KEY("workspaceId","sourceId") REFERENCES "sources"("workspaceId",id),
 FOREIGN KEY("workspaceId","submissionId") REFERENCES "talentSubmissions"("workspaceId",id),
 CHECK ("personRoleId" IS NULL OR "personId" IS NOT NULL),
 CHECK (("usageState"='ADOPTED' AND "sourceId" IS NOT NULL AND "personId" IS NOT NULL AND "retainUntil" IS NULL AND "retiredAt" IS NULL)
 OR ("usageState"='STAGED' AND "sourceId" IS NULL AND "submissionId" IS NOT NULL AND "retainUntil" IS NOT NULL AND "retiredAt" IS NULL)
 OR ("usageState"='RETIRED' AND "retiredAt" IS NOT NULL)),
 CHECK ("purgedAt" IS NULL OR "usageState"='RETIRED')
);
CREATE INDEX "personMedia_workspaceId_personId_usageState_idx" ON "personMedia"("workspaceId","personId","usageState");
CREATE FUNCTION media_origin_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='uploads' THEN
  IF (OLD."contextKind",OLD."principalKind",OLD."actorId",OLD."talentAccountId",OLD."servicePrincipalId",OLD."submissionId",OLD."sourceId") IS DISTINCT FROM
     (NEW."contextKind",NEW."principalKind",NEW."actorId",NEW."talentAccountId",NEW."servicePrincipalId",NEW."submissionId",NEW."sourceId") THEN RAISE EXCEPTION 'media origin immutable'; END IF;
  IF NEW.state<>'ERASED' AND (OLD."expectedHash",OLD."expectedBytes") IS DISTINCT FROM (NEW."expectedHash",NEW."expectedBytes") THEN RAISE EXCEPTION 'media bytes immutable'; END IF;
 ELSE
  IF (OLD."uploadId",OLD."sourceId") IS DISTINCT FROM (NEW."uploadId",NEW."sourceId") THEN RAISE EXCEPTION 'asset origin immutable'; END IF;
  IF NEW.state<>'ERASED' AND (OLD.sha256,OLD.bytes,OLD."objectToken") IS DISTINCT FROM (NEW.sha256,NEW.bytes,NEW."objectToken") THEN RAISE EXCEPTION 'asset bytes immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER uploads_origin_guard BEFORE UPDATE ON "uploads" FOR EACH ROW EXECUTE FUNCTION media_origin_guard();
CREATE TRIGGER assets_origin_guard BEFORE UPDATE ON "assets" FOR EACH ROW EXECUTE FUNCTION media_origin_guard();
-- A transaction must never commit half an adoption or an external asset without its owner relation.
CREATE FUNCTION media_relation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a "assets"; r "personMedia"; u "uploads";
BEGIN
 IF TG_TABLE_NAME='assets' THEN SELECT * INTO a FROM "assets" WHERE id=NEW.id;
 ELSE SELECT * INTO a FROM "assets" WHERE id=NEW."assetId"; END IF;
 IF a.id IS NULL OR a."sourceId" IS NOT NULL THEN RETURN NULL; END IF;
 SELECT * INTO r FROM "personMedia" WHERE "assetId"=a.id AND "workspaceId"=a."workspaceId";
 SELECT * INTO u FROM "uploads" WHERE id=a."uploadId";
 IF r.id IS NULL OR r."usageState"<>a."usageState" OR (r."submissionId" IS NOT NULL AND r."submissionId" IS DISTINCT FROM u."submissionId") THEN RAISE EXCEPTION 'media relation inconsistent'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER asset_relation_guard AFTER INSERT OR UPDATE ON "assets" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION media_relation_guard();
CREATE CONSTRAINT TRIGGER relation_asset_guard AFTER INSERT OR UPDATE ON "personMedia" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION media_relation_guard();
ALTER TABLE "personMedia" ADD COLUMN "importedOrigin" jsonb;
-- Asset origin source and authorized business source are intentionally different.
ALTER TABLE "usePermissions" DROP CONSTRAINT "usePermissions_subjectAssetRef_fkey";
ALTER TABLE "usePermissions" ADD CONSTRAINT "usePermissions_subjectAssetRef_fkey" FOREIGN KEY("workspaceId","subjectAssetId") REFERENCES "assets"("workspaceId",id);
ALTER TABLE "exportDependencies" DROP CONSTRAINT "exportDependencies_assetRef_fkey";
ALTER TABLE "exportDependencies" ADD CONSTRAINT "exportDependencies_assetRef_fkey" FOREIGN KEY("workspaceId","assetId") REFERENCES "assets"("workspaceId",id);
ALTER TABLE "deletionRequests" DROP CONSTRAINT "deletionRequests_targetAssetRef_fkey";
ALTER TABLE "deletionRequests" ADD CONSTRAINT "deletionRequests_targetAssetRef_fkey" FOREIGN KEY("workspaceId","targetAssetId") REFERENCES "assets"("workspaceId",id);
CREATE FUNCTION media_business_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE aid uuid; sid uuid; actual uuid;
BEGIN
 IF TG_TABLE_NAME='usePermissions' THEN aid=NEW."subjectAssetId";sid=NEW."sourceId";
 ELSIF TG_TABLE_NAME='exportDependencies' THEN aid=NEW."assetId";sid=NEW."sourceId";
 ELSE aid=NEW."targetAssetId";sid=NEW."targetSourceId"; END IF;
 IF aid IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME='usePermissions' THEN IF (NEW."subjectAssetId",NEW."sourceId") IS NOT DISTINCT FROM (OLD."subjectAssetId",OLD."sourceId") THEN RETURN NEW; END IF; END IF;
  IF TG_TABLE_NAME='exportDependencies' THEN IF (NEW."assetId",NEW."sourceId") IS NOT DISTINCT FROM (OLD."assetId",OLD."sourceId") THEN RETURN NEW; END IF; END IF;
  IF TG_TABLE_NAME='deletionRequests' THEN IF (NEW."targetAssetId",NEW."targetSourceId") IS NOT DISTINCT FROM (OLD."targetAssetId",OLD."targetSourceId") THEN RETURN NEW; END IF; END IF;
 END IF;
 SELECT COALESCE(r."sourceId",a."sourceId") INTO actual FROM "assets" a LEFT JOIN "personMedia" r ON r."workspaceId"=a."workspaceId" AND r."assetId"=a.id AND r."usageState"='ADOPTED'
 WHERE a.id=aid AND a."workspaceId"=NEW."workspaceId" AND a."usageState"='ADOPTED';
 IF actual IS NULL OR sid IS DISTINCT FROM actual THEN RAISE EXCEPTION 'media business source mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER permission_media_source_guard BEFORE INSERT OR UPDATE ON "usePermissions" FOR EACH ROW EXECUTE FUNCTION media_business_source_guard();
CREATE TRIGGER export_media_source_guard BEFORE INSERT OR UPDATE ON "exportDependencies" FOR EACH ROW EXECUTE FUNCTION media_business_source_guard();
CREATE TRIGGER deletion_media_source_guard BEFORE INSERT OR UPDATE ON "deletionRequests" FOR EACH ROW EXECUTE FUNCTION media_business_source_guard();
CREATE FUNCTION media_submission_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='MEDIA' AND NOT EXISTS(SELECT 1 FROM "talentSubmissions" s WHERE s.id=NEW."submissionId" AND s."workspaceId"=NEW."workspaceId" AND s.state='DRAFT') THEN RAISE EXCEPTION 'submission frozen'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER media_submission_insert_guard BEFORE INSERT ON "talentSubmissionItems" FOR EACH ROW EXECUTE FUNCTION media_submission_insert_guard();
