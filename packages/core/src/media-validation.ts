import { v, uuid, revision, RevisionOnly } from './validation.ts';
import { MEDIA_LIMITS } from './media-model.ts';
export const MediaSchemas = {
    create: v.object({ context:v.optional(v.object({kind:v.enum(['INTERNAL_SOURCE'])})), sourceId: uuid, expectedSourceRevision: revision, personId: v.optional(uuid),
        fileName: v.string(160, 1, /^[^\x00-\x1f\x7f/\\]+$/), mime: v.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4']),
        expectedBytes: v.number(1, MEDIA_LIMITS.videoBytes), sha256: v.string(64, 64, /^[a-f0-9]{64}$/) }),
    revision: RevisionOnly,
    query: v.object({ personId: v.optional(uuid), sourceId: v.optional(uuid) })
};

export const MEDIA_SUBMISSION_FILE_LIMIT=100;
export const MEDIA_CONSENT_VERSION='internal-directory-media-2026-10-v1';
export const TalentMediaSchemas={
 create:v.object({context:v.object({kind:v.enum(['TALENT_SUBMISSION']),submissionId:uuid,personRoleId:v.optional(uuid)}),expectedSubmissionRevision:revision,
 fileName:v.string(160,1,/^[^\x00-\x1f\x7f/\\]+$/),mime:v.enum(['image/jpeg','image/png','image/webp','application/pdf','video/mp4']),expectedBytes:v.number(1,MEDIA_LIMITS.videoBytes),sha256:v.string(64,64,/^[a-f0-9]{64}$/)}),
 consent:v.object({expectedRevision:revision,textVersion:v.enum([MEDIA_CONSENT_VERSION]),accepted:v.boolean()}),
};
