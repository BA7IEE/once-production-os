import { open, readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AuditEvent } from '../../../../packages/core/src/model.ts';
import { digest } from '../../../../packages/core/src/json.ts';
import { invariant } from '../../../../packages/core/src/errors.ts';

export const SAFETY_JOURNAL_VERSION = 'once-safety-journal-v1';
export const SAFETY_JOURNAL_ENTRY_VERSION = 'once-safety-journal-entry-v1';
const ZERO = '0'.repeat(64);
const NOISY_READ_ACTIONS = new Set([
    'auth.login', 'auth.login-denied', 'auth.logout',
    'contact.read', 'asset.preview', 'export.download'
]);

export interface SafetyJournalHeader {
    schemaVersion: typeof SAFETY_JOURNAL_VERSION;
    journalId: string;
    createdAt: string;
}
export interface SafetyJournalEntry {
    schemaVersion: typeof SAFETY_JOURNAL_ENTRY_VERSION;
    seq: number;
    auditId: string;
    workspaceId: string;
    createdAt: string;
    action: string;
    resourceKind: string;
    resourceId: string;
    changedFields: string[];
    prevHash: string;
    hash: string;
}
export interface SafetyJournalSnapshot {
    schemaVersion: typeof SAFETY_JOURNAL_VERSION;
    journalId: string;
    sequence: number;
    headHash: string;
    entries: number;
}
export interface SafetyJournalState {
    header: SafetyJournalHeader;
    entries: SafetyJournalEntry[];
    snapshot: SafetyJournalSnapshot;
}

