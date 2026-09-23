-- Additive upgrade from the already-applied 202609220001_initial migration.
-- Stop API/Worker before migrating; old binaries do not append history.
BEGIN;
CREATE TABLE "sourceHistory" (
    "id" UUID NOT NULL PRIMARY KEY,
    "workspaceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "revision" INTEGER NOT NULL CHECK ("revision" = 1),
    "sourceId" UUID NOT NULL,
    "sourceRevision" INTEGER NOT NULL CHECK ("sourceRevision" > 0),
    "scopeId" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL CHECK ("action" IN ('CREATED','EDITED','REVIEWED','SUSPENDED','SCOPE_CHANGED','BASELINE')),
    "decisionReason" TEXT,
    "baselineOnly" BOOLEAN NOT NULL,
    "basisAmbiguous" BOOLEAN NOT NULL,
    "snapshot" JSONB NOT NULL,
    CONSTRAINT "sourceHistory_shape_check" CHECK (
        COALESCE(jsonb_typeof("snapshot") = 'object'
        AND "snapshot"->>'id' = "sourceId"::text
        AND "snapshot"->>'workspaceId' = "workspaceId"::text
        AND "snapshot"->>'scopeId' = "scopeId"::text
        AND "snapshot"->>'revision' = "sourceRevision"::text, false)),
    CONSTRAINT "sourceHistory_decision_check" CHECK (
        ("baselineOnly" AND "action" = 'BASELINE' AND "actorId" IS NULL AND "decisionReason" IS NULL)
        OR (NOT "baselineOnly" AND "action" <> 'BASELINE' AND "actorId" IS NOT NULL
            AND (("action" = 'SUSPENDED' AND "decisionReason" IS NOT NULL)
                OR ("action" <> 'SUSPENDED' AND "decisionReason" IS NULL)))),
    CONSTRAINT "sourceHistory_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sourceHistory_sourceIdRef_fkey" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "sources"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sourceHistory_scopeIdRef_fkey" FOREIGN KEY ("workspaceId", "scopeId") REFERENCES "scopes"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sourceHistory_actorIdRef_fkey" FOREIGN KEY ("workspaceId", "actorId") REFERENCES "memberships"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sourceHistory_workspaceId_id_key" ON "sourceHistory"("workspaceId", "id");
CREATE UNIQUE INDEX "sourceHistory_workspaceId_sourceId_sourceRevision_key" ON "sourceHistory"("workspaceId", "sourceId", "sourceRevision");

-- This is an OBSERVED baseline, not reconstructed historical authorization.
-- An old SUSPENDED row may contain its pause reason in basisDescription. Keep that evidence
-- unchanged, mark baselineOnly, and warn in the read DTO/UI. Never invent the lost basis.
INSERT INTO "sourceHistory" ("id", "workspaceId", "createdAt", "updatedAt", "revision", "sourceId",
    "sourceRevision", "scopeId", "actorId", "action", "decisionReason", "baselineOnly", "basisAmbiguous", "snapshot")
SELECT gen_random_uuid(), s."workspaceId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, s."id",
    s."revision", s."scopeId", NULL, 'BASELINE', NULL, true, s."status" = 'SUSPENDED',
    jsonb_build_object('id', s."id", 'workspaceId', s."workspaceId", 'createdAt', s."createdAt",
        'updatedAt', s."updatedAt", 'revision', s."revision", 'scopeId', s."scopeId",
        'maintainerId', s."maintainerId", 'title', s."title", 'type', s."type",
        'providerClaim', s."providerClaim", 'textPayload', s."textPayload", 'basisMode', s."basisMode",
        'basisDescription', s."basisDescription", 'validFrom', s."validFrom", 'validUntil', s."validUntil",
        'status', s."status", 'protectionEpoch', s."protectionEpoch", 'reviewedBy', s."reviewedBy", 'reviewedAt', s."reviewedAt")
FROM "sources" s;

CREATE FUNCTION once_source_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'sourceHistory is append-only; use a separately reviewed retention procedure'
        USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER "sourceHistory_immutable" BEFORE UPDATE OR DELETE ON "sourceHistory"
    FOR EACH ROW EXECUTE FUNCTION once_source_history_immutable();
COMMIT;
