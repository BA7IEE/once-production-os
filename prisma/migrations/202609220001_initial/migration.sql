-- ONCE 0.1.0-dev.1 candidate migration; no real-data migration has been executed.
BEGIN;
CREATE TABLE "workspaces" (
  "id" UUID NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "recoveryEpoch" TEXT NOT NULL
);

CREATE TABLE "users" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "loginName" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "passwordHash" TEXT,
  "status" TEXT NOT NULL,
  "sessionEpoch" INTEGER NOT NULL,
  UNIQUE ("workspaceId", "id"),
  UNIQUE ("loginName"),
  CHECK ("revision" >= 1),
  CHECK ("status" IN ('PENDING', 'ACTIVE', 'DISABLED')),
  CHECK ("sessionEpoch" >= 1)
);

CREATE TABLE "memberships" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "userId" UUID NOT NULL,
  "role" TEXT NOT NULL,
  "extraPermissions" TEXT[] NOT NULL,
  "status" TEXT NOT NULL,
  UNIQUE ("workspaceId", "id"),
  UNIQUE ("workspaceId", "userId"),
  CHECK ("revision" >= 1),
  CHECK ("status" IN ('ACTIVE', 'DISABLED')),
  CHECK ("role" IN ('ADMIN', 'EDITOR', 'REVIEWER', 'VIEWER')),
  CHECK ("extraPermissions" <@ ARRAY['sensitive.read','sensitive.write']::text[])
);

CREATE TABLE "sessions" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "membershipId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userEpoch" INTEGER NOT NULL,
  "recoveryEpoch" TEXT NOT NULL,
  "idleUntil" TIMESTAMPTZ(3) NOT NULL,
  "absoluteUntil" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  UNIQUE ("workspaceId", "id"),
  UNIQUE ("tokenHash"),
  CHECK ("revision" >= 1),
  CHECK (length("tokenHash") = 64)
);

CREATE TABLE "activations" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  UNIQUE ("workspaceId", "id"),
  UNIQUE ("tokenHash"),
  CHECK ("revision" >= 1),
  CHECK (length("tokenHash") = 64)
);

CREATE TABLE "scopes" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  UNIQUE ("workspaceId", "id"),
  CHECK ("revision" >= 1),
  CHECK ("mode" IN ('WORKSPACE', 'RESTRICTED'))
);

CREATE TABLE "scopeMembers" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "scopeId" UUID NOT NULL,
  "membershipId" UUID NOT NULL,
  UNIQUE ("workspaceId", "id"),
  UNIQUE ("workspaceId", "scopeId", "membershipId"),
  CHECK ("revision" >= 1)
);

CREATE TABLE "sources" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "scopeId" UUID NOT NULL,
  "maintainerId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "providerClaim" TEXT NOT NULL,
  "textPayload" TEXT NOT NULL,
  "basisMode" TEXT NOT NULL,
  "basisDescription" TEXT NOT NULL,
  "validFrom" TIMESTAMPTZ(3) NOT NULL,
  "validUntil" TIMESTAMPTZ(3) NOT NULL,
  "status" TEXT NOT NULL,
  "protectionEpoch" INTEGER NOT NULL,
  "reviewedBy" UUID,
  "reviewedAt" TIMESTAMPTZ(3),
  UNIQUE ("workspaceId", "id"),
  CHECK ("revision" >= 1),
  CHECK ("type" IN ('MANUAL', 'TEXT')),
  CHECK ("basisMode" IN ('TEMP_ORGANIZE', 'INTERNAL_USE')),
  CHECK ("status" IN ('RECEIVED', 'CONFIRMED', 'SUSPENDED')),
  CHECK ("validUntil" > "validFrom"),
  CHECK ("protectionEpoch" >= 1),
  CHECK (("basisMode" <> 'TEMP_ORGANIZE' OR "validUntil" <= "validFrom" + INTERVAL '7 days')),
  CHECK (("status" <> 'CONFIRMED' OR ("reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "basisMode" = 'INTERNAL_USE')))
);

CREATE TABLE "people" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "scopeId" UUID NOT NULL,
  "sourceId" UUID NOT NULL,
  "maintainerId" UUID NOT NULL,
  "displayName" TEXT NOT NULL,
  "aliases" TEXT[] NOT NULL,
  "roles" TEXT[] NOT NULL,
  "cityCode" TEXT,
  "languageCodes" TEXT[] NOT NULL,
  "skillCodes" TEXT[] NOT NULL,
  "heightCm" DOUBLE PRECISION,
  "intro" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "protectionEpoch" INTEGER NOT NULL,
  UNIQUE ("workspaceId", "id"),
  CHECK ("revision" >= 1),
  CHECK ("status" IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  CHECK (cardinality("roles") BETWEEN 1 AND 10),
  CHECK (("heightCm" IS NULL OR "heightCm" BETWEEN 50 AND 250))
);

CREATE TABLE "contacts" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "personId" UUID NOT NULL,
  "sourceId" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "maskedValue" TEXT NOT NULL,
  UNIQUE ("workspaceId", "id"),
  CHECK ("revision" >= 1),
  CHECK ("kind" IN ('PHONE', 'WECHAT', 'EMAIL', 'OTHER'))
);

CREATE TABLE "evidence" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "personId" UUID NOT NULL,
  "fieldPath" TEXT NOT NULL,
  "valueDigest" TEXT NOT NULL,
  "sourceId" UUID NOT NULL,
  "sourceRevision" INTEGER NOT NULL,
  "reviewerId" UUID NOT NULL,
  "reviewedAt" TIMESTAMPTZ(3) NOT NULL,
  UNIQUE ("workspaceId", "id"),
  CHECK ("revision" >= 1),
  CHECK (length("valueDigest") = 64)
);

