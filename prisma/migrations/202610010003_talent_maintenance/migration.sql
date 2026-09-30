-- AlterTable
ALTER TABLE "sources" ADD COLUMN     "internalUseUntil" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "talentInvitations" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "revision" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "targetPersonId" UUID,
    "scopeId" UUID NOT NULL,
    "maintainerId" UUID NOT NULL,
    "recipientHash" TEXT,
    "recipientKind" TEXT,
    "state" TEXT NOT NULL,
    "tokenHash" TEXT,
    "secretVersion" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "maxUses" INTEGER NOT NULL,
    "usedCount" INTEGER NOT NULL,
    "reservedCount" INTEGER NOT NULL,
    "recoveryEpoch" TEXT NOT NULL,
    "exposureFields" TEXT[],

    CONSTRAINT "talentInvitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talentInvitationContexts" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "revision" INTEGER NOT NULL,
    "invitationId" UUID NOT NULL,
    "browserHash" TEXT NOT NULL,
    "secretVersion" INTEGER NOT NULL,
    "recoveryEpoch" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "talentInvitationContexts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talentClaims" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "revision" INTEGER NOT NULL,
    "invitationId" UUID NOT NULL,
    "talentAccountId" UUID NOT NULL,
    "targetPersonId" UUID,
    "scopeId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "applicantKey" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "admissionUntil" TIMESTAMPTZ(3) NOT NULL,
    "reserved" BOOLEAN NOT NULL,
    "adultDeclared" BOOLEAN NOT NULL,
    "ownershipBasis" TEXT NOT NULL,
    "recoveryEpoch" TEXT NOT NULL,
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(3),

    CONSTRAINT "talentClaims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talentAccessGrants" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "revision" INTEGER NOT NULL,
    "talentAccountId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "claimId" UUID NOT NULL,
    "relation" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "actions" TEXT[],
    "authorizationEpoch" INTEGER NOT NULL,
    "selfExposureManifest" JSONB NOT NULL,
    "approvedById" UUID NOT NULL,
    "approvalBasis" TEXT NOT NULL,
    "recoveryEpoch" TEXT NOT NULL,

    CONSTRAINT "talentAccessGrants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talentConsents" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "revision" INTEGER NOT NULL,
    "talentAccountId" UUID NOT NULL,
    "personId" UUID,
    "claimId" UUID,
    "purpose" TEXT NOT NULL,
    "textVersion" TEXT NOT NULL,
    "fieldScope" TEXT[],
    "state" TEXT NOT NULL,
    "validUntil" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "talentConsents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talentSubmissions" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "revision" INTEGER NOT NULL,
    "talentAccountId" UUID NOT NULL,
    "personId" UUID,
    "claimId" UUID,
    "grantId" UUID,
    "consentId" UUID NOT NULL,
    "scopeId" UUID NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "payloadDigest" TEXT,
    "forkedFromId" UUID,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "submittedAt" TIMESTAMPTZ(3),
    "decidedAt" TIMESTAMPTZ(3),
    "decidedById" UUID,
    "publicReason" TEXT NOT NULL,
    "protectionEpoch" INTEGER NOT NULL,
    "recoveryEpoch" TEXT NOT NULL,

    CONSTRAINT "talentSubmissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talentSubmissionItems" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "revision" INTEGER NOT NULL,
    "submissionId" UUID NOT NULL,
    "clientItemKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" UUID,
    "values" JSONB NOT NULL,
    "baseline" JSONB NOT NULL,
    "dependencyGroup" TEXT NOT NULL,
    "dependsOn" TEXT[],
    "state" TEXT NOT NULL,
    "appliedId" UUID,

    CONSTRAINT "talentSubmissionItems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sourceAttributions" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "revision" INTEGER NOT NULL,
    "sourceId" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "talentAccountId" UUID NOT NULL,
    "consentId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "materialDescription" TEXT NOT NULL,

    CONSTRAINT "sourceAttributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sourceUseBases" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "revision" INTEGER NOT NULL,
    "sourceId" UUID NOT NULL,
    "consentId" UUID NOT NULL,
    "consentRevision" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "fieldScope" TEXT[],
    "state" TEXT NOT NULL,
    "validUntil" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sourceUseBases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "talentInvitations_workspaceId_id_key" ON "talentInvitations"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "talentInvitationContexts_workspaceId_id_key" ON "talentInvitationContexts"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "talentClaims_workspaceId_id_key" ON "talentClaims"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "talentAccessGrants_workspaceId_id_key" ON "talentAccessGrants"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "talentConsents_workspaceId_id_key" ON "talentConsents"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "talentSubmissions_workspaceId_id_key" ON "talentSubmissions"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "talentSubmissionItems_workspaceId_id_key" ON "talentSubmissionItems"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sourceAttributions_workspaceId_id_key" ON "sourceAttributions"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sourceUseBases_workspaceId_id_key" ON "sourceUseBases"("workspaceId", "id");

