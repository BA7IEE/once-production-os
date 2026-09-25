import type { Actor, Clock, Person, Source } from './model.ts';
import type { Tx } from './store.ts';
import type { DeletionAction, DeletionEvidenceState, DeletionItem, DeletionRequest, DeletionTargetKind } from './deletion-model.ts';
import { frozenDeletionPlan } from './deletion-model.ts';
import { DELETION_LIMITS as L } from './deletion-model.ts';
import { DeletionSchemas as S } from './deletion-validation.ts';
import { AppError, invariant, missing } from './errors.ts';
import { base, cas, page, touch, workspaceRow } from './helpers.ts';
import { digest } from './json.ts';
import { deletionBlocked, requirePermission, requireScope, scopeVisible, sourceFor } from './policy.ts';
import { appendSourceHistory } from './source-history.ts';
import { shortlistFor } from './shortlists.ts';
import { projectFor, workFor } from './production-policy.ts';

type Impact = {
    resourceKind: string;
    resourceId: string;
    dependencyKind: string;
    proposedAction: DeletionAction;
    evidenceState: DeletionEvidenceState;
    detailCode: string;
};
type Unresolved = { code: string; count: number };

function targetRefs(kind: DeletionTargetKind, id: string) {
    return {
        targetPersonId: kind === 'PERSON' ? id : null,
        targetWorkId: kind === 'WORK' ? id : null,
        targetProjectId: kind === 'PROJECT' ? id : null,
        targetAssetId: kind === 'ASSET' ? id : null,
        targetSourceSubjectId: kind === 'SOURCE' ? id : null
    };
}
function impactKey(i: Impact) { return [i.resourceKind, i.resourceId, i.dependencyKind, i.proposedAction].join(':'); }

export class Deletions {
    clock: Clock;
    constructor(clock: Clock) { this.clock = clock; }

    private async target(tx: Tx, actor: Actor, kind: DeletionTargetKind, id: string) {
        if (kind === 'SOURCE') {
            const row = await sourceFor(tx, actor, id, this.clock, false, true);
            return { source: row, revision: row.revision, protectionEpoch: row.protectionEpoch };
        }
        if (kind === 'PERSON') {
            const row = await workspaceRow(tx, 'people', id, actor.workspaceId);
            if (!row) missing();
            await requireScope(tx, actor, row.scopeId);
            const source = await sourceFor(tx, actor, row.sourceId, this.clock, false, true);
            return { source, revision: row.revision, protectionEpoch: row.protectionEpoch };
        }
        if (kind === 'WORK') {
            const row = await workspaceRow(tx, 'works', id, actor.workspaceId);
            if (!row) missing();
            await requireScope(tx, actor, row.scopeId);
            const source = await sourceFor(tx, actor, row.sourceId, this.clock, false, true);
            return { source, revision: row.revision, protectionEpoch: null };
        }
        if (kind === 'PROJECT') {
            const row = await workspaceRow(tx, 'projects', id, actor.workspaceId);
            if (!row) missing();
            await requireScope(tx, actor, row.scopeId);
            const source = await sourceFor(tx, actor, row.sourceId, this.clock, false, true);
            return { source, revision: row.revision, protectionEpoch: null };
        }
        const row = await workspaceRow(tx, 'assets', id, actor.workspaceId);
        if (!row) missing();
        await requireScope(tx, actor, row.scopeId);
        const source = await sourceFor(tx, actor, row.sourceId, this.clock, false, true);
        return { source, revision: row.revision, protectionEpoch: null };
    }

    private async rootVisible(tx: Tx, actor: Actor, kind: 'WORK' | 'PROJECT' | 'SHORTLIST', id: string) {
        try {
            if (kind === 'SHORTLIST') await shortlistFor(tx, actor, id);
            else if (kind === 'WORK') await workFor(tx, actor, id, this.clock);
            else await projectFor(tx, actor, id, this.clock);
            return true;
        }
        catch (error) {
            if (error instanceof AppError && error.status === 404) return false;
            throw error;
        }
    }

