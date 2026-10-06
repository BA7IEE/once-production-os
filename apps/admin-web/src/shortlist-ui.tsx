import {AdminForm,AdminDescriptions} from './foundation/patterns.tsx';
import {TalentDirectory} from './talent-directory.tsx';
import {navigateDirectoryPath} from './directory-state.ts';
import {TalentDirectoryDetail} from './talent-directory-detail.tsx';
import {TalentWorkbench} from './talent-ui.tsx';
import {ProductionDetail} from './production-ui.tsx';
import {CommandRecovery} from './command-recovery.tsx';
import type {Selection} from './production-dto.ts';
import { useEffect, useRef, useState } from 'react';
import { TALENT_VERSION, type TalentDetail } from './talent-dto.ts';
import { ApiError, call, read } from './api.ts';
import type { Inputs } from './generated/requests.ts';
import type { CatalogItem, Me, Page, Receipt, Scope } from './dto.ts';
import type { PersonProduction, WorkDetail, WorkSummary } from './production-dto.ts';
import type { ShortlistDetail, ShortlistItem, ShortlistSummary, TalentSearchPerson, TalentSearchResponse } from './shortlist-dto.ts';
import { ErrorBox, Empty, Field, Modal, PageTitle, Pager, Submit, date, useAction, useLoad } from './ui.tsx';

function useCommand(onDone: (receipt: Receipt) => void) {
    const action = useAction();
    const pending = useRef<null | { op: keyof Inputs; input: Inputs[keyof Inputs]; params: Record<string, string> }>(null);
    const [unknown, setUnknown] = useState(false);
    async function execute<K extends keyof Inputs>(op: K, input: Inputs[K], params: Record<string, string>) {
        pending.current ??= { op, input: structuredClone(input), params };
        const request = pending.current;
        try {
            const receipt = await call<typeof request.op, Receipt>(request.op, request.input, request.params);
            pending.current = null;
            setUnknown(false);
            onDone(receipt);
        }
        catch (error) {
            const unresolved = error instanceof ApiError && error.unknownOutcome;
            setUnknown(unresolved);
            if (!unresolved)
                pending.current = null;
            throw error;
        }
    }
    return {
        ...action,
        unknown,pending:pending.current,
        submit: <K extends keyof Inputs>(op: K, input: Inputs[K], params: Record<string, string> = {}) =>
            action.run(() => execute(op, input, params)),
        retry: () => action.run(async () => {
            if (pending.current)
                await execute(pending.current.op, pending.current.input, pending.current.params);
        })
    };
}
function CommandState({ command }: { command: ReturnType<typeof useCommand> }) {
    return <><ErrorBox error={command.error}/>{command.unknown&&command.pending&&<CommandRecovery operation={command.pending.op} params={command.pending.params} busy={command.busy} onRetry={()=>void command.retry()}/>}</>;
}
function catalogLabel(catalog: CatalogItem[], namespace: string, code: string | null) {
    if (!code)
        return '未确认';
    return catalog.find(x => x.namespace === namespace && x.code === code)?.labelZh ?? code;
}
function CreateShortlist({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
    const scopes = useLoad(() => read<{ items: Scope[] }>('scope.list'), 'shortlist-create-scopes');
    const [title, setTitle] = useState(''), [brief, setBrief] = useState(''), [scopeId, setScopeId] = useState('');
    const command = useCommand(r => onDone(r.resourceId));
    return <Modal title="新建内部候选清单" onClose={() => { if (!command.busy && !command.unknown) onClose(); }}>
        <AdminForm onSubmit={e => { e.preventDefault(); void command.submit('shortlist.create', { title, brief: brief || undefined, scopeId }); }}>
            <div className="modal-body"><CommandState command={command}/><ErrorBox error={scopes.error}/><fieldset disabled={command.busy || command.unknown}>
                <Field label="清单标题"><input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)}/></Field>
                <Field label="需求简述" hint="这里只记录内部筛选需求，不是客户确认、报价、档期或预订。"><textarea maxLength={5000} rows={5} value={brief} onChange={e => setBrief(e.target.value)}/></Field>
                <Field label="协作范围"><select required value={scopeId} onChange={e => setScopeId(e.target.value)}><option value="">请选择</option>{scopes.data?.items.map(s => <option value={s.id} key={s.id}>{s.name} · {s.mode === 'WORKSPACE' ? '内部成员' : '限定成员'}</option>)}</select></Field>
            </fieldset></div>
            <footer className="modal-footer"><button type="button" disabled={command.busy || command.unknown} onClick={onClose}>取消</button><Submit busy={command.busy || scopes.busy}>建立清单</Submit></footer>
        </AdminForm>
    </Modal>;
}

