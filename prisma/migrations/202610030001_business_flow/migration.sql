-- Forward-only business-flow repair. Existing batches retain their original interpretation.
ALTER TABLE "imports" ADD COLUMN "formatVersion" integer NOT NULL DEFAULT 1;
ALTER TABLE "imports" ADD CONSTRAINT "imports_format_version_check" CHECK ("formatVersion" IN (1,2));
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_type_check";
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_type_check" CHECK ("type" IN ('IMPORT_PEOPLE','IMPORT_TALENTS_V2'));

-- A stale v1 worker must not acknowledge a v2 row after writing only legacy scalars.
-- Each row's typed records and checkpoint are already in the same transaction.
CREATE FUNCTION once_check_import_v2_checkpoint() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item jsonb; person_id uuid; role_code text;
BEGIN
  IF NEW."formatVersion" <> 2 THEN RETURN NEW; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW."rows") LOOP
    IF item->>'state' <> 'IMPORTED' THEN CONTINUE; END IF;
    person_id := (item->>'personId')::uuid;
    IF NOT EXISTS (SELECT 1 FROM people WHERE id=person_id AND "workspaceId"=NEW."workspaceId" AND "sourceId"=NEW."sourceId") THEN
      RAISE EXCEPTION 'IMPORT_V2_CHECKPOINT_INVALID' USING ERRCODE='23514';
    END IF;
    IF item->>'kind'='TALENT' THEN
      IF NOT EXISTS (SELECT 1 FROM "talentProfiles" WHERE "personId"=person_id AND "workspaceId"=NEW."workspaceId" AND status='ACTIVE') THEN
        RAISE EXCEPTION 'IMPORT_V2_PROFILE_REQUIRED' USING ERRCODE='23514';
      END IF;
      FOR role_code IN SELECT jsonb_array_elements_text(item->'roles') LOOP
        IF NOT EXISTS (SELECT 1 FROM "personRoles" WHERE "personId"=person_id AND "workspaceId"=NEW."workspaceId" AND "roleCode"=role_code AND status='ACTIVE') THEN
          RAISE EXCEPTION 'IMPORT_V2_ROLE_REQUIRED' USING ERRCODE='23514';
        END IF;
      END LOOP;
      IF item->>'cityCode' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "talentLocations" WHERE "personId"=person_id AND "workspaceId"=NEW."workspaceId" AND "locationCode"=item->>'cityCode' AND "relationCode"='BASE' AND status='ACTIVE') THEN
        RAISE EXCEPTION 'IMPORT_V2_LOCATION_REQUIRED' USING ERRCODE='23514';
      END IF;
    ELSIF item->>'kind' IS DISTINCT FROM 'CONTACT' THEN
      RAISE EXCEPTION 'IMPORT_V2_KIND_REQUIRED' USING ERRCODE='23514';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER imports_v2_checkpoint BEFORE INSERT OR UPDATE OF "rows", "formatVersion" ON imports
FOR EACH ROW EXECUTE FUNCTION once_check_import_v2_checkpoint();

CREATE TABLE "sourceReviews" (
  "id" uuid NOT NULL PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "revision" integer NOT NULL,
  "personId" uuid NOT NULL,
  "sourceId" uuid NOT NULL,
  "senderId" uuid NOT NULL,
  "reviewerId" uuid NOT NULL,
  "publisherId" uuid NOT NULL,
  "targetScopeId" uuid NOT NULL,
  "personScopeId" uuid NOT NULL,
  "sourceScopeId" uuid NOT NULL,
  "senderRevision" integer NOT NULL,
  "reviewerRevision" integer NOT NULL,
  "publisherRevision" integer NOT NULL,
  "targetScopeRevision" integer NOT NULL,
  "personRevision" integer NOT NULL,
  "sourceRevision" integer NOT NULL,
  "personEpoch" integer NOT NULL,
  "sourceEpoch" integer NOT NULL,
  "personScopeRevision" integer NOT NULL,
  "sourceScopeRevision" integer NOT NULL,
  "recoveryEpoch" text NOT NULL,
  "expiresAt" timestamptz(3) NOT NULL,
  "state" text NOT NULL,
  CONSTRAINT "sourceReviews_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "sourceReviews_personId_fkey" FOREIGN KEY ("workspaceId", "personId") REFERENCES "people" ("workspaceId", "id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "sourceReviews_sourceId_fkey" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources" ("workspaceId", "id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "sourceReviews_senderId_fkey" FOREIGN KEY ("workspaceId", "senderId") REFERENCES "memberships" ("workspaceId", "id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "sourceReviews_reviewerId_fkey" FOREIGN KEY ("workspaceId", "reviewerId") REFERENCES "memberships" ("workspaceId", "id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "sourceReviews_publisherId_fkey" FOREIGN KEY ("workspaceId", "publisherId") REFERENCES "memberships" ("workspaceId", "id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "sourceReviews_targetScopeId_fkey" FOREIGN KEY ("workspaceId", "targetScopeId") REFERENCES "scopes" ("workspaceId", "id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "sourceReviews_personScopeId_fkey" FOREIGN KEY ("workspaceId", "personScopeId") REFERENCES "scopes" ("workspaceId", "id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "sourceReviews_sourceScopeId_fkey" FOREIGN KEY ("workspaceId", "sourceScopeId") REFERENCES "scopes" ("workspaceId", "id") ON UPDATE CASCADE ON DELETE RESTRICT,
  UNIQUE ("workspaceId","id"),
  CHECK ("state" IN ('PENDING','ACCEPTED','REVIEWED','PUBLISHED','DECLINED','REVOKED')),
  CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + interval '7 days'),
  CHECK ("revision">0 AND "personRevision">0 AND "sourceRevision">0 AND "personEpoch">0 AND "sourceEpoch">0
    AND "senderRevision">0 AND "reviewerRevision">0 AND "publisherRevision">0
    AND "targetScopeRevision">0 AND "personScopeRevision">0 AND "sourceScopeRevision">0)
);
CREATE INDEX "sourceReviews_workspaceId_reviewerId_state_idx" ON "sourceReviews" ("workspaceId","reviewerId","state");
CREATE INDEX "sourceReviews_workspaceId_senderId_createdAt_idx" ON "sourceReviews" ("workspaceId","senderId","createdAt");