    private async scan(tx: Tx, actor: Actor, targetKind: DeletionTargetKind, targetId: string) {
        const target = await this.target(tx, actor, targetKind, targetId);
        const impacts = new Map<string, Impact>();
        const unresolved = new Map<string, number>();
        const add = (impact: Impact) => { if (impacts.size <= L.impacts) impacts.set(impactKey(impact), impact); };
        const miss = (code: string, count = 1) => unresolved.set(code, (unresolved.get(code) ?? 0) + count);
        const people = new Set<string>(), works = new Set<string>(), projects = new Set<string>(), assets = new Set<string>(), sources = new Set<string>();
        if (targetKind === 'SOURCE') sources.add(targetId);
        if (targetKind === 'PERSON') people.add(targetId);
        if (targetKind === 'WORK') works.add(targetId);
        if (targetKind === 'PROJECT') projects.add(targetId);
        if (targetKind === 'ASSET') assets.add(targetId);

        if (sources.size) {
            for (const sourceId of sources) {
                for (const row of await tx.find('sourceHistory', { workspaceId: actor.workspaceId, sourceId }))
                    add({ resourceKind: 'sourceHistory', resourceId: row.id, dependencyKind: 'SOURCE_HISTORY', proposedAction: 'ERASE_PAYLOAD', evidenceState: 'PROVEN', detailCode: 'SOURCE_SNAPSHOT_CONTAINS_PAYLOAD' });
                for (const row of await tx.find('people', { workspaceId: actor.workspaceId, sourceId })) {
                    if (!(await scopeVisible(tx, actor, row.scopeId))) { miss('HIDDEN_PERSON_DEPENDENCY'); continue; }
                    people.add(row.id);
                    add({ resourceKind: 'person', resourceId: row.id, dependencyKind: 'SOURCE_OWNS_PERSON', proposedAction: 'REVIEW_RETENTION', evidenceState: 'REVIEW_REQUIRED', detailCode: 'SUBJECT_MAY_REQUIRE_INDEPENDENT_BASIS' });
                }
                for (const row of await tx.find('works', { workspaceId: actor.workspaceId, sourceId })) {
                    if (!(await scopeVisible(tx, actor, row.scopeId))) { miss('HIDDEN_WORK_DEPENDENCY'); continue; }
                    works.add(row.id);
                    add({ resourceKind: 'work', resourceId: row.id, dependencyKind: 'SOURCE_OWNS_WORK', proposedAction: 'REVIEW_RETENTION', evidenceState: 'REVIEW_REQUIRED', detailCode: 'WORK_MAY_REQUIRE_INDEPENDENT_BASIS' });
                }
                for (const row of await tx.find('projects', { workspaceId: actor.workspaceId, sourceId })) {
                    if (!(await scopeVisible(tx, actor, row.scopeId))) { miss('HIDDEN_PROJECT_DEPENDENCY'); continue; }
                    projects.add(row.id);
                    add({ resourceKind: 'project', resourceId: row.id, dependencyKind: 'SOURCE_OWNS_PROJECT', proposedAction: 'REVIEW_RETENTION', evidenceState: 'REVIEW_REQUIRED', detailCode: 'PROJECT_MAY_REQUIRE_INDEPENDENT_BASIS' });
                }
                for (const row of await tx.find('assets', { workspaceId: actor.workspaceId, sourceId })) {
                    if (!(await scopeVisible(tx, actor, row.scopeId))) { miss('HIDDEN_ASSET_DEPENDENCY'); continue; }
                    assets.add(row.id);
                    add({ resourceKind: 'asset', resourceId: row.id, dependencyKind: 'SOURCE_OWNS_ASSET', proposedAction: 'ERASE_PAYLOAD', evidenceState: 'PROVEN', detailCode: 'MEDIA_BYTES_AND_PREVIEW' });
                }
                for (const row of await tx.find('contacts', { workspaceId: actor.workspaceId, sourceId }))
                    add({ resourceKind: 'contact', resourceId: row.id, dependencyKind: 'SOURCE_CONTACT', proposedAction: 'ERASE_PAYLOAD', evidenceState: 'PROVEN', detailCode: 'ENCRYPTED_CONTACT_VALUE' });
                for (const row of await tx.find('evidence', { workspaceId: actor.workspaceId, sourceId }))
                    add({ resourceKind: 'evidence', resourceId: row.id, dependencyKind: 'SOURCE_FIELD_EVIDENCE', proposedAction: 'REVIEW_RETENTION', evidenceState: 'REVIEW_REQUIRED', detailCode: 'FACT_MAY_HAVE_OTHER_BASIS' });
                for (const row of await tx.find('imports', { workspaceId: actor.workspaceId, sourceId })) {
                    if (!(await scopeVisible(tx, actor, row.scopeId))) { miss('HIDDEN_IMPORT_DEPENDENCY'); continue; }
                    add({ resourceKind: 'import', resourceId: row.id, dependencyKind: 'SOURCE_IMPORT_BATCH', proposedAction: 'ERASE_PAYLOAD', evidenceState: 'PROVEN', detailCode: 'IMPORT_ROWS' });
                }
                for (const row of await tx.find('uploads', { workspaceId: actor.workspaceId, sourceId })) {
                    if (!(await scopeVisible(tx, actor, row.scopeId))) { miss('HIDDEN_UPLOAD_DEPENDENCY'); continue; }
                    add({ resourceKind: 'upload', resourceId: row.id, dependencyKind: 'SOURCE_UPLOAD', proposedAction: 'ERASE_PAYLOAD', evidenceState: 'PROVEN', detailCode: 'UPLOAD_METADATA_AND_STAGING' });
                }
                for (const row of await tx.find('handoffs', { workspaceId: actor.workspaceId, sourceId })) {
                    if (!(await scopeVisible(tx, actor, row.personScopeId)) || !(await scopeVisible(tx, actor, row.sourceScopeId))) { miss('HIDDEN_HANDOFF_DEPENDENCY'); continue; }
                    add({ resourceKind: 'handoff', resourceId: row.id, dependencyKind: 'SOURCE_HANDOFF', proposedAction: 'RETAIN_MINIMAL_HEADER', evidenceState: 'REVIEW_REQUIRED', detailCode: 'HANDOFF_SECURITY_HISTORY' });
                }
            }
        }

        for (const personId of people) {
            for (const row of await tx.find('contacts', { workspaceId: actor.workspaceId, personId }))
                add({ resourceKind: 'contact', resourceId: row.id, dependencyKind: 'PERSON_CONTACT', proposedAction: 'ERASE_PAYLOAD', evidenceState: 'PROVEN', detailCode: 'ENCRYPTED_CONTACT_VALUE' });
            for (const row of await tx.find('evidence', { workspaceId: actor.workspaceId, personId }))
                add({ resourceKind: 'evidence', resourceId: row.id, dependencyKind: 'PERSON_FIELD_EVIDENCE', proposedAction: 'REVIEW_RETENTION', evidenceState: 'REVIEW_REQUIRED', detailCode: 'FIELD_EVIDENCE' });
            for (const row of await tx.find('uploads', { workspaceId: actor.workspaceId, personId })) {
                if (!(await scopeVisible(tx, actor, row.scopeId))) { miss('HIDDEN_UPLOAD_DEPENDENCY'); continue; }
                add({ resourceKind: 'upload', resourceId: row.id, dependencyKind: 'PERSON_MEDIA_UPLOAD', proposedAction: 'REVIEW_RETENTION', evidenceState: 'REVIEW_REQUIRED', detailCode: 'MEDIA_MAY_HAVE_INDEPENDENT_SOURCE' });
            }
            for (const row of await tx.find('assets', { workspaceId: actor.workspaceId, personId })) {
                if (!(await scopeVisible(tx, actor, row.scopeId))) { miss('HIDDEN_ASSET_DEPENDENCY'); continue; }
                if (!sources.has(row.sourceId))
                    add({ resourceKind: 'asset', resourceId: row.id, dependencyKind: 'PERSON_MEDIA_ASSET', proposedAction: 'REVIEW_RETENTION', evidenceState: 'REVIEW_REQUIRED', detailCode: 'MEDIA_MAY_HAVE_INDEPENDENT_SOURCE' });
            }
            for (const row of await tx.find('workCredits', { workspaceId: actor.workspaceId, personId })) {
                if (await this.rootVisible(tx, actor, 'WORK', row.workId))
                    add({ resourceKind: 'workCredit', resourceId: row.id, dependencyKind: 'PERSON_WORK_CREDIT', proposedAction: 'REMOVE_RELATION', evidenceState: row.note ? 'REVIEW_REQUIRED' : 'PROVEN', detailCode: row.note ? 'RELATION_NOTE_REVIEW' : 'RELATION_ONLY' });
                else miss('HIDDEN_WORK_DEPENDENCY');
            }
            for (const row of await tx.find('projectParticipants', { workspaceId: actor.workspaceId, personId })) {
                if (await this.rootVisible(tx, actor, 'PROJECT', row.projectId))
                    add({ resourceKind: 'projectParticipant', resourceId: row.id, dependencyKind: 'PERSON_PROJECT_PARTICIPATION', proposedAction: 'REMOVE_RELATION', evidenceState: row.note ? 'REVIEW_REQUIRED' : 'PROVEN', detailCode: row.note ? 'RELATION_NOTE_REVIEW' : 'RELATION_ONLY' });
                else miss('HIDDEN_PROJECT_DEPENDENCY');
            }
            for (const row of await tx.find('shortlistItems', { workspaceId: actor.workspaceId, personId })) {
                if (await this.rootVisible(tx, actor, 'SHORTLIST', row.shortlistId)) {
                    add({ resourceKind: 'shortlistItem', resourceId: row.id, dependencyKind: 'PERSON_SHORTLIST_ITEM', proposedAction: 'REMOVE_RELATION', evidenceState: row.note ? 'REVIEW_REQUIRED' : 'PROVEN', detailCode: row.note ? 'SHORTLIST_NOTE_REVIEW' : 'RELATION_ONLY' });
                    for (const child of await tx.find('shortlistItemAssets', { workspaceId: actor.workspaceId, itemId: row.id }))
                        add({ resourceKind: 'shortlistItemAsset', resourceId: child.id, dependencyKind: 'SHORTLIST_ITEM_ASSET', proposedAction: 'REMOVE_RELATION', evidenceState: 'PROVEN', detailCode: 'CHILD_RELATION' });
                }
                else miss('HIDDEN_SHORTLIST_DEPENDENCY');
            }
            for (const row of await tx.find('handoffs', { workspaceId: actor.workspaceId, personId }))
                add({ resourceKind: 'handoff', resourceId: row.id, dependencyKind: 'PERSON_HANDOFF', proposedAction: 'RETAIN_MINIMAL_HEADER', evidenceState: 'REVIEW_REQUIRED', detailCode: 'HANDOFF_SECURITY_HISTORY' });
        }

        for (const workId of works) {
            for (const row of await tx.find('workAssets', { workspaceId: actor.workspaceId, workId }))
                add({ resourceKind: 'workAsset', resourceId: row.id, dependencyKind: 'WORK_ASSET_RELATION', proposedAction: 'REMOVE_RELATION', evidenceState: 'PROVEN', detailCode: 'ASSET_NOT_OWNED_BY_WORK' });
            for (const row of await tx.find('workCredits', { workspaceId: actor.workspaceId, workId }))
                add({ resourceKind: 'workCredit', resourceId: row.id, dependencyKind: 'WORK_CREDIT', proposedAction: 'REMOVE_RELATION', evidenceState: row.note ? 'REVIEW_REQUIRED' : 'PROVEN', detailCode: row.note ? 'RELATION_NOTE_REVIEW' : 'RELATION_ONLY' });
            for (const row of await tx.find('projectWorks', { workspaceId: actor.workspaceId, workId })) {
                if (await this.rootVisible(tx, actor, 'PROJECT', row.projectId))
                    add({ resourceKind: 'projectWork', resourceId: row.id, dependencyKind: 'WORK_PROJECT_RELATION', proposedAction: 'REMOVE_RELATION', evidenceState: 'PROVEN', detailCode: 'RELATION_ONLY' });
                else miss('HIDDEN_PROJECT_DEPENDENCY');
            }
            for (const row of await tx.find('shortlistItems', { workspaceId: actor.workspaceId, workId })) {
                if (await this.rootVisible(tx, actor, 'SHORTLIST', row.shortlistId)) {
                    add({ resourceKind: 'shortlistItem', resourceId: row.id, dependencyKind: 'WORK_SHORTLIST_ITEM', proposedAction: 'REMOVE_RELATION', evidenceState: row.note ? 'REVIEW_REQUIRED' : 'PROVEN', detailCode: row.note ? 'SHORTLIST_NOTE_REVIEW' : 'RELATION_ONLY' });
                    for (const child of await tx.find('shortlistItemAssets', { workspaceId: actor.workspaceId, itemId: row.id }))
                        add({ resourceKind: 'shortlistItemAsset', resourceId: child.id, dependencyKind: 'SHORTLIST_ITEM_ASSET', proposedAction: 'REMOVE_RELATION', evidenceState: 'PROVEN', detailCode: 'CHILD_RELATION' });
                }
                else miss('HIDDEN_SHORTLIST_DEPENDENCY');
            }
        }

        for (const projectId of projects) {
            for (const row of await tx.find('projectParticipants', { workspaceId: actor.workspaceId, projectId }))
                add({ resourceKind: 'projectParticipant', resourceId: row.id, dependencyKind: 'PROJECT_PARTICIPANT', proposedAction: 'REMOVE_RELATION', evidenceState: row.note ? 'REVIEW_REQUIRED' : 'PROVEN', detailCode: row.note ? 'RELATION_NOTE_REVIEW' : 'RELATION_ONLY' });
            for (const row of await tx.find('projectWorks', { workspaceId: actor.workspaceId, projectId }))
                add({ resourceKind: 'projectWork', resourceId: row.id, dependencyKind: 'PROJECT_WORK_RELATION', proposedAction: 'REMOVE_RELATION', evidenceState: 'PROVEN', detailCode: 'RELATION_ONLY' });
        }

        for (const assetId of assets) {
            for (const row of await tx.find('workAssets', { workspaceId: actor.workspaceId, assetId })) {
                if (await this.rootVisible(tx, actor, 'WORK', row.workId))
                    add({ resourceKind: 'workAsset', resourceId: row.id, dependencyKind: 'ASSET_WORK_RELATION', proposedAction: 'REMOVE_RELATION', evidenceState: 'PROVEN', detailCode: 'RELATION_ONLY' });
                else miss('HIDDEN_WORK_DEPENDENCY');
            }
            for (const row of await tx.find('shortlistItemAssets', { workspaceId: actor.workspaceId, assetId })) {
                const item = await workspaceRow(tx, 'shortlistItems', row.itemId, actor.workspaceId);
                if (!item || !(await this.rootVisible(tx, actor, 'SHORTLIST', item.shortlistId))) { miss('HIDDEN_SHORTLIST_DEPENDENCY'); continue; }
                add({ resourceKind: 'shortlistItemAsset', resourceId: row.id, dependencyKind: 'ASSET_SHORTLIST_SELECTION', proposedAction: 'REMOVE_RELATION', evidenceState: 'PROVEN', detailCode: 'RELATION_ONLY' });
            }
        }

        const targetSets: Array<[DeletionTargetKind, Set<string>]> = [['SOURCE', sources], ['PERSON', people], ['WORK', works], ['PROJECT', projects], ['ASSET', assets]];
        for (const [kind, ids] of targetSets) for (const id of ids) {
            const field = kind === 'SOURCE' ? 'subjectSourceId' : kind === 'PERSON' ? 'subjectPersonId' : kind === 'WORK' ? 'subjectWorkId' : kind === 'PROJECT' ? 'subjectProjectId' : 'subjectAssetId';
            for (const row of await tx.find('usePermissions', { workspaceId: actor.workspaceId, [field]: id } as never))
                add({ resourceKind: 'usePermission', resourceId: row.id, dependencyKind: kind + '_USE_PERMISSION', proposedAction: 'REVOKE_PERMISSION', evidenceState: 'PROVEN', detailCode: 'PURPOSE_PERMISSION' });
            const depField = kind === 'SOURCE' ? 'sourceSubjectId' : kind === 'PERSON' ? 'personId' : kind === 'WORK' ? 'workId' : kind === 'PROJECT' ? 'projectId' : 'assetId';
            for (const row of await tx.find('exportDependencies', { workspaceId: actor.workspaceId, [depField]: id } as never)) {
                add({ resourceKind: 'exportDependency', resourceId: row.id, dependencyKind: kind + '_EXPORT_DEPENDENCY', proposedAction: 'ERASE_DERIVATIVE', evidenceState: 'PROVEN', detailCode: 'FROZEN_EXPORT_INPUT' });
                add({ resourceKind: 'export', resourceId: row.exportId, dependencyKind: 'DERIVED_EXPORT_PAYLOAD', proposedAction: 'ERASE_DERIVATIVE', evidenceState: 'PROVEN', detailCode: 'EXPORT_PAYLOAD_DEPENDS_ON_TARGET' });
            }
        }
        if (targetKind === 'SOURCE') {
            for (const row of await tx.find('usePermissions', { workspaceId: actor.workspaceId, sourceId: targetId }))
                add({ resourceKind: 'usePermission', resourceId: row.id, dependencyKind: 'SOURCE_USE_PERMISSION', proposedAction: 'REVOKE_PERMISSION', evidenceState: 'PROVEN', detailCode: 'PURPOSE_PERMISSION' });
            for (const row of await tx.find('exportDependencies', { workspaceId: actor.workspaceId, sourceId: targetId })) {
                add({ resourceKind: 'exportDependency', resourceId: row.id, dependencyKind: 'SOURCE_EXPORT_DEPENDENCY', proposedAction: 'ERASE_DERIVATIVE', evidenceState: 'PROVEN', detailCode: 'FROZEN_EXPORT_INPUT' });
                add({ resourceKind: 'export', resourceId: row.exportId, dependencyKind: 'DERIVED_EXPORT_PAYLOAD', proposedAction: 'ERASE_DERIVATIVE', evidenceState: 'PROVEN', detailCode: 'EXPORT_PAYLOAD_DEPENDS_ON_SOURCE' });
            }
        }

        const sorted = [...impacts.values()].sort((a, b) => [a.resourceKind, a.resourceId, a.dependencyKind].join(':').localeCompare([b.resourceKind, b.resourceId, b.dependencyKind].join(':')));
        const truncated = sorted.length > L.impacts;
        const items = sorted.slice(0, L.impacts);
        if (truncated) miss('IMPACT_LIMIT_EXCEEDED', sorted.length - L.impacts);
        const unresolvedRows: Unresolved[] = [...unresolved.entries()].sort().map(([code, count]) => ({ code, count }));
        const summary = Object.entries(items.reduce((acc, row) => {
            const key = row.dependencyKind + '|' + row.proposedAction + '|' + row.evidenceState;
            acc[key] = (acc[key] ?? 0) + 1; return acc;
        }, {} as Record<string, number>)).map(([key, count]) => {
            const [dependencyKind = 'UNKNOWN', proposedAction = 'UNKNOWN', evidenceState = 'UNKNOWN'] = key.split('|');
            return { dependencyKind, proposedAction, evidenceState, count };
        }).sort((a, b) => a.dependencyKind.localeCompare(b.dependencyKind));
        const result = {
            target: { kind: targetKind, id: targetId, sourceId: target.source.id, revision: target.revision, protectionEpoch: target.protectionEpoch },
            complete: unresolvedRows.length === 0 && !truncated,
            impactCount: items.length,
            reviewRequiredCount: items.filter(x => x.evidenceState === 'REVIEW_REQUIRED').length,
            unresolvedCount: unresolvedRows.reduce((sum, x) => sum + x.count, 0),
            summary, items, unresolved: unresolvedRows
        };
        return { ...result, previewDigest: digest(result) };
    }

