-- Existing memberships retain their role and grants. Only ADMIN receives default new permissions
-- through the existing policy role map; other roles require explicit, auditable assignment.
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_extraPermissions_check";
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_extraPermissions_check" CHECK ("extraPermissions" <@ ARRAY['sensitive.read','sensitive.write','data.export','data.delete','data.merge','ai.use','talent.invite','talent.review']::text[]);
