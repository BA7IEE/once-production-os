-- Preserve the existing erased-header contract while bounding live media by type.
BEGIN;
ALTER TABLE "uploads" DROP CONSTRAINT "uploads_m1_check_3";
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_m1_check_3" CHECK (
 ("state"='ERASED' AND "expectedBytes"=0) OR
 ("state"<>'ERASED' AND "expectedBytes" BETWEEN 1 AND CASE "mime" WHEN 'application/pdf' THEN 50000000 WHEN 'video/mp4' THEN 200000000 ELSE 30000000 END)
);
ALTER TABLE "assets" DROP CONSTRAINT "assets_m1_check_4";
ALTER TABLE "assets" ADD CONSTRAINT "assets_m1_check_4" CHECK (
 ("state"='ERASED' AND "bytes"=0) OR
 ("state"<>'ERASED' AND "bytes" BETWEEN 1 AND CASE "mime" WHEN 'application/pdf' THEN 50000000 WHEN 'video/mp4' THEN 200000000 ELSE 30000000 END)
);
COMMIT;
