import {TalentMaintenance} from './talent-maintenance.ts';
import {TALENT_MAINTENANCE_ROUTES} from './talent-maintenance-routes.ts';
import type {ApiRequest,ApiResponse} from './api.ts';
import type {RequestMeta} from './model.ts';
import type {CommandPrincipal} from './talent-auth-model.ts';
import type {SafetyIntent,SafetyIntentSink} from './safety-intent.ts';
import {TalentAuth} from './talent-auth.ts';
import {TALENT_AUTH_ROUTES} from './talent-auth-routes.ts';
import {Commands} from './commands.ts';
import {authorizeReceipt} from './replay-policy.ts';
import {invariant} from './errors.ts';
import {parseStrictJson} from './json.ts';
import {csrfFor,equalSecret,randomSecret} from './crypto.ts';
import {touch} from './helpers.ts';
const path='/api/v1/portal',sessionName='once_talent_session',preName='once_talent_pre';
export class TalentPortal {
 auth:TalentAuth;writeAhead:(actor:CommandPrincipal,operation:string,requestId:string,resourceId:string,key:string)=>Promise<SafetyIntent|null>;sink:SafetyIntentSink|null;
 constructor(auth:TalentAuth,writeAhead:TalentPortal['writeAhead'],sink:SafetyIntentSink|null){this.auth=auth;this.writeAhead=writeAhead;this.sink=sink;}
 cookie(name:string,value:string,seconds:number){return `${name}=${value}; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;}
 async handle(req:ApiRequest,res:ApiResponse,meta:RequestMeta):Promise<ApiResponse>{
 const c=this.auth.settings();invariant(!req.headers.authorization,'PORTAL_AUTH_INVALID','人才入口不接受机器凭证',401);
 const url=new URL(req.url,this.auth.config.origin);invariant(!url.search&&!url.pathname.includes('%'),'QUERY_INVALID','请求路径无效',400);
 const contextMatch=/^\/api\/v1\/portal\/auth\/contexts\/([a-f0-9-]{36})$/.exec(url.pathname);
 const route=[...TALENT_AUTH_ROUTES,...TALENT_MAINTENANCE_ROUTES].find(r=>r.method===req.method&&new RegExp('^/api/v1'+r.path.replace('{id}','[a-f0-9-]{36}')+'$').test(url.pathname));const resourceId=url.pathname.match(/\/([a-f0-9-]{36})(?:\/|$)/)?.[1]??'';const maintenance=new TalentMaintenance(this.auth.clock,this.auth.config);invariant(route&&route.path.startsWith('/portal/'),'NOT_FOUND','接口不存在',404);
 const jar:Record<string,string>={};for(const pair of (req.headers.cookie??'').split(';')){const at=pair.indexOf('=');if(at<0)continue;const name=pair.slice(0,at).trim();if(![sessionName,preName].includes(name))continue;invariant(!Object.hasOwn(jar,name),'COOKIE_INVALID','Cookie 格式无效',400);jar[name]=pair.slice(at+1).trim();}
 const token=jar[sessionName]??'',browser=jar[preName]??'';
 if(req.method!=='GET')invariant(req.headers.origin===this.auth.config.origin,'ORIGIN_DENIED','请求来源不被允许',403);
 if(route.schema)invariant(req.headers['content-type']?.split(';')[0]?.trim()==='application/json','JSON_REQUIRED','请求必须使用 application/json',415);
 const data=route.schema?.parse(parseStrictJson(req.body||'{}')) as any;
 if(route.operation==='portal.invitation.exchange'){
 invariant(req.headers['x-once-portal']==='1','PREAUTH_REQUIRED','请从人才入口打开邀请',403);const value=/^[A-Za-z0-9_-]{43}$/.test(browser)?browser:randomSecret();res.body=await this.auth.store.transaction(async tx=>{const w=await this.auth.workspace(tx);await this.auth.rate(tx,w.id,'invitation-exchange:'+meta.ip,30,3600000);return maintenance.exchange(tx,w.id,value,data);});res.cookies.push(this.cookie(preName,value,1800));return res;
 }
 if(route.operation==='portal.auth.context'){
  invariant(req.headers['x-once-portal']==='1','PREAUTH_REQUIRED','请从人才登录页开始',403);
  const value=/^[A-Za-z0-9_-]{43}$/.test(browser)?browser:randomSecret();res.body=await this.auth.context(value,data.purpose,meta);res.cookies.push(this.cookie(preName,value,Math.ceil(c.contextMs/1000)));return res;
 }
 if(route.operation==='portal.auth.contextStatus'){res.body=await this.auth.contextStatus(browser,contextMatch![1]!);return res;}
 if(['portal.auth.challenge','portal.auth.verify'].includes(route.operation)){
  invariant(!!browser&&equalSecret(req.headers['x-csrf-token']??'',csrfFor(browser,c.csrfKey)),'CSRF_INVALID','认证校验失败，请重新开始',403);
  if(route.operation==='portal.auth.challenge'){res.body=await this.auth.createChallenge(browser,data,meta);return res;}
  const verified=await this.auth.verify(browser,data,meta);res.cookies.push(this.cookie(sessionName,verified.token,Math.ceil(c.absoluteMs/1000)));res.body={talentAccountId:verified.actor.talentAccountId,csrfToken:csrfFor(verified.token,c.csrfKey)};return res;
 }
 const authenticate=async(tx:Parameters<TalentAuth['authenticate']>[0])=>{const actor=await this.auth.authenticate(tx,token);if(req.method!=='GET'||TALENT_MAINTENANCE_ROUTES.includes(route)){invariant(req.headers['x-once-talent-account']===actor.talentAccountId,'IDENTITY_CHANGED','账号已变化，请使用原账号核对操作',409);if(req.method!=='GET')invariant(equalSecret(req.headers['x-csrf-token']??'',csrfFor(token,c.csrfKey)),'CSRF_INVALID','会话校验失败',403);}return actor;};
 if(route.operation==='portal.me'){res.body=await this.auth.store.transaction(async tx=>{const actor=await authenticate(tx);const a=(await tx.get('talentAccounts',actor.talentAccountId))!;return {talentAccountId:a.id,status:a.status,revision:a.revision,csrfToken:csrfFor(token,c.csrfKey)};});return res;}
 if(route.operation==='portal.auth.logout'){await this.auth.store.transaction(async tx=>{const actor=await authenticate(tx);await this.auth.logout(tx,actor,meta);});res.cookies.push(this.cookie(sessionName,'',0));res.body={loggedOut:true};return res;}
 if(TALENT_MAINTENANCE_ROUTES.includes(route)){
 if(route.mode==='READ'){res.body=await this.auth.store.transaction(async tx=>maintenance.portalRead(tx,await authenticate(tx),route.operation,resourceId,browser));return res;}
 const actor=await this.auth.store.transaction(authenticate),key=req.headers['idempotency-key']??'';const intent=await this.writeAhead(actor,route.operation,meta.requestId,resourceId||actor.talentAccountId,key);
 const kind=route.operation.startsWith('portal.claim.')?'talentClaim':route.operation==='portal.consent.revoke'?'talentConsent':'talentSubmission';
 res.body=await this.auth.store.transaction(async tx=>{const current=await authenticate(tx);return new Commands(this.auth.clock).execute(tx,current,route.operation,key,resourceId||null,data,kind,meta,async()=>{switch(route.operation){
 case 'portal.claim.create':return maintenance.claim(tx,current,browser,data);
 case 'portal.claim.renew':return maintenance.renew(tx,current,browser,resourceId,data);
 case 'portal.submission.create':return maintenance.createDraft(tx,current,data);
 case 'portal.submission.save':return maintenance.saveDraft(tx,current,resourceId,data);
 case 'portal.submission.submit':return maintenance.submissionAction(tx,current,resourceId,data,'submit');
 case 'portal.submission.withdraw':return maintenance.submissionAction(tx,current,resourceId,data,'withdraw');
 case 'portal.submission.fork':return maintenance.submissionAction(tx,current,resourceId,data,'fork');
 case 'portal.consent.revoke':return maintenance.revokeConsent(tx,current,resourceId,data);
 default:throw new Error('Unregistered maintenance command');
 }},receipt=>authorizeReceipt(tx,current,receipt,this.auth.clock,this.auth.config));});if(intent)await this.sink?.committed(intent,resourceId||actor.talentAccountId);return res;
 }
 const actor=await this.auth.store.transaction(authenticate),key=req.headers['idempotency-key']??'';
 const intent=await this.writeAhead(actor,route.operation,meta.requestId,actor.talentAccountId,key);
 res.body=await this.auth.store.transaction(async tx=>{const current=await authenticate(tx);return new Commands(this.auth.clock).execute(tx,current,route.operation,key,current.talentAccountId,{},'talentAccount',meta,async()=>{for(const s of await tx.find('talentSessions',{workspaceId:current.workspaceId,talentAccountId:current.talentAccountId}))if(s.id!==current.sessionId&&!s.revokedAt)await tx.replace('talentSessions',{...touch(s,this.auth.clock),revokedAt:this.auth.clock.now().toISOString()});const a=(await tx.get('talentAccounts',current.talentAccountId))!;await tx.replace('talentAccounts',touch(a,this.auth.clock));return {id:a.id,revision:a.revision+1};},receipt=>authorizeReceipt(tx,current,receipt,this.auth.clock,this.auth.config));});
 if(intent)await this.sink?.committed(intent,actor.talentAccountId);return res;
 }
}
