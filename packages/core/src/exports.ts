import { randomUUID } from 'node:crypto';
import type { Actor, Clock, Config, Person, RequestMeta, Source } from './model.ts';
import type { Store, Tx } from './store.ts';
import type { ExportDependency, ExportFieldCode, ExportJob, ExportSubjectKind, UsePermission } from './export-model.ts';
import { EXPORT_LIMITS as L } from './export-model.ts';
import { ExportSchemas as S } from './export-validation.ts';
import { AppError, invariant, missing } from './errors.ts';
import { audit, base, cas, page, touch, unique, workspaceRow } from './helpers.ts';
import { digest } from './json.ts';
import { personFor, permissionsFor, requirePermission, sourceFor, sourceCurrent } from './policy.ts';
import { workFor, projectFor, readyAsset } from './production-policy.ts';

const FIELD_PREFIX: Record<ExportSubjectKind, string> = {
    PERSON: 'person.', WORK: 'work.', PROJECT: 'project.', SOURCE: 'source.', ASSET: 'media.'
};
function fieldsFor(kind: ExportSubjectKind, fields: ExportFieldCode[]) {
    return fields.filter(field => field.startsWith(FIELD_PREFIX[kind]));
}
function typedSubject(kind: ExportSubjectKind, id: string) {
    return {
        subjectPersonId: kind === 'PERSON' ? id : null,
        subjectWorkId: kind === 'WORK' ? id : null,
        subjectProjectId: kind === 'PROJECT' ? id : null,
        subjectAssetId: kind === 'ASSET' ? id : null,
        subjectSourceId: kind === 'SOURCE' ? id : null
    };
}
function typedDependency(kind: ExportSubjectKind, id: string) {
    return {
        personId: kind === 'PERSON' ? id : null,
        workId: kind === 'WORK' ? id : null,
        projectId: kind === 'PROJECT' ? id : null,
        assetId: kind === 'ASSET' ? id : null,
        sourceSubjectId: kind === 'SOURCE' ? id : null
    };
}
function minIso(...values: string[]) { return new Date(Math.min(...values.map(Date.parse))).toISOString(); }
function safeError(error: unknown) {
    if (error instanceof AppError && error.status < 500)
        throw new AppError(409, 'EXPORT_STALE', '导出依赖已失效，请重新生成');
    throw error;
}
function dataFields<T extends Record<string, unknown>>(prefix: string, fields: ExportFieldCode[], row: T) {
    return Object.fromEntries(fields.map(field => [field.slice(prefix.length), row[field.slice(prefix.length)] ]));
}

export class Exports {
    store: Store;
    clock: Clock;
    config: Config;
    constructor(store: Store, clock: Clock, config: Config) { this.store = store; this.clock = clock; this.config = config; }

    private egress() {
        invariant(this.config.dataEgressMode === 'INTERNAL_APPROVED', 'EGRESS_DISABLED', '当前环境未批准内部导出', 503);
    }
    private async subject(tx: Tx, actor: Actor, kind: ExportSubjectKind, id: string) {
        if (kind === 'SOURCE') {
            const row = await sourceFor(tx, actor, id, this.clock);
            return { source: row, revision: row.revision, protectionEpoch: row.protectionEpoch };
        }
        if (kind === 'PERSON') {
            const row = await personFor(tx, actor, id, this.clock);
            return { source: await sourceFor(tx, actor, row.sourceId, this.clock), revision: row.revision, protectionEpoch: row.protectionEpoch };
        }
        if (kind === 'WORK') {
            const row = await workFor(tx, actor, id, this.clock);
            return { source: await sourceFor(tx, actor, row.sourceId, this.clock), revision: row.revision, protectionEpoch: null };
        }
        if (kind === 'PROJECT') {
            const row = await projectFor(tx, actor, id, this.clock);
            return { source: await sourceFor(tx, actor, row.sourceId, this.clock), revision: row.revision, protectionEpoch: null };
        }
        const row = await readyAsset(tx, actor, id, this.clock);
        return { source: await sourceFor(tx, actor, row.sourceId, this.clock), revision: row.revision, protectionEpoch: null };
    }

