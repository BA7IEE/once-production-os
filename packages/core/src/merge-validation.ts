import { TALENT_FACT_TABLES } from './talent-v2-model.ts';
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
        professionalDecisions: v.optional(v.array(v.object({
            table: v.enum([...TALENT_FACT_TABLES, 'mediaCollectionItems', 'talentMigrationReviews', 'fieldProposals', 'shortlistItems'] as const),
            id: uuid,
            action: v.enum(['MOVE', 'REBIND_AGENT', 'STALE_PROPOSAL', 'RETAIN_HISTORY'])
        }), L.collisions)),
        professionalConflicts: v.optional(v.array(v.object({
            table: v.enum(['talentProfiles', 'castingProfiles', 'adultEligibilities', 'personRoles', 'personLanguages', 'talentLocations']),
            canonicalId: uuid, duplicateId: uuid,
            choice: v.enum(['RETAIN_DUPLICATE_HISTORY', 'KEEP_CANONICAL_ACTIVE', 'KEEP_DUPLICATE_ACTIVE'])
        }), L.conflicts)),
        localeDecisions:v.optional(v.array(v.object({locale:v.enum(['zh','en']),selectedTextId:uuid}),2)),
        acknowledgeRevocations: v.boolean(),
        acknowledgeMediaDetach: v.boolean(),
        reason: v.string(L.reason,4)
    })
};
