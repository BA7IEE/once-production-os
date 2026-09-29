-- DEV-07G forward integrity hardening for controlled Person merge history.
BEGIN;

-- Bind recorded source snapshots to the exact Person identities they describe.
ALTER TABLE "personMerges"
  ADD CONSTRAINT "personMerges_canonical_person_source_fkey"
  FOREIGN KEY ("workspaceId","canonicalPersonId","canonicalSourceId")
  REFERENCES "people"("workspaceId","id","sourceId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "personMerges"
  ADD CONSTRAINT "personMerges_duplicate_person_source_fkey"
  FOREIGN KEY ("workspaceId","duplicatePersonId","duplicateSourceId")
  REFERENCES "people"("workspaceId","id","sourceId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Alias evidence must point to the merge decision for the same old/canonical pair.
ALTER TABLE "personMerges"
  ADD CONSTRAINT "personMerges_alias_identity_key"
  UNIQUE ("workspaceId","id","duplicatePersonId","canonicalPersonId");

ALTER TABLE "personAliases"
  ADD CONSTRAINT "personAliases_merge_identity_fkey"
  FOREIGN KEY ("workspaceId","mergeDecisionId","oldPersonId","canonicalPersonId")
  REFERENCES "personMerges"("workspaceId","id","duplicatePersonId","canonicalPersonId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- A merge decision and its old-id mapping are security/audit evidence, not editable business rows.
CREATE OR REPLACE FUNCTION once_person_merge_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'person merge history is append-only' USING ERRCODE='23514';
END;
$$;

CREATE TRIGGER person_merges_immutable
BEFORE UPDATE OR DELETE ON "personMerges"
FOR EACH ROW EXECUTE FUNCTION once_person_merge_history_immutable();

CREATE TRIGGER person_aliases_immutable
BEFORE UPDATE OR DELETE ON "personAliases"
FOR EACH ROW EXECUTE FUNCTION once_person_merge_history_immutable();

-- Alias publication is only valid after the old identity has been archived in the same transaction.
CREATE OR REPLACE FUNCTION once_person_alias_no_chain() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."oldPersonId" = NEW."canonicalPersonId" THEN
    RAISE EXCEPTION 'person alias cannot self-reference' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (
      SELECT 1 FROM "people" p
      WHERE p."workspaceId"=NEW."workspaceId" AND p."id"=NEW."oldPersonId" AND p."status"='ARCHIVED'
  ) THEN
    RAISE EXCEPTION 'person alias old identity must be archived first' USING ERRCODE='23514';
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

COMMIT;
