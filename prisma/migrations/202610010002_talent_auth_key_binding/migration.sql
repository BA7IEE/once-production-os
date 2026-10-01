-- Bind identity lookup keys to existing accounts. Empty digest is fail-closed for any
-- partial PR-02a test installation created before this forward migration.
ALTER TABLE "talentAccounts" ADD COLUMN "identityKeyDigest" text NOT NULL DEFAULT '';
ALTER TABLE "talentAccounts" ALTER COLUMN "identityKeyDigest" DROP DEFAULT;
ALTER TABLE "talentAccounts" ADD CONSTRAINT "talent_identity_key_digest" CHECK ("identityKeyDigest" = '' OR "identityKeyDigest" ~ '^[a-f0-9]{64}$');
