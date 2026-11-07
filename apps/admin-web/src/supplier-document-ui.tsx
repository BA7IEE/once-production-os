import {CAPABILITY_LEVEL_LABELS,TRANSLATION_MODE_LABELS} from '../../../packages/core/src/supplier-native-contract.ts';
import {answerText} from './supplier-professional-fields.tsx';
import type {SupplierCatalogView} from '../../../packages/core/src/supplier-field-contract.ts';
import {useEffect,useRef,useState} from 'react';
import type {DocumentProposal} from '../../../packages/core/src/document-schema.ts';
import {SupplierDocumentWorks} from './supplier-document-works.tsx';
import type {DocumentBatchSummary,DocumentWorkDraft} from '../../../packages/core/src/supplier-document-contract.ts';
type Job={nativeCatalog:{capabilities:Array<{code:string;label:string}>;languages:Array<{code:string;label:string}>}|null;professionalCatalog:SupplierCatalogView|null;id:string;revision:number;state:string;assetId:string;pages:number[];useAi:boolean;errorCode:string|null;selectedKeys:string[];imageCandidates:Array<{key:string;page:number}>;importedImages:Record<string,string>;addedWorks:Record<string,string>;batchId:string|null;supersededBy:string|null;
 result:{totalPages:number;status:string;pages:Array<{page:number;text:string;needsVisualText:boolean;imageCount:number;warnings:string[]}>;failedPages:Array<{page:number}>}|null;proposal:DocumentProposal|null};