ALTER TABLE "talentInvitations" ADD CONSTRAINT "talentInvitations_workspace_fk" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE "talentInvitationContexts" ADD CONSTRAINT "talentInvitationContexts_workspace_fk" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE "talentClaims" ADD CONSTRAINT "talentClaims_workspace_fk" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE "talentAccessGrants" ADD CONSTRAINT "talentAccessGrants_workspace_fk" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE "talentConsents" ADD CONSTRAINT "talentConsents_workspace_fk" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE "talentSubmissions" ADD CONSTRAINT "talentSubmissions_workspace_fk" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE "talentSubmissionItems" ADD CONSTRAINT "talentSubmissionItems_workspace_fk" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE "sourceAttributions" ADD CONSTRAINT "sourceAttributions_workspace_fk" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE "sourceUseBases" ADD CONSTRAINT "sourceUseBases_workspace_fk" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE "talentInvitations" ADD CONSTRAINT "talentInvitations_targetPersonId_fk" FOREIGN KEY ("workspaceId","targetPersonId") REFERENCES "people"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentInvitations" ADD CONSTRAINT "talentInvitations_scopeId_fk" FOREIGN KEY ("workspaceId","scopeId") REFERENCES "scopes"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentInvitations" ADD CONSTRAINT "talentInvitations_maintainerId_fk" FOREIGN KEY ("workspaceId","maintainerId") REFERENCES "memberships"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentInvitationContexts" ADD CONSTRAINT "talentInvitationContexts_invitationId_fk" FOREIGN KEY ("workspaceId","invitationId") REFERENCES "talentInvitations"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentClaims" ADD CONSTRAINT "talentClaims_invitationId_fk" FOREIGN KEY ("workspaceId","invitationId") REFERENCES "talentInvitations"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentClaims" ADD CONSTRAINT "talentClaims_talentAccountId_fk" FOREIGN KEY ("workspaceId","talentAccountId") REFERENCES "talentAccounts"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentClaims" ADD CONSTRAINT "talentClaims_targetPersonId_fk" FOREIGN KEY ("workspaceId","targetPersonId") REFERENCES "people"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentClaims" ADD CONSTRAINT "talentClaims_scopeId_fk" FOREIGN KEY ("workspaceId","scopeId") REFERENCES "scopes"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentClaims" ADD CONSTRAINT "talentClaims_decidedById_fk" FOREIGN KEY ("workspaceId","decidedById") REFERENCES "memberships"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentAccessGrants" ADD CONSTRAINT "talentAccessGrants_talentAccountId_fk" FOREIGN KEY ("workspaceId","talentAccountId") REFERENCES "talentAccounts"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentAccessGrants" ADD CONSTRAINT "talentAccessGrants_personId_fk" FOREIGN KEY ("workspaceId","personId") REFERENCES "people"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentAccessGrants" ADD CONSTRAINT "talentAccessGrants_claimId_fk" FOREIGN KEY ("workspaceId","claimId") REFERENCES "talentClaims"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentAccessGrants" ADD CONSTRAINT "talentAccessGrants_approvedById_fk" FOREIGN KEY ("workspaceId","approvedById") REFERENCES "memberships"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentConsents" ADD CONSTRAINT "talentConsents_talentAccountId_fk" FOREIGN KEY ("workspaceId","talentAccountId") REFERENCES "talentAccounts"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentConsents" ADD CONSTRAINT "talentConsents_personId_fk" FOREIGN KEY ("workspaceId","personId") REFERENCES "people"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentConsents" ADD CONSTRAINT "talentConsents_claimId_fk" FOREIGN KEY ("workspaceId","claimId") REFERENCES "talentClaims"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentSubmissions" ADD CONSTRAINT "talentSubmissions_talentAccountId_fk" FOREIGN KEY ("workspaceId","talentAccountId") REFERENCES "talentAccounts"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentSubmissions" ADD CONSTRAINT "talentSubmissions_personId_fk" FOREIGN KEY ("workspaceId","personId") REFERENCES "people"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentSubmissions" ADD CONSTRAINT "talentSubmissions_claimId_fk" FOREIGN KEY ("workspaceId","claimId") REFERENCES "talentClaims"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentSubmissions" ADD CONSTRAINT "talentSubmissions_grantId_fk" FOREIGN KEY ("workspaceId","grantId") REFERENCES "talentAccessGrants"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentSubmissions" ADD CONSTRAINT "talentSubmissions_consentId_fk" FOREIGN KEY ("workspaceId","consentId") REFERENCES "talentConsents"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentSubmissions" ADD CONSTRAINT "talentSubmissions_scopeId_fk" FOREIGN KEY ("workspaceId","scopeId") REFERENCES "scopes"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentSubmissions" ADD CONSTRAINT "talentSubmissions_forkedFromId_fk" FOREIGN KEY ("workspaceId","forkedFromId") REFERENCES "talentSubmissions"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentSubmissions" ADD CONSTRAINT "talentSubmissions_decidedById_fk" FOREIGN KEY ("workspaceId","decidedById") REFERENCES "memberships"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentSubmissionItems" ADD CONSTRAINT "talentSubmissionItems_submissionId_fk" FOREIGN KEY ("workspaceId","submissionId") REFERENCES "talentSubmissions"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "sourceAttributions" ADD CONSTRAINT "sourceAttributions_sourceId_fk" FOREIGN KEY ("workspaceId","sourceId") REFERENCES "sources"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "sourceAttributions" ADD CONSTRAINT "sourceAttributions_submissionId_fk" FOREIGN KEY ("workspaceId","submissionId") REFERENCES "talentSubmissions"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "sourceAttributions" ADD CONSTRAINT "sourceAttributions_talentAccountId_fk" FOREIGN KEY ("workspaceId","talentAccountId") REFERENCES "talentAccounts"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "sourceAttributions" ADD CONSTRAINT "sourceAttributions_consentId_fk" FOREIGN KEY ("workspaceId","consentId") REFERENCES "talentConsents"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "sourceAttributions" ADD CONSTRAINT "sourceAttributions_reviewerId_fk" FOREIGN KEY ("workspaceId","reviewerId") REFERENCES "memberships"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "sourceUseBases" ADD CONSTRAINT "sourceUseBases_sourceId_fk" FOREIGN KEY ("workspaceId","sourceId") REFERENCES "sources"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "sourceUseBases" ADD CONSTRAINT "sourceUseBases_consentId_fk" FOREIGN KEY ("workspaceId","consentId") REFERENCES "talentConsents"("workspaceId",id) ON DELETE RESTRICT;

