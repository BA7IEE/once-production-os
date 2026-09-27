import { useEffect, useMemo, useState } from 'react';
import { call, read } from './api.ts';
import type { Me, Page, Person, Receipt, Source } from './dto.ts';
import type { WorkDetail, WorkSummary, ProjectDetail, ProjectSummary } from './production-dto.ts';
import type { AssetDto } from './media-ui.tsx';
import type { ExportDetail, ExportDownload, ExportSummary, UsePermissionDto } from './export-dto.ts';
import type { ExportFieldCode, ExportSubjectKind } from '../../../packages/core/src/export-model.ts';
import { ErrorBox, Field, Modal, PageTitle, Pager, Submit, Tag, date, useAction, useLoad } from './ui.tsx';

const professionalFields: Array<[ExportFieldCode,string]> = [
    ['person.td2.personCredentials','2.0 资质记录与核验状态'],
    ['person.td2.credentialIdentifiers','2.0 资质加密编号（单独批准）'],
    ['person.td2.fieldEvidence','2.0 所选专业字段的来源证据与原核验记录'],
    ['person.td2.talentProfiles','2.0 人才主档案（内部简介与状态）'],
    ['person.td2.representations','2.0 代表关系、有效期及关联机构'],
    ['person.td2.personExternalRefs','2.0 外部标识、核验状态及关联机构'],
    ['person.td2.personCapabilities','2.0 能力、等级及所用字典'],
    ['person.td2.personRoles','2.0 职业及有效期'],
    ['person.td2.personLanguages','2.0 语言、熟练度及有效期'],
    ['person.td2.talentLocations','2.0 常驻与服务地点'],
    ['person.td2.castingProfiles','2.0 外观及当前量尺关联'],
    ['person.td2.measurementSets','2.0 完整量尺历史'],
    ['person.td2.translatorLanguagePairs','2.0 翻译方向及职业关联'],
    ['person.td2.translatorServiceModes','2.0 翻译服务方式及职业关联']
];
const fieldGroups: Record<ExportSubjectKind, Array<[ExportFieldCode, string]>> = {
    PERSON: [
        ['person.displayName', '姓名 / 展示名'], ['person.aliases', '别名'], ['person.roles', '角色'], ['person.cityCode', '城市'],
        ['person.languageCodes', '语言'], ['person.skillCodes', '技能'], ['person.heightCm', '身高'], ['person.intro', '简介'], ['person.status', '档案状态'], ...professionalFields
    ],
    WORK: [
        ['work.title', '作品标题'], ['work.description', '作品说明'], ['work.industryCode', '行业'], ['work.workTypeCodes', '作品类型'],
        ['work.origin', '制作归属'], ['work.originNote', '归属依据'], ['work.status', '作品状态'], ['work.relations', '与已选人才的署名关系']
    ],
    PROJECT: [
        ['project.title', '项目标题'], ['project.brief', '项目说明'], ['project.locationNote', '地点说明'], ['project.dateNote', '日期说明'],
        ['project.reviewNote', '内部复盘'], ['project.status', '项目状态'], ['project.relations', '与已选人才/作品的关系']
    ],
    SOURCE: [
        ['source.title', '来源标题'], ['source.type', '来源类型'], ['source.providerClaim', '提供方说明'], ['source.basisMode', '内部依据类型'],
        ['source.basisDescription', '依据说明'], ['source.validFrom', '有效起点'], ['source.validUntil', '有效截止'], ['source.status', '来源状态'], ...professionalFields, ['media.originals','资质证明原件及预览（单独批准）']
    ],
    ASSET: [['media.originals','资质证明原件及预览（单独批准）'], ['media.identity', '媒体身份清单（文件名 / 类型 / Hash / 尺寸，不含原件地址）']]
};
const kindNames: Record<ExportSubjectKind, string> = { PERSON: '人才', WORK: '作品', PROJECT: '项目', SOURCE: '来源', ASSET: '图片' };

