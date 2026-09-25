import { useMemo, useState } from 'react';
import { call, read } from './api.ts';
import type { Me, Page, Person, Receipt } from './dto.ts';
import type { PersonMergeCollisionChoice, PersonMergeFieldChoice, PersonMergePreview } from './merge-dto.ts';
import { ErrorBox, Field, PageTitle, Submit, useAction, useLoad } from './ui.tsx';

const fieldLabel: Record<string, string> = {
    displayName: '展示名', aliases: '别名', roles: '角色', cityCode: '城市',
    languageCodes: '语言', skillCodes: '技能', heightCm: '身高', intro: '简介'
};
const blockerLabel: Record<string, string> = {
    SCOPE_MISMATCH: '两条档案不在同一访问范围',
    ERASED_PERSON: '至少一条档案已经擦除',
    CANONICAL_ALREADY_ALIAS: '主档案已经是旧 ID 别名',
    DUPLICATE_ALREADY_ALIAS: '重复档案已经是旧 ID 别名',
    DUPLICATE_HAS_ALIASES: '重复档案仍承接其他旧 ID',
    PERSON_DELETION_REQUEST: '档案存在删除申请',
    ACTIVE_DELETION_DEPENDENCY: '档案被活动中的删除计划引用',
    SENSITIVE_WRITE_REQUIRED: '存在联系方式，需要“维护敏感字段”权限才能安全重加密',
    HIDDEN_CONTACT_SOURCE: '存在当前不可见的联系方式来源',
    HIDDEN_EVIDENCE_SOURCE: '存在当前不可见的核验证据来源',
    SOURCES_REVIEW_REQUIRED: '存在活动用途许可，需要来源核验权限才能撤销',
    HIDDEN_MEDIA_DEPENDENCY: '存在当前不可见的媒体依赖',
    HIDDEN_WORK_REFERENCE: '存在当前不可见的作品关系',
    HIDDEN_PROJECT_REFERENCE: '存在当前不可见的项目关系',
    HIDDEN_SHORTLIST_REFERENCE: '存在当前不可见的候选清单关系',
    MERGE_COLLISION_LIMIT: '关系冲突超过当前安全处理上限'
};
const collisionLabel: Record<string, string> = {
    WORK_CREDIT: '作品署名', PROJECT_PARTICIPANT: '项目参与', SHORTLIST_ITEM: '候选清单'
};
function valueText(value: unknown) {
    if (value === null || value === undefined || value === '') return '—';
    if (Array.isArray(value)) return value.length ? value.join(' / ') : '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function PersonPicker({ label, selected, excludeId, onSelect }: {
    label: string;
    selected: Person | null;
    excludeId?: string;
    onSelect: (person: Person | null) => void;
}) {
    const [q, setQ] = useState('');
    const load = useLoad(() => read<Page<Person>>('person.list', {}, {
        page: '1', pageSize: '12', ...(q.trim() ? { q: q.trim() } : {})
    }), 'merge-picker:' + label + ':' + q);
    const rows = (load.data?.items ?? []).filter(p => p.id !== excludeId && p.status !== 'ARCHIVED');
    return <section className="merge-picker">
        <Field label={label} hint="只显示当前有权访问的在用档案；同名不会自动判断为同一人。">
            <input aria-label={label + '搜索'} value={q} onChange={e => setQ(e.target.value)} maxLength={120} placeholder="搜索姓名、艺名或别名"/>
        </Field>
        <ErrorBox error={load.error}/>
        {selected && <div className="merge-selected"><div><strong>{selected.displayName}</strong><small><code>{selected.id}</code> · v{selected.revision}</small></div><button type="button" onClick={() => onSelect(null)}>重新选择</button></div>}
        {!selected && <div className="merge-picker-results">{load.busy ? <p className="loading">正在查询…</p> : rows.length ? rows.map(p =>
            <button type="button" key={p.id} onClick={() => onSelect(p)}><strong>{p.displayName}</strong><small>{p.roles.join(' / ') || '未标角色'} · v{p.revision}</small></button>
        ) : <p className="muted">没有匹配的可合并档案。</p>}</div>}
    </section>;
}

