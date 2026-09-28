import {currentAiConfig,connectionRow} from './ai-connection.ts';
import {approvedAi} from './ai-operations.ts';
import type { Actor, Clock, Config, RequestMeta } from './model.ts';
import type { Tx, Store } from './store.ts';
import { base, cas, page, touch, workspaceRow } from './helpers.ts';
import { invariant, missing, AppError } from './errors.ts';
import { requirePermission, sourceFor, requireScope, permissionsFor } from './policy.ts';
import { AiSchemas as S } from './ai-validation.ts';
import type { AiTask, AiDependency } from './ai-business-model.ts';
import { AiLedger } from './ai-ledger.ts';
import { dispatchAi, type AiDispatchAdapter } from './ai-dispatch.ts';
import { localeTarget, LocaleTexts } from './locale.ts';
import { TalentV2 } from './talent-v2.ts';
import { Talent } from './talent.ts';
import { Portfolio } from './portfolio.ts';
import { digest } from './json.ts';
import { v } from './validation.ts';
import { searchTalentV2 } from './talent-v2-search.ts';
const human = (actor: Actor) => { invariant(actor.actorKind !== 'MACHINE', 'HUMAN_AI_REQUIRED', 'AI 任务需要成员本人确认', 403); requirePermission(actor, 'ai.use'); invariant(actor.role !== 'VIEWER', 'FORBIDDEN', '只读成员不能使用 AI', 403); };
const secretPattern = /(?:bearer\s+\S+|-----BEGIN .*PRIVATE KEY|\b1[3-9]\d{9}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:密码|口令|cookie|api[_ -]?key)\s*[:：=])/i;
export class AiBusiness {
    readonly clock: Clock;
    readonly config: Config;
    constructor(clock: Clock, config: Config) { this.clock = clock; this.config = config; }
    async settings(tx:Tx,workspaceId:string) { const c = await currentAiConfig(tx,workspaceId,this.config); let approved=false; try{await approvedAi(tx,workspaceId,this.config);approved=true;}catch(e){if(!(e instanceof AppError&&[403,409].includes(e.status)))throw e;} return { configured: !!c, enabled: approved, currency: c?.currency ?? null, perTaskLimitUnits: c?.perTaskLimitUnits ?? null, dailyLimitUnits: c?.dailyLimitUnits ?? null, note: '模型连接须由管理员启用。费用预留与用量记录不等于供应商账单。' }; }
    private configured(tx:Tx,workspaceId:string) { return approvedAi(tx,workspaceId,this.config); }
    async grant(tx: Tx, actor: Actor, input: unknown) {
        requirePermission(actor, 'sources.review');
        requirePermission(actor, 'sensitive.read');
        invariant(actor.actorKind !== 'MACHINE', 'HUMAN_AI_REQUIRED', '用途许可需要人工审核', 403);
        const c = await currentAiConfig(tx,actor.workspaceId,this.config);
        invariant(c, 'AI_DISABLED', '请先配置供应商身份', 409);
        const d = S.grant.parse(input), s = await sourceFor(tx, actor, d.sourceId, this.clock);
        cas(s, d.expectedRevision);
        invariant(s.basisMode === 'INTERNAL_USE' && s.status === 'CONFIRMED' && d.confirmTextOnly, 'AI_BASIS_REQUIRED', '仅可批准有明确内部依据且已确认最小必要文字的来源', 422);
        invariant(Date.parse(d.validUntil) > this.clock.now().getTime() && Date.parse(d.validUntil) <= Date.parse(s.validUntil), 'AI_GRANT_EXPIRY', '许可期限不能超过来源期限', 422);
        const scope = await tx.get('scopes', s.scopeId);
        if (!scope)
            missing();
        const row = { ...base(actor.workspaceId, this.clock), sourceId: s.id, sourceRevision: s.revision, sourceProtectionEpoch: s.protectionEpoch, scopeId: s.scopeId, scopeRevision: scope.revision, providerIdentityHash: c.providerIdentityHash, configRevision: c.configRevision, reviewerId: actor.membershipId, validUntil: d.validUntil, status: 'ACTIVE' as const, evidenceNote: d.evidenceNote };
        await tx.insert('aiGrants', row);
        return row;
    }
    async grantAccess(tx: Tx, actor: Actor, id: string) { requirePermission(actor, 'sources.review'); const row = await workspaceRow(tx, 'aiGrants', id, actor.workspaceId); if (!row)
        missing(); await sourceFor(tx, actor, row.sourceId, this.clock, false); return row; }
    async revoke(tx: Tx, actor: Actor, id: string, input: unknown) { const row = await this.grantAccess(tx, actor, id); cas(row, S.revision.parse(input).expectedRevision); const next = { ...touch(row, this.clock), status: 'REVOKED' as const }; await tx.replace('aiGrants', next); return next; }
    async grants(tx: Tx, actor: Actor, query: Record<string, string>) { requirePermission(actor, 'sources.read'); const rows = []; for (const row of await tx.find('aiGrants', { workspaceId: actor.workspaceId }))
        try {
            const source = await sourceFor(tx, actor, row.sourceId, this.clock);
            rows.push({ sourceTitle: source.title, id: row.id, revision: row.revision, sourceId: row.sourceId, sourceRevision: row.sourceRevision, status: row.status, validUntil: row.validUntil });
        }
        catch (e) {
            if (!(e instanceof AppError && e.status === 404))
                throw e;
        } return page(rows, query); }
    private async capture(tx: Tx, actor: Actor, sourceId: string, taskId: string, grantId: string | null): Promise<AiDependency> {
        const s = await sourceFor(tx, actor, sourceId, this.clock), scope = await tx.get('scopes', s.scopeId);
        if (!scope)
            missing();
        invariant(s.basisMode === 'INTERNAL_USE' && s.status === 'CONFIRMED', 'AI_BASIS_REQUIRED', '临时整理来源不能用于 AI', 422);
        let grantRevision: number | null = null;
        if (grantId) {
            const c = await this.configured(tx, actor.workspaceId), g = await workspaceRow(tx, 'aiGrants', grantId, actor.workspaceId);
            invariant(g && g.sourceId === sourceId && g.status === 'ACTIVE' && Date.parse(g.validUntil) > this.clock.now().getTime() && g.providerIdentityHash === c.providerIdentityHash && g.configRevision === c.configRevision && g.sourceRevision === s.revision && g.sourceProtectionEpoch === s.protectionEpoch && g.scopeId === s.scopeId && g.scopeRevision === scope.revision, 'AI_PERMISSION_STALE', '文字外送许可缺失或已经变化', 409);
            grantRevision = g.revision;
        }
        return { ...base(actor.workspaceId, this.clock), taskId, sourceId, grantId, grantRevision, sourceRevision: s.revision, protectionEpoch: s.protectionEpoch, scopeId: s.scopeId, scopeRevision: scope.revision };
    }
    private async build(tx: Tx, actor: Actor, input: unknown, id: string) {
        human(actor);
        await this.configured(tx, actor.workspaceId);
        const d = S.create.parse(input);
        if (d.taskType !== 'parse_search') {
            requirePermission(actor, 'sources.read');
            requirePermission(actor, 'sensitive.read');
        }
        invariant(d.confirmMinimizedInput, 'AI_INPUT_CONFIRM_REQUIRED', '请确认已去除联系方式、凭证和无关客户资料', 422);
        const parse = d.taskType === 'parse_search';
        invariant(parse ? d.subjectKind === 'NONE' && d.subjectId === null && d.expectedRevision === null && d.sources.length === 0 && !!d.queryText.trim() : d.subjectKind !== 'NONE' && !!d.subjectId && !!d.expectedRevision && d.sources.length > 0 && d.queryText === '', 'AI_TASK_INPUT_INVALID', '任务目标或文字输入不匹配', 400);
        invariant(d.taskType !== 'extract_profile' || d.subjectKind === 'PERSON', 'AI_TARGET_INVALID', '资料提取需要人物目标', 400);
        invariant(d.taskType !== 'suggest_tags' || d.subjectKind === 'WORK', 'AI_TARGET_INVALID', '标签建议需要作品目标', 400);
        invariant((d.taskType === 'draft_locale') === (d.locale !== null), 'AI_LOCALE_INVALID', '语言草稿必须选择语言', 400);
        let target = null;
        const deps: AiDependency[] = [], chunks: Array<{
            sourceId: string;
            start: number;
            end: number;
            text: string;
        }> = [];
        if (d.subjectKind !== 'NONE') {
            target = await localeTarget(tx, actor, d.subjectKind, d.subjectId!, this.clock);
            cas(target, d.expectedRevision!);
            invariant(target.status !== 'ARCHIVED', 'RECORD_ARCHIVED', '已归档资料不能生成修改建议', 409);
            deps.push(await this.capture(tx, actor, target.sourceId, id, null));
            if (d.taskType === 'suggest_tags')
                invariant(d.sources.every(s => s.sourceId === target!.sourceId), 'AI_WORK_SOURCE_REQUIRED', '作品标签须使用作品自身来源的获准文字', 422);
        }
        invariant(new Set(d.sources.map(s => s.sourceId)).size === d.sources.length, 'AI_DUPLICATE_SOURCE', '来源不能重复', 400);
        for (const ref of d.sources) {
            const s = await sourceFor(tx, actor, ref.sourceId, this.clock);
            cas(s, ref.expectedRevision);
            const text = s.textPayload ?? '';
            invariant(ref.end > ref.start && ref.end <= text.length, 'AI_TEXT_RANGE_INVALID', '所选文字范围无效', 400);
            chunks.push({ sourceId: s.id, start: ref.start, end: ref.end, text: text.slice(ref.start, ref.end) });
            deps.push(await this.capture(tx, actor, s.id, id, ref.grantId));
        }
        const text = parse ? d.queryText : chunks.map(c => c.text).join('\n');
        invariant(text.length <= 10000 && !secretPattern.test(text), 'AI_SENSITIVE_INPUT', '文字过长或包含疑似联系方式、凭证，请删减后重新确认', 422);
        const dictionary = (await tx.find('dictionary', { workspaceId: actor.workspaceId, status: 'ACTIVE' })).filter(x => (d.taskType==='suggest_tags'?['industry','workType']:['industry','workType','role','city','language']).includes(x.namespace)).map(x => ({ namespace: x.namespace, code: x.code, label: x.labelZh }));
        const external = { taskType: d.taskType, locale: d.locale, chunks, queryText: d.queryText, dictionary: d.taskType === 'suggest_tags' || parse ? dictionary : [], promptVersion: 'once-ai-text-1', outputSchemaVersion: 'once-ai-proposal-1' };
        return { d, target, deps, external };
    }
    async preview(tx: Tx, actor: Actor, input: unknown) { const b = await this.build(tx, actor, input, 'preview'); return { input: b.external, reservedUnits: (await this.configured(tx, actor.workspaceId)).perTaskLimitUnits, currency: (await this.configured(tx, actor.workspaceId)).currency }; }
    async create(tx: Tx, actor: Actor, input: unknown, key: string, meta: RequestMeta) {
        const stamp = base(actor.workspaceId, this.clock), b = await this.build(tx, actor, input, stamp.id), c = await this.configured(tx, actor.workspaceId);
        let oldValues: Record<string, unknown> = {}, localeTextId: string | null = null, localeRevision: number | null = null;
        if (b.target) {
            if (b.d.taskType === 'extract_profile') {
                const p = await tx.get('people', b.target.id);
                oldValues = { displayName: p!.displayName, intro: p!.intro, aliases: p!.aliases };
            }
            if (b.d.taskType === 'suggest_tags') {
                const w = await tx.get('works', b.target.id);
                oldValues = { industryCode: w!.industryCode, workTypeCodes: w!.workTypeCodes };
            }
            if (b.d.taskType === 'draft_locale') {
                const key = b.d.subjectKind === 'PERSON' ? 'personId' : b.d.subjectKind === 'WORK' ? 'workId' : 'projectId';
                const row = (await tx.find('localeTexts', { workspaceId: actor.workspaceId, [key]: b.target.id, locale: b.d.locale! })).find(r => r.state !== 'ERASED');
                if (row) {
                    const prior = await new LocaleTexts(this.clock).access(tx, actor, row.id);
                    invariant(!prior.securityChanged, 'AI_SOURCE_CHANGED', '旧文本依据已变化，请先重新复核', 409);
                    for (const dep of prior.deps)
                        if (!b.deps.some(d => d.sourceId === dep.sourceId))
                            b.deps.push(await this.capture(tx, actor, dep.sourceId, stamp.id, null));
                    localeTextId = row.id;
                    localeRevision = row.revision;
                }
                oldValues = { text: row?.text ?? '' };
            }
        }
        const run = await new AiLedger(this.clock).reserve(tx, actor.workspaceId, actor.membershipId, key, digest(b.external), c.perTaskLimitUnits, c, meta), scope = b.target ? await tx.get('scopes', b.target.scopeId) : null;
        const row: AiTask = { ...stamp, runId: run.id, actorId: actor.membershipId, taskType: b.d.taskType, personId: b.d.subjectKind === 'PERSON' ? b.d.subjectId : null, workId: b.d.subjectKind === 'WORK' ? b.d.subjectId : null, projectId: b.d.subjectKind === 'PROJECT' ? b.d.subjectId : null, targetRevision: b.target?.revision ?? null, targetProtectionEpoch: b.target && 'protectionEpoch' in b.target ? b.target.protectionEpoch : null, targetScopeId: b.target?.scopeId ?? null, targetScopeRevision: scope?.revision ?? null, localeTextId, localeRevision, inputSpec: b.d, oldValues, output: {}, proposalState: 'NONE', selectedFields: [], discardedFields: [] };
        await tx.insert('aiTasks', row);
        for (const dep of b.deps)
            await tx.insert('aiDependencies', dep);
        return row;
    }
    async access(tx: Tx, actor: Actor, id: string, strict = false) {
        human(actor);
        const row = await workspaceRow(tx, 'aiTasks', id, actor.workspaceId);
        if (!row || row.actorId !== actor.membershipId || row.proposalState === 'ERASED')
            missing();
        const d = S.create.parse(row.inputSpec);
        if (row.taskType !== 'parse_search')
            requirePermission(actor, 'sensitive.read');
        if (d.subjectKind !== 'NONE') {
            const target = await localeTarget(tx, actor, d.subjectKind, d.subjectId!, this.clock);
            await requireScope(tx, actor, row.targetScopeId!);
            const scope = await tx.get('scopes', target.scopeId);
            invariant(target.scopeId === row.targetScopeId && scope?.revision === row.targetScopeRevision && ('protectionEpoch' in target ? target.protectionEpoch : null) === row.targetProtectionEpoch, 'AI_SOURCE_CHANGED', '目标范围或保护状态已变化', 409);
            if (strict)
                cas(target, row.targetRevision!);
        }
        if (row.localeTextId) {
            const prior = await new LocaleTexts(this.clock).access(tx, actor, row.localeTextId);
            invariant(!prior.securityChanged, 'AI_SOURCE_CHANGED', '旧文本依据已变化', 409);
            if (strict)
                cas(prior.row, row.localeRevision!);
        }
        const deps = await tx.find('aiDependencies', { workspaceId: actor.workspaceId, taskId: id });
        for (const dep of deps) {
            const s = await sourceFor(tx, actor, dep.sourceId, this.clock);
            await requireScope(tx, actor, dep.scopeId);
            const scope = await tx.get('scopes', s.scopeId);
            invariant(s.protectionEpoch === dep.protectionEpoch && s.scopeId === dep.scopeId && scope?.revision === dep.scopeRevision, 'AI_SOURCE_CHANGED', '来源范围或保护状态已变化', 409);
            if (strict) {
                cas(s, dep.sourceRevision);
                if (dep.grantId) {
                    const current = await this.capture(tx, actor, s.id, id, dep.grantId);
                    invariant(current.grantRevision === dep.grantRevision, 'AI_PERMISSION_STALE', '外送许可已变化', 409);
                }
            }
        }
        return row;
    }
    async get(tx: Tx, actor: Actor, id: string) { const row = await this.access(tx, actor, id), run = await tx.get('aiRuns', row.runId); let stale = false; if (['NONE', 'PENDING'].includes(row.proposalState))
        try {
            await this.access(tx, actor, id, true);
        }
        catch {
            stale = true;
        } return { id: row.id, revision: row.revision, taskType: row.taskType, state: run!.state, proposalState: row.proposalState, stale, oldValues: row.oldValues, output: row.output, selectedFields: row.selectedFields, discardedFields: row.discardedFields, reservedUnits: run!.reservedUnits, settledUnits: run!.settledUnits, responseMetadata:(await tx.find('aiResponseMetadata',{workspaceId:actor.workspaceId,runId:run!.id}))[0]??null, cancelRequested: run!.cancelRequested }; }
    async list(tx: Tx, actor: Actor, query: Record<string, string>) { human(actor); const rows = []; for (const row of await tx.find('aiTasks', { workspaceId: actor.workspaceId, actorId: actor.membershipId }))
        try {
            rows.push(await this.get(tx, actor, row.id));
        }
        catch (e) {
            if (!(e instanceof AppError && [404, 409].includes(e.status)))
                throw e;
        } return page(rows, query); }
    async cancel(tx: Tx, actor: Actor, id: string, input: unknown, meta: RequestMeta) { const row = await this.access(tx, actor, id); cas(row, S.revision.parse(input).expectedRevision); await new AiLedger(this.clock).cancel(tx, actor.workspaceId, row.runId, meta); const next = { ...touch(row, this.clock), proposalState: row.proposalState === 'PENDING' ? 'REJECTED' as const : row.proposalState }; await tx.replace('aiTasks', next); return next; }
    async reject(tx: Tx, actor: Actor, id: string, input: unknown) { const row = await this.access(tx, actor, id); cas(row, S.revision.parse(input).expectedRevision); invariant(row.proposalState === 'PENDING', 'AI_PROPOSAL_FINAL', '提议已经处理', 409); const next = { ...touch(row, this.clock), proposalState: 'REJECTED' as const }; await tx.replace('aiTasks', next); return next; }
    private validateOutput(row: AiTask, raw: unknown) { const o = S.output.parse(raw), d = S.create.parse(row.inputSpec), allowed = row.taskType === 'extract_profile' ? ['displayName', 'intro', 'aliases'] : row.taskType === 'suggest_tags' ? ['industryCode', 'workTypeCodes'] : row.taskType === 'draft_locale' ? ['text'] : ['filters']; invariant(new Set(o.changes.map(x => x.field)).size === o.changes.length && o.changes.every(x => allowed.includes(x.field)), 'AI_OUTPUT_INVALID', '模型返回了不允许的字段', 422); for (const change of o.changes) {
        const field = change.field;
        change.value = field === 'filters' ? S.filters.parse(change.value) : field === 'aliases' ? v.array(v.string(120, 1), 20).parse(change.value) : field === 'workTypeCodes' ? v.array(v.string(60, 1), 10).parse(change.value) : field === 'industryCode' ? v.nullable(v.string(60, 1)).parse(change.value) : v.string(field === 'displayName' ? 120 : field === 'intro' ? 5000 : 10000, 1).parse(change.value);
        invariant(row.taskType === 'parse_search' || change.evidence.length > 0, 'AI_EVIDENCE_REQUIRED', '建议缺少原文定位', 422);
        for (const e of change.evidence)
            invariant(d.sources.some(s => s.sourceId === e.sourceId && e.start >= s.start && e.end <= s.end && e.end > e.start), 'AI_EVIDENCE_INVALID', '建议引用超出已批准文字范围', 422);
    } return o; }
    async acceptOutput(tx: Tx, actor: Actor, id: string, raw: unknown) { const row = await this.access(tx, actor, id, true); invariant(row.proposalState === 'NONE', 'AI_PROPOSAL_EXISTS', '任务已有提议', 409); const output = this.validateOutput(row, raw); const dictionary = await tx.find('dictionary', { workspaceId: actor.workspaceId, status: 'ACTIVE' }); for (const change of output.changes) {
        const codes = change.field === 'industryCode' ? { industry: change.value ? [change.value] : [] } : change.field === 'workTypeCodes' ? { workType: change.value as string[] } : change.field === 'filters' ? Object.fromEntries(Object.entries(change.value as Record<string, string>).filter(([k]) => k !== 'q').map(([k, v]) => [({ role: 'role', location: 'city', language: 'language', industryCode: 'industry', workTypeCode: 'workType' } as Record<string, string>)[k], [v]])) : {};
        for (const [namespace, values] of Object.entries(codes))
            for (const code of values as string[])
                invariant(dictionary.some(d => d.namespace === namespace && d.code === code), 'AI_DICTIONARY_INVALID', '建议包含未获准的字典值', 422);
    } for (const c of output.changes)
        for (const e of c.evidence) {
            const source = await sourceFor(tx, actor, e.sourceId, this.clock);
            invariant(source.textPayload?.slice(e.start, e.end) === e.quote, 'AI_QUOTE_INVALID', '建议原文定位不匹配', 422);
        } await tx.replace('aiTasks', { ...touch(row, this.clock), output, proposalState: output.changes.length ? 'PENDING' : 'NONE' }); }
    async apply(tx: Tx, actor: Actor, id: string, input: unknown) {
        const row = await this.access(tx, actor, id, true), d = S.apply.parse(input);
        cas(row, d.expectedRevision);
        const currentConfig=await this.configured(tx, actor.workspaceId);
        const run = await tx.get('aiRuns', row.runId);
        invariant(run && (run.state === 'SUCCEEDED' || run.state === 'UNKNOWN' && (await tx.find('aiResponseMetadata',{workspaceId:actor.workspaceId,runId:run.id})).length>0) && !run.cancelRequested && run.configRevision === currentConfig.configRevision && run.providerIdentityHash === currentConfig.providerIdentityHash && run.recoveryEpoch === this.config.recoveryEpoch, 'AI_PROPOSAL_STALE', '任务配置或状态已变化', 409);
        invariant(row.proposalState === 'PENDING', 'AI_PROPOSAL_FINAL', '提议只允许采纳一次', 409);
        const output = this.validateOutput(row, row.output);
        invariant(new Set(d.selectedFields).size === d.selectedFields.length && d.selectedFields.every(f => output.changes.some(c => c.field === f)), 'AI_SELECTION_INVALID', '请仅选择本次建议字段', 400);
        const patch = Object.fromEntries(output.changes.filter(c => d.selectedFields.includes(c.field as typeof d.selectedFields[number])).map(c => [c.field, c.value]));
        if (row.taskType !== 'parse_search')
            requirePermission(actor, 'records.write');
        if (row.taskType === 'extract_profile') {
            const domain = new TalentV2(this.clock, this.config);
            const person = await domain.patchPerson(tx, actor, row.personId!, { schemaVersion: 'once-talent-v2.0.0', expectedRevision: row.targetRevision, ...patch });
            for (const change of output.changes)
                if (Object.hasOwn(patch, change.field))
                    for (const sourceId of new Set(change.evidence.map(e => e.sourceId))) {
                        const source = await sourceFor(tx, actor, sourceId, this.clock);
                        await domain.evidenceFor(tx, actor, 'person', { ...person }, [change.field], sourceId, source.revision, false);
                    }
        }
        if (row.taskType === 'suggest_tags')
            await new Portfolio(this.clock, new Talent(this.clock, this.config)).update(tx, actor, row.workId!, { expectedRevision: row.targetRevision, ...patch });
        if (row.taskType === 'draft_locale') {
            const spec = S.create.parse(row.inputSpec), locale = new LocaleTexts(this.clock), refs = spec.sources.map(s => ({ id: s.sourceId, expectedRevision: s.expectedRevision })), content = { text: patch.text, sourceRefs: refs, expectedSubjectRevision: row.targetRevision, confirmCurrentBasis: false };
            if (row.localeTextId)
                await locale.update(tx, actor, row.localeTextId, { ...content, expectedRevision: row.localeRevision });
            else
                await locale.create(tx, actor, { ...content, subjectKind: spec.subjectKind, subjectId: spec.subjectId, locale: spec.locale });
        }
        const next = { ...touch(row, this.clock), proposalState: 'APPLIED' as const, selectedFields: d.selectedFields, discardedFields: output.changes.filter(c => !d.selectedFields.includes(c.field as typeof d.selectedFields[number])).map(c => c.field) };
        await tx.replace('aiTasks', next);
        return next;
    }
    async results(tx: Tx, actor: Actor, id: string) { const row = await this.access(tx, actor, id); invariant(row.taskType === 'parse_search' && row.proposalState === 'APPLIED', 'AI_SEARCH_UNCONFIRMED', '请先确认检索条件', 409); return searchTalentV2(tx, actor, this.clock, Object.fromEntries(Object.entries(S.filters.parse(this.validateOutput(row, row.output).changes[0]!.value)).filter((entry): entry is [
        string,
        string
    ] => typeof entry[1] === 'string'))); }
    async dispatch(store: Store, id: string, workspaceId: string, adapter: AiDispatchAdapter, meta: RequestMeta, signal?:AbortSignal) { const {c,timeoutMs} = await store.transaction(async tx=>({c:await this.configured(tx,workspaceId),timeoutMs:(await connectionRow(tx,workspaceId))?.settings.timeoutMs??60000})); invariant(c,'AI_DISABLED','AI 调用未配置',409); invariant(!adapter.providerIdentityHash||adapter.providerIdentityHash===c.providerIdentityHash,'AI_ADAPTER_MISMATCH','模型连接已变化',409); const actorFor = async (tx: Tx, actorId: string): Promise<Actor> => { const m = await workspaceRow(tx, 'memberships', actorId, workspaceId), u = m ? await tx.get('users', m.userId) : null; invariant(m?.status === 'ACTIVE' && u?.status === 'ACTIVE', 'FORBIDDEN', '发起成员已失效', 403); return { workspaceId, membershipId: m.id, userId: m.userId, role: m.role, permissions: permissionsFor(m), displayName: u.displayName, userEpoch: u.sessionEpoch, sessionId: 'ai-worker', actorKind: 'HUMAN' }; }; const row = await store.transaction(tx => workspaceRow(tx, 'aiTasks', id, workspaceId)); if (!row)
        missing(); return dispatchAi(store, this.clock, c, workspaceId, row.runId, meta, adapter, { authorize: async (tx) => { invariant(digest(await this.configured(tx,workspaceId))===digest(c),'AI_CONFIG_CHANGED','AI 配置已变化',409); const actor = await actorFor(tx, row.actorId); await this.access(tx, actor, id, true); return (await this.build(tx, actor, row.inputSpec, id)).external; }, proposal: async (tx, _run, output) => this.acceptOutput(tx, await actorFor(tx, row.actorId), id, output) }, timeoutMs, signal); }
}