    async createPermission(tx: Tx, actor: Actor, input: unknown): Promise<UsePermission> {
        requirePermission(actor, 'sources.review');
        const d = S.permissionCreate.parse(input);
        invariant(unique(d.fields).length === d.fields.length, 'DUPLICATE_FIELD', '导出字段不能重复', 400);
        const allowed = fieldsFor(d.subjectKind, d.fields);
        invariant(allowed.length === d.fields.length, 'EXPORT_FIELD_SUBJECT_MISMATCH', '导出许可字段与对象类型不匹配', 422);
        const subject = await this.subject(tx, actor, d.subjectKind, d.subjectId);
        invariant(subject.source.id === d.sourceId, 'EXPORT_SOURCE_MISMATCH', '导出许可的来源与对象不一致', 422);
        invariant(subject.source.basisMode === 'INTERNAL_USE', 'EXPORT_USE_NOT_ALLOWED', '临时整理依据不能用于内部导出', 422);
        const now = this.clock.now().toISOString();
        invariant(Date.parse(d.validUntil) > Date.parse(now) && Date.parse(d.validUntil) <= Date.parse(subject.source.validUntil),
            'EXPORT_PERMISSION_EXPIRY_INVALID', '导出许可期限必须在当前来源依据期限内', 422);
        const row: UsePermission = { ...base(actor.workspaceId, this.clock), sourceId: d.sourceId, subjectKind: d.subjectKind, subjectId: d.subjectId,
            purpose: 'INTERNAL_EXPORT', fields: [...d.fields].sort(), validFrom: now, validUntil: d.validUntil, status: 'ACTIVE',
            evidenceNote: d.evidenceNote, reviewerId: actor.membershipId, ...typedSubject(d.subjectKind, d.subjectId) };
        await tx.insert('usePermissions', row);
        return row;
    }

    async revokePermission(tx: Tx, actor: Actor, id: string, input: unknown): Promise<UsePermission> {
        requirePermission(actor, 'sources.review');
        const d = S.permissionRevoke.parse(input);
        const row = await workspaceRow(tx, 'usePermissions', id, actor.workspaceId);
        if (!row) missing();
        await sourceFor(tx, actor, row.sourceId, this.clock, false);
        cas(row, d.expectedRevision);
        invariant(row.status === 'ACTIVE', 'PERMISSION_ALREADY_REVOKED', '该导出许可已经撤销', 409);
        const next: UsePermission = { ...touch(row, this.clock), status: 'REVOKED' };
        await tx.replace('usePermissions', next);
        return next;
    }

    async listPermissions(tx: Tx, actor: Actor, query: Record<string, string>) {
        requirePermission(actor, 'sources.read');
        page([], query, ['sourceId', 'subjectKind', 'status']);
        const rows = [];
        for (const row of await tx.find('usePermissions', { workspaceId: actor.workspaceId })) {
            if (query.sourceId && row.sourceId !== query.sourceId || query.subjectKind && row.subjectKind !== query.subjectKind || query.status && row.status !== query.status)
                continue;
            try { await sourceFor(tx, actor, row.sourceId, this.clock, false); }
            catch (error) { if (error instanceof AppError && error.status === 404) continue; throw error; }
            rows.push({ id: row.id, sourceId: row.sourceId, subjectKind: row.subjectKind, subjectId: row.subjectId, fields: row.fields,
                validFrom: row.validFrom, validUntil: row.validUntil, status: row.status, revision: row.revision,
                ...(actor.permissions.includes('sources.review') ? { evidenceNote: row.evidenceNote, reviewerId: row.reviewerId } : {}) });
        }
        rows.sort((a, b) => b.validUntil.localeCompare(a.validUntil) || a.id.localeCompare(b.id));
        return page(rows, query, ['sourceId', 'subjectKind', 'status']);
    }

