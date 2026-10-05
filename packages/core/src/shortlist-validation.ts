import { v, uuid, revision } from './validation.ts';
import { SHORTLIST_LIMITS as L } from './shortlist-model.ts';

export const ShortlistSchemas = {
    selection: v.object({ personIds: v.array(uuid, 200) }),
    create: v.object({
        title: v.string(160, 1),
        brief: v.optional(v.string(5000)),
        scopeId: uuid
    }),
    patch: v.object({
        expectedRevision: revision,
        title: v.optional(v.string(160, 1)),
        brief: v.optional(v.string(5000))
    }),
    itemAdd: v.object({
        expectedRevision: revision,
        personId: uuid,
        personRoleId: v.optional(uuid),
        personRoleRevision: v.optional(revision),
        workId: v.optional(uuid),
        workAssetIds: v.array(uuid, L.assetsPerItem),
        note: v.string(2000)
    }),
    itemPatch: v.object({
        expectedRevision: revision,
        entryId: uuid,
        note: v.string(2000)
    }),
    batchAdd: v.object({
        expectedRevision: revision,
        entries: v.array(v.object({
            personId: uuid,
            expectedPersonRevision: revision,
            personRoleId: v.optional(uuid),
            personRoleRevision: v.optional(revision)
        }), 200)
    }),
    remove: v.object({
        expectedRevision: revision,
        entryId: uuid
    }),
    order: v.object({
        expectedRevision: revision,
        entryIds: v.array(uuid, L.items)
    })
};
