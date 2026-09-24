import type { Actor, Clock, Permission, RequestMeta, Source } from './model.ts';
import type { Tx } from './store.ts';
import { audit, workspaceRow } from './helpers.ts';
import { invariant, missing } from './errors.ts';
import { requirePermission } from './policy.ts';

export type MaintenanceTargetKind = 'person' | 'source' | 'asset' | 'work' | 'project';

interface Candidate {
    relation: string;
    relationId: string;
    resourceKind: string;
    resourceId: string;
    label: string;
    scopeIds: string[];
    permission?: Permission;
}
interface VisibleDependency {
    relation: string;
    relationId: string;
    resource: { kind: string; id: string; label: string };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class Maintenance {
    clock: Clock;
    constructor(clock: Clock) { this.clock = clock; }

    private async scopeIndex(tx: Tx, actor: Actor) {
        const scopes = await tx.find('scopes', { workspaceId: actor.workspaceId });
        const members = await tx.find('scopeMembers', { workspaceId: actor.workspaceId, membershipId: actor.membershipId });
        const granted = new Set(members.map(m => m.scopeId));
        const visible = new Set(scopes.filter(s => s.mode === 'WORKSPACE' || granted.has(s.id)).map(s => s.id));
        return { visible, scopes: new Map(scopes.map(s => [s.id, s])) };
    }

    private async sourceScope(tx: Tx, actor: Actor, sourceId: string): Promise<string | null> {
        const source = await workspaceRow(tx, 'sources', sourceId, actor.workspaceId);
        return source?.scopeId ?? null;
    }

    private async target(tx: Tx, actor: Actor, kind: MaintenanceTargetKind, id: string, visibleScopes: Set<string>) {
        const scoped = async (scopeIds: Array<string | null | undefined>) => {
            if (scopeIds.some(scopeId => !scopeId || !visibleScopes.has(scopeId)))
                missing();
        };
        if (kind === 'source') {
            requirePermission(actor, 'sources.review');
            const row = await workspaceRow(tx, 'sources', id, actor.workspaceId);
            if (!row) missing();
            await scoped([row.scopeId]);
            return { kind, id, revision: row.revision, label: row.title, state: row.status };
        }
        if (kind === 'person') {
            const row = await workspaceRow(tx, 'people', id, actor.workspaceId);
            if (!row) missing();
            await scoped([row.scopeId, await this.sourceScope(tx, actor, row.sourceId)]);
            return { kind, id, revision: row.revision, label: row.displayName, state: row.status };
        }
        if (kind === 'asset') {
            requirePermission(actor, 'assets.upload');
            const row = await workspaceRow(tx, 'assets', id, actor.workspaceId);
            if (!row) missing();
            const person = row.personId ? await workspaceRow(tx, 'people', row.personId, actor.workspaceId) : null;
            await scoped([row.scopeId, await this.sourceScope(tx, actor, row.sourceId), person?.scopeId]);
            return { kind, id, revision: row.revision, label: row.fileName, state: row.state };
        }
        if (kind === 'work') {
            const row = await workspaceRow(tx, 'works', id, actor.workspaceId);
            if (!row) missing();
            await scoped([row.scopeId, await this.sourceScope(tx, actor, row.sourceId)]);
            return { kind, id, revision: row.revision, label: row.title, state: row.status };
        }
        const row = await workspaceRow(tx, 'projects', id, actor.workspaceId);
        if (!row) missing();
        await scoped([row.scopeId, await this.sourceScope(tx, actor, row.sourceId)]);
        return { kind, id, revision: row.revision, label: row.title, state: row.status };
    }

    private async workCandidate(tx: Tx, actor: Actor, relation: string, relationId: string, workId: string): Promise<Candidate | null> {
        const work = await workspaceRow(tx, 'works', workId, actor.workspaceId);
        if (!work) return null;
        return { relation, relationId, resourceKind: 'work', resourceId: work.id, label: work.title,
            scopeIds: [work.scopeId, (await this.sourceScope(tx, actor, work.sourceId)) ?? ''] };
    }
    private async projectCandidate(tx: Tx, actor: Actor, relation: string, relationId: string, projectId: string): Promise<Candidate | null> {
        const project = await workspaceRow(tx, 'projects', projectId, actor.workspaceId);
        if (!project) return null;
        return { relation, relationId, resourceKind: 'project', resourceId: project.id, label: project.title,
            scopeIds: [project.scopeId, (await this.sourceScope(tx, actor, project.sourceId)) ?? ''] };
    }
    private async shortlistCandidate(tx: Tx, actor: Actor, relation: string, relationId: string, shortlistId: string): Promise<Candidate | null> {
        const shortlist = await workspaceRow(tx, 'shortlists', shortlistId, actor.workspaceId);
        if (!shortlist) return null;
        return { relation, relationId, resourceKind: 'shortlist', resourceId: shortlist.id, label: shortlist.title, scopeIds: [shortlist.scopeId] };
    }
    private async personCandidate(tx: Tx, actor: Actor, relation: string, relationId: string, personId: string): Promise<Candidate | null> {
        const person = await workspaceRow(tx, 'people', personId, actor.workspaceId);
        if (!person) return null;
        return { relation, relationId, resourceKind: 'person', resourceId: person.id, label: person.displayName,
            scopeIds: [person.scopeId, (await this.sourceScope(tx, actor, person.sourceId)) ?? ''] };
    }
    private async assetCandidate(tx: Tx, actor: Actor, relation: string, relationId: string, assetId: string): Promise<Candidate | null> {
        const asset = await workspaceRow(tx, 'assets', assetId, actor.workspaceId);
        if (!asset) return null;
        const person = asset.personId ? await workspaceRow(tx, 'people', asset.personId, actor.workspaceId) : null;
        return { relation, relationId, resourceKind: 'asset', resourceId: asset.id, label: asset.fileName,
            scopeIds: [asset.scopeId, (await this.sourceScope(tx, actor, asset.sourceId)) ?? '', ...(person ? [person.scopeId] : [])],
            permission: 'assets.read' };
    }

    private async collect(tx: Tx, actor: Actor, kind: MaintenanceTargetKind, id: string): Promise<Candidate[]> {
        const out: Candidate[] = [];
        const add = (row: Candidate | null) => { if (row) out.push(row); };
        if (kind === 'person') {
            const person = (await workspaceRow(tx, 'people', id, actor.workspaceId))!;
            const personSourceScope = (await this.sourceScope(tx, actor, person.sourceId)) ?? '';
            for (const row of await tx.find('contacts', { workspaceId: actor.workspaceId, personId: id }))
                add({ relation: 'contact', relationId: row.id, resourceKind: 'contact', resourceId: row.id, label: '联系方式记录',
                    scopeIds: [person.scopeId, (await this.sourceScope(tx, actor, row.sourceId)) ?? ''], permission: 'sensitive.read' });
            for (const row of await tx.find('evidence', { workspaceId: actor.workspaceId, personId: id }))
                add({ relation: 'fieldEvidence', relationId: row.id, resourceKind: 'evidence', resourceId: row.id, label: '字段核验记录',
                    scopeIds: [person.scopeId, (await this.sourceScope(tx, actor, row.sourceId)) ?? ''], permission: 'sources.review' });
            for (const row of await tx.find('handoffs', { workspaceId: actor.workspaceId, personId: id }))
                add({ relation: 'handoff', relationId: row.id, resourceKind: 'handoff', resourceId: row.id, label: '资料交接记录',
                    scopeIds: [row.personScopeId, row.sourceScopeId] });
            for (const row of await tx.find('uploads', { workspaceId: actor.workspaceId, personId: id }))
                add({ relation: 'upload', relationId: row.id, resourceKind: 'upload', resourceId: row.id, label: row.fileName,
                    scopeIds: [row.scopeId, personSourceScope], permission: 'assets.upload' });
            for (const row of await tx.find('assets', { workspaceId: actor.workspaceId, personId: id }))
                add(await this.assetCandidate(tx, actor, 'asset', row.id, row.id));
            for (const row of await tx.find('workCredits', { workspaceId: actor.workspaceId, personId: id }))
                add(await this.workCandidate(tx, actor, 'workCredit', row.id, row.workId));
            for (const row of await tx.find('projectParticipants', { workspaceId: actor.workspaceId, personId: id }))
                add(await this.projectCandidate(tx, actor, 'projectParticipant', row.id, row.projectId));
            for (const row of await tx.find('shortlistItems', { workspaceId: actor.workspaceId, personId: id }))
                add(await this.shortlistCandidate(tx, actor, 'shortlistItem', row.id, row.shortlistId));
            for (const batch of await tx.find('imports', { workspaceId: actor.workspaceId }))
                if (batch.rows.some(row => row.personId === id))
                    add({ relation: 'importResult', relationId: batch.id, resourceKind: 'import', resourceId: batch.id,
                        label: '历史导入批次', scopeIds: [batch.scopeId, (await this.sourceScope(tx, actor, batch.sourceId)) ?? ''] });
        }
        if (kind === 'source') {
            for (const row of await tx.find('people', { workspaceId: actor.workspaceId, sourceId: id }))
                add(await this.personCandidate(tx, actor, 'person', row.id, row.id));
            for (const row of await tx.find('contacts', { workspaceId: actor.workspaceId, sourceId: id })) {
                const person = await workspaceRow(tx, 'people', row.personId, actor.workspaceId);
                if (person) add({ relation: 'contact', relationId: row.id, resourceKind: 'contact', resourceId: row.id, label: '联系方式记录',
                    scopeIds: [person.scopeId, (await this.sourceScope(tx, actor, id)) ?? ''], permission: 'sensitive.read' });
            }
            for (const row of await tx.find('evidence', { workspaceId: actor.workspaceId, sourceId: id })) {
                const person = await workspaceRow(tx, 'people', row.personId, actor.workspaceId);
                if (person) add({ relation: 'fieldEvidence', relationId: row.id, resourceKind: 'evidence', resourceId: row.id, label: '字段核验记录',
                    scopeIds: [person.scopeId, (await this.sourceScope(tx, actor, id)) ?? ''], permission: 'sources.review' });
            }
            for (const row of await tx.find('handoffs', { workspaceId: actor.workspaceId, sourceId: id }))
                add({ relation: 'handoff', relationId: row.id, resourceKind: 'handoff', resourceId: row.id, label: '资料交接记录',
                    scopeIds: [row.personScopeId, row.sourceScopeId] });
            for (const row of await tx.find('uploads', { workspaceId: actor.workspaceId, sourceId: id }))
                add({ relation: 'upload', relationId: row.id, resourceKind: 'upload', resourceId: row.id, label: row.fileName,
                    scopeIds: [row.scopeId], permission: 'assets.upload' });
            for (const row of await tx.find('assets', { workspaceId: actor.workspaceId, sourceId: id }))
                add(await this.assetCandidate(tx, actor, 'asset', row.id, row.id));
            for (const row of await tx.find('imports', { workspaceId: actor.workspaceId, sourceId: id }))
                add({ relation: 'import', relationId: row.id, resourceKind: 'import', resourceId: row.id, label: '历史导入批次', scopeIds: [row.scopeId] });
            for (const row of await tx.find('works', { workspaceId: actor.workspaceId, sourceId: id }))
                add(await this.workCandidate(tx, actor, 'work', row.id, row.id));
            for (const row of await tx.find('projects', { workspaceId: actor.workspaceId, sourceId: id }))
                add(await this.projectCandidate(tx, actor, 'project', row.id, row.id));
        }
        if (kind === 'asset') {
            for (const row of await tx.find('workAssets', { workspaceId: actor.workspaceId, assetId: id }))
                add(await this.workCandidate(tx, actor, 'workAsset', row.id, row.workId));
            for (const row of await tx.find('shortlistItemAssets', { workspaceId: actor.workspaceId, assetId: id })) {
                const item = await workspaceRow(tx, 'shortlistItems', row.itemId, actor.workspaceId);
                if (item) add(await this.shortlistCandidate(tx, actor, 'shortlistItemAsset', row.id, item.shortlistId));
            }
        }
        if (kind === 'work') {
            for (const row of await tx.find('workAssets', { workspaceId: actor.workspaceId, workId: id }))
                add(await this.assetCandidate(tx, actor, 'workAsset', row.id, row.assetId));
            for (const row of await tx.find('workCredits', { workspaceId: actor.workspaceId, workId: id }))
                add(await this.personCandidate(tx, actor, 'workCredit', row.id, row.personId));
            for (const row of await tx.find('projectWorks', { workspaceId: actor.workspaceId, workId: id }))
                add(await this.projectCandidate(tx, actor, 'projectWork', row.id, row.projectId));
            for (const row of await tx.find('shortlistItems', { workspaceId: actor.workspaceId, workId: id }))
                add(await this.shortlistCandidate(tx, actor, 'shortlistItem', row.id, row.shortlistId));
        }
        if (kind === 'project') {
            for (const row of await tx.find('projectParticipants', { workspaceId: actor.workspaceId, projectId: id }))
                add(await this.personCandidate(tx, actor, 'projectParticipant', row.id, row.personId));
            for (const row of await tx.find('projectWorks', { workspaceId: actor.workspaceId, projectId: id }))
                add(await this.workCandidate(tx, actor, 'projectWork', row.id, row.workId));
        }
        return out;
    }

    async impact(tx: Tx, actor: Actor, query: Record<string, string>, meta: RequestMeta) {
        requirePermission(actor, 'records.write');
        for (const key of Object.keys(query))
            invariant(['kind', 'id'].includes(key), 'QUERY_INVALID', '包含不支持的检查参数', 400);
        const kind = query.kind as MaintenanceTargetKind;
        invariant(['person', 'source', 'asset', 'work', 'project'].includes(kind) && UUID.test(query.id ?? ''), 'QUERY_INVALID', '请选择有效的对象类型和编号', 400);
        const { visible } = await this.scopeIndex(tx, actor);
        const target = await this.target(tx, actor, kind, query.id!, visible);
        const dependencies = await this.collect(tx, actor, kind, target.id);
        const visibleDependencies: VisibleDependency[] = [];
        let hasHiddenDependencies = false;
        for (const row of dependencies) {
            const allowed = (!row.permission || actor.permissions.includes(row.permission)) && row.scopeIds.every(scopeId => !!scopeId && visible.has(scopeId));
            if (!allowed) {
                hasHiddenDependencies = true;
                continue;
            }
            visibleDependencies.push({ relation: row.relation, relationId: row.relationId,
                resource: { kind: row.resourceKind, id: row.resourceId, label: row.label } });
        }
        visibleDependencies.sort((a, b) => a.relation.localeCompare(b.relation) || a.resource.label.localeCompare(b.resource.label) || a.relationId.localeCompare(b.relationId));
        const limit = 100;
        await audit(tx, actor, actor.workspaceId, 'maintenance.impact-read', kind, target.id, [], meta, this.clock);
        return { target, visibleDependencies: visibleDependencies.slice(0, limit), visibleDependencyCount: visibleDependencies.length,
            hasHiddenDependencies, truncated: visibleDependencies.length > limit, impactComplete: !hasHiddenDependencies,
            deletionImplemented: false, retainedSystemHistory: true,
            note: hasHiddenDependencies ? '存在当前权限无法完整检查的依赖，因此不能安全规划删除；未返回其类型、数量或身份。'
                : '这里只预览当前依赖；实际删除尚未启用。审计与最小系统历史不会作为普通关系删除。' };
    }
}
