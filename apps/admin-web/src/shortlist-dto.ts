import type { Page } from './dto.ts';
import type { WorkSummary } from './production-dto.ts';

export interface TalentSearchMatch {
    field: string;
    value: string;
    basis: string;
}
export interface TalentSearchPerson {
    id: string;
    displayName: string;
    roles: string[];
    cityCode: string | null;
    languageCodes: string[];
    skillCodes: string[];
    status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
    revision: number;
    updatedAt: string;
    actualProjectCount: number;
    verification: {
        state: 'CURRENT' | 'UNKNOWN';
        latestReviewedAt: string | null;
    };
    match: TalentSearchMatch[];
}
export interface TalentSearchResponse extends Page<TalentSearchPerson> {
    facets: {
        roles: Array<{ code: string; count: number }>;
        cities: Array<{ code: string; count: number }>;
        languages: Array<{ code: string; count: number }>;
        skills: Array<{ code: string; count: number }>;
    };
    capabilities: {
        supported: string[];
        unsupported: string[];
        note: string;
    };
}
export interface ShortlistSummary {
    id: string;
    title: string;
    brief: string;
    scopeId: string;
    maintainerId: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
}
export interface ShortlistAssetSelection {
    id: string;
    workAssetId: string;
    asset: {
        id: string;
        fileName: string;
        width: number;
        height: number;
        revision: number;
    };
}
export interface ShortlistAvailableItem {
    id: string;
    position: number;
    unavailable: false;
    note: string;
    person: {
        id: string;
        displayName: string;
        roles: string[];
        cityCode: string | null;
        languageCodes: string[];
        skillCodes: string[];
        revision: number;
    };
    work: WorkSummary | null;
    selectedAssets: ShortlistAssetSelection[];
    updatedSinceAdded: boolean;
}
export interface ShortlistUnavailableItem {
    id: string;
    position: number;
    unavailable: true;
}
export type ShortlistItem = ShortlistAvailableItem | ShortlistUnavailableItem;
export interface ShortlistDetail extends ShortlistSummary {
    items: ShortlistItem[];
    canEdit: boolean;
}
