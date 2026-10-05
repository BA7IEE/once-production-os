-- PR-03C / migration 63. Existing tables, source bytes and migrations 1-62 remain unchanged.
ALTER TABLE "mediaCollections" ADD COLUMN "coverAssetId" uuid, ADD COLUMN "isCurrent" boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX collection_cover_target_key ON "mediaCollectionItems" ("workspaceId","collectionId","assetId");
ALTER TABLE "mediaCollections" ADD CONSTRAINT collection_cover_own_item_fk FOREIGN KEY ("workspaceId",id,"coverAssetId") REFERENCES "mediaCollectionItems" ("workspaceId","collectionId","assetId") DEFERRABLE INITIALLY DEFERRED;
-- PostgreSQL does not permit an FK to a deferrable unique constraint. A matching immediate index supplies the referenced key.
ALTER TABLE "mediaCollections" ADD CONSTRAINT collection_current_active CHECK (NOT "isCurrent" OR status='ACTIVE');
CREATE UNIQUE INDEX collection_current_role_unique ON "mediaCollections" ("workspaceId","personId","personRoleId","collectionTypeCode") WHERE "isCurrent" AND "personRoleId" IS NOT NULL;
CREATE UNIQUE INDEX collection_current_person_unique ON "mediaCollections" ("workspaceId","personId","collectionTypeCode") WHERE "isCurrent" AND "personRoleId" IS NULL;
-- The same frozen payload gate applies to collection proposals as to media items.
CREATE OR REPLACE FUNCTION media_submission_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.kind IN ('MEDIA','COLLECTION') AND NOT EXISTS(SELECT 1 FROM "talentSubmissions" s WHERE s.id=NEW."submissionId" AND s."workspaceId"=NEW."workspaceId" AND s.state='DRAFT') THEN RAISE EXCEPTION 'submission frozen'; END IF;
 RETURN NEW;
END $$;

ALTER TABLE "mediaCollectionTags" ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED'));
