-- Forward migration 77: external people own their document AI calls. Financial
-- metadata retains the existing immutable, one-send ledger and workspace budget.
BEGIN;
ALTER TABLE "aiRuns" ALTER COLUMN "actorId" DROP NOT NULL,
 ADD COLUMN "talentAccountId" uuid, ADD COLUMN "actorEpoch" integer,
 ADD COLUMN purpose text NOT NULL DEFAULT 'INTERNAL_TASK';
ALTER TABLE "aiRuns" ADD CONSTRAINT ai_talent_actor_fk FOREIGN KEY ("workspaceId","talentAccountId") REFERENCES "talentAccounts"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "aiRuns" ADD CONSTRAINT ai_real_principal CHECK ((
 (purpose='INTERNAL_TASK' AND "actorId" IS NOT NULL AND "talentAccountId" IS NULL AND "actorEpoch" IS NULL)
 OR (purpose='SUPPLIER_DOCUMENT' AND "actorId" IS NULL AND "talentAccountId" IS NOT NULL AND "actorEpoch">=1)) IS TRUE);
CREATE UNIQUE INDEX ai_talent_request_key ON "aiRuns" ("workspaceId","talentAccountId","requestKey") WHERE "talentAccountId" IS NOT NULL;
CREATE INDEX supplier_document_queue ON "talentSubmissionItems" (kind,"createdAt") WHERE kind='DOCUMENT_PARSE';
COMMIT;
