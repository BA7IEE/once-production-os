import { v, uuid, revision, code, SourceInput } from './validation.ts';
import { PRODUCTION_LIMITS as L } from './production-model.ts';
const root = { title: v.string(160, 1), sourceId: v.optional(uuid), inlineSource: v.optional(SourceInput) };
const origin = v.enum(['ONCE', 'EXTERNAL', 'UNKNOWN']);
const workStatus = v.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);
const projectStatus = v.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED']);
const participantState = v.enum(['NOMINATED', 'CONFIRMED', 'ACTUAL']);
export const ProductionSchemas = {
    workCreate: v.object({ ...root, description: v.optional(v.string(5000)), industryCode: v.optional(v.nullable(code)), workTypeCodes: v.optional(v.array(code, 10)), origin: v.optional(origin), originNote: v.optional(v.string(2000)) }),
    workPatch: v.object({ expectedRevision: revision, title: v.optional(v.string(160, 1)), description: v.optional(v.string(5000)), industryCode: v.optional(v.nullable(code)), workTypeCodes: v.optional(v.array(code, 10)), origin: v.optional(origin), originNote: v.optional(v.string(2000)), status: v.optional(workStatus) }),
    workAsset: v.object({ expectedRevision: revision, assetId: uuid }),
    remove: v.object({ expectedRevision: revision, entryId: uuid }),
    order: v.object({ expectedRevision: revision, entryIds: v.array(uuid, L.assets), coverEntryId: v.nullable(uuid) }),
    credit: v.object({ expectedRevision: revision, personId: uuid, roleCode: code, note: v.string(1000) }),
    projectCreate: v.object({ ...root, brief: v.optional(v.string(5000)), locationNote: v.optional(v.string(500)), dateNote: v.optional(v.string(500)) }),
    projectPatch: v.object({ expectedRevision: revision, title: v.optional(v.string(160, 1)), brief: v.optional(v.string(5000)), locationNote: v.optional(v.string(500)), dateNote: v.optional(v.string(500)), reviewNote: v.optional(v.string(5000)), status: v.optional(projectStatus) }),
    participant: v.object({ expectedRevision: revision, personId: uuid, roleCode: code, state: participantState, note: v.string(1000) }),
    participantPatch: v.object({ expectedRevision: revision, entryId: uuid, state: participantState, note: v.string(1000) }),
    projectWork: v.object({ expectedRevision: revision, workId: uuid, relation: v.enum(['REFERENCE', 'DELIVERABLE']) })
};
