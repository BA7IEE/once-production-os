-- Forward 82: immutable client-purpose snapshots and dedicated named guest identity.
BEGIN;
CREATE TABLE "clientPresentations" (
 id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL REFERENCES workspaces(id),"createdAt" timestamptz(3) NOT NULL,"updatedAt" timestamptz(3) NOT NULL,revision integer NOT NULL CHECK(revision>0),"scopeId" uuid NOT NULL,"maintainerId" uuid NOT NULL,state text NOT NULL CHECK(state IN ('ACTIVE','REVOKED')),
 UNIQUE("workspaceId",id),FOREIGN KEY("workspaceId",id) REFERENCES shortlists("workspaceId",id),FOREIGN KEY("workspaceId","scopeId") REFERENCES scopes("workspaceId",id),FOREIGN KEY("workspaceId","maintainerId") REFERENCES memberships("workspaceId",id)
);
CREATE TABLE "clientVersions" (
 id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL REFERENCES workspaces(id),"createdAt" timestamptz(3) NOT NULL,"updatedAt" timestamptz(3) NOT NULL,revision integer NOT NULL CHECK(revision>0),"presentationId" uuid NOT NULL,"versionNumber" integer NOT NULL CHECK("versionNumber">0),"publisherId" uuid NOT NULL,"publisherUserEpoch" integer NOT NULL CHECK("publisherUserEpoch">0),"recoveryEpoch" text NOT NULL,"expiresAt" timestamptz(3) NOT NULL,state text NOT NULL CHECK(state IN ('PUBLISHED','REVOKED','ERASED')),
 "approvalSourceId" uuid NOT NULL,"approvalSourceRevision" integer NOT NULL CHECK("approvalSourceRevision">0),"approvedAt" timestamptz(3) NOT NULL,"contentCiphertext" text,"manifestDigest" text NOT NULL CHECK("manifestDigest" ~ '^[a-f0-9]{64}$'),dependencies jsonb NOT NULL,"entryIds" uuid[] NOT NULL CHECK(cardinality("entryIds") BETWEEN 1 AND 20),"personIds" uuid[] NOT NULL,"sourceIds" uuid[] NOT NULL,"workIds" uuid[] NOT NULL,"projectIds" uuid[] NOT NULL,"assetIds" uuid[] NOT NULL,
 UNIQUE("workspaceId",id),UNIQUE("workspaceId","presentationId","versionNumber"),FOREIGN KEY("workspaceId","presentationId") REFERENCES "clientPresentations"("workspaceId",id),FOREIGN KEY("workspaceId","publisherId") REFERENCES memberships("workspaceId",id),FOREIGN KEY("workspaceId","approvalSourceId") REFERENCES sources("workspaceId",id),
 CHECK((state='ERASED')=("contentCiphertext" IS NULL)),CHECK(octet_length("contentCiphertext")<=500000),CHECK(jsonb_typeof(dependencies)='object'),CHECK(cardinality("personIds")<=20 AND cardinality("assetIds")<=240 AND cardinality("sourceIds")<=1000)
);
CREATE TABLE "clientRecipients" (
 id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL REFERENCES workspaces(id),"createdAt" timestamptz(3) NOT NULL,"updatedAt" timestamptz(3) NOT NULL,revision integer NOT NULL CHECK(revision>0),"versionId" uuid NOT NULL,"createdById" uuid NOT NULL,"labelCiphertext" text,"tokenHash" text,"tokenVersion" integer NOT NULL CHECK("tokenVersion">0),"recoveryEpoch" text NOT NULL,"expiresAt" timestamptz(3) NOT NULL,state text NOT NULL CHECK(state IN ('ACTIVE','REVOKED')),
 UNIQUE("workspaceId",id),UNIQUE("workspaceId",id,"versionId"),FOREIGN KEY("workspaceId","versionId") REFERENCES "clientVersions"("workspaceId",id),FOREIGN KEY("workspaceId","createdById") REFERENCES memberships("workspaceId",id),CHECK(state<>'ACTIVE' OR "tokenHash" ~ '^[a-f0-9]{64}$' AND "labelCiphertext" IS NOT NULL),CHECK(state='ACTIVE' OR "tokenHash" IS NULL)
);
CREATE INDEX "clientRecipients_workspaceId_versionId_idx" ON "clientRecipients"("workspaceId","versionId");
CREATE TABLE "clientGuestSessions" (
 id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL REFERENCES workspaces(id),"createdAt" timestamptz(3) NOT NULL,"updatedAt" timestamptz(3) NOT NULL,revision integer NOT NULL CHECK(revision>0),"recipientId" uuid NOT NULL,"versionId" uuid NOT NULL,"tokenHash" text NOT NULL CHECK("tokenHash" ~ '^[a-f0-9]{64}$'),"tokenVersion" integer NOT NULL CHECK("tokenVersion">0),"recoveryEpoch" text NOT NULL,"expiresAt" timestamptz(3) NOT NULL,"revokedAt" timestamptz(3),
 UNIQUE("workspaceId",id),UNIQUE("workspaceId",id,"recipientId","versionId"),FOREIGN KEY("workspaceId","recipientId","versionId") REFERENCES "clientRecipients"("workspaceId",id,"versionId")
);
CREATE INDEX "clientGuestSessions_workspaceId_recipientId_idx" ON "clientGuestSessions"("workspaceId","recipientId");
CREATE TABLE "clientFeedback" (
 id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL REFERENCES workspaces(id),"createdAt" timestamptz(3) NOT NULL,"updatedAt" timestamptz(3) NOT NULL,revision integer NOT NULL CHECK(revision>0),"recipientId" uuid NOT NULL,"versionId" uuid NOT NULL,"guestSessionId" uuid NOT NULL,"entryId" uuid NOT NULL,"commandKey" text NOT NULL CHECK(length("commandKey") BETWEEN 8 AND 128),"sequenceNumber" integer NOT NULL CHECK("sequenceNumber">0),"requestDigest" text NOT NULL CHECK("requestDigest" ~ '^[a-f0-9]{64}$'),choice text NOT NULL CHECK(choice IN ('INTERESTED','PENDING','PASS')),"noteCiphertext" text,state text NOT NULL CHECK(state IN ('ACTIVE','ERASED')),
 UNIQUE("workspaceId",id),UNIQUE("workspaceId","recipientId","commandKey"),FOREIGN KEY("workspaceId","recipientId","versionId") REFERENCES "clientRecipients"("workspaceId",id,"versionId"),FOREIGN KEY("workspaceId","guestSessionId","recipientId","versionId") REFERENCES "clientGuestSessions"("workspaceId",id,"recipientId","versionId"),CHECK(state<>'ERASED' OR "noteCiphertext" IS NULL)
);
CREATE INDEX "clientFeedback_workspaceId_versionId_entryId_idx" ON "clientFeedback"("workspaceId","versionId","entryId");
CREATE FUNCTION once_client_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CLIENT_VERSION_IMMUTABLE'; END IF;
 IF (to_jsonb(NEW)-ARRAY['revision','updatedAt','state','contentCiphertext']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','updatedAt','state','contentCiphertext']) THEN RAISE EXCEPTION 'CLIENT_VERSION_IMMUTABLE'; END IF;
 IF NEW.state='ERASED' THEN
  IF OLD.state='ERASED' OR NEW."contentCiphertext" IS NOT NULL OR NOT EXISTS(SELECT 1 FROM "deletionItems" i JOIN "deletionRequests" r ON r.id=i."requestId" AND r."workspaceId"=i."workspaceId" WHERE i."workspaceId"=NEW."workspaceId" AND i."resourceId"=NEW.id AND i."resourceKind"='clientVersion' AND i."resolvedAction"='ERASE_PAYLOAD' AND i.decision='APPLY_PROPOSED' AND r.state='CLEANING' AND r."planDigest" IS NOT NULL) THEN RAISE EXCEPTION 'CLIENT_VERSION_ERASURE_PLAN_REQUIRED'; END IF;
 ELSE
  IF NEW."contentCiphertext" IS DISTINCT FROM OLD."contentCiphertext" OR OLD.state<>'PUBLISHED' OR NEW.state<>'REVOKED' THEN RAISE EXCEPTION 'CLIENT_VERSION_IMMUTABLE'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER client_version_immutable BEFORE UPDATE OR DELETE ON "clientVersions" FOR EACH ROW EXECUTE FUNCTION once_client_version_immutable();
CREATE FUNCTION once_client_feedback_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR NEW.state<>'ERASED' OR OLD.state<>'ACTIVE' OR NEW."noteCiphertext" IS NOT NULL OR (to_jsonb(NEW)-ARRAY['revision','updatedAt','state','noteCiphertext']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','updatedAt','state','noteCiphertext']) OR NOT EXISTS(SELECT 1 FROM "deletionItems" i JOIN "deletionRequests" r ON r.id=i."requestId" WHERE i."workspaceId"=NEW."workspaceId" AND i."resourceKind"='clientVersion' AND i."resourceId"=NEW."versionId" AND i."resolvedAction"='ERASE_PAYLOAD' AND r.state='CLEANING' AND r."planDigest" IS NOT NULL) THEN RAISE EXCEPTION 'CLIENT_FEEDBACK_IMMUTABLE'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER client_feedback_immutable BEFORE UPDATE OR DELETE ON "clientFeedback" FOR EACH ROW EXECUTE FUNCTION once_client_feedback_immutable();
CREATE FUNCTION once_client_feedback_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "clientVersions" v WHERE v.id=NEW."versionId" AND v."workspaceId"=NEW."workspaceId" AND NEW."entryId"=ANY(v."entryIds") AND v.state='PUBLISHED') THEN RAISE EXCEPTION 'CLIENT_FEEDBACK_ENTRY_INVALID'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER client_feedback_entry BEFORE INSERT ON "clientFeedback" FOR EACH ROW EXECUTE FUNCTION once_client_feedback_entry();
COMMIT;
