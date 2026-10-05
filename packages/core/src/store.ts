import type {DirectoryDatabaseQuery,DirectoryDatabaseResult} from './talent-directory-query.ts';
import type { Table, TableMap } from './model.ts';
import type { TalentQueryFilters, TalentQueryResult } from './search-query-model.ts';
/** A short database transaction. All implementations must atomically commit or roll back. */
export interface PurgeOverview {pending:number;cleaning:number;unknown:number;recentFailures:number;oldestDue:string|null;pendingBytes:number;reconcileIds:string[]}
export interface Tx {
    mediaPurgeOverview(workspaceId:string,now:string):Promise<PurgeOverview>;
    /** Indexed bounded scheduling query; does not load the workspace into memory. */
    mediaPurgeCandidates(now:string,limit:number):Promise<string[]>;
    talentDirectoryQuery(input:DirectoryDatabaseQuery):Promise<DirectoryDatabaseResult>;
    findIn<K extends Table>(table:K,workspaceId:string,field:keyof TableMap[K],ids:string[]):Promise<TableMap[K][]>;
    get<K extends Table>(table: K, id: string): Promise<TableMap[K] | null>;
    find<K extends Table>(table: K, where?: Partial<TableMap[K]>): Promise<TableMap[K][]>;
    insert<K extends Table>(table: K, row: TableMap[K]): Promise<void>;
    replace<K extends Table>(table: K, row: TableMap[K]): Promise<void>;
    remove<K extends Table>(table: K, id: string): Promise<void>;
    /** One-way reviewed SourceHistory payload redaction. Generic replace/remove stay forbidden. */
    redactSourceHistory(id: string, at: string): Promise<void>;
    /** Dedicated frozen-plan erasure; generic retired profile mutations remain forbidden. */
    eraseRetiredProfile(table:'talentProfiles'|'castingProfiles',id:string,erasureId:string):Promise<void>;
    redactMergeReason(id:string,erasureId:string,at:string):Promise<void>;
    /** Bounded internal talent search adapter. Authorization inputs are computed by core policy first. */
    talentQuery(input: TalentQueryFilters): Promise<TalentQueryResult>;
}
export interface Store {
    /** The first single-workspace slice serializes writes and authorization-sensitive reads.
     * No HTTP, password hashing or large file processing may execute inside fn. */
    transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
    close(): Promise<void>;
}
