-- PR-02a: independent talent principals. Previous 55 migrations remain immutable.

CREATE TABLE "talentAccounts" (
 "id" uuid NOT NULL PRIMARY KEY,
 "workspaceId" uuid NOT NULL,
 "createdAt" timestamptz(3) NOT NULL,
 "updatedAt" timestamptz(3) NOT NULL,
 "revision" integer NOT NULL,
 "status" text NOT NULL,
 "sessionEpoch" integer NOT NULL,
 UNIQUE ("workspaceId","id"),
 FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
 CHECK ("revision">0),
 CHECK (status IN ('ACTIVE','DISABLED','ERASED')),
 CHECK ("sessionEpoch">0)
);

CREATE TABLE "talentIdentities" (
 "id" uuid NOT NULL PRIMARY KEY,
 "workspaceId" uuid NOT NULL,
 "createdAt" timestamptz(3) NOT NULL,
 "updatedAt" timestamptz(3) NOT NULL,
 "revision" integer NOT NULL,
 "talentAccountId" uuid NOT NULL,
 "kind" text NOT NULL,
 "identityHash" text NOT NULL,
 "encryptedValue" text,
 "verifiedAt" timestamptz(3) NOT NULL,
 UNIQUE ("workspaceId","id"),
 FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
 CHECK ("revision">0),
 FOREIGN KEY ("workspaceId","talentAccountId") REFERENCES "talentAccounts"("workspaceId","id") ON DELETE RESTRICT,
 UNIQUE ("workspaceId","kind","identityHash"),
 CHECK (kind IN ('EMAIL','PHONE')),
 CHECK ("identityHash" ~ '^[a-f0-9]{64}$')
);

CREATE TABLE "talentSessions" (
 "id" uuid NOT NULL PRIMARY KEY,
 "workspaceId" uuid NOT NULL,
 "createdAt" timestamptz(3) NOT NULL,
 "updatedAt" timestamptz(3) NOT NULL,
 "revision" integer NOT NULL,
 "talentAccountId" uuid NOT NULL,
 "tokenHash" text NOT NULL,
 "sessionEpoch" integer NOT NULL,
 "recoveryEpoch" text NOT NULL,
 "idleUntil" timestamptz(3) NOT NULL,
 "absoluteUntil" timestamptz(3) NOT NULL,
 "revokedAt" timestamptz(3),
 UNIQUE ("workspaceId","id"),
 FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
 CHECK ("revision">0),
 FOREIGN KEY ("workspaceId","talentAccountId") REFERENCES "talentAccounts"("workspaceId","id") ON DELETE RESTRICT,
 UNIQUE ("tokenHash"),
 CHECK ("sessionEpoch">0),
 CHECK ("idleUntil" <= "absoluteUntil")
);

CREATE TABLE "talentAuthContexts" (
 "id" uuid NOT NULL PRIMARY KEY,
 "workspaceId" uuid NOT NULL,
 "createdAt" timestamptz(3) NOT NULL,
 "updatedAt" timestamptz(3) NOT NULL,
 "revision" integer NOT NULL,
 "browserHash" text NOT NULL,
 "purpose" text NOT NULL,
 "recoveryEpoch" text NOT NULL,
 "expiresAt" timestamptz(3) NOT NULL,
 UNIQUE ("workspaceId","id"),
 FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
 CHECK ("revision">0),
 CHECK (purpose IN ('LOGIN','RECOVER'))
);

CREATE TABLE "talentAuthChallenges" (
 "id" uuid NOT NULL PRIMARY KEY,
 "workspaceId" uuid NOT NULL,
 "createdAt" timestamptz(3) NOT NULL,
 "updatedAt" timestamptz(3) NOT NULL,
 "revision" integer NOT NULL,
 "contextId" uuid NOT NULL,
 "kind" text NOT NULL,
 "identityHash" text NOT NULL,
 "purpose" text NOT NULL,
 "codeHash" text,
 "state" text NOT NULL,
 "attempts" integer NOT NULL,
 "recoveryEpoch" text NOT NULL,
 "expiresAt" timestamptz(3) NOT NULL,
 "consumedAt" timestamptz(3),
 UNIQUE ("workspaceId","id"),
 FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
 CHECK ("revision">0),
 CHECK (purpose IN ('LOGIN','RECOVER')),
 FOREIGN KEY ("workspaceId","contextId") REFERENCES "talentAuthContexts"("workspaceId","id") ON DELETE RESTRICT,
 CHECK (attempts>=0),
 CHECK (kind IN ('EMAIL','PHONE')),
 CHECK (state IN ('CREATED','QUEUED','ACCEPTED','DELIVERED','FAILED','UNKNOWN','CONSUMED','EXPIRED'))
);

