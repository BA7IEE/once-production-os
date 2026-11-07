-- 79. Employee-owned intake uses existing Sources, employees, private assets and AI accounting.
CREATE TABLE "supplierInboxBatches" (
 id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"createdAt" timestamptz(3) NOT NULL,"updatedAt" timestamptz(3) NOT NULL,revision integer NOT NULL CHECK(revision>0),
 "sourceId" uuid NOT NULL,"scopeId" uuid NOT NULL,"maintainerId" uuid NOT NULL,"sourceRevision" integer NOT NULL CHECK("sourceRevision">0),"scopeRevision" integer NOT NULL CHECK("scopeRevision">0),
 "receivedAt" timestamptz(3) NOT NULL,"recoveryEpoch" text NOT NULL,state text NOT NULL CHECK(state IN ('OPEN','CLOSED','ERASED')),
 UNIQUE("workspaceId",id),UNIQUE("workspaceId","sourceId"),CHECK(id="sourceId"),
 FOREIGN KEY("workspaceId") REFERENCES workspaces(id),
 FOREIGN KEY("workspaceId","sourceId") REFERENCES sources("workspaceId",id),
 FOREIGN KEY("workspaceId","scopeId") REFERENCES scopes("workspaceId",id),
 FOREIGN KEY("workspaceId","maintainerId") REFERENCES memberships("workspaceId",id)
);
CREATE TABLE "supplierInboxMaterials" (
 id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"createdAt" timestamptz(3) NOT NULL,"updatedAt" timestamptz(3) NOT NULL,revision integer NOT NULL CHECK(revision>0),
 "batchId" uuid NOT NULL,"assetId" uuid,"createdById" uuid NOT NULL,"actorId" uuid NOT NULL,"actorRevision" integer NOT NULL CHECK("actorRevision">0),"userEpoch" integer NOT NULL CHECK("userEpoch">0),"recoveryEpoch" text NOT NULL,
 state text NOT NULL CHECK(state IN ('WAITING','QUEUED','PROCESSING','READY','PAUSED','COMPLETE','IGNORED','ERASED')),
 "materialKind" text NOT NULL CHECK("materialKind" IN ('UNKNOWN','PERSON_PROFILE','PORTFOLIO','MULTI_PERSON','COMPANY_PROFILE','SHOOT_BRIEF','OTHER')),
 "useAi" boolean NOT NULL,"personIds" uuid[] NOT NULL DEFAULT '{}',"workIds" uuid[] NOT NULL DEFAULT '{}',"assetIds" uuid[] NOT NULL DEFAULT '{}',"leaseToken" uuid,"leaseUntil" timestamptz(3),"runId" uuid,"errorCode" text,ciphertext text,
 UNIQUE("workspaceId",id),
 FOREIGN KEY("workspaceId","batchId") REFERENCES "supplierInboxBatches"("workspaceId",id),
 FOREIGN KEY("workspaceId","assetId") REFERENCES assets("workspaceId",id),
 FOREIGN KEY("workspaceId","actorId") REFERENCES memberships("workspaceId",id),
 FOREIGN KEY("workspaceId","createdById") REFERENCES memberships("workspaceId",id),
 FOREIGN KEY("workspaceId","runId") REFERENCES "aiRuns"("workspaceId",id),
 CHECK((state='ERASED')=(ciphertext IS NULL)),
 CHECK(cardinality("personIds")<=20 AND cardinality("workIds")<=400 AND cardinality("assetIds")<=500),
 CHECK((state='PROCESSING' AND "leaseToken" IS NOT NULL AND "leaseUntil" IS NOT NULL) OR (state<>'PROCESSING' AND "leaseToken" IS NULL AND "leaseUntil" IS NULL))
);
CREATE INDEX supplier_inbox_batch_order ON "supplierInboxBatches"("workspaceId","createdAt",id);
CREATE INDEX supplier_inbox_material_batch ON "supplierInboxMaterials"("workspaceId","batchId",state);
CREATE INDEX supplier_inbox_material_claim ON "supplierInboxMaterials"(state,"leaseUntil","createdAt",id);
CREATE UNIQUE INDEX supplier_inbox_original_once ON "supplierInboxMaterials"("workspaceId","batchId","assetId") WHERE "assetId" IS NOT NULL AND state<>'ERASED';