export function AddCandidate({ person, list, catalog, onClose, onDone }: {
    person: Pick<TalentSearchPerson, 'id' | 'displayName' | 'roles'> & {personRoleId?:string|null;allowedRoleIds?:string[]};
    list: ShortlistDetail;
    catalog: CatalogItem[];
    onClose: () => void;
    onDone: () => void;
}) {
    const profile = useLoad(() => read<TalentDetail>('td2.person.get', { id: person.id }), person.id);
    const [roleId, setRoleId] = useState(person.personRoleId??'');
    const roles = profile.data?.facts.personRoles.filter(r => r.usable&&(!person.allowedRoleIds||person.allowedRoleIds.includes(r.id))) ?? [];
    const role = roles.find(r => r.id === roleId);
    const production = useLoad(() => read<PersonProduction>('person.production', { id: person.id }, { page: '1', pageSize: '100' }), person.id);
    const [workId, setWorkId] = useState(''), [selectedAssets, setSelectedAssets] = useState<string[]>([]), [note, setNote] = useState('');
    const work = useLoad<WorkDetail | null>(() => workId ? read<WorkDetail>('work.get', { id: workId }) : Promise.resolve(null), workId || 'no-work');
    const command = useCommand(() => onDone());
    const selectedWork = production.data?.works.items.find(w => w.id === workId);
    return <Modal title={'加入候选 · ' + person.displayName} onClose={() => { if (!command.busy && !command.unknown) onClose(); }} wide>
        <AdminForm onSubmit={e => {
            e.preventDefault();
            if (!profile.data || (profile.data.isTalent && !role)) return;
            void command.submit('shortlist.itemAdd', {
                expectedRevision: list.revision,
                personId: person.id,
                ...(role ? { personRoleId: role.id, personRoleRevision: role.revision } : {}),
                ...(workId ? { workId } : {}),
                workAssetIds: selectedAssets,
                note
            }, { id: list.id });
        }}>
            <div className="modal-body"><CommandState command={command}/><ErrorBox error={profile.error ?? production.error ?? work.error}/>
                <p className="muted">候选只引用当前内部事实。作品必须已有本人在本次职业下的署名；所选图片必须真实属于该作品。</p>
                <fieldset disabled={command.busy || command.unknown}>
                    <AdminDescriptions className="detail-grid"><div><dt>人才</dt><dd>{person.displayName}</dd></div><div><dt>角色</dt><dd>{person.roles.map(r => catalogLabel(catalog, 'role', r)).join(' / ')}</dd></div></AdminDescriptions>
                    {profile.data?.isTalent && <Field label="本次入选职业" hint="同一人可以按不同职业分别入选；不把其他职业的作品算入本次候选。"><select required value={roleId} onChange={e => { setRoleId(e.target.value); setWorkId(''); setSelectedAssets([]); }}><option value="">请选择本次职业</option>{roles.map(r => <option key={r.id} value={r.id}>{catalogLabel(catalog, 'role', String(r.roleCode))}</option>)}</select></Field>}
                    <Field label="关联署名作品（可选）" hint="不选作品也可以先把人才加入清单。"><select value={workId} onChange={e => { setWorkId(e.target.value); setSelectedAssets([]); }}><option value="">暂不关联作品</option>{production.data?.works.items.filter(w => !profile.data?.isTalent || (!!role && w.roles.includes(String(role.roleCode)))).map(w => <option key={w.id} value={w.id}>{w.title} · {w.roles.map(r => catalogLabel(catalog, 'role', r)).join('/')}</option>)}</select></Field>
                    {production.busy && <p>正在读取该人才当前可见的署名作品…</p>}
                    {selectedWork && <p className="muted">已选作品：{selectedWork.title}</p>}
                    {workId && work.busy && <p>正在读取作品图片…</p>}
                    {work.data && <Field label="挑选作品图（最多 12 张）" hint="图片失去来源或范围权限后，候选条目会按当前权限重新判断，不保存公开副本。">
                        <div className="sl-asset-picker">{work.data.items.map(entry => entry.asset ? <label key={entry.id} className={selectedAssets.includes(entry.id) ? 'selected' : ''}>
                            <input type="checkbox" checked={selectedAssets.includes(entry.id)} disabled={!selectedAssets.includes(entry.id) && selectedAssets.length >= 12}
                                onChange={e => setSelectedAssets(e.target.checked ? [...selectedAssets, entry.id] : selectedAssets.filter(x => x !== entry.id))}/>
                            <img src={'/api/v1/assets/' + entry.asset.id + '/preview'} alt={entry.asset.fileName}/>
                            <small>{entry.asset.fileName}</small>
                        </label> : null)}</div>
                    </Field>}
                    <Field label="内部协作备注"><textarea maxLength={2000} rows={4} value={note} onChange={e => setNote(e.target.value)} placeholder="例如：镜头气质、需要进一步确认的事项；不要填写未经证实的结论。"/></Field>
                </fieldset>
            </div>
            <footer className="modal-footer"><button type="button" disabled={command.busy || command.unknown} onClick={onClose}>取消</button><Submit busy={command.busy || profile.busy || !profile.data || (profile.data.isTalent && !role)}>加入当前清单</Submit></footer>
        </AdminForm>
    </Modal>;
}

