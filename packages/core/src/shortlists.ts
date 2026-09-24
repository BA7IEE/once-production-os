import type { Actor, Clock } from './model.ts';
import type { Tx } from './store.ts';
import type { Shortlist } from './shortlist-model.ts';
import { SHORTLIST_LIMITS as L } from './shortlist-model.ts';
import { ShortlistSchemas as S } from './shortlist-validation.ts';
import { shortlistFor, shortlistHeader } from './shortlist-policy.ts';
import { projectFor, workFor, visibleOrNull, workHeader } from './production-policy.ts';
import { sourceFor, personFor, requirePermission } from './policy.ts';
import { base, cas, page, patchDefined, touch, workspaceRow } from './helpers.ts';
import { invariant, missing } from './errors.ts';

export class Shortlists {
  clock: Clock;
  constructor(clock: Clock) { this.clock = clock; }

  async create(tx: Tx, actor: Actor, input: unknown) {
    requirePermission(actor, 'records.write');
    const d = S.create.parse(input), project = await projectFor(tx, actor, d.projectId, this.clock);
    const row: Shortlist = { ...base(actor.workspaceId, this.clock), projectId: project.id, maintainerId: actor.membershipId, title: d.title.trim(), brief: d.brief ?? '', status: 'DRAFT' };
    invariant(row.title.length > 0, 'TITLE_REQUIRED', '候选清单标题不能为空', 422);
    await tx.insert('shortlists', row);
    return row;
  }

