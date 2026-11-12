import {useEffect,useState} from 'react';
import type {HomepageContent,HomepageMedia} from '../../../packages/core/src/professional-homepage-model.ts';
import './professional-homepage.css';

function Picture({media,cover=false}:{media:HomepageMedia;cover?:boolean}){
 const [failed,setFailed]=useState(false);
 if(failed)return <div className="homepage-media-failed">图片暂不可用</div>;
 return <img src={media.url} alt={cover?'代表作品封面':'作品图片'} loading={cover?'eager':'lazy'} decoding="async" onError={()=>setFailed(true)}/>;
}
function WorkMedia({media}:{media:HomepageMedia}){
 const [failed,setFailed]=useState(false);
 if(media.mime==='application/pdf')return <a className="homepage-text-link" href={media.url} download>下载本作品 PDF</a>;
 if(media.mime==='video/mp4')return <><video controls playsInline preload="none" src={media.url} onError={()=>setFailed(true)} aria-label="作品视频"/>{failed&&<p role="status">视频暂时无法播放，请查看本作品的外部链接或联系本人索取资料。</p>}</>;
 return <Picture media={media}/>;
}
export function HomepageView({content,preview=false}:{content:HomepageContent;preview?:boolean}){
 return <article className="professional-homepage" aria-label={preview?'个人主页预览':'专业人才个人主页'}>
  {preview&&<div className="homepage-preview-banner">草稿预览 · 保存或修改不会自动公开</div>}
  <header className="homepage-header"><a className="homepage-wordmark" href="#top">{content.displayName}</a><nav aria-label="主页导航"><a href="#works">作品</a><a href="#contact">联系</a></nav></header>
  <section id="top" className="homepage-hero"><div className="homepage-identity"><p className="homepage-kicker">{content.role}{content.city?' / '+content.city:''}</p><h1>{content.displayName}</h1>{content.intro&&<p className="homepage-intro">{content.intro}</p>}<a className="homepage-cta" href="#works">查看代表作品 <span aria-hidden="true">↗</span></a></div>{content.cover&&<div className="homepage-cover"><Picture key={content.cover.url} media={content.cover} cover/></div>}</section>
  {(content.skills.length>0||content.languages.length>0||content.measurements.length>0)&&<section className="homepage-facts" aria-label="专业信息">
   {content.skills.length>0&&<div><h2>擅长领域</h2><p>{content.skills.join(' / ')}</p></div>}
   {content.languages.length>0&&<div><h2>工作语言</h2><p>{content.languages.join(' / ')}</p></div>}
   {content.measurements.length>0&&<div><h2>本人公开的量尺</h2>{content.measurements.map(m=><p key={m.label}>{m.label} · {m.value}</p>)}</div>}
  </section>}
  <section id="works" className="homepage-works"><div className="homepage-section-heading"><h2>代表作品</h2><span>{String(content.works.length).padStart(2,'0')} SELECTED WORKS</span></div>
   {content.works.map((w,i)=><section className="homepage-work" key={i}><div className="homepage-work-heading"><span className="homepage-work-number">{String(i+1).padStart(2,'0')}</span><div><h3>{w.title}</h3><p className="homepage-responsibility">本人职责 · {w.responsibility}</p>{(w.brand||w.date)&&<p className="homepage-work-meta">{[w.brand,w.date].filter(Boolean).join(' / ')}</p>}</div></div>{w.description&&<p className="homepage-work-description">{w.description}</p>}<div className="homepage-work-media">{w.media.map(m=><WorkMedia key={m.url} media={m}/>)}</div>{w.externalUrl&&<a className="homepage-text-link" href={w.externalUrl} target="_blank" rel="noopener noreferrer">{w.media.some(m=>m.mime==='video/mp4')?'视频无法播放时，查看外部作品':'查看外部作品'} ↗</a>}</section>)}
  </section>
  <section id="contact" className="homepage-contact"><p className="homepage-kicker">LET’S WORK TOGETHER</p><h2>联系 {content.displayName}</h2><p>项目合作，请通过本人公开的方式联系。</p>{content.contacts.length===0&&<p>本人暂未公开联系方式。</p>}<ul>{content.contacts.map((c,i)=><li key={i}><span>{({EMAIL:'邮箱',PHONE:'电话',WECHAT:'微信',OTHER:'联系'})[c.kind]??'联系'}</span>{c.kind==='EMAIL'&&/^[^\s<>@]+@[^\s<>@]+$/.test(c.value)?<a href={'mailto:'+encodeURIComponent(c.value)}>{c.value}</a>:c.kind==='PHONE'&&/^\+?[0-9 ()-]+$/.test(c.value)?<a href={'tel:'+c.value.replace(/[ ()-]/g,'')}>{c.value}</a>:<span>{c.value}</span>}</li>)}</ul>{content.portfolio&&<a className="homepage-cta" href={content.portfolio.url} download>下载 PDF 作品集 ↓</a>}</section>
  <footer className="homepage-footer"><span>© {content.displayName}</span><span>由 ONCE 提供主页工具</span></footer>
 </article>;
}
export function PublicProfessionalHomepage(){
 const [content,setContent]=useState<HomepageContent|null>(null),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController(),slug=location.pathname.slice(3);let active=true;
  document.title='专业人才个人主页';
  void fetch('/api/v1/public/homepages/'+encodeURIComponent(slug),{cache:'no-store',credentials:'omit',signal:controller.signal,redirect:'error'}).then(async r=>{if(!r.ok)throw new Error(r.status===404?'该主页尚未发布、已下架或授权已失效。':'主页暂时无法打开，请稍后重试。');return r.json() as Promise<HomepageContent>;}).then(c=>{if(active){setContent(c);document.title=c.displayName+' · '+c.role;}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'主页暂时无法打开');});
  return()=>{active=false;controller.abort();};
 },[]);
 if(error)return <main className="homepage-unavailable"><p>ONCE · PERSONAL PORTFOLIO</p><h1>主页暂不可用</h1><p role="alert">{error}</p></main>;
 if(!content)return <main className="homepage-unavailable" aria-live="polite">正在打开作品主页…</main>;
 return <HomepageView content={content}/>;
}
