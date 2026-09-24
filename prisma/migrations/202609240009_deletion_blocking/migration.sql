-- DEV-07C safety blocking only. No payload/media deletion.
BEGIN;

ALTER TABLE "deletionRequests"
  DROP CONSTRAINT "deletionRequests_dev07b_check_1";
ALTER TABLE "deletionRequests"
  ADD CONSTRAINT "deletionRequests_dev07c_state_check"
  CHECK ("state" IN ('DRAFT','BLOCKED_FOR_USE'));

CREATE UNIQUE INDEX "deletionRequests_one_blocked_target"
  ON "deletionRequests" ("workspaceId","targetKind","targetId")
  WHERE "state" = 'BLOCKED_FOR_USE';

ALTER TABLE "sourceHistory"
  DROP CONSTRAINT "sourceHistory_action_check";
ALTER TABLE "sourceHistory"
  ADD CONSTRAINT "sourceHistory_action_check"
  CHECK ("action" IN ('CREATED','EDITED','REVIEWED','SUSPENDED','SCOPE_CHANGED','DELETION_BLOCKED','BASELINE'));

ALTER TABLE "sourceHistory"
  DROP CONSTRAINT "sourceHistory_decision_check";
ALTER TABLE "sourceHistory"
  ADD CONSTRAINT "sourceHistory_decision_check" CHECK (
    ("baselineOnly" AND "action" = 'BASELINE' AND "actorId" IS NULL AND "decisionReason" IS NULL)
    OR (NOT "baselineOnly" AND "action" <> 'BASELINE' AND "actorId" IS NOT NULL
        AND (("action" IN ('SUSPENDED','DELETION_BLOCKED') AND "decisionReason" IS NOT NULL)
            OR ("action" NOT IN ('SUSPENDED','DELETION_BLOCKED') AND "decisionReason" IS NULL))));

COMMIT;
