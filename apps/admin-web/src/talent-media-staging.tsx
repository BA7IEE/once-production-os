import {useEffect,useState} from 'react';
import type {TalentAccountMe} from './dto.ts';
type MediaRow={id:string;fileName:string;mime:string;state:string;usageState:string|null;revision:number;assetRevision:number|null;errorCode:string|null};
export function TalentMediaStaging({me,submission,command,refresh,disabled}:{me:TalentAccountMe;submission:{id:string;revision:number;state:string;media?:MediaRow[];consent:{textVersion?:string}};command:(path:string,body:unknown)=>Promise<{resourceId:string;revision:number}>;refresh:()=>Promise<void>;disabled:boolean}){
 const [file,setFile]=useState<File|null>(null),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const working=submission.media?.some(m=>['RECEIVING','UPLOADED','QUEUED','PROCESSING'].includes(m.state));
 useEffect(()=>{if(!working)return;const timer=setInterval(()=>{void refresh().catch(()=>setError('状态核对未完成，请重新打开本草稿。'));},2000);return()=>clearInterval(timer);},[working,submission.id]);
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'操作未完成');}finally{setBusy(false);}};
 async function upload(){
  if(!file)throw new Error('请选择一个新文件');
  const limits:Record<string,number>={'image/jpeg':30000000,'image/png':30000000,'image/webp':30000000,'application/pdf':50000000,'video/mp4':200000000};
  if(!limits[file.type]||file.size>limits[file.type]!)throw new Error('请使用限额内的 JPEG/PNG/WebP、PDF 或 H.264 MP4；HEIC/MOV 请先转换。');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const receipt=await command('/uploads',{context:{kind:'TALENT_SUBMISSION',submissionId:submission.id},expectedSubmissionRevision:submission.revision,fileName:file.name,mime:file.type,expectedBytes:file.size,sha256:hash});
  let sent=false;
  try{const response=await fetch('/api/v1/portal/uploads/'+receipt.resourceId+'/content',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream','X-CSRF-Token':me.csrfToken,'X-ONCE-Talent-Account':me.talentAccountId},body:file});sent=response.ok;}catch{/* Query the same upload; never create a second asset after an unknown response. */}
  const response=await fetch('/api/v1/portal/uploads/'+receipt.resourceId,{credentials:'same-origin',headers:{'X-ONCE-Talent-Account':me.talentAccountId}}),status=await response.json();
  if(!response.ok)throw new Error(status.error?.message??'上传状态未知，请保留本页核对');
  if(status.state!=='UPLOADED'){await refresh();throw new Error(sent?'文件尚未确认，请核对本次上传':'传输未确认，请查看下方状态；不要重复建立上传。');}
  await command('/uploads/'+receipt.resourceId+'/complete',{expectedRevision:status.revision});setFile(null);setMessage('文件已收到，正在后台处理；处理完成后仍须审核采纳。');await refresh();
 }
 return <section className="panel padded"><h4>本次提交的媒体</h4><p>图片、PDF 附件或 H.264 MP4。技术处理完成后仅供本人和授权审核人查看，审核通过才进入内部资料。</p>{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 {submission.state==='DRAFT'&&(submission.consent.textVersion!=='internal-directory-media-2026-10-v1'?<><label><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>我同意本批新上传媒体用于 ONCE 内部人才目录、候选查找及受控内部导出，有效期沿本批同意期限。我可以撤回；不包含客户分享或官网发布。</label><button disabled={!accepted||busy||disabled} onClick={()=>void run(async()=>{await command('/submissions/'+submission.id+'/media-consent',{expectedRevision:submission.revision,textVersion:'internal-directory-media-2026-10-v1',accepted:true});await refresh();})}>确认媒体使用同意</button></>:<><label>选择本人新文件<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4" disabled={busy||disabled} onChange={e=>setFile(e.target.files?.[0]??null)}/></label><button disabled={!file||busy||disabled} onClick={()=>void run(upload)}>上传到本次草稿</button></>)}
 <p>草稿90天、待审核最多180天、未采纳项决定后30天、撤回后7天。已采纳媒体按正式来源管理。默认额度（可由维护人员收紧）：每账号2GB，未绑定申请200MB；物理清理完成前继续占用。</p>
 {(submission.media??[]).map(m=><article key={m.id}><p>{m.fileName} · {m.state==='READY'?(m.usageState==='STAGED'?'处理完成 · 待采纳':m.usageState==='ADOPTED'?'已采纳':'已移除'):m.state==='FAILED'?'处理失败，请检查格式后重新上传':m.state==='CANCELLED'?'已取消':'处理中'}{m.errorCode?' · '+m.errorCode:''}</p>
 {m.state==='READY'&&m.usageState==='STAGED'&&(m.mime==='video/mp4'?<video controls preload="metadata" style={{maxWidth:'100%'}} src={'/api/v1/portal/accounts/'+me.talentAccountId+'/assets/'+m.id+'/playback'}/>:m.mime==='application/pdf'?<a href={'/api/v1/portal/accounts/'+me.talentAccountId+'/assets/'+m.id+'/attachment'} target="_blank" rel="noreferrer">PDF 附件 · {m.fileName}</a>:<img alt={m.fileName} style={{maxWidth:'100%',maxHeight:240}} src={'/api/v1/portal/accounts/'+me.talentAccountId+'/assets/'+m.id+'/preview'}/>)}
 {submission.state==='DRAFT'&&m.usageState==='STAGED'&&<button disabled={busy||disabled} onClick={()=>void run(async()=>{await command('/assets/'+m.id+'/retire',{expectedRevision:m.assetRevision});await refresh();})}>移除本批素材</button>}
 {submission.state==='DRAFT'&&!['READY','FAILED','CANCELLED','ERASED'].includes(m.state)&&<button disabled={busy||disabled} onClick={()=>void run(async()=>{await command('/uploads/'+m.id+'/cancel',{expectedRevision:m.revision});await refresh();})}>取消上传</button>}
 {m.state==='UPLOADED'&&<button disabled={busy||disabled} onClick={()=>void run(async()=>{await command('/uploads/'+m.id+'/complete',{expectedRevision:m.revision});await refresh();})}>提交后台处理</button>}
 </article>)}
 </section>;
}
