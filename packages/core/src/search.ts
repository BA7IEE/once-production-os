import type { Actor, Clock, Person } from './model.ts';
import type { Tx } from './store.ts';
import type { Talent } from './talent.ts';
import { requirePermission } from './policy.ts';
import { loadVisibility } from './visibility.ts';
import { digest } from './json.ts';
import { invariant } from './errors.ts';
import { page } from './helpers.ts';

const DIRECT = [
  ['role', 'roles'],
  ['cityCode', 'cityCode'],
  ['languageCode', 'languageCodes'],
  ['skillCode', 'skillCodes']
] as const;

type DirectParam = typeof DIRECT[number][0];
type EvidenceField = typeof DIRECT[number][1];
type Verification = { state: 'CURRENT' | 'OLD' | 'NONE'; reviewedAt: string | null };

function lower(value: string) { return value.toLocaleLowerCase(); }
function matchesDirect(person: Person, param: DirectParam, value: string) {
  if (param === 'role') return person.roles.includes(value);
  if (param === 'cityCode') return person.cityCode === value;
  if (param === 'languageCode') return person.languageCodes.includes(value);
  return person.skillCodes.includes(value);
}
function valueFor(person: Person, field: EvidenceField): unknown { return person[field]; }

export class Search {
  clock: Clock;
  talent: Talent;
  constructor(clock: Clock, talent: Talent) { this.clock = clock; this.talent = talent; }

