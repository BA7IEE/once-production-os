import { useRef, useState } from 'react';
import { ApiError, call, read } from './api.ts';
import type { Inputs } from './generated/requests.ts';
import type { Me, Page, Receipt, CatalogItem, Source } from './dto.ts';
import type { ProductionKind, Selection, WorkSummary, WorkDetail, ProjectSummary, ProjectDetail, PersonProduction, Participant } from './production-dto.ts';
import { Modal, Field, ErrorBox, Empty, PageTitle, Pager, useLoad, useAction, date } from './ui.tsx';
const label: Record<string, string> = { ONCE: 'ONCE 制作（人工记录）', EXTERNAL: '外部作品', UNKNOWN: '制作方待确认', DRAFT: '草稿', ACTIVE: '使用中', ARCHIVED: '已归档', COMPLETED: '已完成', NOMINATED: '提名', CONFIRMED: '已确认', ACTUAL: '实际参与', REFERENCE: '参考作品', DELIVERABLE: '交付作品' };
const noun = (kind: ProductionKind) => kind === 'work' ? '作品' : '项目';
/** Holds the exact input until an uncertain result has been reconciled. No automatic retry. */
function useMutation(onDone: (r: Receipt) => void) {
    const a = useAction(), pending = useRef<null | {
        op: keyof Inputs;
        input: Inputs[keyof Inputs];
        params: Record<string, string>;
    }>(null);
    const [unknown, setUnknown] = useState(false);
    const execute = async (op: keyof Inputs, input: Inputs[keyof Inputs], params: Record<string, string>) => {
        pending.current ??= { op, input: structuredClone(input), params };
        const req = pending.current;
        try {
            const r = await call<typeof req.op, Receipt>(req.op, req.input, req.params);
            pending.current = null;
            setUnknown(false);
            onDone(r);
        }
        catch (e) {
            const uncertain = e instanceof ApiError && e.unknownOutcome;
            setUnknown(uncertain);
            if (!uncertain)
                pending.current = null;
            throw e;
        }
    };
    return { ...a, unknown, submit: <K extends keyof Inputs>(op: K, input: Inputs[K], params: Record<string, string> = {}) => a.run(() => execute(op, input, params)),
        retry: () => a.run(async () => { if (pending.current)
            await execute(pending.current.op, pending.current.input, pending.current.params); }) };
}
function MutationStatus({ mutation }: {
    mutation: ReturnType<typeof useMutation>;
}) { return <><ErrorBox error={mutation.error}/>{mutation.unknown && <div className="notice">上次写入结果未知。表单已锁定，先核对原请求，不能另发不同内容。<button type="button" disabled={mutation.busy} onClick={() => void mutation.retry()}>核对上次提交</button></div>}</>; }
type Picked = {
    id: string;
    label: string;
};
/** Paginated selection: no silently truncated first-100 list. Server revalidates all chosen IDs. */
function Picker({ type, value, onChange }: {
    type: 'person' | 'asset' | 'work' | 'source';
    value: Picked | null;
    onChange: (v: Picked) => void;
}) {
    const [page, setPage] = useState(1), [q, setQ] = useState(''), [filter, setFilter] = useState('');
    const op = type === 'person' ? 'person.list' : type === 'asset' ? 'asset.list' : type === 'source' ? 'source.list' : 'work.list';
    const searchable = type === 'person' || type === 'work';
    const load = useLoad(() => read<Page<{
        id: string;
        displayName?: string;
        title?: string;
        fileName?: string;
        current?: boolean;
        state?: string;
    }>>(op, {}, { page: String(page), pageSize: '10', ...(filter ? { q: filter } : {}) }), [type, page, filter].join(':'));
    return <div className="wp-picker"><strong>{value ? '已选：' + value.label : '请选择已有记录'}</strong>{searchable && <div className="filters"><input aria-label="查找关联记录" value={q} maxLength={120} onChange={e => setQ(e.target.value)}/><button type="button" onClick={() => { setFilter(q); setPage(1); }}>查找</button></div>}<ErrorBox error={load.error}/>{load.busy ? <p>正在查询…</p> : <div className="wp-options">{load.data?.items.filter(x => type !== 'source' || x.current).filter(x => type !== 'asset' || x.state === 'READY').map(x => <button type="button" aria-pressed={value?.id === x.id} key={x.id} onClick={() => onChange({ id: x.id, label: x.displayName ?? x.title ?? x.fileName ?? x.id })}>{x.displayName ?? x.title ?? x.fileName}</button>)}</div>}{load.data && <Pager page={page} pageSize={10} total={load.data.total} setPage={setPage}/>}<small>关联不会授予额外资料权限；提交时再次校验。</small></div>;
}
export function ProductionPanel({ kind, me, catalog }: {
    kind: ProductionKind;
    me: Me;
    catalog: CatalogItem[];
}) {
    const [page, setPage] = useState(1), [q, setQ] = useState(''), [filter, setFilter] = useState(''), [tick, setTick] = useState(0), [create, setCreate] = useState(false), [selection, setSelection] = useState<Selection | null>(null);
    const load = useLoad(() => read<Page<WorkSummary | ProjectSummary>>(kind === 'work' ? 'work.list' : 'project.list', {}, { page: String(page), pageSize: '20', ...(filter ? { q: filter } : {}) }), [kind, page, filter, tick].join(':'));
    return <><PageTitle overline={kind === 'work' ? 'PORTFOLIO' : 'PROJECT RECORDS'} title={noun(kind) + '库'} description={kind === 'work' ? '把图片组成作品，记录素材顺序、封面和真实贡献。上传人不自动成为作者。' : '记录实际制作过程。提名、确认与实际参与分开；完成项目不产生账款或预订。'} action={me.permissions.includes('records.write') ? <button className="primary" onClick={() => setCreate(true)}>新增{noun(kind)}</button> : undefined}/><div className="filters"><input aria-label={'搜索' + noun(kind)} value={q} onChange={e => setQ(e.target.value)} maxLength={160}/><button onClick={() => { setFilter(q); setPage(1); }}>搜索</button><button onClick={() => setTick(x => x + 1)}>刷新</button></div><ErrorBox error={load.error}/>{load.busy ? <p>正在读取当前可见记录…</p> : load.data && <><div className="people-grid">{load.data.items.map(w => <button key={w.id} className="person-card" onClick={() => setSelection({ kind, id: w.id })}><h3>{w.title}</h3><p>{label[w.status]}{'origin' in w ? ' · ' + label[w.origin] : ''}</p><small>版本 {w.revision} · {date(w.updatedAt)}</small></button>)}</div>{!load.data.items.length && <Empty title={'暂无可见' + noun(kind)}>可以先建草稿，之后补充素材、人员与制作事实。</Empty>}<Pager page={page} pageSize={20} total={load.data.total} setPage={setPage}/></>}{create && <RootForm kind={kind} onClose={() => setCreate(false)} onDone={r => { setCreate(false); setTick(x => x + 1); setSelection({ kind, id: r.resourceId }); }}/>}{selection && <ProductionDetail key={selection.kind + selection.id} selection={selection} me={me} catalog={catalog} onClose={() => { setSelection(null); setTick(x => x + 1); }} onNavigate={setSelection}/>}</>;
}
function RootForm({ kind, existing, onClose, onDone }: {
    kind: ProductionKind;
    existing?: WorkDetail | ProjectDetail;
    onClose: () => void;
    onDone: (r: Receipt) => void;
}) {
    const [title, setTitle] = useState(existing?.title ?? ''), [description, setDescription] = useState(existing ? ('description' in existing ? existing.description : existing.brief) : ''), [origin, setOrigin] = useState<WorkSummary['origin']>(existing && 'origin' in existing ? existing.origin : 'UNKNOWN'), [originNote, setOriginNote] = useState(existing && 'originNote' in existing ? existing.originNote : ''), [locationNote, setLocation] = useState(existing && 'locationNote' in existing ? existing.locationNote : ''), [dateNote, setDateNote] = useState(existing && 'dateNote' in existing ? existing.dateNote : ''), [reviewNote, setReview] = useState(existing && 'reviewNote' in existing ? existing.reviewNote : '');
    const [source, setSource] = useState<Picked | null>(null), [mode, setMode] = useState('existing'), [provider, setProvider] = useState(''), [basis, setBasis] = useState('');
    const m = useMutation(onDone);
    const submit = () => {
        const sourceFields = mode === 'existing' ? { sourceId: source?.id } : { inlineSource: { title: title.slice(0, 100) + '的内部来源', type: 'MANUAL' as const, providerClaim: provider, basisMode: 'TEMP_ORGANIZE' as const, basisDescription: basis } };
        if (kind === 'work')
            void m.submit(existing ? 'work.update' : 'work.create', existing ? { expectedRevision: existing.revision, title, description, origin, originNote } : { title, description, origin, originNote, ...sourceFields }, existing ? { id: existing.id } : {});
        else
            void m.submit(existing ? 'project.update' : 'project.create', existing ? { expectedRevision: existing.revision, title, brief: description, locationNote, dateNote, reviewNote } : { title, brief: description, locationNote, dateNote, ...sourceFields }, existing ? { id: existing.id } : {});
    };
    return <Modal title={(existing ? '编辑' : '新增') + noun(kind)} onClose={() => { if (!m.busy && !m.unknown)
        onClose(); }} wide><form onSubmit={e => { e.preventDefault(); submit(); }}><div className="modal-body"><MutationStatus mutation={m}/><fieldset disabled={m.busy || m.unknown}><Field label={noun(kind) + '标题'}><input required value={title} maxLength={160} onChange={e => setTitle(e.target.value)}/></Field><Field label={kind === 'work' ? '作品说明' : '项目需求'}><textarea value={description} maxLength={5000} onChange={e => setDescription(e.target.value)}/></Field>{kind === 'work' ? <><Field label="制作归属"><select value={origin} onChange={e => setOrigin(e.target.value as WorkSummary['origin'])}>{['UNKNOWN', 'EXTERNAL', 'ONCE'].map(x => <option value={x} key={x}>{label[x]}</option>)}</select></Field><Field label="制作归属依据" hint="记录事实依据，不代表已自动核验。外部作品不会因关联项目变成 ONCE 作品。"><textarea required={origin === 'ONCE'} minLength={origin === 'ONCE' ? 4 : 0} value={originNote} maxLength={2000} onChange={e => setOriginNote(e.target.value)}/></Field></> : <><Field label="地点说明"><input value={locationNote} maxLength={500} onChange={e => setLocation(e.target.value)}/></Field><Field label="日期说明" hint="可填写实际拍摄日期或待定，不是人员排期或锁档。"><input value={dateNote} maxLength={500} onChange={e => setDateNote(e.target.value)}/></Field>{existing && <Field label="内部复盘"><textarea value={reviewNote} maxLength={5000} onChange={e => setReview(e.target.value)}/></Field>}</>}{!existing && <><Field label="记录来源"><select value={mode} onChange={e => setMode(e.target.value)}><option value="existing">选择已有来源</option><option value="inline">补充临时接收依据（仅本人，最长7天）</option></select></Field>{mode === 'existing' ? <Picker type="source" value={source} onChange={setSource}/> : <><Field label="提供者或记录方式"><input required value={provider} maxLength={200} onChange={e => setProvider(e.target.value)}/></Field><Field label="内部接收依据"><textarea required minLength={4} value={basis} maxLength={2000} onChange={e => setBasis(e.target.value)}/></Field></>}</>}</fieldset></div><footer className="modal-footer"><button type="button" disabled={m.busy || m.unknown} onClick={onClose}>取消</button><button className="primary" disabled={m.busy || m.unknown || (!existing && mode === 'existing' && !source)}>保存{noun(kind)}</button></footer></form></Modal>;
}
export function ProductionDetail({ selection, me, catalog, onClose, onNavigate }: {
    selection: Selection;
    me: Me;
    catalog: CatalogItem[];
    onClose: () => void;
    onNavigate: (s: Selection) => void;
}) {
    const { kind, id } = selection, [tick, setTick] = useState(0), [editing, setEditing] = useState(false), [adding, setAdding] = useState<string | null>(null), [participant, setParticipant] = useState<Participant | null>(null);
    const load = useLoad<WorkDetail | ProjectDetail>(() => kind === 'work' ? read<WorkDetail>('work.get', { id }) : read<ProjectDetail>('project.get', { id }), [kind, id, tick].join(':'));
    const m = useMutation(() => setTick(x => x + 1)), w = load.data;
    const role = (c: string | null) => catalog.find(x => x.namespace === 'role' && x.code === c)?.labelZh ?? c;
    if (editing && w)
        return <RootForm kind={kind} existing={w} onClose={() => setEditing(false)} onDone={() => { setEditing(false); setTick(x => x + 1); }}/>;
    if (adding && w)
        return <LinkForm kind={kind} root={w} type={adding} participant={participant} catalog={catalog} onClose={() => { setAdding(null); setParticipant(null); }} onDone={() => { setAdding(null); setParticipant(null); setTick(x => x + 1); }}/>;
    const blocked = m.busy || m.unknown || load.busy;
    const changeStatus = (status: string) => { if (w)
        void m.submit(kind === 'work' ? 'work.update' : 'project.update', { expectedRevision: w.revision, status: status as 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'COMPLETED' }, { id }); };
    return <Modal title={w?.title ?? noun(kind) + '详情'} onClose={() => { if (!m.unknown && !m.busy)
        onClose(); }} wide><div className="modal-body"><MutationStatus mutation={m}/><ErrorBox error={load.error}/>{load.busy ? <p>正在读取当前资料…</p> : w && <><div className="panel-heading"><p>{label[w.status]} · 版本 {w.revision}</p><button disabled={blocked} onClick={() => setTick(x => x + 1)}>刷新详情</button></div><p className="muted">仅展示当前有权读取的内容。受限条目不会暴露文件、人员或作品身份；移除关系不删除原始资料。</p>{'items' in w ? <><p>{label[w.origin]}</p><p className="pre-line">{w.description || '暂无说明'}</p><p className="muted">{w.originNote}</p><div className="panel-heading"><h3>作品图片</h3>{w.canEdit && <button onClick={() => setAdding('asset')} disabled={blocked}>添加已有图片</button>}</div><div className="wp-assets">{w.items.map((e, i) => <section className="wp-asset" key={e.id} data-work-entry={e.id}>{e.asset ? <><img src={'/api/v1/assets/' + e.asset.id + '/preview'} alt={e.asset.fileName}/><strong>{e.asset.fileName}</strong></> : <p>该图片当前不可用</p>}<small>{e.isCover ? '封面' : '第 ' + (i + 1) + ' 张'}</small>{w.canEdit && <div className="wp-buttons"><button disabled={blocked || i === 0} onClick={() => { const ids = w.items.map(x => x.id); [ids[i - 1], ids[i]] = [ids[i]!, ids[i - 1]!]; void m.submit('work.reorder', { expectedRevision: w.revision, entryIds: ids, coverEntryId: w.items.find(x => x.isCover)?.id ?? null }, { id }); }}>上移</button><button disabled={blocked || !e.asset || e.isCover} onClick={() => void m.submit('work.reorder', { expectedRevision: w.revision, entryIds: w.items.map(x => x.id), coverEntryId: e.id }, { id })}>设为封面</button><button disabled={blocked} onClick={() => void m.submit('work.assetRemove', { expectedRevision: w.revision, entryId: e.id }, { id })}>移除图片关系</button></div>}</section>)}</div><div className="panel-heading"><h3>作品署名</h3>{w.canEdit && <button disabled={blocked} onClick={() => setAdding('credit')}>添加署名</button>}</div>{w.credits.map(c => <div className="wp-row" key={c.id}><div><strong>{c.person?.displayName ?? '该署名当前不可用'}</strong><p>{role(c.roleCode)} {c.note}</p></div>{w.canEdit && <button disabled={blocked} onClick={() => void m.submit('work.creditRemove', { expectedRevision: w.revision, entryId: c.id }, { id })}>移除署名</button>}</div>)}<h3>关联项目</h3>{w.projects.map(p => <button key={p.id} disabled={blocked} onClick={() => onNavigate({ kind: 'project', id: p.id })}>{p.title} · {label[p.relation]}</button>)}</> : <><p className="pre-line">{w.brief || '暂无需求说明'}</p><dl className="detail-grid"><div><dt>地点</dt><dd>{w.locationNote || '待补充'}</dd></div><div><dt>日期说明</dt><dd>{w.dateNote || '待补充'}</dd></div></dl><h3>内部复盘</h3><p className="pre-line">{w.reviewNote || '尚未记录'}</p><div className="panel-heading"><h3>项目人员</h3>{w.canEdit && <button disabled={blocked} onClick={() => setAdding('participant')}>添加项目人员</button>}</div>{w.participants.map(e => <div className="wp-row" key={e.id}><div><strong>{e.person?.displayName ?? '该人员记录当前不可用'}</strong><p>{role(e.roleCode)} · {e.state ? label[e.state] : ''}</p><small>{e.note}</small></div>{w.canEdit && <div><button disabled={blocked || !e.person} onClick={() => { setParticipant(e); setAdding('participantUpdate'); }}>更新参与记录</button><button disabled={blocked} onClick={() => void m.submit('project.participantRemove', { expectedRevision: w.revision, entryId: e.id }, { id })}>移除人员关系</button></div>}</div>)}<div className="panel-heading"><h3>项目作品</h3>{w.canEdit && <button disabled={blocked} onClick={() => setAdding('work')}>关联已有作品</button>}</div>{w.works.map(e => <div className="wp-row" key={e.id}><div>{e.work ? <button disabled={blocked} onClick={() => onNavigate({ kind: 'work', id: e.work!.id })}>{e.work.title}</button> : <strong>该作品当前不可用</strong>}<p>{e.relation ? label[e.relation] : ''}{e.work ? ' · ' + label[e.work.origin] : ''}</p></div>{w.canEdit && <div>{e.work && <button disabled={blocked} onClick={() => void m.submit('project.workLink', { expectedRevision: w.revision, workId: e.work!.id, relation: e.relation === 'REFERENCE' ? 'DELIVERABLE' : 'REFERENCE' }, { id })}>{e.relation === 'REFERENCE' ? '改为交付' : '改为参考'}</button>}<button disabled={blocked} onClick={() => void m.submit('project.workRemove', { expectedRevision: w.revision, entryId: e.id }, { id })}>移除作品关系</button></div>}</div>)}</>}</>}</div><footer className="modal-footer"><button disabled={m.busy || m.unknown} onClick={onClose}>关闭</button>{w && me.permissions.includes('records.write') && <>{w.status === 'ARCHIVED' ? <button disabled={blocked} onClick={() => changeStatus('DRAFT')}>恢复草稿</button> : <><button disabled={blocked} onClick={() => changeStatus('ARCHIVED')}>归档</button><button disabled={blocked} onClick={() => changeStatus(kind === 'work' ? 'ACTIVE' : 'COMPLETED')}>{kind === 'work' ? '标记使用中' : '标记项目完成'}</button><button className="primary" disabled={blocked} onClick={() => setEditing(true)}>编辑{noun(kind)}</button></>}</>}</footer></Modal>;
}
function LinkForm({ kind, root, type, participant, catalog, onClose, onDone }: {
    kind: ProductionKind;
    root: WorkDetail | ProjectDetail;
    type: string;
    participant: Participant | null;
    catalog: CatalogItem[];
    onClose: () => void;
    onDone: () => void;
}) {
    const [picked, setPicked] = useState<Picked | null>(null), [roleCode, setRole] = useState(''), [note, setNote] = useState(participant?.note ?? ''), [state, setState] = useState<'NOMINATED' | 'CONFIRMED' | 'ACTUAL'>(participant?.state ?? 'NOMINATED'), [relation, setRelation] = useState<'REFERENCE' | 'DELIVERABLE'>('REFERENCE');
    const m = useMutation(onDone), people = ['credit', 'participant', 'participantUpdate'].includes(type), update = type === 'participantUpdate';
    const submit = () => {
        const p = { id: root.id }, expectedRevision = root.revision;
        if (type === 'asset' && picked)
            void m.submit('work.assetAdd', { expectedRevision, assetId: picked.id }, p);
        if (type === 'credit' && picked)
            void m.submit('work.creditAdd', { expectedRevision, personId: picked.id, roleCode, note }, p);
        if (type === 'participant' && picked)
            void m.submit('project.participantAdd', { expectedRevision, personId: picked.id, roleCode, note, state }, p);
        if (update && participant)
            void m.submit('project.participantUpdate', { expectedRevision, entryId: participant.id, note, state }, p);
        if (type === 'work' && picked)
            void m.submit('project.workLink', { expectedRevision, workId: picked.id, relation }, p);
    };
    return <Modal title={update ? '更新参与记录' : '添加' + (type === 'asset' ? '作品图片' : type === 'credit' ? '作品署名' : type === 'work' ? '项目作品' : '项目人员')} onClose={() => { if (!m.busy && !m.unknown)
        onClose(); }} wide><form onSubmit={e => { e.preventDefault(); submit(); }}><div className="modal-body"><MutationStatus mutation={m}/><fieldset disabled={m.busy || m.unknown}>{update ? <strong>{participant?.person?.displayName}</strong> : <Picker type={people ? 'person' : type === 'asset' ? 'asset' : 'work'} value={picked} onChange={setPicked}/>} {people && <>{!update && <Field label="贡献角色"><select required value={roleCode} onChange={e => setRole(e.target.value)}><option value="">请选择</option>{catalog.filter(c => c.namespace === 'role' && c.status === 'ACTIVE').map(c => <option key={c.code} value={c.code}>{c.labelZh}</option>)}</select></Field>}{type !== 'credit' && <Field label="参与状态"><select value={state} onChange={e => setState(e.target.value as typeof state)}>{['NOMINATED', 'CONFIRMED', 'ACTUAL'].map(x => <option value={x} key={x}>{label[x]}</option>)}</select></Field>}<Field label={type === 'credit' ? '贡献说明' : '参与事实与依据'} hint={type === 'credit' ? '署名是基于作品来源的人工记录，不自动计为 ONCE 项目经历。' : '只有实际参与才进入合作记录。确认不等于锁定档期；状态可以据实更正。'}><textarea value={note} maxLength={1000} required={type !== 'credit' && state === 'ACTUAL'} minLength={type !== 'credit' && state === 'ACTUAL' ? 4 : 0} onChange={e => setNote(e.target.value)}/></Field></>}{type === 'work' && <Field label="作品关系"><select value={relation} onChange={e => setRelation(e.target.value as typeof relation)}><option value="REFERENCE">参考作品</option><option value="DELIVERABLE">交付作品</option></select></Field>}</fieldset></div><footer className="modal-footer"><button type="button" disabled={m.busy || m.unknown} onClick={onClose}>取消</button><button className="primary" disabled={m.busy || m.unknown || (!update && !picked)}>保存关系</button></footer></form></Modal>;
}
export function PersonProductionPanel({ personId, onOpen }: {
    personId: string;
    onOpen: (s: Selection) => void;
}) {
    const [page, setPage] = useState(1), [tick, setTick] = useState(0), load = useLoad(() => read<PersonProduction>('person.production', { id: personId }, { page: String(page), pageSize: '10' }), personId + ':' + page + ':' + tick);
    return <section className="panel wp-person"><div className="panel-heading"><h3>作品与项目经历</h3><button onClick={() => setTick(x => x + 1)}>刷新关联</button></div><ErrorBox error={load.error}/>{!load.busy && load.data && <><p>当前可见的实际参与项目：{load.data.actualProjectCount} 个。署名与提名不计入实际合作。</p><h4>署名作品</h4>{load.data.works.items.map(w => <button key={w.id} onClick={() => onOpen({ kind: 'work', id: w.id })}>{w.title} · {label[w.origin]}</button>)}<h4>项目记录</h4>{load.data.projects.items.map(p => <button key={p.id} onClick={() => onOpen({ kind: 'project', id: p.id })}>{p.title} · {[...new Set(p.participations.map(e => label[e.state]))].join(' / ')}</button>)}<Pager page={page} pageSize={10} total={Math.max(load.data.works.total, load.data.projects.total)} setPage={setPage}/></>}</section>;
}