    private async permissionFor(tx: Tx, actor: Actor, id: string): Promise<UsePermission> {
        const row = await workspaceRow(tx, 'usePermissions', id, actor.workspaceId);
        if (!row) missing();
        const source = await sourceFor(tx, actor, row.sourceId, this.clock);
        const now = this.clock.now().getTime();
        invariant(row.status === 'ACTIVE' && row.purpose === 'INTERNAL_EXPORT' && Date.parse(row.validFrom) <= now && now < Date.parse(row.validUntil),
            'EXPORT_PERMISSION_INACTIVE', '导出许可当前不可用', 409);
        invariant(source.basisMode === 'INTERNAL_USE', 'EXPORT_USE_NOT_ALLOWED', '当前来源依据不允许内部导出', 409);
        return row;
    }

    private choosePermission(permissions: UsePermission[], used: Set<string>, kind: ExportSubjectKind, id: string, sourceId: string, required: ExportFieldCode[]) {
        const row = permissions.find(p => p.subjectKind === kind && p.subjectId === id && p.sourceId === sourceId && required.every(field => p.fields.includes(field)));
        invariant(row, 'EXPORT_PERMISSION_REQUIRED', '所选记录或字段缺少精确的内部导出许可', 422);
        used.add(row.id);
        return row;
    }

    private dependency(workspaceId: string, exportId: string, kind: ExportSubjectKind, id: string, fields: ExportFieldCode[], source: Source,
        revision: number, protectionEpoch: number | null, permission: UsePermission, exportExpiry: string): ExportDependency {
        return { ...base(workspaceId, this.clock), exportId, kind, sourceId: source.id, sourceRevision: source.revision,
            sourceProtectionEpoch: source.protectionEpoch, resourceRevision: revision, resourceProtectionEpoch: protectionEpoch,
            fields: [...fields].sort(), usePermissionId: permission.id, usePermissionRevision: permission.revision,
            validUntil: minIso(exportExpiry, source.validUntil, permission.validUntil), ...typedDependency(kind, id) };
    }

