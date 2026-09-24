import type { WorkSummary, ProjectSummary } from './production-dto.ts';

export interface ShortlistSummary {
  id: string;
  projectId: string;
  title: string;
  brief: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  revision: number;
  updatedAt: string;
}
export interface ShortlistPersonEntry {
  id: string;
  position: number;
  person: { id: string; displayName: string; roles: string[]; cityCode: string | null; revision: number } | null;
  groupLabel: string | null;
  state: 'CANDIDATE' | 'PRIORITY' | 'CONTACTED' | 'NOT_SUITABLE' | null;
  note: string | null;
  changedSinceAdded: boolean | null;
}
export interface ShortlistWorkEntry {
  id: string;
  position: number;
  work: WorkSummary | null;
  note: string | null;
  changedSinceAdded: boolean | null;
}
export interface ShortlistDetail extends ShortlistSummary {
  maintainerId: string;
  project: Pick<ProjectSummary, 'id' | 'title' | 'status'>;
  people: ShortlistPersonEntry[];
  works: ShortlistWorkEntry[];
  canEdit: boolean;
}