    async preview(tx: Tx, actor: Actor, input: unknown) {
        requirePermission(actor, 'data.delete');
        const d = S.preview.parse(input);
        const target = await this.target(tx, actor, d.targetKind, d.targetId);
        invariant(target.revision === d.expectedRevision, 'REVISION_CONFLICT', '目标已经变化，请刷新后重新预览', 409);
        return this.scan(tx, actor, d.targetKind, d.targetId);
    }

    async create(tx: Tx, actor: Actor, input: unknown): Promise<DeletionRequest> {
        requirePermission(actor, 'data.delete');
        const d = S.create.parse(input);
        invariant(!(await deletionBlocked(tx, actor.workspaceId, d.targetKind, d.targetId)), 'DELETION_ALREADY_BLOCKED', '该目标已经处于删除阻断状态', 409);
        const preview = await this.preview(tx, actor, { targetKind: d.targetKind, targetId: d.targetId, expectedRevision: d.expectedRevision });
        invariant(preview.previewDigest === d.previewDigest, 'DELETION_PREVIEW_STALE', '影响清单已经变化，请重新预览', 409);
        invariant(preview.complete, 'DELETION_IMPACT_UNRESOLVED', '仍有无法证明的依赖，不能创建删除申请', 409);
        const row: DeletionRequest = { ...base(actor.workspaceId, this.clock), actorId: actor.membershipId,
            targetKind: d.targetKind, targetId: d.targetId, targetSourceId: preview.target.sourceId,
            targetRevision: preview.target.revision, targetProtectionEpoch: preview.target.protectionEpoch, state: 'DRAFT',
            reason: d.reason, previewDigest: d.previewDigest, impactCount: preview.impactCount,
            reviewRequiredCount: preview.reviewRequiredCount, unresolvedCount: preview.unresolvedCount, ...targetRefs(d.targetKind, d.targetId),
            planDigest: null, planFrozenAt: null, planFrozenById: null,
            executionPlanDigest: null, cleanupStartedAt: null, cleanupStartedById: null,
            cleanupLeaseToken: null, cleanupLeaseUntil: null, dependencyCleanupCompletedAt: null, cleanupErrorCode: null,
            rootFinalizedAt: null, rootFinalizationEvidenceDigest: null };
        await tx.insert('deletionRequests', row);
        for (const impact of preview.items) {
            const item: DeletionItem = { ...base(actor.workspaceId, this.clock), requestId: row.id, ...impact,
                decision: impact.evidenceState === 'PROVEN' ? 'APPLY_PROPOSED' : 'PENDING',
                decisionReason: impact.evidenceState === 'PROVEN' ? 'AUTO_PROVEN' : '',
                retentionSourceId: null, retentionSourceRevision: null, retentionSourceProtectionEpoch: null,
                decidedById: null, decidedAt: null, resolvedAction: null, cleanupState: 'NOT_STARTED',
                cleanupAttempts: 0, cleanupEvidenceDigest: null, cleanupErrorCode: null, cleanedAt: null };
            await tx.insert('deletionItems', item);
        }
        return row;
    }

