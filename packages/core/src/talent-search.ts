import type { Actor, Clock, Person } from './model.ts';
import type { Tx } from './store.ts';
import type { TalentFacetRow, TalentQueryRow } from './search-query-model.ts';
import { invariant } from './errors.ts';
import { digest } from './json.ts';
import { requirePermission } from './policy.ts';
import { loadVisibility } from './visibility.ts';

function facets(rows: TalentFacetRow[]) {
    const count = (codes: string[], matches: (row: TalentFacetRow, code: string) => boolean) =>
        [...new Set(codes)].sort().map(code => ({ code, count: rows.filter(row => matches(row, code)).length }));
    return {
        roles: count(rows.flatMap(r => r.roles), (r, code) => r.roles.includes(code)),
        cities: count(rows.flatMap(r => r.cityCode ? [r.cityCode] : []), (r, code) => r.cityCode === code),
        languages: count(rows.flatMap(r => r.languageCodes), (r, code) => r.languageCodes.includes(code)),
        skills: count(rows.flatMap(r => r.skillCodes), (r, code) => r.skillCodes.includes(code)),
        industries: count(rows.flatMap(r => r.industryCodes), (r, code) => r.industryCodes.includes(code)),
        workTypes: count(rows.flatMap(r => r.workTypeCodes), (r, code) => r.workTypeCodes.includes(code))
    };
}
function facetRow(row: TalentQueryRow): TalentFacetRow {
    return { personId: row.person.id, roles: row.person.roles, cityCode: row.person.cityCode,
        languageCodes: row.person.languageCodes, skillCodes: row.person.skillCodes,
        industryCodes: row.industryCodes, workTypeCodes: row.workTypeCodes };
}

