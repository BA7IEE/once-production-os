import { AppError } from '../../packages/core/src/errors.ts';
import type { Store, Tx } from '../../packages/core/src/store.ts';
import type { Table, TableMap } from '../../packages/core/src/model.ts';
const tables: Table[] = ['personMerges', 'personAliases', 'deletionRequests', 'deletionItems', 'usePermissions', 'exports', 'exportDependencies', 'shortlists', 'shortlistItems', 'shortlistItemAssets', 'works', 'workAssets', 'workCredits', 'projects', 'projectParticipants', 'projectWorks', 'workspaces', 'users', 'memberships', 'sessions', 'activations', 'scopes', 'scopeMembers', 'sources', 'sourceHistory', 'people', 'contacts', 'evidence', 'dictionary', 'receipts', 'audits', 'rateBuckets', 'imports', 'jobs', 'handoffs', 'uploads', 'assets'];
type Data = {
    [K in Table]: Map<string, TableMap[K]>;
};
/** Test double only. It is never imported by apps/api and does not emulate PostgreSQL FKs,
 * isolation levels, advisory locks or crashes. These need the separate PostgreSQL test suite. */
export class MemoryStore implements Store {
    data: Data;
    private tail: Promise<void> = Promise.resolve();
    failNextAudit = false;
    constructor() { this.data = Object.fromEntries(tables.map(t => [t, new Map()])) as Data; }
    async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
        const previous = this.tail;
        let release!: () => void;
        this.tail = new Promise<void>(r => { release = r; });
        await previous;
        const draft = structuredClone(this.data);
        const tx: Tx = {
            get: async <K extends Table>(table: K, id: string): Promise<TableMap[K] | null> => structuredClone(draft[table].get(id) ?? null) as TableMap[K] | null,
            find: async <K extends Table>(table: K, where: Partial<TableMap[K]> = {}): Promise<TableMap[K][]> => {
                const rows = [...draft[table].values()] as TableMap[K][];
                return structuredClone(rows.filter(row => Object.entries(where).every(([key, value]) => JSON.stringify((row as unknown as Record<string, unknown>)[key]) === JSON.stringify(value))));
            },
            insert: async <K extends Table>(table: K, row: TableMap[K]): Promise<void> => {
                if (table === 'audits' && this.failNextAudit) {
                    this.failNextAudit = false;
                    throw new Error('injected audit failure');
                }
                if (draft[table].has(row.id))
                    throw new Error('duplicate id');
                (draft[table] as Map<string, TableMap[K]>).set(row.id, structuredClone(row));
            },
            replace: async <K extends Table>(table: K, row: TableMap[K]): Promise<void> => {
                if (table === 'sourceHistory')
                    throw new AppError(409, 'HISTORY_IMMUTABLE', '来源历史只允许追加');
                if (!draft[table].has(row.id))
                    throw new Error('missing row');
                (draft[table] as Map<string, TableMap[K]>).set(row.id, structuredClone(row));
            },
            remove: async (table, id) => {
                if (table === 'sourceHistory')
                    throw new AppError(409, 'HISTORY_IMMUTABLE', '来源历史只允许追加');
                draft[table].delete(id);
            },
            redactSourceHistory: async (id, at) => {
                const row = draft.sourceHistory.get(id);
                if (!row) return;
                if ((row.snapshot as any)?.erased === true) return;
                draft.sourceHistory.set(id, { ...row, updatedAt: at,
                    decisionReason: row.decisionReason === null ? null : '[ERASED]',
                    snapshot: { id: row.sourceId, workspaceId: row.workspaceId, revision: row.sourceRevision, scopeId: row.scopeId, erased: true } });
            },
            talentQuery: async input => {
                const scopeIds = new Set(input.visibleScopeIds), sourceIds = new Set(input.visibleSourceIds);
                const blocks = [...draft.deletionRequests.values()].filter(d => d.workspaceId === input.workspaceId && d.state !== 'DRAFT');
                const mergedPeople = new Set([...draft.personAliases.values()].filter(a => a.workspaceId === input.workspaceId).map(a => a.oldPersonId));
                const blocked = (kind: string) => new Set(blocks.filter(d => d.targetKind === kind).map(d => d.targetId));
                const blockedPeople = blocked('PERSON'), blockedWorks = blocked('WORK'), blockedProjects = blocked('PROJECT');
                const works = [...draft.works.values()].filter(w => w.workspaceId === input.workspaceId && !blockedWorks.has(w.id) && scopeIds.has(w.scopeId) && sourceIds.has(w.sourceId));
                const workById = new Map(works.map(w => [w.id, w]));
                const credits = [...draft.workCredits.values()].filter(c => c.workspaceId === input.workspaceId && workById.has(c.workId));
                const projects = new Map([...draft.projects.values()].filter(p => p.workspaceId === input.workspaceId && !blockedProjects.has(p.id) && scopeIds.has(p.scopeId) && sourceIds.has(p.sourceId)).map(p => [p.id, p]));
                const actual = [...draft.projectParticipants.values()].filter(p => p.workspaceId === input.workspaceId && p.state === 'ACTUAL' && projects.has(p.projectId));
                const facts = (personId: string) => {
                    const linked = credits.filter(c => c.personId === personId).map(c => workById.get(c.workId)!).filter(Boolean);
                    return { industryCodes: [...new Set(linked.flatMap(w => w.industryCode ? [w.industryCode] : []))].sort(),
                        workTypeCodes: [...new Set(linked.flatMap(w => w.workTypeCodes))].sort() };
                };
                const projectCount = (personId: string) => new Set(actual.filter(p => p.personId === personId).map(p => p.projectId)).size;
                const all = [...draft.people.values()].filter(p => p.workspaceId === input.workspaceId && !mergedPeople.has(p.id) && !blockedPeople.has(p.id) && scopeIds.has(p.scopeId) && sourceIds.has(p.sourceId)).map(person => {
                    const f = facts(person.id); return { person, actualProjectCount: projectCount(person.id), ...f };
                }).filter(row => {
                    const p = row.person;
                    return (!input.q || [p.displayName, ...p.aliases].some(x => x.toLocaleLowerCase().includes(input.q)))
                        && (!input.role || p.roles.includes(input.role)) && (!input.cityCode || p.cityCode === input.cityCode)
                        && (!input.languageCode || p.languageCodes.includes(input.languageCode)) && (!input.skillCode || p.skillCodes.includes(input.skillCode))
                        && (!input.status || p.status === input.status) && (!input.actualProject || row.actualProjectCount > 0)
                        && (!input.industryCode || row.industryCodes.includes(input.industryCode)) && (!input.workTypeCode || row.workTypeCodes.includes(input.workTypeCode));
                }).sort((a, b) => b.person.updatedAt.localeCompare(a.person.updatedAt) || a.person.id.localeCompare(b.person.id));
                const chosen = input.scanForVerification ? all : all.slice((input.page - 1) * input.pageSize, input.page * input.pageSize);
                const ids = new Set(chosen.map(r => r.person.id));
                const count = (codes: string[], matches: (row: typeof all[number], code: string) => boolean) =>
                    [...new Set(codes)].sort().map(code => ({ code, count: all.filter(row => matches(row, code)).length }));
                const facetCounts = {
                    roles: count(all.flatMap(r => r.person.roles), (r, code) => r.person.roles.includes(code)),
                    cities: count(all.flatMap(r => r.person.cityCode ? [r.person.cityCode] : []), (r, code) => r.person.cityCode === code),
                    languages: count(all.flatMap(r => r.person.languageCodes), (r, code) => r.person.languageCodes.includes(code)),
                    skills: count(all.flatMap(r => r.person.skillCodes), (r, code) => r.person.skillCodes.includes(code)),
                    industries: count(all.flatMap(r => r.industryCodes), (r, code) => r.industryCodes.includes(code)),
                    workTypes: count(all.flatMap(r => r.workTypeCodes), (r, code) => r.workTypeCodes.includes(code))
                };
                return { rows: structuredClone(chosen), baseTotal: all.length, alreadyPaged: !input.scanForVerification,
                    facets: structuredClone(facetCounts),
                    evidence: structuredClone([...draft.evidence.values()].filter(e => e.workspaceId === input.workspaceId && ids.has(e.personId) && sourceIds.has(e.sourceId))) };
            }
        };
        try {
            const result = await fn(tx);
            this.data = draft;
            return result;
        }
        finally {
            release();
        }
    }
    async close(): Promise<void> { }
    rows<K extends Table>(name: K): TableMap[K][] { return structuredClone([...this.data[name].values()]) as TableMap[K][]; }
}
