import type {CommandPrincipal} from './talent-auth-model.ts';
import {invariant} from './errors.ts';
import {brandFor} from './project-parties.ts';
import {aiOperator} from './ai-operations.ts';
import {AiBusiness} from './ai-business.ts';
import {LocaleTexts} from './locale.ts';
import {exportPermissionSource} from './exports.ts';
import { authorizeTd2Resource } from './talent-v2-access.ts';
import { td2PersonFor } from './talent-v2-graph.ts';
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
export async function authorizeReceipt(tx: Tx, actor: CommandPrincipal, receipt: CommandReceipt, clock: Clock, config?: Config): Promise<void> {
    if(actor.actorKind==='TALENT'){
        const account=await tx.get('talentAccounts',actor.talentAccountId);
        invariant(receipt.principalKind==='TALENT'&&receipt.talentAccountId===actor.talentAccountId&&receipt.workspaceId===actor.workspaceId&&receipt.resourceKind==='talentAccount'&&receipt.resourceId===actor.talentAccountId&&account?.status==='ACTIVE'&&account.sessionEpoch===actor.sessionEpoch,'REPLAY_FORBIDDEN','当前账号不能读取此回执',403);return;
    }
    const id = receipt.resourceId;
    switch (receipt.resourceKind) {
        case 'talentAccount': requirePermission(actor,'members.manage');if(!await workspaceRow(tx,'talentAccounts',id,actor.workspaceId))missing();return;
        case 'brand': await brandFor(tx,actor,id,clock);return;
        case 'aiConnectionTest': case 'aiConnection': case 'aiApproval': case 'aiAttempt': case 'aiBudget': {
            aiOperator(actor);const table=receipt.resourceKind==='aiConnectionTest'?'aiRuns':receipt.resourceKind==='aiConnection'?'aiConnections':receipt.resourceKind==='aiApproval'?'aiApprovals':receipt.resourceKind==='aiAttempt'?'aiAttempts':'aiBudgets';
            if(!await workspaceRow(tx,table,id,actor.workspaceId))missing();return;
        }
        case 'aiTask': if(!config)missing();await new AiBusiness(clock,config).access(tx,actor,id);return;
        case 'aiGrant': if(!config)missing();await new AiBusiness(clock,config).grantAccess(tx,actor,id);return;
        case 'localeText': await new LocaleTexts(clock).access(tx,actor,id);return;
        case 'talentMigrationReview': case 'talentFact': case 'fieldProposal': case 'servicePrincipal': case 'organization': case 'capabilityDefinition':
            return authorizeTd2Resource(tx,actor,receipt.resourceKind,id,clock);
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
            if(row.retentionBasisSourceId&&receipt.operation!=='usePermission.revoke')await exportPermissionSource(tx,actor,row,clock);
            else {await sourceFor(tx, actor, row.sourceId, clock, receipt.operation !== 'usePermission.revoke',!!row.retentionBasisSourceId);if(row.retentionBasisSourceId)await sourceFor(tx,actor,row.retentionBasisSourceId,clock,false);}
            if (receipt.operation !== 'usePermission.revoke' && row.status !== 'ACTIVE') missing();
            return;
        }
        case 'export': {
            requirePermission(actor, 'data.export');
            if (config?.dataEgressMode !== 'INTERNAL_APPROVED') missing();
            const row = await workspaceRow(tx, 'exports', id, actor.workspaceId);
            if (!row || row.actorId !== actor.membershipId) missing();
            for (const dep of await tx.find('exportDependencies', { workspaceId: actor.workspaceId, exportId: id })) {
                const permission = await workspaceRow(tx, 'usePermissions', dep.usePermissionId, actor.workspaceId);
                if (!permission || permission.status !== 'ACTIVE' || permission.revision !== dep.usePermissionRevision || Date.parse(permission.validUntil) <= clock.now().getTime())
                    missing();
                if(permission.retentionBasisSourceId){await exportPermissionSource(tx,actor,permission,clock);await sourceFor(tx,actor,dep.sourceId,clock,false,true);}else await sourceFor(tx,actor,dep.sourceId,clock);
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
            if(['directory.talent.create','directory.talent.update'].includes(receipt.operation)){requirePermission(actor,'records.write');const person=await td2PersonFor(tx,actor,id);await sourceFor(tx,actor,person.sourceId,clock);return;}
            if(receipt.operation.startsWith('td2.')){await td2PersonFor(tx,actor,id);return;}
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
