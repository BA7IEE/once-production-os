import type { Page } from './dto.ts';
export type ProductionKind = 'work' | 'project';
export type Selection = {
    kind: ProductionKind;
    id: string;
};
export interface WorkSummary {
    id: string;
    title: string;
    industryCode: string | null;
    workTypeCodes: string[];
    origin: 'ONCE' | 'EXTERNAL' | 'UNKNOWN';
    status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
    revision: number;
    updatedAt: string;
}
export interface ProjectSummary {
    id: string;
    title: string;
    status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
    revision: number;
    updatedAt: string;
}
export interface PersonRef {
    id: string;
    displayName: string;
}
export interface WorkItem {
    id: string;
    position: number;
    isCover: boolean;
    asset: {
        id: string;
        fileName: string;
        width: number;
        height: number;
        revision: number;
    } | null;
}
export interface Credit {
    id: string;
    person: PersonRef | null;
    roleCode: string | null;
    note: string | null;
}
export interface WorkDetail extends WorkSummary {
    sourceId: string;
    scopeId: string;
    maintainerId: string;
    description: string;
    originNote: string;
    canEdit: boolean;
    items: WorkItem[];
    credits: Credit[];
    projects: Array<ProjectSummary & {
        relation: 'REFERENCE' | 'DELIVERABLE';
    }>;
}
export interface Participant extends Credit {
    state: 'NOMINATED' | 'CONFIRMED' | 'ACTUAL' | null;
}
export interface ProjectDetail extends ProjectSummary {
    sourceId: string;
    scopeId: string;
    maintainerId: string;
    brief: string;
    locationNote: string;
    dateNote: string;
    reviewNote: string;
    canEdit: boolean;
    participants: Participant[];
    works: Array<{
        id: string;
        work: WorkSummary | null;
        relation: 'REFERENCE' | 'DELIVERABLE' | null;
    }>;
}
export interface PersonProduction {
    works: Page<WorkSummary & {
        roles: string[];
    }>;
    projects: Page<ProjectSummary & {
        participations: Array<{
            roleCode: string;
            state: string;
            note: string;
        }>;
    }>;
    actualProjectCount: number;
}
