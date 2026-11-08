import {CAPABILITY_LEVEL_LABELS,TRANSLATION_MODE_LABELS} from '../../../packages/core/src/supplier-native-contract.ts';
import {SupplierNativeFields,type SkillOption} from './supplier-native-fields.tsx';
import {SupplierProfessionalForm,answerText} from './supplier-professional-fields.tsx';
import type {SupplierCatalogView} from '../../../packages/core/src/supplier-field-contract.ts';
import {PortalWorkDraft,PortalWorkGallery,type WorkPlan} from './work-case-ui.tsx';
import {useEffect,useRef,useState} from 'react';
import type {TalentAccountMe} from './dto.ts';
import {PortalCommands,PortalRequestError,type PortalReceipt} from './portal-command.ts';
import {portalMarkers} from './portal-pending-marker.ts';
import {TalentMediaStaging} from './talent-media-staging.tsx';
import {emptySupplierProfile,SUPPLIER_PROFILE_VERSION,SUPPLIER_CONSENT_VERSION,type SupplierProfile} from '../../../packages/core/src/supplier-profile-contract.ts';
import './supplier-profile.css';
import {SupplierDocumentPanel} from './supplier-document-ui.tsx';

type Option={code:string;label:string};
type Schema={fieldCatalog:SupplierCatalogView;roles:Option[];locations:Option[];languages:Option[];skills:SkillOption[]};
type OwnProfile={personId:string;grantId:string;revision:number;profile:SupplierProfile;fieldCatalog:SupplierCatalogView};
type MediaRow={id:string;fileName:string;mime:string;state:string;usageState:string|null;revision:number;assetRevision:number|null;errorCode:string|null};
type Draft={id:string;revision:number;state:string;personId:string|null;grantId:string|null;claimId:string|null;profile:SupplierProfile;fieldCatalog:SupplierCatalogView;items:Array<{kind?:string;work?:WorkPlan}>;media:MediaRow[];consent:{id:string;revision:number;state:string;textVersion:string;validUntil:string}};
type DraftSummary={id:string;revision:number;state:string;updatedAt:string;personId:string|null};
type Claim={id:string;kind:string;relation:string;state:string;reserved:boolean};
const labels:Record<string,string>={DRAFT:'草稿',APPROVED:'已入库',WITHDRAWN:'已撤回',EXPIRED:'已到期'};

