import { PrismaClient, Prisma } from '@prisma/client';
import type { Table, TableMap } from '../../../packages/core/src/model.ts';
import type { Store, Tx } from '../../../packages/core/src/store.ts';
import type { TalentQueryFilters, TalentQueryResult } from '../../../packages/core/src/search-query-model.ts';
import { AppError } from '../../../packages/core/src/errors.ts';
const DELEGATE: Record<Table, string> = { shortlists: 'shortlist', shortlistItems: 'shortlistItem', shortlistItemAssets: 'shortlistItemAsset', works: 'work', workAssets: 'workAsset', workCredits: 'workCredit', projects: 'project', projectParticipants: 'projectParticipant', projectWorks: 'projectWork', workspaces: 'workspace', users: 'user', memberships: 'membership', sessions: 'session', activations: 'activation',
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
                    },
                    talentQuery: async (input: TalentQueryFilters): Promise<TalentQueryResult> => {
                        if (!input.visibleScopeIds.length || !input.visibleSourceIds.length)
                            return { rows: [], baseTotal: 0, alreadyPaged: !input.scanForVerification, facets: [], evidence: [] };
                        const uuidList = (values: string[]) => Prisma.join(values.map(value => Prisma.sql`${value}::uuid`));
                        const scopeList = uuidList(input.visibleScopeIds), sourceList = uuidList(input.visibleSourceIds);
                        const clauses: Prisma.Sql[] = [
                            Prisma.sql`p."workspaceId" = ${input.workspaceId}::uuid`,
                            Prisma.sql`p."scopeId" IN (${scopeList})`,
                            Prisma.sql`p."sourceId" IN (${sourceList})`
                        ];
                        if (input.q)
                            clauses.push(Prisma.sql`(strpos(lower(p."displayName"), ${input.q}) > 0 OR EXISTS (SELECT 1 FROM unnest(p."aliases") AS a(alias) WHERE strpos(lower(a.alias), ${input.q}) > 0))`);
                        if (input.role)
                            clauses.push(Prisma.sql`${input.role} = ANY(p."roles")`);
                        if (input.cityCode)
                            clauses.push(Prisma.sql`p."cityCode" = ${input.cityCode}`);
                        if (input.languageCode)
                            clauses.push(Prisma.sql`${input.languageCode} = ANY(p."languageCodes")`);
                        if (input.skillCode)
                            clauses.push(Prisma.sql`${input.skillCode} = ANY(p."skillCodes")`);
                        if (input.status)
                            clauses.push(Prisma.sql`p."status" = ${input.status}`);
                        if (input.actualProject)
                            clauses.push(Prisma.sql`EXISTS (
                                SELECT 1 FROM "projectParticipants" pp
                                JOIN "projects" pr ON pr."workspaceId" = pp."workspaceId" AND pr."id" = pp."projectId"
                                WHERE pp."workspaceId" = p."workspaceId" AND pp."personId" = p."id" AND pp."state" = 'ACTUAL'
                                  AND pr."scopeId" IN (${scopeList}) AND pr."sourceId" IN (${sourceList})
                            )`);
                        if (input.industryCode)
                            clauses.push(Prisma.sql`EXISTS (
                                SELECT 1 FROM "workCredits" wc
                                JOIN "works" w ON w."workspaceId" = wc."workspaceId" AND w."id" = wc."workId"
                                WHERE wc."workspaceId" = p."workspaceId" AND wc."personId" = p."id"
                                  AND w."scopeId" IN (${scopeList}) AND w."sourceId" IN (${sourceList})
                                  AND w."industryCode" = ${input.industryCode}
                            )`);
                        if (input.workTypeCode)
                            clauses.push(Prisma.sql`EXISTS (
                                SELECT 1 FROM "workCredits" wc
                                JOIN "works" w ON w."workspaceId" = wc."workspaceId" AND w."id" = wc."workId"
                                WHERE wc."workspaceId" = p."workspaceId" AND wc."personId" = p."id"
                                  AND w."scopeId" IN (${scopeList}) AND w."sourceId" IN (${sourceList})
                                  AND ${input.workTypeCode} = ANY(w."workTypeCodes")
                            )`);
                        const where = Prisma.join(clauses, ' AND ');
                        type DbRow = {
                            id: string; workspaceId: string; createdAt: Date; updatedAt: Date; revision: number;
                            scopeId: string; sourceId: string; maintainerId: string; displayName: string; aliases: string[];
                            roles: string[]; cityCode: string | null; languageCodes: string[]; skillCodes: string[];
                            heightCm: number | null; intro: string; status: string; protectionEpoch: number;
                            actualProjectCount: number; industryCodes: string[]; workTypeCodes: string[];
                        };
                        const select = Prisma.sql`SELECT p.*,
                            (SELECT COUNT(DISTINCT pp."projectId")::int
                               FROM "projectParticipants" pp
                               JOIN "projects" pr ON pr."workspaceId" = pp."workspaceId" AND pr."id" = pp."projectId"
                              WHERE pp."workspaceId" = p."workspaceId" AND pp."personId" = p."id" AND pp."state" = 'ACTUAL'
                                AND pr."scopeId" IN (${scopeList}) AND pr."sourceId" IN (${sourceList})) AS "actualProjectCount",
                            COALESCE((SELECT array_agg(DISTINCT w."industryCode" ORDER BY w."industryCode") FILTER (WHERE w."industryCode" IS NOT NULL)
                               FROM "workCredits" wc JOIN "works" w ON w."workspaceId" = wc."workspaceId" AND w."id" = wc."workId"
                              WHERE wc."workspaceId" = p."workspaceId" AND wc."personId" = p."id"
                                AND w."scopeId" IN (${scopeList}) AND w."sourceId" IN (${sourceList})), ARRAY[]::text[]) AS "industryCodes",
                            COALESCE((SELECT array_agg(DISTINCT wt.code ORDER BY wt.code)
                               FROM "workCredits" wc JOIN "works" w ON w."workspaceId" = wc."workspaceId" AND w."id" = wc."workId"
                               CROSS JOIN LATERAL unnest(w."workTypeCodes") AS wt(code)
                              WHERE wc."workspaceId" = p."workspaceId" AND wc."personId" = p."id"
                                AND w."scopeId" IN (${scopeList}) AND w."sourceId" IN (${sourceList})), ARRAY[]::text[]) AS "workTypeCodes"
                            FROM "people" p WHERE ${where}`;
                        const count = await p.$queryRaw<Array<{ count: number }>>(Prisma.sql`SELECT COUNT(*)::int AS count FROM "people" p WHERE ${where}`);
                        const pageSql = input.scanForVerification ? Prisma.empty : Prisma.sql` LIMIT ${input.pageSize} OFFSET ${(input.page - 1) * input.pageSize}`;
                        const selected = await p.$queryRaw<DbRow[]>(Prisma.sql`${select} ORDER BY p."updatedAt" DESC, p."id" ASC${pageSql}`);
                        const facetRows = input.scanForVerification ? selected : await p.$queryRaw<DbRow[]>(Prisma.sql`${select} ORDER BY p."updatedAt" DESC, p."id" ASC`);
                        const toRow = (row: DbRow) => ({
                            person: plain({ id: row.id, workspaceId: row.workspaceId, createdAt: row.createdAt, updatedAt: row.updatedAt,
                                revision: row.revision, scopeId: row.scopeId, sourceId: row.sourceId, maintainerId: row.maintainerId,
                                displayName: row.displayName, aliases: row.aliases, roles: row.roles, cityCode: row.cityCode,
                                languageCodes: row.languageCodes, skillCodes: row.skillCodes, heightCm: row.heightCm, intro: row.intro,
                                status: row.status, protectionEpoch: row.protectionEpoch }) as TableMap['people'],
                            actualProjectCount: row.actualProjectCount, industryCodes: row.industryCodes, workTypeCodes: row.workTypeCodes
                        });
                        const rows = selected.map(toRow);
                        const ids = rows.map(row => row.person.id);
                        const evidence = ids.length ? plain(await p.fieldEvidence.findMany({ where: {
                            workspaceId: input.workspaceId, personId: { in: ids }, sourceId: { in: input.visibleSourceIds }
                        } })) as TableMap['evidence'][] : [];
                        return { rows, baseTotal: count[0]?.count ?? 0, alreadyPaged: !input.scanForVerification,
                            facets: facetRows.map(row => ({ personId: row.id, roles: row.roles, cityCode: row.cityCode,
                                languageCodes: row.languageCodes, skillCodes: row.skillCodes,
                                industryCodes: row.industryCodes, workTypeCodes: row.workTypeCodes })), evidence };
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
