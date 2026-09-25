-- DEV-07F finalizes only PERSON / WORK / PROJECT roots into ERASED minimal headers.
-- SOURCE / ASSET remain CLEANING until specialized history/media cleanup exists.
BEGIN;

ALTER TABLE "deletionRequests"
  DROP CONSTRAINT "deletionRequests_dev07e_state_check";
ALTER TABLE "deletionRequests"
  ADD CONSTRAINT "deletionRequests_dev07f_state_check"
  CHECK ("state" IN ('DRAFT','BLOCKED_FOR_USE','CLEANING','COMPLETED','RETAINED_WITH_BASIS'));

ALTER TABLE "deletionRequests"
  DROP CONSTRAINT "deletionRequests_dev07e_cleanup_shape";
ALTER TABLE "deletionRequests"
  ADD CONSTRAINT "deletionRequests_dev07f_cleanup_shape" CHECK (
    ("state" IN ('DRAFT','BLOCKED_FOR_USE')
      AND "executionPlanDigest" IS NULL AND "cleanupStartedAt" IS NULL AND "cleanupStartedById" IS NULL
      AND "cleanupLeaseToken" IS NULL AND "cleanupLeaseUntil" IS NULL
      AND "dependencyCleanupCompletedAt" IS NULL AND "cleanupErrorCode" IS NULL)
    OR
    ("state" = 'CLEANING'
      AND "planDigest" IS NOT NULL AND "planDigest" ~ '^[0-9a-f]{64} TIMESTAMPTZ(3),
  ADD COLUMN "rootFinalizationEvidenceDigest" TEXT,
  ADD CONSTRAINT "deletionRequests_dev07f_final_shape" CHECK (
    ("state" IN ('COMPLETED','RETAINED_WITH_BASIS')
      AND "dependencyCleanupCompletedAt" IS NOT NULL
      AND "rootFinalizedAt" IS NOT NULL
      AND "rootFinalizationEvidenceDigest" IS NOT NULL
      AND "rootFinalizationEvidenceDigest" ~ '^[0-9a-f]{64}$'
      AND "cleanupLeaseToken" IS NULL AND "cleanupLeaseUntil" IS NULL
      AND "cleanupErrorCode" IS NULL)
    OR
    ("state" NOT IN ('COMPLETED','RETAINED_WITH_BASIS')
      AND "rootFinalizedAt" IS NULL AND "rootFinalizationEvidenceDigest" IS NULL)
  );

ALTER TABLE "people" DROP CONSTRAINT IF EXISTS "people_status_check";
ALTER TABLE "people" DROP CONSTRAINT IF EXISTS "people_roles_check";
ALTER TABLE "people"
  ADD CONSTRAINT "people_dev07f_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','ARCHIVED','ERASED')),
  ADD CONSTRAINT "people_dev07f_roles_check" CHECK (
    ("status"='ERASED' AND cardinality("roles")=0)
    OR ("status"<>'ERASED' AND cardinality("roles") BETWEEN 1 AND 10)),
  ADD CONSTRAINT "people_dev07f_erased_shape" CHECK (
    "status"<>'ERASED' OR (
      "displayName"='[ERASED]' AND cardinality("aliases")=0 AND cardinality("roles")=0
      AND "cityCode" IS NULL AND cardinality("languageCodes")=0 AND cardinality("skillCodes")=0
      AND "heightCm" IS NULL AND "intro"=''
    )
  );

ALTER TABLE "works" DROP CONSTRAINT "works_wp1_check_3";
ALTER TABLE "works"
  ADD CONSTRAINT "works_dev07f_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','ARCHIVED','ERASED')),
  ADD CONSTRAINT "works_dev07f_erased_shape" CHECK (
    "status"<>'ERASED' OR (
      "title"='[ERASED]' AND "description"='' AND "industryCode" IS NULL
      AND cardinality("workTypeCodes")=0 AND "origin"='UNKNOWN' AND "originNote"=''
      AND "coverEntryId" IS NULL
    )
  );

ALTER TABLE "projects" DROP CONSTRAINT "projects_wp1_check_2";
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_dev07f_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','COMPLETED','ARCHIVED','ERASED')),
  ADD CONSTRAINT "projects_dev07f_erased_shape" CHECK (
    "status"<>'ERASED' OR (
      "title"='[ERASED]' AND "brief"='' AND "locationNote"='' AND "dateNote"='' AND "reviewNote"=''
    )
  );

COMMIT;

      AND "executionPlanDigest" IS NOT NULL AND "executionPlanDigest" ~ '^[0-9a-f]{64} TIMESTAMPTZ(3),
  ADD COLUMN "rootFinalizationEvidenceDigest" TEXT,
  ADD CONSTRAINT "deletionRequests_dev07f_final_shape" CHECK (
    ("state" IN ('COMPLETED','RETAINED_WITH_BASIS')
      AND "dependencyCleanupCompletedAt" IS NOT NULL
      AND "rootFinalizedAt" IS NOT NULL
      AND "rootFinalizationEvidenceDigest" IS NOT NULL
      AND "rootFinalizationEvidenceDigest" ~ '^[0-9a-f]{64}$'
      AND "cleanupLeaseToken" IS NULL AND "cleanupLeaseUntil" IS NULL
      AND "cleanupErrorCode" IS NULL)
    OR
    ("state" NOT IN ('COMPLETED','RETAINED_WITH_BASIS')
      AND "rootFinalizedAt" IS NULL AND "rootFinalizationEvidenceDigest" IS NULL)
  );

ALTER TABLE "people" DROP CONSTRAINT IF EXISTS "people_status_check";
ALTER TABLE "people" DROP CONSTRAINT IF EXISTS "people_roles_check";
ALTER TABLE "people"
  ADD CONSTRAINT "people_dev07f_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','ARCHIVED','ERASED')),
  ADD CONSTRAINT "people_dev07f_roles_check" CHECK (
    ("status"='ERASED' AND cardinality("roles")=0)
    OR ("status"<>'ERASED' AND cardinality("roles") BETWEEN 1 AND 10)),
  ADD CONSTRAINT "people_dev07f_erased_shape" CHECK (
    "status"<>'ERASED' OR (
      "displayName"='[ERASED]' AND cardinality("aliases")=0 AND cardinality("roles")=0
      AND "cityCode" IS NULL AND cardinality("languageCodes")=0 AND cardinality("skillCodes")=0
      AND "heightCm" IS NULL AND "intro"=''
    )
  );

ALTER TABLE "works" DROP CONSTRAINT "works_wp1_check_3";
ALTER TABLE "works"
  ADD CONSTRAINT "works_dev07f_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','ARCHIVED','ERASED')),
  ADD CONSTRAINT "works_dev07f_erased_shape" CHECK (
    "status"<>'ERASED' OR (
      "title"='[ERASED]' AND "description"='' AND "industryCode" IS NULL
      AND cardinality("workTypeCodes")=0 AND "origin"='UNKNOWN' AND "originNote"=''
      AND "coverEntryId" IS NULL
    )
  );

ALTER TABLE "projects" DROP CONSTRAINT "projects_wp1_check_2";
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_dev07f_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','COMPLETED','ARCHIVED','ERASED')),
  ADD CONSTRAINT "projects_dev07f_erased_shape" CHECK (
    "status"<>'ERASED' OR (
      "title"='[ERASED]' AND "brief"='' AND "locationNote"='' AND "dateNote"='' AND "reviewNote"=''
    )
  );

COMMIT;

      AND "cleanupStartedAt" IS NOT NULL AND "cleanupStartedById" IS NOT NULL)
    OR
    ("state" IN ('COMPLETED','RETAINED_WITH_BASIS')
      AND "planDigest" IS NOT NULL AND "planDigest" ~ '^[0-9a-f]{64} TIMESTAMPTZ(3),
  ADD COLUMN "rootFinalizationEvidenceDigest" TEXT,
  ADD CONSTRAINT "deletionRequests_dev07f_final_shape" CHECK (
    ("state" IN ('COMPLETED','RETAINED_WITH_BASIS')
      AND "dependencyCleanupCompletedAt" IS NOT NULL
      AND "rootFinalizedAt" IS NOT NULL
      AND "rootFinalizationEvidenceDigest" IS NOT NULL
      AND "rootFinalizationEvidenceDigest" ~ '^[0-9a-f]{64}$'
      AND "cleanupLeaseToken" IS NULL AND "cleanupLeaseUntil" IS NULL
      AND "cleanupErrorCode" IS NULL)
    OR
    ("state" NOT IN ('COMPLETED','RETAINED_WITH_BASIS')
      AND "rootFinalizedAt" IS NULL AND "rootFinalizationEvidenceDigest" IS NULL)
  );

ALTER TABLE "people" DROP CONSTRAINT IF EXISTS "people_status_check";
ALTER TABLE "people" DROP CONSTRAINT IF EXISTS "people_roles_check";
ALTER TABLE "people"
  ADD CONSTRAINT "people_dev07f_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','ARCHIVED','ERASED')),
  ADD CONSTRAINT "people_dev07f_roles_check" CHECK (
    ("status"='ERASED' AND cardinality("roles")=0)
    OR ("status"<>'ERASED' AND cardinality("roles") BETWEEN 1 AND 10)),
  ADD CONSTRAINT "people_dev07f_erased_shape" CHECK (
    "status"<>'ERASED' OR (
      "displayName"='[ERASED]' AND cardinality("aliases")=0 AND cardinality("roles")=0
      AND "cityCode" IS NULL AND cardinality("languageCodes")=0 AND cardinality("skillCodes")=0
      AND "heightCm" IS NULL AND "intro"=''
    )
  );

ALTER TABLE "works" DROP CONSTRAINT "works_wp1_check_3";
ALTER TABLE "works"
  ADD CONSTRAINT "works_dev07f_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','ARCHIVED','ERASED')),
  ADD CONSTRAINT "works_dev07f_erased_shape" CHECK (
    "status"<>'ERASED' OR (
      "title"='[ERASED]' AND "description"='' AND "industryCode" IS NULL
      AND cardinality("workTypeCodes")=0 AND "origin"='UNKNOWN' AND "originNote"=''
      AND "coverEntryId" IS NULL
    )
  );

ALTER TABLE "projects" DROP CONSTRAINT "projects_wp1_check_2";
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_dev07f_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','COMPLETED','ARCHIVED','ERASED')),
  ADD CONSTRAINT "projects_dev07f_erased_shape" CHECK (
    "status"<>'ERASED' OR (
      "title"='[ERASED]' AND "brief"='' AND "locationNote"='' AND "dateNote"='' AND "reviewNote"=''
    )
  );

COMMIT;

      AND "executionPlanDigest" IS NOT NULL AND "executionPlanDigest" ~ '^[0-9a-f]{64} TIMESTAMPTZ(3),
  ADD COLUMN "rootFinalizationEvidenceDigest" TEXT,
  ADD CONSTRAINT "deletionRequests_dev07f_final_shape" CHECK (
    ("state" IN ('COMPLETED','RETAINED_WITH_BASIS')
      AND "dependencyCleanupCompletedAt" IS NOT NULL
      AND "rootFinalizedAt" IS NOT NULL
      AND "rootFinalizationEvidenceDigest" IS NOT NULL
      AND "rootFinalizationEvidenceDigest" ~ '^[0-9a-f]{64}$'
      AND "cleanupLeaseToken" IS NULL AND "cleanupLeaseUntil" IS NULL
      AND "cleanupErrorCode" IS NULL)
    OR
    ("state" NOT IN ('COMPLETED','RETAINED_WITH_BASIS')
      AND "rootFinalizedAt" IS NULL AND "rootFinalizationEvidenceDigest" IS NULL)
  );

ALTER TABLE "people" DROP CONSTRAINT IF EXISTS "people_status_check";
ALTER TABLE "people" DROP CONSTRAINT IF EXISTS "people_roles_check";
ALTER TABLE "people"
  ADD CONSTRAINT "people_dev07f_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','ARCHIVED','ERASED')),
  ADD CONSTRAINT "people_dev07f_roles_check" CHECK (
    ("status"='ERASED' AND cardinality("roles")=0)
    OR ("status"<>'ERASED' AND cardinality("roles") BETWEEN 1 AND 10)),
  ADD CONSTRAINT "people_dev07f_erased_shape" CHECK (
    "status"<>'ERASED' OR (
      "displayName"='[ERASED]' AND cardinality("aliases")=0 AND cardinality("roles")=0
      AND "cityCode" IS NULL AND cardinality("languageCodes")=0 AND cardinality("skillCodes")=0
      AND "heightCm" IS NULL AND "intro"=''
    )
  );

ALTER TABLE "works" DROP CONSTRAINT "works_wp1_check_3";
ALTER TABLE "works"
  ADD CONSTRAINT "works_dev07f_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','ARCHIVED','ERASED')),
  ADD CONSTRAINT "works_dev07f_erased_shape" CHECK (
    "status"<>'ERASED' OR (
      "title"='[ERASED]' AND "description"='' AND "industryCode" IS NULL
      AND cardinality("workTypeCodes")=0 AND "origin"='UNKNOWN' AND "originNote"=''
      AND "coverEntryId" IS NULL
    )
  );

ALTER TABLE "projects" DROP CONSTRAINT "projects_wp1_check_2";
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_dev07f_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','COMPLETED','ARCHIVED','ERASED')),
  ADD CONSTRAINT "projects_dev07f_erased_shape" CHECK (
    "status"<>'ERASED' OR (
      "title"='[ERASED]' AND "brief"='' AND "locationNote"='' AND "dateNote"='' AND "reviewNote"=''
    )
  );

COMMIT;

      AND "cleanupStartedAt" IS NOT NULL AND "cleanupStartedById" IS NOT NULL
      AND "dependencyCleanupCompletedAt" IS NOT NULL
      AND "cleanupLeaseToken" IS NULL AND "cleanupLeaseUntil" IS NULL AND "cleanupErrorCode" IS NULL)
  );