    async create(tx: Tx, actor: Actor, input: unknown): Promise<ExportJob> {
        requirePermission(actor, 'data.export');
        this.egress();
        const d = S.create.parse(input);
        const peopleIds = unique(d.selectedIds.people), workIds = unique(d.selectedIds.works), projectIds = unique(d.selectedIds.projects);
        invariant(peopleIds.length === d.selectedIds.people.length && workIds.length === d.selectedIds.works.length && projectIds.length === d.selectedIds.projects.length,
            'DUPLICATE_LINK', '导出记录不能重复', 400);
        invariant(unique(d.fields).length === d.fields.length && unique(d.usePermissionRefs).length === d.usePermissionRefs.length, 'DUPLICATE_FIELD', '导出字段或许可不能重复', 400);
        invariant(peopleIds.length + workIds.length + projectIds.length > 0, 'EXPORT_EMPTY', '至少选择一条记录', 400);
        const personFields = fieldsFor('PERSON', d.fields), workFields = fieldsFor('WORK', d.fields), projectFields = fieldsFor('PROJECT', d.fields);
        const sourceFields = fieldsFor('SOURCE', d.fields), mediaFields = fieldsFor('ASSET', d.fields);
        invariant((peopleIds.length > 0) === (personFields.length > 0), 'EXPORT_FIELDS_REQUIRED', '人才选择与人才字段必须同时存在', 422);
        invariant((workIds.length > 0) === (workFields.length > 0), 'EXPORT_FIELDS_REQUIRED', '作品选择与作品字段必须同时存在', 422);
        invariant((projectIds.length > 0) === (projectFields.length > 0), 'EXPORT_FIELDS_REQUIRED', '项目选择与项目字段必须同时存在', 422);
        invariant(mediaFields.length === 0 || workIds.length > 0, 'EXPORT_MEDIA_REQUIRES_WORK', '媒体身份清单只能随已选作品导出', 422);

        const permissions: UsePermission[] = [];
        for (const id of d.usePermissionRefs) permissions.push(await this.permissionFor(tx, actor, id));
        const used = new Set<string>(), sources = new Map<string, Source>(), dependencies: ExportDependency[] = [];
        const people: Person[] = [], works = [], projects = [];
        for (const id of peopleIds) { const row = await personFor(tx, actor, id, this.clock); people.push(row); sources.set(row.sourceId, await sourceFor(tx, actor, row.sourceId, this.clock)); }
        for (const id of workIds) { const row = await workFor(tx, actor, id, this.clock); works.push(row); sources.set(row.sourceId, await sourceFor(tx, actor, row.sourceId, this.clock)); }
        for (const id of projectIds) { const row = await projectFor(tx, actor, id, this.clock); projects.push(row); sources.set(row.sourceId, await sourceFor(tx, actor, row.sourceId, this.clock)); }

        const now = this.clock.now().toISOString();
        const initialExpiry = new Date(this.clock.now().getTime() + L.ttlMs).toISOString();
        const job: ExportJob = { ...base(actor.workspaceId, this.clock), actorId: actor.membershipId, format: 'JSON', schemaVersion: 'once-export-v1',
            state: 'QUEUED', recordManifest: {}, fields: [...d.fields].sort(), usePermissionRefs: [], payload: null, payloadDigest: null,
            expiresAt: initialExpiry, errorCode: null, leaseToken: null, leaseUntil: null, attempts: 0 };

        const manifestPeople = people.map(row => {
            const source = sources.get(row.sourceId)!;
            const permission = this.choosePermission(permissions, used, 'PERSON', row.id, row.sourceId, personFields);
            dependencies.push(this.dependency(actor.workspaceId, job.id, 'PERSON', row.id, personFields, source, row.revision, row.protectionEpoch, permission, initialExpiry));
            return { id: row.id, sourceId: row.sourceId, revision: row.revision, data: dataFields('person.', personFields, row as unknown as Record<string, unknown>) };
        });
        const manifestWorks = works.map(row => {
            const source = sources.get(row.sourceId)!;
            const permission = this.choosePermission(permissions, used, 'WORK', row.id, row.sourceId, workFields);
            dependencies.push(this.dependency(actor.workspaceId, job.id, 'WORK', row.id, workFields, source, row.revision, null, permission, initialExpiry));
            return { id: row.id, sourceId: row.sourceId, revision: row.revision, data: dataFields('work.', workFields.filter(x => x !== 'work.relations'), row as unknown as Record<string, unknown>) };
        });
        const manifestProjects = projects.map(row => {
            const source = sources.get(row.sourceId)!;
            const permission = this.choosePermission(permissions, used, 'PROJECT', row.id, row.sourceId, projectFields);
            dependencies.push(this.dependency(actor.workspaceId, job.id, 'PROJECT', row.id, projectFields, source, row.revision, null, permission, initialExpiry));
            return { id: row.id, sourceId: row.sourceId, revision: row.revision, data: dataFields('project.', projectFields.filter(x => x !== 'project.relations'), row as unknown as Record<string, unknown>) };
        });

        const selectedPeople = new Set(peopleIds), selectedWorks = new Set(workIds), selectedProjects = new Set(projectIds);
        const relations: Record<string, unknown[]> = { workCredits: [], projectParticipants: [], projectWorks: [] };
        if (d.fields.includes('work.relations')) {
            for (const work of works) for (const rel of await tx.find('workCredits', { workspaceId: actor.workspaceId, workId: work.id }))
                if (selectedPeople.has(rel.personId)) relations.workCredits!.push({ workId: rel.workId, personId: rel.personId, roleCode: rel.roleCode });
        }
        if (d.fields.includes('project.relations')) {
            for (const project of projects) {
                for (const rel of await tx.find('projectParticipants', { workspaceId: actor.workspaceId, projectId: project.id }))
                    if (selectedPeople.has(rel.personId)) relations.projectParticipants!.push({ projectId: rel.projectId, personId: rel.personId, roleCode: rel.roleCode, state: rel.state });
                for (const rel of await tx.find('projectWorks', { workspaceId: actor.workspaceId, projectId: project.id }))
                    if (selectedWorks.has(rel.workId)) relations.projectWorks!.push({ projectId: rel.projectId, workId: rel.workId, relation: rel.relation });
            }
        }

        const media: unknown[] = [], mediaDependencies = new Set<string>();
        if (mediaFields.length) {
            for (const work of works) {
                const entries = (await tx.find('workAssets', { workspaceId: actor.workspaceId, workId: work.id })).sort((a, b) => a.position - b.position);
                for (const entry of entries) {
                    const asset = await readyAsset(tx, actor, entry.assetId, this.clock);
                    const source = await sourceFor(tx, actor, asset.sourceId, this.clock);
                    sources.set(source.id, source);
                    const permission = this.choosePermission(permissions, used, 'ASSET', asset.id, asset.sourceId, mediaFields);
                    if (!mediaDependencies.has(asset.id)) {
                        dependencies.push(this.dependency(actor.workspaceId, job.id, 'ASSET', asset.id, mediaFields, source, asset.revision, null, permission, initialExpiry));
                        mediaDependencies.add(asset.id);
                    }
                    media.push({ id: asset.id, workId: work.id, position: entry.position, isCover: entry.id === work.coverEntryId, sourceId: asset.sourceId,
                        revision: asset.revision, fileName: asset.fileName, mime: asset.mime, bytes: asset.bytes, sha256: asset.sha256, width: asset.width, height: asset.height });
                }
            }
        }

        const manifestSources: unknown[] = [];
        if (sourceFields.length) {
            for (const source of [...sources.values()].sort((a, b) => a.id.localeCompare(b.id))) {
                const permission = this.choosePermission(permissions, used, 'SOURCE', source.id, source.id, sourceFields);
                dependencies.push(this.dependency(actor.workspaceId, job.id, 'SOURCE', source.id, sourceFields, source, source.revision, source.protectionEpoch, permission, initialExpiry));
                manifestSources.push({ id: source.id, revision: source.revision, protectionEpoch: source.protectionEpoch,
                    data: dataFields('source.', sourceFields, source as unknown as Record<string, unknown>) });
            }
        }
        invariant(used.size === d.usePermissionRefs.length, 'EXPORT_PERMISSION_UNUSED', '提交了未被本次导出使用的许可，请移除后重试', 422);
        job.usePermissionRefs = [...used].sort();
        job.expiresAt = minIso(initialExpiry, ...dependencies.map(dep => dep.validUntil));
        job.recordManifest = { schemaVersion: 'once-export-v1', frozenAt: now, people: manifestPeople, works: manifestWorks, projects: manifestProjects,
            sources: manifestSources, media, relations };
        await tx.insert('exports', job);
        for (const dependency of dependencies) await tx.insert('exportDependencies', dependency);
        return job;
    }

