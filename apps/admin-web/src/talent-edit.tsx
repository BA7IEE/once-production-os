import {AdminForm} from './foundation/patterns.tsx';
import {useEffect,useRef,useState} from 'react';
import {EditorFrame,MultiChoice} from './ux-controls.tsx';
import {CommandRecovery} from './command-recovery.tsx';
import {useUnsaved} from './unsaved.ts';
import {ApiError,call,read} from './api.ts';
import type {Inputs} from './generated/requests.ts';
import type {CatalogItem,Page,Source} from './dto.ts';
import {ErrorBox,Field,Modal,Pager,Submit,useAction,useLoad} from './ui.tsx';
import {TALENT_VERSION,type TalentDetail,type TalentFact,type TalentFactKind,type TalentSchema} from './talent-dto.ts';
import {TALENT_SECTIONS,TALENT_LABELS,type TalentField} from './talent-fields.ts';
export const outcomeUnknown=(error:unknown)=>error instanceof ApiError&&error.unknownOutcome;
export function TalentSourceChoice({value,onChange,disabled=false,internalAuthoringOnly=false,required=true}:{value:Source|null;onChange:(value:Source)=>void;disabled?:boolean;internalAuthoringOnly?:boolean;required?:boolean}) {
 const [page,setPage]=useState(1),load=useLoad(()=>read<Page<Source>>('source.list',{}, {page:String(page),pageSize:'10'}),page);
 return <fieldset disabled={disabled||load.busy} className="talent-source"><legend>本次资料依据</legend><ErrorBox error={load.error}/>{value&&<p>已选：<strong>{value.title}</strong> · 截止 {new Date(value.validUntil).toLocaleDateString('zh-CN')}</p>}
 <Field label="资料来源"><select value={value?.id??''} onChange={e=>{const chosen=load.data?.items.find(s=>s.id===e.target.value);if(chosen)onChange(chosen);}} required={required}><option value="">选择有效来源</option>{value&&!load.data?.items.some(s=>s.id===value.id)&&<option value={value.id}>{value.title}</option>}{load.data?.items.filter(s=>s.current&&(!internalAuthoringOnly||s.allowsInternalAuthoring)).map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></Field>
 {internalAuthoringOnly&&<p className="muted">请选择本次新资料的独立内部来源；本人投稿的原依据不能承接新增内容。没有合适来源时，可先到来源管理登记。</p>}
 {value&&<details><summary>查看依据说明</summary><p className="pre-line">{value.basisDescription}</p></details>}{load.busy&&<p>正在读取来源…</p>}{load.data&&<Pager page={page} pageSize={10} total={load.data.total} setPage={setPage}/>}</fieldset>;
}
type RelationKind='asset'|'organization'|'person';
export function TalentRelationChoice({kind,value,onChange}:{kind:RelationKind;value:string;onChange:(id:string,label:string)=>void}) {
 const [page,setPage]=useState(1),[query,setQuery]=useState(''),[filter,setFilter]=useState('');
 const op=kind==='asset'?'asset.list':kind==='organization'?'td2.organization.list':'person.list';
 const load=useLoad(()=>read<Page<{id:string;fileName?:string;name?:string;displayName?:string;state?:string;status?:string}>>(op,{}, {page:String(page),pageSize:'10',...(kind==='person'&&filter?{q:filter}:{})}),kind+':'+page+':'+filter);
 return <div className="talent-related"><ErrorBox error={load.error}/>{kind==='person'&&<div className="filters"><input aria-label="查找个人代表" value={query} onChange={e=>setQuery(e.target.value)}/><button type="button" onClick={()=>{setFilter(query);setPage(1);}}>查找</button></div>}{load.busy?<p>正在读取可选记录…</p>:<div className="wp-options">{load.data?.items.filter(r=>kind!=='asset'||r.state==='READY').filter(r=>kind!=='organization'||r.status==='ACTIVE').map(r=><button type="button" key={r.id} aria-pressed={r.id===value} onClick={()=>onChange(r.id,r.fileName??r.name??r.displayName??'已有记录')}>{r.fileName??r.name??r.displayName}</button>)}</div>}{load.data&&<Pager page={page} pageSize={10} total={load.data.total} setPage={setPage}/>}</div>;
}
function initialValue(field:TalentField,value:unknown):string {
 if(field.kind==='multi-choice')return JSON.stringify(Array.isArray(value)?value:[]);
 if(value===null||value===undefined)return '';
 if(field.kind==='datetime-local'){const time=new Date(String(value));return new Date(time.getTime()-time.getTimezoneOffset()*60000).toISOString().slice(0,16);}
 return String(value);
}
export function TalentValueInput({field,value,onChange,detail,catalog,schema}:{field:TalentField;value:string;onChange:(value:string)=>void;detail:TalentDetail;catalog:CatalogItem[];schema:TalentSchema}) {
 const [choosing,setChoosing]=useState(false),[chosenLabel,setChosenLabel]=useState('');
 let options:Array<{value:string;label:string}>=[];
 if(field.options)options=field.options.map(v=>({value:v,label:TALENT_LABELS[v]??v}));
 if(['role','language','city'].includes(field.kind))options=catalog.filter(c=>c.namespace===field.kind&&c.status==='ACTIVE').map(c=>({value:c.code,label:c.labelZh}));
 if(field.kind==='capability')options=schema.capabilities.map(c=>({value:c.code,label:c.labelZh}));
 if(field.kind==='personRole'||field.kind==='translatorRole')options=detail.facts.personRoles.filter(r=>r.usable&&(field.kind!=='translatorRole'||r.roleCode==='translator')).map(r=>({value:r.id,label:catalog.find(c=>c.namespace==='role'&&c.code===r.roleCode)?.labelZh??String(r.roleCode)}));
 if(field.kind==='collection')options=detail.facts.mediaCollections.filter(r=>r.usable).map(r=>({value:r.id,label:String(r.title)}));
 if(field.kind==='measurement')options=detail.facts.measurementSets.filter(r=>['CONFIRMED','SUPERSEDED'].includes(String(r.status))).map(r=>({value:r.id,label:String(r.measuredOn)+' · '+(TALENT_LABELS[String(r.status)]??'')}));
 const selection=['choice','role','language','city','capability','personRole','translatorRole','collection','measurement'].includes(field.kind);
 if(field.kind==='multi-choice'){const selected: string[]=value?JSON.parse(value):[];return <MultiChoice title={field.label} value={selected} onChange={v=>onChange(JSON.stringify(v))} options={catalog.filter(c=>c.namespace===field.namespace&&(c.status==='ACTIVE'||selected.includes(c.code))).map(c=>[c.code,c.labelZh])}/>;}
 if(['asset','organization','person'].includes(field.kind))return <fieldset><legend>{field.label}{field.required?' *':''}</legend><p>{value?chosenLabel||'已关联记录':'尚未选择'}</p><button type="button" onClick={()=>setChoosing(v=>!v)}>{choosing?'收起选项':'选择'+field.label}</button>{value&&!field.required&&<button type="button" onClick={()=>{onChange('');setChosenLabel('');}}>清除选择</button>}{choosing&&<TalentRelationChoice kind={field.kind as RelationKind} value={value} onChange={(id,label)=>{onChange(id);setChosenLabel(label);setChoosing(false);}}/>}</fieldset>;
 return <Field label={field.label+(field.required?' *':'')}>{selection?<select required={field.required} value={value} onChange={e=>onChange(e.target.value)}><option value="">{field.required?'请选择':'未确认 / 不填写'}</option>{value&&!options.some(o=>o.value===value)&&<option value={value}>原记录（当前不可新选）</option>}{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:field.kind==='textarea'?<textarea value={value} maxLength={5000} onChange={e=>onChange(e.target.value)}/>:<input type={field.kind} required={field.required} value={value} step={field.kind==='number'?'0.1':undefined} min={field.kind==='number'?(field.key==='heightCm'?40:10):undefined} max={field.kind==='number'?(field.key==='heightCm'?260:300):undefined} onChange={e=>onChange(e.target.value)} maxLength={field.kind==='text'?1000:undefined}/>}</Field>;
}
export function talentInputValue(field:TalentField,value:string):unknown {
 if(field.kind==='multi-choice')return value?JSON.parse(value):[];
 if(!value)return field.kind==='text'||field.kind==='textarea'?value:null;
 if(field.kind==='number')return Number(value);
 if(field.kind==='datetime-local')return new Date(value).toISOString();
 return value;
}
export function TalentFactEditor({kind,row,detail,catalog,schema,onClose,onSaved,inline=false}:{kind:TalentFactKind;row?:TalentFact;detail:TalentDetail;catalog:CatalogItem[];schema:TalentSchema;onClose:()=>void;onSaved:()=>void;inline?:boolean}) {
 const section=TALENT_SECTIONS[kind],fields=section.fields.filter(f=>!f.proposalOnly&&(!row||!f.immutable));
 const [values,setValues]=useState<Record<string,string>>(()=>Object.fromEntries(fields.map(f=>[f.key,initialValue(f,row?.[f.key])]))),[changed,setChanged]=useState<string[]>([]),[source,setSource]=useState<Source|null>(null);
 const originalSource=useLoad(()=>row?read<Source>('source.get',{id:row.sourceId}):Promise.resolve(null),row?.sourceId??'new');
 useEffect(()=>{if(row&&originalSource.data?.current&&!source)setSource(originalSource.data);},[originalSource.data]);
 const action=useAction(),freeze=action.busy||outcomeUnknown(action.error);
 const markSaved=useUnsaved(changed.length>0,section.title),form=useRef<HTMLFormElement>(null),snapshot=useRef<{operation:keyof Pick<Inputs,`td2.fact.${TalentFactKind}.create`|`td2.fact.${TalentFactKind}.patch`>;input:Inputs[`td2.fact.${TalentFactKind}.create`]|Inputs[`td2.fact.${TalentFactKind}.patch`];id:string}|null>(null);
 const close=()=>{if(freeze)return;if(changed.length&&!window.confirm('尚有未保存的修改，确定关闭？'))return;markSaved();onClose();};
 const Frame=inline?EditorFrame:Modal;return <Frame title={(row?'编辑':'新增')+section.title} onClose={close}><AdminForm ref={form} onChange={()=>{if(!freeze)snapshot.current=null;}} onSubmit={e=>{e.preventDefault();if(!source)return;void action.run(async()=>{
  if(!snapshot.current){
  const selected=row?fields.filter(f=>changed.includes(f.key)):fields.filter(f=>values[f.key]!==''||f.required||f.key==='namespaceCode');
  const input={schemaVersion:TALENT_VERSION,expectedPersonRevision:detail.revision,sourceId:source.id,sourceRevision:source.revision,values:Object.fromEntries(selected.map(f=>[f.key,talentInputValue(f,values[f.key]??'')])),...(row?{expectedRevision:row.revision}:{})};
  const op=`td2.fact.${kind}.${row?'patch':'create'}` as keyof Pick<Inputs,`td2.fact.${TalentFactKind}.create`|`td2.fact.${TalentFactKind}.patch`>;
  snapshot.current={operation:op,input,id:row?.id??detail.id};}
  await call(snapshot.current.operation,snapshot.current.input,{id:snapshot.current.id});markSaved();onSaved();
 });}}><div className="modal-body"><ErrorBox error={action.error??originalSource.error}/>{section.hint&&<p className="notice">{section.hint}</p>}{row&&<p>原来源：{originalSource.data?.title??'正在核对'}。其他来源的新信息，请提交字段建议。</p>}{row&&source&&source.id!==row.sourceId&&<p className="notice">所选来源与原记录不同。请返回工作台提交修改建议，由有权成员核对后采用。</p>}<TalentSourceChoice value={source} disabled={freeze} onChange={s=>{setSource(s);setChanged(c=>c.includes('_source')?c:[...c,'_source']);}}/>
 <fieldset disabled={freeze}><div className="form-grid">{fields.map(f=>row?.unavailableFields.includes(f.key)?<p key={f.key}>{f.label}：当前不可读</p>:<TalentValueInput key={f.key} field={f} value={values[f.key]??''} detail={detail} catalog={catalog} schema={schema} onChange={value=>{if(!freeze)snapshot.current=null;setValues(v=>({...v,[f.key]:value}));setChanged(c=>c.includes(f.key)?c:[...c,f.key]);}}/>)}</div></fieldset>
 {outcomeUnknown(action.error)&&snapshot.current&&<CommandRecovery operation={snapshot.current.operation} params={{id:snapshot.current.id}} busy={action.busy} onRetry={()=>form.current?.requestSubmit()}/>}</div><footer className="modal-footer"><button type="button" disabled={freeze} onClick={close}>取消</button><button className="primary" type="submit" disabled={action.busy||!source||(!!row&&source.id!==row.sourceId)||(!!row&&!changed.some(c=>c!=='_source'))}>{action.busy?'正在保存…':outcomeUnknown(action.error)?'原样重试':'保存'+section.title}</button></footer></AdminForm></Frame>;
}
