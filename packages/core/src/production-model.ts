import type { Base } from './model.ts';
export interface Work extends Base {
    sourceId: string;
    scopeId: string;
    maintainerId: string;
    title: string;
    description: string;
    industryCode: string | null;
    workTypeCodes: string[];
    origin: 'ONCE' | 'EXTERNAL' | 'UNKNOWN';
    originNote: string;
    status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'ERASED';
    coverEntryId: string | null;
}
export interface WorkAsset extends Base {
    workId: string;
    assetId: string;
    position: number;
}
/** Manual credit, supported by the Work's source. Never a project participation or verified Person field. */
export interface WorkCredit extends Base {
    workId: string;
    personId: string;
    roleCode: string;
    note: string;
}
export interface Project extends Base {
    sourceId: string;
    scopeId: string;
    maintainerId: string;
    title: string;
    brief: string;
    locationNote: string;
    dateNote: string;
    reviewNote: string;
    status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED' | 'ERASED';
}
export interface ProjectParticipant extends Base {
    projectId: string;
    personId: string;
    roleCode: string;
    state: 'NOMINATED' | 'CONFIRMED' | 'ACTUAL';
    note: string;
}
export interface ProjectWork extends Base {
    projectId: string;
    workId: string;
    relation: 'REFERENCE' | 'DELIVERABLE';
}
/** WP1 editing bounds, not a promise about whole-workspace query performance. */
export const PRODUCTION_LIMITS = Object.freeze({ assets: 30, credits: 50, participants: 50, works: 30 });
