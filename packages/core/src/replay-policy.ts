import type { Actor, Clock, CommandReceipt } from './model.ts';
import { profileAccess } from './handoff-policy.ts';
import { handoffParticipant } from './handoffs.ts';
import type { Tx } from './store.ts';
import { workspaceRow } from './helpers.ts';
import { missing } from './errors.ts';
import { personFor, sourceFor, sourceCurrent, requireScope, requirePermission } from './policy.ts';
/** Domain authorization for returning minimal command receipts. Not part of the generic receipt engine. */
export async function authorizeReceipt(tx: Tx, actor: Actor, receipt: CommandReceipt, clock: Clock): Promise<void> {
    const id = receipt.resourceId;
    switch (receipt.resourceKind) {
        case 'handoff':
            await handoffParticipant(tx, actor, id);
            return;
        case 'person':
            if (['person.update', 'evidence.confirm'].includes(receipt.operation)) {
                await profileAccess(tx, actor, id, clock, receipt.operation === 'person.update' ? 'edit' : 'review');
                return;
            }
            await personFor(tx, actor, id, clock);
            return;
        case 'source': {
            const source = await sourceFor(tx, actor, id, clock, false);
            if (!sourceCurrent(source, clock) && !actor.permissions.includes('sources.review'))
                missing();
            return;
        }
        case 'scope':
            await requireScope(tx, actor, id);
            return;
        case 'membership':
            requirePermission(actor, 'members.manage');
            if (!(await workspaceRow(tx, 'memberships', id, actor.workspaceId)))
                missing();
            return;
        case 'catalog':
            requirePermission(actor, 'records.read');
            if (!(await workspaceRow(tx, 'dictionary', id, actor.workspaceId)))
                missing();
            return;
        case 'import': {
            const batch = await workspaceRow(tx, 'imports', id, actor.workspaceId);
            if (!batch || batch.actorId !== actor.membershipId || Date.parse(batch.expiresAt) <= clock.now().getTime())
                missing();
            await sourceFor(tx, actor, batch.sourceId, clock);
            return;
        }
        case 'job': {
            const job = await workspaceRow(tx, 'jobs', id, actor.workspaceId);
            if (!job || job.actorId !== actor.membershipId)
                missing();
            const batch = await workspaceRow(tx, 'imports', job.aggregateId, actor.workspaceId);
            if (!batch)
                missing();
            await sourceFor(tx, actor, batch.sourceId, clock);
            return;
        }
    }
}