  async people(tx: Tx, actor: Actor, query: Record<string, string>) {
    requirePermission(actor, 'records.read');
    const keys = ['q','role','cityCode','languageCode','skillCode','status','actualProject','workQ','workOrigin','verifiedWithinDays'];
    page([], query, keys);
    invariant((query.q?.length ?? 0) <= 120 && (query.workQ?.length ?? 0) <= 160, 'QUERY_INVALID', '检索关键词过长', 400);
    invariant(!query.status || ['DRAFT','ACTIVE','ARCHIVED'].includes(query.status), 'QUERY_INVALID', '档案状态筛选无效', 400);
    invariant(!query.workOrigin || ['ONCE','EXTERNAL','UNKNOWN'].includes(query.workOrigin), 'QUERY_INVALID', '作品归属筛选无效', 400);
    invariant(!query.actualProject || query.actualProject === 'true', 'QUERY_INVALID', '实际项目筛选无效', 400);
    let verifiedDays: number | null = null;
    if (query.verifiedWithinDays !== undefined) {
      verifiedDays = Number(query.verifiedWithinDays);
      invariant(Number.isSafeInteger(verifiedDays) && verifiedDays >= 1 && verifiedDays <= 3650, 'QUERY_INVALID', '核验时效必须是 1 到 3650 天', 400);
      invariant(DIRECT.some(([param]) => !!query[param]), 'QUERY_INVALID', '核验时效必须与角色、城市、语言或技能条件一起使用', 400);
    }

    const [people, visibility, sources, evidence, works, credits, projects, participants] = await Promise.all([
      this.talent.visiblePeople(tx, actor), loadVisibility(tx, actor, this.clock),
      tx.find('sources', { workspaceId: actor.workspaceId }), tx.find('evidence', { workspaceId: actor.workspaceId }),
      tx.find('works', { workspaceId: actor.workspaceId }), tx.find('workCredits', { workspaceId: actor.workspaceId }),
      tx.find('projects', { workspaceId: actor.workspaceId }), tx.find('projectParticipants', { workspaceId: actor.workspaceId })
    ]);
    const sourceById = new Map(sources.map(s => [s.id, s]));
    const visibleWorks = new Map(works.filter(w => visibility.scopeVisible(w.scopeId) && visibility.sourceVisible(w.sourceId)).map(w => [w.id, w]));
    const visibleProjects = new Map(projects.filter(p => visibility.scopeVisible(p.scopeId) && visibility.sourceVisible(p.sourceId)).map(p => [p.id, p]));
    const evidenceByPerson = new Map<string, typeof evidence>();
    for (const row of evidence) { const rows = evidenceByPerson.get(row.personId) ?? []; rows.push(row); evidenceByPerson.set(row.personId, rows); }
    const creditsByPerson = new Map<string, typeof credits>();
    for (const row of credits) { const rows = creditsByPerson.get(row.personId) ?? []; rows.push(row); creditsByPerson.set(row.personId, rows); }
    const participantsByPerson = new Map<string, typeof participants>();
    for (const row of participants) { const rows = participantsByPerson.get(row.personId) ?? []; rows.push(row); participantsByPerson.set(row.personId, rows); }
    const cutoff = verifiedDays === null ? null : this.clock.now().getTime() - verifiedDays * 86400000;
    const verify = (person: Person, field: EvidenceField): Verification => {
      let latest: string | null = null;
      for (const row of evidenceByPerson.get(person.id) ?? []) {
        if (row.fieldPath !== field) continue;
        const source = sourceById.get(row.sourceId);
        if (!source || !visibility.sourceVisible(source.id) || row.sourceRevision !== source.revision || row.valueDigest !== digest(valueFor(person, field))) continue;
        if (!latest || row.reviewedAt > latest) latest = row.reviewedAt;
      }
      if (!latest) return { state: 'NONE', reviewedAt: null };
      const reviewed = Date.parse(latest);
      if (!Number.isFinite(reviewed)) return { state: 'NONE', reviewedAt: null };
      if (cutoff !== null && reviewed < cutoff) return { state: 'OLD', reviewedAt: latest };
      return { state: 'CURRENT', reviewedAt: latest };
    };

    const q = lower(query.q ?? ''), workQ = lower(query.workQ ?? '');
    const out: Record<string, unknown>[] = [];
    for (const person of people) {
      if (q && ![person.displayName, ...person.aliases].some(v => lower(v).includes(q))) continue;
      if (query.status && person.status !== query.status) continue;
      const direct = [] as Array<{ field: DirectParam; value: string; verification: Verification }>;
      let directOk = true;
      for (const [param, field] of DIRECT) {
        const value = query[param]; if (!value) continue;
        if (!matchesDirect(person, param, value)) { directOk = false; break; }
        const verification = verify(person, field);
        if (verifiedDays !== null && verification.state !== 'CURRENT') { directOk = false; break; }
        direct.push({ field: param, value, verification });
      }
      if (!directOk) continue;

      // H1 handoff grants only the basic profile. It must not expose relationship facts.
      const native = visibility.personVisible(person);
      const workMatches = [] as Array<{ id: string; title: string; origin: string; roleCodes: string[] }>;
      if (native) {
        const grouped = new Map<string, string[]>();
        for (const credit of creditsByPerson.get(person.id) ?? []) {
          const work = visibleWorks.get(credit.workId); if (!work) continue;
          if (query.workOrigin && work.origin !== query.workOrigin) continue;
          if (workQ && !lower(work.title + '\n' + work.description).includes(workQ)) continue;
          const roles = grouped.get(work.id) ?? []; if (!roles.includes(credit.roleCode)) roles.push(credit.roleCode); grouped.set(work.id, roles);
        }
        for (const [id, roleCodes] of grouped) { const w = visibleWorks.get(id)!; workMatches.push({ id, title: w.title, origin: w.origin, roleCodes: roleCodes.sort() }); }
        workMatches.sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
      }
      if ((query.workQ || query.workOrigin) && workMatches.length === 0) continue;

      const actual = [] as Array<{ id: string; title: string; roleCodes: string[] }>;
      if (native) {
        const grouped = new Map<string, string[]>();
        for (const part of participantsByPerson.get(person.id) ?? []) {
          if (part.state !== 'ACTUAL') continue;
          const project = visibleProjects.get(part.projectId); if (!project) continue;
          const roles = grouped.get(project.id) ?? []; if (!roles.includes(part.roleCode)) roles.push(part.roleCode); grouped.set(project.id, roles);
        }
        for (const [id, roleCodes] of grouped) { const p = visibleProjects.get(id)!; actual.push({ id, title: p.title, roleCodes: roleCodes.sort() }); }
        actual.sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
      }
      if (query.actualProject === 'true' && actual.length === 0) continue;

      out.push({ id: person.id, displayName: person.displayName, aliases: person.aliases, roles: person.roles, cityCode: person.cityCode,
        languageCodes: person.languageCodes, skillCodes: person.skillCodes, heightCm: person.heightCm, intro: person.intro, status: person.status,
        sourceId: person.sourceId, scopeId: person.scopeId, maintainerId: person.maintainerId, revision: person.revision, createdAt: person.createdAt, updatedAt: person.updatedAt,
        match: { direct, actualProjectCount: actual.length, actualProjects: actual.slice(0, 3), visibleWorkCount: native ? new Set((creditsByPerson.get(person.id) ?? []).map(c => c.workId).filter(id => visibleWorks.has(id))).size : 0,
          matchedWorks: (query.workQ || query.workOrigin) ? workMatches.slice(0, 3) : [],
          unknownFields: [...(person.cityCode ? [] : ['cityCode']), ...(person.languageCodes.length ? [] : ['languageCodes']), ...(person.skillCodes.length ? [] : ['skillCodes'])] } });
    }
    out.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))||String(a.id).localeCompare(String(b.id)));
    const result = page(out, query, keys);
    return { ...result, semantics: { sort: 'UPDATED_DESC', scoring: false, actualProject: 'VISIBLE_RECORDED_ACTUAL_ONLY', unsupported: ['availability','budget','nationality'] } };
  }
}
