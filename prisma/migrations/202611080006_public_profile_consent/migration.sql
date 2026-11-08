-- Forward 84. Migration 83 has been applied in isolation and is frozen.
-- Public consent remains distinct; it cannot satisfy INTERNAL_DIRECTORY source basis gates.
BEGIN;
ALTER TABLE "talentConsents" DROP CONSTRAINT consent_shape;
ALTER TABLE "talentConsents" ADD CONSTRAINT consent_shape CHECK (
 state IN ('ACTIVE','REVOKED') AND (
  purpose='INTERNAL_DIRECTORY' AND ("personId" IS NOT NULL OR "claimId" IS NOT NULL)
  OR purpose='PUBLIC_PROFILE' AND "personId" IS NOT NULL AND "claimId" IS NULL
    AND "textVersion"='once-public-homepage-v1' AND cardinality("fieldScope")=2
 )
);
COMMIT;
