import type { Actor, Clock, Person, Source, SourceHistory } from './model.ts';
import type { Work, WorkCredit, Project, ProjectParticipant, ProjectWork } from './production-model.ts';
import { PRODUCTION_LIMITS as PL } from './production-model.ts';
import type { Tx } from './store.ts';
import type { Parsed } from './validation.ts';
import { RebuildSchemas } from './rebuild-validation.ts';
import { REBUILD_EMPTY_TABLES, REBUILD_LIMITS as RL, REBUILD_SCHEMA_VERSION, type RebuildSummary } from './rebuild-model.ts';
import { audit, base, unique, workspaceRow } from './helpers.ts';
import { digest } from './json.ts';
import { invariant } from './errors.ts';
import { permissionsFor, requirePermission } from './policy.ts';
import { sourceSnapshot } from './source-history.ts';

type Payload = Parsed<typeof RebuildSchemas.payload>;

function uniqueBy<T>(rows: T[], key: (row: T) => string, code: string, message: string) {
    invariant(new Set(rows.map(key)).size === rows.length, code, message, 400);
}
function businessTime(clock: Clock) {
    const at = clock.now().toISOString();
    return { createdAt: at, updatedAt: at };
}

export class JsonRebuild {
    clock: Clock;
    constructor(clock: Clock) { this.clock = clock; }

    private async target(tx: Tx, actor: Actor) {
        invariant(actor.role === 'ADMIN', 'REBUILD_ADMIN_REQUIRED', '隔离重建只能由目标环境唯一管理员执行', 403);
        requirePermission(actor, 'records.write');
        requirePermission(actor, 'sources.review');

        const workspaces = await tx.find('workspaces');
        invariant(workspaces.length === 1 && workspaces[0]?.id === actor.workspaceId,
            'REBUILD_TARGET_NOT_ISOLATED', '目标必须是只有一个工作空间的隔离安装', 409);
        const users = await tx.find('users', { workspaceId: actor.workspaceId });
        const memberships = await tx.find('memberships', { workspaceId: actor.workspaceId });
        invariant(users.length === 1 && memberships.length === 1
            && users[0]?.id === actor.userId && memberships[0]?.id === actor.membershipId
            && users[0]?.status === 'ACTIVE' && memberships[0]?.status === 'ACTIVE',
            'REBUILD_TARGET_NOT_ISOLATED', '目标必须只保留执行重建的一个已激活管理员账号', 409);
        invariant((await tx.find('activations', { workspaceId: actor.workspaceId })).length === 0,
            'REBUILD_TARGET_NOT_ISOLATED', '目标存在待处理激活凭证，不能开始重建', 409);

        const scopes = await tx.find('scopes', { workspaceId: actor.workspaceId });
        invariant(scopes.length === 1 && scopes[0]?.mode === 'WORKSPACE',
            'REBUILD_TARGET_NOT_ISOLATED', '目标必须只有 bootstrap 创建的工作空间范围', 409);
        invariant((await tx.find('scopeMembers', { workspaceId: actor.workspaceId })).length === 0,
            'REBUILD_TARGET_NOT_ISOLATED', '目标已经存在额外范围成员配置', 409);

        for (const table of REBUILD_EMPTY_TABLES) {
            const rows = await tx.find(table, { workspaceId: actor.workspaceId } as never);
            invariant(rows.length === 0, 'REBUILD_TARGET_NOT_EMPTY', '目标已存在业务数据，隔离重建拒绝覆盖或合并现有记录', 409);
        }
        return { workspace: workspaces[0]!, scope: scopes[0]! };
    }

    private async catalog(tx: Tx, actor: Actor, namespace: 'role' | 'city' | 'language' | 'skill' | 'industry' | 'workType', codes: string[]) {
        for (const code of unique(codes)) {
            const row = (await tx.find('dictionary', { workspaceId: actor.workspaceId, namespace, code, status: 'ACTIVE' }))[0];
            invariant(row, 'REBUILD_CATALOG_MISSING', '目标环境缺少导出数据使用的启用分类代码，请先补齐字典再重建', 409);
        }
    }

