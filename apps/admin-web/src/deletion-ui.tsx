import { useEffect, useMemo, useState } from 'react';
import { call, read } from './api.ts';
import type { Me, Page, Person, Receipt, Source } from './dto.ts';
import type { WorkSummary, ProjectSummary } from './production-dto.ts';
import type { AssetDto } from './media-ui.tsx';
import type { DeletionPreview, DeletionRequestDetail, DeletionRequestSummary } from './deletion-dto.ts';
import type { DeletionTargetKind } from '../../../packages/core/src/deletion-model.ts';
import { Empty, ErrorBox, Field, PageTitle, Pager, Submit, Tag, date, useAction, useLoad } from './ui.tsx';

const kindLabel: Record<DeletionTargetKind, string> = { SOURCE: '资料来源', PERSON: '人才', WORK: '作品', PROJECT: '项目', ASSET: '图片' };
const actionLabel: Record<string, string> = {
    ERASE_PAYLOAD: '销毁敏感载荷', REMOVE_RELATION: '移除关系', REVOKE_PERMISSION: '撤销用途许可',
    ERASE_DERIVATIVE: '销毁派生物', REVIEW_RETENTION: '人工判断是否保留', RETAIN_MINIMAL_HEADER: '仅保留最小安全头'
};
const evidenceLabel: Record<string, string> = { PROVEN: '可直接证明', REVIEW_REQUIRED: '需人工保留判断' };
const detailLabel: Record<string, string> = {
    SOURCE_SNAPSHOT_CONTAINS_PAYLOAD: '来源历史快照可能含原始资料',
    SUBJECT_MAY_REQUIRE_INDEPENDENT_BASIS: '主体可能存在独立合法依据',
    WORK_MAY_REQUIRE_INDEPENDENT_BASIS: '作品可能存在独立合法依据',
    PROJECT_MAY_REQUIRE_INDEPENDENT_BASIS: '项目可能存在独立合法依据',
    MEDIA_BYTES_AND_PREVIEW: '媒体原始字节与预览衍生物',
    ENCRYPTED_CONTACT_VALUE: '加密联系方式值',
    FACT_MAY_HAVE_OTHER_BASIS: '事实可能存在其他依据',
    IMPORT_ROWS: '导入批次行数据',
    UPLOAD_METADATA_AND_STAGING: '上传元数据与暂存对象',
    HANDOFF_SECURITY_HISTORY: '资料交接安全历史',
    FIELD_EVIDENCE: '字段核验证据',
    MEDIA_MAY_HAVE_INDEPENDENT_SOURCE: '媒体可能有独立来源依据',
    RELATION_NOTE_REVIEW: '关系备注需要人工判断',
    RELATION_ONLY: '纯关系引用',
    SHORTLIST_NOTE_REVIEW: '候选清单备注需要人工判断',
    CHILD_RELATION: '子关系引用',
    ASSET_NOT_OWNED_BY_WORK: '作品仅引用图片，不拥有图片本体',
    PURPOSE_PERMISSION: '用途许可依赖',
    FROZEN_EXPORT_INPUT: '旧导出的冻结输入',
    EXPORT_PAYLOAD_DEPENDS_ON_TARGET: '旧导出 payload 依赖目标',
    EXPORT_PAYLOAD_DEPENDS_ON_SOURCE: '旧导出 payload 依赖来源'
};
const unresolvedLabel: Record<string, string> = {
    HIDDEN_PERSON_DEPENDENCY: '存在当前不可见的人才依赖',
    HIDDEN_WORK_DEPENDENCY: '存在当前不可见的作品依赖',
    HIDDEN_PROJECT_DEPENDENCY: '存在当前不可见的项目依赖',
    HIDDEN_ASSET_DEPENDENCY: '存在当前不可见的图片依赖',
    HIDDEN_SHORTLIST_DEPENDENCY: '存在当前不可见的候选清单依赖',
    HIDDEN_IMPORT_DEPENDENCY: '存在当前不可见的导入依赖',
    HIDDEN_UPLOAD_DEPENDENCY: '存在当前不可见的上传依赖',
    HIDDEN_HANDOFF_DEPENDENCY: '存在当前不可见的交接依赖',
    IMPACT_LIMIT_EXCEEDED: '影响项超过单次安全扫描上限'
};

