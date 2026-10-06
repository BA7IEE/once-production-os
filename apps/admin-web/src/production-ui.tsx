import {AdminForm,AdminDescriptions} from './foundation/patterns.tsx';
import {LocaleWorkspace} from './locale-ui.tsx';
import { useEffect, useRef, useState } from 'react';
import { ApiError, call, read } from './api.ts';
import type { Inputs } from './generated/requests.ts';
import type { Me, Page, Receipt, CatalogItem, Source } from './dto.ts';
import type { ProductionKind, Selection, WorkSummary, WorkDetail, ProjectSummary, ProjectDetail, PersonProduction, Participant, Credit } from './production-dto.ts';
import { Modal, Field, ErrorBox, Empty, PageTitle, Pager, useLoad, useAction, date } from './ui.tsx';
import {EditorFrame} from './ux-controls.tsx';
import {CommandRecovery} from './command-recovery.tsx';
import {useUnsaved,allowLeave} from './unsaved.ts';
import {navigateDirectoryPath} from './directory-state.ts';
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
    return { ...a, unknown, pending:pending.current, submit: <K extends keyof Inputs>(op: K, input: Inputs[K], params: Record<string, string> = {}) => a.run(() => execute(op, input, params)),
        retry: () => a.run(async () => { if (pending.current)
            await execute(pending.current.op, pending.current.input, pending.current.params); }) };
}
function MutationStatus({ mutation }: {
    mutation: ReturnType<typeof useMutation>;
}) { return <><ErrorBox error={mutation.error}/>{mutation.unknown&&mutation.pending&&<CommandRecovery operation={mutation.pending.op} params={mutation.pending.params} busy={mutation.busy} onRetry={()=>void mutation.retry()}/>}</>; }
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
    const [page, setPage] = useState(1), [q, setQ] = useState(''), [filter, setFilter] = useState(''), [tick, setTick] = useState(0), [create, setCreate] = useState(false), [selection, setSelection] = useState<Selection | null>(()=>location.pathname.split('/')[3]?{kind,id:location.pathname.split('/')[3]!}:null);
    const open=(next:Selection|null)=>{if(!allowLeave())return;setSelection(next);navigateDirectoryPath('/workspace/'+((next?.kind??kind)==='project'?'projects':'works')+(next?'/'+next.id:''));if(next&&next.kind!==kind)window.dispatchEvent(new PopStateEvent('popstate'));};
    useEffect(()=>{const pop=()=>setSelection(location.pathname.split('/')[3]?{kind,id:location.pathname.split('/')[3]!}:null);window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[kind]);
    const load = useLoad(() => read<Page<WorkSummary | ProjectSummary>>(kind === 'work' ? 'work.list' : 'project.list', {}, { page: String(page), pageSize: '20', ...(filter ? { q: filter } : {}) }), [kind, page, filter, tick].join(':'));
    if(create)return <RootForm kind={kind} catalog={catalog} onClose={()=>setCreate(false)} onDone={r=>{setCreate(false);setTick(x=>x+1);open({kind,id:r.resourceId});}}/>;
    if(selection)return <ProductionDetail key={selection.kind+selection.id} selection={selection} me={me} catalog={catalog} onClose={()=>{open(null);setTick(x=>x+1);}} onNavigate={open}/>;
    return <><PageTitle overline={kind === 'work' ? 'PORTFOLIO' : 'PROJECT RECORDS'} title={noun(kind) + '库'} description={kind === 'work' ? '整理作品与案例，记录素材、署名和制作归属。' : '记录制作需求、参与人员、作品和实际合作。'} action={me.permissions.includes('records.write') ? <button className="primary" onClick={() => setCreate(true)}>新增{noun(kind)}</button> : undefined}/><div className="filters"><input aria-label={'搜索' + noun(kind)} value={q} onChange={e => setQ(e.target.value)} maxLength={160}/><button onClick={() => { setFilter(q); setPage(1); }}>搜索</button><button onClick={() => setTick(x => x + 1)}>刷新</button></div><ErrorBox error={load.error}/>{load.busy ? <p>正在读取当前可见记录…</p> : load.data && <><div className="people-grid">{load.data.items.map(w => <button key={w.id} className="person-card" onClick={() => open({ kind, id: w.id })}><>{'coverAssetId' in w&&w.coverAssetId?<img className="production-cover" loading="lazy" src={'/api/v1/assets/'+w.coverAssetId+'/preview'} alt={w.title+'的封面'}/>:null}<h3>{w.title}</h3><p>{label[w.status]}{'origin' in w ? ' · ' + label[w.origin] : ''}</p><small>{date(w.updatedAt)}</small></></button>)}</div>{!load.data.items.length && <Empty title={'暂无可见' + noun(kind)}>可以先建草稿，之后补充素材、人员与制作事实。</Empty>}<Pager page={page} pageSize={20} total={load.data.total} setPage={setPage}/></>}</>;
}
function RootForm({ kind, existing, catalog, onClose, onDone }: {
    kind: ProductionKind;
    existing?: WorkDetail | ProjectDetail;
    catalog: CatalogItem[];
    onClose: () => void;
    onDone: (r: Receipt) => void;
}) {
    const [title, setTitle] = useState(existing?.title ?? ''), [description, setDescription] = useState(existing ? ('description' in existing ? existing.description : existing.brief) : ''), [origin, setOrigin] = useState<WorkSummary['origin']>(existing && 'origin' in existing ? existing.origin : 'UNKNOWN'), [originNote, setOriginNote] = useState(existing && 'originNote' in existing ? existing.originNote : ''), [locationNote, setLocation] = useState(existing && 'locationNote' in existing ? existing.locationNote : ''), [dateNote, setDateNote] = useState(existing && 'dateNote' in existing ? existing.dateNote : ''), [reviewNote, setReview] = useState(existing && 'reviewNote' in existing ? existing.reviewNote : '');
    const work = existing && 'origin' in existing ? existing : undefined;
    const [caseDate,setCaseDate]=useState(work?.caseDate??''),[datePrecision,setDatePrecision]=useState<NonNullable<WorkSummary['datePrecision']>>(work?.datePrecision??'UNKNOWN'),[location,setCaseLocation]=useState(work?.location??''),[brandDisplayName,setBrandName]=useState(work?.brandDisplayName??'');
    const [industryCode, setIndustry] = useState(work?.industryCode ?? ''), [workTypeCodes, setWorkTypes] = useState<string[]>(work?.workTypeCodes ?? []);
    const [source, setSource] = useState<Picked | null>(null), [mode, setMode] = useState('existing'), [provider, setProvider] = useState(''), [basis, setBasis] = useState('');
    const fingerprint=JSON.stringify([title,description,origin,originNote,locationNote,dateNote,reviewNote,caseDate,datePrecision,location,brandDisplayName,industryCode,workTypeCodes,source?.id,mode,provider,basis]),initial=useRef(fingerprint),markSaved=useUnsaved(fingerprint!==initial.current,noun(kind)+'编辑');
    const m=useMutation(r=>{markSaved();onDone(r);}),close=()=>{if(!m.busy&&!m.unknown&&allowLeave()){markSaved();onClose();}};
    const submit = () => {
        const sourceFields = mode === 'existing' ? { sourceId: source?.id } : { inlineSource: { title: title.slice(0, 100) + '的内部来源', type: 'MANUAL' as const, providerClaim: provider, basisMode: 'TEMP_ORGANIZE' as const, basisDescription: basis } };
        if (kind === 'work')
            void m.submit(existing ? 'work.update' : 'work.create', existing ? { expectedRevision: existing.revision, title, description,caseDate:datePrecision==='UNKNOWN'?null:caseDate,datePrecision,location,brandDisplayName, industryCode: industryCode || null, workTypeCodes, origin, originNote } : { title, description,caseDate:datePrecision==='UNKNOWN'?null:caseDate,datePrecision,location,brandDisplayName, industryCode: industryCode || null, workTypeCodes, origin, originNote, ...sourceFields }, existing ? { id: existing.id } : {});
        else
            void m.submit(existing ? 'project.update' : 'project.create', existing ? { expectedRevision: existing.revision, title, brief: description, locationNote, dateNote, reviewNote } : { title, brief: description, locationNote, dateNote, ...sourceFields }, existing ? { id: existing.id } : {});
    };
    return <EditorFrame title={(existing ? '编辑' : '新增') + noun(kind)} onClose={close}><AdminForm onSubmit={e => { e.preventDefault(); submit(); }}><div className="modal-body"><MutationStatus mutation={m}/><fieldset disabled={m.busy || m.unknown}><Field label={noun(kind) + '标题'}><input required value={title} maxLength={160} onChange={e => setTitle(e.target.value)}/></Field><Field label={kind === 'work' ? '作品说明' : '项目需求'}><textarea value={description} maxLength={5000} onChange={e => setDescription(e.target.value)}/></Field>{kind === 'work' ? <><Field label="案例时间精度"><select value={datePrecision} onChange={e=>{setDatePrecision(e.target.value as typeof datePrecision);setCaseDate('');}}>{[['UNKNOWN','未知'],['YEAR','仅年份'],['MONTH','年月'],['DAY','完整日期'],['APPROXIMATE','大致时间']].map(([code,title])=><option key={code} value={code}>{title}</option>)}</select></Field>{datePrecision!=='UNKNOWN'&&<Field label="案例时间"><input required value={caseDate} maxLength={100} onChange={e=>setCaseDate(e.target.value)}/></Field>}<Field label="拍摄地点"><input value={location} maxLength={500} onChange={e=>setCaseLocation(e.target.value)}/></Field><Field label="品牌展示名称"><input value={brandDisplayName} maxLength={200} onChange={e=>setBrandName(e.target.value)}/></Field><Field label="行业" hint="行业是作品事实；未知可留空，不会自动回写到人才档案。"><select value={industryCode} onChange={e => setIndustry(e.target.value)}><option value="">未确认</option>{catalog.filter(x => x.namespace === 'industry' && (x.status === 'ACTIVE' || x.code === industryCode)).map(x => <option key={x.code} value={x.code}>{x.labelZh}{x.status === 'INACTIVE' ? '（停用）' : ''}</option>)}</select></Field><Field label="作品类型" hint="可多选，例如产品摄影、品牌片、短视频；停用项只保留已有引用。"><div className="check-grid">{catalog.filter(x => x.namespace === 'workType' && (x.status === 'ACTIVE' || workTypeCodes.includes(x.code))).map(x => <label key={x.code} className={'check-chip' + (workTypeCodes.includes(x.code) ? ' checked' : '')}><input type="checkbox" checked={workTypeCodes.includes(x.code)} disabled={x.status === 'INACTIVE' && !workTypeCodes.includes(x.code)} onChange={e => setWorkTypes(e.target.checked ? [...workTypeCodes, x.code] : workTypeCodes.filter(code => code !== x.code))}/>{x.labelZh}{x.status === 'INACTIVE' ? '（停用）' : ''}</label>)}</div></Field><Field label="制作归属"><select value={origin} onChange={e => setOrigin(e.target.value as WorkSummary['origin'])}>{['UNKNOWN', 'EXTERNAL', 'ONCE'].map(x => <option value={x} key={x}>{label[x]}</option>)}</select></Field><Field label="制作归属依据" hint="记录事实依据，不代表已自动核验。外部作品不会因关联项目变成 ONCE 作品。"><textarea required={origin === 'ONCE'} minLength={origin === 'ONCE' ? 4 : 0} value={originNote} maxLength={2000} onChange={e => setOriginNote(e.target.value)}/></Field></> : <><Field label="地点说明"><input value={locationNote} maxLength={500} onChange={e => setLocation(e.target.value)}/></Field><Field label="日期说明" hint="可填写实际拍摄日期或待定，不是人员排期或锁档。"><input value={dateNote} maxLength={500} onChange={e => setDateNote(e.target.value)}/></Field>{existing && <Field label="内部复盘"><textarea value={reviewNote} maxLength={5000} onChange={e => setReview(e.target.value)}/></Field>}</>}{!existing && <><Field label="记录来源"><select value={mode} onChange={e => setMode(e.target.value)}><option value="existing">选择已有来源</option><option value="inline">补充临时接收依据（仅本人，最长7天）</option></select></Field>{mode === 'existing' ? <Picker type="source" value={source} onChange={setSource}/> : <><Field label="提供者或记录方式"><input required value={provider} maxLength={200} onChange={e => setProvider(e.target.value)}/></Field><Field label="内部接收依据"><textarea required minLength={4} value={basis} maxLength={2000} onChange={e => setBasis(e.target.value)}/></Field></>}</>}</fieldset></div><footer className="modal-footer"><button type="button" disabled={m.busy || m.unknown} onClick={close}>取消</button><button className="primary" disabled={m.busy || m.unknown || (!existing && mode === 'existing' && !source)}>保存{noun(kind)}</button></footer></AdminForm></EditorFrame>;
}
export function ProductionDetail({ selection, me, catalog, onClose, onNavigate }: {
    selection: Selection;
    me: Me;
    catalog: CatalogItem[];
    onClose: () => void;
    onNavigate: (s: Selection) => void;
}) {
    const [upgrading,setUpgrading]=useState<Credit|null>(null),[locales,setLocales]=useState(false),[parties,setParties]=useState(false);
    const { kind, id } = selection, [tick, setTick] = useState(0), [editing, setEditing] = useState(false), [adding, setAdding] = useState<string | null>(null), [participant, setParticipant] = useState<Participant | null>(null);
    const load = useLoad<WorkDetail | ProjectDetail>(() => kind === 'work' ? read<WorkDetail>('work.get', { id }) : read<ProjectDetail>('project.get', { id }), [kind, id, tick].join(':'));
    const m = useMutation(() => setTick(x => x + 1)), w = load.data;
    const role = (c: string | null) => catalog.find(x => x.namespace === 'role' && x.code === c)?.labelZh ?? c;
    if(upgrading&&w&&kind==='work')return <LegacyCreditUpgrade work={w as WorkDetail} credit={upgrading} catalog={catalog} onClose={()=>setUpgrading(null)} onDone={()=>{setUpgrading(null);setTick(x=>x+1);}}/>;
    if(parties&&w&&kind==='project')return <PartyWorkspace root={w as ProjectDetail} onClose={()=>{setParties(false);setTick(x=>x+1);}}/>;
    if(locales&&w)return <LocaleWorkspace kind={kind==='work'?'WORK':'PROJECT'} id={id} canWrite={w.canEdit} onClose={()=>setLocales(false)}/>;
    if (editing && w)
        return <RootForm kind={kind} existing={w} catalog={catalog} onClose={() => setEditing(false)} onDone={() => { setEditing(false); setTick(x => x + 1); }}/>;
    if (adding && w)
        return <LinkForm kind={kind} root={w} type={adding} participant={participant} catalog={catalog} onClose={() => { setAdding(null); setParticipant(null); }} onDone={() => { setAdding(null); setParticipant(null); setTick(x => x + 1); }}/>;
    const blocked = m.busy || m.unknown || load.busy;
    const changeStatus = (status: string) => { if (w)
        void m.submit(kind === 'work' ? 'work.update' : 'project.update', { expectedRevision: w.revision, status: status as 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'COMPLETED' }, { id }); };
    return <EditorFrame title={w?.title ?? noun(kind) + '详情'} onClose={() => {if(!m.unknown&&!m.busy)onClose();}}><div className="modal-body"><MutationStatus mutation={m}/><ErrorBox error={load.error}/>{load.busy ? <p>正在读取当前资料…</p> : w && <><div className="panel-heading"><p>{label[w.status]} · 版本 {w.revision}</p><button disabled={blocked} onClick={() => setTick(x => x + 1)}>刷新详情</button></div><button disabled={blocked} onClick={()=>setLocales(true)}>内部中英文文本</button><p className="muted">仅展示当前有权读取的内容。受限条目不会暴露文件、人员或作品身份；移除关系不删除原始资料。</p>{'items' in w ? <><p>{label[w.origin]}</p><AdminDescriptions className="detail-grid"><div><dt>行业</dt><dd>{w.industryCode ? catalog.find(x => x.namespace === 'industry' && x.code === w.industryCode)?.labelZh ?? w.industryCode : '未确认'}</dd></div><div><dt>作品类型</dt><dd>{w.workTypeCodes.length ? w.workTypeCodes.map(code => catalog.find(x => x.namespace === 'workType' && x.code === code)?.labelZh ?? code).join(' / ') : '未确认'}</dd></div></AdminDescriptions><p className="pre-line">{w.description || '暂无说明'}</p><p className="muted">{w.originNote}</p><div className="panel-heading"><h3>作品素材</h3>{w.canEdit && <button onClick={() => setAdding('asset')} disabled={blocked}>添加已有素材</button>}</div><div className="wp-assets">{w.items.map((e, i) => <section className="wp-asset" key={e.id} data-work-entry={e.id}>{e.asset ? <>{e.asset.mime==='video/mp4'?<video className="private-preview" controls preload="none" poster={'/api/v1/assets/'+e.asset.id+'/preview'} src={'/api/v1/assets/'+e.asset.id+'/playback'}/>:e.asset.mime==='application/pdf'?<p>PDF附件（未解析）</p>:<img src={'/api/v1/assets/' + e.asset.id + '/preview'} alt={e.asset.fileName}/>}<strong>{e.asset.fileName}</strong></> : <p>该图片当前不可用</p>}<small>{e.isCover ? '封面' : '第 ' + (i + 1) + ' 张'}</small>{w.canEdit && <div className="wp-buttons"><button disabled={blocked || i === 0} onClick={() => { const ids = w.items.map(x => x.id); [ids[i - 1], ids[i]] = [ids[i]!, ids[i - 1]!]; void m.submit('work.reorder', { expectedRevision: w.revision, entryIds: ids, coverEntryId: w.items.find(x => x.isCover)?.id ?? null }, { id }); }}>上移</button><button disabled={blocked || !e.asset || e.isCover} onClick={() => void m.submit('work.reorder', { expectedRevision: w.revision, entryIds: w.items.map(x => x.id), coverEntryId: e.id }, { id })}>设为封面</button><button disabled={blocked} onClick={() => void m.submit('work.assetRemove', { expectedRevision: w.revision, entryId: e.id }, { id })}>移除素材关系</button></div>}</section>)}</div><div className="panel-heading"><h3>作品署名</h3>{w.canEdit && <button disabled={blocked} onClick={() => setAdding('credit')}>添加署名</button>}</div>{w.credits.map(c => <div className="wp-row" key={c.id}><div><strong>{c.person?.displayName ?? '该署名当前不可用'}</strong><p>{role(c.roleCode)} {c.note}</p></div>{w.canEdit&&me.permissions.includes('sources.review')&&c.person&&!c.personRoleId&&c.revision&&<button disabled={blocked} onClick={()=>setUpgrading(c)}>核对并升级旧署名</button>}{w.canEdit && <button disabled={blocked} onClick={() => void m.submit('work.creditRemove', { expectedRevision: w.revision, entryId: c.id }, { id })}>移除署名</button>}</div>)}<h3>关联项目</h3>{w.projects.map(p => <button key={p.id} disabled={blocked} onClick={() => onNavigate({ kind: 'project', id: p.id })}>{p.title} · {label[p.relation]}</button>)}</> : <><p className="pre-line">{w.brief || '暂无需求说明'}</p><AdminDescriptions className="detail-grid"><div><dt>地点</dt><dd>{w.locationNote || '待补充'}</dd></div><div><dt>日期说明</dt><dd>{w.dateNote || '待补充'}</dd></div></AdminDescriptions><h3>内部复盘</h3><p className="pre-line">{w.reviewNote || '尚未记录'}</p><div className="panel-heading"><h3>项目人员</h3>{w.canEdit && <button disabled={blocked} onClick={() => setAdding('participant')}>添加项目人员</button>}</div>{w.canEdit&&<button disabled={blocked} onClick={()=>setParties(true)}>客户与品牌</button>}<p>客户：{w.parties?.client?.name??'未填写或当前不可见'} · 品牌：{w.parties?.brand?.name??'未填写或当前不可见'}</p>{w.participants.map(e => <div className="wp-row" key={e.id}><div><strong>{e.person?.displayName ?? '该人员记录当前不可用'}</strong><p>{role(e.roleCode)} · {e.state ? label[e.state] : ''}</p><small>{e.note}</small></div>{w.canEdit && <div><button disabled={blocked || !e.person} onClick={() => { setParticipant(e); setAdding('participantUpdate'); }}>更新参与记录</button><button disabled={blocked} onClick={() => void m.submit('project.participantRemove', { expectedRevision: w.revision, entryId: e.id }, { id })}>移除人员关系</button></div>}</div>)}<div className="panel-heading"><h3>项目作品</h3>{w.canEdit && <button disabled={blocked} onClick={() => setAdding('work')}>关联已有作品</button>}</div>{w.works.map(e => <div className="wp-row" key={e.id}><div>{e.work ? <button disabled={blocked} onClick={() => onNavigate({ kind: 'work', id: e.work!.id })}>{e.work.title}</button> : <strong>该作品当前不可用</strong>}<p>{e.relation ? label[e.relation] : ''}{e.work ? ' · ' + label[e.work.origin] : ''}</p></div>{w.canEdit && <div>{e.work && <button disabled={blocked} onClick={() => void m.submit('project.workLink', { expectedRevision: w.revision, workId: e.work!.id, relation: e.relation === 'REFERENCE' ? 'DELIVERABLE' : 'REFERENCE' }, { id })}>{e.relation === 'REFERENCE' ? '改为交付' : '改为参考'}</button>}<button disabled={blocked} onClick={() => void m.submit('project.workRemove', { expectedRevision: w.revision, entryId: e.id }, { id })}>移除作品关系</button></div>}</div>)}</>}</>}</div><footer className="modal-footer"><button disabled={m.busy || m.unknown} onClick={onClose}>关闭</button>{w && me.permissions.includes('records.write') && <>{w.status === 'ARCHIVED' ? <button disabled={blocked} onClick={() => changeStatus('DRAFT')}>恢复草稿</button> : <><button disabled={blocked} onClick={() => changeStatus('ARCHIVED')}>归档</button><button disabled={blocked} onClick={() => changeStatus(kind === 'work' ? 'ACTIVE' : 'COMPLETED')}>{kind === 'work' ? '标记使用中' : '标记项目完成'}</button><button className="primary" disabled={blocked} onClick={() => setEditing(true)}>编辑{noun(kind)}</button></>}</>}</footer></EditorFrame>;
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
    const fingerprint=JSON.stringify([picked?.id,roleCode,note,state,relation]),initial=useRef(fingerprint),markSaved=useUnsaved(fingerprint!==initial.current,'关联记录');
    const m=useMutation(()=>{markSaved();onDone();}),close=()=>{if(!m.busy&&!m.unknown&&allowLeave()){markSaved();onClose();}}, people = ['credit', 'participant', 'participantUpdate'].includes(type), update = type === 'participantUpdate';
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
    return <Modal title={update ? '更新参与记录' : '添加' + (type === 'asset' ? '作品图片' : type === 'credit' ? '作品署名' : type === 'work' ? '项目作品' : '项目人员')} onClose={close} wide><AdminForm onSubmit={e => { e.preventDefault(); submit(); }}><div className="modal-body"><MutationStatus mutation={m}/><fieldset disabled={m.busy || m.unknown}>{update ? <strong>{participant?.person?.displayName}</strong> : <Picker type={people ? 'person' : type === 'asset' ? 'asset' : 'work'} value={picked} onChange={setPicked}/>} {people && <>{!update && <Field label="贡献角色"><select required value={roleCode} onChange={e => setRole(e.target.value)}><option value="">请选择</option>{catalog.filter(c => c.namespace === 'role' && c.status === 'ACTIVE').map(c => <option key={c.code} value={c.code}>{c.labelZh}</option>)}</select></Field>}{type !== 'credit' && <Field label="参与状态"><select value={state} onChange={e => setState(e.target.value as typeof state)}>{['NOMINATED', 'CONFIRMED', 'ACTUAL'].map(x => <option value={x} key={x}>{label[x]}</option>)}</select></Field>}<Field label={type === 'credit' ? '贡献说明' : '参与事实与依据'} hint={type === 'credit' ? '署名是基于作品来源的人工记录，不自动计为 ONCE 项目经历。' : '只有实际参与才进入合作记录。确认不等于锁定档期；状态可以据实更正。'}><textarea value={note} maxLength={1000} required={type !== 'credit' && state === 'ACTUAL'} minLength={type !== 'credit' && state === 'ACTUAL' ? 4 : 0} onChange={e => setNote(e.target.value)}/></Field></>}{type === 'work' && <Field label="作品关系"><select value={relation} onChange={e => setRelation(e.target.value as typeof relation)}><option value="REFERENCE">参考作品</option><option value="DELIVERABLE">交付作品</option></select></Field>}</fieldset></div><footer className="modal-footer"><button type="button" disabled={m.busy || m.unknown} onClick={close}>取消</button><button className="primary" disabled={m.busy || m.unknown || (!update && !picked)}>保存关系</button></footer></AdminForm></Modal>;
}
export function PersonProductionPanel({ personId, onOpen }: {
    personId: string;
    onOpen: (s: Selection) => void;
}) {
    const [page, setPage] = useState(1), [tick, setTick] = useState(0), load = useLoad(() => read<PersonProduction>('person.production', { id: personId }, { page: String(page), pageSize: '10' }), personId + ':' + page + ':' + tick);
    return <section className="panel wp-person"><div className="panel-heading"><h3>作品与项目经历</h3><button onClick={() => setTick(x => x + 1)}>刷新关联</button></div><ErrorBox error={load.error}/>{!load.busy && load.data && <><p>当前可见的实际参与项目：{load.data.actualProjectCount} 个。署名与提名不计入实际合作。</p><h4>署名作品</h4>{load.data.works.items.map(w => <button key={w.id} onClick={() => onOpen({ kind: 'work', id: w.id })}>{w.title} · {label[w.origin]}</button>)}<h4>项目记录</h4>{load.data.projects.items.map(p => <button key={p.id} onClick={() => onOpen({ kind: 'project', id: p.id })}>{p.title} · {[...new Set(p.participations.map(e => label[e.state]))].join(' / ')}</button>)}<Pager page={page} pageSize={10} total={Math.max(load.data.works.total, load.data.projects.total)} setPage={setPage}/></>}</section>;
}