export function SupplierProfileHome(props:{me:TalentAccountMe;invitationContext:string|null}){
 return <SupplierProfileSession key={props.me.talentAccountId} {...props}/>;
}
function SupplierProfileSession({me,invitationContext}:{me:TalentAccountMe;invitationContext:string|null}){
 const [schema,setSchema]=useState<Schema|null>(null),[profiles,setProfiles]=useState<Array<{personId:string;grantId:string;relation:string}>>([]);
 const [claims,setClaims]=useState<Claim[]>([]),[list,setList]=useState<DraftSummary[]>([]),[draft,setDraft]=useState<Draft|null>(null),[current,setCurrent]=useState<OwnProfile|null>(null);
 const [form,setForm]=useState(emptySupplierProfile),[aliasesText,setAliasesText]=useState(''),[workDirty,setWorkDirty]=useState(false),[dirty,setDirty]=useState(false),[consent,setConsent]=useState(false),[adult,setAdult]=useState(false);
 const [busy,setBusy]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[invitation,setInvitation]=useState<{purpose:string}|null>(null);
 const [conflict,setConflict]=useState<OwnProfile|null>(null),[ack,setAck]=useState(false);
 const [documentPending,setDocumentPending]=useState(false);
 const refreshVersion=useRef(0);
 const active=useRef(true),selected=useRef<string|null>(new URL(location.href).searchParams.get('draft'));
 const dirtyRef=useRef(dirty);dirtyRef.current=dirty;
 const requestRef=useRef<(path:string,method?:string,body?:unknown,key?:string)=>Promise<any>>(null!);
 async function request<T>(path:string,method='GET',body?:unknown,key?:string):Promise<T>{
  let response:Response;
  try{response=await fetch('/api/v1/portal'+path,{method,credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'X-ONCE-Talent-Account':me.talentAccountId,...(method==='GET'?{}:{'Content-Type':'application/json','X-CSRF-Token':me.csrfToken,'Idempotency-Key':key??''})},...(body===undefined?{}:{body:JSON.stringify(body)})});}
  catch{throw new PortalRequestError('网络中断，请核对原请求后继续。',0,'NETWORK_ERROR',method!=='GET');}
  let data:any;try{data=await response.json();}catch{throw new PortalRequestError('响应无法确认，请核对原请求。',response.status,'RESPONSE_INVALID',method!=='GET');}
  if(!response.ok){if(response.status===401||data?.error?.code==='IDENTITY_CHANGED'){setDraft(null);setCurrent(null);setProfiles([]);setClaims([]);setList([]);setForm(emptySupplierProfile());}
   throw new PortalRequestError(data?.error?.message??'操作未完成',response.status,data?.error?.code??'HTTP_ERROR',response.status>=500||!data?.error?.code);}
  return data as T;
 }
 requestRef.current=request;
 const transport=useRef<PortalCommands|null>(null);
 if(!transport.current)transport.current=new PortalCommands((p,m,b,k)=>requestRef.current(p,m,b,k),()=>{if(active.current)setPending(!!transport.current?.hasPending);},portalMarkers);
 function select(id:string|null){selected.current=id;const url=new URL(location.href);if(id)url.searchParams.set('draft',id);else url.searchParams.delete('draft');history.replaceState(null,'',url.pathname+url.search);}
 async function refresh(replaceForm=false){
  const id=selected.current,version=++refreshVersion.current;
  const [p,c,d,detail]=await Promise.all([request<{items:typeof profiles}>('/profiles'),request<{items:Claim[]}>('/claims'),request<{items:DraftSummary[]}>('/profile-drafts'),id?request<Draft>('/profile-drafts/'+id):Promise.resolve(null)]);
  let latest:OwnProfile|null=null;
  if(!detail&&(replaceForm||!dirtyRef.current)){const own=p.items.find(p=>p.relation==='SELF');if(own)latest=await request<OwnProfile>('/supplier-profiles/'+own.personId);}
  if(!active.current||selected.current!==id||version!==refreshVersion.current)throw new Error('当前账号或草稿已切换，请核对当前页面。');
  setProfiles(p.items);setClaims(c.items);setList(d.items);setDraft(detail);
  const loaded=detail?.profile??latest?.profile;
  if(loaded&&(replaceForm||!dirtyRef.current)){setForm(loaded);setAliasesText(loaded.aliases.join('，'));setDirty(false);}
  if(latest)setCurrent(latest);
 }
 useEffect(()=>{
  active.current=true;
  try{transport.current!.restore(me.talentAccountId);}catch(e){setError(e instanceof Error?e.message:'待确认标记读取失败');}
  void request<Schema>('/profile-schema').then(s=>{if(active.current)setSchema(s);}).catch(e=>{if(active.current)setError(e.message);});
  void refresh(true).catch(e=>{if(active.current)setError(e.message);});
  if(invitationContext)void request<{purpose:string}>('/invitations/'+invitationContext).then(i=>{if(active.current)setInvitation(i);}).catch(()=>{});
  return()=>{active.current=false;};
 },[me.talentAccountId,invitationContext]);
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty||workDirty||pending){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty,workDirty,pending]);
 const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();}catch(e){if(active.current)setError(e instanceof Error?e.message:'操作未完成');}finally{if(active.current)setBusy(false);}};
 async function renderReceipt(receipt:PortalReceipt){
  if(!active.current)throw new Error('账号已切换');
  const id=transport.current!.draftResourceId;if(id)select(id);
  await refresh(true);transport.current!.rendered();setConflict(null);setAck(false);return receipt;
 }
 async function command(path:string,body:unknown,method='POST'){
  try{return await renderReceipt(await transport.current!.submit(me.talentAccountId,path,body,method));}
  catch(e){if(e instanceof PortalRequestError&&e.code==='SUPPLIER_PROFILE_CONFLICT'&&draft?.personId){const latest=await request<OwnProfile>('/supplier-profiles/'+draft.personId);if(active.current)setConflict(latest);}throw e;}
 }
 function change<K extends keyof SupplierProfile>(key:K,value:SupplierProfile[K]){setForm(p=>({...p,[key]:value}));setDirty(true);setMessage('');}
 const own=profiles.find(p=>p.relation==='SELF'),claim=claims.find(c=>c.kind==='ENROLL'&&c.relation==='SELF'&&c.state==='PENDING'&&c.reserved);
 const locked=busy||pending||workDirty||draft!==null&&draft.state!=='DRAFT';
 const maySwitch=()=>!pending&&(!(dirty||workDirty)||window.confirm('有未保存的资料，放弃这些修改并切换？'));
 async function editCurrent(){if(!own||!maySwitch())return;const profile=await request<OwnProfile>('/supplier-profiles/'+own.personId);if(!active.current)return;select(null);setDraft(null);setCurrent(profile);setForm(profile.profile);setAliasesText(profile.profile.aliases.join('，'));setWorkDirty(false);setConsent(false);setDirty(false);setMessage('修改后先保存草稿，再确认入库。');}
 async function save(){
  const profile={...form,aliases:aliasesText.split(/[，,]/).map(v=>v.trim()).filter(Boolean)};
  if(draft){await command('/profile-drafts/'+draft.id,{expectedRevision:draft.revision,profile},'PATCH');}
  else{if(!consent)throw new Error('请先同意资料用于 ONCE 内部供应商库。');await command('/profile-drafts',{schemaVersion:SUPPLIER_PROFILE_VERSION,consentTextVersion:SUPPLIER_CONSENT_VERSION,consentAccepted:true,profile,...(current?.grantId?{grantId:current.grantId}:own?{grantId:own.grantId}:{claimId:claim?.id})});}
  setMessage('草稿已保存，可继续上传材料或确认入库。');
 }
 function toggleRole(code:string,checked:boolean){if(checked){change('roleCodes',[...form.roleCodes,code]);return;}
  const hasDetails=form.professional?.answers.some(a=>a.roleCode===code)||form.capabilityDetails?.some(a=>a.roleCode===code)||form.credentials?.some(a=>a.roleCode===code)||code==='model'&&Object.values(form.measurements).some(v=>v!=null)||code==='translator'&&form.translation;
  if(hasDetails&&!window.confirm('移除此职业会清除本次草稿中对应的专业资料，历史记录仍保留。是否继续？'))return;
  setForm(p=>({...p,roleCodes:p.roleCodes.filter(r=>r!==code),...(p.professional?{professional:{...p.professional,answers:p.professional.answers.filter(a=>a.roleCode!==code)}}:{}),...(p.capabilityDetails?{capabilityDetails:p.capabilityDetails.filter(a=>a.roleCode!==code)}:{}),...(p.credentials?{credentials:p.credentials.filter(a=>a.roleCode!==code)}:{}),...(code==='translator'?{translation:null}:{}),...(code==='model'?{measurements:emptySupplierProfile().measurements}:{})}));setDirty(true);
 }
 const checks=(field:'roleCodes'|'locationCodes'|'languageCodes'|'skillCodes',options:Option[])=>
  <div className="supplier-options">{options.map(o=><label key={o.code}><input type="checkbox" checked={form[field].includes(o.code)} onChange={e=>{if(field==='roleCodes'){toggleRole(o.code,e.target.checked);}else change(field,e.target.checked?[...form[field],o.code]:form[field].filter(v=>v!==o.code));}}/>{o.label}</label>)}</div>;
 return <section className="supplier-home">
  <header><p className="eyebrow">ONCE · 供应商库</p><h2>我的专业资料</h2><p>填写职业、联系方式和作品资料。你确认后直接入库，之后可以随时更新。</p></header>
  {error&&<p className="supplier-error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  {pending&&<div className="panel padded"><p>上次操作的结果需要核对，核对完成后可继续编辑。</p><button disabled={busy} onClick={()=>void run(async()=>{await renderReceipt(await transport.current!.replay(me.talentAccountId));})}>{transport.current!.confirmed?'刷新已保存资料':'核对原请求'}</button></div>}
  {own&&<button disabled={busy||pending} onClick={()=>void run(editCurrent)}>查看并修改已入库资料</button>}
  {!own&&!claim&&<div className="panel padded">{invitation?.purpose==='ENROLL'?<><p>通过本次邀请建立你的 ONCE 档案。</p><label><input type="checkbox" checked={adult} onChange={e=>setAdult(e.target.checked)}/>我是本人，且已满 18 周岁</label><button disabled={!adult||busy||pending} onClick={()=>void run(async()=>{await command('/claims',{contextId:invitationContext,relation:'SELF',applicantKey:'SELF',adultDeclared:true});setMessage('已加入，请完善下方资料。');})}>加入并建立资料</button></>:<p>请使用 ONCE 发给你的加入邀请。已有档案的认领、代理人或监护人申请可在历史申请入口继续处理。</p>}</div>}
  {list.length>0&&<label>打开已保存资料<select disabled={busy||pending} value={draft?.id??''} onChange={e=>{const id=e.target.value;if(id&&maySwitch())void run(async()=>{select(id);setCurrent(null);await refresh(true);});}}><option value="">选择草稿或已入库记录</option>{list.map(d=><option key={d.id} value={d.id}>{labels[d.state]??d.state} · {new Date(d.updatedAt).toLocaleString('zh-CN')}</option>)}</select></label>}
  {(own||claim||draft)&&schema&&<>
   {!draft&&<section className="supplier-ai-entry"><p>可以先不填写资料。保存草稿后上传 PDF 或图片，让 AI 预填，再来核对。</p>   {!draft&&<label className="supplier-consent"><input type="checkbox" checked={consent} disabled={busy||pending} onChange={e=>setConsent(e.target.checked)}/>我同意本次资料、上传材料与作品用于 ONCE 内部供应商库、内部查找及受控内部导出，有效期 365 天，可随时撤回授权。</label>}<button disabled={busy||pending||workDirty||!consent} onClick={()=>void run(async()=>{await save();requestAnimationFrame(()=>document.getElementById('supplier-materials')?.scrollIntoView({block:'start'}));})}>保存草稿，上传资料</button></section>}
   {draft&&<nav className="supplier-section-nav" aria-label="资料填写步骤"><a href="#supplier-materials">上传材料与 AI 整理</a><a href="#supplier-basic">核对基础资料</a><a href="#supplier-professional">补充专业资料</a><a href="#supplier-works">整理作品</a><a href="#supplier-confirm">确认入库</a></nav>}
   <div id="supplier-materials">{draft&&<TalentMediaStaging me={me} submission={draft} command={command} refresh={()=>refresh(false)} disabled={busy||pending||dirty||workDirty}/>}
   {draft&&<SupplierDocumentPanel roles={schema?.roles??[]} onPendingChange={setDocumentPending} key={'document:'+draft.id} draft={draft} request={request} command={command} refreshDraft={()=>refresh(false)} disabled={busy||pending||dirty||workDirty}/>}</div>
   <fieldset id="supplier-basic" disabled={locked} className="supplier-form"><legend>基础资料</legend>
    <label>姓名 / 展示名<input maxLength={120} value={form.displayName} onChange={e=>change('displayName',e.target.value)} placeholder="你希望 ONCE 如何称呼你"/></label>
    <label>别名<input value={aliasesText} onChange={e=>{setAliasesText(e.target.value);change('aliases',e.target.value.split(/[，,]/).map(v=>v.trim()).filter(Boolean));}} placeholder="多个别名用逗号分隔"/></label>
    <label>个人介绍<textarea aria-label="个人介绍" maxLength={5000} rows={5} value={form.intro} onChange={e=>change('intro',e.target.value)} placeholder="介绍你的经验、擅长领域和服务范围"/></label>
    <div><span>职业（可多选）</span>{checks('roleCodes',schema.roles)}</div>
    <div><span>常驻城市（可多选）</span>{checks('locationCodes',schema.locations)}</div>
    <div><span>工作语言</span>{checks('languageCodes',schema.languages)}</div>
    {schema.skills.length>0&&<div><span>专业技能</span>{checks('skillCodes',schema.skills)}</div>}
    <div><span>联系方式</span>{form.contacts.map((c,i)=><div className="supplier-contact" key={i}><select aria-label={'联系方式类型 '+(i+1)} value={c.kind} onChange={e=>change('contacts',form.contacts.map((x,n)=>n===i?{...x,kind:e.target.value as typeof c.kind}:x))}><option value="PHONE">手机号</option><option value="WECHAT">微信</option><option value="EMAIL">邮箱</option><option value="OTHER">其他</option></select><input aria-label={'联系方式 '+(i+1)} maxLength={200} value={c.value} onChange={e=>change('contacts',form.contacts.map((x,n)=>n===i?{...x,value:e.target.value}:x))}/><button type="button" onClick={()=>change('contacts',form.contacts.filter((_,n)=>n!==i))}>移除</button></div>)}<button type="button" disabled={form.contacts.length>=10} onClick={()=>change('contacts',[...form.contacts,{kind:'WECHAT',value:''}])}>添加联系方式</button></div>
    {form.roleCodes.includes('model')&&<div><span>模特量尺（选填，厘米）</span><div className="supplier-measurements">{Object.entries({heightCm:'身高',bustCm:'胸围',waistCm:'腰围',hipsCm:'臀围'}).map(([key,label])=><label key={key}>{label}<input type="number" step="0.1" value={form.measurements[key as keyof typeof form.measurements]??''} onChange={e=>change('measurements',{...form.measurements,[key]:e.target.value===''?null:Number(e.target.value)})}/></label>)}</div></div>}
   </fieldset>

   <div id="supplier-professional">{schema&&<SupplierNativeFields profile={form} skills={schema.skills} languages={schema.languages} roles={schema.roles} onChange={change} disabled={locked}/>}
   {schema&&<SupplierProfessionalForm catalog={draft?.fieldCatalog??current?.fieldCatalog??schema.fieldCatalog} roles={form.roleCodes} roleOptions={schema.roles} value={form.professional} onChange={value=>change('professional',value)} disabled={locked}/>}</div>
   {conflict&&<section className="panel padded"><h3>资料已更新，请核对</h3><div className="supplier-comparison"><table><thead><tr><th>字段</th><th>当前已入库资料</th><th>本次草稿</th></tr></thead><tbody>{compareProfileRows(conflict.profile,form,schema).map(row=><tr key={row.key}><th>{row.label}</th><td>{row.current||'未提供'}</td><td>{row.draft||'未提供'}</td></tr>)}</tbody></table></div><label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>我已核对当前资料，选择保留上表本次草稿的内容</label><button disabled={!ack||busy||pending} onClick={()=>void run(async()=>{await command('/profile-drafts/'+draft!.id+'/rebase',{expectedRevision:draft!.revision,expectedPersonRevision:conflict.revision,profile:form,conflictsAcknowledged:true});setMessage('已保存核对结果，请再次确认入库。');})}>保存核对结果</button><button disabled={busy||pending} onClick={()=>{setForm(conflict.profile);setAliasesText(conflict.profile.aliases.join('，'));setDirty(true);}}>使用当前已入库资料</button></section>}
   {draft?.state==='DRAFT'&&documentPending&&<p>材料处理或状态核对完成后，可以继续编辑作品；暂停的整份解析可选择继续或停止。</p>}
   <section id="supplier-works" aria-label="整理作品"><h3>整理作品</h3>
   {draft&&<PortalWorkDraft key={'work:'+draft.id} onDirtyChange={setWorkDirty} me={me} submission={draft} command={command} refresh={()=>refresh(false)} disabled={busy||pending||dirty||documentPending}/> }
   {own&&<PortalWorkGallery me={me} personId={own.personId} version={String(draft?.revision)}/> }
   </section>
   <section id="supplier-confirm" aria-label="确认入库"><h3>确认入库</h3>
   <p id="supplier-confirm-reason" role="status">{!draft?'请先保存草稿，再上传材料并核对资料。':pending?'上次提交结果需要核对，请先核对原请求。':busy?'当前操作正在处理，请稍候。':dirty?'资料尚未保存，请先保存修改。':workDirty?'作品案例尚未保存，请先保存案例草稿。':documentPending?'材料解析或结果核对尚未完成，请先处理材料任务。':draft.state==='DRAFT'?'资料与作品已保存，可以核对后确认入库。':'本次资料已经入库。'}</p>
   <div className="supplier-actions">{(!draft||draft.state==='DRAFT')&&<><button disabled={busy||pending||workDirty||!draft&&!consent} onClick={()=>void run(save)}>{dirty?'保存修改':'保存草稿'}</button><button aria-describedby="supplier-confirm-reason" disabled={!draft||dirty||workDirty||documentPending||busy||pending} onClick={()=>void run(async()=>{await command('/profile-drafts/'+draft!.id+'/confirm',{expectedRevision:draft!.revision,accepted:true});setMessage('资料已入库，ONCE 现在可以查看和整理你的档案。');})}>确认资料并入库</button></>}{draft?.state==='APPROVED'&&<p role="status">本次资料已入库。</p>}</div>
   {workDirty&&<p>作品案例有未保存的修改。请先保存案例草稿，再确认入库。</p>}
   {draft?.consent.state==='ACTIVE'&&<button disabled={busy||pending||dirty||workDirty} onClick={()=>void run(async()=>{if(!window.confirm('撤回后，本次资料及材料将停止按这份同意用于 ONCE 内部供应商库。是否继续？'))return;await command('/consents/'+draft.consent.id+'/revoke',{expectedRevision:draft.consent.revision});setMessage('本次内部使用同意已撤回。');})}>撤回本次内部使用同意</button>}
   {dirty&&<p>有未保存的修改。先保存草稿，再确认入库。</p>}
   </section>
  </>}
  <p><a href={(()=>{const u=new URL(location.href);u.searchParams.set('legacy','1');u.searchParams.delete('draft');return u.pathname+u.search;})()}>查看历史申请、代理维护与历史提交</a></p>
 </section>;
}

