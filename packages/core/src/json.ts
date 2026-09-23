import { createHash } from 'node:crypto';
import { invariant } from './errors.ts';
import { validUnicode } from './json-boundary.ts';
export { validUnicode, parseStrictJson } from './json-boundary.ts';
export function canonicalJson(value: unknown, depth = 0): string {
    invariant(depth <= 24, 'INVALID_JSON', '数据嵌套过深', 400);
    if (value === null)
        return 'null';
    if (typeof value === 'boolean')
        return value ? 'true' : 'false';
    if (typeof value === 'string') {
        invariant(validUnicode(value), 'INVALID_JSON', '无效 Unicode', 400);
        return JSON.stringify(value);
    }
    if (typeof value === 'number') {
        invariant(Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)), 'INVALID_JSON', '不安全数值', 400);
        return JSON.stringify(value);
    }
    if (Array.isArray(value))
        return '[' + value.map(v => canonicalJson(v, depth + 1)).join(',') + ']';
    invariant(typeof value === 'object' && value !== null, 'INVALID_JSON', '数据必须是 JSON', 400);
    const object = value as Record<string, unknown>;
    invariant([Object.prototype, null].includes(Object.getPrototypeOf(object)), 'INVALID_JSON', '不接受非 JSON 对象', 400);
    return '{' + Object.keys(object).sort().map(k => canonicalJson(k) + ':' + canonicalJson(object[k], depth + 1)).join(',') + '}';
}
export const digest = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');
