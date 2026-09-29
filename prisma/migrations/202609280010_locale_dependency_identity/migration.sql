-- A dependency cannot be moved out of its original graph. Domain updates replace
-- the complete dependency set atomically; moving a row would otherwise bypass
-- the deferred completeness check on the old text.
CREATE FUNCTION locale_dependency_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId" OR NEW."localeTextId" IS DISTINCT FROM OLD."localeTextId" THEN
  RAISE EXCEPTION 'locale dependency identity is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER locale_dependency_identity_guard BEFORE UPDATE ON "localeDependencies" FOR EACH ROW EXECUTE FUNCTION locale_dependency_identity_guard();