DROP INDEX IF EXISTS "deletionRequests_one_blocked_target";
CREATE UNIQUE INDEX "deletionRequests_one_active_or_final_target"
  ON "deletionRequests" ("workspaceId","targetKind","targetId")
  WHERE "state" <> 'DRAFT';

ALTER TABLE "deletionRequests"
  ADD COLUMN "rootFinalizedAt" TIMESTAMPTZ(3),
  ADD COLUMN "rootFinalizationEvidenceDigest" TEXT,
  ADD CONSTRAINT "deletionRequests_dev07f_final_shape" CHECK (
    ("state" IN ('COMPLETED','RETAINED_WITH_BASIS')
      AND "dependencyCleanupCompletedAt" IS NOT NULL
      AND "rootFinalizedAt" IS NOT NULL
      AND "rootFinalizationEvidenceDigest" IS NOT NULL
      AND "rootFinalizationEvidenceDigest" ~ '^[0-9a-f]{64}$'
      AND "cleanupLeaseToken" IS NULL AND "cleanupLeaseUntil" IS NULL
      AND "cleanupErrorCode" IS NULL)
    OR
    ("state" NOT IN ('COMPLETED','RETAINED_WITH_BASIS')
      AND "rootFinalizedAt" IS NULL AND "rootFinalizationEvidenceDigest" IS NULL)
  );