function futureLocal(hours = 24 * 7) {
    const d = new Date(Date.now() + hours * 3600000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function exportErrorLabel(code: string | null) {
    const map: Record<string, string> = {
        EXPORT_STALE: '依赖已失效', EXPORT_EXPIRED: '导出已过期', EXPORT_SOURCE_CHANGED: '来源安全状态已变化',
        EXPORT_PERMISSION_CHANGED: '用途许可已变化', EXPORT_PERMISSION_INACTIVE: '用途许可已撤销或过期',
        EGRESS_DISABLED: '当前环境未开放导出出口', ACTOR_DISABLED: '原申请人已失去资格'
    };
    return code ? (map[code] ?? code) : '—';
}

type ResourceSets = {
    people: Person[];
    works: WorkSummary[];
    projects: ProjectSummary[];
    sources: Source[];
    assets: AssetDto[];
};
function subjectLabel(p: Pick<UsePermissionDto, 'subjectKind' | 'subjectId'>, data: ResourceSets) {
    if (p.subjectKind === 'PERSON') return data.people.find(x => x.id === p.subjectId)?.displayName ?? p.subjectId;
    if (p.subjectKind === 'WORK') return data.works.find(x => x.id === p.subjectId)?.title ?? p.subjectId;
    if (p.subjectKind === 'PROJECT') return data.projects.find(x => x.id === p.subjectId)?.title ?? p.subjectId;
    if (p.subjectKind === 'SOURCE') return data.sources.find(x => x.id === p.subjectId)?.title ?? p.subjectId;
    return data.assets.find(x => x.id === p.subjectId)?.fileName ?? p.subjectId;
}

function PermissionForm({ resources, onClose, onDone }: { resources: ResourceSets; onClose: () => void; onDone: () => void }) {
    const [kind, setKind] = useState<ExportSubjectKind>('PERSON');
    const [subjectId, setSubjectId] = useState('');
    const [fields, setFields] = useState<ExportFieldCode[]>([]);
    const [validUntil, setValidUntil] = useState(futureLocal());
    const [evidenceNote, setEvidenceNote] = useState('');
    const action = useAction();

    useEffect(() => { setSubjectId(''); setFields([]); }, [kind]);
    const work = useLoad<WorkDetail | null>(() => kind === 'WORK' && subjectId ? read<WorkDetail>('work.get', { id: subjectId }) : Promise.resolve(null), kind + ':' + subjectId);
    const project = useLoad<ProjectDetail | null>(() => kind === 'PROJECT' && subjectId ? read<ProjectDetail>('project.get', { id: subjectId }) : Promise.resolve(null), kind + ':' + subjectId);

    const sourceId = kind === 'SOURCE' ? subjectId
        : kind === 'PERSON' ? resources.people.find(x => x.id === subjectId)?.sourceId ?? ''
        : kind === 'ASSET' ? resources.assets.find(x => x.id === subjectId)?.sourceId ?? ''
        : kind === 'WORK' ? work.data?.sourceId ?? ''
        : project.data?.sourceId ?? '';

    const options = kind === 'PERSON' ? resources.people.map(x => [x.id, x.displayName] as const)
        : kind === 'WORK' ? resources.works.map(x => [x.id, x.title] as const)
        : kind === 'PROJECT' ? resources.projects.map(x => [x.id, x.title] as const)
        : kind === 'SOURCE' ? resources.sources.map(x => [x.id, x.title] as const)
        : resources.assets.map(x => [x.id, x.fileName] as const);

    return <Modal title="批准内部导出用途" onClose={onClose} wide><form onSubmit={e => { e.preventDefault(); void action.run(async () => {
            if (!sourceId) throw new Error('对象来源尚未读取完成，请稍后再提交');
            if (!fields.length) throw new Error('至少选择一个允许导出的字段');
            await call('usePermission.create', {
                sourceId, subjectKind: kind, subjectId, fields,
                validUntil: new Date(validUntil).toISOString(),
                evidenceNote
            });
            onDone();
        }); }}>
            <div className="modal-body"><ErrorBox error={action.error ?? work.error ?? project.error}/>
                <div className="notice">这是额外的数据导出许可，不等于“当前能看就能导出”。临时整理来源无法批准导出；许可到期、撤销或来源安全状态变化都会使旧导出失效。2.0 专业资料需同时批准人物字段和每个实际来源的专业字段；来源许可只适用于另外取得人物许可的资料。</div>
                <Field label="对象类型"><select value={kind} onChange={e => setKind(e.target.value as ExportSubjectKind)}>
                    <option value="PERSON">人才</option><option value="WORK">作品</option><option value="PROJECT">项目</option><option value="SOURCE">资料来源</option><option value="ASSET">图片身份</option>
                </select></Field>
                <Field label="批准对象"><select required value={subjectId} onChange={e => setSubjectId(e.target.value)}><option value="">请选择</option>{options.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></Field>
                <Field label="允许导出的字段" hint="只允许本次明确勾选的字段进入 JSON；联系方式、来源原文、密码/会话/密钥没有可选项。">
                    <div className="check-grid">{fieldGroups[kind].map(([code, label]) => <label className={'check-chip' + (fields.includes(code) ? ' checked' : '')} key={code}><input type="checkbox" checked={fields.includes(code)} onChange={e => setFields(e.target.checked ? [...fields, code] : fields.filter(x => x !== code))}/>{label}</label>)}</div>
                </Field>
                <Field label="许可截止时间"><input required type="datetime-local" value={validUntil} onChange={e => setValidUntil(e.target.value)}/></Field>
                <Field label="审批依据" hint="说明为什么这份资料允许做内部 JSON 导出；不要粘贴完整敏感原文。"><textarea required minLength={4} maxLength={2000} rows={4} value={evidenceNote} onChange={e => setEvidenceNote(e.target.value)}/></Field>
                {sourceId && <p className="muted">来源 ID：{sourceId}</p>}
            </div>
            <footer className="modal-footer"><button type="button" onClick={onClose} disabled={action.busy}>取消</button><Submit busy={action.busy}>批准用途</Submit></footer>
        </form></Modal>;
}

function ExportDetailPanel({ id, onChanged }: { id: string; onChanged: () => void }) {
    const [tick, setTick] = useState(0);
    const action = useAction();
    const load = useLoad(() => read<ExportDetail>('export.get', { id }), id + ':' + tick);
    useEffect(() => {
        if (load.data?.effectiveState !== 'QUEUED') return;
        const timer = setInterval(() => setTick(x => x + 1), 1500);
        return () => clearInterval(timer);
    }, [load.data?.effectiveState]);

    const [proofs,setProofs]=useState<Array<{id:string;fileName:string}>>([]);
    useEffect(()=>setProofs([]),[id]);
    async function download() {
        const result = await call<'export.download', ExportDownload>('export.download', {}, { id });
        const payload=result.payload as {manifest?:{talent?:{assets?:Array<{id:string;fileName:string}>}}};
        setProofs(payload.manifest?.talent?.assets??[]);
        const blob = new Blob([JSON.stringify(result.payload, null, 2) + '\n'], { type: 'application/json' });
        const href = URL.createObjectURL(blob);
        try {
            const a = document.createElement('a');
            a.href = href; a.download = result.fileName; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
        }
        finally { URL.revokeObjectURL(href); }
        onChanged();
    }
    async function downloadProof(assetId:string,part:'original'|'preview') {
        const response=await fetch(`/api/v1/exports/${encodeURIComponent(id)}/media/${encodeURIComponent(assetId)}/${part}`,{credentials:'same-origin',cache:'no-store',redirect:'error'});
        if(!response.ok) {const error=await response.json() as {error?:{message?:string}};throw new Error(error.error?.message??'原件下载失败，请核对导出许可');}
        const href=URL.createObjectURL(await response.blob());
        try {const a=document.createElement('a');a.href=href;a.download=assetId+(part==='original'?'.original.bin':'.preview.jpg');a.click();}finally{URL.revokeObjectURL(href);}
    }
    return <section className="panel padded export-detail"><ErrorBox error={load.error ?? action.error}/>
        {load.busy && !load.data ? <p>正在核对导出依赖…</p> : load.data && <>
            <div className="panel-heading"><div><h2>导出状态</h2><p><code>{load.data.id}</code></p></div><Tag value={load.data.effectiveState}/></div>
            <dl className="detail-grid">
                <div><dt>Schema</dt><dd>{load.data.schemaVersion}</dd></div>
                <div><dt>生成时间</dt><dd>{date(load.data.createdAt)}</dd></div>
                <div><dt>截止时间</dt><dd>{date(load.data.expiresAt)}</dd></div>
                <div><dt>内容后来有修改</dt><dd>{load.data.contentChanged ? '有；旧导出仍保持生成时快照' : '无'}</dd></div>
                <div><dt>阻断原因</dt><dd>{exportErrorLabel(load.data.blockedReason)}</dd></div>
                <div><dt>SHA-256</dt><dd><small>{load.data.payloadDigest ?? '尚未生成'}</small></dd></div>
            </dl>
            <p className="muted">普通内容修改不会重写旧快照；来源暂停、范围/保护版本变化、许可撤销/到期会整件阻断旧导出。</p>
            <div className="button-row"><button onClick={() => setTick(x => x + 1)}>刷新状态</button>{load.data.downloadable && <button className="primary" disabled={action.busy} onClick={() => void action.run(download)}>下载 JSON</button>}</div>
            {load.data.downloadable&&proofs.length>0&&<div><p>请将下列原件与预览全部保存到同一私有目录，供重建时校验。只保存 JSON 不能恢复这些证明。</p>{proofs.map(p=><div className="button-row" key={p.id}><span>{p.fileName}</span><button disabled={action.busy} onClick={()=>void action.run(()=>downloadProof(p.id,'original'))}>下载证明原件</button><button disabled={action.busy} onClick={()=>void action.run(()=>downloadProof(p.id,'preview'))}>下载证明预览</button></div>)}</div>}
        </>}
    </section>;
}

export function ExportPanel({ me }: { me: Me }) {
    const canApprove = me.permissions.includes('sources.review');
    const canExport = me.permissions.includes('data.export');
    const [refresh, setRefresh] = useState(0), [permissionModal, setPermissionModal] = useState(false), [page, setPage] = useState(1);
    const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]), [selectedExport, setSelectedExport] = useState<string | null>(null);
    const create = useAction(), revoke = useAction();

    const people = useLoad(() => read<Page<Person>>('person.list', {}, { pageSize: '100' }), 'export-people:' + refresh);
    const works = useLoad(() => read<Page<WorkSummary>>('work.list', {}, { pageSize: '100' }), 'export-works:' + refresh);
    const projects = useLoad(() => read<Page<ProjectSummary>>('project.list', {}, { pageSize: '100' }), 'export-projects:' + refresh);
    const sources = useLoad(() => me.permissions.includes('sources.read')
        ? read<Page<Source>>('source.list', {}, { pageSize: '100' })
        : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 100 } as Page<Source>), 'export-sources:' + refresh);
    const assets = useLoad(() => read<Page<AssetDto>>('asset.list', {}, { pageSize: '100' }), 'export-assets:' + refresh);
    const permissions = useLoad(() => read<Page<UsePermissionDto>>('usePermission.list', {}, { pageSize: '100' }), 'export-permissions:' + refresh);
    const exports = useLoad(() => canExport ? read<Page<ExportSummary>>('export.list', {}, { page: String(page), pageSize: '20' }) : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 20 }), 'exports:' + page + ':' + refresh);

    const resources: ResourceSets = {
        people: people.data?.items ?? [], works: works.data?.items ?? [], projects: projects.data?.items ?? [],
        sources: sources.data?.items ?? [], assets: assets.data?.items ?? []
    };
    const activePermissions = useMemo(() => (permissions.data?.items ?? []).filter(p => p.status === 'ACTIVE' && Date.parse(p.validUntil) > Date.now()), [permissions.data]);
    const chosen = activePermissions.filter(p => selectedPermissions.includes(p.id));
    const primary = chosen.filter(p => ['PERSON', 'WORK', 'PROJECT'].includes(p.subjectKind));

    async function createExport() {
        if (!primary.length) throw new Error('至少选择一条人才、作品或项目的导出许可');
        const ids = {
            people: [...new Set(chosen.filter(p => p.subjectKind === 'PERSON').map(p => p.subjectId))],
            works: [...new Set(chosen.filter(p => p.subjectKind === 'WORK').map(p => p.subjectId))],
            projects: [...new Set(chosen.filter(p => p.subjectKind === 'PROJECT').map(p => p.subjectId))]
        };
        const fields = [...new Set(chosen.flatMap(p => p.fields))] as ExportFieldCode[];
        const receipt = await call<'export.create', Receipt>('export.create', { format: 'JSON', selectedIds: ids, fields, usePermissionRefs: selectedPermissions });
        setSelectedPermissions([]); setSelectedExport(receipt.resourceId); setRefresh(x => x + 1);
    }

    return <><PageTitle overline="CONTROLLED DATA EGRESS" title="内部 JSON 导出" description="用于有权限的内部迁移/重建，不是客户资料包。可读不等于可导出；每个对象和字段都必须有独立 INTERNAL_EXPORT 许可。" action={canApprove ? <button className="primary" onClick={() => setPermissionModal(true)}>＋ 批准导出用途</button> : undefined}/>
        <ErrorBox error={people.error ?? works.error ?? projects.error ?? sources.error ?? assets.error ?? permissions.error ?? exports.error ?? create.error ?? revoke.error}/>
        <div className="notice"><strong>三道安全门</strong><p>账号必须有 data.export；对象必须有当前有效的精确用途许可；部署侧 DATA_EGRESS_MODE 必须明确开放。生产默认关闭出口。</p></div>

        <div className="notice"><strong>2.0 专业资料导出范围</strong><p>可选择主档案、职业、能力及所用字典、外部标识、代表关系及关联机构、语言、地点、外观、量尺历史和翻译资料；请同时选择必要关联；代表人须另行批准并一起选择导出。若需保留字段依据，请同时批准“所选专业字段的来源证据与原核验记录”，并批准每条证据来源及其对应专业资料；未选择时仍是旧版资料快照，不含字段证据。原核验仅保留历史归属，不等于新环境里的核验。包含每个来源的全部来源字段后，可用于隔离重建。无证明附件的资质可迁移；如有编号，必须另外批准加密编号并在隔离重建时提供原环境和目标环境密钥。带证明附件或已核验资质须同时批准图片及来源的“资质证明原件及预览”，下载 JSON 后再逐项保存原件和预览。成人资格、媒体集合和合并历史尚不支持；这份 JSON 不是完整备份。专业资料、所用能力定义或关联机构变化会使旧文件失效。</p></div>
        <section className="panel padded"><div className="panel-heading"><div><h2>可用导出许可</h2><p>先由资料核验人员批准对象、字段和截止时间。导出任务只能使用这里的现行许可。</p></div><button onClick={() => setRefresh(x => x + 1)}>刷新</button></div>
            <div className="table-wrap"><table><thead><tr>{canExport && <th>用于本次导出</th>}<th>对象</th><th>允许字段</th><th>截止</th><th>状态</th>{canApprove && <th>操作</th>}</tr></thead>
                <tbody>{permissions.data?.items.map(p => <tr key={p.id}>{canExport && <td><input aria-label={'选择导出许可 ' + p.id} type="checkbox" disabled={p.status !== 'ACTIVE' || Date.parse(p.validUntil) <= Date.now()} checked={selectedPermissions.includes(p.id)} onChange={e => setSelectedPermissions(e.target.checked ? [...selectedPermissions, p.id] : selectedPermissions.filter(x => x !== p.id))}/></td>}<td><strong>{kindNames[p.subjectKind]} · {subjectLabel(p, resources)}</strong><small>{p.subjectId}</small></td><td>{p.fields.map(x => fieldGroups[p.subjectKind].find(([c]) => c === x)?.[1] ?? x).join(' / ')}</td><td>{date(p.validUntil)}</td><td>{p.status === 'ACTIVE' ? '有效' : '已撤销'}</td>{canApprove && <td>{p.status === 'ACTIVE' && <button className="danger-text" disabled={revoke.busy} onClick={() => {
                    if (confirm('撤销后，依赖此许可的旧导出会立即不可下载。确认撤销？')) void revoke.run(async () => { await call('usePermission.revoke', { expectedRevision: p.revision }, { id: p.id }); setRefresh(x => x + 1); });
                }}>撤销</button>}</td>}</tr>)}</tbody></table></div>
            {!permissions.data?.items.length && <p className="muted">暂无当前可见的导出许可。</p>}
            {canExport && <div className="export-create-bar"><div><strong>已选 {selectedPermissions.length} 个许可</strong><small>人才/作品/项目决定导出记录；来源许可还需覆盖每条专业资料的实际来源；图片许可仅补充媒体身份。</small></div><button className="primary" disabled={create.busy || !selectedPermissions.length} onClick={() => void create.run(createExport)}>生成内部 JSON</button></div>}
        </section>

        {canExport && <section className="panel"><div className="panel-heading"><div><h2>我的导出任务</h2><p>导出文件最长保留 24 小时，下载前会再次复查全部依赖。</p></div></div>
            <div className="table-wrap"><table><thead><tr><th>创建时间</th><th>状态</th><th>截止时间</th><th>字段数</th><th>操作</th></tr></thead><tbody>{exports.data?.items.map(x => <tr key={x.id}><td>{date(x.createdAt)}</td><td><Tag value={x.state}/></td><td>{date(x.expiresAt)}</td><td>{x.fields.length}</td><td><button onClick={() => setSelectedExport(x.id)}>查看</button></td></tr>)}</tbody></table></div>
            {exports.data && <Pager page={page} pageSize={20} total={exports.data.total} setPage={setPage}/>}
        </section>}
        {selectedExport && <ExportDetailPanel id={selectedExport} onChanged={() => setRefresh(x => x + 1)}/>}
        {permissionModal && <PermissionForm resources={resources} onClose={() => setPermissionModal(false)} onDone={() => { setPermissionModal(false); setRefresh(x => x + 1); }}/>}
    </>;
}
