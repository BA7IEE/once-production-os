import { Deletions } from './deletions.ts';
import { shortlistFor } from './shortlists.ts';
import { workFor, projectFor } from './production-policy.ts';
import { uploadFor, assetFor } from './media.ts';
import type { Actor, Clock, CommandReceipt, Config } from './model.ts';
import { profileAccess } from './handoff-policy.ts';
import { handoffParticipant } from './handoffs.ts';
import type { Tx } from './store.ts';
import { workspaceRow } from './helpers.ts';
import { missing } from './errors.ts';
import { personFor, sourceFor, sourceCurrent, requireScope, requirePermission } from './policy.ts';
/** Domain authorization for returning minimal command receipts. Not part of the generic receipt engine. */
export async function authorizeReceipt(tx: Tx, actor: Actor, receipt: CommandReceipt, clock: Clock, config?: Config): Promise<void> {
    const id = receipt.resourceId;
    switch (receipt.resourceKind) {
        case 'merge': {
            requirePermission(actor, 'data.merge');
            const row = await workspaceRow(tx, 'personMerges', id, actor.workspaceId);
            if (!row) missing();
            await personFor(tx, actor, row.canonicalPersonId, clock, false);
            return;
        }
        case 'deletion':
            await new Deletions(clock).get(tx, actor, id);
            return;
        case 'usePermission': {
            requirePermission(actor, 'sources.review');
            const row = await workspaceRow(tx, 'usePermissions', id, actor.workspaceId);
            if (!row) missing();
            await sourceFor(tx, actor, row.sourceId, clock, receipt.operation !== 'usePermission.revoke');
            if (receipt.operation !== 'usePermission.revoke' && row.status !== 'ACTIVE') missing();
            return;
        }
        case 'export': {
            requirePermission(actor, 'data.export');
            if (config?.dataEgressMode !== 'INTERNAL_APPROVED') missing();
            const row = await workspaceRow(tx, 'exports', id, actor.workspaceId);
            if (!row || row.actorId !== actor.membershipId) missing();
            for (const dep of await tx.find('exportDependencies', { workspaceId: actor.workspaceId, exportId: id })) {
                await sourceFor(tx, actor, dep.sourceId, clock);
                const permission = await workspaceRow(tx, 'usePermissions', dep.usePermissionId, actor.workspaceId);
                if (!permission || permission.status !== 'ACTIVE' || permission.revision !== dep.usePermissionRevision || Date.parse(permission.validUntil) <= clock.now().getTime())
                    missing();
            }
            return;
        }
        case 'shortlist':
            await shortlistFor(tx, actor, id);
            return;
        case 'work':
            await workFor(tx, actor, id, clock);
            return;
        case 'project':
            await projectFor(tx, actor, id, clock);
            return;
        case 'upload':
            await uploadFor(tx, actor, id);
            return;
        case 'asset':
            await assetFor(tx, actor, id, clock);
            return;
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