const names:Record<string,string>={displayName:'姓名 / 展示名',aliases:'别名',intro:'个人介绍',roleCodes:'职业',locationCodes:'常驻城市',languageCodes:'工作语言',skillCodes:'技能',contacts:'联系方式',heightCm:'身高',bustCm:'胸围',waistCm:'腰围',hipsCm:'臀围',shoeSize:'鞋码',clothingSize:'服装尺码'};
const supported=new Set(Object.keys(names).filter(k=>!['shoeSize','clothingSize'].includes(k)));
export function SupplierDocumentPanel({draft,roles,request,command,refreshDraft,disabled,onPendingChange}:{draft:{id:string;revision:number;state:string;media:Array<{id:string;state:string;usageState:string|null;mime:string;fileName:string}>};roles:Array<{code:string;label:string}>;request:(path:string)=>Promise<any>;command:(path:string,body:unknown)=>Promise<unknown>;refreshDraft:()=>Promise<void>;disabled:boolean;onPendingChange:(pending:boolean)=>void}){
 const [jobs,setJobs]=useState<Job[]>([]),[assetId,setAssetId]=useState(''),[pages,setPages]=useState('1'),[useAi,setUseAi]=useState(true),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState<Record<string,string[]>>({});
 const [batches,setBatches]=useState<DocumentBatchSummary[]>([]),[mode,setMode]=useState<'ALL'|'SELECTED'>('ALL'),[retryAccepted,setRetryAccepted]=useState<Record<string,boolean>>({}),[showAttempts,setShowAttempts]=useState(false);
 const [professionalActions,setProfessionalActions]=useState<Record<string,'ADD'|'REPLACE'>>({});
 const [loading,setLoading]=useState(true),[workDrafts,setWorkDrafts]=useState<DocumentWorkDraft[]>([]);
 const alive=useRef(true),requestRef=useRef(request),current=useRef({draft,refreshDraft}),lastWorking=useRef(false);requestRef.current=request;current.current={draft,refreshDraft};
 const refreshSequence=useRef(0);
 async function refresh(){
  const sequence=++refreshSequence.current,result=await requestRef.current('/profile-drafts/'+draft.id+'/documents');
  if(!alive.current||sequence!==refreshSequence.current)return;
  const working=result.items.some((j:Job)=>['PROCESSING','IMAGE_PENDING','IMAGE_PROCESSING'].includes(j.state)||j.state==='PENDING'&&!j.batchId)
   ||(result.batches??[]).some((b:DocumentBatchSummary)=>['PENDING','PROCESSING','BATCH_RUNNING'].includes(b.state));
  const missingMedia=result.items.some((j:Job)=>Object.values(j.importedImages).some(id=>!current.current.draft.media.some(m=>m.id===id)));
  // Publish completion only after the parent has read the revision produced by
  // imported images. Otherwise a newly enabled work form can save a stale draft.
  if(missingMedia||lastWorking.current&&!working)await current.current.refreshDraft();
  if(!alive.current||sequence!==refreshSequence.current)return;
  setWorkDrafts(result.workDrafts??[]);setJobs(result.items);setBatches(result.batches??[]);setLoading(false);lastWorking.current=working;
 }
 useEffect(()=>{
  alive.current=true;setLoading(true);setJobs([]);setBatches([]);setSelected({});
  void refresh().catch(e=>{if(alive.current)setError(e.message);});
  return()=>{alive.current=false;refreshSequence.current++;};
 },[draft.id,draft.revision]);
 const working=jobs.some(j=>['PROCESSING','IMAGE_PENDING','IMAGE_PROCESSING'].includes(j.state)||j.state==='PENDING'&&!j.batchId)||batches.some(b=>['PENDING','PROCESSING','BATCH_RUNNING'].includes(b.state));
 const pending=loading||working||batches.some(b=>b.state==='BATCH_PAUSED');
 useEffect(()=>{onPendingChange(pending);},[pending,onPendingChange]);
 useEffect(()=>{if(!working)return;let reading=false;const timer=setInterval(()=>{if(reading)return;reading=true;void refresh().catch(()=>{}).finally(()=>{reading=false;});},2000);return()=>clearInterval(timer);},[working,draft.id]);
 const files=draft.media.filter(m=>m.state==='READY'&&m.usageState==='STAGED'&&m.mime!=='video/mp4');
 const chosen=files.find(f=>f.id===assetId)??files[0];
 const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();await refresh();}catch(e){if(alive.current)setError(e instanceof Error?e.message:'解析操作未完成');}finally{if(alive.current)setBusy(false);}};
 async function start(){
  if(!chosen)throw new Error('请先上传 PDF 或图片，并等待文件处理完成。');
  if(mode==='ALL'){await command('/profile-drafts/'+draft.id+'/documents',{expectedRevision:draft.revision,assetId:chosen.id,mode:'ALL',useAi,aiAccepted:accepted});return;}
  const requested=chosen.mime==='application/pdf'?pages.split(/[,，\s]+/).filter(Boolean).map(Number):[1];
  if(!requested.length||requested.length>4||requested.some(p=>!Number.isSafeInteger(p)||p<1)||new Set(requested).size!==requested.length)throw new Error('每次选择 1—4 个不同页码，例如 1,2,3,4。');
  await command('/profile-drafts/'+draft.id+'/documents',{expectedRevision:draft.revision,assetId:chosen.id,pages:requested,useAi,aiAccepted:accepted});
 }
 function value(field:string,data:unknown,job:Job){if(field==='contacts')return (data as Array<{kind:string;value:string}>).map(c=>c.value).join('；');if(Array.isArray(data)){const options=field==='roleCodes'?roles:field==='languageCodes'?job.nativeCatalog?.languages:field==='skillCodes'?job.nativeCatalog?.capabilities:[];return data.map(code=>options?.find(o=>o.code===code)?.label??code).join('、');}return String(data);}
 const batchAction=(batch:DocumentBatchSummary,action:'CANCEL'|'RESUME')=>run(()=>command('/profile-drafts/'+draft.id+'/documents/batch',{expectedRevision:draft.revision,batchId:batch.id,expectedBatchRevision:batch.revision,action,aiRetryAccepted:retryAccepted[batch.id]===true}));
 return <section className="panel padded supplier-documents"><h3>从材料中提取资料</h3><p>提取 PDF 文字和图片，再用 AI 整理成资料建议。你可以逐项核对出处，选择需要预填的字段。</p>
  {error&&<p role="alert">{error} <button disabled={busy} onClick={()=>void run(refresh)}>重新读取处理状态</button></p>}
  {draft.state==='DRAFT'&&<fieldset disabled={disabled||busy}><legend>选择材料与页面</legend>
   <label>已上传的材料<select aria-label="已上传的材料" value={chosen?.id??''} onChange={e=>setAssetId(e.target.value)}>{!files.length&&<option value="">等待上传完成</option>}{files.map(f=><option key={f.id} value={f.id}>{f.fileName}</option>)}</select></label>
   <label>处理范围<select aria-label="处理范围" value={mode} onChange={e=>{setMode(e.target.value as 'ALL'|'SELECTED');setAccepted(false);}}><option value="ALL">整份材料（自动分批）</option><option value="SELECTED">只处理指定页面</option></select></label>
   {mode==='ALL'?<p>最多 100 页，系统每批处理不超过 4 页。关闭页面后仍会继续，重新登录可以查看进度。失败时保留已完成结果，等待你核对后续做。</p>:chosen?.mime==='application/pdf'&&<label>本次解析页码<input value={pages} onChange={e=>setPages(e.target.value)} placeholder="1,2,3,4"/><small>本次可选 1—4 页，保留原始页码。</small></label>}
   <label><input type="checkbox" checked={useAi} onChange={e=>setUseAi(e.target.checked)}/>使用 AI 识别和整理字段</label>
   {useAi&&<label><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>{mode==='ALL'?'同意把整份材料分批发送给 ONCE 配置的 AI 服务，首次最多调用 25 次；受工作区额度限制。':'同意把所选页面的内容发送给 ONCE 配置的 AI 服务进行识别'}</label>}
   <button disabled={!chosen||useAi&&!accepted} onClick={()=>void run(start)}>{mode==='ALL'?'解析整份材料':'解析选定材料'}</button>
  </fieldset>}
  {batches.map(batch=><section className="supplier-document-batch" key={batch.id} aria-label="整份材料处理进度"><h4>{draft.media.find(m=>m.id===batch.assetId)?.fileName??'材料'} · 整份解析</h4>
   <p role="status">{batch.totalPages===null?(['PENDING','PROCESSING'].includes(batch.state)?'正在读取文档页数…':'尚未建立页面处理计划。'):`已提取 ${batch.completedPages.length} / ${batch.totalPages} 页，完成 ${batch.completedChunks} / ${batch.chunks} 批。`}</p>
   {batch.totalPages!==null&&<progress aria-label="材料提取进度" max={batch.totalPages} value={batch.completedPages.length}/>}
   {batch.state==='READY'&&<p>整份材料已完成分批处理，请核对下面各页的资料、图片和作品建议。</p>}
   {batch.reviewPages.length>0&&<p>第 {batch.reviewPages.join('、')} 页包含扫描内容或版式提示，需要对照原件核对。</p>}
   {batch.state==='BATCH_PAUSED'&&<p role="alert">处理已暂停。第 {batch.failedPages.join('、')} 页未完成{batch.pendingPages.length?`，另有 ${batch.pendingPages.length} 页等待处理`:''}；已完成结果保留。</p>}
   {batch.state==='REJECTED'&&<p role="alert">{batch.errorCode==='CANCELLED'?'已停止后续处理，已完成结果仍可使用。':batch.errorCode==='PAGE_LIMIT_EXCEEDED'?'材料超过 100 页，请拆分文件或改用指定页面。':'整份解析未完成，请检查文件及当前授权后重试。'}</p>}
   {draft.state==='DRAFT'&&batch.retryAllowed&&<>{batch.retryMayCharge&&<label><input type="checkbox" checked={retryAccepted[batch.id]??false} onChange={e=>setRetryAccepted(s=>({...s,[batch.id]:e.target.checked}))}/>我已核对失败批次，同意重新处理这些页；之前的 AI 调用可能已产生费用。</label>}<button disabled={disabled||busy||batch.retryMayCharge&&!retryAccepted[batch.id]} onClick={()=>void batchAction(batch,'RESUME')}>继续处理未完成页面</button></>}
   {draft.state==='DRAFT'&&['PENDING','PROCESSING','BATCH_RUNNING','BATCH_PAUSED'].includes(batch.state)&&<button disabled={disabled||busy} onClick={()=>void batchAction(batch,'CANCEL')}>停止后续处理，保留已完成结果</button>}
  </section>)}
  <SupplierDocumentWorks jobs={jobs} workDrafts={workDrafts} media={draft.media} roles={roles} disabled={disabled||busy||pending} editable={draft.state==='DRAFT'} onGroup={(candidates,targetClientItemKey)=>run(()=>command('/profile-drafts/'+draft.id+'/documents/work-group',{expectedRevision:draft.revision,candidates,targetClientItemKey}))}/>
  {jobs.some(j=>j.supersededBy)&&<label><input type="checkbox" checked={showAttempts} onChange={e=>setShowAttempts(e.target.checked)}/>查看之前失败的处理记录</label>}
  {jobs.filter(j=>!j.supersededBy||showAttempts).map(job=><article key={job.id} className="supplier-document-result"><h4>{draft.media.find(m=>m.id===job.assetId)?.fileName??'材料'} · 第 {job.pages.join('、')} 页</h4>
   {job.supersededBy&&<p>这是之前的失败记录，后续重试已有独立结果。</p>}
   {['PENDING','PROCESSING','IMAGE_PENDING','IMAGE_PROCESSING'].includes(job.state)&&<p role="status">{job.state==='PENDING'?'等待处理':job.state.startsWith('IMAGE')?'正在把提取图片加入草稿…':'正在提取并识别，请稍候…'}</p>}
   {job.errorCode&&<p role="alert">{job.errorCode==='AI_OUTCOME_UNKNOWN'?'AI 请求结果尚未确认，请联系 ONCE 核对后再发起新任务。':job.errorCode==='CANCELLED'?'本次解析已取消。':'解析未完成，可查看提取内容并手工补充。'} <small>{job.errorCode}</small></p>}
   {job.result&&<><p>文档共 {job.result.totalPages} 页，本次已提取 {job.result.pages.length} 页{job.result.failedPages.length>0?`，失败 ${job.result.failedPages.length} 页`:''}。</p>{job.result.pages.map(page=><details key={page.page}><summary>第 {page.page} 页 · 提取图片 {page.imageCount} 张{page.needsVisualText?' · 扫描 / 图片页面':''}</summary><p style={{whiteSpace:'pre-wrap'}}>{page.text||'该页没有可直接提取的文字，需要视觉识别或手工核对。'}</p>{page.warnings.length>0&&<p>本页存在复杂版式或内容截断，请对照原件核对。</p>}</details>)}</>}
   {draft.state==='DRAFT'&&['READY','APPLIED'].includes(job.state)&&job.imageCandidates.some(i=>!job.importedImages[i.key])&&<><p>可把提取的图片及 AI 识别区域加入本草稿，再在上方查看、移除或选作作品封面。每次最多 10 张。</p><button disabled={disabled||busy||pending} onClick={()=>void run(()=>command('/profile-drafts/'+draft.id+'/documents/images',{expectedRevision:draft.revision,jobId:job.id,expectedJobRevision:job.revision,imageKeys:job.imageCandidates.filter(i=>!job.importedImages[i.key]).slice(0,10).map(i=>i.key)}))}>把提取图片加入草稿</button></>}
   {Object.keys(job.importedImages).length>0&&<p>已加入 {Object.keys(job.importedImages).length} 张图片，可在材料区查看。</p>}
   {job.proposal&&<><p>以下为 AI 建议，请结合原件核对。选中后只预填到草稿，最后仍需确认入库。</p>{job.proposal.fields.map(f=><div className="supplier-document-field" key={f.key}><label><input type="checkbox" disabled={disabled||busy||pending||job.state!=='READY'||!supported.has(f.field)} checked={(selected[job.id]??job.selectedKeys).includes(f.key)} onChange={e=>setSelected(s=>({...s,[job.id]:e.target.checked?[...(s[job.id]??[]),f.key]:(s[job.id]??[]).filter(k=>k!==f.key)}))}/><strong>{names[f.field]??f.field}</strong></label><p>{value(f.field,f.value,job)}</p><small>{f.evidence.map(e=>`第 ${e.page} 页${e.quote?'：“'+e.quote+'”':'，图片区域识别'}`).join('；')}</small>{!supported.has(f.field)&&<p>请先保留此信息，在介绍中补充。</p>}{['aliases','roleCodes','locationCodes','languageCodes','skillCodes','contacts'].includes(f.field)&&<label>采纳方式<select disabled={disabled||busy||pending||job.state!=='READY'} value={professionalActions[job.id+':'+f.key]??'ADD'} onChange={e=>setProfessionalActions(a=>({...a,[job.id+':'+f.key]:e.target.value as 'ADD'|'REPLACE'}))}><option value="ADD">追加到现有资料</option><option value="REPLACE">替换此字段的草稿内容</option></select></label>}</div>)}

    {job.proposal.documentKind&&<p className="muted">材料类型：{({PERSON_PROFILE:'个人资料',COMPANY_PROFILE:'公司或团队介绍',SHOOT_BRIEF:'拍摄需求',OTHER:'其他材料',UNKNOWN:'尚未确定'})[job.proposal.documentKind]}{job.proposal.subjectAssociation==='UNCERTAIN'?' · 主体尚不明确，请人工核对':''}</p>}
    {(job.proposal.nativeFields??[]).map(f=><div className="supplier-document-field" key={f.key}><label><input type="checkbox" disabled={disabled||busy||pending||job.state!=='READY'} checked={(selected[job.id]??job.selectedKeys).includes(f.key)} onChange={e=>setSelected(s=>({...s,[job.id]:e.target.checked?[...(s[job.id]??[]),f.key]:(s[job.id]??[]).filter(k=>k!==f.key)}))}/><strong>{({capabilityDetails:'软件与专业能力',credentials:'资格声明（未核验）',translation:'翻译服务',measurementDetails:'尺码与量尺时间'})[f.field]}</strong></label><p style={{whiteSpace:'pre-wrap'}}>{nativeText(f,job,roles)}</p><small>{f.evidence.map(e=>`第 ${e.page} 页${e.quote?'：“'+e.quote+'”':'，图片区域识别'}`).join('；')}</small>{f.field!=='measurementDetails'&&<label>采纳方式<select disabled={disabled||busy||pending||job.state!=='READY'} value={professionalActions[job.id+':'+f.key]??'ADD'} onChange={e=>setProfessionalActions(a=>({...a,[job.id+':'+f.key]:e.target.value as 'ADD'|'REPLACE'}))}><option value="ADD">追加到现有资料</option><option value="REPLACE">替换这组草稿内容</option></select></label>}</div>)}
    {(job.proposal.professionalFields??[]).map(f=>{const field=job.professionalCatalog?.definition.fields.find(d=>d.code===f.fieldCode);if(!field)return null;return <div className="supplier-document-field" key={f.key}><label><input type="checkbox" disabled={disabled||busy||pending||job.state!=='READY'} checked={(selected[job.id]??job.selectedKeys).includes(f.key)} onChange={e=>setSelected(s=>({...s,[job.id]:e.target.checked?[...(s[job.id]??[]),f.key]:(s[job.id]??[]).filter(k=>k!==f.key)}))}/><strong>{field.label}{f.roleCode?' · '+(roles.find(r=>r.code===f.roleCode)?.label??f.roleCode):''}</strong></label><p style={{whiteSpace:'pre-wrap'}}>{answerText({fieldCode:f.fieldCode,roleCode:f.roleCode,state:'KNOWN',value:f.value},field)}</p><small>{f.evidence.map(e=>`第 ${e.page} 页${e.quote?'：“'+e.quote+'”':'，图片区域识别'}`).join('；')}</small>{['CODE_SET','RECORDS'].includes(field.type)&&<label>采纳方式<select disabled={disabled||busy||pending||job.state!=='READY'} value={professionalActions[job.id+':'+f.key]??'ADD'} onChange={e=>setProfessionalActions(a=>({...a,[job.id+':'+f.key]:e.target.value as 'ADD'|'REPLACE'}))}><option value="ADD">追加到现有资料</option><option value="REPLACE">替换此字段的草稿内容</option></select></label>}</div>;})}
    {job.proposal.unknowns.length>0&&<ul>{job.proposal.unknowns.map((u,i)=><li key={i}>{u.field}：{u.reason}</li>)}</ul>}
    {job.state==='READY'&&<button disabled={disabled||busy||pending||!(selected[job.id]?.length)} onClick={()=>void run(()=>command('/profile-drafts/'+draft.id+'/documents/apply',{expectedRevision:draft.revision,jobId:job.id,expectedJobRevision:job.revision,selectedKeys:selected[job.id],professionalActions:[...(job.proposal?.fields??[]),...(job.proposal?.professionalFields??[]),...(job.proposal?.nativeFields??[])].filter(f=>selected[job.id]?.includes(f.key)).map(f=>({key:f.key,action:professionalActions[job.id+':'+f.key]??(('fieldCode' in f?['CODE_SET','RECORDS'].includes(job.professionalCatalog?.definition.fields.find(d=>d.code===f.fieldCode)?.type??''):['aliases','roleCodes','locationCodes','languageCodes','skillCodes','contacts','capabilityDetails','credentials','translation'].includes(f.field))?'ADD':'REPLACE')}))}))}>把选中字段预填到草稿</button>}
    {job.state==='APPLIED'&&<p role="status">选中字段已预填，可以在上方继续调整。</p>}
   </>}
   {draft.state==='DRAFT'&&!job.batchId&&['PENDING','PROCESSING','READY','IMAGE_PENDING','IMAGE_PROCESSING'].includes(job.state)&&<button disabled={disabled||busy} onClick={()=>void run(()=>command('/profile-drafts/'+draft.id+'/documents/cancel',{expectedRevision:draft.revision,jobId:job.id}))}>{working?'取消本次解析':'忽略本次建议'}</button>}
  </article>)}
 </section>;
}

