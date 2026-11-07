import {useEffect,useState} from 'react';
import {call} from './api.ts';
import {ErrorBox,Field,useAction} from './ui.tsx';
import type {Me,Source,CatalogItem} from './dto.ts';
import type {TalentDetail} from './talent-dto.ts';
import {TalentSourceChoice,outcomeUnknown} from './talent-edit.tsx';
import {answerText,ProfessionalAnswerInput} from './supplier-professional-fields.tsx';
import type {SupplierCatalogView,SupplierField,ProfessionalAnswer} from '../../../packages/core/src/supplier-field-contract.ts';
type Entry={id:string;revision:number;sourceId:string;sourceRevision:number;sourceTitle:string;field:SupplierField;answer:ProfessionalAnswer};
type Response={personId:string;revision:number;catalog:SupplierCatalogView;entries:Entry[]};
export function SupplierProfessionalPanel({detail,me,catalog,onSaved}:{detail:TalentDetail;me:Me;catalog:CatalogItem[];onSaved:()=>void}){
 const [data,setData]=useState<Response|null>(null),[error,setError]=useState<unknown>(null),[edit,setEdit]=useState<{entry:Entry|null;answer:ProfessionalAnswer}|null>(null),[source,setSource]=useState<Source|null>(null),[version,setVersion]=useState(0);
 const action=useAction(),freeze=action.busy||outcomeUnknown(action.error),roles=detail.facts.personRoles.filter(r=>r.usable).map(r=>String(r.roleCode));
 useEffect(()=>{let live=true;void call<'supplier.professional.get',Response>('supplier.professional.get',undefined,{id:detail.id}).then(d=>{if(live){setData(d);setError(null);}}).catch(e=>{if(live)setError(e);});return()=>{live=false;};},[detail.id,detail.revision,version]);
 const fields=data?.catalog.definition.fields??[],field=edit?fields.find(f=>f.code===edit.answer.fieldCode)??edit.entry?.field:null;
 return <section className="panel padded"><div className="section-heading"><div><h2>职业标签与专业经历</h2><p className="muted">按人物和职业分别整理。每条资料保留来源；资格及经历的声明不等于已经核验。</p></div>{data&&me.permissions.includes('records.write')&&<button disabled={freeze} onClick={()=>{const f=fields.find(f=>f.owner==='PERSON');if(f){setEdit({entry:null,answer:{fieldCode:f.code,roleCode:null,state:'NOT_PROVIDED'}});setSource(null);}}}>补充专业资料</button>}</div>
  <ErrorBox error={error}/><ErrorBox error={action.error}/>{!data?<p>正在读取…</p>:!data.entries.length?<p className="muted">尚无当前可见的专业补充资料。</p>:data.entries.map(e=><article key={e.id} className="supplier-professional-record"><div className="section-heading"><strong>{e.field.label}{e.answer.roleCode?' · '+(catalog.find(c=>c.namespace==='role'&&c.code===e.answer.roleCode)?.labelZh??e.answer.roleCode):''}</strong>{e.field.visibility==='INTERNAL'&&<span className="tag">仅内部</span>}</div><p style={{whiteSpace:'pre-wrap'}}>{answerText(e.answer,e.field)}</p><p className="muted">来源：{e.sourceTitle}</p>{me.permissions.includes('records.write')&&<button disabled={freeze} onClick={()=>{setEdit({entry:e,answer:structuredClone(e.answer)});setSource(null);}}>整理此条</button>}</article>)}
  {edit&&data&&field&&<section className="supplier-professional-record"><h3>{edit.entry?'整理已有资料':'补充专业资料'}</h3><fieldset disabled={freeze} style={{border:0,padding:0,minWidth:0}}>
   {!edit.entry&&<Field label="选择字段"><select value={edit.answer.fieldCode} onChange={e=>{const f=fields.find(f=>f.code===e.target.value)!;setEdit({entry:null,answer:{fieldCode:f.code,roleCode:f.owner==='PERSON'?null:roles.find(r=>!f.roles.length||f.roles.includes(r))??null,state:'NOT_PROVIDED'}});}}>{fields.filter(f=>f.owner==='PERSON'||roles.some(r=>!f.roles.length||f.roles.includes(r))).map(f=><option key={f.code} value={f.code}>{f.label}{f.visibility==='INTERNAL'?'（仅内部）':''}</option>)}</select></Field>}
   {field.owner==='ROLE'&&<Field label="对应职业"><select disabled={!!edit.entry} value={edit.answer.roleCode??''} onChange={e=>setEdit({...edit,answer:{...edit.answer,roleCode:e.target.value||null}})}><option value="">请选择</option>{roles.filter(r=>!field.roles.length||field.roles.includes(r)).map(r=><option key={r} value={r}>{catalog.find(c=>c.namespace==='role'&&c.code===r)?.labelZh??r}</option>)}</select></Field>}
   <ProfessionalAnswerInput field={field} answer={edit.answer} onChange={answer=>setEdit({...edit,answer})}/>
   <TalentSourceChoice value={source} onChange={setSource} disabled={freeze}/>
   <p className="muted">修改已有本人可见资料时，会同步给本人；新补充资料仍按当前可见范围保存。</p>
   </fieldset><div className="button-row"><button disabled={!source||action.busy} onClick={()=>void action.run(async()=>{if(!source)return;await call('supplier.professional.update',{expectedPersonRevision:data.revision,sourceId:source.id,sourceRevision:source.revision,professional:{catalogVersion:data.catalog.version,catalogDigest:data.catalog.digest,answers:[edit.answer]},replace:edit.entry?[{id:edit.entry.id,revision:edit.entry.revision}]:[]},{id:detail.id});setEdit(null);setSource(null);setVersion(v=>v+1);onSaved();})}>{outcomeUnknown(action.error)?'原样重试':'保存整理结果'}</button><button disabled={freeze} onClick={()=>{setEdit(null);setSource(null);}}>取消</button></div>
  </section>}
 </section>;
}