    async block(tx: Tx, actor: Actor, id: string, input: unknown): Promise<DeletionRequest> {
        requirePermission(actor, 'data.delete');
        const d = S.block.parse(input);
        const row = await workspaceRow(tx, 'deletionRequests', id, actor.workspaceId);
        if (!row) missing();
        cas(row, d.expectedRevision);
        invariant(row.state === 'DRAFT', 'DELETION_STATE_CONFLICT', '删除申请已不在草稿状态', 409);
        invariant(d.acknowledgeBlock === true, 'DELETION_BLOCK_ACK_REQUIRED', '请确认本操作只阻断使用，尚不会真正删除数据', 400);
        invariant(d.previewDigest === row.previewDigest, 'DELETION_PREVIEW_STALE', '提交的影响摘要与申请不一致，请刷新', 409);
        invariant(!(await deletionBlocked(tx, actor.workspaceId, row.targetKind, row.targetId)), 'DELETION_ALREADY_BLOCKED', '该目标已经被其他删除申请阻断', 409);
        const preview = await this.scan(tx, actor, row.targetKind, row.targetId);
        invariant(preview.complete && preview.previewDigest === row.previewDigest
            && preview.target.revision === row.targetRevision && preview.target.protectionEpoch === row.targetProtectionEpoch,
            'DELETION_PREVIEW_STALE', '目标或依赖已经变化，请重新预览并建立申请', 409);

        if (row.targetKind === 'SOURCE') {
            const source = await workspaceRow(tx, 'sources', row.targetId, actor.workspaceId);
            if (!source) missing();
            await requireScope(tx, actor, source.scopeId);
            const next = { ...touch(source, this.clock), protectionEpoch: source.protectionEpoch + 1 };
            await tx.replace('sources', next);
            await appendSourceHistory(tx, actor, next, 'DELETION_BLOCKED', this.clock, row.reason);
        }
        else if (row.targetKind === 'PERSON') {
            const person = await workspaceRow(tx, 'people', row.targetId, actor.workspaceId);
            if (!person) missing();
            await requireScope(tx, actor, person.scopeId);
            await tx.replace('people', { ...touch(person, this.clock), protectionEpoch: person.protectionEpoch + 1 });
        }
        const next: DeletionRequest = { ...touch(row, this.clock), state: 'BLOCKED_FOR_USE' };
        await tx.replace('deletionRequests', next);
        return next;
    }