ALTER TABLE "people" DROP CONSTRAINT IF EXISTS "people_status_check";
ALTER TABLE "people" DROP CONSTRAINT IF EXISTS "people_roles_check";
ALTER TABLE "people"
  ADD CONSTRAINT "people_dev07f_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','ARCHIVED','ERASED')),
  ADD CONSTRAINT "people_dev07f_roles_check" CHECK (
    ("status"='ERASED' AND cardinality("roles")=0)
    OR ("status"<>'ERASED' AND cardinality("roles") BETWEEN 1 AND 10)),
  ADD CONSTRAINT "people_dev07f_erased_shape" CHECK (
    "status"<>'ERASED' OR (
      "displayName"='[ERASED]' AND cardinality("aliases")=0 AND cardinality("roles")=0
      AND "cityCode" IS NULL AND cardinality("languageCodes")=0 AND cardinality("skillCodes")=0
      AND "heightCm" IS NULL AND "intro"=''
    )
  );

ALTER TABLE "works" DROP CONSTRAINT "works_wp1_check_3";
ALTER TABLE "works"
  ADD CONSTRAINT "works_dev07f_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','ARCHIVED','ERASED')),
  ADD CONSTRAINT "works_dev07f_erased_shape" CHECK (
    "status"<>'ERASED' OR (
      "title"='[ERASED]' AND "description"='' AND "industryCode" IS NULL
      AND cardinality("workTypeCodes")=0 AND "origin"='UNKNOWN' AND "originNote"=''
      AND "coverEntryId" IS NULL
    )
  );

ALTER TABLE "projects" DROP CONSTRAINT "projects_wp1_check_2";
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_dev07f_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','COMPLETED','ARCHIVED','ERASED')),
  ADD CONSTRAINT "projects_dev07f_erased_shape" CHECK (
    "status"<>'ERASED' OR (
      "title"='[ERASED]' AND "brief"='' AND "locationNote"='' AND "dateNote"='' AND "reviewNote"=''
    )
  );

COMMIT;
