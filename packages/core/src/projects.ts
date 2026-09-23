import type { Actor, Clock } from './model.ts';
import type { Tx } from './store.ts';
import type { Project } from './production-model.ts';
import { PRODUCTION_LIMITS as L } from './production-model.ts';
import { ProductionSchemas as S } from './production-validation.ts';
import { workFor, projectFor, visibleOrNull, creditPerson, checkRole, editable, workHeader, projectHeader } from './production-policy.ts';
import { base, cas, page, patchDefined, touch, workspaceRow } from './helpers.ts';
import { invariant, missing } from './errors.ts';
import { requirePermission, sourceFor } from './policy.ts';
import { uuid } from './validation.ts';
import type { Talent } from './talent.ts';
/** Project facts only: never creates bookings, contracts, invoices or Work credits. */
export class Projects {
    clock: Clock;
    talent: Talent;
    constructor(clock: Clock, talent: Talent) { this.clock = clock; this.talent = talent; }
    async create(tx: Tx, actor: Actor, input: unknown) {
        requirePermission(actor, 'records.write');
        const d = S.projectCreate.parse(input);
        invariant(!!d.sourceId !== !!d.inlineSource, 'SOURCE_REQUIRED', '请选择来源或填写内联来源，不能同时提供', 400);
        const s = d.sourceId ? await sourceFor(tx, actor, d.sourceId, this.clock) : await this.talent.createSource(tx, actor, d.inlineSource);
        invariant(d.title.trim().length > 0, 'TITLE_REQUIRED', '项目标题不能为空', 422);
        const p: Project = { ...base(actor.workspaceId, this.clock), sourceId: s.id, scopeId: s.scopeId, maintainerId: actor.membershipId,
            title: d.title.trim(), brief: d.brief ?? '', locationNote: d.locationNote ?? '', dateNote: d.dateNote ?? '', reviewNote: '', status: 'DRAFT' };
        await tx.insert('projects', p);
        return p;
    }
    async update(tx: Tx, actor: Actor, id: string, input: unknown) {
        requirePermission(actor, 'records.write');
        const d = S.projectPatch.parse(input), p = await projectFor(tx, actor, id, this.clock);
        cas(p, d.expectedRevision);
        if (p.status === 'ARCHIVED')
            invariant(d.status === 'DRAFT' && Object.keys(d).length === 2, 'RECORD_ARCHIVED', '归档项目只能单独恢复为草稿', 409);
        const { expectedRevision: _, ...patch } = d, n = patchDefined(touch(p, this.clock), patch);
        n.title = n.title.trim();
        invariant(n.title.length > 0, 'TITLE_REQUIRED', '项目标题不能为空', 422);
        await tx.replace('projects', n);
        return n;
    }
    async list(tx: Tx, actor: Actor, query: Record<string, string>) {
        requirePermission(actor, 'records.read');
        page([], query, ['q', 'status']);
        invariant((query.q?.length ?? 0) <= 160 && (!query.status || ['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED'].includes(query.status)), 'QUERY_INVALID', '项目筛选条件不正确', 400);
        const rows = [];
        for (const p of await tx.find('projects', { workspaceId: actor.workspaceId })) {
            if (query.q && !p.title.toLocaleLowerCase().includes(query.q.toLocaleLowerCase()) || query.status && p.status !== query.status)
                continue;
            if (await visibleOrNull(() => projectFor(tx, actor, p.id, this.clock)))
                rows.push(projectHeader(p));
        }
        return page(rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)), query, ['q', 'status']);
    }
    async get(tx: Tx, actor: Actor, id: string) {
        requirePermission(actor, 'records.read');
        const p = await projectFor(tx, actor, id, this.clock), participants = [], works = [];
        for (const e of await tx.find('projectParticipants', { workspaceId: actor.workspaceId, projectId: id })) {
            const person = await visibleOrNull(() => creditPerson(tx, actor, e.personId, this.clock));
            participants.push({ id: e.id, person, roleCode: person ? e.roleCode : null, state: person ? e.state : null, note: person ? e.note : null });
        }
        for (const e of await tx.find('projectWorks', { workspaceId: actor.workspaceId, projectId: id })) {
            const w = await visibleOrNull(() => workFor(tx, actor, e.workId, this.clock));
            works.push({ id: e.id, work: w ? workHeader(w) : null, relation: w ? e.relation : null });
        }
        return { ...projectHeader(p), sourceId: p.sourceId, scopeId: p.scopeId, maintainerId: p.maintainerId, brief: p.brief, locationNote: p.locationNote, dateNote: p.dateNote, reviewNote: p.reviewNote,
            participants: participants.sort((a, b) => a.id.localeCompare(b.id)), works: works.sort((a, b) => a.id.localeCompare(b.id)), canEdit: actor.permissions.includes('records.write') && p.status !== 'ARCHIVED' };
    }
    private async edit(tx: Tx, actor: Actor, id: string, expected: number) { requirePermission(actor, 'records.write'); const p = await projectFor(tx, actor, id, this.clock); cas(p, expected); editable(p); return p; }
    private async bump(tx: Tx, p: Project) { const n = touch(p, this.clock); await tx.replace('projects', n); return n; }
    private actual(state: string, note: string) { invariant(state !== 'ACTUAL' || note.trim().length >= 4, 'ACTUAL_BASIS_REQUIRED', '实际参与需写明发生的工作或依据；提名不等于参与', 422); }
    async addParticipant(tx: Tx, actor: Actor, id: string, input: unknown) {
        const d = S.participant.parse(input), p = await this.edit(tx, actor, id, d.expectedRevision);
        this.actual(d.state, d.note);
        await creditPerson(tx, actor, d.personId, this.clock);
        await checkRole(tx, actor, d.roleCode);
        const all = await tx.find('projectParticipants', { workspaceId: actor.workspaceId, projectId: id });
        invariant(all.length < L.participants, 'PARTICIPANT_LIMIT', '单个项目最多50条参与记录', 422);
        invariant(!all.some(e => e.personId === d.personId && e.roleCode === d.roleCode), 'DUPLICATE_LINK', '此人员角色已在项目中', 409);
        await tx.insert('projectParticipants', { ...base(actor.workspaceId, this.clock), projectId: id, personId: d.personId, roleCode: d.roleCode, state: d.state, note: d.note });
        return this.bump(tx, p);
    }
    async updateParticipant(tx: Tx, actor: Actor, id: string, input: unknown) {
        const d = S.participantPatch.parse(input), p = await this.edit(tx, actor, id, d.expectedRevision), e = await workspaceRow(tx, 'projectParticipants', d.entryId, actor.workspaceId);
        if (!e || e.projectId !== id)
            missing();
        await creditPerson(tx, actor, e.personId, this.clock);
        this.actual(d.state, d.note);
        // Existing disabled role codes remain readable and correctable. No new role is assigned here.
        await tx.replace('projectParticipants', { ...touch(e, this.clock), state: d.state, note: d.note });
        return this.bump(tx, p);
    }
    async removeParticipant(tx: Tx, actor: Actor, id: string, input: unknown) {
        const d = S.remove.parse(input), p = await this.edit(tx, actor, id, d.expectedRevision), e = await workspaceRow(tx, 'projectParticipants', d.entryId, actor.workspaceId);
        if (!e || e.projectId !== id)
            missing();
        await tx.remove('projectParticipants', e.id);
        return this.bump(tx, p);
    }
    async linkWork(tx: Tx, actor: Actor, id: string, input: unknown) {
        const d = S.projectWork.parse(input), p = await this.edit(tx, actor, id, d.expectedRevision);
        await workFor(tx, actor, d.workId, this.clock);
        const all = await tx.find('projectWorks', { workspaceId: actor.workspaceId, projectId: id }), old = all.find(e => e.workId === d.workId);
        if (old)
            await tx.replace('projectWorks', { ...touch(old, this.clock), relation: d.relation });
        else {
            invariant(all.length < L.works, 'PROJECT_WORK_LIMIT', '单个项目最多30个作品关系', 422);
            await tx.insert('projectWorks', { ...base(actor.workspaceId, this.clock), projectId: id, workId: d.workId, relation: d.relation });
        }
        // Neither REFERENCE nor DELIVERABLE rewrites origin or invents ACTUAL participants.
        return this.bump(tx, p);
    }
    async removeWork(tx: Tx, actor: Actor, id: string, input: unknown) {
        const d = S.remove.parse(input), p = await this.edit(tx, actor, id, d.expectedRevision), e = await workspaceRow(tx, 'projectWorks', d.entryId, actor.workspaceId);
        if (!e || e.projectId !== id)
            missing();
        await tx.remove('projectWorks', e.id);
        return this.bump(tx, p);
    }
    async personProduction(tx: Tx, actor: Actor, id: string, query: Record<string, string>) {
        requirePermission(actor, 'records.read');
        uuid.parse(id);
        page([], query);
        await creditPerson(tx, actor, id, this.clock);
        const credits = await tx.find('workCredits', { workspaceId: actor.workspaceId, personId: id }), participations = await tx.find('projectParticipants', { workspaceId: actor.workspaceId, personId: id });
        const works = [], projects = [];
        for (const workId of new Set(credits.map(e => e.workId))) {
            const w = await visibleOrNull(() => workFor(tx, actor, workId, this.clock));
            if (w)
                works.push({ ...workHeader(w), roles: credits.filter(e => e.workId === workId).map(e => e.roleCode) });
        }
        for (const projectId of new Set(participations.map(e => e.projectId))) {
            const p = await visibleOrNull(() => projectFor(tx, actor, projectId, this.clock));
            if (p)
                projects.push({ ...projectHeader(p), participations: participations.filter(e => e.projectId === projectId).map(e => ({ roleCode: e.roleCode, state: e.state, note: e.note })) });
        }
        const order = (a: {
            updatedAt: string;
            id: string;
        }, b: {
            updatedAt: string;
            id: string;
        }) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
        return { works: page(works.sort(order), query), projects: page(projects.sort(order), query), actualProjectCount: projects.filter(p => p.participations.some(e => e.state === 'ACTUAL')).length };
    }
}