    async reviewItems(tx: Tx, actor: Actor, id: string, query: Record<string, string>) {
        const row = await this.requestFor(tx, actor, id);
        const items = (await tx.find('deletionItems', { workspaceId: actor.workspaceId, requestId: row.id }))
            .sort((a, b) => (a.evidenceState === b.evidenceState ? a.id.localeCompare(b.id) : a.evidenceState.localeCompare(b.evidenceState)));
        const safe = items.map(item => ({
            id: item.id,
            dependencyKind: item.dependencyKind,
            proposedAction: item.proposedAction,
            evidenceState: item.evidenceState,
            detailCode: item.detailCode,
            decision: item.decision,
            decisionReason: item.decisionReason === 'AUTO_PROVEN' ? '' : item.decisionReason,
            retentionBasisPresent: item.retentionSourceId !== null,
            decidedAt: item.decidedAt
        }));
        return page(safe, query);
    }

    async decide(tx: Tx, actor: Actor, id: string, input: unknown): Promise<DeletionRequest> {
        requirePermission(actor, 'data.delete');
        const d = S.decision.parse(input);
        const row = await this.requestFor(tx, actor, id);
        cas(row, d.expectedRevision);
        invariant(row.state === 'BLOCKED_FOR_USE', 'DELETION_STATE_CONFLICT', '只有已阻断使用的申请可以做保留决定', 409);
        invariant(row.planDigest === null, 'DELETION_PLAN_FROZEN', '清理计划已经冻结，不能再修改保留决定', 409);
        const item = await workspaceRow(tx, 'deletionItems', d.entryId, actor.workspaceId);
        if (!item || item.requestId !== row.id) missing();
        invariant(item.evidenceState === 'REVIEW_REQUIRED', 'DELETION_DECISION_NOT_REQUIRED', '该影响项已有可证明的自动处置，不需要人工覆盖', 409);

        let retentionSourceId: string | null = null, retentionSourceRevision: number | null = null, retentionSourceProtectionEpoch: number | null = null;
        if (d.decision === 'RETAIN_WITH_BASIS') {
            requirePermission(actor, 'sources.review');
            invariant(!!d.retentionSourceId && d.retentionSourceId !== row.targetSourceId, 'RETENTION_BASIS_REQUIRED', '保留必须选择另一份独立且当前有效的来源依据', 422);
            const basis = await sourceFor(tx, actor, d.retentionSourceId, this.clock);
            invariant(basis.basisMode === 'INTERNAL_USE', 'RETENTION_BASIS_INVALID', '保留依据必须是当前有效的正式内部依据', 422);
            retentionSourceId = basis.id;
            retentionSourceRevision = basis.revision;
            retentionSourceProtectionEpoch = basis.protectionEpoch;
        }
        else
            invariant(d.retentionSourceId === undefined || d.retentionSourceId === null, 'RETENTION_BASIS_UNUSED', '按建议处置时不要附加保留来源', 400);

        await tx.replace('deletionItems', { ...touch(item, this.clock), decision: d.decision, decisionReason: d.decisionReason,
            retentionSourceId, retentionSourceRevision, retentionSourceProtectionEpoch, decidedById: actor.membershipId,
            decidedAt: this.clock.now().toISOString() });
        const next = touch(row, this.clock);
        await tx.replace('deletionRequests', next);
        return next;
    }

