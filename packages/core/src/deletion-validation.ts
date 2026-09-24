import { v, uuid, revision } from './validation.ts';
import { DELETION_LIMITS as L } from './deletion-model.ts';

const targetKind = v.enum(['SOURCE', 'PERSON', 'WORK', 'PROJECT', 'ASSET']);
export const DeletionSchemas = {
    preview: v.object({ targetKind, targetId: uuid, expectedRevision: revision }),
    block: v.object({ expectedRevision: revision, previewDigest: v.string(64, 64, /^[0-9a-f]{64}$/), acknowledgeBlock: v.boolean() }),
    decision: v.object({
        expectedRevision: revision,
        entryId: uuid,
        decision: v.enum(['APPLY_PROPOSED', 'RETAIN_WITH_BASIS']),
        decisionReason: v.string(L.reason, 4),
        retentionSourceId: v.optional(v.nullable(uuid))
    }),
    freezePlan: v.object({ expectedRevision: revision, acknowledgePlan: v.boolean() }),
    create: v.object({
        targetKind,
        targetId: uuid,
        expectedRevision: revision,
        previewDigest: v.string(64, 64, /^[0-9a-f]{64}$/),
        reason: v.string(L.reason, 4)
    })
};