    private async exportFor(tx: Tx, actor: Actor, id: string) {
        requirePermission(actor, 'data.export');
        const row = await workspaceRow(tx, 'exports', id, actor.workspaceId);
        if (!row || row.actorId !== actor.membershipId) missing();
        return row;
    }

    private async validateDependency(tx: Tx, actor: Actor, dependency: ExportDependency) {
        try {
            const source = await sourceFor(tx, actor, dependency.sourceId, this.clock);
            invariant(source.protectionEpoch === dependency.sourceProtectionEpoch, 'EXPORT_SOURCE_CHANGED', '来源安全状态已变化', 409);
            const permission = await this.permissionFor(tx, actor, dependency.usePermissionId);
            invariant(permission.revision === dependency.usePermissionRevision && dependency.fields.every(field => permission.fields.includes(field)),
                'EXPORT_PERMISSION_CHANGED', '导出许可已变化', 409);
            let revision = dependency.resourceRevision;
            if (dependency.kind === 'PERSON') {
                const row = await personFor(tx, actor, dependency.personId!, this.clock);
                invariant(row.protectionEpoch === dependency.resourceProtectionEpoch, 'EXPORT_SUBJECT_CHANGED', '人才安全状态已变化', 409);
                revision = row.revision;
            }
            else if (dependency.kind === 'WORK') revision = (await workFor(tx, actor, dependency.workId!, this.clock)).revision;
            else if (dependency.kind === 'PROJECT') revision = (await projectFor(tx, actor, dependency.projectId!, this.clock)).revision;
            else if (dependency.kind === 'ASSET') revision = (await readyAsset(tx, actor, dependency.assetId!, this.clock)).revision;
            else revision = source.revision;
            invariant(Date.parse(dependency.validUntil) > this.clock.now().getTime(), 'EXPORT_EXPIRED', '导出依赖已到期', 409);
            return revision !== dependency.resourceRevision;
        }
        catch (error) { return safeError(error); }
    }