interface BrandOption {id:string;name:string;revision:number;status:'ACTIVE'|'ARCHIVED';organization:{id:string;name:string}|null;}
function PartyWorkspace({root,onClose}:{root:ProjectDetail;onClose:()=>void}){
 const [tick,setTick]=useState(0),[client,setClient]=useState(root.parties?.client?.id??''),[brand,setBrand]=useState(root.parties?.brand?.id??''),[name,setName]=useState(''),[organization,setOrganization]=useState(''),[organizationChanged,setOrganizationChanged]=useState(false),[confirm,setConfirm]=useState(false);
 const m=useMutation(()=>{setTick(x=>x+1);}),data=useLoad(async()=>({brands:await read<Page<BrandOption>>('brand.list',{}, {pageSize:'100'}),organizations:await read<Page<{id:string;name:string}>>('td2.organization.list',{}, {pageSize:'100'}),source:await read<Source>('source.get',{id:root.sourceId}),project:await read<ProjectDetail>('project.get',{id:root.id})}),String(tick));
 const frozen=m.busy||m.unknown||data.busy,current=data.data?.project;
 return <Modal title="客户与品牌" onClose={()=>{if(!frozen)onClose();}} wide><div className="modal-body"><MutationStatus mutation={m}/><ErrorBox error={data.error}/>
 <p>客户机构与品牌分别记录；品牌不等于法律主体，也不代表项目已经签约。</p>
 <fieldset disabled={frozen||!!data.error}><Field label="项目客户机构"><select value={client} onChange={e=>setClient(e.target.value)}><option value="">未填写</option>{data.data?.organizations.items.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
 <Field label="项目品牌"><select value={brand} onChange={e=>setBrand(e.target.value)}><option value="">未填写</option>{data.data?.brands.items.filter(b=>b.status==='ACTIVE'||b.id===brand).map(b=><option key={b.id} value={b.id}>{b.name}{b.status==='ARCHIVED'?'（已归档）':''}</option>)}</select></Field>
 <label><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/>确认按上述选择替换项目关联；留空会清除对应关联</label>
 <button disabled={!confirm||!current} onClick={()=>{if(current)void m.submit('project.parties',{expectedRevision:current.revision,clientOrganizationId:client||null,brandId:brand||null},{id:root.id});}}>保存项目关联</button>
 <h3>品牌登记与维护</h3><Field label="品牌名称"><input maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></Field><Field label="品牌所属机构（修改时留空表示清除）"><select value={organization} onChange={e=>{setOrganization(e.target.value);setOrganizationChanged(true);}}><option value="">未确认</option>{data.data?.organizations.items.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
 <p>新增品牌以本项目当前来源为依据，不自动核验品牌所属关系。其他机构可在专业资料工作台登记。</p>
 <button disabled={!name.trim()||!data.data} onClick={()=>{if(data.data)void m.submit('brand.create',{sourceId:root.sourceId,sourceRevision:data.data.source.revision,name,organizationId:organization||null});}}>登记新品牌</button>
 {data.data?.brands.items.map(b=><div key={b.id}><strong>{b.name}</strong> · {b.organization?.name??'机构未确认或当前不可见'} <button onClick={()=>{setBrand(b.id);setName(b.name);setOrganization(b.organization?.id??'');setOrganizationChanged(false);}}>选作编辑对象</button>{brand===b.id&&<><button disabled={!name.trim()||!confirm} onClick={()=>void m.submit('brand.patch',{expectedRevision:b.revision,name,...(organizationChanged?{organizationId:organization||null}:{})},{id:b.id})}>保存品牌修改</button><button onClick={()=>void m.submit('brand.patch',{expectedRevision:b.revision,status:b.status==='ACTIVE'?'ARCHIVED':'ACTIVE'},{id:b.id})}>{b.status==='ACTIVE'?'归档品牌':'恢复品牌'}</button></>}</div>)}
 </fieldset></div><footer className="modal-footer"><button disabled={frozen} onClick={onClose}>返回项目</button></footer></Modal>;
}

function LegacyCreditUpgrade({work,credit,catalog,onClose,onDone}:{work:WorkDetail;credit:Credit;catalog:CatalogItem[];onClose:()=>void;onDone:()=>void}){
 const [roleId,setRoleId]=useState(''),[source,setSource]=useState<Picked|null>(null),[confirmed,setConfirmed]=useState(false);
 const m=useMutation(onDone),roles=useLoad(()=>read<{facts:{personRoles:Array<{id:string;revision:number;roleCode:string;status:string;usable:boolean}>}}>('td2.person.get',{id:credit.person!.id}),credit.person!.id),basis=useLoad(()=>source?read<Source>('source.get',{id:source.id}):Promise.resolve(null),source?.id??'none');
 const candidates=roles.data?.facts.personRoles.filter(r=>r.usable&&r.status==='ACTIVE'&&r.roleCode===credit.roleCode)??[],role=candidates.find(r=>r.id===roleId),blocked=m.busy||m.unknown;
 return <Modal title="核对并升级旧署名" onClose={()=>{if(!blocked)onClose();}}><div className="modal-body"><MutationStatus mutation={m}/><ErrorBox error={roles.error||basis.error}/><p>{credit.person!.displayName} · {work.title}</p><p>保留原署名 ID 和说明，仅补齐明确职业及内部来源。此操作不向本人开放资料；仍须审核其案例申请。</p><fieldset disabled={blocked}><Field label="原署名对应的明确职业"><select value={roleId} onChange={e=>setRoleId(e.target.value)}><option value="">请选择已核对职业</option>{candidates.map(r=><option key={r.id} value={r.id}>{catalog.find(c=>c.namespace==='role'&&c.code===r.roleCode)?.labelZh??r.roleCode}</option>)}</select></Field><h4>独立内部来源</h4><Picker type="source" value={source} onChange={setSource}/><label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>我已核对原署名、职业及独立内部来源</label></fieldset></div><footer className="modal-footer"><button disabled={blocked} onClick={onClose}>取消</button><button disabled={blocked||!confirmed||!role||!basis.data||basis.busy} onClick={()=>{if(role&&basis.data)void m.submit('work.creditUpgrade',{expectedRevision:work.revision,creditId:credit.id,expectedCreditRevision:credit.revision!,personRoleId:role.id,expectedRoleRevision:role.revision,sourceId:basis.data.id,sourceRevision:basis.data.revision},{id:work.id});}}>确认升级旧署名</button></footer></Modal>;
}
