import { v, uuid, revision } from './validation.ts';
import { MERGE_LIMITS as L, PERSON_MERGE_FIELDS as F } from './merge-model.ts';

const field = v.enum(F);
export const MergeSchemas = {
    preview: v.object({
        canonicalId: uuid,
        duplicateId: uuid,
        expectedCanonicalRevision: revision,
        expectedDuplicateRevision: revision
    }),
    execute: v.object({
        canonicalId: uuid,
        duplicateId: uuid,
        expectedCanonicalRevision: revision,
        expectedDuplicateRevision: revision,
        previewDigest: v.string(64,64,/^[0-9a-f]{64}$/),
        fieldDecisions: v.array(v.object({
            field,
            choice: v.enum(['CANONICAL','DUPLICATE','UNION'])
        }), L.conflicts),
        collisionDecisions: v.array(v.object({
            collisionId: uuid,
            choice: v.enum(['KEEP_CANONICAL','KEEP_DUPLICATE'])
        }), L.collisions),
        acknowledgeRevocations: v.boolean(),
        acknowledgeMediaDetach: v.boolean(),
        reason: v.string(L.reason,4)
    })
};