function nativeText(field:NonNullable<DocumentProposal['nativeFields']>[number],job:Job,roles:Array<{code:string;label:string}>){
 const label=(code:string,list:Array<{code:string;label:string}>)=>list.find(o=>o.code===code)?.label??code;
 if(field.field==='capabilityDetails')return (field.value as Array<{roleCode:string;capabilityCode:string;levelCode:keyof typeof CAPABILITY_LEVEL_LABELS|null}>).map(c=>label(c.roleCode,roles)+' · '+label(c.capabilityCode,job.nativeCatalog?.capabilities??[])+(c.levelCode?'（'+CAPABILITY_LEVEL_LABELS[c.levelCode]+'）':'')).join('；');
 if(field.field==='credentials')return (field.value as Array<{credentialName:string;issuerName:string|null;issuedOn:string|null;expiresOn:string|null}>).map(c=>c.credentialName+(c.issuerName?' · '+c.issuerName:'')+(c.issuedOn?' · '+c.issuedOn:'')+(c.expiresOn?' 至 '+c.expiresOn:'')).join('；');
 if(field.field==='translation'){const value=field.value as {pairs:Array<{sourceLanguageCode:string;targetLanguageCode:string}>;modeCodes:Array<keyof typeof TRANSLATION_MODE_LABELS>};return [...value.pairs.map(p=>label(p.sourceLanguageCode,job.nativeCatalog?.languages??[])+' → '+label(p.targetLanguageCode,job.nativeCatalog?.languages??[])),...value.modeCodes.map(c=>TRANSLATION_MODE_LABELS[c])].join('；');}
 return Object.entries(field.value as Record<string,unknown>).map(([key,value])=>({shoeSizeValue:'鞋码',shoeSizeSystem:'鞋码体系',clothingSizeValue:'服装尺码',clothingSizeSystem:'服装体系',measuredOn:'量尺日期',datePrecision:'日期精度'}[key]??key)+'：'+value).join('；');
}