type Option = { id: string; name: string; revision: number };
function RequestDetail({ id }: { id: string }) {
    const load = useLoad(() => read<DeletionRequestDetail>('deletion.get', { id }), id);
    return <section className="panel padded deletion-request-detail"><ErrorBox error={load.error}/>
        {load.busy && !load.data ? <p>正在读取删除申请摘要…</p> : load.data && <>
            <div className="panel-heading"><div><h2>删除申请草稿</h2><p><code>{load.data.id}</code></p></div><Tag value={load.data.state}/></div>
            <dl className="detail-grid">
                <div><dt>目标类型</dt><dd>{kindLabel[load.data.targetKind]}</dd></div>
                <div><dt>目标版本</dt><dd>{load.data.targetRevision}</dd></div>
                <div><dt>冻结影响项</dt><dd>{load.data.impactCount}</dd></div>
                <div><dt>需人工判断</dt><dd>{load.data.reviewRequiredCount}</dd></div>
                <div><dt>未解析</dt><dd>{load.data.unresolvedCount}</dd></div>
                <div><dt>创建时间</dt><dd>{date(load.data.createdAt)}</dd></div>
            </dl>
            <p className="pre-line">{load.data.reason}</p>
            <div className="notice"><strong>当前不会执行删除</strong><p>{load.data.executionNote}</p></div>
        </>}
    </section>;
}

