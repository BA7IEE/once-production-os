import {TalentRegistryCreate} from './talent-registry.tsx';
import {TalentCollectionEditor} from './talent-collection.tsx';
import {TalentFieldEvidence,TalentProposals} from './talent-evidence.tsx';
import {useState} from 'react';
import {call,read} from './api.ts';
import type {CatalogItem,Me,Source} from './dto.ts';
import {ErrorBox,Field,Modal,useAction,useLoad} from './ui.tsx';
import {TALENT_VERSION,type TalentDetail,type TalentFact,type TalentFactKind,type TalentSchema} from './talent-dto.ts';
import {TALENT_LABELS,TALENT_SECTIONS} from './talent-fields.ts';
import {TalentFactEditor,TalentRelationChoice,TalentSourceChoice,outcomeUnknown} from './talent-edit.tsx';
const groups=[['common','基本职业与语言'],['casting','模特与选角'],['translation','翻译服务'],['professional','技能与资质'],['media','媒体集合']] as const;
function textValue(key:string,value:unknown,detail:TalentDetail,catalog:CatalogItem[],schema:TalentSchema):string {
 if(value===null||value===undefined||value==='')return '未确认';
 if(key==='personRoleId'){const row=detail.facts.personRoles.find(r=>r.id===value);return row?textValue('roleCode',row.roleCode,detail,catalog,schema):'关联职业当前不可读';}
 if(key==='collectionId')return String(detail.facts.mediaCollections.find(r=>r.id===value)?.title??'关联集合当前不可读');
 if(key==='supersedesId')return String(detail.facts.measurementSets.find(r=>r.id===value)?.measuredOn??'关联历史量尺');
 if(key.endsWith('Id'))return '已关联';
 const ns=key==='roleCode'?'role':key.includes('LanguageCode')||key==='languageCode'?'language':key==='locationCode'?'city':null;
 if(ns)return catalog.find(c=>c.namespace===ns&&c.code===value)?.labelZh??String(value);
 if(key==='capabilityCode')return schema.capabilities.find(c=>c.code===value)?.labelZh??String(value);
 if(key==='validFrom'||key==='validUntil')return new Date(String(value)).toLocaleString('zh-CN',{hour12:false});
 return TALENT_LABELS[String(value)]??String(value);
}
export function TalentWorkbench({personId,me,catalog,onClose,onChange,backLabel='返回人物资料'}:{personId:string;me:Me;catalog:CatalogItem[];onClose:()=>void;onChange:()=>void;backLabel?:string}) {
 const [identity,setIdentity]=useState(false);
 const [registry,setRegistry]=useState<'capability'|'organization'|null>(null);
 const [tick,setTick]=useState(0),[group,setGroup]=useState<(typeof groups)[number][0]>('common');
 const [edit,setEdit]=useState<{kind:TalentFactKind;row?:TalentFact}|null>(null),[review,setReview]=useState<{kind:TalentFactKind;row:TalentFact;action:string}|null>(null),[enroll,setEnroll]=useState(false);
 const [collection,setCollection]=useState<TalentFact|null>(null),[fieldEvidence,setFieldEvidence]=useState<{kind:TalentFactKind;row:TalentFact;mode:'evidence'|'proposal'}|null>(null),[proposals,setProposals]=useState(false);
 const load=useLoad(()=>Promise.all([read<TalentDetail>('td2.person.get',{id:personId}),read<TalentSchema>('td2.schema')]),personId+':'+tick);
 const saved=()=>{setIdentity(false);setRegistry(null);setEdit(null);setReview(null);setEnroll(false);setCollection(null);setFieldEvidence(null);setProposals(false);setTick(t=>t+1);onChange();};
 const detail=load.data?.[0],schema=load.data?.[1];
 if(detail&&identity)return <TalentIdentityEditor detail={detail} onClose={()=>setIdentity(false)} onSaved={saved}/>;
 if(registry)return <TalentRegistryCreate mode={registry} catalog={catalog} onClose={()=>setRegistry(null)} onSaved={saved}/>;
 if(detail&&collection)return <TalentCollectionEditor detail={detail} row={collection} onClose={()=>setCollection(null)} onSaved={saved}/>;
 if(detail&&schema&&fieldEvidence)return <TalentFieldEvidence {...fieldEvidence} detail={detail} catalog={catalog} schema={schema} onClose={()=>setFieldEvidence(null)} onSaved={saved}/>;
 if(detail&&proposals)return <TalentProposals detail={detail} me={me} onClose={()=>setProposals(false)} onSaved={saved}/>;
 if(detail&&schema&&edit)return <TalentFactEditor {...edit} detail={detail} catalog={catalog} schema={schema} onClose={()=>setEdit(null)} onSaved={saved}/>;
 if(detail&&review)return <TalentReview {...review} detail={detail} onClose={()=>setReview(null)} onSaved={saved}/>;
 if(detail&&enroll)return <TalentEnroll detail={detail} onClose={()=>setEnroll(false)} onSaved={saved}/>;
 const canWrite=!!detail?.canEdit&&detail.status!=='ARCHIVED',canReview=me.permissions.includes('sources.review');
 return <Modal title={detail?detail.displayName+' · 专业工作台':'专业工作台'} wide onClose={onClose}><div className="modal-body talent-workbench"><ErrorBox error={load.error}/>{load.busy?<p>正在读取当前可见的专业资料…</p>:detail&&schema&&<>
 <div className="talent-overview"><div><p className="eyebrow">人才资料</p><h3>{detail.displayName}</h3><p>{detail.intro||'尚未填写简介'}</p></div><div><strong>{detail.isTalent?'已建立专业档案':'普通人物'}</strong><p>成年资格：{TALENT_LABELS[detail.adultState]??'未知'}</p></div></div>
 {!detail.isTalent&&<div className="notice"><p>这份人物资料尚未建立专业档案。建立时会保留已有职业、语言和地点；不会猜测熟练度或量尺含义。</p>{canWrite&&<button className="primary" onClick={()=>setEnroll(true)}>建立专业档案</button>}</div>}
 {!canWrite&&<p className="notice">当前只可浏览专业资料。</p>}
 <div className="detail-actions">{canWrite&&detail.originAvailable&&<button onClick={()=>setIdentity(true)}>编辑人物信息</button>}{canReview&&<button onClick={()=>setProposals(true)}>查看字段建议</button>}{me.permissions.includes('catalog.manage')&&<button onClick={()=>setRegistry('capability')}>登记专业能力</button>}{canWrite&&<button onClick={()=>setRegistry('organization')}>登记机构</button>}</div>
 <nav className="talent-tabs" aria-label="专业资料分类">{groups.map(([key,label])=><button key={key} aria-pressed={group===key} onClick={()=>setGroup(key)}>{label}</button>)}</nav>
 {(Object.keys(TALENT_SECTIONS) as TalentFactKind[]).filter(kind=>TALENT_SECTIONS[kind].group===group).map(kind=>{const section=TALENT_SECTIONS[kind],rows=detail.facts[kind];const singleton=['talentProfiles','castingProfiles'].includes(kind);return <section key={kind} className="panel talent-section" aria-label={section.title}><div className="panel-heading"><div><h3>{section.title}</h3>{section.hint&&<p>{section.hint}</p>}</div>{canWrite&&(detail.isTalent||kind==='personLanguages')&&!(singleton&&rows.length)&&<button onClick={()=>setEdit({kind})}>新增{section.title}</button>}</div>
 {!rows.length?<p className="muted">尚无当前可见的{section.title}记录。</p>:rows.map(row=><article key={row.id} className="talent-fact"><div className="talent-fact-heading"><strong>{TALENT_LABELS[String(row.status??row.state)]??'已记录'}</strong><span className={row.usable?'muted':'notice-inline'}>{row.usable?'当前可使用':'当前不可用于业务筛选'}</span></div><dl className="detail-grid">{section.fields.map(f=><div key={f.key}><dt>{f.label}</dt><dd>{row.unavailableFields.includes(f.key)?'当前不可读':textValue(f.key,row[f.key],detail,catalog,schema)}</dd></div>)}</dl>
 {kind==='personCredentials'&&row.maskedIdentifier!=null&&<p>资质编号：{String(row.maskedIdentifier)}</p>}
 <div className="detail-actions">
 {canWrite&&me.permissions.includes('assets.read')&&kind==='mediaCollections'&&row.usable&&<button onClick={()=>setCollection(row)}>整理集合素材</button>}
 {canReview&&<button onClick={()=>setFieldEvidence({kind,row,mode:'evidence'})}>核验字段依据</button>}
 {(canReview||canWrite)&&section.fields.some(f=>!f.immutable&&!row.unavailableFields.includes(f.key))&&!(kind==='measurementSets'&&row.status!=='DRAFT')&&<button onClick={()=>setFieldEvidence({kind,row,mode:'proposal'})}>提交修改建议</button>}
 {canWrite&&section.fields.some(f=>!f.immutable&&!row.unavailableFields.includes(f.key))&&!(kind==='measurementSets'&&row.status!=='DRAFT')&&<button onClick={()=>setEdit({kind,row})}>编辑{section.title}</button>}
 {canReview&&canWrite&&kind==='measurementSets'&&row.status==='DRAFT'&&<button onClick={()=>setReview({kind,row,action:'confirm'})}>确认量尺</button>}
 {canReview&&canWrite&&kind==='adultEligibilities'&&row.status==='ACTIVE'&&<button onClick={()=>setReview({kind,row,action:'verify'})}>核验成年资格</button>}
 {canReview&&canWrite&&(kind==='personCredentials'||kind==='personExternalRefs')&&<><button onClick={()=>setReview({kind,row,action:'verify'})}>核验{section.title}</button><button onClick={()=>setReview({kind,row,action:'revoke'})}>撤销核验</button></>}
 {canWrite&&kind==='personCredentials'&&me.permissions.includes('sensitive.write')&&<button onClick={()=>setReview({kind,row,action:'identifier'})}>设置受限资质编号</button>}
 </div><TalentFactSource id={row.sourceId} readable={me.permissions.includes('sources.read')}/><small className="muted">更新于 {new Date(row.updatedAt).toLocaleString('zh-CN',{hour12:false})}</small></article>)}
 </section>;})}</> }</div><footer className="modal-footer"><button onClick={onClose}>{backLabel}</button><button disabled={load.busy} onClick={()=>setTick(t=>t+1)}>刷新资料</button></footer></Modal>;
}
function TalentEnroll({detail,onClose,onSaved}:{detail:TalentDetail;onClose:()=>void;onSaved:()=>void}) {
 const load=useLoad(()=>read<Source>('source.get',{id:detail.originSourceId}),detail.id),action=useAction(),[ack,setAck]=useState(false),freeze=action.busy||outcomeUnknown(action.error);
 return <Modal title="建立专业档案" onClose={()=>{if(!freeze)onClose();}}><form onSubmit={e=>{e.preventDefault();if(!load.data||!ack)return;void action.run(async()=>{await call('td2.person.enroll',{schemaVersion:TALENT_VERSION,expectedRevision:detail.revision,sourceRevision:load.data!.revision},{id:detail.id});onSaved();});}}><div className="modal-body"><ErrorBox error={load.error??action.error}/><p>将以原资料来源建立专业档案，已有职业、语言和地点会保留。来源：{load.data?.title??'正在读取…'}</p><label><input type="checkbox" checked={ack} disabled={freeze} onChange={e=>setAck(e.target.checked)}/>我已核对当前人物与来源</label></div><footer className="modal-footer"><button type="button" disabled={freeze} onClick={onClose}>取消</button><button type="submit" className="primary" disabled={action.busy||!load.data?.current||!ack}>{outcomeUnknown(action.error)?'原样重试':'确认建立'}</button></footer></form></Modal>;
}
function TalentReview({kind,row,action:operation,detail,onClose,onSaved}:{kind:TalentFactKind;row:TalentFact;action:string;detail:TalentDetail;onClose:()=>void;onSaved:()=>void}) {
 const load=useLoad(()=>read<Source>('source.get',{id:row.sourceId}),row.sourceId),action=useAction(),[ack,setAck]=useState(false),[assetId,setAssetId]=useState(String(row.evidenceAssetId??'')),[assetLabel,setAssetLabel]=useState('原证明材料'),[until,setUntil]=useState(''),[identifier,setIdentifier]=useState('');
 const freeze=action.busy||outcomeUnknown(action.error),secret=operation==='identifier',adult=kind==='adultEligibilities';
 const title=secret?'设置受限资质编号':operation==='revoke'?'撤销核验':kind==='measurementSets'?'确认量尺':'核验'+TALENT_SECTIONS[kind].title;
 return <Modal title={title} onClose={()=>{if(!freeze)onClose();}}><form onSubmit={e=>{e.preventDefault();if(!load.data||!ack)return;void action.run(async()=>{
  const base={schemaVersion:TALENT_VERSION,expectedRevision:row.revision,expectedPersonRevision:detail.revision,sourceRevision:load.data!.revision};
  if(secret)await call('td2.credential.secret',{schemaVersion:TALENT_VERSION,expectedRevision:row.revision,expectedPersonRevision:detail.revision,identifier},{id:row.id});
  else if(adult)await call('td2.adult.verify',{...base,evidenceAssetId:assetId,validUntil:new Date(until).toISOString()},{id:row.id});
  else if(kind==='measurementSets')await call('td2.measurement.confirm',base,{id:row.id});
  else if(kind==='personCredentials')await call(operation==='revoke'?'td2.credential.revoke':'td2.credential.verify',base,{id:row.id});
  else await call(operation==='revoke'?'td2.external.revoke':'td2.external.verify',base,{id:row.id});
  onSaved();
 });}}><div className="modal-body"><ErrorBox error={action.error??load.error}/><p>依据来源：{load.data?.title??'正在读取…'}</p><fieldset disabled={freeze}>{secret?<Field label="完整资质编号 *"><input type="password" autoComplete="off" value={identifier} required maxLength={180} onChange={e=>setIdentifier(e.target.value)}/></Field>:adult?<><p className="notice">请核对真实有效的成年证明。图片外貌或本人声明不能代替核验。</p><p>证明材料：{assetId?assetLabel:'请选择'}</p><TalentRelationChoice kind="asset" value={assetId} onChange={(id,label)=>{setAssetId(id);setAssetLabel(label);}}/><Field label="核验有效期截止 *"><input type="datetime-local" value={until} required onChange={e=>setUntil(e.target.value)}/></Field></>:<p>请先核对资料及证明。确认量尺会保留旧版本，撤销核验会影响后续使用。</p>}<label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>我已核对并确认本次操作</label></fieldset>{outcomeUnknown(action.error)&&<p className="notice">结果未知，请原样重试核对同一笔操作。</p>}</div><footer className="modal-footer"><button type="button" disabled={freeze} onClick={onClose}>取消</button><button type="submit" className="primary" disabled={action.busy||!load.data?.current||!ack||(adult&&!assetId)}>{outcomeUnknown(action.error)?'原样重试':title}</button></footer></form></Modal>;
}