function keys(value: Record<string, unknown>, expected: string[], message: string) {
    invariant(Object.keys(value).sort().join(',') === [...expected].sort().join(','), 'SAFETY_JOURNAL_INVALID', message, 503);
}
function header(value: unknown): SafetyJournalHeader {
    invariant(!!value && typeof value === 'object' && !Array.isArray(value), 'SAFETY_JOURNAL_INVALID', '安全日志头格式无效', 503);
    const row = value as Record<string, unknown>;
    keys(row, ['schemaVersion','journalId','createdAt'], '安全日志头包含未知字段');
    invariant(row.schemaVersion === SAFETY_JOURNAL_VERSION
        && typeof row.journalId === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.journalId)
        && typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt)),
        'SAFETY_JOURNAL_INVALID', '安全日志头内容无效', 503);
    return row as unknown as SafetyJournalHeader;
}
function entry(value: unknown, expectedSeq: number, expectedPrev: string): SafetyJournalEntry {
    invariant(!!value && typeof value === 'object' && !Array.isArray(value), 'SAFETY_JOURNAL_INVALID', '安全日志记录格式无效', 503);
    const row = value as Record<string, unknown>;
    keys(row, ['schemaVersion','seq','auditId','workspaceId','createdAt','action','resourceKind','resourceId','changedFields','prevHash','hash'],
        '安全日志记录包含未知字段');
    invariant(row.schemaVersion === SAFETY_JOURNAL_ENTRY_VERSION
        && row.seq === expectedSeq
        && typeof row.auditId === 'string'
        && typeof row.workspaceId === 'string'
        && typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt))
        && typeof row.action === 'string' && row.action.length > 0 && row.action.length <= 120
        && typeof row.resourceKind === 'string' && row.resourceKind.length > 0 && row.resourceKind.length <= 80
        && typeof row.resourceId === 'string' && row.resourceId.length > 0 && row.resourceId.length <= 180
        && Array.isArray(row.changedFields) && row.changedFields.every(x => typeof x === 'string' && x.length <= 120)
        && row.prevHash === expectedPrev
        && typeof row.hash === 'string' && /^[a-f0-9]{64}$/.test(row.hash),
        'SAFETY_JOURNAL_INVALID', '安全日志记录内容或链位置无效', 503);
    const withoutHash = { ...row }; delete withoutHash.hash;
    invariant(digest(withoutHash) === row.hash, 'SAFETY_JOURNAL_INVALID', '安全日志 hash chain 校验失败', 503);
    return row as unknown as SafetyJournalEntry;
}
function parseLine(line: string): unknown {
    invariant(line.length > 0 && line.length <= 65536, 'SAFETY_JOURNAL_INVALID', '安全日志行长度无效', 503);
    try { return JSON.parse(line); }
    catch { invariant(false, 'SAFETY_JOURNAL_INVALID', '安全日志不是合法 JSON Lines', 503); }
}
export function safetyCriticalAudit(row: AuditEvent): boolean {
    return !NOISY_READ_ACTIONS.has(row.action);
}
export async function readSafetyJournal(path: string): Promise<SafetyJournalState> {
    invariant(isAbsolute(path) && resolve(path) === path, 'SAFETY_JOURNAL_PATH_INVALID', '安全日志必须使用规范绝对路径', 503);
    const info = await stat(path);
    invariant(info.isFile() && (info.mode & 0o077) === 0, 'SAFETY_JOURNAL_PATH_INVALID', '安全日志必须是仅当前账号可访问的普通文件', 503);
    const text = await readFile(path, 'utf8');
    invariant(text.endsWith('\n'), 'SAFETY_JOURNAL_INVALID', '安全日志末行不完整', 503);
    const lines = text.slice(0, -1).split('\n');
    invariant(lines.length >= 1, 'SAFETY_JOURNAL_INVALID', '安全日志为空', 503);
    const h = header(parseLine(lines[0]!));
    let prev = digest(h);
    const entries: SafetyJournalEntry[] = [], ids = new Set<string>();
    for (let i = 1; i < lines.length; i++) {
        const row = entry(parseLine(lines[i]!), i, prev);
        invariant(!ids.has(row.auditId), 'SAFETY_JOURNAL_INVALID', '安全日志包含重复 Audit ID', 503);
        ids.add(row.auditId); entries.push(row); prev = row.hash;
    }
    return { header: h, entries, snapshot: {
        schemaVersion: SAFETY_JOURNAL_VERSION, journalId: h.journalId,
        sequence: entries.length, headHash: prev, entries: entries.length
    }};
}
export async function createSafetyJournal(path: string, now = new Date()): Promise<SafetyJournalState> {
    invariant(isAbsolute(path) && resolve(path) === path, 'SAFETY_JOURNAL_PATH_INVALID', '安全日志必须使用规范绝对路径', 503);
    const parent = dirname(path), p = await stat(parent);
    invariant(p.isDirectory() && (p.mode & 0o077) === 0, 'SAFETY_JOURNAL_PATH_INVALID', '安全日志父目录必须是私有目录', 503);
    const h: SafetyJournalHeader = { schemaVersion: SAFETY_JOURNAL_VERSION, journalId: randomUUID(), createdAt: now.toISOString() };
    const handle = await open(path, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(h) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
    return readSafetyJournal(path);
}
export class SafetyJournalWriter {
    path: string;
    state: SafetyJournalState;
    private constructor(path: string, state: SafetyJournalState) { this.path = path; this.state = state; }
    static async open(path: string) {
        let state: SafetyJournalState;
        try { state = await readSafetyJournal(path); }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            state = await createSafetyJournal(path);
        }
        return new SafetyJournalWriter(path, state);
    }
    snapshot(): SafetyJournalSnapshot { return structuredClone(this.state.snapshot); }

    async append(audits: AuditEvent[]): Promise<number> {
        const known = new Set(this.state.entries.map(x => x.auditId));
        const rows = audits.filter(safetyCriticalAudit).filter(x => !known.has(x.id))
            .sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
        if (!rows.length) return 0;
        let prev = this.state.snapshot.headHash, seq = this.state.snapshot.sequence;
        const additions: SafetyJournalEntry[] = [];
        for (const audit of rows) {
            const body = {
                schemaVersion: SAFETY_JOURNAL_ENTRY_VERSION,
                seq: ++seq, auditId: audit.id, workspaceId: audit.workspaceId,
                createdAt: audit.createdAt, action: audit.action,
                resourceKind: audit.resourceKind, resourceId: audit.resourceId,
                changedFields: [...audit.changedFields].sort(), prevHash: prev
            };
            const row: SafetyJournalEntry = { ...body, hash: digest(body) };
            additions.push(row); prev = row.hash;
        }
        const handle = await open(this.path, 'a', 0o600);
        try {
            await handle.writeFile(additions.map(x => JSON.stringify(x)).join('\n') + '\n');
            await handle.sync();
        }
        finally { await handle.close(); }
        // Re-read the whole chain after append. A concurrent or partial writer must be detected now.
        this.state = await readSafetyJournal(this.path);
        return additions.length;
    }
}