export function DeletionImpactPanel({ me }: { me: Me }) {
    const [refresh, setRefresh] = useState(0), [kind, setKind] = useState<DeletionTargetKind>('PERSON'), [targetId, setTargetId] = useState('');
    const [preview, setPreview] = useState<DeletionPreview | null>(null), [reason, setReason] = useState('');
    const [selectedRequest, setSelectedRequest] = useState<string | null>(null), [page, setPage] = useState(1);
    const inspect = useAction(), create = useAction();

    const people = useLoad(() => read<Page<Person>>('person.list', {}, { pageSize: '100' }), 'delete-people:' + refresh);
    const works = useLoad(() => read<Page<WorkSummary>>('work.list', {}, { pageSize: '100' }), 'delete-works:' + refresh);
    const projects = useLoad(() => read<Page<ProjectSummary>>('project.list', {}, { pageSize: '100' }), 'delete-projects:' + refresh);
    const sources = useLoad(() => me.permissions.includes('sources.read') ? read<Page<Source>>('source.list', {}, { pageSize: '100' })
        : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 100 } as Page<Source>), 'delete-sources:' + refresh);
    const assets = useLoad(() => me.permissions.includes('assets.read') ? read<Page<AssetDto>>('asset.list', {}, { pageSize: '100' })
        : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 100 } as Page<AssetDto>), 'delete-assets:' + refresh);
    const requests = useLoad(() => read<Page<DeletionRequestSummary>>('deletion.list', {}, { page: String(page), pageSize: '20' }), 'delete-requests:' + page + ':' + refresh);

    const options = useMemo<Option[]>(() => {
        if (kind === 'PERSON') return (people.data?.items ?? []).map(x => ({ id: x.id, name: x.displayName, revision: x.revision }));
        if (kind === 'WORK') return (works.data?.items ?? []).map(x => ({ id: x.id, name: x.title, revision: x.revision }));
        if (kind === 'PROJECT') return (projects.data?.items ?? []).map(x => ({ id: x.id, name: x.title, revision: x.revision }));
        if (kind === 'SOURCE') return (sources.data?.items ?? []).map(x => ({ id: x.id, name: x.title, revision: x.revision }));
        return (assets.data?.items ?? []).map(x => ({ id: x.id, name: x.fileName, revision: x.revision }));
    }, [kind, people.data, works.data, projects.data, sources.data, assets.data]);
    const selected = options.find(x => x.id === targetId);
    const allowedKinds: DeletionTargetKind[] = ['PERSON', 'WORK', 'PROJECT', ...(me.permissions.includes('sources.read') ? ['SOURCE' as const] : []), ...(me.permissions.includes('assets.read') ? ['ASSET' as const] : [])];

    useEffect(() => { setTargetId(''); setPreview(null); setReason(''); }, [kind]);
    useEffect(() => { setPreview(null); setReason(''); }, [targetId]);

    async function runPreview() {
        if (!selected) throw new Error('请选择当前可见的目标');
        const next = await call<'deletion.preview', DeletionPreview>('deletion.preview', { targetKind: kind, targetId: selected.id, expectedRevision: selected.revision });
        setPreview(next);
    }
    async function createDraft() {
        if (!preview || !preview.complete || !selected) throw new Error('当前影响预览不完整，不能创建删除申请');
        const receipt = await call<'deletion.create', Receipt>('deletion.create', {
            targetKind: kind, targetId: selected.id, expectedRevision: selected.revision,
            previewDigest: preview.previewDigest, reason
        });
        setSelectedRequest(receipt.resourceId); setPreview(null); setReason(''); setRefresh(x => x + 1);
    }

    return <><PageTitle overline="CONTROLLED DELETION / PREVIEW ONLY" title="删除影响评估" description="先证明影响，再谈删除。本阶段只做零写入预览和 DRAFT 申请，不阻断、不清理、不擦除任何业务数据。" action={<button onClick={() => setRefresh(x => x + 1)}>刷新</button>}/>
        <ErrorBox error={people.error ?? works.error ?? projects.error ?? sources.error ?? assets.error ?? requests.error ?? inspect.error ?? create.error}/>
        <div className="notice"><strong>当前没有“执行删除”能力</strong><p>删除申请仅冻结目标版本与影响摘要。存在隐藏依赖、扫描超限或预览后新增依赖时，系统拒绝创建申请。</p></div>

        <section className="panel padded deletion-preview">
            <h2>1. 选择目标并做零写入预览</h2>
            <div className="filters deletion-target-row">
                <select aria-label="删除目标类型" value={kind} onChange={e => setKind(e.target.value as DeletionTargetKind)}>{allowedKinds.map(x => <option key={x} value={x}>{kindLabel[x]}</option>)}</select>
                <select aria-label="删除目标" value={targetId} onChange={e => setTargetId(e.target.value)}><option value="">请选择当前可见目标</option>{options.map(x => <option key={x.id} value={x.id}>{x.name} · v{x.revision}</option>)}</select>
                <button className="primary" disabled={!selected || inspect.busy} onClick={() => void inspect.run(runPreview)}>{inspect.busy ? '正在扫描…' : '预览影响'}</button>
            </div>
            {preview && <div className="deletion-impact-results">
                <div className="stats">
                    <div className="stat"><span>影响项</span><strong>{preview.impactCount}</strong><small>当前可证明</small></div>
                    <div className="stat"><span>需人工判断</span><strong>{preview.reviewRequiredCount}</strong><small>不能自动决定保留</small></div>
                    <div className="stat"><span>未解析</span><strong>{preview.unresolvedCount}</strong><small>{preview.complete ? '影响图完整' : '禁止建申请'}</small></div>
                </div>
                {!!preview.unresolved.length && <div className="error"><strong>影响图不完整</strong>{preview.unresolved.map(x => <p key={x.code}>{unresolvedLabel[x.code] ?? x.code}：{x.count} 项</p>)}</div>}
                <h3>影响摘要</h3>
                <div className="table-wrap"><table><thead><tr><th>依赖类型</th><th>建议动作</th><th>证据状态</th><th>数量</th></tr></thead><tbody>{preview.summary.map((x, i) => <tr key={i}><td><code>{x.dependencyKind}</code></td><td>{actionLabel[x.proposedAction] ?? x.proposedAction}</td><td>{evidenceLabel[x.evidenceState] ?? x.evidenceState}</td><td>{x.count}</td></tr>)}</tbody></table></div>
                <h3>当前可见具体影响</h3>
                <div className="table-wrap deletion-impact-table"><table><thead><tr><th>对象</th><th>依赖</th><th>建议动作</th><th>判断</th><th>原因</th></tr></thead><tbody>{preview.items.map(x => <tr key={[x.resourceKind,x.resourceId,x.dependencyKind,x.proposedAction].join(':')}><td><strong>{x.resourceKind}</strong><small>{x.resourceId}</small></td><td><code>{x.dependencyKind}</code></td><td>{actionLabel[x.proposedAction] ?? x.proposedAction}</td><td>{evidenceLabel[x.evidenceState] ?? x.evidenceState}</td><td>{detailLabel[x.detailCode] ?? x.detailCode}</td></tr>)}</tbody></table></div>
                <div className="deletion-freeze-box">
                    <h3>2. 冻结为 DRAFT 删除申请</h3>
                    <Field label="申请原因" hint="这里只说明为什么需要进入后续删除评估；本操作不会阻断或清理目标。"><textarea rows={4} required minLength={4} maxLength={2000} disabled={!preview.complete} value={reason} onChange={e => setReason(e.target.value)}/></Field>
                    <button className="primary" disabled={!preview.complete || reason.trim().length < 4 || create.busy} onClick={() => void create.run(createDraft)}>{create.busy ? '正在冻结…' : '创建 DRAFT 申请'}</button>
                </div>
            </div>}
        </section>

        <section className="panel"><div className="panel-heading"><div><h2>已有删除申请草稿</h2><p>这里只显示当前仍有权看到目标的申请摘要；不会回显被冻结的依赖 ID。</p></div></div>
            {requests.data?.items.length ? <div className="table-wrap"><table><thead><tr><th>时间</th><th>目标</th><th>影响项</th><th>需人工判断</th><th>状态</th><th/></tr></thead><tbody>{requests.data.items.map(x => <tr key={x.id}><td>{date(x.createdAt)}</td><td>{kindLabel[x.targetKind]}<small>{x.targetId}</small></td><td>{x.impactCount}</td><td>{x.reviewRequiredCount}</td><td><Tag value={x.state}/></td><td><button onClick={() => setSelectedRequest(x.id)}>查看摘要</button></td></tr>)}</tbody></table></div> : <Empty title="还没有删除申请草稿">先完成影响预览；只有影响图完整时才能冻结 DRAFT。</Empty>}
            {requests.data && <Pager page={page} pageSize={20} total={requests.data.total} setPage={setPage}/>}
        </section>
        {selectedRequest && <RequestDetail id={selectedRequest}/>}
    </>;
}
