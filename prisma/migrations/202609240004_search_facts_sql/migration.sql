-- DEV-06 structured work facts and search-supporting indexes.
BEGIN;
ALTER TABLE "works"
  ADD COLUMN "industryCode" TEXT,
  ADD COLUMN "workTypeCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD CONSTRAINT "works_dev06_fact_check_0" CHECK ("industryCode" IS NULL OR "industryCode" ~ '^[a-z0-9][a-z0-9_-]{0,59}$'),
  ADD CONSTRAINT "works_dev06_fact_check_1" CHECK (cardinality("workTypeCodes") <= 10);

CREATE INDEX "works_search_industry_idx" ON "works" ("workspaceId","industryCode");
CREATE INDEX "works_search_work_types_gin" ON "works" USING GIN ("workTypeCodes");
CREATE INDEX "people_search_city_idx" ON "people" ("workspaceId","cityCode");
CREATE INDEX "people_search_status_idx" ON "people" ("workspaceId","status");
CREATE INDEX "people_search_roles_gin" ON "people" USING GIN ("roles");
CREATE INDEX "people_search_languages_gin" ON "people" USING GIN ("languageCodes");
CREATE INDEX "people_search_skills_gin" ON "people" USING GIN ("skillCodes");
COMMIT;
