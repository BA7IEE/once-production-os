import type {ApiRequest,ApiResponse} from './api.ts';
import type {Clock,Config,RequestMeta} from './model.ts';
import type {Store} from './store.ts';
import {ProfessionalHomepages} from './professional-homepages.ts';
import {invariant,missing} from './errors.ts';
import {audit} from './helpers.ts';

export class HomepagePublic {
 readonly service:ProfessionalHomepages;
 readonly store:Store;readonly config:Config;readonly clock:Clock;
 constructor(store:Store,clock:Clock,config:Config){this.store=store;this.config=config;this.clock=clock;this.service=new ProfessionalHomepages(clock,config);}
 validate(req:ApiRequest){const u=new URL(req.url,this.config.origin);invariant(req.method==='GET'&&!u.search&&!u.pathname.includes('%')&&!req.headers.authorization,'HOMEPAGE_REQUEST_INVALID','主页请求无效',400);invariant(!req.headers.origin||req.headers.origin===this.config.origin,'ORIGIN_DENIED','请求来源不被允许',403);return u;}
 async handle(req:ApiRequest,res:ApiResponse,meta:RequestMeta){const u=this.validate(req),m=/^\/api\/v1\/public\/homepages\/([A-Za-z0-9_-]{24})$/.exec(u.pathname);if(!m)missing();res.headers['Referrer-Policy']='no-referrer';res.headers['X-Robots-Tag']='noindex, nofollow';res.body=await this.store.transaction(async tx=>{const c=await this.service.current(tx,m[1]!);await audit(tx,null,c.h.workspaceId,'homepage.public.read','professionalHomepage',c.h.id,[],{requestId:meta.requestId,ip:'anonymous-homepage'},this.clock);return this.service.payload(c.v);});return res;}
 async media(req:ApiRequest,slug:string,key:string){const u=this.validate(req);if(!/^[A-Za-z0-9_-]{24}$/.test(slug)||! /^[a-f0-9]{32}$/.test(key)||!new RegExp('^/api/v1/public/homepages/'+slug+'/media/'+key+'/(preview|attachment|playback)$').test(u.pathname))missing();return this.store.transaction(tx=>this.service.publicMedia(tx,slug,key));}
}
