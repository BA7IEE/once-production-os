-- H1 additive migration. No data reset or rewrite of previous migrations.
-- No existing record receives access; the new table starts empty.
BEGIN;
CREATE TABLE "handoffs" (
    "id" UUID NOT NULL PRIMARY KEY,
    "workspaceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "revision" INTEGER NOT NULL CHECK ("revision" > 0),
    "personId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "personScopeId" UUID NOT NULL,
    "sourceScopeId" UUID NOT NULL,
    "senderRevision" INTEGER NOT NULL CHECK ("senderRevision" > 0),
    "recipientRevision" INTEGER NOT NULL CHECK ("recipientRevision" > 0),
    "personRevision" INTEGER NOT NULL CHECK ("personRevision" > 0),
    "sourceRevision" INTEGER NOT NULL CHECK ("sourceRevision" > 0),
    "personEpoch" INTEGER NOT NULL CHECK ("personEpoch" > 0),
    "sourceEpoch" INTEGER NOT NULL CHECK ("sourceEpoch" > 0),
    "personScopeRevision" INTEGER NOT NULL CHECK ("personScopeRevision" > 0),
    "sourceScopeRevision" INTEGER NOT NULL CHECK ("sourceScopeRevision" > 0),
    "purpose" TEXT NOT NULL CHECK ("purpose" IN ('EDIT','REVIEW')),
    "state" TEXT NOT NULL CHECK ("state" IN ('PENDING','ACCEPTED','DECLINED','REVOKED')),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "closedById" UUID,
    CONSTRAINT "handoffs_participants_check" CHECK ("senderId" <> "recipientId"),
    CONSTRAINT "handoffs_times_check" CHECK ("updatedAt" >= "createdAt" AND "expiresAt" > "createdAt"
        AND "expiresAt" <= "createdAt" + interval '7 days'
        AND ("acceptedAt" IS NULL OR ("acceptedAt" >= "createdAt" AND "acceptedAt" < "expiresAt"))
        AND ("closedAt" IS NULL OR "closedAt" >= COALESCE("acceptedAt", "createdAt"))),
    CONSTRAINT "handoffs_state_shape_check" CHECK (
        ("state" = 'PENDING' AND "acceptedAt" IS NULL AND "closedAt" IS NULL AND "closedById" IS NULL)
        OR ("state" = 'ACCEPTED' AND "acceptedAt" IS NOT NULL AND "closedAt" IS NULL AND "closedById" IS NULL)
        OR ("state" = 'DECLINED' AND "acceptedAt" IS NULL AND "closedAt" IS NOT NULL AND "closedById" IS NOT NULL AND "closedById" = "recipientId")
        OR ("state" = 'REVOKED' AND "closedAt" IS NOT NULL AND "closedById" IS NOT NULL AND "closedById" IN ("senderId", "recipientId"))),
    CONSTRAINT "handoffs_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "handoffs_personIdRef_fkey" FOREIGN KEY ("workspaceId", "personId") REFERENCES "people"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "handoffs_sourceIdRef_fkey" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "handoffs_senderIdRef_fkey" FOREIGN KEY ("workspaceId", "senderId") REFERENCES "memberships"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "handoffs_recipientIdRef_fkey" FOREIGN KEY ("workspaceId", "recipientId") REFERENCES "memberships"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "handoffs_personScopeIdRef_fkey" FOREIGN KEY ("workspaceId", "personScopeId") REFERENCES "scopes"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "handoffs_sourceScopeIdRef_fkey" FOREIGN KEY ("workspaceId", "sourceScopeId") REFERENCES "scopes"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "handoffs_closedByIdRef_fkey" FOREIGN KEY ("workspaceId", "closedById") REFERENCES "memberships"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "handoffs_workspaceId_id_key" ON "handoffs"("workspaceId", "id");
CREATE INDEX "handoffs_recipient_idx" ON "handoffs"("workspaceId", "recipientId", "state", "personId");
CREATE INDEX "handoffs_sender_idx" ON "handoffs"("workspaceId", "senderId", "createdAt");
COMMIT;
