/** Test-only fault injection. Throws AFTER a real Store write, inside its transaction. */
import type { Store, Tx } from '../../packages/core/src/store.ts';
import type { Table, TableMap } from '../../packages/core/src/model.ts';
export class FaultStore implements Store {
    inner: Store;
    afterInsert: ((table: Table, row: TableMap[Table]) => void) | null = null;
    insertTrace: Table[] = [];
    constructor(inner: Store) { this.inner = inner; }
    transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
        return this.inner.transaction(tx => fn({ ...tx, insert: async <K extends Table>(table: K, row: TableMap[K]) => {
            await tx.insert(table, row);
            this.insertTrace.push(table);
            this.afterInsert?.(table, row);
        } }));
    }
    async close(): Promise<void> { /* The caller owns the actual Store. */ }
}
