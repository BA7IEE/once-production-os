import { invariant } from './errors.ts';
import { validUnicode } from './json.ts';
export interface Schema<T> {
    parse(value: unknown, path?: string): T;
    json: Record<string, unknown>;
    optional?: boolean;
}
export type Parsed<S> = S extends Schema<infer T> ? T : never;
function error(path: string, detail: string): never { invariant(false, 'VALIDATION_FAILED', `${path || '请求'}${detail}`, 400); }
export const v = {
    string(max = 200, min = 0, pattern?: RegExp): Schema<string> {
        return { json: { type: 'string', minLength: min, maxLength: max, ...(pattern ? { pattern: pattern.source } : {}) },
            parse(value, path = '') {
                if (typeof value !== 'string' || !validUnicode(value) || value.length < min || value.length > max || (pattern && !pattern.test(value)))
                    return error(path, '格式或长度不符合要求');
                return value;
            } };
    },
    number(min = 0, max = Number.MAX_SAFE_INTEGER, integer = true): Schema<number> {
        return { json: { type: integer ? 'integer' : 'number', minimum: min, maximum: max },
            parse(value, path = '') {
                if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value)))
                    return error(path, '必须是范围内的数值');
                return value;
            } };
    },
    boolean(): Schema<boolean> {
        return { json: { type: 'boolean' }, parse(x, p = '') {
                if (typeof x !== 'boolean')
                    return error(p, '必须为布尔值');
                return x;
            } };
    },
    enum<const T extends readonly string[]>(items: T): Schema<T[number]> {
        return { json: { type: 'string', enum: [...items] }, parse(x, p = '') {
                if (typeof x !== 'string' || !items.includes(x))
                    return error(p, '包含未允许的选项');
                return x as T[number];
            } };
    },
    array<T>(item: Schema<T>, max = 30, min = 0): Schema<T[]> {
        return { json: { type: 'array', items: item.json, minItems: min, maxItems: max },
            parse(x, p = '') {
                if (!Array.isArray(x) || x.length > max || x.length < min)
                    return error(p, '数组长度不符合要求');
                return x.map((r, i) => item.parse(r, `${p}[${i}]`));
            } };
    },
    optional<T>(s: Schema<T>): Schema<T | undefined> { return { optional: true, json: s.json, parse(x, p) { return x === undefined ? undefined : s.parse(x, p); } }; },
    nullable<T>(s: Schema<T>): Schema<T | null> { return { json: { anyOf: [s.json, { type: 'null' }] }, parse(x, p) { return x === null ? null : s.parse(x, p); } }; },
    object<S extends Record<string, Schema<unknown>>>(shape: S): Schema<{
        [K in keyof S]: Parsed<S[K]>;
    }> {
        return { json: { type: 'object', additionalProperties: false, properties: Object.fromEntries(Object.entries(shape).map(([k, value]) => [k, value.json])), required: Object.entries(shape).filter(([, s]) => !s.optional).map(([k]) => k) },
            parse(x, p = '') {
                if (typeof x !== 'object' || x === null || Array.isArray(x) || ![Object.prototype, null].includes(Object.getPrototypeOf(x)))
                    return error(p, '必须是对象');
                const raw = x as Record<string, unknown>;
                for (const key of Object.keys(raw))
                    if (!Object.hasOwn(shape, key))
                        return error(p, '包含未知字段');
                const out: Record<string, unknown> = {};
                for (const [key, s] of Object.entries(shape)) {
                    const value = s.parse(raw[key], p ? `${p}.${key}` : key);
                    if (value !== undefined)
                        out[key] = value;
                }
                return out as {
                    [K in keyof S]: Parsed<S[K]>;
                };
            } };
    },
    unknown(): Schema<unknown> { return { json: {}, parse: x => x }; }
};
export const uuid = v.string(36, 36, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
export const revision = v.number(1);
export const code = v.string(60, 1, /^[a-z0-9][a-z0-9_-]*$/);
export const dateIso: Schema<string> = { json: { type: 'string', format: 'date-time' }, parse(x, p = '') {
        if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x) || !Number.isFinite(Date.parse(x)) || new Date(x).toISOString() !== x)
            return error(p, '必须是有效 UTC 日期时间');
        return x;
    } };
export const SourceInput = v.object({ title: v.string(120, 1), type: v.enum(['MANUAL', 'TEXT']), providerClaim: v.string(200, 1),
    textPayload: v.optional(v.string(30000)), basisMode: v.enum(['TEMP_ORGANIZE', 'INTERNAL_USE']), basisDescription: v.string(2000, 4),
    validUntil: v.optional(dateIso), scopeId: v.optional(uuid) });
