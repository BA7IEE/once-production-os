import type { Base } from './model.ts';

export interface Shortlist extends Base {
  projectId: string;
  maintainerId: string;
  title: string;
  brief: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
}

export interface ShortlistPerson extends Base {
  shortlistId: string;
  personId: string;
  position: number;
  groupLabel: string;
  state: 'CANDIDATE' | 'PRIORITY' | 'CONTACTED' | 'NOT_SUITABLE';
  note: string;
  addedPersonRevision: number;
  addedPersonEpoch: number;
  addedSourceRevision: number;
  addedSourceEpoch: number;
}

export interface ShortlistWork extends Base {
  shortlistId: string;
  workId: string;
  position: number;
  note: string;
  addedWorkRevision: number;
  addedSourceRevision: number;
  addedSourceEpoch: number;
}

export const SHORTLIST_LIMITS = Object.freeze({ people: 100, works: 30 });
