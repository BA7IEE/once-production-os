import {periodCurrent} from './talent-v2-graph.ts';
import {exactCreditCurrent,validateCaseDate} from './talent-work-cases.ts';
import {sourceAllowsInternalAuthoring} from './talent-maintenance-policy.ts';
import type { Actor, Clock } from './model.ts';
import type { Tx } from './store.ts';
import type { Work } from './production-model.ts';
import { PRODUCTION_LIMITS as L } from './production-model.ts';
import { ProductionSchemas as S } from './production-validation.ts';
import { workFor, projectFor, visibleOrNull, readyAsset, creditPerson, checkRole, editable, workHeader, projectHeader } from './production-policy.ts';
import { base, cas, page, patchDefined, touch, workspaceRow } from './helpers.ts';
import { invariant, missing } from './errors.ts';
import { requirePermission, sourceFor } from './policy.ts';
import type { Talent } from './talent.ts';
import {loadTalentGraph,td2PersonFor} from './talent-v2-graph.ts';
import {collectionAssetFor} from './media-collections.ts';
/** Owns Works and their ordered media and credits. It never writes Project participation. */
export class Portfolio {
    clock: Clock;
    talent: Talent;
    constructor(clock: Clock, talent: Talent) { this.clock = clock; this.talent = talent; }
    private async validateFacts(tx: Tx, workspaceId: string, data: { industryCode?: string | null; workTypeCodes?: string[] }, previous?: Work) {
        if (data.industryCode)
            await this.talent.validateCatalog(tx, workspaceId, 'industry', [data.industryCode], previous?.industryCode ? [previous.industryCode] : []);
        if (data.workTypeCodes)
            await this.talent.validateCatalog(tx, workspaceId, 'workType', data.workTypeCodes, previous?.workTypeCodes ?? []);
    }
    async create(tx: Tx, actor: Actor, input: unknown) {
        requirePermission(actor, 'records.write');
        const d = S.workCreate.parse(input);
        invariant(!!d.sourceId !== !!d.inlineSource, 'SOURCE_REQUIRED', '请选择来源或填写内联来源，不能同时提供', 400);
        const s = d.sourceId ? await sourceFor(tx, actor, d.sourceId, this.clock) : await this.talent.createSource(tx, actor, d.inlineSource);invariant(sourceAllowsInternalAuthoring(s),'TALENT_BASIS_SCOPED','本人文字来源不能作为新作品依据，请使用独立来源',409);
        await this.validateFacts(tx, actor.workspaceId, d);
        const w: Work = { ...base(actor.workspaceId, this.clock), sourceId: s.id, scopeId: s.scopeId, maintainerId: actor.membershipId,
            caseDate:d.caseDate??null,datePrecision:d.datePrecision??'UNKNOWN',location:d.location??'',brandDisplayName:d.brandDisplayName??'',title: d.title.trim(), description: d.description ?? '', industryCode: d.industryCode ?? null, workTypeCodes: d.workTypeCodes ?? [], origin: d.origin ?? 'UNKNOWN', originNote: d.originNote ?? '', status: 'DRAFT', coverEntryId: null };
        this.checkHeader(w);
        await tx.insert('works', w);
        return w;
    }
    /** One internal command records a case, its exact role credit and ordered materials. */
    async createPersonCase(tx:Tx,actor:Actor,personId:string,input:unknown){
        requirePermission(actor,'records.write');requirePermission(actor,'assets.read');
        const d=S.personCase.parse(input),p=await td2PersonFor(tx,actor,personId),g=await loadTalentGraph(tx,actor,this.clock,[personId]);cas(p,d.expectedPersonRevision);
        invariant(g.identityReadable(p)&&p.status!=='ARCHIVED','PERSON_UNAVAILABLE','人才当前不能用于新增作品',409);
        const role=g.fact('personRoles',d.personRoleId);if(!role||role.personId!==p.id||!g.usable('personRoles',role))missing();cas(role,d.expectedRoleRevision);await checkRole(tx,actor,String(role.roleCode));
        const source=await sourceFor(tx,actor,d.sourceId,this.clock);cas(source,d.sourceRevision);
        invariant(d.assetIds.length>0&&new Set(d.assetIds).size===d.assetIds.length,'WORK_ITEMS_REQUIRED','请明确选择不重复的作品素材',422);
        invariant(!d.coverAssetId||d.assetIds.includes(d.coverAssetId),'WORK_COVER_INVALID','封面必须在本次素材中',422);
        for(const id of d.assetIds){const asset=await collectionAssetFor(tx,actor,{personId,personRoleId:role.id,collectionTypeCode:'PORTFOLIO'},id,this.clock);invariant(asset.mime.startsWith('image/')||asset.mime==='video/mp4','WORK_ASSET_INVALID','作品案例只使用图片或视频',422);}
        let w=await this.create(tx,actor,{sourceId:source.id,title:d.title,description:d.description,caseDate:d.caseDate,datePrecision:d.datePrecision,location:d.location,brandDisplayName:d.brandDisplayName,industryCode:d.industryCode,workTypeCodes:d.workTypeCodes,origin:d.origin,originNote:d.originNote});
        await tx.insert('workCredits',{...base(actor.workspaceId,this.clock),workId:w.id,personId,personRoleId:role.id,sourceId:source.id,roleCode:String(role.roleCode),note:d.creditNote});
        for(const assetId of d.assetIds)w=await this.addAsset(tx,actor,w.id,{expectedRevision:w.revision,assetId});
        const entries=await tx.find('workAssets',{workspaceId:actor.workspaceId,workId:w.id});
        w=await this.reorder(tx,actor,w.id,{expectedRevision:w.revision,entryIds:entries.sort((a,b)=>a.position-b.position).map(e=>e.id),coverEntryId:entries.find(e=>e.assetId===d.coverAssetId)?.id??null});
        return this.update(tx,actor,w.id,{expectedRevision:w.revision,status:'ACTIVE'});
    }
    private checkHeader(w: Work) {
        validateCaseDate({caseDate:w.caseDate??null,datePrecision:w.datePrecision??'UNKNOWN'});
        invariant(w.title.length > 0, 'TITLE_REQUIRED', '作品标题不能为空', 422);
        invariant(w.origin !== 'ONCE' || w.originNote.trim().length >= 4, 'ORIGIN_BASIS_REQUIRED', '标记 ONCE 制作需说明真实制作依据；不会自动核验', 422);
    }
    async update(tx: Tx, actor: Actor, id: string, input: unknown) {
        requirePermission(actor, 'records.write');
        const d = S.workPatch.parse(input), w = await workFor(tx, actor, id, this.clock);
        cas(w, d.expectedRevision);
        if (w.status === 'ARCHIVED')
            invariant(d.status === 'DRAFT' && Object.keys(d).length === 2, 'RECORD_ARCHIVED', '归档作品只能单独恢复为草稿', 409);
        await this.validateFacts(tx, actor.workspaceId, d, w);
        const { expectedRevision: _, ...patch } = d;
        const n = patchDefined(touch(w, this.clock), patch);
        n.title = n.title.trim();
        this.checkHeader(n);
        if (n.status === 'ACTIVE') {
            requirePermission(actor, 'assets.read');
            const entries = await tx.find('workAssets', { workspaceId: actor.workspaceId, workId: id });
            invariant(entries.length > 0 && (!n.coverEntryId||entries.some(e => e.id === n.coverEntryId)), 'WORK_INCOMPLETE', '使用中作品至少需要一项素材；封面必须属于当前作品', 422);if(n.coverEntryId){const cover=await readyAsset(tx,actor,entries.find(e=>e.id===n.coverEntryId)!.assetId,this.clock);invariant(cover.mime.startsWith('image/'),'COVER_INVALID','封面须为图片',422);}
            for (const e of entries)
                await readyAsset(tx, actor, e.assetId, this.clock);
        }
        await tx.replace('works', n);
        return n;
    }
    async personCases(tx:Tx,actor:Actor,personId:string){
        requirePermission(actor,'records.read');await creditPerson(tx,actor,personId,this.clock);const items=[];
        for(const c of await tx.find('workCredits',{workspaceId:actor.workspaceId,personId})){
            if(!await exactCreditCurrent(tx,c,this.clock))continue;
            const w=await visibleOrNull(async()=>{if(c.sourceId)await sourceFor(tx,actor,c.sourceId,this.clock);return workFor(tx,actor,c.workId,this.clock);});if(!w||w.status!=='ACTIVE')continue;
            const view=await this.get(tx,actor,w.id),media=view.items.filter(i=>i.asset);
            items.push({...workHeader(w),description:w.description,credit:{roleCode:c.roleCode,personRoleId:c.personRoleId??null,note:c.note},coverAssetId:media.find(i=>i.id===w.coverEntryId&&i.asset?.mime.startsWith('image/'))?.asset?.id??null,items:media,sourceStatus:'当前可用'});
        }return {items};
    }
    async list(tx: Tx, actor: Actor, query: Record<string, string>) {
        requirePermission(actor, 'records.read');
        page([], query, ['q', 'origin', 'status', 'industryCode', 'workTypeCode']);
        invariant((query.q?.length ?? 0) <= 160 && (!query.origin || ['ONCE', 'EXTERNAL', 'UNKNOWN'].includes(query.origin)) && (!query.status || ['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(query.status)) && (!query.industryCode || /^[a-z0-9][a-z0-9_-]{0,59}$/.test(query.industryCode)) && (!query.workTypeCode || /^[a-z0-9][a-z0-9_-]{0,59}$/.test(query.workTypeCode)), 'QUERY_INVALID', '作品筛选条件不正确', 400);
        const rows = [];
        for (const w of await tx.find('works', { workspaceId: actor.workspaceId })) {
            if (query.q && !w.title.toLocaleLowerCase().includes(query.q.toLocaleLowerCase()))
                continue;
            if (query.origin && w.origin !== query.origin || query.status && w.status !== query.status || query.industryCode && w.industryCode !== query.industryCode || query.workTypeCode && !w.workTypeCodes.includes(query.workTypeCode))
                continue;
            if (await visibleOrNull(() => workFor(tx, actor, w.id, this.clock)))
                rows.push(workHeader(w));
        }
        return page(rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)), query, ['q', 'origin', 'status', 'industryCode', 'workTypeCode']);
    }
    async get(tx: Tx, actor: Actor, id: string) {
        requirePermission(actor, 'records.read');
        const w = await workFor(tx, actor, id, this.clock);
        const items = [];
        for (const e of (await tx.find('workAssets', { workspaceId: actor.workspaceId, workId: id })).sort((a, b) => a.position - b.position)) {
            const a = actor.permissions.includes('assets.read') ? await visibleOrNull(() => readyAsset(tx, actor, e.assetId, this.clock)) : null;
            items.push({ id: e.id, position: e.position, isCover: e.id === w.coverEntryId,
                asset: a ? { id: a.id, fileName: a.fileName, mime:a.mime, width: a.width, height: a.height, revision: a.revision } : null });
        }
        const credits = [];
        for (const c of await tx.find('workCredits', { workspaceId: actor.workspaceId, workId: id })) {
            const person = await exactCreditCurrent(tx,c,this.clock) ? await visibleOrNull(async () => {if(c.sourceId)await sourceFor(tx,actor,c.sourceId,this.clock);return creditPerson(tx, actor, c.personId, this.clock);}) : null;
            credits.push({ id: c.id, revision:person?c.revision:null, person, personRoleId:person?c.personRoleId??null:null, roleCode: person ? c.roleCode : null, note: person ? c.note : null });
        }
        const projects = [];
        for (const link of await tx.find('projectWorks', { workspaceId: actor.workspaceId, workId: id })) {
            const p = await visibleOrNull(() => projectFor(tx, actor, link.projectId, this.clock));
            if (p)
                projects.push({ ...projectHeader(p), relation: link.relation });
        }
        return { ...workHeader(w), sourceId: w.sourceId, scopeId: w.scopeId, maintainerId: w.maintainerId,
            description: w.description, industryCode: w.industryCode, workTypeCodes: w.workTypeCodes, originNote: w.originNote, items, credits: credits.sort((a, b) => a.id.localeCompare(b.id)), projects,
            canEdit: actor.permissions.includes('records.write') && w.status !== 'ARCHIVED' };
    }
    private async edit(tx: Tx, actor: Actor, id: string, expected: number) {
        requirePermission(actor, 'records.write');
        const w = await workFor(tx, actor, id, this.clock);
        cas(w, expected);
        editable(w);
        return w;
    }
    async addAsset(tx: Tx, actor: Actor, id: string, input: unknown) {
        const d = S.workAsset.parse(input), w = await this.edit(tx, actor, id, d.expectedRevision);
        requirePermission(actor, 'assets.read');
        const asset=await readyAsset(tx, actor, d.assetId, this.clock);
        const all = await tx.find('workAssets', { workspaceId: actor.workspaceId, workId: id });
        invariant(all.length < L.assets, 'WORK_ITEM_LIMIT', '单个作品最多30张图片', 422);
        invariant(!all.some(e => e.assetId === d.assetId), 'DUPLICATE_LINK', '这张图片已在作品中', 409);
        const e = { ...base(actor.workspaceId, this.clock), workId: id, assetId: d.assetId, position: all.length };
        await tx.insert('workAssets', e);
        const n = { ...touch(w, this.clock), coverEntryId: w.coverEntryId??(asset.mime.startsWith('image/')?e.id:null) };
        await tx.replace('works', n);
        return n;
    }
    async removeAsset(tx: Tx, actor: Actor, id: string, input: unknown) {
        const d = S.remove.parse(input), w = await this.edit(tx, actor, id, d.expectedRevision);
        const e = await workspaceRow(tx, 'workAssets', d.entryId, actor.workspaceId);
        if (!e || e.workId !== id)
            missing();
        const rest = (await tx.find('workAssets', { workspaceId: actor.workspaceId, workId: id })).filter(x => x.id !== e.id).sort((a, b) => a.position - b.position);
        // Cover is a deferred composite FK. Removing a local link never deletes the underlying Asset.
        const n = { ...touch(w, this.clock), coverEntryId: w.coverEntryId === e.id ? null : w.coverEntryId };
        if (rest.length === 0 && n.status === 'ACTIVE')
            n.status = 'DRAFT';
        await tx.replace('works', n);
        await tx.remove('workAssets', e.id);
        for (let i = 0; i < rest.length; i++)
            await tx.replace('workAssets', { ...touch(rest[i]!, this.clock), position: i });
        return n;
    }
    async reorder(tx: Tx, actor: Actor, id: string, input: unknown) {
        const d = S.order.parse(input), w = await this.edit(tx, actor, id, d.expectedRevision);
        const all = await tx.find('workAssets', { workspaceId: actor.workspaceId, workId: id });
        invariant(d.entryIds.length === all.length && new Set(d.entryIds).size === all.length && d.entryIds.every(x => all.some(e => e.id === x)), 'ORDER_MISMATCH', '排序必须完整包含本作品当前条目，请刷新', 409);
        invariant(d.coverEntryId === null || d.entryIds.includes(d.coverEntryId), 'COVER_INVALID', '封面必须属于本作品', 422);
        if (d.coverEntryId && d.coverEntryId !== w.coverEntryId) {
            requirePermission(actor, 'assets.read');
            const cover=await readyAsset(tx, actor, all.find(e => e.id === d.coverEntryId)!.assetId, this.clock);invariant(cover.mime.startsWith('image/'),'COVER_INVALID','封面须为图片',422);
        }
        for (let i = 0; i < d.entryIds.length; i++) {
            const e = all.find(e => e.id === d.entryIds[i])!;
            if (e.position !== i)
                await tx.replace('workAssets', { ...touch(e, this.clock), position: i });
        }
        const n = { ...touch(w, this.clock), coverEntryId: d.coverEntryId };
        await tx.replace('works', n);
        return n;
    }
    async addCredit(tx: Tx, actor: Actor, id: string, input: unknown) {
        const d = S.credit.parse(input), w = await this.edit(tx, actor, id, d.expectedRevision);
        await creditPerson(tx, actor, d.personId, this.clock);
        await checkRole(tx, actor, d.roleCode);
        const all = await tx.find('workCredits', { workspaceId: actor.workspaceId, workId: id });
        invariant(all.length < L.credits, 'CREDIT_LIMIT', '单个作品最多50条署名', 422);
        invariant(!all.some(c => c.personId === d.personId && c.roleCode === d.roleCode), 'DUPLICATE_LINK', '此人员角色已记录', 409);
        await tx.insert('workCredits', { ...base(actor.workspaceId, this.clock), workId: id, personId: d.personId, roleCode: d.roleCode, note: d.note });
        const n = touch(w, this.clock);
        await tx.replace('works', n);
        return n;
    }
    async upgradeCredit(tx:Tx,actor:Actor,id:string,input:unknown){
        requirePermission(actor,'sources.review');invariant(actor.actorKind!=='MACHINE','HUMAN_REVIEW_REQUIRED','旧署名升级须内部人员核对',403);
        const d=S.creditUpgrade.parse(input),w=await this.edit(tx,actor,id,d.expectedRevision),c=await workspaceRow(tx,'workCredits',d.creditId,actor.workspaceId);
        if(!c||c.workId!==w.id)missing();cas(c,d.expectedCreditRevision);invariant(!c.personRoleId&&!c.sourceId,'WORK_CREDIT_ALREADY_EXACT','署名已经绑定精确职业，不可重复升级',409);
        await creditPerson(tx,actor,c.personId,this.clock);const role=await workspaceRow(tx,'personRoles',d.personRoleId,actor.workspaceId);
        if(!role||role.personId!==c.personId)missing();cas(role,d.expectedRoleRevision);invariant(role.roleCode===c.roleCode&&role.status==='ACTIVE'&&periodCurrent(role as unknown as Record<string,unknown>,this.clock),'WORK_ROLE_INVALID','请核对同一人物的当前署名职业',409);await checkRole(tx,actor,String(role.roleCode));await sourceFor(tx,actor,role.sourceId,this.clock);
        const source=await sourceFor(tx,actor,d.sourceId,this.clock);cas(source,d.sourceRevision);invariant(sourceAllowsInternalAuthoring(source),'TALENT_BASIS_SCOPED','旧署名升级须使用独立内部来源',409);
        await tx.replace('workCredits',{...touch(c,this.clock),personRoleId:role.id,sourceId:source.id});const next=touch(w,this.clock);await tx.replace('works',next);return next;
    }
    async removeCredit(tx: Tx, actor: Actor, id: string, input: unknown) {
        const d = S.remove.parse(input), w = await this.edit(tx, actor, id, d.expectedRevision), c = await workspaceRow(tx, 'workCredits', d.entryId, actor.workspaceId);
        if (!c || c.workId !== id)
            missing();
        await tx.remove('workCredits', c.id);
        const n = touch(w, this.clock);
        await tx.replace('works', n);
        return n;
    }
}