    private async validateDependencies(tx: Tx, actor: Actor, row: ExportJob) {
        this.egress();
        invariant(Date.parse(row.expiresAt) > this.clock.now().getTime(), 'EXPORT_EXPIRED', '导出已经过期，请重新生成', 409);
        let contentChanged = false;
        const deps = await tx.find('exportDependencies', { workspaceId: row.workspaceId, exportId: row.id });
        invariant(deps.length > 0, 'EXPORT_DEPENDENCY_MISSING', '导出依赖清单不完整', 409);
        for (const dep of deps) contentChanged = (await this.validateDependency(tx, actor, dep)) || contentChanged;
        return { contentChanged, dependencyCount: deps.length };
    }

    async list(tx: Tx, actor: Actor, query: Record<string, string>) {
        requirePermission(actor, 'data.export');
        const rows = (await tx.find('exports', { workspaceId: actor.workspaceId, actorId: actor.membershipId }))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
        return page(rows.map(row => ({ id: row.id, state: row.state, format: row.format, schemaVersion: row.schemaVersion, fields: row.fields,
            createdAt: row.createdAt, expiresAt: row.expiresAt, revision: row.revision, payloadDigest: row.payloadDigest })), query);
    }

    async get(tx: Tx, actor: Actor, id: string) {
        const row = await this.exportFor(tx, actor, id);
        let effectiveState = row.state, blockedReason: string | null = null, contentChanged = false;
        if (row.state === 'READY') {
            try { contentChanged = (await this.validateDependencies(tx, actor, row)).contentChanged; }
            catch (error) {
                if (!(error instanceof AppError) || error.status >= 500) throw error;
                effectiveState = 'STALE'; blockedReason = error.code;
            }
        }
        return { id: row.id, state: row.state, effectiveState, format: row.format, schemaVersion: row.schemaVersion, fields: row.fields,
            createdAt: row.createdAt, expiresAt: row.expiresAt, revision: row.revision, payloadDigest: row.payloadDigest,
            contentChanged, downloadable: effectiveState === 'READY', blockedReason };
    }

    async download(tx: Tx, actor: Actor, id: string, meta: RequestMeta) {
        const row = await this.exportFor(tx, actor, id);
        invariant(row.state === 'READY' && row.payload, 'EXPORT_NOT_READY', '导出尚未可下载', 409);
        await this.validateDependencies(tx, actor, row);
        await audit(tx, actor, actor.workspaceId, 'export.download', 'export', row.id, [], meta, this.clock);
        return { fileName: 'once-export-' + row.id + '.json', sha256: row.payloadDigest, payload: row.payload };
    }

