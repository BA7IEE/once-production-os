import { useEffect, useMemo, useState } from 'react';
import { call, read } from './api.ts';
import type { Me, Page, Person, Receipt, Source } from './dto.ts';
import type { WorkSummary, ProjectSummary } from './production-dto.ts';
import type { AssetDto } from './media-ui.tsx';
import type { DeletionDecisionItem, DeletionPreview, DeletionRequestDetail, DeletionRequestSummary } from './deletion-dto.ts';
import type { DeletionTargetKind } from '../../../packages/core/src/deletion-model.ts';
import { Empty, ErrorBox, Field, Modal, PageTitle, Pager, Submit, Tag, date, useAction, useLoad } from './ui.tsx';

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
function detailText(code: string) {
    if(code.startsWith('TD2_SOURCE_PERSON:'))return '逐项决定删除或保留人物身份。保留须已有姓名、别名、简介的完整独立依据；最初来源编号不改变，专业资料需分别决定。';
    const facts = /^TD2_SOURCE_FACT_GRAPH_(?:[a-f0-9]{64}|[A-Za-z0-9_-]{43}):F(\d+):C(\d+):I(\d+)(?::M(\d+):Q(\d+):A(\d+):L(\d+)(?::H(\d+))?)?$/.exec(code);
    if (facts) return `按逐项决定处理 ${facts[1]} 项专业资料；涉及 ${facts[2]} 条候选职业关系和 ${facts[3]} 项集合关联。${Number(facts[8])>0?`本来源的 ${facts[8]} 个人物身份及其关联需分别决定保留或删除；仅失去职业的保留候选标记待核实。`:'删除职业后原候选保留并标记待核实，不猜测新职业。'}${Number(facts[4])>0?`同时删除 ${facts[4]} 份原件，移出 ${facts[7]} 处图片引用，撤销 ${facts[5]} 项资质当前状态、将 ${facts[6]} 项成年资格改为未知。`:``}`;
    if (code.startsWith('TD2_SOURCE_FACT_')) {
        const names:Record<string,string>={talentProfiles:'专业主档案',personRoles:'职业',personCapabilities:'能力',personLanguages:'工作语言',talentLocations:'工作地区',castingProfiles:'选角资料',measurementSets:'量尺',adultEligibilities:'成年资格',representations:'经纪关系',personExternalRefs:'外部标识',personCredentials:'资质',translatorLanguagePairs:'翻译方向',translatorServiceModes:'翻译服务',mediaCollections:'媒体集合',mediaCollectionTags:'集合标签'};
        return `${names[code.split(':')[0]!.replace('TD2_SOURCE_FACT_','')]??'专业资料'}：选择删除，或依据已有逐字段核验保留。保留不会改记原来源。`;
    }
    const source = /^TD2_SOURCE_EVIDENCE_[a-f0-9]{64}:E(\d+):P(\d+):F(\d+)$/.exec(code);
    if (source) return `删除本来源的 ${source[1]} 条字段依据和 ${source[2]} 条修改建议；不改动关联的 ${source[3]} 项资料及其他来源记录，不改写原核验归属。`;
    const asset = /^TD2_ASSET_GRAPH_[a-f0-9]{64}:C(\d+):Q(\d+):A(\d+):P(\d+)$/.exec(code);
    if (asset) return `移出 ${asset[1]} 项作品集引用、撤销 ${asset[2]} 项资质的当前有效状态、将 ${asset[3]} 项成年资格改为未知，并使 ${asset[4]} 项待审建议失效。原核验历史保留；其他图片和专业资料保留。`;
    if (code.startsWith('TD2_GRAPH_')) return '清理整份人物专业档案及其证据和建议；独立图片原件另行决定。';
    return detailLabel[code] ?? code;
}
const unresolvedLabel: Record<string, string> = {
    TD2_SOURCE_COMBINED_RETENTION_REQUIRED: '来源同时包含待处理字段事实和证明原件，需要联合保留方案',
    TD2_SOURCE_IDENTITY_RETENTION_REQUIRED: '来源包含人物身份资料，仍需完成身份字段保留方案',
    TD2_SOURCE_MEDIA_RETENTION_REQUIRED: '来源包含原件，仍需完成原件与专业引用联合清理方案',
    TD2_SOURCE_INDEPENDENT_EVIDENCE_REQUIRED: '部分字段没有另一份有效且支持当前值的已登记依据，不能直接删除本来源',
    TD2_SOURCE_RETENTION_REVIEW_REQUIRED: '来源仍拥有专业资料，需要逐项完成保留与清理方案',
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
function DecisionModal({ request, item, sources, canRetain, onClose, onDone }: {
    request: DeletionRequestDetail;
    item: DeletionDecisionItem;
    sources: Source[];
    canRetain: boolean;
    onClose: () => void;
    onDone: () => void;
}) {
    const [decision, setDecision] = useState<'APPLY_PROPOSED' | 'RETAIN_WITH_BASIS'>('APPLY_PROPOSED');
    const [reason, setReason] = useState(''), [retentionSourceId, setRetentionSourceId] = useState('');
    const action = useAction();
    return <Modal title="记录保留决定" onClose={onClose}>
        <form onSubmit={e => { e.preventDefault(); void action.run(async () => {
            await call('deletion.decision', {
                expectedRevision: request.revision,
                entryId: item.id,
                decision,
                decisionReason: reason,
                ...(decision === 'RETAIN_WITH_BASIS' ? { retentionSourceId } : {})
            }, { id: request.id });
            onDone();
        }); }}>
            <div className="modal-body"><ErrorBox error={action.error}/>
                <div className="notice"><strong>{evidenceLabel[item.evidenceState] ?? item.evidenceState}</strong><p>{item.recordSummary}</p><p>{detailText(item.detailCode)}</p></div>
                <dl className="detail-grid"><div><dt>依赖类型</dt><dd><code>{item.dependencyKind}</code></dd></div><div><dt>系统建议</dt><dd>{actionLabel[item.proposedAction] ?? item.proposedAction}</dd></div></dl>
                <Field label="本项决定">
                    <select value={decision} onChange={e => { setDecision(e.target.value as 'APPLY_PROPOSED' | 'RETAIN_WITH_BASIS'); setRetentionSourceId(''); }}>
                        <option value="APPLY_PROPOSED">{item.dependencyKind==='SOURCE_TALENT_FACT'?'删除这项专业资料':item.dependencyKind==='SOURCE_TALENT_FACT_GROUP'?'确认按逐项决定执行':'按系统建议处置'}</option>
                        {canRetain && !['PERSON_TALENT_GRAPH','ASSET_TALENT_REFERENCES','SOURCE_TALENT_EVIDENCE','SOURCE_TALENT_FACT_GROUP','SOURCE_ASSET_TALENT_REFERENCES'].includes(item.dependencyKind) && <option value="RETAIN_WITH_BASIS">有独立依据，保留</option>}
                    </select>
                </Field>
                {decision === 'RETAIN_WITH_BASIS' && <Field label="独立保留依据" hint="必须是另一份当前有效的正式 INTERNAL_USE 来源；目标原来源不能自证保留。">
                    <select required value={retentionSourceId} onChange={e => setRetentionSourceId(e.target.value)}><option value="">请选择当前可见来源</option>{sources.map(s => <option key={s.id} value={s.id}>{s.title} · v{s.revision}</option>)}</select>
                </Field>}
                <Field label="决定说明" hint="记录为何按建议处置，或为何存在独立依据；不要粘贴完整敏感原文。"><textarea required minLength={4} maxLength={2000} rows={5} value={reason} onChange={e => setReason(e.target.value)}/></Field>
            </div>
            <footer className="modal-footer"><button type="button" disabled={action.busy} onClick={onClose}>取消</button><Submit busy={action.busy}>保存决定</Submit></footer>
        </form>
    </Modal>;
}

function RequestDetail({ id, sources, canRetain, onChanged }: { id: string; sources: Source[]; canRetain: boolean; onChanged: () => void }) {
    const [tick, setTick] = useState(0), [itemPage, setItemPage] = useState(1), [editing, setEditing] = useState<DeletionDecisionItem | null>(null);
    const block = useAction(), freeze = useAction(), cleanup = useAction();
    const snapshotKey = id + ':' + itemPage + ':' + tick;
    const snapshot = useLoad(async () => {
        const [detail, entries] = await Promise.all([
            read<DeletionRequestDetail>('deletion.get', { id }),
            read<Page<DeletionDecisionItem>>('deletion.items', { id }, { page: String(itemPage), pageSize: '20' })
        ]);
        return { key: snapshotKey, detail, entries };
    }, snapshotKey);
    // Keep the displayed items and command revision from one completed refresh.
    const refreshing = snapshot.busy || snapshot.data?.key !== snapshotKey;
    const load = { data: snapshot.data?.detail, busy: refreshing, error: snapshot.error };
    const items = { data: snapshot.data?.entries, busy: refreshing, error: snapshot.error };
    useEffect(() => {
        if (load.data?.state !== 'CLEANING') return;
        const timer = setInterval(() => setTick(x => x + 1), 1500);
        return () => clearInterval(timer);
    }, [load.data?.state, load.data?.dependencyCleanupCompletedAt]);

    async function blockUse() {
        if (!load.data?.blockAvailable) return;
        if (!confirm('确认阻断该目标的正常使用？这不会物理删除数据，但正常读取、搜索、候选和导出将立即失效。')) return;
        await call('deletion.block', {
            expectedRevision: load.data.revision,
            previewDigest: load.data.previewDigest,
            acknowledgeBlock: true
        }, { id });
        setTick(x => x + 1); onChanged();
    }
    async function freezePlan() {
        if (!load.data || load.data.state !== 'BLOCKED_FOR_USE' || load.data.planFrozen) return;
        if (!confirm('确认冻结当前保留决定和清理计划？这一步仍不会执行物理删除，但冻结后不能再修改决定。')) return;
        await call('deletion.planFreeze', { expectedRevision: load.data.revision, acknowledgePlan: true }, { id });
        setTick(x => x + 1); onChanged();
    }
    async function startCleanup() {
        if (!load.data?.cleanupStartAvailable || !load.data.planDigest) return;
        if (!confirm('确认开始不可逆依赖清理？这会真实移除已冻结计划中的关系、联系方式、核验证据，并撤销许可/擦除旧导出。根对象、媒体文件和来源历史仍不会在本阶段删除。')) return;
        await call('deletion.cleanupStart', {
            expectedRevision: load.data.revision,
            planDigest: load.data.planDigest,
            acknowledgeIrreversible: true
        }, { id });
        setTick(x => x + 1); onChanged();
    }

    return <section className="panel padded deletion-request-detail"><ErrorBox error={load.error ?? items.error ?? block.error ?? freeze.error ?? cleanup.error}/>
        {load.busy && !load.data ? <p>正在读取删除申请摘要…</p> : load.data && <>
            <div className="panel-heading"><div><h2>删除申请</h2><p><code>{load.data.id}</code></p></div><Tag value={load.data.state}/></div>
            <dl className="detail-grid">
                <div><dt>目标类型</dt><dd>{kindLabel[load.data.targetKind]}</dd></div>
                <div><dt>目标版本</dt><dd>{load.data.targetRevision}</dd></div>
                <div><dt>冻结影响项</dt><dd>{load.data.impactCount}</dd></div>
                <div><dt>需人工判断</dt><dd>{load.data.reviewRequiredCount}</dd></div>
                <div><dt>待决定</dt><dd>{load.data.pendingDecisionCount}</dd></div>
                <div><dt>计划状态</dt><dd>{load.data.planFrozen ? '已冻结' : '未冻结'}</dd></div>
                <div><dt>依赖清理</dt><dd>{load.data.state === 'CLEANING' ? `${load.data.cleanupDoneCount} / ${load.data.impactCount}` : '未启动'}</dd></div>
                <div><dt>等待专用清理</dt><dd>{load.data.cleanupWaitingCount}</dd></div>
                <div><dt>执行失败</dt><dd>{load.data.cleanupFailedCount}</dd></div>
                <div><dt>未解析</dt><dd>{load.data.unresolvedCount}</dd></div>
                <div><dt>创建时间</dt><dd>{date(load.data.createdAt)}</dd></div>
            </dl>
            <p className="pre-line">{load.data.reason}</p>
            <div className="notice"><strong>{load.data.state === 'DRAFT' ? '尚未阻断正常使用'
                : load.data.state === 'BLOCKED_FOR_USE' ? (load.data.planFrozen ? '已阻断；清理计划已冻结' : '已阻断正常使用；正在做保留决定')
                : load.data.state === 'CLEANING' ? '正在执行依赖清理与专用最终化'
                : load.data.state === 'COMPLETED' ? '删除流程已完成'
                : load.data.state === 'RETAINED_WITH_BASIS' ? '删除完成，部分依赖有据保留'
                : '最终化失败，目标继续保持阻断'}</strong><p>{load.data.executionNote}</p>
                {load.data.cleanupErrorCode && <p><strong>清理状态：</strong><code>{load.data.cleanupErrorCode}</code></p>}
                {load.data.finalizationErrorCode && <p><strong>最终化状态：</strong><code>{load.data.finalizationErrorCode}</code></p>}
            </div>

            {load.data.blockAvailable && <div className="button-row"><button className="danger" disabled={block.busy || refreshing} onClick={() => void block.run(blockUse)}>阻断正常使用</button></div>}

            {load.data.state === 'BLOCKED_FOR_USE' && <div className="deletion-decision-workspace">
                <div className="panel-heading"><div><h3>保留决定</h3><p>这里不显示被冻结依赖的底层对象 ID。PROVEN 项自动采用系统建议；只有 REVIEW_REQUIRED 项需要人工判断。</p></div></div>
                {items.busy && !items.data ? <p>正在读取安全决策槽…</p> : items.data && <>
                    <div className="table-wrap"><table><thead><tr><th>依赖类型</th><th>系统建议</th><th>证据</th><th>当前决定</th><th>说明</th><th/></tr></thead><tbody>{items.data.items.map(item => <tr key={item.id}>
                        <td><code>{item.dependencyKind}</code>{item.recordSummary&&<p>{item.recordSummary}</p>}</td>
                        <td>{actionLabel[item.proposedAction] ?? item.proposedAction}</td>
                        <td>{evidenceLabel[item.evidenceState] ?? item.evidenceState}</td>
                        <td>{item.decision === 'PENDING' ? '待决定' : item.decision === 'RETAIN_WITH_BASIS' ? '有独立依据保留' : '按建议处置'}</td>
                        <td>{item.decisionReason || (item.retentionBasisPresent ? '已记录独立保留依据' : detailText(item.detailCode))}</td>
                        <td>{item.decision === 'PENDING' && !load.data?.planFrozen && <button disabled={refreshing} onClick={() => { if (!refreshing) setEditing(item); }}>做决定</button>}</td>
                    </tr>)}</tbody></table></div>
                    <Pager page={itemPage} pageSize={20} total={items.data.total} setPage={setItemPage}/>
                </>}
                {!load.data.planFrozen && <div className="deletion-freeze-box">
                    <h3>冻结清理计划</h3>
                    <p className="muted">待决定为 0 后才可冻结。冻结只锁定“未来要做什么”，不会进入 CLEANING，也不会删除任何行、媒体或导出 payload。</p>
                    <button className="danger" disabled={freeze.busy || refreshing || load.data.pendingDecisionCount > 0} onClick={() => void freeze.run(freezePlan)}>{load.data.pendingDecisionCount > 0 ? `仍有 ${load.data.pendingDecisionCount} 项待决定` : '冻结清理计划'}</button>
                </div>}
                {load.data.planFrozen && <div className="notice"><strong>计划已冻结</strong><p>冻结时间：{date(load.data.planFrozenAt)}。Plan Digest：<code>{load.data.planDigest}</code></p>
                    {load.data.cleanupStartAvailable ? <><p>下一步将真实执行依赖清理；部署侧仍需明确启用 DATA_CLEANUP_MODE。</p><button className="danger" disabled={cleanup.busy || refreshing} onClick={() => void cleanup.run(startCleanup)}>开始不可逆依赖清理</button></>
                        : <p>当前不能再次启动清理。</p>}
                </div>}
            </div>}
            {load.data.state === 'CLEANING' && <div className="deletion-cleanup-progress">
                <h3>依赖清理进度</h3>
                <div className="stats">
                    <div className="stat"><span>已完成</span><strong>{load.data.cleanupDoneCount}</strong><small>有清理证据</small></div>
                    <div className="stat"><span>等待专用清理</span><strong>{load.data.cleanupWaitingCount}</strong><small>媒体 / 历史 / 根对象等</small></div>
                    <div className="stat"><span>失败</span><strong>{load.data.cleanupFailedCount}</strong><small>可由 Worker 安全重试</small></div>
                </div>
                {load.data.dependencyCleanupCompletedAt && <p className="muted">本阶段依赖清理完成时间：{date(load.data.dependencyCleanupCompletedAt)}。根对象终结仍未启用。</p>}
                {!load.data.dependencyCleanupCompletedAt && <p className="muted">Worker 正在按冻结计划执行。目标持续保持不可见，不会因为清理中断而恢复正常使用。</p>}
            </div>}
            {['COMPLETED','RETAINED_WITH_BASIS','FAILED'].includes(load.data.state) && <div className="deletion-cleanup-progress">
                <h3>最终结果</h3>
                <dl className="detail-grid"><div><dt>最终化时间</dt><dd>{date(load.data.finalizedAt)}</dd></div><div><dt>最终化尝试</dt><dd>{load.data.finalizationAttempts}</dd></div><div><dt>Finalization Digest</dt><dd><small>{load.data.finalizationDigest ?? '—'}</small></dd></div></dl>
                <p className="muted">正常业务入口继续保持不可见；删除管理仅保留审计所需的最小头和清理证据。</p>
            </div>}
            {!load.data.cleanupAvailable && ['DRAFT','BLOCKED_FOR_USE'].includes(load.data.state) && <p className="muted">不可逆动作只会按冻结计划执行。</p>}
        </>}
        {editing && load.data && <DecisionModal request={load.data} item={editing} sources={sources} canRetain={canRetain} onClose={() => setEditing(null)} onDone={() => { setEditing(null); setTick(x => x + 1); onChanged(); }}/>}
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

    return <><PageTitle overline="CONTROLLED DELETION / PLAN BEFORE CLEANUP" title="删除影响与清理" description="先证明影响并阻断使用，再完成保留决定、冻结计划；只有显式确认后才执行不可逆依赖清理。根对象终结、媒体物理清理和来源历史专用清理仍分阶段处理。" action={<button onClick={() => setRefresh(x => x + 1)}>刷新</button>}/>
        <ErrorBox error={people.error ?? works.error ?? projects.error ?? sources.error ?? assets.error ?? requests.error ?? inspect.error ?? create.error}/>
        <div className="notice"><strong>不可逆动作必须来自冻结计划</strong><p>阻断前重新验证影响图；清理前再次验证 planDigest 与保留依据。CLEANING 只处理已注册依赖动作，不会把待专用处理项假报完成。</p></div>

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
                <div className="table-wrap deletion-impact-table"><table><thead><tr><th>对象</th><th>依赖</th><th>建议动作</th><th>判断</th><th>原因</th></tr></thead><tbody>{preview.items.map(x => <tr key={[x.resourceKind,x.resourceId,x.dependencyKind,x.proposedAction].join(':')}><td><strong>{x.resourceKind}</strong><small>{x.resourceId}</small></td><td><code>{x.dependencyKind}</code></td><td>{actionLabel[x.proposedAction] ?? x.proposedAction}</td><td>{evidenceLabel[x.evidenceState] ?? x.evidenceState}</td><td>{detailText(x.detailCode)}</td></tr>)}</tbody></table></div>
                <div className="deletion-freeze-box">
                    <h3>2. 冻结为 DRAFT 删除申请</h3>
                    <Field label="申请原因" hint="这里只说明为什么需要进入后续删除评估；本操作不会阻断或清理目标。"><textarea rows={4} required minLength={4} maxLength={2000} disabled={!preview.complete} value={reason} onChange={e => setReason(e.target.value)}/></Field>
                    <button className="primary" disabled={!preview.complete || reason.trim().length < 4 || create.busy} onClick={() => void create.run(createDraft)}>{create.busy ? '正在冻结…' : '创建 DRAFT 申请'}</button>
                </div>
            </div>}
        </section>

        <section className="panel"><div className="panel-heading"><div><h2>已有删除申请</h2><p>这里只显示当前仍有权看到目标的申请摘要；不会回显被冻结的依赖 ID。</p></div></div>
            {requests.data?.items.length ? <div className="table-wrap"><table><thead><tr><th>时间</th><th>目标</th><th>影响项</th><th>需人工判断</th><th>状态</th><th/></tr></thead><tbody>{requests.data.items.map(x => <tr key={x.id}><td>{date(x.createdAt)}</td><td>{kindLabel[x.targetKind]}<small>{x.targetId}</small></td><td>{x.impactCount}</td><td>{x.reviewRequiredCount}</td><td><Tag value={x.state}/></td><td><button onClick={() => setSelectedRequest(x.id)}>查看摘要</button></td></tr>)}</tbody></table></div> : <Empty title="还没有删除申请">先完成影响预览；只有影响图完整时才能冻结 DRAFT。</Empty>}
            {requests.data && <Pager page={page} pageSize={20} total={requests.data.total} setPage={setPage}/>}
        </section>
        {selectedRequest && <RequestDetail id={selectedRequest} sources={sources.data?.items ?? []} canRetain={me.permissions.includes('sources.review')} onChanged={() => setRefresh(x => x + 1)}/>}
    </>;
}
