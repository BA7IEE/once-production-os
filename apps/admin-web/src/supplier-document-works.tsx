import {useEffect,useState} from 'react';
import type {DocumentProposal} from '../../../packages/core/src/document-schema.ts';
import type {DocumentWorkDraft} from '../../../packages/core/src/supplier-document-contract.ts';

export interface DocumentWorkJob {
 id:string;revision:number;state:string;assetId:string;supersededBy:string|null;
 proposal:DocumentProposal|null;importedImages:Record<string,string>;addedWorks:Record<string,string>;
}
export function SupplierDocumentWorks({jobs,workDrafts,media,roles,disabled,editable,onGroup}:{
 jobs:DocumentWorkJob[];workDrafts:DocumentWorkDraft[];media:Array<{id:string;fileName:string}>;
 roles:Array<{code:string;label:string}>;disabled:boolean;editable:boolean;
 onGroup:(candidates:Array<{jobId:string;expectedJobRevision:number;workKey:string}>,targetClientItemKey:string|null)=>Promise<void>;
}){
 const [selected,setSelected]=useState<string[]>([]),[target,setTarget]=useState(''),[showAdded,setShowAdded]=useState(false),[limit,setLimit]=useState(12);
 const candidates=jobs.filter(j=>!j.supersededBy&&['READY','APPLIED'].includes(j.state)).flatMap(job=>(job.proposal?.works??[]).map(work=>({id:job.id+':'+work.key,job,work,added:job.addedWorks?.[work.key]}))).sort((a,b)=>media.findIndex(m=>m.id===a.job.assetId)-media.findIndex(m=>m.id===b.job.assetId)||Math.min(...a.work.evidence.map(e=>e.page))-Math.min(...b.work.evidence.map(e=>e.page))||a.work.key.localeCompare(b.work.key));
 const available=candidates.filter(c=>!c.added),chosen=candidates.filter(c=>selected.includes(c.id)&&!c.added);
 const role=chosen[0]?.work.roleCode,roleConflict=chosen.some(c=>c.work.roleCode!==role);
 const destinations=workDrafts.filter(w=>w.canAppend&&(!role||w.roleCode===role));
 const validIds=available.map(c=>c.id).join('|'),targetKeys=destinations.map(w=>w.clientItemKey).join('|');
 useEffect(()=>{setSelected(s=>s.filter(id=>validIds.split('|').includes(id)));},[validIds]);
 useEffect(()=>{if(target&&!targetKeys.split('|').includes(target))setTarget('');},[target,targetKeys]);
 const label=(code:string|null)=>roles.find(r=>r.code===code)?.label??code??'本人职业待补充';
 const imported=new Set(chosen.flatMap(c=>c.work.imageKeys.flatMap(k=>c.job.importedImages[k]?[c.job.importedImages[k]]:[])));
 const missing=new Set(chosen.flatMap(c=>c.work.imageKeys.filter(k=>!c.job.importedImages[k]).map(k=>c.job.id+':'+k)));
 const visible=(showAdded?candidates:available),destination=destinations.find(w=>w.clientItemKey===target);
 if(!candidates.length)return null;
 return <section className="supplier-document-works" aria-label="整理识别到的作品"><h4>把不同页面整理成作品案例</h4>
  <p>共 {candidates.length} 个作品候选，{candidates.length-available.length} 个已整理。同一项目分散在多页或多个文件时，可勾选后归到同一个案例。</p>
  <p>请先在下方把需要的提取图片加入草稿，再整理作品；标题、简介和封面都可以继续调整。</p>
  {candidates.length>available.length&&<label><input type="checkbox" checked={showAdded} onChange={e=>setShowAdded(e.target.checked)}/>显示已整理的候选</label>}
  <div className="supplier-work-candidates">{visible.slice(0,limit).map(({id,job,work,added})=><article key={id} className="supplier-work-candidate">
   <label><input type="checkbox" aria-label={'选择作品候选：'+work.title} checked={selected.includes(id)&&!added} disabled={disabled||!editable||!!added||!work.roleCode} onChange={e=>setSelected(s=>e.target.checked?[...s,id]:s.filter(k=>k!==id))}/><strong>{work.title}</strong></label>
   <p>{label(work.roleCode)} · {work.brandDisplayName||'品牌待补充'} · {work.dateText||'时间待补充'}</p>
   <small>出处：{media.find(m=>m.id===job.assetId)?.fileName??'材料'} · 第 {[...new Set(work.evidence.map(e=>e.page))].join('、')} 页</small>
   <p>{work.imageKeys.filter(k=>job.importedImages[k]).length} / {work.imageKeys.length} 张候选图片已加入草稿</p>
   <details><summary>查看识别内容与出处</summary><p>{work.description||'暂无案例简介'}</p>{work.evidence.map((e,i)=><p key={i}>第 {e.page} 页：{e.quote??'图片区域识别，请对照原件核对'}</p>)}</details>
   {!work.roleCode&&<p>未识别出本人在该项目中的职业，请在作品案例草稿里手动补充。</p>}
   {added&&<p>已归入：{workDrafts.find(w=>w.clientItemKey===added)?.title??'作品案例草稿'}</p>}
  </article>)}</div>
  {visible.length>limit&&<button onClick={()=>setLimit(n=>n+12)}>显示更多作品候选（还有 {visible.length-limit} 个）</button>}
  {editable&&<fieldset disabled={disabled||!chosen.length}><legend>已选 {chosen.length} 个候选</legend>
   {roleConflict&&<p role="alert">所选候选的本人职业不同，请分开整理。</p>}
   <label>归入哪个案例<select aria-label="归入哪个案例" value={target} onChange={e=>setTarget(e.target.value)}><option value="">新建一个作品案例</option>{destinations.map(w=><option key={w.clientItemKey} value={w.clientItemKey}>{w.title} · {label(w.roleCode)} · {w.imageCount} 项素材</option>)}</select></label>
   {chosen.length>0&&<p>{destination?`将补充到「${destination.title}」，保留你已编辑的文字、封面和素材顺序。`:`新案例先采用「${chosen[0]!.work.title}」的标题、简介和时间，请在案例草稿中核对并修改。`}所有选中候选的来源都会保留。</p>}
   <p>本次归入 {imported.size} 张已加入草稿的图片。{missing.size>0&&`还有 ${missing.size} 张候选图片未加入，需先在下方导入，或之后在案例草稿中手动补充。`}</p>
   <button disabled={!chosen.length||roleConflict||!role} onClick={()=>void onGroup(chosen.map(c=>({jobId:c.job.id,expectedJobRevision:c.job.revision,workKey:c.work.key})),target||null)}>{target?'补充到所选案例草稿':'合成一个案例草稿'}</button>
  </fieldset>}
  {workDrafts.length>0&&<p><a href="#supplier-work-drafts">到作品案例草稿调整标题、简介和封面</a></p>}
 </section>;
}