    async actorFor(tx: Tx, row: ExportJob): Promise<Actor> {
        const member = await workspaceRow(tx, 'memberships', row.actorId, row.workspaceId);
        const user = member ? await workspaceRow(tx, 'users', member.userId, row.workspaceId) : null;
        const workspace = await tx.get('workspaces', row.workspaceId);
        invariant(member?.status === 'ACTIVE' && user?.status === 'ACTIVE', 'ACTOR_DISABLED', '导出申请人已失去资格', 403);
        invariant(this.config.accessMode === 'INTERNAL' && this.config.dataEgressMode === 'INTERNAL_APPROVED' && workspace?.recoveryEpoch === this.config.recoveryEpoch,
            'EGRESS_DISABLED', '当前环境未批准导出执行', 503);
        const actor: Actor = { userId: user.id, membershipId: member.id, workspaceId: row.workspaceId, role: member.role,
            permissions: permissionsFor(member), displayName: user.displayName, userEpoch: user.sessionEpoch, sessionId: 'worker' };
        requirePermission(actor, 'data.export');
        return actor;
    }

    async claim(): Promise<ExportJob | null> {
        if (this.config.accessMode !== 'INTERNAL' || this.config.dataEgressMode !== 'INTERNAL_APPROVED') return null;
        return this.store.transaction(async tx => {
            const now = this.clock.now().getTime();
            const rows = (await tx.find('exports')).filter(row => row.state === 'QUEUED' && (!row.leaseUntil || Date.parse(row.leaseUntil) <= now))
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
            for (const row of rows) {
                const workspace = await tx.get('workspaces', row.workspaceId);
                if (workspace?.recoveryEpoch !== this.config.recoveryEpoch) continue;
                if (row.attempts >= 3) { await tx.replace('exports', { ...touch(row, this.clock), state: 'FAILED', errorCode: 'ATTEMPTS_EXHAUSTED', leaseToken: null, leaseUntil: null }); continue; }
                const next: ExportJob = { ...touch(row, this.clock), leaseToken: randomUUID(), leaseUntil: new Date(now + 30000).toISOString(), attempts: row.attempts + 1 };
                await tx.replace('exports', next); return next;
            }
            return null;
        });
    }

    private async owned(tx: Tx, claim: ExportJob) {
        const row = await workspaceRow(tx, 'exports', claim.id, claim.workspaceId);
        invariant(row && row.state === 'QUEUED' && row.leaseToken === claim.leaseToken && Date.parse(row.leaseUntil ?? '') > this.clock.now().getTime(),
            'LEASE_LOST', '导出任务租约已失效', 409);
        return row;
    }

    async process(claim: ExportJob): Promise<void> {
        try {
            await this.store.transaction(async tx => {
                const row = await this.owned(tx, claim);
                const actor = await this.actorFor(tx, row);
                await this.validateDependencies(tx, actor, row);
                const payload = { schemaVersion: row.schemaVersion, exportId: row.id, frozenAt: row.createdAt, manifest: row.recordManifest };
                await tx.replace('exports', { ...touch(row, this.clock), state: 'READY', payload, payloadDigest: digest(payload), errorCode: null, leaseToken: null, leaseUntil: null });
            });
        }
        catch (error) {
            if (error instanceof AppError && error.code === 'LEASE_LOST') return;
            await this.store.transaction(async tx => {
                const row = await workspaceRow(tx, 'exports', claim.id, claim.workspaceId);
                if (!row || row.state !== 'QUEUED' || row.leaseToken !== claim.leaseToken) return;
                const safety = error instanceof AppError && error.status < 500;
                await tx.replace('exports', { ...touch(row, this.clock), state: safety ? 'STALE' : row.attempts < 3 ? 'QUEUED' : 'FAILED',
                    errorCode: error instanceof AppError ? error.code : 'EXPORT_FAILED', leaseToken: null, leaseUntil: null });
            });
        }
    }
}
