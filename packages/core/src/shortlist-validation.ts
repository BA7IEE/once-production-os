import { v, uuid, revision } from './validation.ts';
import { SHORTLIST_LIMITS as L } from './shortlist-model.ts';

const state = v.enum(['CANDIDATE', 'PRIORITY', 'CONTACTED', 'NOT_SUITABLE']);
const status = v.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);
export const ShortlistSchemas = {
  create: v.object({ projectId: uuid, title: v.string(160, 1), brief: v.optional(v.string(5000)) }),
  patch: v.object({ expectedRevision: revision, title: v.optional(v.string(160, 1)), brief: v.optional(v.string(5000)), status: v.optional(status) }),
  personAdd: v.object({ expectedRevision: revision, personId: uuid, groupLabel: v.optional(v.string(80)), state: v.optional(state), note: v.optional(v.string(2000)) }),
  personUpdate: v.object({ expectedRevision: revision, entryId: uuid, groupLabel: v.optional(v.string(80)), state: v.optional(state), note: v.optional(v.string(2000)) }),
  personRemove: v.object({ expectedRevision: revision, entryId: uuid }),
  personOrder: v.object({ expectedRevision: revision, entryIds: v.array(uuid, L.people) }),
  workAdd: v.object({ expectedRevision: revision, workId: uuid, note: v.optional(v.string(2000)) }),
  workRemove: v.object({ expectedRevision: revision, entryId: uuid }),
  workOrder: v.object({ expectedRevision: revision, entryIds: v.array(uuid, L.works) })
};
