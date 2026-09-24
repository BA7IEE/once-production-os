import type { Actor, Clock } from './model.ts';
import type { Tx } from './store.ts';
import type { Shortlist } from './shortlist-model.ts';
import { workspaceRow } from './helpers.ts';
import { missing } from './errors.ts';
import { projectFor } from './production-policy.ts';

export async function shortlistFor(tx: Tx, actor: Actor, id: string, clock: Clock): Promise<Shortlist> {
  const row = await workspaceRow(tx, 'shortlists', id, actor.workspaceId);
  if (!row) missing();
  await projectFor(tx, actor, row.projectId, clock);
  return row;
}

export function shortlistHeader(row: Shortlist) {
  return { id: row.id, projectId: row.projectId, title: row.title, brief: row.brief, status: row.status, revision: row.revision, updatedAt: row.updatedAt };
}