function compareProfileRows(current:SupplierProfile,draft:SupplierProfile,schema:Schema){
 const entries=(profile:SupplierProfile)=>{const names=(codes:string[],options:Option[])=>codes.map(code=>options.find(o=>o.code===code)?.label??code).join('、');
 const base:Array<[string,string,string]>=[['name','姓名',profile.displayName],['aliases','别名',profile.aliases.join('、')],['intro','介绍',profile.intro],['roles','职业',names(profile.roleCodes,schema.roles)],['locations','城市',names(profile.locationCodes,schema.locations)],['languages','语言',names(profile.languageCodes,schema.languages)],['skills','通用技能',names(profile.skillCodes,schema.skills)],['contacts','联系方式',profile.contacts.map(c=>({PHONE:'电话',WECHAT:'微信',EMAIL:'邮箱',OTHER:'其他'}[c.kind])+': '+c.value).join('；')],['measurements','量尺',Object.entries(profile.measurements).filter(([,v])=>v!=null).map(([key,value])=>({heightCm:'身高',bustCm:'胸围',waistCm:'腰围',hipsCm:'臀围',shoeSizeValue:'鞋码',shoeSizeSystem:'鞋码体系',clothingSizeValue:'服装尺码',clothingSizeSystem:'服装体系',measuredOn:'量尺日期',datePrecision:'日期精度'}[key]??key)+'：'+value+(['heightCm','bustCm','waistCm','hipsCm'].includes(key)?' cm':'')).join('；')],
 ['capabilities','软件与专业能力',(profile.capabilityDetails??[]).map(c=>names([c.roleCode],schema.roles)+' · '+names([c.capabilityCode],schema.skills)+(c.levelCode?'（'+CAPABILITY_LEVEL_LABELS[c.levelCode]+'）':'')).join('；')],['credentials','资格声明',(profile.credentials??[]).map(c=>c.credentialName+(c.issuerName?' · '+c.issuerName:'')+(c.issuedOn?' · '+c.issuedOn:'')+(c.expiresOn?' 至 '+c.expiresOn:'')).join('；')],['translation','翻译服务',[...(profile.translation?.pairs??[]).map(p=>names([p.sourceLanguageCode],schema.languages)+' → '+names([p.targetLanguageCode],schema.languages)),...(profile.translation?.modeCodes??[]).map(c=>TRANSLATION_MODE_LABELS[c])].join('；')]];
 for(const answer of profile.professional?.answers??[]){const field=schema.fieldCatalog.definition.fields.find(f=>f.code===answer.fieldCode);if(field)base.push([(answer.roleCode??'person')+':'+answer.fieldCode,field.label+(answer.roleCode?' · '+names([answer.roleCode],schema.roles):''),answerText(answer,field)]);}return base;};
 const a=entries(current),b=entries(draft),keys=[...new Set([...a,...b].map(r=>r[0]))];return keys.map(key=>({key,label:(a.find(r=>r[0]===key)??b.find(r=>r[0]===key))![1],current:a.find(r=>r[0]===key)?.[2]??'',draft:b.find(r=>r[0]===key)?.[2]??''}));
}
