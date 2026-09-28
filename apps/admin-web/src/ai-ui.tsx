import {AiOperationsPanel} from './ai-operations-ui.tsx';
import { useState } from 'react';
import { call, read } from './api.ts';
import type { Inputs } from './generated/requests.ts';
import type { Me, Page, Source, Receipt } from './dto.ts';
import { ErrorBox, Field, Modal, PageTitle, Pager, useAction, useLoad } from './ui.tsx';
import { outcomeUnknown } from './talent-edit.tsx';
const names = { extract_profile: '提取人物资料', suggest_tags: '建议作品标签', draft_locale: '起草内部语言文本', parse_search: '解析检索条件' };
const fields: Record<string, string> = { displayName: '姓名', intro: '简介', aliases: '别名', industryCode: '行业', workTypeCodes: '作品类型', text: '内部文本', filters: '检索条件' };
interface Task {
    id: string;
    revision: number;
    taskType: keyof typeof names;
    state: string;
    proposalState: string;
    stale: boolean;
    oldValues: Record<string, unknown>;
    output: {
        changes?: Array<{
            field: string;
            value: unknown;
            evidence: Array<{
                sourceId: string;
                quote: string;
            }>;
        }>;
        unknowns?: string[];
    };
    selectedFields: string[];
    discardedFields: string[];
    reservedUnits: number;
    settledUnits: number | null;
    cancelRequested: boolean;
}
interface Settings {
    configured: boolean;
    enabled: boolean;
    currency: string | null;
    perTaskLimitUnits: number | null;
    note: string;
}
interface Grant {
    sourceTitle: string;
    id: string;
    revision: number;
    sourceId: string;
    sourceRevision: number;
    status: string;
    validUntil: string;
}
const value = (v: unknown) => v === undefined || v === null ? '未填写' : typeof v === 'string' ? v : JSON.stringify(v);
export function AiWorkspace({ me }: {
    me: Me;
}) {
    const [operations,setOperations]=useState(false);
    const [tick, setTick] = useState(0), [page, setPage] = useState(1), [creating, setCreating] = useState(false), [granting, setGranting] = useState(false), [detail, setDetail] = useState<string | null>(null);
    const settings = useLoad(() => read<Settings>('ai.settings'), tick), tasks = useLoad(() => me.permissions.includes('ai.use') ? read<Page<Task>>('ai.list', {}, { page: String(page), pageSize: '20' }) : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 20 }), page + ':' + tick);
    return <><PageTitle title="AI 辅助整理" overline="INTERNAL ASSISTANCE" description="只处理已获准的必要文字。建议经人工确认后才写入资料。" action={<button onClick={() => setTick(t => t + 1)}>刷新任务</button>}/><ErrorBox error={settings.error}/><ErrorBox error={tasks.error}/>{settings.data && <p className="notice">{settings.data.enabled ? '调用配置已启用。' : '尚未启用外部调用。'}{settings.data.note}</p>}<div className="toolbar">{me.permissions.includes('members.manage')&&<button onClick={()=>setOperations(true)}>配置与费用核对</button>}{me.permissions.includes('ai.use') && me.role !== 'VIEWER' && <button className="primary" disabled={!settings.data?.enabled} onClick={() => setCreating(true)}>新建 AI 任务</button>}{me.permissions.includes('sources.review') && <button disabled={!settings.data?.configured || !me.permissions.includes('sensitive.read')} onClick={() => setGranting(true)}>管理文字外送许可</button>}</div>{tasks.busy ? <p>正在读取当前可见任务…</p> : tasks.data?.items.map(t => <article className="panel" key={t.id}><h3>{names[t.taskType]}</h3><p>{t.state === 'UNKNOWN' ? '结果与费用待核对，请勿重新发送' : t.proposalState === 'PENDING' ? '建议待审阅' : t.proposalState === 'APPLIED' ? '建议已采纳' : t.proposalState === 'REJECTED' ? '建议已放弃' : t.state === 'QUEUED' ? '等待处理' : t.state === 'CANCELLED' ? '已取消' : t.state === 'RUNNING' ? '处理中' : '任务已处理'}</p><button onClick={() => setDetail(t.id)}>查看任务与建议</button></article>)}{tasks.data && <Pager page={page} pageSize={20} total={tasks.data.total} setPage={setPage}/>} {operations&&<AiOperationsPanel onClose={()=>{setOperations(false);setTick(t=>t+1);}}/>}{creating && <AiCreate onClose={() => setCreating(false)} onCreated={id => { setCreating(false); setDetail(id); setTick(t => t + 1); }}/>}{granting && <AiGrants onClose={() => setGranting(false)}/>} {detail && <AiDetail key={detail} id={detail} canWrite={me.permissions.includes('records.write')} onClose={() => { setDetail(null); setTick(t => t + 1); }}/>}</>;
}
function AiCreate({ onClose, onCreated }: {
    onClose: () => void;
    onCreated: (id: string) => void;
}) {
    const [taskType, setType] = useState<keyof typeof names>('extract_profile'), [kind, setKind] = useState<'PERSON' | 'WORK' | 'PROJECT'>('PERSON'), [target, setTarget] = useState(''), [grant, setGrant] = useState(''), [text, setText] = useState(''), [query, setQuery] = useState(''), [locale, setLocale] = useState<'zh' | 'en'>('en'), [confirmed, setConfirmed] = useState(false), [page, setPage] = useState(1), [preview, setPreview] = useState<{
        body: string;
        input: unknown;
        reservedUnits: number;
        currency: string;
    } | null>(null);
    const parse = taskType === 'parse_search', actualKind = taskType === 'extract_profile' ? 'PERSON' : taskType === 'suggest_tags' ? 'WORK' : kind;
    const listing = useLoad(() => parse ? Promise.resolve({ items: [], total: 0 }) : read<{
        items: Array<{
            id: string;
            revision: number;
            displayName?: string;
            title?: string;
        }>;
        total: number;
    }>(actualKind === 'PERSON' ? 'td2.person.list' : actualKind === 'WORK' ? 'work.list' : 'project.list', {}, { page: String(page), pageSize: '20' }), actualKind + ':' + parse + ':' + page);
    const grants = useLoad(() => read<Page<Grant>>('ai.grants', {}, { pageSize: '100' }), 'grants'), selected = grants.data?.items.find(g => g.id === grant);
    const source = useLoad(() => selected ? read<Source>('source.get', { id: selected.sourceId }) : Promise.resolve(null), selected?.sourceId ?? 'none');
    const action = useAction(), unknown = outcomeUnknown(action.error), frozen = action.busy || unknown, root = listing.data?.items.find(t => t.id === target), start = source.data?.textPayload?.indexOf(text) ?? -1;
    const input: Inputs['ai.create'] = { taskType, subjectKind: parse ? 'NONE' : actualKind, subjectId: parse ? null : target || null, expectedRevision: parse ? null : root?.revision ?? null, locale: taskType === 'draft_locale' ? locale : null, sources: parse || !selected || !text || start < 0 ? [] : [{ sourceId: selected.sourceId, expectedRevision: source.data?.revision ?? selected.sourceRevision, grantId: selected.id, start, end: start + text.length }], queryText: parse ? query : '', confirmMinimizedInput: confirmed };
    const body = JSON.stringify(input), valid = confirmed && (parse ? !!query.trim() : !listing.busy && !source.busy && source.data?.id===selected?.sourceId && !!root && !!selected && !!text && start >= 0);
    return <Modal title="确认本次 AI 输入" onClose={() => { if (!frozen)
        onClose(); }} wide><div className="modal-body"><ErrorBox error={action.error}/>{unknown && <p className="notice">提交结果未知，内容已锁定，请原样重试。</p>}<fieldset disabled={frozen}><Field label="任务类型"><select value={taskType} onChange={e => { setType(e.target.value as keyof typeof names); setTarget(''); setPreview(null); setPage(1); }}>{Object.entries(names).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>{parse ? <Field label="检索句"><textarea value={query} maxLength={1000} onChange={e => setQuery(e.target.value)}/></Field> : <>{taskType === 'draft_locale' && <><Field label="资料类型"><select value={kind} onChange={e => { setKind(e.target.value as typeof kind); setTarget(''); setPage(1); }}><option value="PERSON">人物</option><option value="WORK">作品</option><option value="PROJECT">项目</option></select></Field><Field label="草稿语言"><select value={locale} onChange={e => setLocale(e.target.value as typeof locale)}><option value="zh">中文</option><option value="en">英文</option></select></Field></>}<ErrorBox error={listing.error}/><Field label="目标资料"><select value={target} onChange={e => setTarget(e.target.value)}><option value="">请选择</option>{listing.data?.items.map(r => <option key={r.id} value={r.id}>{r.displayName ?? r.title}</option>)}</select></Field>{listing.data && <Pager page={page} pageSize={20} total={listing.data.total} setPage={setPage}/>}<ErrorBox error={grants.error}/><Field label="已批准的文字来源"><select value={grant} onChange={e => { setGrant(e.target.value); setText(''); }}><option value="">请选择外送许可</option>{grants.data?.items.filter(g => g.status === 'ACTIVE').map(g => <option key={g.id} value={g.id}>{g.sourceTitle} · 到期 {g.validUntil.slice(0, 10)}</option>)}</select></Field><ErrorBox error={source.error}/>{!source.busy && source.data && <><h3>{source.data.title}</h3><blockquote style={{ whiteSpace: 'pre-wrap' }}>{source.data.textPayload}</blockquote><Field label="本次使用的原文" hint="从上方复制必要的连续文字。去掉联系方式、凭证、合同原文和无关客户资料。"><textarea value={text} maxLength={10000} onChange={e => setText(e.target.value)}/></Field>{!!text && start < 0 && <p role="alert">输入必须是该来源中的连续原文，不能改写或补充。</p>}</>}</>}<label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>我已检查，仅包含本次任务必要、允许外送的文字</label></fieldset>{preview?.body === body && <section className="panel"><h3>实际发送内容</h3><pre style={{ whiteSpace: 'pre-wrap' }}>{value((preview.input as {
        queryText?: string;
    }).queryText || ((preview.input as {
        chunks?: Array<{
            text: string;
        }>;
    }).chunks ?? []).map(c => c.text).join('\n\n'))}</pre><p>预留费用：{preview.reservedUnits} 个配置最小单位（{preview.currency}）。未知结果继续占用预留。</p></section>}<footer className="modal-footer"><button disabled={frozen} onClick={onClose}>返回</button><button disabled={frozen || !valid} onClick={() => void action.run(async () => { const p = await call<'ai.preview', {
        input: unknown;
        reservedUnits: number;
        currency: string;
    }>('ai.preview', input); setPreview({ ...p, body }); })}>预览实际输入</button><button className="primary" disabled={action.busy || !valid || preview?.body !== body} onClick={() => void action.run(async () => { const r = await call<'ai.create', Receipt>('ai.create', input); onCreated(r.resourceId); })}>{unknown ? '原样重试提交' : '确认并创建任务'}</button></footer></div></Modal>;
}
function AiDetail({ id, canWrite, onClose }: {
    id: string;
    canWrite: boolean;
    onClose: () => void;
}) {
    const [pending, setPending] = useState<'ai.apply' | 'ai.reject' | 'ai.cancel' | null>(null);
    const [tick, setTick] = useState(0), [selected, setSelected] = useState<string[]>([]), [results, setResults] = useState<{
        items: Array<{
            id: string;
            displayName: string;
        }>;
        total: number;
    } | null>(null), load = useLoad(() => read<Task>('ai.get', { id }), id + ':' + tick), action = useAction(), unknown = outcomeUnknown(action.error), frozen = action.busy || unknown, row = load.data;
    const mutate = (op: 'ai.apply' | 'ai.reject' | 'ai.cancel') => { setPending(op); void action.run(async () => { if (!row)
        return; if (op === 'ai.apply')
        await call(op, { expectedRevision: row.revision, selectedFields: selected as Inputs['ai.apply']['selectedFields'] }, { id });
    else
        await call(op, { expectedRevision: row.revision }, { id }); setSelected([]); setPending(null); setTick(t => t + 1); }); };
    return <Modal title="审阅 AI 建议" onClose={() => { if (!frozen)
        onClose(); }} wide><div className="modal-body"><ErrorBox error={load.error}/><ErrorBox error={action.error}/>{unknown && <p className="notice">操作结果未知，请原样重试同一操作。</p>}{load.busy ? <p>正在核对当前权限与依据…</p> : row && <><p>{names[row.taskType]} · {row.proposalState === 'APPLIED' ? '已采纳' : row.proposalState === 'REJECTED' ? '已放弃' : row.state === 'UNKNOWN' ? '结果待核对' : row.proposalState === 'PENDING' ? '待审阅' : '尚无建议'}</p><p>预留 {row.reservedUnits}；{row.settledUnits === null ? '费用尚未核对' : `已核对 ${row.settledUnits}`}（配置最小单位）</p>{row.stale && <p className="notice">资料或许可已有变化，旧建议不能继续采纳。</p>}<fieldset disabled={frozen || row.stale || row.proposalState !== 'PENDING'}>{row.output.changes?.map(c => <article className="panel" key={c.field}><label><input type="checkbox" checked={selected.includes(c.field)} onChange={e => setSelected(s => e.target.checked ? [...s, c.field] : s.filter(x => x !== c.field))}/>{fields[c.field]}</label><p>原值：{value(row.oldValues[c.field])}</p><p>建议：{value(c.value)}</p>{c.evidence.map((e, i) => <blockquote key={i}>{e.quote}</blockquote>)}</article>)}</fieldset>{row.output.unknowns?.length && <><h3>尚不确定的内容</h3><ul>{row.output.unknowns.map((u, i) => <li key={i}>{u}</li>)}</ul></>}<p>采纳不会把资料变成已核验事实。一次确认后，未选字段不再接受二次采纳。</p>{row.proposalState === 'PENDING' && <><button disabled={action.busy || (unknown && pending !== 'ai.reject')} onClick={() => mutate('ai.reject')}>{unknown && pending === 'ai.reject' ? '原样重试放弃' : '放弃整份建议'}</button><button className="primary" disabled={action.busy || (unknown && pending !== 'ai.apply') || row.stale || !selected.length || (!canWrite && row.taskType !== 'parse_search')} onClick={() => mutate('ai.apply')}>{unknown ? '原样重试采纳' : '确认采纳所选字段'}</button></>}{['QUEUED', 'RUNNING', 'UNKNOWN'].includes(row.state) && !row.cancelRequested && <button disabled={action.busy || (unknown && pending !== 'ai.cancel')} onClick={() => mutate('ai.cancel')}>{unknown && pending === 'ai.cancel' ? '原样重试取消' : '取消后续处理'}</button>}{row.taskType === 'parse_search' && row.proposalState === 'APPLIED' && <button onClick={() => void action.run(async () => setResults(await read('ai.results', { id })))}>查看符合条件的人才</button>}{results && <section><p>当前可见结果 {results.total} 人</p>{results.items.map(p => <p key={p.id}>{p.displayName}</p>)}</section>}</>}<footer className="modal-footer"><button disabled={frozen} onClick={onClose}>返回任务列表</button><button disabled={frozen} onClick={() => setTick(t => t + 1)}>刷新任务结果</button></footer></div></Modal>;
}
function AiGrants({ onClose }: {
    onClose: () => void;
}) {
    const [pending, setPending] = useState<(() => Promise<void>) | null>(null);
    const [sourceId, setSource] = useState(''), [until, setUntil] = useState(''), [note, setNote] = useState(''), [confirmed, setConfirmed] = useState(false), [tick, setTick] = useState(0), [page, setPage] = useState(1), action = useAction(), unknown = outcomeUnknown(action.error), frozen = action.busy || unknown;
    const sources = useLoad(() => read<Page<Source>>('source.list', {}, { page: String(page), pageSize: '20' }), page), source = sources.data?.items.find(s => s.id === sourceId), grants = useLoad(() => read<Page<Grant>>('ai.grants', {}, { pageSize: '100' }), tick);
    const mutate = (fn: () => Promise<void>) => { setPending(() => fn); void action.run(async () => { await fn(); setPending(null); }); };
    return <Modal title="文字外送许可" onClose={() => { if (!frozen)
        onClose(); }}><div className="modal-body"><ErrorBox error={action.error}/>{unknown && pending && <button disabled={action.busy} onClick={() => mutate(pending)}>原样重试上次操作</button>}<ErrorBox error={sources.error}/><fieldset disabled={frozen}><Field label="来源"><select value={sourceId} onChange={e => setSource(e.target.value)}><option value="">请选择</option>{sources.data?.items.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></Field>{sources.data && <Pager page={page} pageSize={20} total={sources.data.total} setPage={setPage}/>}<Field label="许可截止日期"><input type="date" value={until} onChange={e => setUntil(e.target.value)}/></Field><Field label="人工审核依据"><textarea value={note} maxLength={2000} onChange={e => setNote(e.target.value)}/></Field><label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>许可仅用于当前供应商的必要文字，不包括联系方式、凭证或合同原件</label></fieldset><button disabled={frozen || !source || !until || note.length < 4 || !confirmed} onClick={() => mutate(async () => { await call('ai.grant', { sourceId, expectedRevision: source!.revision, validUntil: new Date(until + 'T00:00:00.000Z').toISOString(), evidenceNote: note, confirmTextOnly: confirmed }); setTick(t => t + 1); })}>{unknown ? '原样重试批准' : '批准文字用途'}</button><h3>已有许可</h3><ErrorBox error={grants.error}/>{grants.data?.items.map(g => <div key={g.id}><span>{g.sourceTitle} · {g.status === 'ACTIVE' ? '有效' : '已撤销'}</span>{g.status === 'ACTIVE' && <button disabled={frozen} onClick={() => mutate(async () => { await call('ai.grant.revoke', { expectedRevision: g.revision }, { id: g.id }); setTick(t => t + 1); })}>撤销许可</button>}</div>)}<footer className="modal-footer"><button disabled={frozen} onClick={onClose}>返回</button></footer></div></Modal>;
}