CREATE TABLE "dictionary" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "namespace" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "labelZh" TEXT NOT NULL,
  "labelEn" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  UNIQUE ("workspaceId", "id"),
  UNIQUE ("workspaceId", "namespace", "code"),
  CHECK ("revision" >= 1),
  CHECK ("namespace" IN ('role', 'city', 'language', 'skill')),
  CHECK ("status" IN ('ACTIVE', 'INACTIVE'))
);

CREATE TABLE "receipts" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "actorId" UUID NOT NULL,
  "operation" TEXT NOT NULL,
  "commandKey" TEXT NOT NULL,
  "requestDigest" TEXT NOT NULL,
  "resourceKind" TEXT NOT NULL,
  "resourceId" UUID NOT NULL,
  "result" JSONB NOT NULL,
  UNIQUE ("workspaceId", "id"),
  UNIQUE ("workspaceId", "actorId", "operation", "commandKey"),
  CHECK ("revision" >= 1),
  CHECK (jsonb_typeof("result") = 'object'),
  CHECK (length("requestDigest") = 64)
);

CREATE TABLE "audits" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "actorId" UUID,
  "action" TEXT NOT NULL,
  "resourceKind" TEXT NOT NULL,
  "resourceId" UUID NOT NULL,
  "changedFields" TEXT[] NOT NULL,
  "requestId" UUID NOT NULL,
  UNIQUE ("workspaceId", "id"),
  CHECK ("revision" >= 1)
);

CREATE TABLE "rateBuckets" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "count" INTEGER NOT NULL,
  "until" TIMESTAMPTZ(3) NOT NULL,
  CHECK ("count" > 0)
);

CREATE TABLE "imports" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "actorId" UUID NOT NULL,
  "sourceId" UUID NOT NULL,
  "sourceRevision" INTEGER NOT NULL,
  "scopeId" UUID NOT NULL,
  "rows" JSONB NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  UNIQUE ("workspaceId", "id"),
  CHECK ("revision" >= 1),
  CHECK (jsonb_typeof("rows") = 'array'),
  CHECK (jsonb_array_length("rows") BETWEEN 1 AND 100)
);

CREATE TABLE "jobs" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "actorId" UUID NOT NULL,
  "aggregateId" UUID NOT NULL,
  "selectedRows" INTEGER[] NOT NULL,
  "state" TEXT NOT NULL,
  "leaseToken" UUID,
  "leaseUntil" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL,
  "errorCode" TEXT,
  UNIQUE ("workspaceId", "id"),
  UNIQUE ("workspaceId", "type", "aggregateId"),
  CHECK ("revision" >= 1),
  CHECK ("type" IN ('IMPORT_PEOPLE')),
  CHECK ("state" IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  CHECK ("attempts" BETWEEN 0 AND 3),
  CHECK ((("state" = 'RUNNING' AND "leaseToken" IS NOT NULL AND "leaseUntil" IS NOT NULL) OR ("state" <> 'RUNNING' AND "leaseToken" IS NULL AND "leaseUntil" IS NULL)))
);

