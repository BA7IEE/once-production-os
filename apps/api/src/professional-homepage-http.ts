import type {Express} from 'express';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {Application} from '../../../packages/core/src/api.ts';
import type {HomepageContent} from '../../../packages/core/src/professional-homepage-model.ts';
import {AppError} from '../../../packages/core/src/errors.ts';

const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
export function homepageHtml(template:string,content:HomepageContent|null,url:string){
 const title=content?content.displayName+' · '+content.role:'主页暂不可用',description=content?(content.intro||content.role+(content.city?' · '+content.city:'')).slice(0,180):'该主页尚未发布、已下架或授权已失效。';
 const metadata=`<meta property="og:type" content="profile"/><meta property="og:title" content="${escape(title)}"/><meta property="og:description" content="${escape(description)}"/><meta property="og:url" content="${escape(url)}"/>`+(content?.cover?`<meta property="og:image" content="${escape(new URL(content.cover.url,url).href)}"/>`:'');
 return template.replace(/<title>[^<]*<\/title>/,'<title>'+escape(title)+'</title>').replace('</head>',metadata+'</head>');
}
export function registerHomepageHttp(server:Express,core:Application,assets:string){
 const template=readFileSync(join(assets,'index.html'),'utf8');
 server.get('/p/:slug',async(req,res)=>{
  res.set({'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'});
  const slug=req.params.slug as string,url=new URL('/p/'+encodeURIComponent(slug),core.config.origin).href;
  try{
   if(req.method!=='GET'||req.url.includes('?'))throw new AppError(404,'NOT_FOUND','主页暂不可用');
   const content=await core.store.transaction(tx=>core.homepagePublic.service.publicRead(tx,slug));
   res.status(200).type('html').send(homepageHtml(template,content,url));
  }catch(error){res.status(error instanceof AppError&&[401,404,409].includes(error.status)?404:503).type('html').send(homepageHtml(template,null,url));}
 });
}
