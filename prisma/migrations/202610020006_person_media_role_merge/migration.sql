-- 74: preserve exact Role identity while Person merge moves Role and adopted
-- media together. The same composite FK remains enforced at transaction commit.
ALTER TABLE "personMedia"
 ALTER CONSTRAINT "personMedia_workspaceId_personId_personRoleId_fkey"
 DEFERRABLE INITIALLY DEFERRED;