function PreviewPanel({ preview, fieldChoices, collisionChoices, setFieldChoice, setCollisionChoice }: {
    preview: PersonMergePreview;
    fieldChoices: Partial<Record<string, PersonMergeFieldChoice>>;
    collisionChoices: Record<string, PersonMergeCollisionChoice | undefined>;
    setFieldChoice: (field: string, choice: PersonMergeFieldChoice | undefined) => void;
    setCollisionChoice: (id: string, choice: PersonMergeCollisionChoice | undefined) => void;
}) {
    return <div className="merge-preview">
        <div className={preview.complete ? 'notice' : 'error'}>
            <strong>{preview.complete ? '影响扫描完整，可以继续人工决策' : '当前不能执行合并'}</strong>
            <p>{preview.complete ? '系统只冻结当前可见、可证明的影响；执行前仍会重新扫描并校验 Digest。' : '存在无法安全处理的依赖。先解决以下阻断项，不会自动降级或跳过。'}</p>
        </div>
        {!!preview.blockers.length && <section className="panel padded"><h2>阻断项</h2><div className="merge-blockers">{preview.blockers.map(x =>
            <div key={x.code}><strong>{blockerLabel[x.code] ?? x.code}</strong><span>{x.count} 项</span></div>
        )}</div></section>}

        <section className="panel padded">
            <h2>将发生的安全处置</h2>
            <dl className="detail-grid">
                <div><dt>旧交接撤销</dt><dd>{preview.revocations.handoffs}</dd></div>
                <div><dt>旧用途许可撤销</dt><dd>{preview.revocations.usePermissions}</dd></div>
                <div><dt>联系方式重新加密</dt><dd>{preview.contactsToReencrypt}</dd></div>
                <div><dt>上传记录解除人物绑定</dt><dd>{preview.media.uploadsToDetach}</dd></div>
                <div><dt>图片改绑主档案</dt><dd>{preview.media.assetsToReassign}</dd></div>
                <div><dt>图片解除人物绑定</dt><dd>{preview.media.assetsToDetach}</dd></div>
                <div><dt>作品关系迁移</dt><dd>{preview.moves.workCredits}</dd></div>
                <div><dt>项目关系迁移</dt><dd>{preview.moves.projectParticipants}</dd></div>
                <div><dt>候选关系迁移</dt><dd>{preview.moves.shortlistItems}</dd></div>
            </dl>
        </section>

        {!!preview.fieldConflicts.length && <section className="panel">
            <div className="panel-heading"><div><h2>字段冲突</h2><p>每一项都必须由人明确决定；没有默认选择。</p></div></div>
            <div className="table-wrap"><table><thead><tr><th>字段</th><th>主档案</th><th>重复档案</th><th>决定</th></tr></thead><tbody>{preview.fieldConflicts.map(x =>
                <tr key={x.field}><td><strong>{fieldLabel[x.field] ?? x.field}</strong></td><td className="merge-value">{valueText(x.canonicalValue)}</td><td className="merge-value">{valueText(x.duplicateValue)}</td><td>
                    <select aria-label={'字段决定 ' + x.field} value={fieldChoices[x.field] ?? ''} onChange={e => setFieldChoice(x.field, (e.target.value || undefined) as PersonMergeFieldChoice | undefined)}>
                        <option value="">请选择</option>
                        {x.choices.includes('CANONICAL') && <option value="CANONICAL">保留主档案</option>}
                        {x.choices.includes('DUPLICATE') && <option value="DUPLICATE">采用重复档案</option>}
                        {x.choices.includes('UNION') && <option value="UNION">合并去重</option>}
                    </select>
                </td></tr>
            )}</tbody></table></div>
        </section>}

        {!!preview.collisions.length && <section className="panel">
            <div className="panel-heading"><div><h2>关系冲突</h2><p>两条身份在同一业务对象上已有重复关系，必须保留其中一条。</p></div></div>
            <div className="table-wrap"><table><thead><tr><th>类型</th><th>对象</th><th>主档案关系</th><th>重复档案关系</th><th>决定</th></tr></thead><tbody>{preview.collisions.map(x =>
                <tr key={x.id}><td>{collisionLabel[x.kind] ?? x.kind}</td><td>{x.rootLabel}</td><td className="merge-value">{valueText(x.canonicalValue)}</td><td className="merge-value">{valueText(x.duplicateValue)}</td><td>
                    <select aria-label={'关系决定 ' + x.id} value={collisionChoices[x.id] ?? ''} onChange={e => setCollisionChoice(x.id, (e.target.value || undefined) as PersonMergeCollisionChoice | undefined)}>
                        <option value="">请选择</option><option value="KEEP_CANONICAL">保留主档案关系</option><option value="KEEP_DUPLICATE">采用重复档案关系</option>
                    </select>
                </td></tr>
            )}</tbody></table></div>
        </section>}
    </div>;
}