/** Deterministic internal search. SQL adapter handles native visibility + structured facts; evidence digest remains core policy. */
export class TalentSearch {
    clock: Clock;
    constructor(clock: Clock) { this.clock = clock; }
    async search(tx: Tx, actor: Actor, query: Record<string, string>) {
        requirePermission(actor, 'records.read');
        const keys = ['page', 'pageSize', 'q', 'role', 'cityCode', 'languageCode', 'skillCode', 'status', 'actualProject', 'verifiedWithinDays', 'industryCode', 'workTypeCode'];
        for (const key of Object.keys(query))
            invariant(keys.includes(key), 'QUERY_INVALID', '包含不支持的筛选字段', 400);
        const pageIndex = Number(query.page ?? '1'), pageSize = Number(query.pageSize ?? '20');
        invariant(Number.isSafeInteger(pageIndex) && pageIndex >= 1 && pageIndex <= 100000 && Number.isSafeInteger(pageSize) && pageSize >= 1 && pageSize <= 100, 'QUERY_INVALID', '分页参数无效', 400);
        invariant((query.q?.length ?? 0) <= 120, 'QUERY_INVALID', '关键词过长', 400);
        invariant(!query.status || ['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(query.status), 'QUERY_INVALID', '人才状态筛选无效', 400);
        invariant(!query.actualProject || query.actualProject === 'true', 'QUERY_INVALID', '实际合作筛选仅支持 true', 400);
        for (const key of ['role', 'cityCode', 'languageCode', 'skillCode', 'industryCode', 'workTypeCode'] as const)
            invariant(!query[key] || /^[a-z0-9][a-z0-9_-]{0,59}$/.test(query[key]!), 'QUERY_INVALID', '分类筛选代码无效', 400);
        const days = query.verifiedWithinDays ? Number(query.verifiedWithinDays) : null;
        invariant(days === null || [30, 90, 180, 365].includes(days), 'QUERY_INVALID', '核验时效仅支持30/90/180/365天', 400);
        const visibility = await loadVisibility(tx, actor, this.clock);
        const raw = await tx.talentQuery({
            workspaceId: actor.workspaceId, visibleScopeIds: visibility.visibleScopeIds, visibleSourceIds: visibility.visibleSourceIds,
            q: query.q?.toLocaleLowerCase() ?? '', role: query.role ?? null, cityCode: query.cityCode ?? null,
            languageCode: query.languageCode ?? null, skillCode: query.skillCode ?? null,
            status: (query.status as Person['status'] | undefined) ?? null, actualProject: query.actualProject === 'true',
            industryCode: query.industryCode ?? null, workTypeCode: query.workTypeCode ?? null,
            page: pageIndex, pageSize, scanForVerification: days !== null
        });
        const evidenceByPerson = new Map<string, typeof raw.evidence>();
        for (const evidence of raw.evidence) {
            const list = evidenceByPerson.get(evidence.personId) ?? [];
            list.push(evidence); evidenceByPerson.set(evidence.personId, list);
        }
        const threshold = days === null ? null : this.clock.now().getTime() - days * 86400000;
        const enrich = (row: TalentQueryRow) => {
            let latestVerifiedAt: string | null = null;
            for (const evidence of evidenceByPerson.get(row.person.id) ?? []) {
                const source = visibility.source(evidence.sourceId);
                if (!source || !visibility.sourceVisible(source.id) || evidence.sourceRevision !== source.revision) continue;
                const key = evidence.fieldPath as keyof Person;
                if (digest(row.person[key]) !== evidence.valueDigest) continue;
                if (!latestVerifiedAt || evidence.reviewedAt > latestVerifiedAt) latestVerifiedAt = evidence.reviewedAt;
            }
            return { row, latestVerifiedAt };
        };
        const enriched = raw.rows.map(enrich);
        const filtered = threshold === null ? enriched : enriched.filter(x => !!x.latestVerifiedAt && Date.parse(x.latestVerifiedAt) >= threshold);
        const selected = raw.alreadyPaged ? filtered : filtered.slice((pageIndex - 1) * pageSize, pageIndex * pageSize);
        const items = selected.map(({ row, latestVerifiedAt }) => {
            const match = [];
            if (query.q) match.push({ field: 'q', value: query.q, basis: '姓名或别名' });
            if (query.role) match.push({ field: 'role', value: query.role, basis: '人才角色' });
            if (query.cityCode) match.push({ field: 'cityCode', value: query.cityCode, basis: '人才城市' });
            if (query.languageCode) match.push({ field: 'languageCode', value: query.languageCode, basis: '语言字段' });
            if (query.skillCode) match.push({ field: 'skillCode', value: query.skillCode, basis: '技能字段' });
            if (query.industryCode) match.push({ field: 'industryCode', value: query.industryCode, basis: '当前可见署名作品的行业' });
            if (query.workTypeCode) match.push({ field: 'workTypeCode', value: query.workTypeCode, basis: '当前可见署名作品的作品类型' });
            if (query.actualProject) match.push({ field: 'actualProject', value: 'true', basis: '当前可见项目中的实际参与记录' });
            if (query.verifiedWithinDays) match.push({ field: 'verifiedWithinDays', value: query.verifiedWithinDays, basis: '当前仍有效的字段核验记录' });
            const p = row.person;
            return { id: p.id, displayName: p.displayName, roles: p.roles, cityCode: p.cityCode, languageCodes: p.languageCodes,
                skillCodes: p.skillCodes, industryCodes: row.industryCodes, workTypeCodes: row.workTypeCodes, status: p.status,
                revision: p.revision, updatedAt: p.updatedAt, actualProjectCount: row.actualProjectCount,
                verification: { state: latestVerifiedAt ? 'CURRENT' : 'UNKNOWN', latestReviewedAt: latestVerifiedAt }, match };
        });
        const facetResult = threshold === null ? raw.facets : facets(filtered.map(x => facetRow(x.row)));
        return { items, total: raw.alreadyPaged ? raw.baseTotal : filtered.length, page: pageIndex, pageSize, facets: facetResult,
            capabilities: { supported: ['q', 'role', 'cityCode', 'languageCode', 'skillCode', 'industryCode', 'workTypeCode', 'status', 'actualProject', 'verifiedWithinDays'],
                unsupported: ['quote', 'availability'], note: '行业和作品类型来自当前可见且有本人署名的作品；报价和档期当前没有结构化事实，不会用空值伪匹配。' } };
    }
}
