-- 73: real MACHINE media on the existing upload/asset/relation engine. 1–72 frozen.
ALTER TABLE "uploads" ADD COLUMN "servicePrincipalAuthorizationEpoch" integer,
 ADD COLUMN "clientItemKey" text, ADD COLUMN "roleCandidateKey" text,
 ADD COLUMN "receiveAuthorizationHash" text, ADD COLUMN "receiveAuthorizationUntil" timestamptz(3);
ALTER TABLE "uploads" DROP CONSTRAINT upload_principal_xor;
ALTER TABLE "uploads" ADD CONSTRAINT upload_principal_xor CHECK ((
 ("principalKind"='INTERNAL' AND "actorId" IS NOT NULL AND "talentAccountId" IS NULL AND "servicePrincipalId" IS NULL AND "contextKind"='INTERNAL_SOURCE' AND "sourceId" IS NOT NULL AND "sourceRevision" IS NOT NULL AND "sourceEpoch" IS NOT NULL AND "submissionId" IS NULL)
 OR ("principalKind"='TALENT' AND "actorId" IS NULL AND "talentAccountId" IS NOT NULL AND "servicePrincipalId" IS NULL AND "contextKind"='TALENT_SUBMISSION' AND "sourceId" IS NULL AND "sourceRevision" IS NULL AND "sourceEpoch" IS NULL AND "submissionId" IS NOT NULL AND "recoveryEpoch" IS NOT NULL)
 OR ("principalKind"='MACHINE' AND "actorId" IS NULL AND "talentAccountId" IS NULL AND "servicePrincipalId" IS NOT NULL AND "contextKind"='AGENT_SUBMISSION' AND "submissionId" IS NOT NULL AND "sourceId" IS NULL AND "sourceRevision" IS NULL AND "sourceEpoch" IS NULL AND "personId" IS NULL AND "personRoleId" IS NULL AND "personEpoch" IS NULL AND "personScopeId" IS NULL AND "personScopeRevision" IS NULL AND "grantEpoch" IS NULL AND "recoveryEpoch" IS NOT NULL AND "servicePrincipalAuthorizationEpoch">=1 AND "actorEpoch"="servicePrincipalAuthorizationEpoch" AND length("clientItemKey") BETWEEN 1 AND 100 AND "clientItemKey" ~ '^[a-zA-Z0-9_-]+$')
) IS TRUE), ADD CONSTRAINT upload_agent_submission_owner_fk FOREIGN KEY ("workspaceId","submissionId","servicePrincipalId") REFERENCES "talentSubmissions"("workspaceId",id,"servicePrincipalId"),
 ADD CONSTRAINT upload_agent_fields CHECK ((CASE WHEN "principalKind"='MACHINE' THEN
  ("roleCandidateKey" IS NULL OR length("roleCandidateKey") BETWEEN 1 AND 100 AND "roleCandidateKey" ~ '^[a-zA-Z0-9_-]+$')
  AND (("receiveAuthorizationHash" IS NULL AND "receiveAuthorizationUntil" IS NULL) OR ("receiveAuthorizationHash" IS NOT NULL AND length("receiveAuthorizationHash")=64 AND "receiveAuthorizationHash" ~ '^[a-f0-9]{64}$' AND "receiveAuthorizationUntil" IS NOT NULL))
 ELSE "servicePrincipalAuthorizationEpoch" IS NULL AND "clientItemKey" IS NULL AND "roleCandidateKey" IS NULL AND "receiveAuthorizationHash" IS NULL AND "receiveAuthorizationUntil" IS NULL END) IS TRUE);
CREATE UNIQUE INDEX upload_agent_item_key ON "uploads"("workspaceId","submissionId","clientItemKey") WHERE "principalKind"='MACHINE';
CREATE INDEX upload_agent_budget ON "uploads"("workspaceId","servicePrincipalId",state);

ALTER TABLE "servicePrincipals" DROP CONSTRAINT "servicePrincipals_td2_permissions";
ALTER TABLE "servicePrincipals" ADD CONSTRAINT "servicePrincipals_td2_permissions" CHECK ((cardinality("permissionCodes") BETWEEN 1 AND 9 AND
 ("permissionCodes" <@ ARRAY['records.read','sources.read','talent.propose','talent.fact.write']::text[] OR
 "permissionCodes" <@ ARRAY['ingestion.schema.read','ingestion.submit','ingestion.read.own','ingestion.withdraw.own','ingestion.media.upload']::text[])) IS TRUE);

