-- Migration 70. Expand the existing persisted permission contract without mixing
-- ingestion credentials with the legacy direct-fact-write credential family.
ALTER TABLE "servicePrincipals" DROP CONSTRAINT "servicePrincipals_td2_permissions";
ALTER TABLE "servicePrincipals" ADD CONSTRAINT "servicePrincipals_td2_permissions" CHECK ((
 cardinality("permissionCodes") BETWEEN 1 AND 8 AND
 ("permissionCodes" <@ ARRAY['records.read','sources.read','talent.propose','talent.fact.write']::text[] OR
 "permissionCodes" <@ ARRAY['ingestion.schema.read','ingestion.submit','ingestion.read.own','ingestion.withdraw.own']::text[])
) IS TRUE);
