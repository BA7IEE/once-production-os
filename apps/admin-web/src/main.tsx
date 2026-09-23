import { MediaPanel } from './media-ui.tsx';
import { createRoot } from 'react-dom/client';
import { useEffect, useState, createContext, useContext, type ReactNode } from 'react';
import { call, read, resetTransport, acknowledgeSecretInspection, type ApiError } from './api.ts';
import type { Inputs } from './generated/requests.ts';
import type { Me, Person, Page, CatalogItem, Receipt, Source, Membership, Contact, Job, ImportBatch, Scope, Audit, SourceHistoryEntry } from './dto.ts';
import { Modal, Field, ErrorBox, Tag, Empty, date, useLoad, useAction, Submit, PageTitle, Pager, labels } from './ui.tsx';
import './style.css';
import { HandoffInbox, HandoffOffer, FieldReview } from './handoff-ui.tsx';
import { parseStrictJson } from '../../../packages/core/src/json-boundary.ts';
interface Context {
    me: Me;
    catalog: CatalogItem[];
    refreshCatalog: () => void;
}
const Ctx = createContext<Context | null>(null);
function useOS() {
    const c = useContext(Ctx);
    if (!c)
        throw new Error('OS context missing');
    return { ...c, can: (p: string) => c.me.permissions.includes(p), label: (ns: string, code: string) => c.catalog.find(c => c.namespace === ns && c.code === code)?.labelZh ?? code };
}
async function command<K extends keyof Inputs>(op: K, input: Inputs[K], params: Record<string, string> = {}): Promise<Receipt> { return call<K, Receipt>(op, input, params); }
function App() {
    const [me, setMe] = useState<Me | null>(null);
    const [checking, setChecking] = useState(true);
    const [initialError, setInitialError] = useState<unknown>(null);
    const [active, setActive] = useState('dashboard');
    const [catRefresh, setCatRefresh] = useState(0);
    const [handoffPerson, setHandoffPerson] = useState<string | null>(null);
    useEffect(() => {
        read<Me>('identity.me').then(setMe).catch(e => {
            if (e.status !== 401)
                setInitialError(e);
        }).finally(() => setChecking(false));
        const expire = () => { setMe(null); resetTransport(); };
        window.addEventListener('once-session-expired', expire);
        return () => window.removeEventListener('once-session-expired', expire);
    }, []);
    const catalogs = useLoad(() => me ? read<{
        items: CatalogItem[];
    }>('catalog.list') : Promise.resolve({ items: [] }), String(me?.membershipId) + ':' + catRefresh);
    if (checking)
        return <main className="boot">正在连接 ONCE…</main>;
    if (!me)
        return <Auth initialError={initialError} onLogin={async () => { setMe(await read<Me>('identity.me')); setInitialError(null); setActive('dashboard'); }}/>;
    const pages = [['dashboard', '概览', '◈'], ['people', '人才档案', '◎'], ['handoffs', '资料交接', '⇄'], ...(me.permissions.includes('assets.read') ? [['media', '私有图片', '▧']] : []), ...(me.permissions.includes('sources.read') ? [['sources', '资料来源', '▤']] : []), ...(me.permissions.includes('records.write') ? [['imports', '批量导入', '↥']] : []), ...(me.permissions.includes('members.manage') ? [['members', '成员与范围', '▦']] : []), ...(me.permissions.includes('catalog.manage') ? [['catalog', '分类字典', '⋮']] : []), ...(me.permissions.includes('audit.read') ? [['audit', '操作记录', '≡']] : [])];
    return <Ctx.Provider value={{ me, catalog: catalogs.data?.items ?? [], refreshCatalog: () => setCatRefresh(x => x + 1) }}><div className="shell"><aside className="sidebar"><div className="brand">ONCE<span>PRODUCTION OS</span></div><div className="workspace-label"><i />内部工作空间</div><nav>{pages.map(([key, name, icon]) => <button key={key} className={active === key ? 'selected' : ''} onClick={() => setActive(key!)}><span className="nav-icon">{icon}</span>{name}</button>)}</nav><div className="sidebar-foot"><div className="avatar">{me.displayName.slice(0, 1)}</div><div><strong>{me.displayName}</strong><small>{labels[me.role]}</small></div><button aria-label="账号设置" className="account-button" onClick={() => setActive('account')}>⚙</button></div></aside><div className="main"><header className="topbar"><span>制作资源 / {pages.find(p => p[0] === active)?.[1] ?? '账号设置'}</span><div><span className="internal-chip">仅内部使用</span><span className="version">开发增量 01</span></div></header><main className="content"><ErrorBox error={catalogs.error}/>{active === 'dashboard' ? <Dashboard onPeople={() => setActive('people')}/> : active === 'people' ? <People /> : active === 'media' ? <MediaPanel me={me}/> : active === 'sources' ? <Sources /> : active === 'imports' ? <Imports /> : active === 'handoffs' ? <HandoffInbox onOpen={setHandoffPerson}/> : active === 'members' ? <Members /> : active === 'catalog' ? <Catalog /> : active === 'audit' ? <Audits /> : <Account onLogout={() => { setMe(null); resetTransport(); }}/>}{handoffPerson && <PersonDetail id={handoffPerson} onClose={() => setHandoffPerson(null)} onChange={() => { }}/>}</main></div></div></Ctx.Provider>;
}
function Auth({ onLogin, initialError }: {
    onLogin: () => Promise<void>;
    initialError: unknown;
}) {
    const [activate, setActivate] = useState(location.pathname === '/activate');
    const [loginName, setName] = useState('');
    const [password, setPassword] = useState('');
    const [token, setToken] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const a = useAction();
    return <div className="auth-layout"><section className="auth-intro"><div className="brand">ONCE<span>PRODUCTION OS</span></div><div><span className="eyebrow">PEOPLE. WORK. CONNECTIONS.</span><h1>让真实的制作资源<br />积累在一起。</h1><p>人才资料、合作线索和来源记录，<br />从一个有序的内部工作空间开始。</p></div><small>INTERNAL SYSTEM · DEVELOPMENT INCREMENT 01</small></section><main className="auth-panel"><form onSubmit={e => {
            e.preventDefault();
            void a.run(async () => {
                await call('auth.csrf', undefined);
                if (activate) {
                    await call('auth.activate', { token, password });
                    setToken('');
                    setPassword('');
                    setActivate(false);
                    setConfirmed(true);
                }
                else {
                    await call('auth.login', { loginName, password });
                    setPassword('');
                    await onLogin();
                }
            });
        }}><span className="eyebrow">ONCE WORKSPACE</span><h2>{activate ? '激活内部账号' : '登录工作空间'}</h2><p className="muted">{activate ? '使用管理员单独交给你的激活凭证。' : '没有公开注册入口，请联系管理员开通账号。'}</p>{confirmed && <div className="success">账号已激活，请使用登录名与新密码登录。</div>}<ErrorBox error={a.error ?? initialError}/>{activate ? <Field label="激活凭证"><textarea required value={token} onChange={e => setToken(e.target.value)} autoComplete="off" maxLength={100}/></Field> : <Field label="登录名"><input required value={loginName} onChange={e => setName(e.target.value)} autoComplete="username" maxLength={80}/></Field>}<Field label={activate ? '设置密码（至少 12 个字符）' : '密码'}><input required type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={activate ? 12 : 1} maxLength={256} autoComplete={activate ? 'new-password' : 'current-password'}/></Field><Submit busy={a.busy}>{activate ? '激活账号' : '登录'}</Submit><button type="button" className="link-button" onClick={() => { setActivate(!activate); setPassword(''); setToken(''); a.clear(); }}>{activate ? '返回登录' : '我有激活凭证'}</button></form></main></div>;
}
function Dashboard({ onPeople }: {
    onPeople: () => void;
}) {
    const { me } = useOS();
    const [refresh, setRefresh] = useState(0);
    const load = useLoad(() => read<{
        visiblePeople: number;
        visibleSources: number | null;
        recentPeople: Person[];
        pendingJobs: number;
        failedJobs: number;
    }>('dashboard.get'), refresh);
    return <><PageTitle overline="WORKSPACE OVERVIEW" title="内部资源，一处维护" description={`你好，${me.displayName}。以下统计仅包含你当前有权查看的资料。`} action={<button onClick={() => setRefresh(x => x + 1)}>刷新</button>}/><ErrorBox error={load.error}/>{load.busy && !load.data ? <p>正在加载…</p> : load.data && <><div className="stats">{[['人才档案', load.data.visiblePeople, '当前可访问'], ['资料来源', load.data.visibleSources ?? '—', '附带使用依据'], ['待处理任务', load.data.pendingJobs, '本人发起'], ['失败任务', load.data.failedJobs, '需要核对原因']].map(([name, value, hint]) => <div className="stat" key={name}><span>{name}</span><strong>{value}</strong><small>{hint}</small></div>)}</div><section className="panel"><div className="panel-heading"><div><h2>最近入库</h2><p>一个人可以有多个制作角色，不拆成重复档案。</p></div><button onClick={onPeople}>进入人才库 →</button></div>{load.data.recentPeople.length ? <div className="simple-list">{load.data.recentPeople.map(p => <div key={p.id}><div className="avatar">{p.displayName[0]}</div><div><strong>{p.displayName}</strong><small>{date(p.createdAt)}</small></div><Tag value={p.status}/></div>)}</div> : <Empty title="从第一位合作人才开始">不需要先上传作品。记录姓名、制作角色和资料来源即可建立草稿。</Empty>}</section><div className="notice"><strong>当前交付：身份、来源与人才档案</strong><p>本增量没有上线素材、作品、项目、AI 和导出功能。这里只展示本增量已编写对应接口调用的页面；本地合成主链路已验证，完整浏览器清单仍待验收。</p></div></>}</>;
}
function MultiCodes({ namespace, value, onChange }: {
    namespace: CatalogItem['namespace'];
    value: string[];
    onChange: (v: string[]) => void;
}) { const { catalog } = useOS(); return <div className="check-grid">{catalog.filter(c => c.namespace === namespace && (c.status === 'ACTIVE' || value.includes(c.code))).map(c => <label className={'check-chip' + (value.includes(c.code) ? ' checked' : '')} key={c.id}><input type="checkbox" checked={value.includes(c.code)} disabled={c.status === 'INACTIVE' && !value.includes(c.code)} onChange={e => onChange(e.target.checked ? [...value, c.code] : value.filter(v => v !== c.code))}/>{c.labelZh}{c.status === 'INACTIVE' ? '（停用）' : ''}</label>)}</div>; }
function City({ value, onChange }: {
    value: string;
    onChange: (v: string) => void;
}) { const { catalog } = useOS(); return <select value={value} onChange={e => onChange(e.target.value)}><option value="">未确认</option>{catalog.filter(c => c.namespace === 'city' && (c.status === 'ACTIVE' || c.code === value)).map(c => <option key={c.id} value={c.code}>{c.labelZh}{c.status === 'INACTIVE' ? '（停用）' : ''}</option>)}</select>; }
function People() {
    const { can, label } = useOS();
    const [page, setPage] = useState(1);
    const [q, setQ] = useState('');
    const [query, setQuery] = useState('');
    const [role, setRole] = useState('');
    const [refresh, setRefresh] = useState(0);
    const [modal, setModal] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const load = useLoad(() => read<Page<Person>>('person.list', {}, { page: String(page), pageSize: '20', ...(query ? { q: query } : {}), ...(role ? { role } : {}) }), [page, query, role, refresh].join('|'));
    const { catalog } = useOS();
    return <><PageTitle overline="PEOPLE & TALENT" title="人才档案" description="模特、摄影、剪辑、化妆等角色统一建档；来源与访问范围随资料一起管理。" action={can('records.write') ? <button className="primary" onClick={() => setCreating(true)}>＋ 新增人才</button> : undefined}/><form className="filters" onSubmit={e => { e.preventDefault(); setPage(1); setQuery(q); }}><input aria-label="搜索姓名或别名" placeholder="搜索姓名、艺名或别名" value={q} onChange={e => setQ(e.target.value)} maxLength={120}/><select aria-label="筛选角色" value={role} onChange={e => { setRole(e.target.value); setPage(1); }}><option value="">全部角色</option>{catalog.filter(c => c.namespace === 'role').map(c => <option key={c.id} value={c.code}>{c.labelZh}</option>)}</select><button type="submit">搜索</button><button type="button" onClick={() => setRefresh(x => x + 1)}>刷新</button></form><ErrorBox error={load.error}/>{load.busy ? <div className="loading">正在查询当前可见资料…</div> : load.data && <>{load.data.items.length ? <div className="people-grid">{load.data.items.map(p => <button key={p.id} className="person-card" onClick={() => setModal(p.id)}><div className="card-top"><div className="person-monogram">{p.displayName.slice(0, 2)}</div><Tag value={p.status}/></div><h3>{p.displayName}</h3><div className="role-list">{p.roles.map(r => <span key={r}>{label('role', r)}</span>)}</div><p>{p.cityCode ? label('city', p.cityCode) : '城市待确认'}<span> · </span>{p.languageCodes.length ? p.languageCodes.map(c => label('language', c)).join(' / ') : '语言待确认'}</p><footer><span>版本 {p.revision}</span><span>查看档案 ↗</span></footer></button>)}</div> : <Empty title={query ? '没有找到匹配资料' : '还没有当前可见的人才资料'}>未授权、过期或被暂停的来源不会进入此列表。</Empty>}<Pager page={page} pageSize={20} total={load.data.total} setPage={setPage}/></>}{creating && <PersonForm onClose={() => setCreating(false)} onSaved={id => { setCreating(false); setRefresh(x => x + 1); setModal(id); }}/>}{modal && <PersonDetail id={modal} onClose={() => setModal(null)} onChange={() => setRefresh(x => x + 1)}/>}</>;
}
function PersonForm({ person, onClose, onSaved }: {
    person?: Person;
    onClose: () => void;
    onSaved: (id: string) => void;
}) {
    const { can } = useOS();
    const a = useAction();
    const [name, setName] = useState(person?.displayName ?? '');
    const [roles, setRoles] = useState(person?.roles ?? []);
    const [city, setCity] = useState(person?.cityCode ?? '');
    const [languages, setLanguages] = useState(person?.languageCodes ?? []);
    const [skills, setSkills] = useState(person?.skillCodes ?? []);
    const [aliases, setAliases] = useState(person?.aliases.join('\n') ?? '');
    const [height, setHeight] = useState(person?.heightCm?.toString() ?? '');
    const [intro, setIntro] = useState(person?.intro ?? '');
    const [status, setStatus] = useState<Person['status']>(person?.status ?? 'DRAFT');
    const [title, setTitle] = useState('');
    const [provider, setProvider] = useState('');
    const [basis, setBasis] = useState('');
    const [mode, setMode] = useState<'TEMP_ORGANIZE' | 'INTERNAL_USE'>('TEMP_ORGANIZE');
    const [until, setUntil] = useState('');
    const [dirty, setDirty] = useState(false);
    const scopes = useLoad(() => person ? Promise.resolve({ items: [] as Scope[] }) : read<{
        items: Scope[];
    }>('scope.list'), 'scope-choice');
    const [chosenScope, setChosenScope] = useState('');
    const close = () => {
        if (!a.busy && (!dirty || confirm('当前修改尚未保存，确认关闭？')))
            onClose();
    };
    return <Modal title={person ? '编辑人才资料' : '新增人才档案'} onClose={close} wide><form onChange={() => setDirty(true)} onSubmit={e => {
            e.preventDefault();
            void a.run(async () => {
                if (!roles.length)
                    throw new Error('至少选择一个制作角色');
                const profile = { displayName: name, roles, cityCode: city || null, languageCodes: languages, skillCodes: skills, aliases: aliases.split('\n').filter(Boolean), heightCm: height === '' ? null : Number(height), intro };
                let receipt: Receipt;
                if (person) {
                    receipt = await command('person.update', { ...profile, expectedRevision: person.revision, ...(person.access?.mode === 'NATIVE' ? { status } : {}) }, { id: person.id });
                }
                else {
                    const source: Inputs['source.create'] = { title, type: 'MANUAL', providerClaim: provider, basisMode: mode, basisDescription: basis, ...(chosenScope ? { scopeId: chosenScope } : {}) };
                    if (mode === 'INTERNAL_USE') {
                        if (!until)
                            throw new Error('请填写依据的截止日期');
                        source.validUntil = new Date(until).toISOString();
                    }
                    receipt = await command('person.create', { ...profile, inlineSource: source });
                }
                onSaved(receipt.resourceId);
            });
        }}><div className="modal-body"><ErrorBox error={a.error}/><h3 className="section-title">基本资料</h3><div className="form-grid"><Field label="姓名 / 艺名 *"><input required maxLength={120} value={name} onChange={e => setName(e.target.value)}/></Field><Field label="常驻城市"><City value={city} onChange={setCity}/></Field><Field label="制作角色 *" wide><MultiCodes namespace="role" value={roles} onChange={setRoles}/></Field><Field label="工作语言" wide><MultiCodes namespace="language" value={languages} onChange={setLanguages}/></Field><Field label="擅长类型" wide><MultiCodes namespace="skill" value={skills} onChange={setSkills}/></Field><Field label="别名（每行一个）"><textarea value={aliases} onChange={e => setAliases(e.target.value)} maxLength={2400}/></Field><Field label="身高（cm）" hint="未知请留空，不从图片推断。"><input type="number" min={50} max={250} step={0.1} value={height} onChange={e => setHeight(e.target.value)}/></Field><Field label="简介" hint="联系方式请使用单独的受限字段，不要填在简介里。" wide><textarea rows={3} maxLength={5000} value={intro} onChange={e => setIntro(e.target.value)}/></Field>{person?.access?.mode === 'NATIVE' && <Field label="档案状态"><select value={status} onChange={e => setStatus(e.target.value as Person['status'])}><option value="DRAFT">草稿</option><option value="ACTIVE">在库</option><option value="ARCHIVED">归档</option></select></Field>}</div>{!person && <><h3 className="section-title">资料来源与内部使用依据</h3><div className="notice compact">不用先上传文件。先记录资料从哪里来、由谁提供以及本次整理的依据。临时整理默认最长 7 天，仅当前成员可见。</div><div className="form-grid"><Field label="来源标题 *"><input required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：本次联系收到的个人介绍"/></Field><Field label="提供者 / 提供方式 *"><input required maxLength={200} value={provider} onChange={e => setProvider(e.target.value)}/></Field><Field label="本次使用依据" wide><select value={mode} onChange={e => { setMode(e.target.value as typeof mode); setChosenScope(''); }}><option value="TEMP_ORGANIZE">临时整理：个人限定范围，最长 7 天</option>{can('sources.review') && <option value="INTERNAL_USE">已人工核验：允许内部使用，进入内部成员范围</option>}</select></Field><Field label="资料访问范围" wide hint="可保留仅本人范围，建档后用“交给指定同事”发送限时处理邀请；原始证据仍需独立授权。"><select value={chosenScope} onChange={e => setChosenScope(e.target.value)}><option value="">{mode === 'TEMP_ORGANIZE' ? '仅本人（默认，最长 7 天）' : '内部成员（默认）'}</option>{scopes.data?.items.filter(s => mode !== 'TEMP_ORGANIZE' || s.mode === 'RESTRICTED').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field><Field label="依据说明 *" wide hint="写明真实的提供记录和允许用途，不把公开可见当作使用授权。"><textarea required minLength={4} maxLength={2000} rows={3} value={basis} onChange={e => setBasis(e.target.value)}/></Field>{mode === 'INTERNAL_USE' && <Field label="内部使用截止时点 *" hint="按当前设备时区填写，保存为 UTC；到达该时点即失效。"><input required type="datetime-local" value={until} onChange={e => setUntil(e.target.value)}/></Field>}</div></>}</div><footer className="modal-footer"><button type="button" onClick={close} disabled={a.busy}>取消</button><Submit busy={a.busy}>{person ? '保存新版本' : '建立档案'}</Submit></footer></form></Modal>;
}
function PersonDetail({ id, onClose, onChange }: {
    id: string;
    onClose: () => void;
    onChange: () => void;
}) {
    const { me, can, label } = useOS();
    const [refresh, setRefresh] = useState(0);
    const [edit, setEdit] = useState(false);
    const [contacts, setContacts] = useState(false);
    const [sourceId, setSourceId] = useState<string | null>(null);
    const [scope, setScope] = useState(false);
    const [offering, setOffering] = useState(false);
    const [reviewing, setReviewing] = useState(false);
    const load = useLoad(() => read<Person>('person.get', { id }), id + ':' + refresh);
    const a = useAction();
    const changed = () => { setRefresh(x => x + 1); onChange(); };
    if (offering && load.data)
        return <HandoffOffer person={load.data} onClose={() => setOffering(false)} onSaved={() => { setOffering(false); changed(); }}/>;
    if (reviewing && load.data)
        return <FieldReview person={load.data} onClose={() => setReviewing(false)} onSaved={() => { setReviewing(false); changed(); }}/>;
    if (edit && load.data)
        return <PersonForm person={load.data} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); changed(); }}/>;
    if (contacts && load.data)
        return <ContactForm person={load.data} onClose={() => setContacts(false)} onSaved={() => { setContacts(false); changed(); }}/>;
    if (sourceId)
        return <SourceDetail id={sourceId} onClose={() => { setSourceId(null); changed(); }}/>;
    if (scope && load.data)
        return <ScopeChange kind="person" id={id} revision={load.data.revision} onClose={() => setScope(false)} onSaved={() => { setScope(false); changed(); }}/>;
    return <Modal title={load.data?.displayName ?? '人才档案'} onClose={onClose} wide><div className="modal-body"><ErrorBox error={load.error ?? a.error}/>{load.busy ? <p>正在读取资料…</p> : load.data && <><div className="detail-heading"><div className="person-monogram large">{load.data.displayName.slice(0, 2)}</div><div><div className="role-list">{load.data.roles.map(r => <span key={r}>{label('role', r)}</span>)}</div><p className="muted">稳定编号 · {load.data.id}</p><Tag value={load.data.status}/></div></div><dl className="detail-grid"><div><dt>常驻城市</dt><dd>{load.data.cityCode ? label('city', load.data.cityCode) : '未确认'}</dd></div><div><dt>工作语言</dt><dd>{load.data.languageCodes.map(c => label('language', c)).join(' / ') || '未确认'}</dd></div><div><dt>身高</dt><dd>{load.data.heightCm !== null ? load.data.heightCm + ' cm' : '未确认'}</dd></div><div><dt>当前版本</dt><dd>{load.data.revision}</dd></div></dl><h3 className="section-title">简介</h3><p className="pre-line">{load.data.intro || '尚未填写'}</p><h3 className="section-title">来源与核验</h3><div className="source-summary"><div><strong>{load.data.source?.title}</strong><small>依据截止：{date(load.data.source?.validUntil)}</small></div>{load.data.access?.canReadSource && <button onClick={() => setSourceId(load.data!.sourceId)}>查看来源</button>}</div><p className="muted">人工确认仅代表这项字段与当前来源一致，不代表自动认证该人才的专业资质。</p><div className="evidence-list">{(load.data.evidence ?? []).map(e => <div key={e.id}><code>{e.fieldPath}</code><Tag value={e.state}/><small>{date(e.reviewedAt)}</small></div>)}</div>{load.data.access?.mode === 'HANDOFF' && <p className="notice">仅通过交接访问这份基本档案。不包含来源原文、联系方式和历史；接收不等于取得这些权限。</p>}{load.data.access?.canReview && <button onClick={() => setReviewing(true)}>核验字段（选择独立可读证据）</button>}{load.data.access?.mode === 'NATIVE' && <MediaPanel me={me} personId={load.data.id} source={load.data.source} compact/>}<div className="detail-actions">{load.data.access?.canOffer && <button onClick={() => setOffering(true)}>交给指定同事</button>}{load.data.access?.canReadContacts && <button onClick={() => setContacts(true)}>查看受限联系方式</button>}{load.data.access?.canManageScope && <button onClick={() => setScope(true)}>调整访问范围</button>}</div></>}</div><footer className="modal-footer"><button onClick={onClose}>关闭</button>{load.data?.access?.canEdit && <button className="primary" onClick={() => setEdit(true)}>编辑资料</button>}</footer></Modal>;
}
function ContactForm({ person, onClose, onSaved }: {
    person: Person;
    onClose: () => void;
    onSaved: () => void;
}) {
    const { can } = useOS();
    const load = useLoad(() => read<{
        items: Contact[];
    }>('contact.get', { id: person.id }), person.id);
    const [rows, setRows] = useState<Array<{
        kind: Contact['kind'];
        value: string;
        sourceId: string;
    }>>([]);
    const a = useAction();
    useEffect(() => {
        if (load.data)
            setRows(load.data.items.map(c => ({ kind: c.kind, value: c.value, sourceId: c.sourceId })));
    }, [load.data]);
    return <Modal title="受限联系方式" onClose={onClose}><form onSubmit={e => { e.preventDefault(); void a.run(async () => { await command('contact.replace', { expectedRevision: person.revision, contacts: rows }, { id: person.id }); onSaved(); }); }}><div className="modal-body"><div className="notice compact">本次读取将记录审计。联系方式以加密字段保存，不写入普通人才返回或命令回执。</div><ErrorBox error={load.error ?? a.error}/>{load.busy ? <p>校验权限并读取…</p> : rows.map((row, index) => <div className="contact-row" key={index}><select aria-label="联系方式类型" disabled={!can('sensitive.write')} value={row.kind} onChange={e => setRows(rows.map((r, i) => i === index ? { ...r, kind: e.target.value as Contact['kind'] } : r))}><option value="PHONE">电话</option><option value="WECHAT">微信</option><option value="EMAIL">邮箱</option><option value="OTHER">其他</option></select><input aria-label="联系方式" required maxLength={200} readOnly={!can('sensitive.write')} value={row.value} onChange={e => setRows(rows.map((r, i) => i === index ? { ...r, value: e.target.value } : r))}/>{can('sensitive.write') && <button type="button" onClick={() => setRows(rows.filter((_, i) => i !== index))}>移除</button>}</div>)}{!load.busy && can('sensitive.write') && rows.length < 10 && <button type="button" onClick={() => setRows([...rows, { kind: 'EMAIL', value: '', sourceId: person.sourceId }])}>＋ 添加联系方式</button>}</div><footer className="modal-footer"><button type="button" onClick={onClose}>关闭</button>{can('sensitive.write') && !load.error && <Submit busy={a.busy || load.busy}>保存联系方式</Submit>}</footer></form></Modal>;
}
function Sources() { const [page, setPage] = useState(1); const [refresh, setRefresh] = useState(0); const [selected, setSelected] = useState<string | null>(null); const load = useLoad(() => read<Page<Source>>('source.list', {}, { page: String(page), pageSize: '20' }), page + ':' + refresh); return <><PageTitle overline="SOURCE & BASIS" title="资料来源" description="来源、提供者与内部使用依据分开于公开发布；本版本不连接官网。" action={<button onClick={() => setRefresh(x => x + 1)}>刷新</button>}/><ErrorBox error={load.error}/><section className="panel">{load.busy ? <p className="loading">正在加载…</p> : load.data?.items.length ? <div className="table-wrap"><table><thead><tr><th>来源</th><th>依据</th><th>截止时间</th><th>当前状态</th><th /></tr></thead><tbody>{load.data.items.map(s => <tr key={s.id}><td><strong>{s.title}</strong><small>版本 {s.revision}</small></td><td>{s.basisMode === 'TEMP_ORGANIZE' ? '临时整理' : '内部使用'}</td><td>{date(s.validUntil)}</td><td>{s.current ? <Tag value={s.status}/> : <span className="tag tag-failed">当前不可用</span>}</td><td><button onClick={() => setSelected(s.id)}>查看</button></td></tr>)}</tbody></table></div> : <Empty title="暂无可见来源">新增人才时可以同步记录来源，不需要提前创建文件。</Empty>}</section>{load.data && <Pager page={page} pageSize={20} total={load.data.total} setPage={setPage}/>} {selected && <SourceDetail id={selected} onClose={() => { setSelected(null); setRefresh(x => x + 1); }}/>}</>; }
function SourceDetail({ id, onClose }: {
    id: string;
    onClose: () => void;
}) {
    const { can } = useOS();
    const [refresh, setRefresh] = useState(0);
    const load = useLoad(() => read<Source>('source.get', { id }), id + ':' + refresh);
    const [basis, setBasis] = useState('');
    const [until, setUntil] = useState('');
    const [reason, setReason] = useState('');
    const [scope, setScope] = useState(false);
    const a = useAction();
    if (scope && load.data)
        return <ScopeChange kind="source" id={id} revision={load.data.revision} onClose={() => setScope(false)} onSaved={() => { setScope(false); setRefresh(x => x + 1); }}/>;
    return <Modal title="资料来源与使用依据" onClose={onClose} wide><div className="modal-body"><ErrorBox error={load.error ?? a.error}/>{load.busy ? <p>正在读取…</p> : load.data && <><h3>{load.data.title}</h3><dl className="detail-grid"><div><dt>提供者说明</dt><dd>{load.data.providerClaim || '当前不可用，不回显内容'}</dd></div><div><dt>依据截止</dt><dd>{date(load.data.validUntil)}</dd></div><div><dt>状态</dt><dd><Tag value={load.data.status}/>{!load.data.current && ' · 当前不可用'}</dd></div><div><dt>版本</dt><dd>{load.data.revision}</dd></div></dl><p className="pre-line">{load.data.basisDescription}</p>{load.data.textPayload !== undefined && <Field label="受限原始文本"><textarea readOnly rows={5} value={load.data.textPayload}/></Field>}{can('sources.review') && <><h3 className="section-title">人工核验 / 更新内部使用依据</h3><form onSubmit={e => { e.preventDefault(); void a.run(async () => { await command('source.review', { expectedRevision: load.data!.revision, basisDescription: basis, validUntil: new Date(until).toISOString() }, { id }); setBasis(''); setUntil(''); setRefresh(x => x + 1); }); }}><div className="form-grid"><Field label="新的核验依据 *" wide><textarea required minLength={4} maxLength={2000} value={basis} onChange={e => setBasis(e.target.value)}/></Field><Field label="依据截止时点 *" hint="按当前设备时区填写，保存为 UTC；到达该时点即失效。"><input required type="datetime-local" value={until} onChange={e => setUntil(e.target.value)}/></Field><div className="field align-end"><Submit busy={a.busy}>确认内部使用依据</Submit></div></div><small className="muted">核验不会自动扩大访问范围；变更来源版本会让旧字段核验状态失效。</small></form><h3 className="section-title">暂停使用</h3><form className="inline-form" onSubmit={e => {
                    e.preventDefault();
                    if (!confirm('暂停后，依赖该来源的人才资料将不可读取，未执行的导入也会停止。确认继续？'))
                        return;
                    void a.run(async () => { await command('source.suspend', { expectedRevision: load.data!.revision, reason }, { id }); setReason(''); setRefresh(x => x + 1); });
                }}><input required minLength={4} maxLength={1000} placeholder="填写暂停原因" value={reason} onChange={e => setReason(e.target.value)}/><button className="danger" disabled={a.busy}>暂停使用</button></form></>}{can('members.manage') && <div className="detail-actions"><button onClick={() => setScope(true)}>调整来源访问范围</button></div>}{can('sources.review') && can('sensitive.read') && <SourceHistoryPanel id={id} revision={load.data.revision}/>}</>}</div><footer className="modal-footer"><button onClick={onClose}>关闭</button></footer></Modal>;
}
function SourceHistoryPanel({ id, revision }: {
    id: string;
    revision: number;
}) {
    const [open, setOpen] = useState(false);
    return <section><h3 className="section-title">受限来源历史</h3><button onClick={() => setOpen(v => !v)}>{open ? '收起历史' : '查看来源版本与决定（记录审计）'}</button>{open && <SourceHistoryRows id={id} revision={revision}/>}</section>;
}
function SourceHistoryRows({ id, revision }: {
    id: string;
    revision: number;
}) {
    const [page, setPage] = useState(1);
    const load = useLoad(() => read<Page<SourceHistoryEntry>>('source.history', { id }, { page: String(page), pageSize: '20' }), id + ':' + revision + ':' + page);
    const actions: Record<string, string> = { CREATED: '创建', EDITED: '编辑', REVIEWED: '核验', SUSPENDED: '暂停', SCOPE_CHANGED: '范围调整', BASELINE: '迁移时可见状态' };
    return <><p className="muted">历史只用于复核，不代表目前仍允许使用资料。需同时具备核验、原文读取权限和对应访问范围。</p><ErrorBox error={load.error}/>{load.busy ? <p>正在读取受限历史…</p> : load.data && <>{load.data.items.map(h => <section className="panel padded" key={h.id}><strong>来源版本 {h.sourceRevision} · {actions[h.action] ?? h.action}</strong><small>{date(h.recordedAt)}</small>{h.baselineOnly && <p className="notice">迁移前的完整历史不可恢复；这里仅保存迁移时可见状态。</p>}{h.legacyBasisAmbiguous && <p className="notice">旧暂停来源中的“依据说明”可能实际是暂停原因，不能据此证明原使用依据。</p>}<Field label="该版本的依据说明"><textarea readOnly value={h.snapshot.basisDescription}/></Field>{h.decisionReason && <Field label="独立暂停原因"><textarea readOnly value={h.decisionReason}/></Field>}{h.snapshot.textPayload && <Field label="该版本受限原文"><textarea readOnly rows={4} value={h.snapshot.textPayload}/></Field>}</section>)}<Pager page={page} pageSize={20} total={load.data.total} setPage={setPage}/></>}</>;
}
function ScopeChange({ kind, id, revision, onClose, onSaved }: {
    kind: 'person' | 'source';
    id: string;
    revision: number;
    onClose: () => void;
    onSaved: () => void;
}) {
    const load = useLoad(() => read<{
        items: Scope[];
    }>('scope.list'), id);
    const [value, setValue] = useState('');
    const a = useAction();
    return <Modal title="调整访问范围" onClose={onClose}><form onSubmit={e => { e.preventDefault(); void a.run(async () => { await command('record.scope', { expectedRevision: revision, scopeId: value }, { kind, id }); onSaved(); }); }}><div className="modal-body"><ErrorBox error={a.error ?? load.error}/><p>人才范围与来源范围取交集。收窄任一范围，都可能让部分成员立即失去访问权。</p><Field label="目标范围"><select required value={value} onChange={e => setValue(e.target.value)}><option value="">请选择当前有权访问的范围</option>{load.data?.items.map(s => <option key={s.id} value={s.id}>{s.name} · {s.mode === 'WORKSPACE' ? '内部成员' : '限定成员'}</option>)}</select></Field></div><footer className="modal-footer"><button type="button" onClick={onClose}>取消</button><Submit busy={a.busy}>确认调整</Submit></footer></form></Modal>;
}
function ResumeImport({ job, onQueued }: {
    job: Job;
    onQueued: () => void;
}) {
    const action = useAction();
    const [submittedRevision, setSubmittedRevision] = useState<number | null>(null);
    const unknown = (action.error as ApiError | null)?.unknownOutcome === true;
    const blocked: Record<string, string> = { JOB_NOT_RETRYABLE: '该错误不可直接继续', ATTEMPTS_EXHAUSTED: '已达到领取上限',
        REVISION_CONFLICT: '来源已经变更', NOT_FOUND: '来源、范围或预览已失效', CHECKPOINT_INVALID: '入库检查点需人工核对' };
    if (job.state !== 'FAILED' && !unknown)
        return null;
    return <div><ErrorBox error={action.error}/>{job.canResume || unknown ? <button disabled={action.busy} onClick={() => void action.run(async () => {
                const expectedRevision = unknown && submittedRevision !== null ? submittedRevision : job.revision;
                setSubmittedRevision(expectedRevision);
                await command('job.resume', { expectedRevision }, { id: job.id });
                setSubmittedRevision(null);
                action.clear();
                onQueued();
            })}>{unknown ? '原样核对上次继续请求' : '继续处理未完成行'}</button> : <small>{blocked[job.resumeBlockedReason ?? ''] ?? '当前不可继续，请核查任务及资料依据'}</small>}</div>;
}
function Imports() {
    const [refresh, setRefresh] = useState(0);
    const [jobPage, setJobPage] = useState(1);
    const sources = useLoad(() => read<Page<Source>>('source.list', {}, { pageSize: '100' }), refresh);
    const jobs = useLoad(() => read<Page<Job>>('job.list', {}, { page: String(jobPage), pageSize: '20' }), refresh + ':' + jobPage);
    const [sourceId, setSourceId] = useState('');
    const [text, setText] = useState('');
    const [batch, setBatch] = useState<ImportBatch | null>(null);
    const [selected, setSelected] = useState<number[]>([]);
    const a = useAction();
    useEffect(() => {
        if (!batch?.job || !['QUEUED', 'RUNNING'].includes(batch.job.state))
            return;
        const timer = setInterval(() => { void read<ImportBatch>('import.get', { id: batch.id }).then(setBatch).catch(() => setBatch(null)); setRefresh(x => x + 1); }, 3000);
        return () => clearInterval(timer);
    }, [batch?.id, batch?.job?.state]);
    const loadBatch = async (id: string) => { const b = await read<ImportBatch>('import.get', { id }); setBatch(b); setSelected(b.rows.filter(r => r.state === 'VALID').map(r => r.index)); };
    return <><PageTitle overline="BATCH IMPORT" title="预览后，再入库" description="本增量支持最多 100 行结构化 JSON；每一行都绑定同一份明确来源。不自动合并同名人才。" action={<button onClick={() => setRefresh(x => x + 1)}>刷新任务</button>}/><ErrorBox error={a.error ?? sources.error ?? jobs.error}/><section className="panel padded"><form onSubmit={e => {
            e.preventDefault();
            void a.run(async () => {
                let rows: unknown;
                try {
                    rows = parseStrictJson(text);
                }
                catch {
                    throw new Error('不是有效的 JSON 数组，请先修正格式');
                }
                if (!Array.isArray(rows))
                    throw new Error('最外层必须是数组');
                const receipt = await command('import.preview', { sourceId, rows });
                await loadBatch(receipt.resourceId);
            });
        }}><Field label="本批资料来源"><select required value={sourceId} onChange={e => setSourceId(e.target.value)}><option value="">选择当前可用来源</option>{sources.data?.items.filter(s => s.current).map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></Field><Field label="JSON 数据" hint={'每行仅允许 displayName、roles、cityCode。角色和城市必须使用字典中的稳定代码。'}><textarea className="code-input" required rows={7} value={text} onChange={e => setText(e.target.value)} placeholder={'[\n  {"displayName":"合成示例（请替换）", "roles":["model"], "cityCode":"shenzhen"}\n]'}/></Field><Submit busy={a.busy}>生成预览，不写入人才</Submit></form></section>{batch && <section className="panel"><div className="panel-heading"><div><h2>预览与逐行结果</h2><p>截止 {date(batch.expiresAt)} · 批次 {batch.id}</p></div>{batch.job && <Tag value={batch.job.state}/>}</div><div className="table-wrap"><table><thead><tr><th>选择</th><th>姓名</th><th>角色代码</th><th>状态 / 提示</th></tr></thead><tbody>{batch.rows.map(r => <tr key={r.index}><td><input aria-label={'选择第 ' + (r.index + 1) + ' 行'} type="checkbox" disabled={!!batch.job || r.state !== 'VALID'} checked={selected.includes(r.index)} onChange={e => setSelected(e.target.checked ? [...selected, r.index] : selected.filter(i => i !== r.index))}/></td><td>{r.displayName || '第 ' + (r.index + 1) + ' 行'}</td><td>{r.roles.join(', ')}</td><td><Tag value={r.state}/>{r.issues.map((m, i) => <small key={i}>{m}</small>)}{r.personId && <small>已生成独立人才编号</small>}</td></tr>)}</tbody></table></div><footer className="panel-footer">{!batch.job ? <button className="primary" disabled={a.busy || !selected.length} onClick={() => void a.run(async () => { await command('import.commit', { expectedRevision: batch.revision, selectedRows: selected }, { id: batch.id }); await loadBatch(batch.id); setRefresh(x => x + 1); })}>提交 {selected.length} 行到后台任务</button> : <p>已提交不等于已完成。后台 Worker 会再次核对来源与发起者权限；失败时保留逐行结果，不自动重复创建。</p>}</footer></section>}<section className="panel"><div className="panel-heading"><h2>本人导入任务</h2></div>{jobs.data?.items.length ? <div className="table-wrap"><table><thead><tr><th>创建时间</th><th>状态</th><th>领取次数</th><th>进度 / 失败代码</th><th /></tr></thead><tbody>{jobs.data.items.map(j => <tr key={j.id} data-job-id={j.id}><td>{date(j.createdAt)}</td><td><Tag value={j.state}/></td><td>{j.attempts}</td><td><small>已入库 {j.importedCount} / {j.selectedCount}{j.state === 'FAILED' && j.importedCount > 0 && '（部分完成）'}</small><code>{j.errorCode ?? '—'}</code></td><td><button onClick={() => void a.run(() => loadBatch(j.aggregateId))}>查看批次</button><ResumeImport job={j} onQueued={() => { setRefresh(x => x + 1); if (batch?.id === j.aggregateId)
        void a.run(() => loadBatch(j.aggregateId)); }}/></td></tr>)}</tbody></table></div> : <Empty title="暂无导入任务"/>}</section>{jobs.data && <Pager page={jobPage} pageSize={20} total={jobs.data.total} setPage={setJobPage}/>}</>;
}
function Members() {
    const { me } = useOS();
    const [refresh, setRefresh] = useState(0);
    const [page, setPage] = useState(1);
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState<Membership | null>(null);
    const [scope, setScope] = useState(false);
    const [secret, setSecret] = useState<{
        activationToken: string;
        expiresAt: string;
        membershipId: string;
    } | null>(null);
    const a = useAction();
    const load = useLoad(async () => { const data = await read<Page<Membership>>('member.list', {}, { page: String(page), pageSize: '20' }); acknowledgeSecretInspection(); return data; }, refresh + ':' + page);
    return <><PageTitle overline="ACCESS & MEMBERS" title="内部成员" description="登录账号与人才档案是不同实体。开通内部账号不会自动建立模特或摄影师档案。" action={<div className="button-row"><button onClick={() => setScope(true)}>新建限定范围</button><button className="primary" onClick={() => setCreating(true)}>＋ 开通成员</button></div>}/><ErrorBox error={load.error ?? a.error}/><section className="panel">{load.busy ? <p className="loading">加载成员…</p> : load.data && <div className="table-wrap"><table><thead><tr><th>成员</th><th>权限角色</th><th>受限字段权限</th><th>状态</th><th>操作</th></tr></thead><tbody>{load.data.items.map(m => <tr key={m.id}><td><strong>{m.displayName}{m.id === me.membershipId ? '（本人）' : ''}</strong><small>{m.loginName}</small></td><td><Tag value={m.role}/></td><td>{m.extraPermissions.length ? m.extraPermissions.map(p => p === 'sensitive.read' ? '读取' : '维护').join(' / ') : '无'}</td><td><Tag value={m.status}/></td><td><div className="table-actions"><button disabled={m.status === 'DISABLED' || a.busy} onClick={() => setEditing(m)}>权限</button>{m.id !== me.membershipId && <button disabled={m.status === 'DISABLED' || a.busy} onClick={() => {
                        if (!confirm('将使该账号已有会话失效，并签发一次性激活凭证。确认重置？'))
                            return;
                        void a.run(async () => {
                            const data = await call<'member.resetAccess', {
                                activationToken: string;
                                expiresAt: string;
                                membershipId: string;
                            }>('member.resetAccess', { expectedRevision: m.revision }, { id: m.id });
                            setSecret(data);
                            setRefresh(x => x + 1);
                        });
                    }}>重置访问</button>}<button className="danger-text" disabled={m.status === 'DISABLED' || a.busy} onClick={() => {
                    if (!confirm('停用后，该成员现有会话与后台操作资格立即失效。确认停用？'))
                        return;
                    void a.run(async () => { await command('member.disable', { expectedRevision: m.revision }, { id: m.id }); setRefresh(x => x + 1); });
                }}>停用</button></div></td></tr>)}</tbody></table></div>}</section>{load.data && <Pager page={page} pageSize={20} total={load.data.total} setPage={setPage}/>}<div className="notice">管理员也不能绕过人才与来源的限定访问范围。变更角色会使该成员现有会话失效；系统拒绝移除最后一名已激活管理员。</div>{creating && <MemberForm onClose={() => setCreating(false)} onSaved={s => { setCreating(false); setSecret(s ?? null); setRefresh(x => x + 1); }}/>}{editing && <MemberForm member={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setRefresh(x => x + 1); }}/>}{secret && <Modal title="一次性激活凭证" onClose={() => setSecret(null)}><div className="modal-body"><div className="notice">凭证只在本次响应中显示，不能从成员列表取回。请单独、安全地交给对应成员，不放入群聊或普通资料字段。</div><Field label="激活凭证"><textarea readOnly rows={3} value={secret.activationToken} onFocus={e => e.target.select()}/></Field><p>有效期至：{date(secret.expiresAt)}</p><p className="muted">接收者打开本站的 /activate 页面，粘贴凭证并自行设置密码。</p></div><footer className="modal-footer"><button className="primary" onClick={() => setSecret(null)}>已妥善交接，关闭显示</button></footer></Modal>}{scope && <ScopeCreate onClose={() => setScope(false)}/>}</>;
}
function MemberForm({ member: existing, onClose, onSaved }: {
    member?: Membership;
    onClose: () => void;
    onSaved: (secret?: {
        activationToken: string;
        expiresAt: string;
        membershipId: string;
    }) => void;
}) {
    const [name, setName] = useState('');
    const [display, setDisplay] = useState('');
    const [role, setRole] = useState<Me['role']>(existing?.role ?? 'VIEWER');
    const [extras, setExtras] = useState<Array<'sensitive.read' | 'sensitive.write'>>(existing?.extraPermissions ?? []);
    const a = useAction();
    return <Modal title={existing ? '调整成员权限' : '开通内部成员'} onClose={onClose}><form onSubmit={e => {
            e.preventDefault();
            void a.run(async () => {
                if (existing) {
                    await command('member.permissions', { expectedRevision: existing.revision, role, extraPermissions: extras }, { id: existing.id });
                    onSaved();
                }
                else {
                    const data = await call<'member.create', {
                        activationToken: string;
                        expiresAt: string;
                        membershipId: string;
                    }>('member.create', { loginName: name, displayName: display, role, extraPermissions: extras });
                    onSaved(data);
                }
            });
        }}><div className="modal-body"><ErrorBox error={a.error}/>{!existing && <><Field label="登录名 *" hint="至少 3 位，小写英文、数字、点、下划线或连字符。"><input required pattern="[a-z0-9][a-z0-9._-]{2,79}" value={name} onChange={e => setName(e.target.value)}/></Field><Field label="显示名称 *"><input required maxLength={100} value={display} onChange={e => setDisplay(e.target.value)}/></Field></>}<Field label="基础角色"><select value={role} onChange={e => setRole(e.target.value as Me['role'])}><option value="VIEWER">只读成员</option><option value="EDITOR">资料维护</option><option value="REVIEWER">资料核验</option><option value="ADMIN">管理员</option></select></Field><Field label="受限字段附加权限"><div className="check-grid">{(['sensitive.read', 'sensitive.write'] as const).map(p => <label className="check-chip" key={p}><input type="checkbox" checked={extras.includes(p)} onChange={e => setExtras(e.target.checked ? [...extras, p] : extras.filter(x => x !== p))}/>{p === 'sensitive.read' ? '读取联系方式 / 原文' : '维护联系方式 / 原文'}</label>)}</div></Field><p className="muted">附加权限不会绕过资料的访问范围和有效期限。新成员通过一次性凭证自行设置密码，没有默认口令。</p></div><footer className="modal-footer"><button type="button" onClick={onClose}>取消</button><Submit busy={a.busy}>{existing ? '保存权限' : '创建并显示一次性凭证'}</Submit></footer></form></Modal>;
}
function ScopeCreate({ onClose }: {
    onClose: () => void;
}) {
    const { me } = useOS();
    const load = useLoad(() => read<Page<Membership>>('member.list', {}, { pageSize: '100' }), 'members');
    const [name, setName] = useState('');
    const [ids, setIds] = useState([me.membershipId]);
    const a = useAction();
    return <Modal title="新建限定访问范围" onClose={onClose}><form onSubmit={e => { e.preventDefault(); void a.run(async () => { await command('scope.create', { name, membershipIds: ids }); onClose(); }); }}><div className="modal-body"><ErrorBox error={a.error ?? load.error}/><Field label="范围名称"><input required value={name} maxLength={120} onChange={e => setName(e.target.value)}/></Field><p>范围必须包含当前维护人。创建后可在人才或来源详情中选择这个范围。</p><div className="check-grid">{load.data?.items.filter(m => m.status === 'ACTIVE').map(m => <label className="check-chip" key={m.id}><input type="checkbox" disabled={m.id === me.membershipId} checked={ids.includes(m.id)} onChange={e => setIds(e.target.checked ? [...ids, m.id] : ids.filter(id => id !== m.id))}/>{m.displayName}</label>)}</div></div><footer className="modal-footer"><button type="button" onClick={onClose}>取消</button><Submit busy={a.busy}>创建范围</Submit></footer></form></Modal>;
}
function Catalog() {
    const { catalog, refreshCatalog } = useOS();
    const [ns, setNs] = useState<CatalogItem['namespace']>('role');
    const [edit, setEdit] = useState<CatalogItem | null>(null);
    const [creating, setCreating] = useState(false);
    return <><PageTitle overline="CONTROLLED VOCABULARY" title="分类字典" description="角色、城市、语言和技能统一使用稳定代码。停用只影响新引用，不破坏已有档案。" action={<button className="primary" onClick={() => setCreating(true)}>＋ 新增分类项</button>}/><div className="tabs">{([['role', '制作角色'], ['city', '常驻城市'], ['language', '工作语言'], ['skill', '擅长类型']] as const).map(([code, name]) => <button key={code} className={ns === code ? 'active' : ''} onClick={() => setNs(code)}>{name}</button>)}</div><section className="panel"><div className="table-wrap"><table><thead><tr><th>中文名称</th><th>英文名称</th><th>稳定代码</th><th>状态</th><th /></tr></thead><tbody>{catalog.filter(c => c.namespace === ns).map(c => <tr key={c.id}><td>{c.labelZh}</td><td>{c.labelEn || '—'}</td><td><code>{c.code}</code></td><td>{c.status === 'ACTIVE' ? '启用' : '停用'}</td><td><button onClick={() => setEdit(c)}>编辑</button></td></tr>)}</tbody></table></div></section>{(creating || edit) && <CatalogForm item={edit ?? undefined} namespace={ns} onClose={() => { setCreating(false); setEdit(null); }} onSaved={() => { setCreating(false); setEdit(null); refreshCatalog(); }}/>}</>;
}
function CatalogForm({ item, namespace, onClose, onSaved }: {
    item?: CatalogItem;
    namespace: CatalogItem['namespace'];
    onClose: () => void;
    onSaved: () => void;
}) {
    const [code, setCode] = useState(item?.code ?? '');
    const [zh, setZh] = useState(item?.labelZh ?? '');
    const [en, setEn] = useState(item?.labelEn ?? '');
    const [status, setStatus] = useState<CatalogItem['status']>(item?.status ?? 'ACTIVE');
    const a = useAction();
    return <Modal title={item ? '修改分类项' : '新增分类项'} onClose={onClose}><form onSubmit={e => {
            e.preventDefault();
            void a.run(async () => {
                if (item)
                    await command('catalog.update', { expectedRevision: item.revision, labelZh: zh, labelEn: en, status }, { id: item.id });
                else
                    await command('catalog.create', { namespace, code, labelZh: zh, labelEn: en });
                onSaved();
            });
        }}><div className="modal-body"><ErrorBox error={a.error}/><Field label="稳定代码" hint="创建后不可改名；已有引用不会随显示名称变化。"><input required readOnly={!!item} maxLength={60} pattern="[a-z0-9][a-z0-9_-]*" value={code} onChange={e => setCode(e.target.value)}/></Field><Field label="中文名称"><input required maxLength={120} value={zh} onChange={e => setZh(e.target.value)}/></Field><Field label="英文名称"><input maxLength={120} value={en} onChange={e => setEn(e.target.value)}/></Field>{item && <Field label="状态"><select value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="ACTIVE">启用</option><option value="INACTIVE">停用（保留已有引用）</option></select></Field>}</div><footer className="modal-footer"><button type="button" onClick={onClose}>取消</button><Submit busy={a.busy}/></footer></form></Modal>;
}
function Audits() { const [page, setPage] = useState(1); const [refresh, setRefresh] = useState(0); const load = useLoad(() => read<Page<Audit>>('audit.list', {}, { page: String(page), pageSize: '20' }), page + ':' + refresh); return <><PageTitle overline="AUDIT TRAIL" title="操作记录" description="记录操作身份、对象、字段名和请求编号；不把联系方式、密码或原始资料全文写入审计差异。" action={<button onClick={() => setRefresh(x => x + 1)}>刷新</button>}/><ErrorBox error={load.error}/><section className="panel"><div className="table-wrap"><table><thead><tr><th>时间</th><th>动作</th><th>对象</th><th>变更字段</th><th>请求编号</th></tr></thead><tbody>{load.data?.items.map(a => <tr key={a.id}><td>{date(a.at)}</td><td><code>{a.action}</code></td><td><span>{a.resourceKind}</span><small>{a.resourceId}</small></td><td>{a.changedFields.join(', ') || '—'}</td><td><small>{a.requestId}</small></td></tr>)}</tbody></table></div>{load.busy && <p className="loading">加载记录…</p>}</section>{load.data && <Pager page={page} pageSize={20} total={load.data.total} setPage={setPage}/>}</>; }
function Account({ onLogout }: {
    onLogout: () => void;
}) { const { me } = useOS(); const [oldPassword, setOld] = useState(''); const [newPassword, setNew] = useState(''); const a = useAction(); return <><PageTitle overline="ACCOUNT SECURITY" title="账号设置" description="修改密码后，当前账号的全部旧会话失效，需要重新登录。"/><section className="panel padded narrow"><h2>{me.displayName}</h2><ErrorBox error={a.error}/><form onSubmit={e => { e.preventDefault(); void a.run(async () => { await call('auth.changePassword', { oldPassword, newPassword }); setOld(''); setNew(''); onLogout(); }); }}><Field label="原密码"><input required type="password" autoComplete="current-password" value={oldPassword} onChange={e => setOld(e.target.value)}/></Field><Field label="新密码（至少 12 个字符）"><input required type="password" minLength={12} maxLength={256} autoComplete="new-password" value={newPassword} onChange={e => setNew(e.target.value)}/></Field><Submit busy={a.busy}>更新密码并退出</Submit></form><hr /><button disabled={a.busy} onClick={() => void a.run(async () => { await call('auth.logout', {}); onLogout(); })}>退出当前会话</button></section></>; }
createRoot(document.getElementById('root')!).render(<App />);
