import {browserHomepageScenario} from './professional-homepage-scenario.mjs';
import {monitorCsp} from './browser-csp.mjs';
import {registeredTemp} from '../../scripts/registered-temp.mjs';
import {registeredBrowser} from '../../scripts/registered-browser.mjs';
let browserOwner;
/** Supplier library: real Nest/Prisma/PostgreSQL/Chrome, controlled HTTP notification gateway. */
import assert from 'node:assert/strict';
import {assertStoredSecretsAbsent,secretMatcher} from '../support/secret-leak.mjs';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createServer,request as httpRequest} from 'node:http';
import {createServer as createHttpsServer} from 'node:https';
import {PrismaClient} from '@prisma/client';
import {chromium} from 'playwright';
assert.equal(process.env.ALLOW_BROWSER_TESTS,'yes');const raw=process.env.DATABASE_URL_TEST;assert.ok(raw);const url=new URL(raw);assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));assert.match(url.pathname,/^\/once_test_[a-z0-9_]+$/);assert.ok(url.username&&url.password&&!url.search&&!url.hash);
const ownedTemp=registeredTemp({short:true});
const prisma=new PrismaClient({datasources:{db:{url:raw}},log:[]}),tmp=ownedTemp.path,sent=[],logs=[],errors=[],checks=[],cspViolations=[];let api,worker,browser,base,proxy,portalPage;
const evidence=process.env.ONCE_ACCEPTANCE_EVIDENCE_DIR||'artifacts/professional-homepage/browser';mkdirSync(evidence,{recursive:true});
const put=(name,value)=>{const p=join(tmp,name);writeFileSync(p,value,{mode:0o600});return p;};
const gateway=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const data=JSON.parse(raw);sent.push(data);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({requestKey:data.requestKey,state:'ACCEPTED'}));});
await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
const env={...process.env,DATABASE_URL:raw,APP_ENV:'test',APP_ORIGIN:'http://127.0.0.1:4318',ACCESS_MODE:'INTERNAL',COOKIE_SECURE:'false',HOST:'127.0.0.1',CONTACT_KEY_FILE:put('contact',randomBytes(32).toString('hex')),CSRF_KEY_FILE:put('csrf',randomBytes(32).toString('hex')),RECOVERY_EPOCH_FILE:put('epoch',randomBytes(24).toString('hex')),BOOTSTRAP_LOGIN:'owner',BOOTSTRAP_NAME:'合成管理员',BOOTSTRAP_PASSWORD_FILE:put('password','Synthetic-'+randomBytes(20).toString('base64url')+'!'),TALENT_PORTAL_ENABLED:'true',TALENT_AUTH_PROVIDER:'test',TALENT_AUTH_ENDPOINT:'http://127.0.0.1:'+gateway.address().port,TALENT_AUTH_CREDENTIAL_FILE:put('credential',randomBytes(32).toString('hex')),TALENT_AUTH_SENDER:'synthetic',TALENT_AUTH_TEMPLATE:'login',SAFETY_JOURNAL_FILE:join(tmp,'journal')};
env.PROFESSIONAL_HOMEPAGES_ENABLED='true';env.MEDIA_PROVIDER='local';env.MEDIA_ROOT=join(tmp,'private-media');
for(const name of ['IDENTITY','CODE','SESSION','MESSAGE','CSRF'])env['TALENT_'+name+'_KEY_FILE']=put('talent-'+name,randomBytes(32).toString('hex'));
function run(cmd,args){const r=spawnSync(cmd,args,{env,encoding:'utf8',timeout:120000});assert.equal(r.status,0,'Fixture command '+cmd+' failed ('+(r.error?.code??r.signal??r.status)+'): '+(r.stderr??'').slice(-1200));}
async function stop(child){if(!child||child.exitCode!==null||child.signalCode!==null)return;await new Promise(r=>{const timer=setTimeout(()=>{child.kill('SIGKILL');r();},5000);child.once('exit',()=>{clearTimeout(timer);r();});child.kill('SIGINT');});}
try{
 assert.equal((await prisma.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).length,0,'empty disposable database required');run('pnpm',['db:deploy']);run('node',['dist/apps/api/src/bootstrap.js']);const port=createServer();await new Promise(r=>port.listen(0,'127.0.0.1',r));env.PORT=String(port.address().port);await new Promise(r=>port.close(r));const cert=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(tmp,'tls.key'),'-out',join(tmp,'tls.crt'),'-days','1','-subj','/CN=localhost'],{encoding:'utf8'});assert.equal(cert.status,0);proxy=createHttpsServer({key:readFileSync(join(tmp,'tls.key')),cert:readFileSync(join(tmp,'tls.crt'))},(req,res)=>{const upstream=httpRequest({hostname:'127.0.0.1',port:Number(env.PORT),method:req.method,path:req.url,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);});await new Promise(r=>proxy.listen(0,'127.0.0.1',r));base='https://127.0.0.1:'+proxy.address().port;env.APP_ORIGIN=base;env.COOKIE_SECURE='true';
 api=spawn('node',['dist/apps/api/src/main.js'],{env,stdio:['ignore','pipe','pipe']});for(const stream of [api.stdout,api.stderr])stream.on('data',d=>logs.push(d.toString()));const deadline=Date.now()+20000;for(;;){try{if((await fetch('http://127.0.0.1:'+env.PORT+'/health/ready')).status===200)break;}catch{}assert.ok(Date.now()<deadline,'API readiness');await new Promise(r=>setTimeout(r,100));}
 worker=spawn('node',['dist/apps/api/src/worker-main.js'],{env,stdio:['ignore','pipe','pipe']});for(const stream of [worker.stdout,worker.stderr])stream.on('data',d=>logs.push(d.toString()));

 run('python3',['tests/documents/fixtures.py',tmp]);
 browserOwner=await registeredBrowser(chromium,{headless:true,env:{...process.env,TMPDIR:tmp},...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});browser=browserOwner.browser;
 const internal=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}}),admin=await internal.newPage();await monitorCsp(internal,cspViolations);admin.on('pageerror',e=>errors.push(e.message));await admin.goto(base);await admin.getByLabel('登录名',{exact:true}).fill('owner');await admin.getByLabel('密码',{exact:true}).fill(readFileSync(env.BOOTSTRAP_PASSWORD_FILE,'utf8'));await admin.getByRole('button',{name:'登录',exact:true}).click();await admin.getByRole('button',{name:'人才库',exact:true}).waitFor();
 const me=await (await internal.request.get(base+'/api/v1/me')).json();
 async function cmd(path,body){const response=await internal.request.post(base+'/api/v1'+path,{headers:{Origin:base,'X-CSRF-Token':me.csrfToken,'Idempotency-Key':crypto.randomUUID()},data:body});const value=await response.json();assert.ok(response.ok(),JSON.stringify(value));return value;}
 const scope=(await cmd('/scopes',{name:'匿名主页浏览器验收',membershipIds:[me.membershipId]})).resourceId;
 const invitation=await cmd('/talent-invitations',{purpose:'ENROLL',scopeId:scope,maxUses:10,exposureFields:[]});
 const issued=await cmd('/talent-invitations/'+invitation.resourceId+'/issue',{expectedRevision:invitation.revision});
 const ctx=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844}}),page=await ctx.newPage();await monitorCsp(ctx,cspViolations);portalPage=page;page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 await page.goto(issued.url);await page.getByLabel('邮箱地址').fill('homepage.synthetic@example.com');await page.getByRole('button',{name:'发送验证码',exact:true}).click();await page.getByLabel('六位验证码').waitFor();await page.getByLabel('六位验证码').fill(sent.at(-1).code);await page.getByRole('button',{name:'验证并登录',exact:true}).click();
 await page.getByLabel('我是本人，且已满 18 周岁',{exact:true}).check();await page.getByRole('button',{name:'加入并建立资料',exact:true}).click();await page.getByText('已加入，请完善下方资料。',{exact:true}).waitFor();
 await browserHomepageScenario({page,ctx,browser,prisma,base,tmp,evidence,checks,cspViolations,errors,cmd,run});
 assert.deepEqual(cspViolations,[],'strict CSP in owner editor, preview, QR and anonymous homepage');assert.deepEqual(errors,[]);checks.push('strict-CSP-owner-and-public-no-browser-errors');
 await assertStoredSecretsAbsent(prisma,logs,[]);
 writeFileSync(join(evidence,'browser.json'),JSON.stringify({status:'PASSED',checks,errors,provider:'local real image/PDF/MP4 bytes; synthetic owner; no real personal publication'},null,2)+'\n');console.log('PASS '+checks.join('; '));await ctx.close();await internal.close();
}catch(error){if(portalPage)await portalPage.screenshot({path:join(evidence,'browser-failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{for(const context of browser?.contexts()??[])for(const page of context.pages())await page.unrouteAll({behavior:'ignoreErrors'}).catch(()=>{});await browserOwner?.close();await stop(worker);await stop(api);if(proxy)await new Promise(r=>proxy.close(r));await prisma.$disconnect();await new Promise(r=>gateway.close(r));ownedTemp.cleanup();}