export function TalentPersonCreate({onClose,onSaved}:{onClose:()=>void;onSaved:(id:string)=>void}) {
 const [name,setName]=useState(''),[aliases,setAliases]=useState(''),[intro,setIntro]=useState(''),[talent,setTalent]=useState(false),[source,setSource]=useState<Source|null>(null),action=useAction(),freeze=action.busy||outcomeUnknown(action.error);
 const close=()=>{if(freeze)return;if((name||aliases||intro||source)&&!window.confirm('人物资料尚未保存，确定关闭？'))return;onClose();};
 return <Modal title="新建人物" onClose={close}><form onSubmit={e=>{e.preventDefault();if(!source)return;void action.run(async()=>{const receipt=await call<'td2.person.create',import('./dto.ts').Receipt>('td2.person.create',{schemaVersion:TALENT_VERSION,originSourceId:source.id,sourceRevision:source.revision,displayName:name,aliases:aliases.split('\n').map(s=>s.trim()).filter(Boolean),intro,createTalent:talent});onSaved(receipt.resourceId);});}}><div className="modal-body"><ErrorBox error={action.error}/><p>人物身份可以独立于职业存在。需要维护模特、翻译或制作技能时，再建立专业档案并逐项添加职业。</p><fieldset disabled={freeze}><Field label="姓名或艺名 *"><input value={name} onChange={e=>setName(e.target.value)} required maxLength={120}/></Field><Field label="其他姓名（每行一个）"><textarea value={aliases} onChange={e=>setAliases(e.target.value)}/></Field><Field label="人物简介"><textarea value={intro} onChange={e=>setIntro(e.target.value)} maxLength={5000}/></Field><label><input type="checkbox" checked={talent} onChange={e=>setTalent(e.target.checked)}/>同时建立专业档案（稍后逐项填写职业）</label></fieldset><TalentSourceChoice value={source} onChange={setSource} disabled={freeze}/>{outcomeUnknown(action.error)&&<p className="notice">结果未知，请保留资料并原样重试，避免重复建档。</p>}</div><footer className="modal-footer"><button type="button" disabled={freeze} onClick={close}>取消</button><button type="submit" className="primary" disabled={action.busy||!source}>{outcomeUnknown(action.error)?'原样重试':'保存人物'}</button></footer></form></Modal>;
}

