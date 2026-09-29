import { useState } from 'react';
import { ApiError, call, read } from './api.ts';
import type { Handoff, HandoffRecipient, Page, Person, Receipt, Source } from './dto.ts';
import { Modal, Field, ErrorBox, Empty, date, useLoad, useAction, Submit, PageTitle, Pager } from './ui.tsx';

const purposes = { EDIT: '整理基本资料', REVIEW: '查看及字段核验' };
const states = { PENDING: '待接收', ACCEPTED: '已接收', DECLINED: '已拒收', REVOKED: '已撤销', EXPIRED: '已到期', INVALIDATED: '已失效' };
const unknown = (error: unknown) => error instanceof ApiError && error.unknownOutcome;
function localInput(ms: number) { const d = new Date(ms); return new Date(ms - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }

export function HandoffOffer({ person, onClose, onSaved }: { person: Person; onClose: () => void; onSaved: () => void }) {
    const [purpose, setPurpose] = useState<'EDIT' | 'REVIEW'>('EDIT');
    const [recipientId, setRecipientId] = useState('');
    const [q, setQ] = useState('');
    const [page, setPage] = useState(1);
    const [until, setUntil] = useState(() => localInput(Math.min(Date.parse(person.source!.validUntil), Date.now() + 86400000)));
    const [ack, setAck] = useState(false);
    const action = useAction();
    const freeze = action.busy || unknown(action.error);
    const load = useLoad(() => read<Page<HandoffRecipient>>('handoff.recipients', { id: person.id },
        { purpose, q, page: String(page), pageSize: '20' }), [person.id, purpose, q, page].join('|'));
    const close = () => { if (!action.busy && (!unknown(action.error) || confirm('提交结果未知。关闭后请到发出的交接列表核对，不能直接另发一份。确认关闭？'))) onClose(); };
    return <Modal title="交给指定同事" onClose={close}><form onSubmit={e => { e.preventDefault(); void action.run(async () => {
        await call<'handoff.create', Receipt>('handoff.create', { expectedRevision: person.revision,
            expectedSourceRevision: person.source!.revision, recipientId, purpose,
            expiresAt: new Date(until).toISOString(), acknowledgeLimitedAccess: ack }, { id: person.id });
        onSaved();
    }); }}><div className="modal-body"><ErrorBox error={action.error ?? load.error}/><p><strong>{person.displayName}</strong> · 版本 {person.revision}</p>
        <div className="notice">只交接这一份基本档案，原维护人保留访问权。不改变整个范围，不带出联系方式、来源原文或历史，也不能继续转交。</div>
        <Field label="处理用途"><select disabled={freeze} value={purpose} onChange={e => { setPurpose(e.target.value as typeof purpose); setRecipientId(''); setPage(1); }}>{Object.entries(purposes).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></Field>
        <Field label="筛选同事"><input value={q} disabled={freeze} maxLength={120} onChange={e => { setQ(e.target.value); setPage(1); setRecipientId(''); }}/></Field>
        <Field label="接收同事"><select required disabled={freeze || load.busy} value={recipientId} onChange={e => setRecipientId(e.target.value)}><option value="">选择有相应能力的已激活成员</option>{load.data?.items.map(m => <option key={m.membershipId} value={m.membershipId}>{m.displayName}</option>)}</select></Field>
        {!freeze && load.data && <Pager page={page} pageSize={20} total={load.data.total} setPage={p => { setPage(p); setRecipientId(''); }}/>}
        <Field label="交接截止时点" hint="按设备时区填写；不得超过来源截止时点，最长 7 天。"><input required disabled={freeze} type="datetime-local" value={until} onChange={e => setUntil(e.target.value)}/></Field>
        <label className="check-chip"><input type="checkbox" required disabled={freeze} checked={ack} onChange={e => setAck(e.target.checked)}/>我已检查基本字段适合交给该同事，不含应放入受限字段的内容。</label>
        <p className="muted">“字段核验”仍需使用接收人本来就有权读取的独立证据，交接不会批准来源用途或延长期限。</p>
    </div><footer className="modal-footer"><button type="button" disabled={action.busy} onClick={close}>取消</button><Submit busy={action.busy}>{unknown(action.error) ? '原样核对交接邀请' : '发送交接邀请'}</Submit></footer></form></Modal>;
}

function HandoffActions({ item, refresh }: { item: Handoff; refresh: () => void }) {
    const action = useAction();
    const [pending, setPending] = useState<{ kind: 'accept' | 'decline' | 'revoke'; revision: number } | null>(null);
    const uncertain = unknown(action.error);
    const perform = (kind: 'accept' | 'decline' | 'revoke') => void action.run(async () => {
        const request = uncertain && pending ? pending : { kind, revision: item.revision };
        setPending(request);
        await call('handoff.' + request.kind as 'handoff.accept' | 'handoff.decline' | 'handoff.revoke',
            { expectedRevision: request.revision }, { id: item.id });
        setPending(null); action.clear(); refresh();
    });
    return <div><ErrorBox error={action.error}/>{uncertain && pending ? <button disabled={action.busy} onClick={() => perform(pending.kind)}>原样核对上次交接操作</button> : <>
        {item.canAccept && <button disabled={action.busy} onClick={() => perform('accept')}>接收交接</button>}
        {item.canDecline && <button disabled={action.busy} onClick={() => perform('decline')}>拒绝接收</button>}
        {item.canRevoke && <button disabled={action.busy} onClick={() => perform('revoke')}>{item.direction === 'SENT' ? '撤销交接' : '放弃本次交接'}</button>}
    </>}</div>;
}
export function HandoffInbox({ onOpen }: { onOpen: (id: string) => void }) {
    const [direction, setDirection] = useState<'SENT' | 'RECEIVED'>('RECEIVED');
    const [page, setPage] = useState(1), [version, setVersion] = useState(0);
    const refresh = () => setVersion(v => v + 1);
    const load = useLoad(() => read<Page<Handoff>>('handoff.list', {}, { direction, page: String(page), pageSize: '20' }), [direction, page, version].join('|'));
    return <><PageTitle overline="CONTROLLED HANDOFF" title="资料交接" description="指定同事、限定用途、限时处理。发出邀请不会立刻公开资料，接收后才获得本次基本档案访问。" action={<button onClick={refresh}>刷新交接</button>}/>
        <div className="filters"><button aria-pressed={direction === 'RECEIVED'} onClick={() => { setDirection('RECEIVED'); setPage(1); }}>收到的交接</button><button aria-pressed={direction === 'SENT'} onClick={() => { setDirection('SENT'); setPage(1); }}>发出的交接</button></div>
        <ErrorBox error={load.error}/>{load.busy ? <p>正在读取当前交接状态…</p> : load.data && <>
            {load.data.items.length ? <div className="simple-list">{load.data.items.map(h => <section className="panel padded" key={h.id} data-handoff-id={h.id}>
                <h2>{h.person?.displayName ?? '接收前或失效后不展示档案内容'}</h2><p>{h.direction === 'RECEIVED' ? '来自' : '接收人'}：{h.counterpart} · {purposes[h.purpose]} · <strong>{states[h.effectiveState]}</strong></p>
                <small>截止 {date(h.expiresAt)} · 交接编号 {h.id}</small>
                {h.effectiveState === 'INVALIDATED' && <p>资料版本、范围或成员资格已变化，请原维护人核对后重新发起。</p>}
                {h.person && <button onClick={() => onOpen(h.person!.id)}>打开档案</button>}
                <HandoffActions item={h} refresh={refresh}/>
            </section>)}</div> : <Empty title="暂无交接">维护人可从人才详情发起。只有指定的接收人能处理邀请。</Empty>}
            <Pager page={page} pageSize={20} total={load.data.total} setPage={setPage}/>
        </>}</>;
}

/** Only sources already available through the original source.list boundary are selectable. */
export function FieldReview({ person, onClose, onSaved }: { person: Person; onClose: () => void; onSaved: () => void }) {
    const [sourceId, setSourceId] = useState('');
    const [page, setPage] = useState(1);
    const [ack, setAck] = useState(false);
    const action = useAction();
    const freeze = action.busy || unknown(action.error);
    const load = useLoad(() => read<Page<Source>>('source.list', {}, { page: String(page), pageSize: '20' }), page);
    const chosen = load.data?.items.find(s => s.id === sourceId);
    return <Modal title="核验姓名字段" onClose={() => { if (!action.busy) onClose(); }}><form onSubmit={e => { e.preventDefault(); if (!chosen || !ack) return; void action.run(async () => {
        await call('evidence.confirm', { personId: person.id, expectedRevision: person.revision, fieldPath: 'displayName', sourceId: chosen.id, sourceRevision: chosen.revision }); onSaved();
    }); }}><div className="modal-body"><ErrorBox error={action.error ?? load.error}/><p>待核验姓名：<strong>{person.displayName}</strong></p>
        <p className="notice">交接只提供基本档案，不授予原文读取或来源核准权。请用你本来就有权读取的证据核验；没有独立证据时不要确认。</p>
        <Field label="独立可读的证据来源"><select required disabled={freeze} value={sourceId} onChange={e => { setSourceId(e.target.value); setAck(false); }}><option value="">选择已获准的有效来源</option>{load.data?.items.filter(s => s.current).map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></Field>
        {chosen && <p className="pre-line">{chosen.basisDescription}</p>}
        {!freeze && load.data && <Pager page={page} pageSize={20} total={load.data.total} setPage={p => { setPage(p); setSourceId(''); setAck(false); }}/>}
        <label><input type="checkbox" required disabled={freeze} checked={ack} onChange={e => setAck(e.target.checked)}/>我已在允许的证据范围内核对姓名；这不是专业资质认证。</label>
    </div><footer className="modal-footer"><button type="button" onClick={onClose} disabled={action.busy}>取消</button><Submit busy={action.busy}>{unknown(action.error) ? '原样核对确认结果' : '确认姓名与证据一致'}</Submit></footer></form></Modal>;
}
