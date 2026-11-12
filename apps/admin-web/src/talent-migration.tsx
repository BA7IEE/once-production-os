import {AdminForm} from './foundation/patterns.tsx';
import {useState} from 'react';
import {call,read} from './api.ts';
import {TALENT_VERSION} from './talent-dto.ts';
import type {HeightMigrationReviews} from './talent-dto.ts';
import {ErrorBox,Modal,useAction,useLoad} from './ui.tsx';
import {outcomeUnknown} from './talent-edit.tsx';
export function TalentHeightReviews({personId,onClose,onSaved}:{personId:string;onClose:()=>void;onSaved:()=>void}){
 const [page,setPage]=useState(1),load=useLoad(()=>read<HeightMigrationReviews>('td2.heightReview.list',{id:personId},{page:String(page),pageSize:'20'}),personId+':'+page);
 const [selected,setSelected]=useState<{id:string;revision:number}|null>(null),[ack,setAck]=useState(false),action=useAction(),freeze=action.busy||outcomeUnknown(action.error);
 const close=()=>{if(!freeze)onClose();};
 return <Modal title="旧身高复核" onClose={close}><div className="modal-body"><ErrorBox error={load.error??action.error}/>{load.busy?<p>正在核对旧记录和来源…</p>:load.data&&<>
 <p>旧字段记录：{load.data.legacyHeightCm===null?'未填写':load.data.legacyHeightCm+' cm'}。这只是历史记录，不能当作已经确认的量尺。</p>
 <p>有明确测量日期和依据时，请返回量尺记录新增并确认身高。无法确认旧记录含义时，可以明确不采用，当前身高继续按已确认量尺显示。</p>
 {!load.data.items.length&&<p>没有需要显示的旧身高复核记录。</p>}
 {load.data.items.map(row=><article className="talent-fact" key={row.id}><p>{row.state==='PENDING'?'待核对':'已处理'}{row.resolvedAt?' · '+new Date(row.resolvedAt).toLocaleString('zh-CN'):''}</p>{row.state==='PENDING'&&load.data!.canDismiss&&<button disabled={freeze} onClick={()=>{setSelected(row);setAck(false);}}>不采用这项旧身高</button>}</article>)}
 <div className="detail-actions"><button disabled={freeze||page===1} onClick={()=>{setSelected(null);setAck(false);setPage(p=>p-1);}}>上一页</button><button disabled={freeze||page*20>=load.data.total} onClick={()=>{setSelected(null);setAck(false);setPage(p=>p+1);}}>下一页</button></div>
 {selected&&<AdminForm onSubmit={event=>{event.preventDefault();if(!ack)return;void action.run(async()=>{await call('td2.heightReview.dismiss',{schemaVersion:TALENT_VERSION,expectedRevision:selected.revision,expectedPersonRevision:load.data!.personRevision,sourceRevision:load.data!.sourceRevision,resolution:'DO_NOT_USE_LEGACY_HEIGHT',acknowledge:ack},{id:selected.id});onSaved();});}}><fieldset disabled={freeze}><p>这会记录本次人工决定并完成复核。历史身高仍保留，系统不会据此生成新的量尺。</p><label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>我确认这项旧记录不作为已确认身高使用</label></fieldset><button type="submit" className="primary" disabled={action.busy||!ack}>{outcomeUnknown(action.error)?'原样重试':'确认不采用旧身高'}</button></AdminForm>}
 {outcomeUnknown(action.error)&&<p className="notice">结果未知，请原样重试同一笔决定。</p>}
 </>}</div><footer className="modal-footer"><button disabled={freeze} onClick={close}>返回专业工作台</button></footer></Modal>;
}