  async list(tx: Tx, actor: Actor, query: Record<string, string>) {
    requirePermission(actor, 'records.read');
    page([], query, ['q', 'status', 'projectId']);
    invariant((query.q?.length ?? 0) <= 160 && (!query.status || ['DRAFT','ACTIVE','ARCHIVED'].includes(query.status)), 'QUERY_INVALID', '候选清单筛选条件不正确', 400);
    const rows = [];
    for (const row of await tx.find('shortlists', { workspaceId: actor.workspaceId })) {
      if (query.q && !row.title.toLocaleLowerCase().includes(query.q.toLocaleLowerCase())) continue;
      if (query.status && row.status !== query.status) continue;
      if (query.projectId && row.projectId !== query.projectId) continue;
      if (await visibleOrNull(() => shortlistFor(tx, actor, row.id, this.clock))) rows.push(shortlistHeader(row));
    }
    return page(rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id)), query, ['q','status','projectId']);
  }

  async get(tx: Tx, actor: Actor, id: string) {
    requirePermission(actor, 'records.read');
    const row = await shortlistFor(tx, actor, id, this.clock), project = await projectFor(tx, actor, row.projectId, this.clock);
    const people = [];
    for (const e of (await tx.find('shortlistPeople', { workspaceId: actor.workspaceId, shortlistId: id })).sort((a,b)=>a.position-b.position)) {
      const person = await visibleOrNull(() => personFor(tx, actor, e.personId, this.clock));
      if (!person) { people.push({ id:e.id, position:e.position, person:null, groupLabel:null, state:null, note:null, changedSinceAdded:null }); continue; }
      const source = await sourceFor(tx, actor, person.sourceId, this.clock);
      people.push({ id:e.id, position:e.position, person:{ id:person.id, displayName:person.displayName, roles:person.roles, cityCode:person.cityCode, revision:person.revision }, groupLabel:e.groupLabel, state:e.state, note:e.note,
        changedSinceAdded: person.revision !== e.addedPersonRevision || person.protectionEpoch !== e.addedPersonEpoch || source.revision !== e.addedSourceRevision || source.protectionEpoch !== e.addedSourceEpoch });
    }
    const works = [];
    for (const e of (await tx.find('shortlistWorks', { workspaceId: actor.workspaceId, shortlistId: id })).sort((a,b)=>a.position-b.position)) {
      const work = await visibleOrNull(() => workFor(tx, actor, e.workId, this.clock));
      if (!work) { works.push({ id:e.id, position:e.position, work:null, note:null, changedSinceAdded:null }); continue; }
      const source = await sourceFor(tx, actor, work.sourceId, this.clock);
      works.push({ id:e.id, position:e.position, work:workHeader(work), note:e.note,
        changedSinceAdded: work.revision !== e.addedWorkRevision || source.revision !== e.addedSourceRevision || source.protectionEpoch !== e.addedSourceEpoch });
    }
    return { ...shortlistHeader(row), maintainerId: row.maintainerId, project: { id: project.id, title: project.title, status: project.status }, people, works,
      canEdit: actor.permissions.includes('records.write') && row.status !== 'ARCHIVED' };
  }

  async update(tx: Tx, actor: Actor, id: string, input: unknown) {
    requirePermission(actor, 'records.write');
    const d = S.patch.parse(input), row = await shortlistFor(tx, actor, id, this.clock);
    cas(row, d.expectedRevision);
    if (row.status === 'ARCHIVED') invariant(d.status === 'DRAFT' && Object.keys(d).length === 2, 'RECORD_ARCHIVED', '归档候选清单只能单独恢复为草稿', 409);
    const { expectedRevision:_, ...patch } = d, next = patchDefined(touch(row, this.clock), patch);
    next.title = next.title.trim();
    invariant(next.title.length > 0, 'TITLE_REQUIRED', '候选清单标题不能为空', 422);
    await tx.replace('shortlists', next);
    return next;
  }

  private async edit(tx: Tx, actor: Actor, id: string, expected: number) {
    requirePermission(actor, 'records.write');
    const row = await shortlistFor(tx, actor, id, this.clock); cas(row, expected);
    invariant(row.status !== 'ARCHIVED', 'RECORD_ARCHIVED', '请先恢复候选清单再修改', 409);
    return row;
  }
  private async bump(tx: Tx, row: Shortlist) { const next=touch(row,this.clock); await tx.replace('shortlists',next); return next; }

  async addPerson(tx: Tx, actor: Actor, id: string, input: unknown) {
    const d=S.personAdd.parse(input), row=await this.edit(tx,actor,id,d.expectedRevision), person=await personFor(tx,actor,d.personId,this.clock), source=await sourceFor(tx,actor,person.sourceId,this.clock);
    const all=await tx.find('shortlistPeople',{workspaceId:actor.workspaceId,shortlistId:id});
    invariant(all.length<L.people,'SHORTLIST_PERSON_LIMIT','单个候选清单最多100人',422);
    invariant(!all.some(x=>x.personId===person.id),'DUPLICATE_LINK','此人才已在候选清单中',409);
    await tx.insert('shortlistPeople',{...base(actor.workspaceId,this.clock),shortlistId:id,personId:person.id,position:all.length,groupLabel:d.groupLabel??'',state:d.state??'CANDIDATE',note:d.note??'',addedPersonRevision:person.revision,addedPersonEpoch:person.protectionEpoch,addedSourceRevision:source.revision,addedSourceEpoch:source.protectionEpoch});
    return this.bump(tx,row);
  }
  async updatePerson(tx: Tx, actor: Actor, id: string, input: unknown) {
    const d=S.personUpdate.parse(input), row=await this.edit(tx,actor,id,d.expectedRevision), e=await workspaceRow(tx,'shortlistPeople',d.entryId,actor.workspaceId);
    if(!e||e.shortlistId!==id) missing();
    await personFor(tx,actor,e.personId,this.clock);
    const next=patchDefined(touch(e,this.clock),{groupLabel:d.groupLabel,state:d.state,note:d.note}); await tx.replace('shortlistPeople',next); return this.bump(tx,row);
  }
  async removePerson(tx: Tx, actor: Actor, id: string, input: unknown) {
    const d=S.personRemove.parse(input), row=await this.edit(tx,actor,id,d.expectedRevision), e=await workspaceRow(tx,'shortlistPeople',d.entryId,actor.workspaceId);
    if(!e||e.shortlistId!==id) missing();
    await tx.remove('shortlistPeople',e.id);
    const rest=(await tx.find('shortlistPeople',{workspaceId:actor.workspaceId,shortlistId:id})).sort((a,b)=>a.position-b.position);
    for(let i=0;i<rest.length;i++) if(rest[i]!.position!==i) await tx.replace('shortlistPeople',{...touch(rest[i]!,this.clock),position:i});
    return this.bump(tx,row);
  }
  async reorderPeople(tx: Tx, actor: Actor, id: string, input: unknown) {
    const d=S.personOrder.parse(input), row=await this.edit(tx,actor,id,d.expectedRevision), all=await tx.find('shortlistPeople',{workspaceId:actor.workspaceId,shortlistId:id});
    invariant(d.entryIds.length===all.length&&new Set(d.entryIds).size===all.length&&d.entryIds.every(x=>all.some(e=>e.id===x)),'ORDER_MISMATCH','排序必须完整包含当前候选人才，请刷新',409);
    for(let i=0;i<d.entryIds.length;i++){const e=all.find(x=>x.id===d.entryIds[i])!; if(e.position!==i) await tx.replace('shortlistPeople',{...touch(e,this.clock),position:i});}
    return this.bump(tx,row);
  }
  async addWork(tx: Tx, actor: Actor, id: string, input: unknown) {
    const d=S.workAdd.parse(input), row=await this.edit(tx,actor,id,d.expectedRevision), work=await workFor(tx,actor,d.workId,this.clock), source=await sourceFor(tx,actor,work.sourceId,this.clock);
    const all=await tx.find('shortlistWorks',{workspaceId:actor.workspaceId,shortlistId:id});
    invariant(all.length<L.works,'SHORTLIST_WORK_LIMIT','单个候选清单最多30个参考作品',422);
    invariant(!all.some(x=>x.workId===work.id),'DUPLICATE_LINK','此作品已在候选清单中',409);
    await tx.insert('shortlistWorks',{...base(actor.workspaceId,this.clock),shortlistId:id,workId:work.id,position:all.length,note:d.note??'',addedWorkRevision:work.revision,addedSourceRevision:source.revision,addedSourceEpoch:source.protectionEpoch});
    return this.bump(tx,row);
  }
  async removeWork(tx: Tx, actor: Actor, id: string, input: unknown) {
    const d=S.workRemove.parse(input), row=await this.edit(tx,actor,id,d.expectedRevision), e=await workspaceRow(tx,'shortlistWorks',d.entryId,actor.workspaceId);
    if(!e||e.shortlistId!==id) missing();
    await tx.remove('shortlistWorks',e.id);
    const rest=(await tx.find('shortlistWorks',{workspaceId:actor.workspaceId,shortlistId:id})).sort((a,b)=>a.position-b.position);
    for(let i=0;i<rest.length;i++) if(rest[i]!.position!==i) await tx.replace('shortlistWorks',{...touch(rest[i]!,this.clock),position:i});
    return this.bump(tx,row);
  }
  async reorderWorks(tx: Tx, actor: Actor, id: string, input: unknown) {
    const d=S.workOrder.parse(input), row=await this.edit(tx,actor,id,d.expectedRevision), all=await tx.find('shortlistWorks',{workspaceId:actor.workspaceId,shortlistId:id});
    invariant(d.entryIds.length===all.length&&new Set(d.entryIds).size===all.length&&d.entryIds.every(x=>all.some(e=>e.id===x)),'ORDER_MISMATCH','排序必须完整包含当前参考作品，请刷新',409);
    for(let i=0;i<d.entryIds.length;i++){const e=all.find(x=>x.id===d.entryIds[i])!; if(e.position!==i) await tx.replace('shortlistWorks',{...touch(e,this.clock),position:i});}
    return this.bump(tx,row);
  }
}
