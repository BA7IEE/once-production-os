import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { digest } from '../../../../packages/core/src/json.ts';
import { invariant } from '../../../../packages/core/src/errors.ts';
import type { SafetyJournalSnapshot } from './safety-journal.ts';

export const BACKUP_MANIFEST_VERSION = 'once-backup-manifest-v1';

export interface BackupManifestBody {
    schemaVersion: typeof BACKUP_MANIFEST_VERSION;
    backupId: string;
    createdAt: string;
    applicationVersion: string;
    database: { bytes: number; sha256: string };
    recoveryEpochDigest: string;
    contactKeyDigest: string;
    migrationDigest: string;
    safetyJournal: SafetyJournalSnapshot;
}
export interface BackupManifest extends BackupManifestBody {
    manifestDigest: string;
}

export async function sha256File(path: string): Promise<{ bytes: number; sha256: string }> {
    const info = await stat(path);
    invariant(info.isFile() && (info.mode & 0o077) === 0,
        'BACKUP_FILE_INVALID', '备份数据库文件必须是仅当前账号可访问的普通文件', 503);
    const hash = createHash('sha256');
    let bytes = 0;
    await new Promise<void>((resolvePromise, reject) => {
        const input = createReadStream(path);
        input.on('data', chunk => { bytes += (chunk as Buffer).length; hash.update(chunk as Buffer); });
        input.once('error', reject); input.once('end', resolvePromise);
    });
    invariant(bytes === info.size && bytes > 0, 'BACKUP_FILE_INVALID', '备份数据库文件为空或读取不完整', 503);
    return { bytes, sha256: hash.digest('hex') };
}
function exactKeys(row: Record<string, unknown>, expected: string[]) {
    invariant(Object.keys(row).sort().join(',') === [...expected].sort().join(','),
        'BACKUP_MANIFEST_INVALID', '备份清单包含未知字段', 503);
}
function validate(body: BackupManifest): BackupManifest {
    exactKeys(body as unknown as Record<string, unknown>,
        ['schemaVersion','backupId','createdAt','applicationVersion','database','recoveryEpochDigest','contactKeyDigest','migrationDigest','safetyJournal','manifestDigest']);
    invariant(body.schemaVersion === BACKUP_MANIFEST_VERSION
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(body.backupId)
        && Number.isFinite(Date.parse(body.createdAt))
        && typeof body.applicationVersion === 'string' && body.applicationVersion.length > 0 && body.applicationVersion.length <= 80
        && Number.isSafeInteger(body.database?.bytes) && body.database.bytes > 0
        && /^[a-f0-9]{64}$/.test(body.database?.sha256 ?? '')
        && /^[a-f0-9]{64}$/.test(body.recoveryEpochDigest)
        && /^[a-f0-9]{64}$/.test(body.contactKeyDigest)
        && /^[a-f0-9]{64}$/.test(body.migrationDigest)
        && body.safetyJournal?.schemaVersion === 'once-safety-journal-v1'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(body.safetyJournal.journalId)
        && Number.isSafeInteger(body.safetyJournal.sequence) && body.safetyJournal.sequence >= 0
        && body.safetyJournal.entries === body.safetyJournal.sequence
        && /^[a-f0-9]{64}$/.test(body.safetyJournal.headHash)
        && /^[a-f0-9]{64}$/.test(body.manifestDigest),
        'BACKUP_MANIFEST_INVALID', '备份清单内容无效', 503);
    const { manifestDigest, ...unsigned } = body;
    invariant(digest(unsigned) === manifestDigest, 'BACKUP_MANIFEST_INVALID', '备份清单摘要校验失败', 503);
    return body;
}
export function buildBackupManifest(input: Omit<BackupManifestBody,'schemaVersion'|'backupId'|'createdAt'> & {
    backupId?: string; createdAt?: string;
}): BackupManifest {
    const body: BackupManifestBody = {
        schemaVersion: BACKUP_MANIFEST_VERSION,
        backupId: input.backupId ?? randomUUID(),
        createdAt: input.createdAt ?? new Date().toISOString(),
        applicationVersion: input.applicationVersion,
        database: input.database,
        recoveryEpochDigest: input.recoveryEpochDigest,
        contactKeyDigest: input.contactKeyDigest,
        migrationDigest: input.migrationDigest,
        safetyJournal: input.safetyJournal
    };
    return validate({ ...body, manifestDigest: digest(body) });
}
export async function writeBackupManifest(path: string, manifest: BackupManifest): Promise<void> {
    invariant(isAbsolute(path) && resolve(path) === path, 'BACKUP_MANIFEST_PATH_INVALID', '备份清单必须使用规范绝对路径', 503);
    const parent = await stat(dirname(path));
    invariant(parent.isDirectory() && (parent.mode & 0o077) === 0,
        'BACKUP_MANIFEST_PATH_INVALID', '备份清单父目录必须是私有目录', 503);
    const handle = await open(path, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(validate(manifest), null, 2) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
}
export async function readBackupManifest(path: string): Promise<BackupManifest> {
    invariant(isAbsolute(path) && resolve(path) === path, 'BACKUP_MANIFEST_PATH_INVALID', '备份清单必须使用规范绝对路径', 503);
    const info = await stat(path);
    invariant(info.isFile() && (info.mode & 0o077) === 0, 'BACKUP_MANIFEST_PATH_INVALID', '备份清单权限不安全', 503);
    let value: unknown;
    try { value = JSON.parse(await readFile(path, 'utf8')); }
    catch { invariant(false, 'BACKUP_MANIFEST_INVALID', '备份清单不是合法 JSON', 503); }
    invariant(!!value && typeof value === 'object' && !Array.isArray(value), 'BACKUP_MANIFEST_INVALID', '备份清单格式无效', 503);
    return validate(value as BackupManifest);
}