CREATE FUNCTION agent_upload_origin_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s "talentSubmissions";
BEGIN
 IF NEW."principalKind"<>'MACHINE' THEN RETURN NEW; END IF;
 SELECT * INTO s FROM "talentSubmissions" WHERE id=NEW."submissionId" AND "workspaceId"=NEW."workspaceId";
 IF TG_OP='INSERT' THEN
  IF s."principalKind" IS DISTINCT FROM 'MACHINE' OR s.state<>'DRAFT' OR s."servicePrincipalId" IS DISTINCT FROM NEW."servicePrincipalId" OR s."servicePrincipalAuthorizationEpoch" IS DISTINCT FROM NEW."servicePrincipalAuthorizationEpoch" OR s."scopeId" IS DISTINCT FROM NEW."scopeId" OR s."intakeScopeRevision" IS DISTINCT FROM NEW."scopeRevision" OR s."recoveryEpoch" IS DISTINCT FROM NEW."recoveryEpoch" THEN RAISE EXCEPTION 'machine upload authorization snapshot invalid' USING ERRCODE='23514'; END IF;
  IF NEW."roleCandidateKey" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "talentSubmissionItems" i WHERE i."submissionId"=s.id AND i."workspaceId"=s."workspaceId" AND i."clientItemKey"=NEW."roleCandidateKey" AND i.kind='ROLE') THEN RAISE EXCEPTION 'machine role candidate missing' USING ERRCODE='23514'; END IF;
 ELSE
  IF (NEW."servicePrincipalAuthorizationEpoch",NEW."clientItemKey",NEW."roleCandidateKey",NEW."recoveryEpoch",NEW."scopeId",NEW."scopeRevision",NEW."actorEpoch",NEW."actorRevision") IS DISTINCT FROM (OLD."servicePrincipalAuthorizationEpoch",OLD."clientItemKey",OLD."roleCandidateKey",OLD."recoveryEpoch",OLD."scopeId",OLD."scopeRevision",OLD."actorEpoch",OLD."actorRevision") THEN RAISE EXCEPTION 'machine upload origin immutable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER agent_upload_origin_guard BEFORE INSERT OR UPDATE ON "uploads" FOR EACH ROW EXECUTE FUNCTION agent_upload_origin_guard();

CREATE FUNCTION agent_media_relation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a "assets"; r "personMedia"; u "uploads"; s "talentSubmissions";
BEGIN
 IF TG_TABLE_NAME='assets' THEN SELECT * INTO a FROM "assets" WHERE id=NEW.id;
 ELSE SELECT * INTO a FROM "assets" WHERE id=NEW."assetId"; END IF;
 SELECT * INTO u FROM "uploads" WHERE id=a."uploadId";
 IF u."principalKind" IS DISTINCT FROM 'MACHINE' THEN RETURN NULL; END IF;
 SELECT * INTO s FROM "talentSubmissions" WHERE id=u."submissionId";
 SELECT * INTO r FROM "personMedia" WHERE "assetId"=a.id AND "workspaceId"=a."workspaceId";
 IF a."personId" IS NOT NULL OR a."sourceId" IS NOT NULL OR r.id IS NULL OR r."submissionId" IS DISTINCT FROM s.id THEN RAISE EXCEPTION 'machine asset origin invalid' USING ERRCODE='23514'; END IF;
 IF r."usageState"='STAGED' AND (r."personId" IS NOT NULL OR r."personRoleId" IS NOT NULL OR r."sourceId" IS NOT NULL) THEN RAISE EXCEPTION 'machine staged media cannot bind person' USING ERRCODE='23514'; END IF;
 IF r."usageState"='ADOPTED' AND (s.state NOT IN ('APPROVED','PARTIALLY_APPROVED') OR (TG_OP='INSERT' OR OLD."usageState"<>'ADOPTED') AND s."personId" IS DISTINCT FROM r."personId" OR NOT EXISTS(
  SELECT 1 FROM "sourceAttributions" t JOIN "sourceUseBases" b ON b."sourceAttributionId"=t.id AND b."sourceId"=t."sourceId"
  WHERE t."workspaceId"=a."workspaceId" AND t."sourceId"=r."sourceId" AND t."submissionId"=s.id AND t."servicePrincipalId"=u."servicePrincipalId" AND t."principalKind"='MACHINE' AND b."basisKind"='INTERNAL_REVIEW' AND 'media'=ANY(b."fieldScope")
 )) THEN RAISE EXCEPTION 'machine adoption requires real reviewed formal source' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER agent_asset_relation_guard AFTER INSERT OR UPDATE ON "assets" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION agent_media_relation_guard();
CREATE CONSTRAINT TRIGGER agent_relation_asset_guard AFTER INSERT OR UPDATE ON "personMedia" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION agent_media_relation_guard();