function TalentIdentityEditor({detail,onClose,onSaved}:{detail:TalentDetail;onClose:()=>void;onSaved:()=>void}) {
 const [name,setName]=useState(detail.displayName),[aliases,setAliases]=useState(detail.aliases.join('\n')),[intro,setIntro]=useState(detail.intro),[status,setStatus]=useState<'DRAFT'|'ACTIVE'|'ARCHIVED'>(detail.status as 'DRAFT'|'ACTIVE'|'ARCHIVED'),action=useAction(),freeze=action.busy||outcomeUnknown(action.error);
 const dirty=name!==detail.displayName||aliases!==detail.aliases.join('\n')||intro!==detail.intro||status!==detail.status;
 const close=()=>{if(freeze)return;if(dirty&&!window.confirm('人物信息尚未保存，确定关闭？'))return;onClose();};
 return <Modal title="编辑人物信息" onClose={close}><form onSubmit={e=>{e.preventDefault();void action.run(async()=>{await call('td2.person.patch',{schemaVersion:TALENT_VERSION,expectedRevision:detail.revision,...(name!==detail.displayName?{displayName:name}:{}),...(aliases!==detail.aliases.join('\n')?{aliases:aliases.split('\n').map(s=>s.trim()).filter(Boolean)}:{}),...(intro!==detail.intro?{intro}:{}),...(status!==detail.status?{status}:{})},{id:detail.id});onSaved();});}}><div className="modal-body"><ErrorBox error={action.error}/><fieldset disabled={freeze}><Field label="姓名或艺名 *"><input required value={name} maxLength={120} onChange={e=>setName(e.target.value)}/></Field><Field label="其他姓名（每行一个）"><textarea value={aliases} onChange={e=>setAliases(e.target.value)}/></Field><Field label="人物简介"><textarea value={intro} maxLength={5000} onChange={e=>setIntro(e.target.value)}/></Field><Field label="人物状态"><select value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option value="DRAFT">草稿</option><option value="ACTIVE">在库</option><option value="ARCHIVED">归档</option></select></Field></fieldset></div><footer className="modal-footer"><button type="button" disabled={freeze} onClick={close}>取消</button><button type="submit" className="primary" disabled={action.busy||!dirty}>{outcomeUnknown(action.error)?'原样重试':'保存人物信息'}</button></footer></form></Modal>;
}

function TalentFactSource({id,readable}:{id:string;readable:boolean}) {
 const load=useLoad(()=>readable?read<Source>('source.get',{id}):Promise.resolve(null),id+':'+readable);
 return <p className="muted">来源：{!readable?'详情受限':load.busy?'正在核对…':load.data?load.data.title+' · 有效期截止 '+new Date(load.data.validUntil).toLocaleDateString('zh-CN'):'当前不可读取原来源'}</p>;
}
