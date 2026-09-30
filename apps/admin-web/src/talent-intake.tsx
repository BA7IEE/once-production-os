import { useState } from 'react';
import { call } from './api.ts';
import type { CatalogItem, Receipt, Source } from './dto.ts';
import { ErrorBox, Field, Modal, useAction } from './ui.tsx';
import { TalentSourceChoice, outcomeUnknown } from './talent-edit.tsx';

export function TalentIntake({ catalog, canChooseSource, onClose, onSaved }: {
    catalog: CatalogItem[]; canChooseSource: boolean; onClose: () => void; onSaved: (id: string) => void;
}) {
    const [name, setName] = useState('');
    const [kind, setKind] = useState<'TALENT' | 'CONTACT'>('TALENT');
    const [roles, setRoles] = useState(['model']);
    const [existing, setExisting] = useState(false);
    const [source, setSource] = useState<Source | null>(null);
    const action = useAction();
    const unknown = outcomeUnknown(action.error), frozen = action.busy || unknown;
    const close = () => { if (!frozen && (!name || window.confirm('尚未保存这份草稿，确定关闭？'))) onClose(); };
    return <Modal title="新增人才" onClose={close}><form onSubmit={event => {
        event.preventDefault();
        void action.run(async () => {
            const receipt = await call<'directory.talent.create', Receipt>('directory.talent.create', {
                schemaVersion: 'once-talent-experience-v1', displayName: name,
                kind, roleCodes: kind === 'TALENT' ? roles : [],
                ...(existing && source ? { sourceId: source.id, sourceRevision: source.revision } : {}),
            });
            onSaved(receipt.resourceId);
        });
    }}><div className="modal-body"><ErrorBox error={action.error}/>
        <fieldset disabled={frozen}><Field label="姓名 / 艺名 *"><input required autoComplete="off" maxLength={120} value={name} onChange={e => setName(e.target.value)}/></Field>
        <Field label="建档类型"><select value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="TALENT">人才</option><option value="CONTACT">普通联系人</option></select></Field>
        {kind === 'TALENT' && <fieldset><legend>职业（可多选）</legend><div className="role-list">{catalog.filter(c => c.namespace === 'role' && c.status === 'ACTIVE').map(c => <label key={c.code}><input type="checkbox" checked={roles.includes(c.code)} onChange={e => setRoles(values => e.target.checked ? [...values, c.code] : values.filter(v => v !== c.code))}/>{c.labelZh}</label>)}</div></fieldset>}
        {canChooseSource && <label><input type="checkbox" checked={existing} onChange={e => setExisting(e.target.checked)}/>使用已有资料来源</label>}
        {existing ? <TalentSourceChoice value={source} disabled={frozen} onChange={setSource}/> : <p className="notice">先保存草稿，其他资料以后补充。未选来源时，仅你可见，临时整理最长 7 天；继续使用前需核对来源和依据。</p>}
        {kind === 'CONTACT' && <p className="muted">只保存联系人，后续可以在同一档案上添加职业。</p>}</fieldset>
        {unknown && <p className="notice" role="status">提交结果尚不明确，已保留原内容。请点击“核对原提交”，确认后再修改。</p>}
    </div><footer className="modal-footer"><button type="button" disabled={frozen} onClick={close}>取消</button><button type="submit" className="primary" disabled={action.busy || !name.trim() || (kind === 'TALENT' && !roles.length) || (existing && !source)}>{action.busy ? '正在保存…' : unknown ? '核对原提交' : '保存草稿'}</button></footer></form></Modal>;
}
