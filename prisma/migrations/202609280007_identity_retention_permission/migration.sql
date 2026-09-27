-- Preserve the immutable person-origin FK; an explicitly approved live basis is separate.
ALTER TABLE "usePermissions" ADD COLUMN "retentionBasisSourceId" UUID;
ALTER TABLE "usePermissions" ADD CONSTRAINT "usePermissions_retention_basis_kind_check"
 CHECK ("retentionBasisSourceId" IS NULL OR
   ("subjectKind"='PERSON' AND "subjectPersonId" IS NOT NULL AND "retentionBasisSourceId"<>"sourceId"));
ALTER TABLE "usePermissions" ADD CONSTRAINT "usePermissions_retentionBasisSourceRef_fkey"
 FOREIGN KEY ("workspaceId","retentionBasisSourceId") REFERENCES "sources"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "usePermissions_retention_basis_idx" ON "usePermissions"("workspaceId","retentionBasisSourceId");