export function CandidateListChoice({ person, catalog, onClose, onDone }: { person: TalentDetail; catalog: CatalogItem[]; onClose: () => void; onDone: () => void }) {
    const [page, setPage] = useState(1), [selected, setSelected] = useState('');
    const lists = useLoad(() => read<Page<ShortlistSummary>>('shortlist.list', {}, { page: String(page), pageSize: '10' }), page);
    const list = useLoad(() => selected ? read<ShortlistDetail>('shortlist.get', { id: selected }) : Promise.resolve(null), selected);
    if (list.data?.canEdit) return <AddCandidate person={{ id: person.id, displayName: person.displayName, roles: person.facts.personRoles.filter(r => r.usable).map(r => String(r.roleCode)) }} list={list.data} catalog={catalog} onClose={onClose} onDone={onDone}/>;
    return <Modal title="选择候选清单" onClose={onClose}><div className="modal-body"><ErrorBox error={lists.error ?? list.error}/><p>选择已有内部清单，再确认本次入选职业。新清单可在候选工作台建立。</p>{lists.busy ? <p>正在读取清单…</p> : lists.data?.items.map(row => <button key={row.id} disabled={list.busy} onClick={() => setSelected(row.id)}>{row.title}</button>)}{list.data && !list.data.canEdit && <p>当前不能编辑这份清单。</p>}{lists.data && <Pager page={page} pageSize={10} total={lists.data.total} setPage={setPage}/>}</div><footer className="modal-footer"><button onClick={onClose}>返回专业工作台</button></footer></Modal>;
}
function ReviewCandidateRole({ list, item, catalog, onClose, onDone }: { list: ShortlistDetail; item: Extract<ShortlistItem, { unavailable: true }>; catalog: CatalogItem[]; onClose: () => void; onDone: () => void }) {
    const [roleId, setRoleId] = useState(''), [ack, setAck] = useState(false);
    const command = useCommand(onDone), freeze = command.busy || command.unknown;
    const role = item.roleReview?.roles.find(r => r.id === roleId);
    return <Modal title="核实候选职业" onClose={() => { if (!freeze) onClose(); }}><AdminForm onSubmit={e => { e.preventDefault(); if (role && ack) void command.submit('td2.shortlist.role', { schemaVersion: TALENT_VERSION, expectedRevision: list.revision, itemId: item.id, personRoleId: role.id, personRoleRevision: role.revision }, { id: list.id }); }}><div className="modal-body"><CommandState command={command}/><p>{item.roleReview?.person.displayName}：原候选尚未确认职业。请核对原需求，再明确本次职业。</p><fieldset disabled={freeze}><Field label="本次入选职业"><select required value={roleId} onChange={e => setRoleId(e.target.value)}><option value="">请选择</option>{item.roleReview?.roles.map(r => <option key={r.id} value={r.id}>{catalogLabel(catalog, 'role', r.roleCode)}</option>)}</select></Field>{!item.roleReview?.roles.length && <p>目前没有符合关联作品的可用职业，请先核对人物职业和作品署名。</p>}<label><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)}/>我已核对本次候选需求与职业</label></fieldset></div><footer className="modal-footer"><button type="button" disabled={freeze} onClick={onClose}>取消</button><Submit busy={freeze || !role || !ack}>确认候选职业</Submit></footer></AdminForm></Modal>;
}

