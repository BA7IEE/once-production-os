import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
import { invariant } from './errors.ts';
export const randomSecret = (): string => randomBytes(32).toString('base64url');
export const hashSecret = (s: string): string => createHash('sha256').update(s).digest('hex');
export const csrfFor = (token: string, key: Buffer): string => createHmac('sha256', key).update('once:csrf:v1:' + token).digest('base64url');
export function equalSecret(a: string, b: string): boolean {
    return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
function derive(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, value) => e ? reject(e) : resolve(value)));
}
export function validatePassword(password: string): void {
    invariant(typeof password === 'string' && password.length >= 12 && Buffer.byteLength(password) <= 256, 'PASSWORD_POLICY', '密码至少 12 个字符，且不能超过 256 字节', 400);
}
export async function passwordHash(password: string): Promise<string> {
    validatePassword(password);
    const salt = randomBytes(16);
    const key = await derive(password, salt);
    return `scrypt-v1$${salt.toString('hex')}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
    if (Buffer.byteLength(password) > 256)
        return false;
    const pieces = encoded?.split('$') ?? [];
    const valid = pieces.length === 3 && pieces[0] === 'scrypt-v1' && /^[a-f0-9]{32}$/.test(pieces[1] ?? '') && /^[a-f0-9]{128}$/.test(pieces[2] ?? '');
    // Missing accounts still perform the same KDF. This is not a claim of network-level constant time.
    const salt = valid ? Buffer.from(pieces[1]!, 'hex') : Buffer.alloc(16);
    const actual = await derive(password, salt);
    return valid && timingSafeEqual(actual, Buffer.from(pieces[2]!, 'hex'));
}
export function encryptContact(value: string, key: Buffer, context = ''): string {
    invariant(key.length === 32, 'CONFIG_INVALID', '联系信息密钥未正确配置', 503);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from('once:contact:v1:' + context));
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}
export function decryptContact(encoded: string, key: Buffer, context = ''): string {
    try {
        const parts = encoded.split('.');
        const [v, iv, tag, data] = parts;
        if (parts.length !== 4 || encoded.length > 2048 || v !== 'v1' || !iv || !tag || !data || ![iv, tag, data].every(s => /^[A-Za-z0-9_-]+$/.test(s)) || Buffer.from(iv, 'base64url').length !== 12 || Buffer.from(tag, 'base64url').length !== 16)
            throw new Error();
        const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
        cipher.setAAD(Buffer.from('once:contact:v1:' + context));
        cipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([cipher.update(Buffer.from(data, 'base64url')), cipher.final()]).toString('utf8');
    }
    catch {
        invariant(false, 'CONTACT_DECRYPT_FAILED', '联系资料解密失败，请检查密钥恢复情况', 503);
    }
}
