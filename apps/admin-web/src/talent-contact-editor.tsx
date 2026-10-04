import {useEffect,useState} from 'react';
import {call,read} from './api.ts';
import type {Contact,Me,Source} from './dto.ts';
import type {TalentDetail} from './talent-dto.ts';
import {ErrorBox,Field,useAction,useLoad} from './ui.tsx';
import {EditorFrame} from './ux-controls.tsx';
import {outcomeUnknown,TalentSourceChoice} from './talent-edit.tsx';
import {useUnsaved} from './unsaved.ts';
type EditableContact=Pick<Contact,'kind'|'value'|'sourceId'>;
export function TalentContactEditor({detail,me,onClose,onSaved}:{detail:TalentDetail;me:Me;onClose:()=>void;onSaved:()=>void}){
 const load=useLoad(()=>read<{contacts:Contact[]}>('contact.get',{id:detail.id}),detail.id),[rows,setRows]=useState<EditableContact[]>([]),[dirty,setDirty]=useState(false),[source,setSource]=useState<Source|null>(null),a=useAction();
 useEffect(()=>{if(load.data)setRows(load.data.contacts.map(({kind,value,sourceId})=>({kind,value,sourceId})));},[load.data]);useUnsaved(dirty,'联系方式');
 const frozen=a.busy||outcomeUnknown(a.error),canWrite=me.permissions.includes('sensitive.write')&&detail.canEdit;
 const close=()=>{if(frozen)return;if(dirty&&!window.confirm('联系方式尚未保存，放弃修改？'))return;onClose();};
 return <EditorFrame title="受限联系方式" onClose={close}><form onSubmit={e=>{e.preventDefault();void a.run(async()=>{await call('contact.replace',{expectedRevision:detail.revision,contacts:rows},{id:detail.id});onSaved();});}}><div className="modal-body"><p>仅有受限资料权限的成员可以读取；本次读取会记录审计。</p><ErrorBox error={load.error??a.error}/><fieldset disabled={frozen||!canWrite||load.busy||!!load.error}>{rows.map((row,index)=><div className="contact-row" key={index}><Field label="联系类型"><select value={row.kind} onChange={e=>{setRows(old=>old.map((r,i)=>i===index?{...r,kind:e.target.value as Contact['kind']}:r));setDirty(true);}}><option value="PHONE">电话</option><option value="WECHAT">微信</option><option value="EMAIL">邮箱</option><option value="OTHER">其他</option></select></Field><Field label="联系方式"><input required autoComplete="off" maxLength={200} value={row.value} onChange={e=>{setRows(old=>old.map((r,i)=>i===index?{...r,value:e.target.value}:r));setDirty(true);}}/></Field><button type="button" onClick={()=>{setRows(old=>old.filter((_,i)=>i!==index));setDirty(true);}}>移除联系方式</button></div>)}{canWrite&&rows.length<10&&<><TalentSourceChoice value={source} onChange={setSource}/><button type="button" disabled={!source} onClick={()=>{if(source){setRows(old=>[...old,{kind:'EMAIL',value:'',sourceId:source.id}]);setDirty(true);}}}>添加联系方式</button></>}</fieldset></div><footer className="modal-footer"><button type="button" disabled={frozen} onClick={close}>返回</button>{canWrite&&<button type="submit" className="primary" disabled={a.busy||!dirty||!!load.error}>{outcomeUnknown(a.error)?'原样重试保存':'保存联系方式'}</button>}</footer></form></EditorFrame>;
}
