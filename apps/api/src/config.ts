import { isAbsolute } from 'node:path';
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
    const egress = process.env.DATA_EGRESS_MODE ?? 'DISABLED';
    const cleanup = process.env.DATA_CLEANUP_MODE ?? 'DISABLED';
    const merge = process.env.DATA_MERGE_MODE ?? 'DISABLED';
    if (!['DISABLED', 'INTERNAL_APPROVED'].includes(egress))
        throw new Error('DATA_EGRESS_MODE invalid');
    if (!['DISABLED', 'INTERNAL_APPROVED'].includes(cleanup))
        throw new Error('DATA_CLEANUP_MODE invalid');
    if (!['DISABLED', 'INTERNAL_APPROVED'].includes(merge))
        throw new Error('DATA_MERGE_MODE invalid');
    const secure = required('COOKIE_SECURE');
    if (!['true', 'false'].includes(secure))
        throw new Error('COOKIE_SECURE invalid');
    required('DATABASE_URL');
    const media = process.env.MEDIA_PROVIDER ?? 'disabled';
    if (!['disabled', 'local'].includes(media))
        throw new Error('MEDIA_PROVIDER not supported');
    if (media === 'local' && (!['local', 'test'].includes(environment) || !isAbsolute(process.env.MEDIA_ROOT ?? '')))
        throw new Error('Local media requires local/test and an absolute MEDIA_ROOT; production provider is not approved');
    return { mediaEnabled: media === 'local', origin: required('APP_ORIGIN'), secureCookies: secure === 'true', environment: environment as Config['environment'], accessMode: accessMode as Config['accessMode'], dataEgressMode: egress as Config['dataEgressMode'], dataCleanupMode: cleanup as Config['dataCleanupMode'], dataMergeMode: merge as Config['dataMergeMode'],
        contactKey: key('CONTACT_KEY_FILE'), csrfKey: key('CSRF_KEY_FILE'), recoveryEpoch: readFileSync(required('RECOVERY_EPOCH_FILE'), 'utf8').trim() };
}
