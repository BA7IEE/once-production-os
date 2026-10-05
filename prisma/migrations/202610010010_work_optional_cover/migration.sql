-- Forward correction after migration 64's first retained synthetic installation.
-- A real case can have no static image; never invent a cover for video or unknown media.
-- The existing composite Work -> WorkAsset FK still enforces same-work ownership.
ALTER TABLE works DROP CONSTRAINT works_wp1_check_5;
