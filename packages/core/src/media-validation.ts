import { v, uuid, revision, RevisionOnly } from './validation.ts';
import { MEDIA_LIMITS } from './media-model.ts';
export const MediaSchemas = {
    create: v.object({ sourceId: uuid, expectedSourceRevision: revision, personId: v.optional(uuid),
        fileName: v.string(160, 1, /^[^\x00-\x1f\x7f/\\]+$/), mime: v.enum(['image/jpeg', 'image/png', 'image/webp']),
        expectedBytes: v.number(1, MEDIA_LIMITS.imageBytes), sha256: v.string(64, 64, /^[a-f0-9]{64}$/) }),
    revision: RevisionOnly,
    query: v.object({ personId: v.optional(uuid), sourceId: v.optional(uuid) })
};