ALTER TABLE "talentInvitations" ADD CONSTRAINT invitation_shape CHECK ((purpose='CLAIM' AND "targetPersonId" IS NOT NULL AND "maxUses"=1) OR (purpose='ENROLL' AND "targetPersonId" IS NULL));
ALTER TABLE "talentInvitations" ADD CONSTRAINT invitation_quota CHECK ("maxUses" BETWEEN 1 AND 1000 AND "usedCount">=0 AND "reservedCount">=0 AND "usedCount"+"reservedCount"<="maxUses");
ALTER TABLE "talentInvitations" ADD CONSTRAINT invitation_state CHECK (state IN ('DRAFT','ACTIVE','CLAIMED','REVOKED','EXPIRED','EXHAUSTED'));
ALTER TABLE "talentAccessGrants" ADD CONSTRAINT grant_state CHECK (state IN ('ACTIVE','REVOKED','RECOVERY_REVIEW') AND relation IN ('SELF','GUARDIAN','AGENT'));
CREATE UNIQUE INDEX grant_self_person_unique ON "talentAccessGrants" ("workspaceId","personId") WHERE state='ACTIVE' AND relation='SELF';
CREATE UNIQUE INDEX grant_self_account_unique ON "talentAccessGrants" ("workspaceId","talentAccountId") WHERE state='ACTIVE' AND relation='SELF';
CREATE UNIQUE INDEX grant_claim_unique ON "talentAccessGrants" ("workspaceId","claimId");
CREATE UNIQUE INDEX claim_open_applicant_unique ON "talentClaims" ("workspaceId","talentAccountId",relation,"applicantKey") WHERE kind='ENROLL' AND state='PENDING';
ALTER TABLE "talentClaims" ADD CONSTRAINT claim_shape CHECK (kind IN ('CLAIM','ENROLL') AND relation IN ('SELF','GUARDIAN','AGENT') AND state IN ('PENDING','APPROVED','REJECTED','WITHDRAWN','EXPIRED') AND (kind<>'CLAIM' OR "targetPersonId" IS NOT NULL) AND (NOT reserved OR kind='ENROLL' AND state='PENDING'));
ALTER TABLE "talentSubmissions" ADD CONSTRAINT submission_context CHECK (("personId" IS NOT NULL AND "grantId" IS NOT NULL) OR ("personId" IS NULL AND "claimId" IS NOT NULL AND "grantId" IS NULL));
ALTER TABLE "talentSubmissions" ADD CONSTRAINT submission_state CHECK (state IN ('DRAFT','SUBMITTED','APPROVED','PARTIALLY_APPROVED','REJECTED','NEEDS_REBASE','WITHDRAWN','EXPIRED'));
ALTER TABLE "talentConsents" ADD CONSTRAINT consent_shape CHECK (purpose='INTERNAL_DIRECTORY' AND state IN ('ACTIVE','REVOKED') AND ("personId" IS NOT NULL OR "claimId" IS NOT NULL));
ALTER TABLE "sourceUseBases" ADD CONSTRAINT use_basis_shape CHECK (purpose='INTERNAL_DIRECTORY' AND state IN ('ACTIVE','REVOKED'));
CREATE UNIQUE INDEX submission_item_key_unique ON "talentSubmissionItems" ("workspaceId","submissionId","clientItemKey");
CREATE UNIQUE INDEX attribution_source_unique ON "sourceAttributions" ("workspaceId","sourceId");
CREATE UNIQUE INDEX basis_source_unique ON "sourceUseBases" ("workspaceId","sourceId");