function EditShortlist({ list, onClose, onDone }: {
    list: ShortlistDetail;
    onClose: () => void;
    onDone: () => void;
}) {
    const [title, setTitle] = useState(list.title), [brief, setBrief] = useState(list.brief);
    const command = useCommand(() => onDone());
    return <Modal title="编辑候选清单" onClose={() => { if (!command.busy && !command.unknown) onClose(); }}>
        <AdminForm onSubmit={e => { e.preventDefault(); void command.submit('shortlist.update', { expectedRevision: list.revision, title, brief }, { id: list.id }); }}>
            <div className="modal-body"><CommandState command={command}/><fieldset disabled={command.busy || command.unknown}>
                <Field label="清单标题"><input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)}/></Field>
                <Field label="需求简述" hint="只写内部筛选需求；报价、档期、客户确认和预订不属于本清单。"><textarea maxLength={5000} rows={6} value={brief} onChange={e => setBrief(e.target.value)}/></Field>
            </fieldset></div>
            <footer className="modal-footer"><button type="button" disabled={command.busy || command.unknown} onClick={onClose}>取消</button><Submit busy={command.busy}>保存清单</Submit></footer>
        </AdminForm>
    </Modal>;
}

function EditNote({ list, item, onClose, onDone }: {
    list: ShortlistDetail;
    item: Exclude<ShortlistItem, { unavailable: true }>;
    onClose: () => void;
    onDone: () => void;
}) {
    const [note, setNote] = useState(item.note);
    const command = useCommand(() => onDone());
    return <Modal title={'编辑备注 · ' + item.person.displayName} onClose={() => { if (!command.busy && !command.unknown) onClose(); }}>
        <AdminForm onSubmit={e => { e.preventDefault(); void command.submit('shortlist.itemUpdate', { expectedRevision: list.revision, entryId: item.id, note }, { id: list.id }); }}>
            <div className="modal-body"><CommandState command={command}/><fieldset disabled={command.busy || command.unknown}><Field label="内部协作备注"><textarea maxLength={2000} rows={6} value={note} onChange={e => setNote(e.target.value)}/></Field></fieldset></div>
            <footer className="modal-footer"><button type="button" disabled={command.busy || command.unknown} onClick={onClose}>取消</button><Submit busy={command.busy}>保存备注</Submit></footer>
        </AdminForm>
    </Modal>;
}

