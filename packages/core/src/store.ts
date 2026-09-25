import type { Table, TableMap } from './model.ts';
import type { TalentQueryFilters, TalentQueryResult } from './search-query-model.ts';
/** A short database transaction. All implementations must atomically commit or roll back. */
export interface Tx {
    get<K extends Table>(table: K, id: string): Promise<TableMap[K] | null>;
    find<K extends Table>(table: K, where?: Partial<TableMap[K]>): Promise<TableMap[K][]>;
    insert<K extends Table>(table: K, row: TableMap[K]): Promise<void>;
    replace<K extends Table>(table: K, row: TableMap[K]): Promise<void>;
    remove<K extends Table>(table: K, id: string): Promise<void>;
    /** One-way reviewed SourceHistory payload redaction. Generic replace/remove stay forbidden. */
    redactSourceHistory(id: string, at: string): Promise<void>;
    /** Bounded internal talent search adapter. Authorization inputs are computed by core policy first. */
    talentQuery(input: TalentQueryFilters): Promise<TalentQueryResult>;
}
export interface Store {
    /** The first single-workspace slice serializes writes and authorization-sensitive reads.
     * No HTTP, password hashing or large file processing may execute inside fn. */
    transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
    close(): Promise<void>;
}