    private async plan(tx: Tx, actor: Actor, input: unknown) {
        const payload = RebuildSchemas.payload.parse(input);
        const target = await this.target(tx, actor);
        const now = this.clock.now().getTime();
        invariant(Date.parse(payload.frozenAt) <= now && Date.parse(payload.manifest.frozenAt) <= now,
            'REBUILD_EXPORT_TIME_INVALID', '导出时间不能晚于目标环境当前时间', 422);

        const { sources, people, works, projects, media, relations } = payload.manifest;
        invariant(people.length + works.length + projects.length > 0, 'REBUILD_EMPTY_EXPORT', '导出中没有可重建的业务根对象', 422);
        uniqueBy(sources, x => x.id, 'REBUILD_DUPLICATE_ID', '来源清单包含重复 ID');
        uniqueBy(people, x => x.id, 'REBUILD_DUPLICATE_ID', '人才清单包含重复 ID');
        uniqueBy(works, x => x.id, 'REBUILD_DUPLICATE_ID', '作品清单包含重复 ID');
        uniqueBy(projects, x => x.id, 'REBUILD_DUPLICATE_ID', '项目清单包含重复 ID');
        // One Asset may legitimately be reused by more than one Work. The exported media list
        // represents work/asset placements, so uniqueness is per relationship, not global asset id.
        uniqueBy(media, x => x.workId + ':' + x.id, 'REBUILD_DUPLICATE_MEDIA_LINK', '同一作品的媒体身份关系重复');

        const sourceIds = new Set(sources.map(x => x.id));
        const personIds = new Set(people.map(x => x.id));
        const workIds = new Set(works.map(x => x.id));
        const projectIds = new Set(projects.map(x => x.id));
        for (const row of sources) {
            invariant(Date.parse(row.data.validFrom) <= now && now < Date.parse(row.data.validUntil),
                'REBUILD_SOURCE_NOT_CURRENT', '重建只接受当前仍有效的 INTERNAL_USE 来源快照', 409);
        }
        for (const row of [...people, ...works, ...projects])
            invariant(sourceIds.has(row.sourceId), 'REBUILD_SOURCE_MISSING', '业务对象引用的来源没有包含在重建清单中', 422);
        const assetIdentity = new Map<string,string>();
        for (const row of media) {
            invariant(workIds.has(row.workId) && sourceIds.has(row.sourceId), 'REBUILD_MEDIA_REFERENCE_INVALID',
                '媒体身份必须引用本次导出的作品和来源', 422);
            const identityDigest = digest({ sourceId: row.sourceId, revision: row.revision, fileName: row.fileName,
                mime: row.mime, bytes: row.bytes, sha256: row.sha256, width: row.width, height: row.height });
            const previous = assetIdentity.get(row.id);
            invariant(!previous || previous === identityDigest, 'REBUILD_MEDIA_IDENTITY_CONFLICT',
                '同一媒体 ID 在不同作品中的身份元数据不一致', 422);
            assetIdentity.set(row.id, identityDigest);
        }

        const referencedSources = new Set([
            ...people.map(x => x.sourceId), ...works.map(x => x.sourceId), ...projects.map(x => x.sourceId), ...media.map(x => x.sourceId)
        ]);
        invariant(sources.every(x => referencedSources.has(x.id)), 'REBUILD_UNUSED_SOURCE',
            '来源清单包含没有被本次业务图引用的记录', 422);

        for (const row of people) {
            invariant(unique(row.data.roles).length === row.data.roles.length
                && unique(row.data.languageCodes ?? []).length === (row.data.languageCodes ?? []).length
                && unique(row.data.skillCodes ?? []).length === (row.data.skillCodes ?? []).length,
                'REBUILD_DUPLICATE_CODE', '人才分类字段包含重复代码，不能静默归一化重建', 422);
            await this.catalog(tx, actor, 'role', row.data.roles);
            if (row.data.cityCode) await this.catalog(tx, actor, 'city', [row.data.cityCode]);
            await this.catalog(tx, actor, 'language', row.data.languageCodes ?? []);
            await this.catalog(tx, actor, 'skill', row.data.skillCodes ?? []);
        }
        for (const row of works) {
            invariant(row.data.title.trim().length > 0, 'REBUILD_TITLE_REQUIRED', '作品标题去除空白后不能为空', 422);
            invariant(unique(row.data.workTypeCodes ?? []).length === (row.data.workTypeCodes ?? []).length,
                'REBUILD_DUPLICATE_CODE', '作品类型包含重复代码，不能静默归一化重建', 422);
            invariant(row.data.status !== 'ACTIVE', 'REBUILD_MEDIA_BYTES_REQUIRED',
                'ACTIVE 作品需要真实媒体字节与封面；当前 JSON 只有媒体身份清单，不能伪造 ACTIVE 作品', 409);
            invariant(row.data.origin !== 'ONCE' || (row.data.originNote ?? '').trim().length >= 4,
                'REBUILD_ORIGIN_BASIS_REQUIRED', 'ONCE 制作作品必须包含明确制作依据', 422);
            if (row.data.industryCode) await this.catalog(tx, actor, 'industry', [row.data.industryCode]);
            await this.catalog(tx, actor, 'workType', row.data.workTypeCodes ?? []);
        }

        for (const row of projects)
            invariant(row.data.title.trim().length > 0, 'REBUILD_TITLE_REQUIRED', '项目标题去除空白后不能为空', 422);

        uniqueBy(relations.workCredits, x => x.workId + ':' + x.personId + ':' + x.roleCode,
            'REBUILD_DUPLICATE_RELATION', '作品署名关系重复');
        uniqueBy(relations.projectParticipants, x => x.projectId + ':' + x.personId + ':' + x.roleCode,
            'REBUILD_DUPLICATE_RELATION', '项目参与关系重复');
        uniqueBy(relations.projectWorks, x => x.projectId + ':' + x.workId,
            'REBUILD_DUPLICATE_RELATION', '项目作品关系重复');

        const relationCount = relations.workCredits.length + relations.projectParticipants.length + relations.projectWorks.length;
        invariant(relationCount <= RL.relations, 'REBUILD_RELATION_LIMIT', '关系总数超过隔离重建安全上限', 422);
        for (const workId of workIds)
            invariant(relations.workCredits.filter(x => x.workId === workId).length <= PL.credits,
                'REBUILD_ROOT_RELATION_LIMIT', '单个作品的署名关系超过正常业务上限', 422);
        for (const projectId of projectIds) {
            invariant(relations.projectParticipants.filter(x => x.projectId === projectId).length <= PL.participants,
                'REBUILD_ROOT_RELATION_LIMIT', '单个项目的参与关系超过正常业务上限', 422);
            invariant(relations.projectWorks.filter(x => x.projectId === projectId).length <= PL.works,
                'REBUILD_ROOT_RELATION_LIMIT', '单个项目的作品关系超过正常业务上限', 422);
        }

        for (const row of relations.workCredits) {
            invariant(workIds.has(row.workId) && personIds.has(row.personId), 'REBUILD_RELATION_REFERENCE_INVALID',
                '作品署名关系引用了未导出的对象', 422);
            await this.catalog(tx, actor, 'role', [row.roleCode]);
        }
        for (const row of relations.projectParticipants) {
            invariant(projectIds.has(row.projectId) && personIds.has(row.personId), 'REBUILD_RELATION_REFERENCE_INVALID',
                '项目参与关系引用了未导出的对象', 422);
            invariant(row.state !== 'ACTUAL', 'REBUILD_RELATION_DETAIL_MISSING',
                'ACTUAL 项目参与需要真实工作依据备注；once-export-v1 未导出该备注，不能凭空重建', 409);
            await this.catalog(tx, actor, 'role', [row.roleCode]);
        }
        for (const row of relations.projectWorks)
            invariant(projectIds.has(row.projectId) && workIds.has(row.workId), 'REBUILD_RELATION_REFERENCE_INVALID',
                '项目作品关系引用了未导出的对象', 422);

        const mediaByWork = new Map<string, typeof media>();
        for (const row of media) mediaByWork.set(row.workId, [...(mediaByWork.get(row.workId) ?? []), row]);
        for (const [workId, rows] of mediaByWork) {
            invariant(rows.length <= PL.assets, 'REBUILD_ROOT_MEDIA_LIMIT', '单个作品的媒体身份超过正常业务上限', 422);
            uniqueBy(rows, x => String(x.position), 'REBUILD_MEDIA_ORDER_INVALID', '同一作品的媒体位置重复');
            const positions = rows.map(x => x.position).sort((a,b)=>a-b);
            invariant(positions.every((position, index) => position === index), 'REBUILD_MEDIA_ORDER_INVALID',
                '同一作品的媒体位置必须从 0 开始连续排列', 422);
            invariant(rows.filter(x => x.isCover).length <= 1, 'REBUILD_MEDIA_COVER_INVALID', '同一作品存在多个媒体封面标记', 422);
            invariant(workIds.has(workId), 'REBUILD_MEDIA_REFERENCE_INVALID', '媒体身份引用了未导出的作品', 422);
        }

        const summary: RebuildSummary = {
            schemaVersion: REBUILD_SCHEMA_VERSION,
            exportId: payload.exportId,
            inputDigest: digest(payload),
            workspaceId: actor.workspaceId,
            scopeId: target.scope.id,
            counts: {
                sources: sources.length,
                people: people.length,
                works: works.length,
                projects: projects.length,
                workCredits: relations.workCredits.length,
                projectParticipants: relations.projectParticipants.length,
                projectWorks: relations.projectWorks.length,
                mediaIdentities: media.length
            },
            mediaRestored: 0
        };
        return { payload, target, summary };
    }

