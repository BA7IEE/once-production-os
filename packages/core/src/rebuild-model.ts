import type { Table } from './model.ts';

export const REBUILD_SCHEMA_VERSION = 'once-export-v1' as const;

export const REBUILD_EMPTY_TABLES: Table[] = [
    'personMerges', 'personAliases', 'deletionRequests', 'deletionItems',
    'usePermissions', 'exports', 'exportDependencies',
    'shortlists', 'shortlistItems', 'shortlistItemAssets',
    'works', 'workAssets', 'workCredits',
    'projects', 'projectParticipants', 'projectWorks',
    'uploads', 'assets',
    'sources', 'sourceHistory', 'people', 'contacts', 'evidence',
    'imports', 'jobs', 'handoffs'
];

export const REBUILD_LIMITS = Object.freeze({
    sources: 200,
    people: 100,
    works: 30,
    projects: 30,
    media: 1000,
    relations: 3000
});

export interface RebuildSummary {
    schemaVersion: typeof REBUILD_SCHEMA_VERSION;
    exportId: string;
    inputDigest: string;
    workspaceId: string;
    scopeId: string;
    counts: {
        sources: number;
        people: number;
        works: number;
        projects: number;
        workCredits: number;
        projectParticipants: number;
        projectWorks: number;
        mediaIdentities: number;
    };
    mediaRestored: 0;
}
