import { readFileSync } from 'node:fs';
import type { Config } from '../../../packages/core/src/model.ts';
function required(name: string): string {
    const value = process.env[name];
    if (!value)
        throw new Error(`${name} is required`);
    return value;
}
function key(name: string): Buffer {
    const file = required(name);
    const encoded = readFileSync(file, 'utf8').trim();
    if (!/^[0-9a-f]{64}$/i.test(encoded))
        throw new Error(`${name} must point to a 32-byte hex secret`);
    return Buffer.from(encoded, 'hex');
}
export function loadConfig(): Config {
    const environment = required('APP_ENV');
    if (!['local', 'test', 'staging', 'production'].includes(environment))
        throw new Error('APP_ENV invalid');
    const accessMode = required('ACCESS_MODE');
    if (!['MAINTENANCE', 'INTERNAL'].includes(accessMode))
        throw new Error('ACCESS_MODE invalid');
    const secure = required('COOKIE_SECURE');
    if (!['true', 'false'].includes(secure))
        throw new Error('COOKIE_SECURE invalid');
    required('DATABASE_URL');
    return { origin: required('APP_ORIGIN'), secureCookies: secure === 'true', environment: environment as Config['environment'], accessMode: accessMode as Config['accessMode'],
        contactKey: key('CONTACT_KEY_FILE'), csrfKey: key('CSRF_KEY_FILE'), recoveryEpoch: readFileSync(required('RECOVERY_EPOCH_FILE'), 'utf8').trim() };
}
