-- Preserve explicitly selected language merge history without changing applied migrations.
BEGIN;
ALTER TABLE "localeTexts" ADD COLUMN "mergeHistory" JSONB;
ALTER TABLE "localeTexts" ADD CONSTRAINT "locale_merge_history_shape" CHECK (
 "mergeHistory" IS NULL OR CASE WHEN jsonb_typeof("mergeHistory")='array' THEN
 jsonb_array_length("mergeHistory")<=20 AND (jsonb_array_length("mergeHistory")=0 OR "personId" IS NOT NULL)
 AND ("state"<>'ERASED' OR jsonb_array_length("mergeHistory")=0) ELSE false END
);
CREATE FUNCTION locale_merge_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."state"<>'ERASED' AND NEW."state"<>'ERASED' AND OLD."mergeHistory" IS NOT NULL
 AND NOT COALESCE(NEW."mergeHistory",'[]'::jsonb) @> OLD."mergeHistory" THEN
 RAISE EXCEPTION 'locale merge history is append only until explicit erasure' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER locale_merge_history_guard BEFORE UPDATE ON "localeTexts" FOR EACH ROW EXECUTE FUNCTION locale_merge_history_guard();
COMMIT;
