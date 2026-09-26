import { v, uuid, revision, code, dateIso } from './validation.ts';
import { REBUILD_LIMITS as L, REBUILD_SCHEMA_VERSION } from './rebuild-model.ts';

const sha256 = v.string(64, 64, /^[0-9a-f]{64}$/);
const sourceData = v.object({
    title: v.string(120, 1),
    type: v.enum(['MANUAL', 'TEXT']),
    providerClaim: v.string(200, 1),
    basisMode: v.enum(['INTERNAL_USE']),
    basisDescription: v.string(2000, 4),
    validFrom: dateIso,
    validUntil: dateIso,
    status: v.enum(['CONFIRMED'])
});
const personData = v.object({
    displayName: v.string(120, 1),
    aliases: v.optional(v.array(v.string(120, 1), 20)),
    roles: v.array(code, 10, 1),
    cityCode: v.optional(v.nullable(code)),
    languageCodes: v.optional(v.array(code, 20)),
    skillCodes: v.optional(v.array(code, 30)),
    heightCm: v.optional(v.nullable(v.number(50, 250, false))),
    intro: v.optional(v.string(5000)),
    status: v.enum(['DRAFT', 'ACTIVE', 'ARCHIVED'])
});
const workData = v.object({
    title: v.string(160, 1),
    description: v.optional(v.string(5000)),
    industryCode: v.optional(v.nullable(code)),
    workTypeCodes: v.optional(v.array(code, 10)),
    origin: v.enum(['ONCE', 'EXTERNAL', 'UNKNOWN']),
    originNote: v.optional(v.string(2000)),
    status: v.enum(['DRAFT', 'ACTIVE', 'ARCHIVED'])
});
const projectData = v.object({
    title: v.string(160, 1),
    brief: v.optional(v.string(5000)),
    locationNote: v.optional(v.string(500)),
    dateNote: v.optional(v.string(500)),
    reviewNote: v.optional(v.string(5000)),
    status: v.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED'])
});

const source = v.object({ id: uuid, revision, protectionEpoch: revision, data: sourceData });
const person = v.object({ id: uuid, sourceId: uuid, revision, data: personData });
const work = v.object({ id: uuid, sourceId: uuid, revision, data: workData });
const project = v.object({ id: uuid, sourceId: uuid, revision, data: projectData });
const media = v.object({
    id: uuid,
    workId: uuid,
    position: v.number(0),
    isCover: v.boolean(),
    sourceId: uuid,
    revision,
    fileName: v.string(255, 1),
    mime: v.enum(['image/jpeg', 'image/png', 'image/webp']),
    bytes: v.number(1),
    sha256,
    width: v.number(1),
    height: v.number(1)
});
const relations = v.object({
    workCredits: v.array(v.object({ workId: uuid, personId: uuid, roleCode: code }), L.relations),
    projectParticipants: v.array(v.object({
        projectId: uuid, personId: uuid, roleCode: code,
        state: v.enum(['NOMINATED', 'CONFIRMED', 'ACTUAL'])
    }), L.relations),
    projectWorks: v.array(v.object({
        projectId: uuid, workId: uuid, relation: v.enum(['REFERENCE', 'DELIVERABLE'])
    }), L.relations)
});
const manifest = v.object({
    schemaVersion: v.enum([REBUILD_SCHEMA_VERSION]),
    frozenAt: dateIso,
    people: v.array(person, L.people),
    works: v.array(work, L.works),
    projects: v.array(project, L.projects),
    sources: v.array(source, L.sources, 1),
    media: v.array(media, L.media),
    relations
});

export const RebuildSchemas = {
    payload: v.object({
        schemaVersion: v.enum([REBUILD_SCHEMA_VERSION]),
        exportId: uuid,
        frozenAt: dateIso,
        manifest
    })
};
