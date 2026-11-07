import {useId} from 'react';
import {answerKey,type FieldComponent,type SupplierField,type SupplierCatalogView,type ProfessionalAnswer,type ProfessionalDraft,type ProfessionalRecord,type ValueState} from '../../../packages/core/src/supplier-field-contract.ts';
export const stateLabel:Record<ValueState,string>={KNOWN:'已填写',DECLARED_NONE:'明确没有',UNKNOWN:'暂不确定',NOT_PROVIDED:'未提供'};
const states=(type:string)=>['NOT_PROVIDED','KNOWN','UNKNOWN',...(['CODE_SET','RECORDS'].includes(type)?['DECLARED_NONE']:[])] as ValueState[];
export function answerText(answer:ProfessionalAnswer,field:SupplierField):string{
 if(answer.state!=='KNOWN')return stateLabel[answer.state];
 const scalar=(value:unknown,f:FieldComponent)=>f.type==='CODE'||f.type==='CODE_SET'?(Array.isArray(value)?value:[value]).map(v=>f.options?.find(o=>o.code===v)?.label??String(v)).join('、'):f.type==='BOOLEAN'?(value?'是':'否'):String(value)+(f.unit?' '+f.unit:'');
 if(field.type==='RECORDS')return (answer.value as ProfessionalRecord[]).map(r=>field.components!.filter(c=>Object.hasOwn(r.values,c.code)).map(c=>c.label+'：'+scalar(r.values[c.code],c)).join('；')).join('\n');
 return scalar(answer.value,field as FieldComponent);
}
export function ProfessionalAnswerInput({field,answer,onChange,disabled=false}:{field:SupplierField;answer:ProfessionalAnswer;onChange:(a:ProfessionalAnswer)=>void;disabled?:boolean}){
 const id=useId();const state=answer.state;
 const setValue=(value:unknown)=>onChange({...answer,state:'KNOWN',value});
 return <fieldset disabled={disabled} className="supplier-professional-field"><legend>{field.label}{field.unit?'（'+field.unit+'）':''}</legend>
  <p className="muted">{field.description}</p>
  <label htmlFor={id}>填写状态</label><select id={id} value={state} onChange={e=>{const next=e.target.value as ValueState;onChange(next==='KNOWN'?{...answer,state:next,value:field.type==='RECORDS'||field.type==='CODE_SET'?[]:field.type==='BOOLEAN'||field.type==='NUMBER'?undefined:''}:{fieldCode:answer.fieldCode,roleCode:answer.roleCode,state:next});}}>{states(field.type).map(s=><option key={s} value={s}>{stateLabel[s]}</option>)}</select>
  {state==='KNOWN'&&(field.type==='RECORDS'?<div className="supplier-professional-records">
   {((answer.value??[]) as ProfessionalRecord[]).map((row,index)=><fieldset key={row.id} className="supplier-professional-record"><legend>{field.label} {index+1}</legend>
    {field.components!.map(component=><ScalarInput key={component.code} field={component} value={row.values[component.code]} onChange={value=>{const rows=(answer.value as ProfessionalRecord[]).map(r=>r.id===row.id?{...r,values:Object.fromEntries(Object.entries({...r.values,[component.code]:value}).filter(([,v])=>v!==undefined))}:r);setValue(rows);}}/>)}
    <button type="button" onClick={()=>{const rows=(answer.value as ProfessionalRecord[]).filter(r=>r.id!==row.id);onChange(rows.length?{...answer,value:rows}:{fieldCode:answer.fieldCode,roleCode:answer.roleCode,state:'NOT_PROVIDED'});}}>移除此条</button></fieldset>)}
   <button type="button" disabled={((answer.value??[]) as unknown[]).length>=(field.maxItems??30)} onClick={()=>setValue([...((answer.value??[]) as unknown[]),{id:crypto.randomUUID(),values:{}}])}>＋ 添加{field.label}</button>
   {!(answer.value as unknown[]|undefined)?.length&&<p>请添加记录；没有记录时可选择“未提供”或“明确没有”。</p>}
  </div>:<ScalarInput field={field as FieldComponent} value={answer.value} onChange={value=>{if(value===undefined||Array.isArray(value)&&!value.length)onChange({fieldCode:answer.fieldCode,roleCode:answer.roleCode,state:'NOT_PROVIDED'});else setValue(value);}}/>)}
 </fieldset>;
}
function ScalarInput({field,value,onChange}:{field:FieldComponent;value:unknown;onChange:(value:unknown)=>void}){
 const id=useId();const options=field.options?.filter(o=>o.status==='ACTIVE'||(Array.isArray(value)?value.includes(o.code):value===o.code));
 return <div className="supplier-professional-cell"><label htmlFor={id}>{field.label}{field.required?' *':''}{field.unit?'（'+field.unit+'）':''}</label>
  {field.type==='CODE_SET'?<div id={id} className="supplier-options" role="group" aria-label={field.label}>{options?.map(o=><label key={o.code}><input type="checkbox" checked={Array.isArray(value)&&value.includes(o.code)} onChange={e=>onChange(e.target.checked?[...(Array.isArray(value)?value:[]),o.code]:(Array.isArray(value)?value:[]).filter(c=>c!==o.code))}/>{o.label}{o.status==='DEPRECATED'?'（历史选项）':''}</label>)}</div>:
   field.type==='CODE'?<select id={id} value={String(value??'')} onChange={e=>onChange(e.target.value||undefined)}><option value="">请选择</option>{options?.map(o=><option key={o.code} value={o.code}>{o.label}{o.status==='DEPRECATED'?'（历史选项）':''}</option>)}</select>:
   field.type==='BOOLEAN'?<select id={id} value={value===undefined?'':String(value)} onChange={e=>onChange(e.target.value===''?undefined:e.target.value==='true')}><option value="">请选择</option><option value="true">是</option><option value="false">否</option></select>:
   field.type==='TEXT'&&(field.maxLength??500)>250?<textarea id={id} value={String(value??'')} maxLength={field.maxLength??500} onChange={e=>onChange(e.target.value||undefined)}/>:
   <input id={id} type={field.type==='DATE'?'date':field.type==='NUMBER'?'number':'text'} value={typeof value==='number'||typeof value==='string'?value:''} min={field.min} max={field.max} maxLength={field.maxLength??500} step={field.type==='NUMBER'?'any':undefined} onChange={e=>onChange(e.target.value===''?undefined:field.type==='NUMBER'?Number(e.target.value):e.target.value)}/>}
 </div>;
}
export function SupplierProfessionalForm({catalog,roles,roleOptions,value,onChange,disabled=false,internal=false}:{catalog:SupplierCatalogView;roles:string[];roleOptions:Array<{code:string;label:string}>;value?:ProfessionalDraft;onChange:(value:ProfessionalDraft)=>void;disabled?:boolean;internal?:boolean}){
 const definition=catalog.definition,answers=value?.answers??[];
 const bindings:Array<{field:SupplierField;roleCode:string|null}>=[];
 for(const template of definition.templates.filter(t=>t.roleCode===null||roles.includes(t.roleCode)))for(const code of template.fieldCodes){const field=definition.fields.find(f=>f.code===code);if(field&&(internal||field.visibility==='SELF_SHARED'))bindings.push({field,roleCode:template.roleCode});}
 // Keep an existing answer visible even after a field is removed from a new template.
 for(const a of answers)if(!bindings.some(b=>b.field.code===a.fieldCode&&b.roleCode===a.roleCode)){const field=definition.fields.find(f=>f.code===a.fieldCode);if(field&&(internal||field.visibility==='SELF_SHARED')&&(!a.roleCode||roles.includes(a.roleCode)))bindings.push({field,roleCode:a.roleCode});}
 const update=(answer:ProfessionalAnswer)=>onChange({catalogVersion:catalog.version,catalogDigest:catalog.digest,answers:[...answers.filter(a=>answerKey(a)!==answerKey(answer)),answer]});
 return <section className="supplier-professional" aria-label="专业资料"><h2>专业资料</h2><p>按职业补充，可多选。暂时没有的信息可留空；确认后仍可调整。</p>
  {[null,...roles].map(role=>{const fields=bindings.filter(b=>b.roleCode===role);return fields.length?<details key={role??'common'} className="supplier-professional-section"><summary>{role?roleOptions.find(o=>o.code===role)?.label??role:'通用经历'}<span className="muted"> · {fields.filter(b=>answers.some(a=>answerKey(a)===answerKey({fieldCode:b.field.code,roleCode:role})&&a.state!=='NOT_PROVIDED')).length}/{fields.length} 项</span></summary>
   {fields.map(({field})=><ProfessionalAnswerInput key={field.code} disabled={disabled} field={field} answer={answers.find(a=>a.fieldCode===field.code&&a.roleCode===role)??{fieldCode:field.code,roleCode:role,state:'NOT_PROVIDED'}} onChange={update}/>)}</details>:null;})}
 </section>;
}
