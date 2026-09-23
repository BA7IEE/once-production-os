import { PrismaClient, Prisma } from '@prisma/client';
import type { Table, TableMap } from '../../../packages/core/src/model.ts';
import type { Store, Tx } from '../../../packages/core/src/store.ts';
import { AppError } from '../../../packages/core/src/errors.ts';
const DELEGATE: Record<Table, string> = { works: 'work', workAssets: 'workAsset', workCredits: 'workCredit', projects: 'project', projectParticipants: 'projectParticipant', projectWorks: 'projectWork', workspaces: 'workspace', users: 'user', memberships: 'membership', sessions: 'session', activations: 'activation',
    scopes: 'accessScope', scopeMembers: 'scopeMember', sources: 'sourceRecord', sourceHistory: 'sourceHistory', people: 'person', contacts: 'contact', evidence: 'fieldEvidence',
    dictionary: 'dictionaryItem', receipts: 'commandReceipt', audits: 'auditEvent', rateBuckets: 'rateBucket', imports: 'importBatch', jobs: 'durableJob', handoffs: 'recordHandoff', uploads: 'mediaUpload', assets: 'mediaAsset' };
const DATES = new Set(['createdAt', 'updatedAt', 'idleUntil', 'absoluteUntil', 'revokedAt', 'expiresAt', 'consumedAt', 'validFrom', 'validUntil', 'reviewedAt', 'until', 'leaseUntil', 'acceptedAt', 'closedAt', 'purgedAt']);
interface Delegate {
    findUnique(input: unknown): Promise<unknown>;
    findMany(input: unknown): Promise<unknown[]>;
    create(input: unknown): Promise<unknown>;
    update(input: unknown): Promise<unknown>;
    delete(input: unknown): Promise<unknown>;
}
function data(row: object): Record<string, unknown> { return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, DATES.has(key) && typeof value === 'string' ? new Date(value) : value])); }
function plain(value: unknown): unknown {
    if (value instanceof Date)
        return value.toISOString();
    if (Array.isArray(value))
        return value.map(plain);
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
    return value;
}
/** Small-team correctness baseline: all short authorization-sensitive transactions acquire the
 * same PG advisory transaction lock. It is intentionally not a scalable query implementation.
 * Do not call networks, scrypt or file processing while holding this transaction. */
export class PrismaStore implements Store {
    client: PrismaClient;
    constructor(client = new PrismaClient({ log: [] })) { this.client = client; }
    async transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
        try {
            return await this.client.$transaction(async (p) => {
                await p.$executeRaw `SELECT pg_advisory_xact_lock(91880762001::bigint)`;
                const delegate = (t: Table) => (p as unknown as Record<string, Delegate>)[DELEGATE[t]]!;
                const tx: Tx = {
                    get: async <K extends Table>(t: K, id: string) => plain(await delegate(t).findUnique({ where: { id } })) as TableMap[K] | null,
                    find: async <K extends Table>(t: K, where: Partial<TableMap[K]> = {}) => plain(await delegate(t).findMany({ where: Object.fromEntries(Object.entries(data(where)).map(([k, v]) => [k, Array.isArray(v) ? { equals: v } : v])) })) as TableMap[K][],
                    insert: async <K extends Table>(t: K, row: TableMap[K]) => { await delegate(t).create({ data: data(row) }); },
                    replace: async <K extends Table>(t: K, row: TableMap[K]) => {
                        if (t === 'sourceHistory')
                            throw new AppError(409, 'HISTORY_IMMUTABLE', '来源历史只允许追加');
                        const { id, ...update } = data(row);
                        await delegate(t).update({ where: { id }, data: update });
                    },
                    remove: async (t, id) => {
                        if (t === 'sourceHistory')
                            throw new AppError(409, 'HISTORY_IMMUTABLE', '来源历史只允许追加');
                        await delegate(t).delete({ where: { id } });
                    }
                };
                return work(tx);
            }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 15000 });
        }
        catch (error) {
            if (error instanceof AppError)
                throw error;
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                if (error.code === 'P2002')
                    throw new AppError(409, 'UNIQUE_CONFLICT', '记录已经存在，请刷新确认');
                if (error.code === 'P2003')
                    throw new AppError(422, 'REFERENCE_INVALID', '关联记录无效，无法保存');
                if (['P2028', 'P2034'].includes(error.code))
                    throw new AppError(503, 'STORE_BUSY', '系统繁忙，请使用原请求编号重试');
            }
            throw new AppError(503, 'STORE_UNAVAILABLE', '数据库操作未完成，请联系维护人员');
        }
    }
    async close(): Promise<void> { await this.client.$disconnect(); }
}
