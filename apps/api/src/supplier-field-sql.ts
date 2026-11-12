import {Prisma} from '@prisma/client';
import type {SupplierFieldDatabaseQuery} from '../../../packages/core/src/store.ts';
/** JSON arrays keep large authorized ID sets parameterized without PostgreSQL's
 * bind-parameter ceiling. No caller text becomes an SQL identifier. */
export function supplierFieldRootSql(q:SupplierFieldDatabaseQuery){
 const roles=q.owner==='PERSON'?Prisma.sql`f."personRoleId" IS NULL AND f."roleCode" IS NULL`:Prisma.sql`f."personRoleId" IN (SELECT value::uuid FROM jsonb_array_elements_text(${JSON.stringify(q.roleIds)}::jsonb)) AND EXISTS(SELECT 1 FROM "personRoles" r WHERE r."workspaceId"=f."workspaceId" AND r.id=f."personRoleId" AND r."personId"=f."personId" AND r."roleCode"=f."roleCode" AND r.status='ACTIVE')`;
 return Prisma.sql`SELECT f.* FROM "supplierFacts" f JOIN sources s ON s."workspaceId"=f."workspaceId" AND s.id=f."sourceId" AND s.revision=f."sourceRevision"
 WHERE f."workspaceId"=${q.workspaceId}::uuid AND f."personId" IN (SELECT value::uuid FROM jsonb_array_elements_text(${JSON.stringify(q.personIds)}::jsonb))
 AND f."sourceId" IN (SELECT value::uuid FROM jsonb_array_elements_text(${JSON.stringify(q.sourceIds)}::jsonb)) AND f."fieldCode"=${q.fieldCode}
 AND f."recordKey"='single' AND f.status='ACTIVE' AND f.visibility=${q.visibility} AND ${roles} ORDER BY f.id LIMIT 50001`;
}
