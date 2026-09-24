import type { Actor, Clock, Person } from './model.ts';
import type { Tx } from './store.ts';
import { page, workspaceRow } from './helpers.ts';
import { AppError, invariant } from './errors.ts';
import { digest } from './json.ts';
import { personFor, requirePermission, sourceVisible } from './policy.ts';
import { projectFor } from './production-policy.ts';

function hidden(error: unknown): boolean {
    return error instanceof AppError && error.status === 404;
}

function facets(rows: Person[]) {
    const count = (values: string[]) => [...new Set(values)].sort().map(code => ({ code, count: rows.filter(p =>
        p.roles.includes(code) || p.languageCodes.includes(code) || p.skillCodes.includes(code) || p.cityCode === code).length }));
    return {
        roles: count(rows.flatMap(p => p.roles)),
        cities: count(rows.flatMap(p => p.cityCode ? [p.cityCode] : [])),
        languages: count(rows.flatMap(p => p.languageCodes)),
        skills: count(rows.flatMap(p => p.skillCodes))
    };
}

/** Deterministic internal search. No score, embeddings, free-form SQL or delegated-profile expansion. */
export class TalentSearch {
    clock: Clock;
    constructor(clock: Clock) { this.clock = clock; }

    private async nativeVisible(tx: Tx, actor: Actor) {
        const out: Person[] = [];
        for (const row of await tx.find('people', { workspaceId: actor.workspaceId })) {
            try {
                out.push(await personFor(tx, actor, row.id, this.clock));
            }
            catch (e) {
                if (!hidden(e))
                    throw e;
            }
        }
        return out;
    }

    private async actualProjects(tx: Tx, actor: Actor, personId: string) {
        let count = 0;
        const seen = new Set<string>();
        for (const row of await tx.find('projectParticipants', { workspaceId: actor.workspaceId, personId, state: 'ACTUAL' })) {
            if (seen.has(row.projectId))
                continue;
            try {
                await projectFor(tx, actor, row.projectId, this.clock);
                seen.add(row.projectId);
                count++;
            }
            catch (e) {
                if (!hidden(e))
                    throw e;
            }
        }
        return count;
    }

    private async latestVerifiedAt(tx: Tx, actor: Actor, person: Person): Promise<string | null> {
        let latest: string | null = null;
        for (const row of await tx.find('evidence', { workspaceId: actor.workspaceId, personId: person.id })) {
            const source = await workspaceRow(tx, 'sources', row.sourceId, actor.workspaceId);
            if (!source || !(await sourceVisible(tx, actor, source, this.clock)))
                continue;
            const key = row.fieldPath as keyof Person;
            if (row.sourceRevision !== source.revision || digest(person[key]) !== row.valueDigest)
                continue;
            if (!latest || row.reviewedAt > latest)
                latest = row.reviewedAt;
        }
        return latest;
    }

    async search(tx: Tx, actor: Actor, query: Record<string, string>) {
        requirePermission(actor, 'records.read');
        const keys = ['q', 'role', 'cityCode', 'languageCode', 'skillCode', 'status', 'actualProject', 'verifiedWithinDays'];
        page([], query, keys);
        invariant((query.q?.length ?? 0) <= 120, 'QUERY_INVALID', '关键词过长', 400);
        invariant(!query.status || ['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(query.status), 'QUERY_INVALID', '人才状态筛选无效', 400);
        invariant(!query.actualProject || query.actualProject === 'true', 'QUERY_INVALID', '实际合作筛选仅支持 true', 400);
        const days = query.verifiedWithinDays ? Number(query.verifiedWithinDays) : null;
        invariant(days === null || [30, 90, 180, 365].includes(days), 'QUERY_INVALID', '核验时效仅支持30/90/180/365天', 400);
        const allVisible = await this.nativeVisible(tx, actor);
        const result = [];
        const q = query.q?.toLocaleLowerCase() ?? '';
        const threshold = days === null ? null : this.clock.now().getTime() - days * 86400000;
        for (const person of allVisible) {
            if (q && ![person.displayName, ...person.aliases].some(x => x.toLocaleLowerCase().includes(q)))
                continue;
            if (query.role && !person.roles.includes(query.role))
                continue;
            if (query.cityCode && person.cityCode !== query.cityCode)
                continue;
            if (query.languageCode && !person.languageCodes.includes(query.languageCode))
                continue;
            if (query.skillCode && !person.skillCodes.includes(query.skillCode))
                continue;
            if (query.status && person.status !== query.status)
                continue;
            const actualProjectCount = await this.actualProjects(tx, actor, person.id);
            if (query.actualProject === 'true' && actualProjectCount === 0)
                continue;
            const latestVerifiedAt = await this.latestVerifiedAt(tx, actor, person);
            if (threshold !== null && (!latestVerifiedAt || Date.parse(latestVerifiedAt) < threshold))
                continue;
            const match = [];
            if (q) match.push({ field: 'q', value: query.q!, basis: '姓名或别名' });
            if (query.role) match.push({ field: 'role', value: query.role, basis: '人才角色' });
            if (query.cityCode) match.push({ field: 'cityCode', value: query.cityCode, basis: '人才城市' });
            if (query.languageCode) match.push({ field: 'languageCode', value: query.languageCode, basis: '语言字段' });
            if (query.skillCode) match.push({ field: 'skillCode', value: query.skillCode, basis: '技能字段' });
            if (query.actualProject) match.push({ field: 'actualProject', value: 'true', basis: '当前可见项目中的实际参与记录' });
            if (query.verifiedWithinDays) match.push({ field: 'verifiedWithinDays', value: query.verifiedWithinDays, basis: '当前仍有效的字段核验记录' });
            result.push({ id: person.id, displayName: person.displayName, roles: person.roles, cityCode: person.cityCode,
                languageCodes: person.languageCodes, skillCodes: person.skillCodes, status: person.status, revision: person.revision,
                updatedAt: person.updatedAt, actualProjectCount, verification: { state: latestVerifiedAt ? 'CURRENT' : 'UNKNOWN', latestReviewedAt: latestVerifiedAt }, match });
        }
        result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
        return {
            ...page(result, query, keys),
            facets: facets(allVisible),
            capabilities: {
                supported: ['q', 'role', 'cityCode', 'languageCode', 'skillCode', 'status', 'actualProject', 'verifiedWithinDays'],
                unsupported: ['industry', 'workType', 'quote', 'availability'],
                note: '当前没有行业、作品类型、报价和档期结构化事实，系统不会用空值伪匹配。'
            }
        };
    }
}