ALTER TABLE "users" ADD CONSTRAINT "users_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "users_idx_0" ON "users" ("workspaceId", "createdAt");
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userIdRef_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "users" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "memberships_idx_0" ON "memberships" ("workspaceId", "createdAt");
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_membershipIdRef_fkey" FOREIGN KEY ("workspaceId", "membershipId") REFERENCES "memberships" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "sessions_idx_0" ON "sessions" ("workspaceId", "createdAt");
CREATE INDEX "sessions_idx_1" ON "sessions" ("idleUntil");
ALTER TABLE "activations" ADD CONSTRAINT "activations_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activations" ADD CONSTRAINT "activations_userIdRef_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "users" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "activations_idx_0" ON "activations" ("workspaceId", "createdAt");
CREATE INDEX "activations_idx_1" ON "activations" ("expiresAt");
ALTER TABLE "scopes" ADD CONSTRAINT "scopes_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "scopes_idx_0" ON "scopes" ("workspaceId", "createdAt");
ALTER TABLE "scopeMembers" ADD CONSTRAINT "scopeMembers_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scopeMembers" ADD CONSTRAINT "scopeMembers_scopeIdRef_fkey" FOREIGN KEY ("workspaceId", "scopeId") REFERENCES "scopes" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scopeMembers" ADD CONSTRAINT "scopeMembers_membershipIdRef_fkey" FOREIGN KEY ("workspaceId", "membershipId") REFERENCES "memberships" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "scopeMembers_idx_0" ON "scopeMembers" ("workspaceId", "createdAt");
ALTER TABLE "sources" ADD CONSTRAINT "sources_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sources" ADD CONSTRAINT "sources_scopeIdRef_fkey" FOREIGN KEY ("workspaceId", "scopeId") REFERENCES "scopes" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sources" ADD CONSTRAINT "sources_maintainerIdRef_fkey" FOREIGN KEY ("workspaceId", "maintainerId") REFERENCES "memberships" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sources" ADD CONSTRAINT "sources_reviewedByRef_fkey" FOREIGN KEY ("workspaceId", "reviewedBy") REFERENCES "memberships" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "sources_idx_0" ON "sources" ("workspaceId", "createdAt");
CREATE INDEX "sources_idx_1" ON "sources" ("workspaceId", "scopeId");
CREATE INDEX "sources_idx_2" ON "sources" ("validUntil");
ALTER TABLE "people" ADD CONSTRAINT "people_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "people" ADD CONSTRAINT "people_scopeIdRef_fkey" FOREIGN KEY ("workspaceId", "scopeId") REFERENCES "scopes" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "people" ADD CONSTRAINT "people_sourceIdRef_fkey" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "people" ADD CONSTRAINT "people_maintainerIdRef_fkey" FOREIGN KEY ("workspaceId", "maintainerId") REFERENCES "memberships" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "people_idx_0" ON "people" ("workspaceId", "createdAt");
CREATE INDEX "people_idx_1" ON "people" ("workspaceId", "sourceId");
CREATE INDEX "people_idx_2" ON "people" ("workspaceId", "scopeId");
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_personIdRef_fkey" FOREIGN KEY ("workspaceId", "personId") REFERENCES "people" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_sourceIdRef_fkey" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "contacts_idx_0" ON "contacts" ("workspaceId", "createdAt");
CREATE INDEX "contacts_idx_1" ON "contacts" ("workspaceId", "personId");
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_personIdRef_fkey" FOREIGN KEY ("workspaceId", "personId") REFERENCES "people" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_sourceIdRef_fkey" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_reviewerIdRef_fkey" FOREIGN KEY ("workspaceId", "reviewerId") REFERENCES "memberships" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "evidence_idx_0" ON "evidence" ("workspaceId", "createdAt");
CREATE INDEX "evidence_idx_1" ON "evidence" ("workspaceId", "personId");
ALTER TABLE "dictionary" ADD CONSTRAINT "dictionary_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "dictionary_idx_0" ON "dictionary" ("workspaceId", "createdAt");
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_actorIdRef_fkey" FOREIGN KEY ("workspaceId", "actorId") REFERENCES "memberships" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "receipts_idx_0" ON "receipts" ("workspaceId", "createdAt");
ALTER TABLE "audits" ADD CONSTRAINT "audits_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audits" ADD CONSTRAINT "audits_actorIdRef_fkey" FOREIGN KEY ("workspaceId", "actorId") REFERENCES "memberships" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "audits_idx_0" ON "audits" ("workspaceId", "createdAt");
CREATE INDEX "audits_idx_1" ON "audits" ("workspaceId", "resourceKind", "resourceId");
ALTER TABLE "rateBuckets" ADD CONSTRAINT "rateBuckets_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "rateBuckets_idx_0" ON "rateBuckets" ("until");
ALTER TABLE "imports" ADD CONSTRAINT "imports_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imports" ADD CONSTRAINT "imports_actorIdRef_fkey" FOREIGN KEY ("workspaceId", "actorId") REFERENCES "memberships" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imports" ADD CONSTRAINT "imports_sourceIdRef_fkey" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imports" ADD CONSTRAINT "imports_scopeIdRef_fkey" FOREIGN KEY ("workspaceId", "scopeId") REFERENCES "scopes" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "imports_idx_0" ON "imports" ("workspaceId", "createdAt");
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_actorIdRef_fkey" FOREIGN KEY ("workspaceId", "actorId") REFERENCES "memberships" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_aggregateIdRef_fkey" FOREIGN KEY ("workspaceId", "aggregateId") REFERENCES "imports" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "jobs_idx_0" ON "jobs" ("workspaceId", "createdAt");
CREATE INDEX "jobs_idx_1" ON "jobs" ("state", "leaseUntil");
COMMIT;
