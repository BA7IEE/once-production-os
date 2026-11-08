import type { Base } from './model.ts';

export interface Shortlist extends Base {
    projectId?:string|null;
    scopeId: string;
    maintainerId: string;
    title: string;
    brief: string;
}

export interface ShortlistItem extends Base {
    requirementId?:string|null;requirementRevision?:number|null;selectionCiphertext?:string|null;
    personRoleId?: string | null;
    personRoleRevision?: number | null;
    roleContextState?: 'BOUND' | 'LEGACY_REVIEW' | null;
    shortlistId: string;
    personId: string;
    workId: string | null;
    position: number;
    note: string;
    addedPersonRevision: number;
    addedPersonSourceRevision: number;
    addedWorkRevision: number | null;
    addedWorkSourceRevision: number | null;
}

export interface ShortlistItemAsset extends Base {
    itemId: string;
    assetId: string;
    workId: string;
    workAssetId: string;
    position: number;
}

export const SHORTLIST_LIMITS = Object.freeze({
    items: 100,
    assetsPerItem: 12
});
