-- Migration 72: historical references are JSON provenance, never fabricated live FKs.
-- Match ReviewBasisTransferSchema: exact keys, UUID/hex syntax, UTF-16 string bounds,
-- bounded nonempty fieldScope, canonical millisecond UTC date (including calendar validity).
CREATE FUNCTION imported_internal_review_basis_valid(b jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE
 keys text[] := ARRAY['version','basisKind','providerServicePrincipalId','submissionId','sourceAttributionId','reviewerId','reviewBasisDigest','purpose','fieldScope','validUntil'];
 k text; item jsonb; units integer; t text; y integer; mo integer; d integer; days integer;
BEGIN
 IF b IS NULL OR jsonb_typeof(b)<>'object' OR NOT b ?& keys OR b-keys<>'{}'::jsonb THEN RETURN false; END IF;
 FOREACH k IN ARRAY keys LOOP
  IF k<>'fieldScope' AND jsonb_typeof(b->k)<>'string' THEN RETURN false; END IF;
 END LOOP;
 IF b->>'version'<>'internal-review-basis-v1' OR b->>'basisKind'<>'INTERNAL_REVIEW' OR b->>'purpose'<>'INTERNAL_DIRECTORY' THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['providerServicePrincipalId','submissionId','sourceAttributionId','reviewerId'] LOOP
  IF length(b->>k)<>36 OR b->>k !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RETURN false; END IF;
 END LOOP;
 IF length(b->>'reviewBasisDigest')<>64 OR b->>'reviewBasisDigest' !~ '^[0-9a-f]{64}$' OR jsonb_typeof(b->'fieldScope')<>'array' THEN RETURN false; END IF;
 IF jsonb_array_length(b->'fieldScope') NOT BETWEEN 1 AND 50 THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(b->'fieldScope') LOOP
  IF jsonb_typeof(item)<>'string' THEN RETURN false; END IF;
  SELECT COALESCE(sum(CASE WHEN c='' THEN 0 WHEN ascii(c)>65535 THEN 2 ELSE 1 END),0) INTO units FROM regexp_split_to_table(item#>>'{}','') c;
  IF units NOT BETWEEN 1 AND 120 THEN RETURN false; END IF;
 END LOOP;
 t:=b->>'validUntil';
 IF length(t)<>24 OR t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' THEN RETURN false; END IF;
 y:=substring(t,1,4)::integer; mo:=substring(t,6,2)::integer; d:=substring(t,9,2)::integer;
 IF mo NOT BETWEEN 1 AND 12 OR substring(t,12,2)::integer>23 OR substring(t,15,2)::integer>59 OR substring(t,18,2)::integer>59 THEN RETURN false; END IF;
 days:=(ARRAY[31,CASE WHEN y%400=0 OR (y%4=0 AND y%100<>0) THEN 29 ELSE 28 END,31,30,31,30,31,31,30,31,30,31])[mo];
 RETURN d BETWEEN 1 AND days;
END $$;

ALTER TABLE "sourceUseBases" ADD CONSTRAINT basis_imported_internal_review_shape
CHECK ("importedBasis" IS NULL OR CASE
 WHEN "basisKind"='INTERNAL_REVIEW' OR "importedBasis"->>'version'='internal-review-basis-v1' OR "importedBasis"->>'basisKind'='INTERNAL_REVIEW'
 THEN "basisKind"='INTERNAL_REVIEW' AND imported_internal_review_basis_valid("importedBasis") IS TRUE
 ELSE true END);
