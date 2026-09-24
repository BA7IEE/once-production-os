import { v, uuid, revision, dateIso } from './validation.ts';
import { EXPORT_FIELD_CODES as F, EXPORT_LIMITS as L } from './export-model.ts';

const field = v.enum(F);
export const ExportSchemas = {
    permissionCreate: v.object({
        sourceId: uuid,
        subjectKind: v.enum(['SOURCE', 'PERSON', 'WORK', 'PROJECT', 'ASSET']),
        subjectId: uuid,
        fields: v.array(field, L.fields, 1),
        validUntil: dateIso,
        evidenceNote: v.string(2000, 4)
    }),
    permissionRevoke: v.object({ expectedRevision: revision }),
    create: v.object({
        format: v.enum(['JSON']),
        selectedIds: v.object({
            people: v.array(uuid, L.people),
            works: v.array(uuid, L.works),
            projects: v.array(uuid, L.projects)
        }),
        fields: v.array(field, L.fields, 1),
        usePermissionRefs: v.array(uuid, L.permissionRefs, 1)
    })
};