    async freezePlan(tx: Tx, actor: Actor, id: string, input: unknown): Promise<DeletionRequest> {
        requirePermission(actor, 'data.delete');
        const d = S.freezePlan.parse(input);
        const row = await this.requestFor(tx, actor, id);
        cas(row, d.expectedRevision);
        invariant(row.state === 'BLOCKED_FOR_USE', 'DELETION_STATE_CONFLICT', '只有已阻断使用的申请可以冻结清理计划', 409);
        invariant(row.planDigest === null, 'DELETION_PLAN_FROZEN', '清理计划已经冻结', 409);
        invariant(d.acknowledgePlan === true, 'DELETION_PLAN_ACK_REQUIRED', '请确认本操作只冻结计划，尚不会执行不可逆清理', 400);
        const items = await tx.find('deletionItems', { workspaceId: actor.workspaceId, requestId: row.id });
        invariant(items.length === row.impactCount, 'DELETION_PLAN_INCOMPLETE', '冻结的影响项数量不完整，请停止执行并核对数据', 409);
        invariant(items.every(item => item.decision !== 'PENDING'), 'DELETION_DECISIONS_PENDING', '仍有需要人工判断的影响项', 409);

        for (const item of items) {
            if (item.decision !== 'RETAIN_WITH_BASIS') continue;
            invariant(!!item.retentionSourceId && !!item.retentionSourceRevision && !!item.retentionSourceProtectionEpoch,
                'RETENTION_BASIS_MISSING', '保留依据快照不完整', 409);
            const basis = await sourceFor(tx, actor, item.retentionSourceId, this.clock);
            invariant(basis.basisMode === 'INTERNAL_USE' && basis.revision === item.retentionSourceRevision
                && basis.protectionEpoch === item.retentionSourceProtectionEpoch,
                'RETENTION_BASIS_CHANGED', '保留依据已经变化，请重新作出保留决定', 409);
        }
        const planDigest = digest(frozenDeletionPlan(row, items));
        const next: DeletionRequest = { ...touch(row, this.clock), planDigest,
            planFrozenAt: this.clock.now().toISOString(), planFrozenById: actor.membershipId };
        await tx.replace('deletionRequests', next);
        return next;
    }

