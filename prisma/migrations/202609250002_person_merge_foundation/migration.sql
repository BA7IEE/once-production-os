-- DEV-07G controlled Person merge foundation. No automatic merge.
BEGIN;

ALTER TABLE "memberships" DROP CONSTRAINT "memberships_extraPermissions_check";
ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_extraPermissions_check"
  CHECK ("extraPermissions" <@ ARRAY['sensitive.read','sensitive.write','data.export','data.delete','data.merge']::text[]);

CREATE TABLE "personMerges" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "actorId" UUID NOT NULL,
  "canonicalPersonId" UUID NOT NULL,
  "duplicatePersonId" UUID NOT NULL,
  "canonicalRevisionBefore" INTEGER NOT NULL,
  "duplicateRevisionBefore" INTEGER NOT NULL,
  "canonicalRevisionAfter" INTEGER NOT NULL,
  "canonicalSourceId" UUID NOT NULL,
  "duplicateSourceId" UUID NOT NULL,
  "canonicalSourceRevision" INTEGER NOT NULL,
  "duplicateSourceRevision" INTEGER NOT NULL,
  "canonicalSourceEpoch" INTEGER NOT NULL,
  "duplicateSourceEpoch" INTEGER NOT NULL,
  "previewDigest" TEXT NOT NULL,
  "decisionManifest" JSONB NOT NULL,
  "revokedHandoffCount" INTEGER NOT NULL,
  "revokedUsePermissionCount" INTEGER NOT NULL,
  "detachedMediaCount" INTEGER NOT NULL,
  "resultDigest" TEXT NOT NULL,
  "completedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "personMerges_dev07g_check_0" CHECK ("revision">0 AND "canonicalRevisionBefore">0 AND "duplicateRevisionBefore">0 AND "canonicalRevisionAfter">0),
  CONSTRAINT "personMerges_dev07g_check_1" CHECK ("canonicalPersonId"<>"duplicatePersonId"),
  CONSTRAINT "personMerges_dev07g_check_2" CHECK ("canonicalSourceRevision">0 AND "duplicateSourceRevision">0 AND "canonicalSourceEpoch">0 AND "duplicateSourceEpoch">0),
  CONSTRAINT "personMerges_dev07g_check_3" CHECK ("previewDigest" ~ '^[0-9a-f]{64}$' AND "resultDigest" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "personMerges_dev07g_check_4" CHECK ("revokedHandoffCount">=0 AND "revokedUsePermissionCount">=0 AND "detachedMediaCount">=0)
);
ALTER TABLE "personMerges" ADD CONSTRAINT "personMerges_workspaceId_id_key" UNIQUE ("workspaceId","id");
ALTER TABLE "personMerges" ADD CONSTRAINT "personMerges_duplicate_once_key" UNIQUE ("workspaceId","duplicatePersonId");
CREATE INDEX "personMerges_canonical_idx" ON "personMerges" ("workspaceId","canonicalPersonId","completedAt");

CREATE TABLE "personAliases" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "oldPersonId" UUID NOT NULL,
  "canonicalPersonId" UUID NOT NULL,
  "mergeDecisionId" UUID NOT NULL,
  CONSTRAINT "personAliases_dev07g_check_0" CHECK ("revision">0),
  CONSTRAINT "personAliases_dev07g_check_1" CHECK ("oldPersonId"<>"canonicalPersonId")
);
ALTER TABLE "personAliases" ADD CONSTRAINT "personAliases_workspaceId_id_key" UNIQUE ("workspaceId","id");
ALTER TABLE "personAliases" ADD CONSTRAINT "personAliases_oldPersonId_key" UNIQUE ("workspaceId","oldPersonId");
ALTER TABLE "personAliases" ADD CONSTRAINT "personAliases_mergeDecisionId_key" UNIQUE ("workspaceId","mergeDecisionId");
CREATE INDEX "personAliases_canonical_idx" ON "personAliases" ("workspaceId","canonicalPersonId");

ALTER TABLE "personMerges" ADD CONSTRAINT "personMerges_workspace_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personMerges" ADD CONSTRAINT "personMerges_actorIdRef_fkey"
  FOREIGN KEY ("workspaceId","actorId") REFERENCES "memberships"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personMerges" ADD CONSTRAINT "personMerges_canonicalPersonRef_fkey"
  FOREIGN KEY ("workspaceId","canonicalPersonId") REFERENCES "people"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personMerges" ADD CONSTRAINT "personMerges_duplicatePersonRef_fkey"
  FOREIGN KEY ("workspaceId","duplicatePersonId") REFERENCES "people"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personMerges" ADD CONSTRAINT "personMerges_canonicalSourceRef_fkey"
  FOREIGN KEY ("workspaceId","canonicalSourceId") REFERENCES "sources"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personMerges" ADD CONSTRAINT "personMerges_duplicateSourceRef_fkey"
  FOREIGN KEY ("workspaceId","duplicateSourceId") REFERENCES "sources"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "personAliases" ADD CONSTRAINT "personAliases_workspace_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personAliases" ADD CONSTRAINT "personAliases_oldPersonRef_fkey"
  FOREIGN KEY ("workspaceId","oldPersonId") REFERENCES "people"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personAliases" ADD CONSTRAINT "personAliases_canonicalPersonRef_fkey"
  FOREIGN KEY ("workspaceId","canonicalPersonId") REFERENCES "people"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personAliases" ADD CONSTRAINT "personAliases_mergeDecisionRef_fkey"
  FOREIGN KEY ("workspaceId","mergeDecisionId") REFERENCES "personMerges"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION once_person_alias_no_chain() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."oldPersonId" = NEW."canonicalPersonId" THEN
    RAISE EXCEPTION 'person alias cannot self-reference' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
      SELECT 1 FROM "personAliases" pa
      WHERE pa."workspaceId"=NEW."workspaceId" AND pa."oldPersonId"=NEW."canonicalPersonId"
        AND pa."id"<>NEW."id"
  ) THEN
    RAISE EXCEPTION 'person alias canonical cannot itself be an alias' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
      SELECT 1 FROM "personAliases" pa
      WHERE pa."workspaceId"=NEW."workspaceId" AND pa."canonicalPersonId"=NEW."oldPersonId"
        AND pa."id"<>NEW."id"
  ) THEN
    RAISE EXCEPTION 'person alias old id cannot already be canonical' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER person_alias_no_chain
BEFORE INSERT OR UPDATE ON "personAliases"
FOR EACH ROW EXECUTE FUNCTION once_person_alias_no_chain();

COMMIT;
