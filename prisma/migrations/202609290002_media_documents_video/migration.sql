BEGIN;
-- Append-only upgrade; existing media rows and identity remain unchanged.
ALTER TABLE "uploads" DROP CONSTRAINT "uploads_m1_check_2", DROP CONSTRAINT "uploads_m1_check_3";
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_m1_check_2" CHECK ("mime" IN ('image/jpeg','image/png','image/webp','application/pdf','video/mp4')),
 ADD CONSTRAINT "uploads_m1_check_3" CHECK ("expectedBytes" BETWEEN 1 AND CASE "mime" WHEN 'application/pdf' THEN 50000000 WHEN 'video/mp4' THEN 200000000 ELSE 30000000 END);
ALTER TABLE "assets" DROP CONSTRAINT "assets_m1_check_2", DROP CONSTRAINT "assets_m1_check_4";
ALTER TABLE "assets" ADD CONSTRAINT "assets_m1_check_2" CHECK ("mime" IN ('image/jpeg','image/png','image/webp','application/pdf','video/mp4')),
 ADD CONSTRAINT "assets_m1_check_4" CHECK ("bytes" BETWEEN 1 AND CASE "mime" WHEN 'application/pdf' THEN 50000000 WHEN 'video/mp4' THEN 200000000 ELSE 30000000 END);
COMMIT;
