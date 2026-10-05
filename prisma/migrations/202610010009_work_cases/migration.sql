-- PR-03D / migration 64. Existing IDs and historical credits remain intact.
ALTER TABLE "works" ADD COLUMN "caseDate" text, ADD COLUMN "datePrecision" text NOT NULL DEFAULT 'UNKNOWN', ADD COLUMN location text NOT NULL DEFAULT '', ADD COLUMN "brandDisplayName" text NOT NULL DEFAULT '';
ALTER TABLE "works" ADD CONSTRAINT work_case_date_shape CHECK (
 ("datePrecision"='UNKNOWN' AND "caseDate" IS NULL) OR
 ("datePrecision"='YEAR' AND "caseDate" IS NOT NULL AND "caseDate" ~ '^[0-9]{4}$') OR
 ("datePrecision"='MONTH' AND "caseDate" IS NOT NULL AND "caseDate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$') OR
 ("datePrecision"='DAY' AND "caseDate" IS NOT NULL AND "caseDate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$') OR
 ("datePrecision"='APPROXIMATE' AND "caseDate" IS NOT NULL AND length("caseDate") BETWEEN 1 AND 100));
ALTER TABLE "workCredits" ADD COLUMN "personRoleId" uuid, ADD COLUMN "sourceId" uuid;
CREATE UNIQUE INDEX work_credit_role_target ON "personRoles" ("workspaceId","personId",id,"roleCode");
ALTER TABLE "workCredits" ADD CONSTRAINT work_credit_exact_role FOREIGN KEY ("workspaceId","personId","personRoleId","roleCode") REFERENCES "personRoles" ("workspaceId","personId",id,"roleCode") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "workCredits" ADD CONSTRAINT work_credit_source FOREIGN KEY ("workspaceId","sourceId") REFERENCES sources ("workspaceId",id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "workCredits" ADD CONSTRAINT work_credit_exact_basis CHECK (("personRoleId" IS NULL) = ("sourceId" IS NULL));
CREATE UNIQUE INDEX work_credit_exact_unique ON "workCredits" ("workspaceId","workId","personId","personRoleId") WHERE "personRoleId" IS NOT NULL;
CREATE OR REPLACE FUNCTION media_submission_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.kind IN ('MEDIA','COLLECTION','WORK') AND NOT EXISTS(SELECT 1 FROM "talentSubmissions" s WHERE s.id=NEW."submissionId" AND s."workspaceId"=NEW."workspaceId" AND s.state='DRAFT') THEN RAISE EXCEPTION 'submission frozen'; END IF;
 RETURN NEW;
END $$;
