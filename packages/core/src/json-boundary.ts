import { invariant } from './errors.ts';
export function validUnicode(s: string): boolean {
    for (let i = 0; i < s.length; i++) {
        const n = s.charCodeAt(i);
        if (n >= 0xd800 && n <= 0xdbff) {
            const next = s.charCodeAt(++i);
            if (!(next >= 0xdc00 && next <= 0xdfff))
                return false;
        }
        else if (n >= 0xdc00 && n <= 0xdfff)
            return false;
    }
    return true;
}
/** Strict JSON boundary: reject duplicate keys before JSON.parse discards them.
 * Canonicalization follows the implemented I-JSON subset; tests do not certify all RFC 8785 vectors. */
export function parseStrictJson(text: string): unknown {
    invariant(new TextEncoder().encode(text).byteLength <= 1000000, 'BODY_TOO_LARGE', '请求数据过大', 413);
    let p = 0;
    const bad = () => invariant(false, 'INVALID_JSON', 'JSON 格式无效、重复字段或数值不安全', 400);
    const ws = () => {
        while (/\s/.test(text[p] ?? '') && p < text.length) {
            if (!' \t\r\n'.includes(text[p]!))
                bad();
            p++;
        }
    };
    const string = (): string => {
        const start = p++;
        let closed = false;
        while (p < text.length) {
            const c = text[p++];
            if (c === '\\') {
                p++;
                continue;
            }
            if (c === '"') {
                closed = true;
                break;
            }
        }
        if (!closed)
            bad();
        let value: unknown;
        try {
            value = JSON.parse(text.slice(start, p));
        }
        catch {
            bad();
        }
        if (typeof value !== 'string' || !validUnicode(value))
            bad();
        return value as string;
    };
    const value = (depth: number): unknown => {
        if (depth > 24)
            bad();
        ws();
        const c = text[p];
        if (c === '"')
            return string();
        if (c === '{') {
            p++;
            ws();
            const obj = Object.create(null) as Record<string, unknown>;
            const keys = new Set<string>();
            if (text[p] === '}') {
                p++;
                return obj;
            }
            for (;;) {
                ws();
                if (text[p] !== '"')
                    bad();
                const key = string();
                if (keys.has(key) || ['__proto__', 'constructor', 'prototype'].includes(key))
                    bad();
                keys.add(key);
                ws();
                if (text[p++] !== ':')
                    bad();
                obj[key] = value(depth + 1);
                ws();
                const sep = text[p++];
                if (sep === '}')
                    return obj;
                if (sep !== ',')
                    bad();
            }
        }
        if (c === '[') {
            p++;
            ws();
            const arr: unknown[] = [];
            if (text[p] === ']') {
                p++;
                return arr;
            }
            for (;;) {
                arr.push(value(depth + 1));
                if (arr.length > 10000)
                    bad();
                ws();
                const sep = text[p++];
                if (sep === ']')
                    return arr;
                if (sep !== ',')
                    bad();
            }
        }
        for (const [literal, v] of [['true', true], ['false', false], ['null', null]] as const) {
            if (text.startsWith(literal, p)) {
                p += literal.length;
                return v;
            }
        }
        const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(p));
        if (!m) {
            bad();
            return null;
        }
        p += m[0].length;
        const n = Number(m[0]);
        if (!Number.isFinite(n) || (Number.isInteger(n) && !Number.isSafeInteger(n)))
            bad();
        return n;
    };
    const result = value(0);
    ws();
    if (p !== text.length)
        bad();
    return result;
}