function ShortlistDetailPanel({ id, catalog, onChanged }: { id: string; catalog: CatalogItem[]; onChanged: () => void }) {
    const [roleReview, setRoleReview] = useState<Extract<ShortlistItem, { unavailable: true }> | null>(null);
    const [tick, setTick] = useState(0), [edit, setEdit] = useState<Exclude<ShortlistItem, { unavailable: true }> | null>(null), [editingRoot, setEditingRoot] = useState(false);
    const load = useLoad(() => read<ShortlistDetail>('shortlist.get', { id }), id + ':' + tick);
    const command = useCommand(() => { setTick(x => x + 1); onChanged(); });
    const list = load.data;
    const reorder = (index: number, delta: number) => {
        if (!list)
            return;
        const ids = list.items.map(x => x.id), target = index + delta;
        if (target < 0 || target >= ids.length)
            return;
        [ids[index], ids[target]] = [ids[target]!, ids[index]!];
        void command.submit('shortlist.reorder', { expectedRevision: list.revision, entryIds: ids }, { id: list.id });
    };
    return <section className="panel sl-detail"><div className="panel-heading"><div><h2>{list?.title ?? '候选清单'}</h2><p>{list?.brief || '暂无需求简述'}</p></div><div className="button-row">{list?.canEdit && <button onClick={() => setEditingRoot(true)}>编辑清单</button>}<button onClick={() => setTick(x => x + 1)}>刷新</button></div></div>
        <div className="padded"><CommandState command={command}/><ErrorBox error={load.error}/>{load.busy && <p>正在按当前权限读取候选条目…</p>}
            {list && !list.items.length && <Empty title="这份清单还没有候选人">点击“继续找人”，勾选人才后加入这份清单。</Empty>}
            {list?.items.map((item, index) => item.unavailable ? <article className="sl-item unavailable" key={item.id}>
                <div>{item.roleReview ? <><strong>{item.roleReview.person.displayName} · 待核实职业</strong><p>确认本次职业后，才显示完整候选内容。</p>{list.canEdit && <button disabled={command.busy || command.unknown} onClick={() => setRoleReview(item)}>核实候选职业</button>}</> : <><strong>该条目当前不可用</strong><p>人才、来源、作品或图片的当前权限/有效性无法完整证明，因此不显示原姓名、作品和备注。</p></>}</div>
                {list.canEdit && <div className="wp-buttons"><button disabled={command.busy || index === 0} onClick={() => reorder(index, -1)}>上移</button><button disabled={command.busy || index === list.items.length - 1} onClick={() => reorder(index, 1)}>下移</button><button className="danger" disabled={command.busy} onClick={() => void command.submit('shortlist.itemRemove', { expectedRevision: list.revision, entryId: item.id }, { id: list.id })}>移除占位</button></div>}
            </article> : <article className="sl-item" key={item.id}>
                <div className="sl-item-head"><div><strong>{item.person.displayName}</strong><small>{item.roleCode ? catalogLabel(catalog, 'role', item.roleCode) : item.person.roles.map(r => catalogLabel(catalog, 'role', r)).join(' / ')} · {catalogLabel(catalog, 'city', item.person.cityCode)}</small></div>{item.updatedSinceAdded && <span className="tag tag-stale">加入后资料有变化</span>}</div>
                {item.work && <p><b>署名作品：</b>{item.work.title}</p>}
                {!!item.selectedAssets.length && <div className="sl-selected-assets">{item.selectedAssets.map(x => <img key={x.id} src={'/api/v1/assets/' + x.asset.id + '/preview'} alt={x.asset.fileName}/>)}</div>}
                <p className="pre-line">{item.note || '暂无内部备注'}</p>
                {list.canEdit && <div className="wp-buttons"><button disabled={command.busy || index === 0} onClick={() => reorder(index, -1)}>上移</button><button disabled={command.busy || index === list.items.length - 1} onClick={() => reorder(index, 1)}>下移</button><button disabled={command.busy} onClick={() => setEdit(item)}>编辑备注</button><button className="danger" disabled={command.busy} onClick={() => void command.submit('shortlist.itemRemove', { expectedRevision: list.revision, entryId: item.id }, { id: list.id })}>移出清单</button></div>}
            </article>)}
        </div>{editingRoot && list && <EditShortlist list={list} onClose={() => setEditingRoot(false)} onDone={() => { setEditingRoot(false); setTick(x => x + 1); onChanged(); }}/>}
        {roleReview && list && <ReviewCandidateRole list={list} item={roleReview} catalog={catalog} onClose={() => setRoleReview(null)} onDone={() => { setRoleReview(null); setTick(x => x + 1); onChanged(); }}/>}
        {edit && list && <EditNote list={list} item={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); setTick(x => x + 1); onChanged(); }}/>}
    </section>;
}

