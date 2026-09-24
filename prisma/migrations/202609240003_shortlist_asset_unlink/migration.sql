-- DEV-06 forward fix: shortlist image selections are derived from WorkAsset links.
-- Removing a WorkAsset must not be blocked by an internal shortlist selection and must never delete the underlying MediaAsset.
BEGIN;
ALTER TABLE "shortlistItemAssets"
  DROP CONSTRAINT "shortlistItemAssets_workAssetRef_fkey";
ALTER TABLE "shortlistItemAssets"
  ADD CONSTRAINT "shortlistItemAssets_workAssetRef_fkey"
  FOREIGN KEY ("workspaceId","workId","workAssetId","assetId")
  REFERENCES "workAssets"("workspaceId","workId","id","assetId")
  ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
