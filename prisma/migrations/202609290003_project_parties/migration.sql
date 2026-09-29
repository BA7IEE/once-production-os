BEGIN;
CREATE TABLE "brands" (
 "id" UUID PRIMARY KEY,"workspaceId" UUID NOT NULL,"sourceId" UUID NOT NULL,"scopeId" UUID NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL,"updatedAt" TIMESTAMPTZ(3) NOT NULL,"revision" INTEGER NOT NULL CHECK("revision">0),
 "name" TEXT NOT NULL CHECK(length(trim("name")) BETWEEN 1 AND 160),"organizationId" UUID,
 "status" TEXT NOT NULL CHECK("status" IN ('ACTIVE','ARCHIVED')),UNIQUE("workspaceId","id"),
 FOREIGN KEY("workspaceId") REFERENCES "workspaces"("id") DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY("workspaceId","sourceId") REFERENCES "sources"("workspaceId","id") DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY("workspaceId","scopeId") REFERENCES "scopes"("workspaceId","id") DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY("workspaceId","organizationId") REFERENCES "organizations"("workspaceId","id") DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE "projectParties" (
 "id" UUID PRIMARY KEY,"workspaceId" UUID NOT NULL,"projectId" UUID NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL,"updatedAt" TIMESTAMPTZ(3) NOT NULL,"revision" INTEGER NOT NULL CHECK("revision">0),
 "clientOrganizationId" UUID,"brandId" UUID,UNIQUE("workspaceId","id"),UNIQUE("workspaceId","projectId"),
 FOREIGN KEY("workspaceId") REFERENCES "workspaces"("id") DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY("workspaceId","projectId") REFERENCES "projects"("workspaceId","id") DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY("workspaceId","clientOrganizationId") REFERENCES "organizations"("workspaceId","id") DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY("workspaceId","brandId") REFERENCES "brands"("workspaceId","id") DEFERRABLE INITIALLY DEFERRED
);
COMMIT;
