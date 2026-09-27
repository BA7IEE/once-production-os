-- Keep review identity and unresolved state while moving it to an explicitly retained candidate.
ALTER TABLE "talentMigrationReviews" ADD COLUMN "previousShortlistItemIds" uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE "talentMigrationReviews" ADD CONSTRAINT "talentMigrationReviews_previous_items_shape" CHECK (
  cardinality("previousShortlistItemIds") <= 100
  AND array_position("previousShortlistItemIds", NULL) IS NULL
  AND ("shortlistItemId" IS NULL OR NOT ("shortlistItemId" = ANY("previousShortlistItemIds")))
);
CREATE FUNCTION once_preserve_candidate_review_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."shortlistItemId" IS DISTINCT FROM OLD."shortlistItemId" THEN
    IF OLD."shortlistItemId" IS NULL OR NEW."shortlistItemId" IS NULL
       OR NEW."previousShortlistItemIds" IS DISTINCT FROM array_append(OLD."previousShortlistItemIds", OLD."shortlistItemId")
       OR NEW.state IS DISTINCT FROM OLD.state OR NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW."resolvedAt" IS DISTINCT FROM OLD."resolvedAt" OR NEW."resolvedById" IS DISTINCT FROM OLD."resolvedById" THEN
      RAISE EXCEPTION 'candidate review reassignment must preserve its history and resolution';
    END IF;
  ELSIF NEW."previousShortlistItemIds" IS DISTINCT FROM OLD."previousShortlistItemIds" THEN
    RAISE EXCEPTION 'candidate review lineage is append only';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "talentMigrationReviews_preserve_lineage" BEFORE UPDATE ON "talentMigrationReviews"
  FOR EACH ROW EXECUTE FUNCTION once_preserve_candidate_review_lineage();
