import { v, uuid, revision, dateIso, code } from './validation.ts';
export const aiTaskType = v.enum(['extract_profile', 'suggest_tags', 'draft_locale', 'parse_search']);
const source = v.object({ sourceId: uuid, expectedRevision: revision, grantId: uuid, start: v.number(0, 30000), end: v.number(1, 30000) });
export const AiSchemas = {
    approval: v.object({configDigest:v.string(64,64),expectedRevision:v.number(0,2147483647),enabled:v.boolean(),confirmConfiguration:v.boolean()}),
    reconcile: v.object({expectedRevision:revision,outcome:v.enum(['SUCCEEDED','NOT_EXECUTED']),amountUnits:v.number(0,2000000000),evidenceSourceId:uuid,evidenceSourceRevision:revision,providerIdempotencyKey:v.string(128,1),providerIdentityHash:v.string(64,64),confirmProviderResult:v.boolean()}),
    unfreeze:v.object({expectedRevision:revision,confirmOverrun:v.boolean()}),
    grant: v.object({ sourceId: uuid, expectedRevision: revision, validUntil: dateIso, evidenceNote: v.string(2000, 4), confirmTextOnly: v.boolean() }),
    revision: v.object({ expectedRevision: revision }),
    create: v.object({ taskType: aiTaskType, subjectKind: v.enum(['PERSON', 'WORK', 'PROJECT', 'NONE']), subjectId: v.nullable(uuid), expectedRevision: v.nullable(revision), locale: v.nullable(v.enum(['zh', 'en'])), sources: v.array(source, 10), queryText: v.string(1000), confirmMinimizedInput: v.boolean() }),
    apply: v.object({ expectedRevision: revision, selectedFields: v.array(v.enum(['displayName', 'intro', 'aliases', 'industryCode', 'workTypeCodes', 'text', 'filters']), 3, 1) }),
    output: v.object({ changes: v.array(v.object({ field: v.string(30, 1), value: v.unknown(), evidence: v.array(v.object({ sourceId: uuid, start: v.number(0, 30000), end: v.number(1, 30000), quote: v.string(1000, 1) }), 10) }), 3), unknowns: v.array(v.string(300, 1), 10) }),
    filters: v.object({ q: v.optional(v.string(120)), role: v.optional(code), location: v.optional(code), language: v.optional(code), industryCode: v.optional(code), workTypeCode: v.optional(code) })
};
