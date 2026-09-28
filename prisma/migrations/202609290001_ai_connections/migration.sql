CREATE TABLE "aiConnections" (
 "id" uuid PRIMARY KEY, "workspaceId" uuid NOT NULL UNIQUE REFERENCES "workspaces"("id") ON DELETE RESTRICT,
 "createdAt" timestamptz(3) NOT NULL, "updatedAt" timestamptz(3) NOT NULL,
 "revision" integer NOT NULL CHECK ("revision">0), "settings" jsonb NOT NULL,
 "keyCipher" text NOT NULL, "currency" text NOT NULL CHECK ("currency" ~ '^[A-Z]{3}$'),
 "perTaskLimitUnits" integer NOT NULL CHECK ("perTaskLimitUnits">0),
 "dailyLimitUnits" integer NOT NULL CHECK ("dailyLimitUnits">= "perTaskLimitUnits")
);

CREATE TABLE "aiResponseMetadata" (
 "id" uuid PRIMARY KEY, "workspaceId" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE RESTRICT,
 "createdAt" timestamptz(3) NOT NULL, "updatedAt" timestamptz(3) NOT NULL, "revision" integer NOT NULL CHECK ("revision"=1),
 "runId" uuid NOT NULL UNIQUE, "inputTokens" integer CHECK ("inputTokens">=0), "outputTokens" integer CHECK ("outputTokens">=0),
 "cacheReadTokens" integer CHECK ("cacheReadTokens">=0), "cacheWriteTokens" integer CHECK ("cacheWriteTokens">=0), "reasoningTokens" integer CHECK ("reasoningTokens">=0),
 "providerResponseId" text, "outputStatus" text NOT NULL CHECK ("outputStatus" IN ('VALID_JSON','INVALID_JSON','INCOMPLETE')),
 UNIQUE("workspaceId","runId"),
 FOREIGN KEY ("workspaceId","runId") REFERENCES "aiRuns"("workspaceId","id") ON DELETE RESTRICT
);
CREATE TRIGGER ai_response_metadata_guard BEFORE UPDATE OR DELETE ON "aiResponseMetadata" FOR EACH ROW EXECUTE FUNCTION once_ai_release_guard();
