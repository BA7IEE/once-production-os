-- DEV-07A Prisma Json? writes JavaScript null as JSON null. Accept that only for non-ready payloads.
BEGIN;
ALTER TABLE "exports" DROP CONSTRAINT "exports_dev07_payload_shape";
ALTER TABLE "exports"
  ADD CONSTRAINT "exports_dev07_payload_shape" CHECK (
    ("state"='READY' AND "payload" IS NOT NULL AND "payload" <> 'null'::jsonb AND length("payloadDigest")=64 AND "leaseToken" IS NULL AND "leaseUntil" IS NULL) OR
    ("state"<>'READY' AND ((("payload" IS NULL OR "payload" = 'null'::jsonb) AND "payloadDigest" IS NULL) OR "state"='ERASED'))
  );
COMMIT;