export const PersonInput = v.object({ displayName: v.string(120, 1), roles: v.array(code, 10, 1),
    sourceId: v.optional(uuid), inlineSource: v.optional(SourceInput),
    aliases: v.optional(v.array(v.string(120, 1), 20)), cityCode: v.optional(v.nullable(code)),
    languageCodes: v.optional(v.array(code, 20)), skillCodes: v.optional(v.array(code, 30)),
    heightCm: v.optional(v.nullable(v.number(50, 250, false))), intro: v.optional(v.string(5000)) });
export const PersonPatch = v.object({ expectedRevision: revision,
    displayName: v.optional(v.string(120, 1)), roles: v.optional(v.array(code, 10, 1)), aliases: v.optional(v.array(v.string(120, 1), 20)),
    cityCode: v.optional(v.nullable(code)), languageCodes: v.optional(v.array(code, 20)), skillCodes: v.optional(v.array(code, 30)),
    heightCm: v.optional(v.nullable(v.number(50, 250, false))), intro: v.optional(v.string(5000)), status: v.optional(v.enum(['DRAFT', 'ACTIVE', 'ARCHIVED'])) });
export const RevisionOnly = v.object({ expectedRevision: revision });
export const PersonImportRow = v.object({ displayName: v.string(120, 1), roles: v.array(code, 10, 1), cityCode: v.optional(v.nullable(code)) });
export const Schemas = {
    handoffCreate: v.object({ expectedRevision: revision, expectedSourceRevision: revision,
        recipientId: uuid, purpose: v.enum(['EDIT', 'REVIEW']), expiresAt: dateIso,
        acknowledgeLimitedAccess: v.boolean() }),
    empty: v.object({}), login: v.object({ loginName: v.string(80, 1), password: v.string(256, 1) }),
    activate: v.object({ token: v.string(100, 32), password: v.string(256, 12) }),
    password: v.object({ oldPassword: v.string(256, 1), newPassword: v.string(256, 12) }),
    memberCreate: v.object({ loginName: v.string(80, 3, /^[a-z0-9][a-z0-9._-]*$/), displayName: v.string(100, 1), role: v.enum(['ADMIN', 'EDITOR', 'REVIEWER', 'VIEWER']), extraPermissions: v.array(v.enum(['sensitive.read', 'sensitive.write', 'data.export']), 3) }),
    memberPermissions: v.object({ expectedRevision: revision, role: v.enum(['ADMIN', 'EDITOR', 'REVIEWER', 'VIEWER']), extraPermissions: v.array(v.enum(['sensitive.read', 'sensitive.write', 'data.export']), 3) }),
    revision: RevisionOnly,
    scopeCreate: v.object({ name: v.string(120, 1), membershipIds: v.array(uuid, 50, 1) }),
    recordScope: v.object({ expectedRevision: revision, scopeId: uuid }),
    sourceCreate: SourceInput,
    sourcePatch: v.object({ expectedRevision: revision, title: v.optional(v.string(120, 1)), textPayload: v.optional(v.string(30000)), providerClaim: v.optional(v.string(200, 1)) }),
    sourceReview: v.object({ expectedRevision: revision, basisDescription: v.string(2000, 4), validUntil: dateIso }),
    suspend: v.object({ expectedRevision: revision, reason: v.string(1000, 4) }),
    personCreate: PersonInput, personPatch: PersonPatch,
    contacts: v.object({ expectedRevision: revision, contacts: v.array(v.object({ kind: v.enum(['PHONE', 'WECHAT', 'EMAIL', 'OTHER']), value: v.string(200, 1), sourceId: uuid }), 10) }),
    evidence: v.object({ personId: uuid, expectedRevision: revision, fieldPath: v.enum(['displayName', 'aliases', 'roles', 'cityCode', 'languageCodes', 'skillCodes', 'heightCm', 'intro']), sourceId: uuid, sourceRevision: revision }),
    dictionaryCreate: v.object({ namespace: v.enum(['role', 'city', 'language', 'skill', 'industry', 'workType']), code, labelZh: v.string(120, 1), labelEn: v.string(120) }),
    dictionaryPatch: v.object({ expectedRevision: revision, labelZh: v.optional(v.string(120, 1)), labelEn: v.optional(v.string(120)), status: v.optional(v.enum(['ACTIVE', 'INACTIVE'])) }),
    importPreview: v.object({ sourceId: uuid, rows: v.array(v.unknown(), 100, 1) }),
    importCommit: v.object({ expectedRevision: revision, selectedRows: v.array(v.number(0, 99), 100, 1) })
};
