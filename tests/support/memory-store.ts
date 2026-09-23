import { AppError } from '../../packages/core/src/errors.ts';
import type { Store, Tx } from '../../packages/core/src/store.ts';
import type { Table, TableMap } from '../../packages/core/src/model.ts';
const tables: Table[] = ['workspaces', 'users', 'memberships', 'sessions', 'activations', 'scopes', 'scopeMembers', 'sources', 'sourceHistory', 'people', 'contacts', 'evidence', 'dictionary', 'receipts', 'audits', 'rateBuckets', 'imports', 'jobs', 'handoffs', 'uploads', 'assets'];
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
            remove: async (table, id) => { if (table === 'sourceHistory')
                throw new AppError(409, 'HISTORY_IMMUTABLE', '来源历史只允许追加'); draft[table].delete(id); }
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