export function ShortlistWorkbench({me,catalog}:{me:Me;catalog:CatalogItem[]}) {
 const fromPath=()=>location.pathname.startsWith('/workspace/shortlists/')?location.pathname.split('/')[3]??null:null;
 const [selectedListId,setSelectedListId]=useState<string|null>(fromPath),[finding,setFinding]=useState(()=>location.pathname.endsWith('/find')),[creating,setCreating]=useState(false),[tick,setTick]=useState(0),[page,setPage]=useState(1),[q,setQ]=useState(''),[search,setSearch]=useState(''),[personId,setPersonId]=useState<string|null>(null),[advanced,setAdvanced]=useState(false),[production,setProduction]=useState<Selection|null>(null);
 useEffect(()=>{const pop=()=>{setSelectedListId(fromPath());setFinding(location.pathname.endsWith('/find'));setPersonId(null);};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
 const open=(id:string|null,find=false)=>{setSelectedListId(id);setFinding(find);navigateDirectoryPath('/workspace/shortlists'+(id?'/'+id+(find?'/find':''):''));};
 const lists=useLoad(()=>read<Page<ShortlistSummary>>('shortlist.list',{}, {page:String(page),pageSize:'20',q:search}),page+':'+search+':'+tick);
 const current=useLoad(()=>selectedListId?read<ShortlistDetail>('shortlist.get',{id:selectedListId}):Promise.resolve(null),String(selectedListId)+':'+tick);
 return <><PageTitle overline="候选" title={selectedListId?current.data?.title??'候选清单':'候选清单'} description={finding?'查找人才，勾选后加入当前清单。':'围绕一次工作组织候选人才、备注和精选作品。'} action={!selectedListId&&me.permissions.includes('records.write')?<button className="primary" onClick={()=>setCreating(true)}>＋ 新建清单</button>:undefined}/>
 {selectedListId?<><div className="detail-actions"><button onClick={()=>{setPersonId(null);open(null);}}>← 所有清单</button>{finding?<button onClick={()=>{setPersonId(null);open(selectedListId);}}>查看清单中的人才</button>:current.data?.canEdit&&<button className="primary" onClick={()=>open(selectedListId,true)}>继续找人</button>}</div><ErrorBox error={current.error}/>{finding?(personId?<TalentDirectoryDetail id={personId} me={me} catalog={catalog} onClose={()=>setPersonId(null)} onAdvanced={()=>setAdvanced(true)} onProduction={setProduction} onViewList={id=>open(id)}/>:<TalentDirectory surface="candidate" me={me} catalog={catalog} onOpen={setPersonId} targetListId={selectedListId} onAdded={()=>setTick(t=>t+1)} onViewList={id=>open(id)}/>):<ShortlistDetailPanel key={selectedListId} id={selectedListId} catalog={catalog} onChanged={()=>setTick(t=>t+1)}/>}</>:<><AdminForm className="inline-search" onSubmit={e=>{e.preventDefault();setSearch(q);setPage(1);}}><Field label="查找清单"><input value={q} onChange={e=>setQ(e.target.value)} maxLength={160} placeholder="按清单标题查找"/></Field><button type="submit">查找</button></AdminForm><ErrorBox error={lists.error}/>{lists.busy?<p role="status">正在读取清单…</p>:lists.data&&<><div className="shortlist-grid">{lists.data.items.map(list=><button className="panel shortlist-card" key={list.id} onClick={()=>open(list.id)}><h2>{list.title}</h2><p>{list.brief||'暂无需求简述'}</p><small>更新于 {date(list.updatedAt)}</small><span>打开清单 →</span></button>)}</div>{!lists.data.items.length&&<Empty title="暂无候选清单">先新建一份清单，记录这次工作的筛选需求。</Empty>}<Pager page={page} pageSize={20} total={lists.data.total} setPage={setPage}/></>}</>}
 {creating&&<CreateShortlist onClose={()=>setCreating(false)} onDone={id=>{setCreating(false);setTick(t=>t+1);open(id);}}/>}
 {advanced&&personId&&<TalentWorkbench personId={personId} me={me} catalog={catalog} onClose={()=>setAdvanced(false)} onChange={()=>setTick(t=>t+1)}/>}
 {production&&<ProductionDetail selection={production} me={me} catalog={catalog} onClose={()=>setProduction(null)} onNavigate={setProduction}/>}
 </>;
}
