-- Forward 83. Independent public purpose, owner-bound encrypted drafts and immutable versions.
BEGIN;
ALTER TABLE "talentAccessGrants" ADD CONSTRAINT homepage_grant_owner_key UNIQUE("workspaceId",id,"personId","talentAccountId");
CREATE TABLE "professionalHomepages" (
 id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL REFERENCES workspaces(id),"createdAt" timestamptz(3) NOT NULL,"updatedAt" timestamptz(3) NOT NULL,revision integer NOT NULL CHECK(revision>0),
 "personId" uuid NOT NULL,"talentAccountId" uuid NOT NULL,"grantId" uuid NOT NULL,slug text NOT NULL UNIQUE CHECK(slug ~ '^[A-Za-z0-9_-]{24}$'),state text NOT NULL CHECK(state IN ('DRAFT','PUBLISHED','UNPUBLISHED','ERASED')),
 "draftCiphertext" text,"currentVersionId" uuid,"sourceIds" uuid[] NOT NULL,"workIds" uuid[] NOT NULL,"assetIds" uuid[] NOT NULL,
 UNIQUE("workspaceId",id),UNIQUE("workspaceId","personId"),UNIQUE("workspaceId",id,"talentAccountId"),
 FOREIGN KEY("workspaceId","personId") REFERENCES people("workspaceId",id),
 FOREIGN KEY("workspaceId","talentAccountId") REFERENCES "talentAccounts"("workspaceId",id),
 FOREIGN KEY("workspaceId","grantId") REFERENCES "talentAccessGrants"("workspaceId",id),
 FOREIGN KEY("workspaceId","grantId","personId","talentAccountId") REFERENCES "talentAccessGrants"("workspaceId",id,"personId","talentAccountId"),
 CHECK((state='ERASED')=("draftCiphertext" IS NULL)),CHECK((state='PUBLISHED')=("currentVersionId" IS NOT NULL)),CHECK(octet_length("draftCiphertext")<=500000)
);
CREATE TABLE "homepageVersions" (
 id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL REFERENCES workspaces(id),"createdAt" timestamptz(3) NOT NULL,"updatedAt" timestamptz(3) NOT NULL,revision integer NOT NULL CHECK(revision>0),
 "homepageId" uuid NOT NULL,"versionNumber" integer NOT NULL CHECK("versionNumber">0),"talentAccountId" uuid NOT NULL,"sessionEpoch" integer NOT NULL CHECK("sessionEpoch">0),"recoveryEpoch" text NOT NULL,"consentId" uuid NOT NULL,"expiresAt" timestamptz(3) NOT NULL,
 state text NOT NULL CHECK(state IN ('PUBLISHED','REVOKED','ERASED')),"contentCiphertext" text,"contentDigest" text NOT NULL CHECK("contentDigest" ~ '^[a-f0-9]{64}$'),dependencies jsonb NOT NULL CHECK(jsonb_typeof(dependencies)='object'),
 UNIQUE("workspaceId",id),UNIQUE("workspaceId","homepageId",id),UNIQUE("workspaceId","homepageId","versionNumber"),
 FOREIGN KEY("workspaceId","homepageId") REFERENCES "professionalHomepages"("workspaceId",id),
 FOREIGN KEY("workspaceId","homepageId","talentAccountId") REFERENCES "professionalHomepages"("workspaceId",id,"talentAccountId"),
 FOREIGN KEY("workspaceId","talentAccountId") REFERENCES "talentAccounts"("workspaceId",id),
 FOREIGN KEY("workspaceId","consentId") REFERENCES "talentConsents"("workspaceId",id),
 CHECK((state='ERASED')=("contentCiphertext" IS NULL)),CHECK(octet_length("contentCiphertext")<=500000)
);
ALTER TABLE "professionalHomepages" ADD CONSTRAINT homepage_current_version_fk FOREIGN KEY("workspaceId",id,"currentVersionId") REFERENCES "homepageVersions"("workspaceId","homepageId",id);
CREATE FUNCTION once_homepage_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['revision','updatedAt','state','contentCiphertext']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','updatedAt','state','contentCiphertext']) THEN RAISE EXCEPTION 'HOMEPAGE_VERSION_IMMUTABLE'; END IF;
 IF NEW.state='ERASED' THEN
  IF OLD.state='ERASED' OR NEW."contentCiphertext" IS NOT NULL OR NOT EXISTS(SELECT 1 FROM "deletionItems" i JOIN "deletionRequests" r ON r.id=i."requestId" AND r."workspaceId"=i."workspaceId" WHERE i."workspaceId"=NEW."workspaceId" AND i."resourceId"=NEW."homepageId" AND i."resourceKind"='professionalHomepage' AND i."resolvedAction"='ERASE_PAYLOAD' AND i.decision='APPLY_PROPOSED' AND r.state='CLEANING' AND r."planDigest" IS NOT NULL) THEN RAISE EXCEPTION 'HOMEPAGE_ERASURE_PLAN_REQUIRED'; END IF;
 ELSE
  IF NEW."contentCiphertext" IS DISTINCT FROM OLD."contentCiphertext" OR OLD.state<>'PUBLISHED' OR NEW.state<>'REVOKED' THEN RAISE EXCEPTION 'HOMEPAGE_VERSION_IMMUTABLE'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER homepage_version_immutable BEFORE UPDATE OR DELETE ON "homepageVersions" FOR EACH ROW EXECUTE FUNCTION once_homepage_version_immutable();
CREATE FUNCTION once_homepage_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.state='ERASED' OR (to_jsonb(NEW)-ARRAY['revision','updatedAt','state','draftCiphertext','currentVersionId','sourceIds','workIds','assetIds']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','updatedAt','state','draftCiphertext','currentVersionId','sourceIds','workIds','assetIds']) THEN RAISE EXCEPTION 'HOMEPAGE_IDENTITY_IMMUTABLE'; END IF;
 IF NEW.state='ERASED' AND NOT EXISTS(SELECT 1 FROM "deletionItems" i JOIN "deletionRequests" r ON r.id=i."requestId" AND r."workspaceId"=i."workspaceId" WHERE i."workspaceId"=NEW."workspaceId" AND i."resourceId"=NEW.id AND i."resourceKind"='professionalHomepage' AND i."resolvedAction"='ERASE_PAYLOAD' AND i.decision='APPLY_PROPOSED' AND r.state='CLEANING' AND r."planDigest" IS NOT NULL) THEN RAISE EXCEPTION 'HOMEPAGE_ERASURE_PLAN_REQUIRED'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER homepage_identity_immutable BEFORE UPDATE OR DELETE ON "professionalHomepages" FOR EACH ROW EXECUTE FUNCTION once_homepage_identity_immutable();
COMMIT;