    private async requestFor(tx: Tx, actor: Actor, id: string) {
        requirePermission(actor, 'data.delete');
        const row = await workspaceRow(tx, 'deletionRequests', id, actor.workspaceId);
        if (!row) missing();
        await this.target(tx, actor, row.targetKind, row.targetId);
        return row;
    }

    async get(tx: Tx, actor: Actor, id: string) {
        const row = await this.requestFor(tx, actor, id);
        const pendingDecisionCount = row.state === 'BLOCKED_FOR_USE'
            ? (await tx.find('deletionItems', { workspaceId: actor.workspaceId, requestId: row.id, decision: 'PENDING' })).length : 0;
        const cleanupItems = row.state === 'CLEANING' ? await tx.find('deletionItems', { workspaceId: actor.workspaceId, requestId: row.id }) : [];
        const cleanupDoneCount = cleanupItems.filter(item => item.cleanupState === 'DONE').length;
        const cleanupWaitingCount = cleanupItems.filter(item => item.cleanupState === 'WAITING_EXTERNAL').length;
        const cleanupFailedCount = cleanupItems.filter(item => item.cleanupState === 'FAILED').length;
        return { id: row.id, targetKind: row.targetKind, targetId: row.targetId, targetRevision: row.targetRevision,
            state: row.state, reason: row.reason, previewDigest: row.previewDigest, impactCount: row.impactCount,
            reviewRequiredCount: row.reviewRequiredCount, unresolvedCount: row.unresolvedCount, pendingDecisionCount,
            createdAt: row.createdAt, revision: row.revision,
            blockAvailable: row.state === 'DRAFT', planFrozen: row.planDigest !== null, planDigest: row.planDigest,
            planFrozenAt: row.planFrozenAt, cleanupStartAvailable: row.state === 'BLOCKED_FOR_USE' && row.planDigest !== null,
            cleanupDoneCount, cleanupWaitingCount, cleanupFailedCount,
            dependencyCleanupCompletedAt: row.dependencyCleanupCompletedAt, cleanupErrorCode: row.cleanupErrorCode,
            rootFinalizedAt: row.rootFinalizedAt, rootFinalizationEvidenceDigest: row.rootFinalizationEvidenceDigest,
            cleanupAvailable: false, executionAvailable: false,
            executionNote: row.state === 'DRAFT' ? '可进入阻断使用；尚不会真正删除数据。'
                : row.state === 'CLEANING' ? (row.dependencyCleanupCompletedAt ? '依赖清理已完成；等待根对象终结。' : '依赖清理正在执行；专用媒体/历史清理不会被假报完成。')
                : row.state === 'COMPLETED' ? '依赖清理和根对象最小头终结已完成。'
                : row.state === 'RETAINED_WITH_BASIS' ? '根对象已终结；部分依赖依据独立有效来源保留。'
                : row.planDigest ? '目标已阻断，保留决定和清理计划已冻结；可显式启动不可逆依赖清理。'
                : '目标已阻断正常使用；请先完成保留决定并冻结清理计划。' };
    }

    async list(tx: Tx, actor: Actor, query: Record<string, string>) {
        requirePermission(actor, 'data.delete');
        const rows = [];
        for (const row of await tx.find('deletionRequests', { workspaceId: actor.workspaceId })) {
            try { await this.target(tx, actor, row.targetKind, row.targetId); }
            catch (error) { if (error instanceof AppError && error.status === 404) continue; throw error; }
            rows.push({ id: row.id, targetKind: row.targetKind, targetId: row.targetId, state: row.state, impactCount: row.impactCount,
                reviewRequiredCount: row.reviewRequiredCount, planFrozen: row.planDigest !== null, createdAt: row.createdAt, revision: row.revision });
        }
        rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
        return page(rows, query);
    }
}