CREATE TABLE "talentAuthDeliveries" (
 "id" uuid NOT NULL PRIMARY KEY,
 "workspaceId" uuid NOT NULL,
 "createdAt" timestamptz(3) NOT NULL,
 "updatedAt" timestamptz(3) NOT NULL,
 "revision" integer NOT NULL,
 "challengeId" uuid NOT NULL,
 "state" text NOT NULL,
 "encryptedPayload" text,
 "providerRequestKey" text NOT NULL,
 "expiresAt" timestamptz(3) NOT NULL,
 UNIQUE ("workspaceId","id"),
 FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
 CHECK ("revision">0),
 FOREIGN KEY ("workspaceId","challengeId") REFERENCES "talentAuthChallenges"("workspaceId","id") ON DELETE RESTRICT,
 UNIQUE ("workspaceId","challengeId"),
 CHECK (state IN ('CREATED','QUEUED','ACCEPTED','DELIVERED','FAILED','UNKNOWN','CONSUMED','EXPIRED'))
);

ALTER TABLE "receipts" ADD COLUMN "principalKind" text, ADD COLUMN "talentAccountId" uuid;

UPDATE "receipts" SET "principalKind"=CASE WHEN "servicePrincipalId" IS NOT NULL THEN 'MACHINE' WHEN "actorId" IS NOT NULL THEN 'INTERNAL' ELSE 'SYSTEM' END;

ALTER TABLE "receipts" ALTER COLUMN "principalKind" SET NOT NULL;

ALTER TABLE "receipts" DROP CONSTRAINT "receipts_td2_actor";

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_talent_fk" FOREIGN KEY ("workspaceId","talentAccountId") REFERENCES "talentAccounts"("workspaceId","id") ON DELETE RESTRICT;

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_principal_xor" CHECK (("principalKind"='INTERNAL' AND "actorId" IS NOT NULL AND num_nonnulls("actorId","servicePrincipalId","talentAccountId")=1) OR ("principalKind"='MACHINE' AND "servicePrincipalId" IS NOT NULL AND num_nonnulls("actorId","servicePrincipalId","talentAccountId")=1) OR ("principalKind"='TALENT' AND "talentAccountId" IS NOT NULL AND num_nonnulls("actorId","servicePrincipalId","talentAccountId")=1));

CREATE UNIQUE INDEX "receipts_talent_key" ON "receipts"("workspaceId","talentAccountId","operation","commandKey") WHERE "principalKind"='TALENT';

ALTER TABLE "audits" ADD COLUMN "principalKind" text, ADD COLUMN "talentAccountId" uuid;

UPDATE "audits" SET "principalKind"=CASE WHEN "servicePrincipalId" IS NOT NULL THEN 'MACHINE' WHEN "actorId" IS NOT NULL THEN 'INTERNAL' ELSE 'SYSTEM' END;

ALTER TABLE "audits" ALTER COLUMN "principalKind" SET NOT NULL;

ALTER TABLE "audits" DROP CONSTRAINT "audits_td2_actor";

ALTER TABLE "audits" ADD CONSTRAINT "audits_talent_fk" FOREIGN KEY ("workspaceId","talentAccountId") REFERENCES "talentAccounts"("workspaceId","id") ON DELETE RESTRICT;

ALTER TABLE "audits" ADD CONSTRAINT "audits_principal_xor" CHECK (("principalKind"='INTERNAL' AND "actorId" IS NOT NULL AND num_nonnulls("actorId","servicePrincipalId","talentAccountId")=1) OR ("principalKind"='MACHINE' AND "servicePrincipalId" IS NOT NULL AND num_nonnulls("actorId","servicePrincipalId","talentAccountId")=1) OR ("principalKind"='TALENT' AND "talentAccountId" IS NOT NULL AND num_nonnulls("actorId","servicePrincipalId","talentAccountId")=1) OR ("principalKind"='SYSTEM' AND num_nonnulls("actorId","servicePrincipalId","talentAccountId")=0));