    async preview(tx: Tx, actor: Actor, input: unknown): Promise<RebuildSummary> {
        return (await this.plan(tx, actor, input)).summary;
    }

    async apply(tx: Tx, actor: Actor, input: unknown, meta: { requestId: string; ip: string }): Promise<RebuildSummary> {
        const { payload, target, summary } = await this.plan(tx, actor, input);
        const at = this.clock.now().toISOString();
        const stamp = businessTime(this.clock);

        for (const row of payload.manifest.sources) {
            const source: Source = {
                id: row.id, workspaceId: actor.workspaceId, ...stamp, revision: row.revision,
                scopeId: target.scope.id, maintainerId: actor.membershipId,
                title: row.data.title, type: row.data.type, providerClaim: row.data.providerClaim,
                textPayload: '', basisMode: 'INTERNAL_USE', basisDescription: row.data.basisDescription,
                validFrom: row.data.validFrom, validUntil: row.data.validUntil, status: 'CONFIRMED',
                protectionEpoch: row.protectionEpoch + 1,
                reviewedBy: actor.membershipId, reviewedAt: at
            };
            await tx.insert('sources', source);
            const history: SourceHistory = {
                ...base(actor.workspaceId, this.clock), sourceId: source.id, sourceRevision: source.revision,
                scopeId: source.scopeId, actorId: null, action: 'BASELINE',
                // BASELINE is an observed starting point, not invented historical authorship.
                // The actual rebuild operator is recorded by the separate rebuild.apply audit.
                decisionReason: null, baselineOnly: true, basisAmbiguous: false, snapshot: sourceSnapshot(source)
            };
            await tx.insert('sourceHistory', history);
        }

        for (const row of payload.manifest.people) {
            const person: Person = {
                id: row.id, workspaceId: actor.workspaceId, ...stamp, revision: row.revision,
                scopeId: target.scope.id, sourceId: row.sourceId, maintainerId: actor.membershipId,
                displayName: row.data.displayName, aliases: unique(row.data.aliases ?? []), roles: unique(row.data.roles),
                cityCode: row.data.cityCode ?? null, languageCodes: unique(row.data.languageCodes ?? []),
                skillCodes: unique(row.data.skillCodes ?? []), heightCm: row.data.heightCm ?? null,
                intro: row.data.intro ?? '', status: row.data.status, protectionEpoch: 1
            };
            await tx.insert('people', person);
        }

        for (const row of payload.manifest.works) {
            const work: Work = {
                id: row.id, workspaceId: actor.workspaceId, ...stamp, revision: row.revision,
                sourceId: row.sourceId, scopeId: target.scope.id, maintainerId: actor.membershipId,
                title: row.data.title.trim(), description: row.data.description ?? '',
                industryCode: row.data.industryCode ?? null, workTypeCodes: unique(row.data.workTypeCodes ?? []),
                origin: row.data.origin, originNote: row.data.originNote ?? '', status: row.data.status,
                coverEntryId: null
            };
            await tx.insert('works', work);
        }

        for (const row of payload.manifest.projects) {
            const project: Project = {
                id: row.id, workspaceId: actor.workspaceId, ...stamp, revision: row.revision,
                sourceId: row.sourceId, scopeId: target.scope.id, maintainerId: actor.membershipId,
                title: row.data.title.trim(), brief: row.data.brief ?? '', locationNote: row.data.locationNote ?? '',
                dateNote: row.data.dateNote ?? '', reviewNote: row.data.reviewNote ?? '', status: row.data.status
            };
            await tx.insert('projects', project);
        }

        for (const row of payload.manifest.relations.workCredits) {
            const relation: WorkCredit = { ...base(actor.workspaceId, this.clock), ...row, note: '' };
            await tx.insert('workCredits', relation);
        }
        for (const row of payload.manifest.relations.projectParticipants) {
            const relation: ProjectParticipant = { ...base(actor.workspaceId, this.clock), ...row, note: '' };
            await tx.insert('projectParticipants', relation);
        }
        for (const row of payload.manifest.relations.projectWorks) {
            const relation: ProjectWork = { ...base(actor.workspaceId, this.clock), ...row };
            await tx.insert('projectWorks', relation);
        }

        await audit(tx, actor, actor.workspaceId, 'rebuild.apply', 'rebuild-export', payload.exportId,
            ['sources', 'people', 'works', 'projects', 'relations', ...(payload.manifest.media.length ? ['media.identity-only'] : [])],
            meta, this.clock);
        return summary;
    }

    async actorFromTarget(tx: Tx, loginName: string): Promise<Actor> {
        const users = await tx.find('users', { loginName });
        invariant(users.length === 1 && users[0]?.status === 'ACTIVE', 'REBUILD_ACTOR_INVALID',
            '目标重建账号不存在或未激活', 403);
        const user = users[0]!;
        const member = (await tx.find('memberships', { workspaceId: user.workspaceId, userId: user.id }))[0];
        invariant(member?.status === 'ACTIVE' && member.role === 'ADMIN', 'REBUILD_ADMIN_REQUIRED',
            '目标重建账号必须是已激活管理员', 403);
        return {
            userId: user.id, membershipId: member.id, workspaceId: user.workspaceId,
            role: member.role, permissions: permissionsFor(member), displayName: user.displayName,
            userEpoch: user.sessionEpoch, sessionId: 'json-rebuild-cli'
        };
    }
}