export function PersonMergePanel({ me }: { me: Me }) {
    const [canonical, setCanonical] = useState<Person | null>(null);
    const [duplicate, setDuplicate] = useState<Person | null>(null);
    const [preview, setPreview] = useState<PersonMergePreview | null>(null);
    const [fieldChoices, setFieldChoices] = useState<Partial<Record<string, PersonMergeFieldChoice>>>({});
    const [collisionChoices, setCollisionChoices] = useState<Record<string, PersonMergeCollisionChoice | undefined>>({});
    const [ackRevocations, setAckRevocations] = useState(false);
    const [ackMedia, setAckMedia] = useState(false);
    const [reason, setReason] = useState('');
    const [done, setDone] = useState<Receipt | null>(null);
    const action = useAction();

    const revocationCount = preview ? preview.revocations.handoffs + preview.revocations.usePermissions : 0;
    const detachCount = preview ? preview.media.uploadsToDetach + preview.media.assetsToDetach : 0;
    const allFields = !!preview && preview.fieldConflicts.every(x => !!fieldChoices[x.field]);
    const allCollisions = !!preview && preview.collisions.every(x => !!collisionChoices[x.id]);
    const ready = !!preview?.complete && allFields && allCollisions && reason.trim().length >= 4
        && (revocationCount === 0 || ackRevocations) && (detachCount === 0 || ackMedia);

    const previewKey = useMemo(() => canonical?.id + ':' + canonical?.revision + '|' + duplicate?.id + ':' + duplicate?.revision, [canonical, duplicate]);
    function invalidate(next?: () => void) {
        setPreview(null); setFieldChoices({}); setCollisionChoices({}); setAckRevocations(false); setAckMedia(false); setReason(''); setDone(null);
        next?.();
    }
    async function scan() {
        if (!canonical || !duplicate) return;
        const data = await call<'person.mergePreview', PersonMergePreview>('person.mergePreview', {
            canonicalId: canonical.id,
            duplicateId: duplicate.id,
            expectedCanonicalRevision: canonical.revision,
            expectedDuplicateRevision: duplicate.revision
        });
        setPreview(data);
        setFieldChoices({});
        setCollisionChoices({});
        setAckRevocations(false);
        setAckMedia(false);
        setReason('');
        setDone(null);
    }
    async function execute() {
        if (!preview || !ready) return;
        if (!window.confirm(`确认把“${preview.duplicate.displayName}”作为重复档案合入“${preview.canonical.displayName}”？旧 ID 之后只能解析读取，不能继续写入。`)) return;
        const receipt = await call<'person.merge', Receipt>('person.merge', {
            canonicalId: preview.canonical.id,
            duplicateId: preview.duplicate.id,
            expectedCanonicalRevision: preview.canonical.revision,
            expectedDuplicateRevision: preview.duplicate.revision,
            previewDigest: preview.previewDigest,
            fieldDecisions: preview.fieldConflicts.map(x => ({ field: x.field, choice: fieldChoices[x.field]! })),
            collisionDecisions: preview.collisions.map(x => ({ collisionId: x.id, choice: collisionChoices[x.id]! })),
            acknowledgeRevocations: ackRevocations,
            acknowledgeMediaDetach: ackMedia,
            reason: reason.trim()
        });
        setDone(receipt);
    }

    if (!me.permissions.includes('data.merge')) return null;
    return <>
        <PageTitle overline="IDENTITY CONTROL" title="人才合并" description="只处理已经人工确认属于同一真实人才的重复档案。重名、同电话、相似资料都不会触发自动合并；账号、用途许可和访问范围不会跟随身份自动扩张。"/>
        <div className="notice"><strong>高风险维护操作</strong><p>先选“保留的主档案”和“被合并的重复档案”。预览是零写入；只有影响完整、所有冲突逐项决定、必要撤销明确确认后，才能执行一次原子合并。</p></div>
        <div className="merge-pickers" data-preview-key={previewKey}>
            <PersonPicker label="主档案（保留）" selected={canonical} excludeId={duplicate?.id} onSelect={p => invalidate(() => setCanonical(p))}/>
            <PersonPicker label="重复档案（归档并建立旧 ID 映射）" selected={duplicate} excludeId={canonical?.id} onSelect={p => invalidate(() => setDuplicate(p))}/>
        </div>
        <ErrorBox error={action.error}/>
        {!preview && <div className="merge-scan-bar"><div><strong>影响预览不会修改任何数据</strong><small>系统会检查范围、来源、删除流程、交接、用途许可、联系方式、媒体、作品、项目和候选清单关系。</small></div><button className="primary" disabled={!canonical || !duplicate || action.busy} onClick={() => void action.run(scan)}>{action.busy ? '正在扫描…' : '预览合并影响'}</button></div>}

        {preview && <>
            <PreviewPanel preview={preview} fieldChoices={fieldChoices} collisionChoices={collisionChoices}
                setFieldChoice={(field, choice) => setFieldChoices(x => ({ ...x, [field]: choice }))}
                setCollisionChoice={(id, choice) => setCollisionChoices(x => ({ ...x, [id]: choice }))}/>
            {preview.complete && <section className="panel padded merge-execute">
                <h2>执行确认</h2>
                <p className="muted">执行时会按同一组版本和 Preview Digest 再扫描一次。任何依赖变化都会拒绝旧预览，而不是继续执行。</p>
                {revocationCount > 0 && <label className={'check-chip ' + (ackRevocations ? 'checked' : '')}><input type="checkbox" checked={ackRevocations} onChange={e => setAckRevocations(e.target.checked)}/>我确认撤销 {preview.revocations.handoffs} 个交接和 {preview.revocations.usePermissions} 个旧用途许可，不把它们转移到主档案</label>}
                {detachCount > 0 && <label className={'check-chip ' + (ackMedia ? 'checked' : '')}><input type="checkbox" checked={ackMedia} onChange={e => setAckMedia(e.target.checked)}/>我确认解除 {preview.media.uploadsToDetach} 个上传记录和 {preview.media.assetsToDetach} 个无法保持来源一致的图片关联</label>}
                <Field label="合并依据 *" hint="至少 4 个字符。记录为何已经人工确认两条档案属于同一真实人才；不要粘贴敏感原文。"><textarea rows={4} minLength={4} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)}/></Field>
                {done ? <div className="success"><strong>合并已完成</strong><p>决策记录：<code>{done.resourceId}</code>。重复档案旧 ID 仅保留只读解析，后续写入必须使用主档案 ID。</p></div>
                    : <div className="button-row"><button type="button" onClick={() => invalidate()} disabled={action.busy}>重新预览</button><button className="danger" disabled={!ready || action.busy} onClick={() => void action.run(execute)}>{action.busy ? '正在执行…' : '执行受控合并'}</button></div>}
            </section>}
        </>}
    </>;
}
