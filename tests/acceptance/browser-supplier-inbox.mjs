import {browserCatalogFields,browserFillProfessional,browserVerifyProfessional} from './supplier-fields.mjs';
import {browserProfessionalHistory} from './supplier-upgrade-reliability.mjs';
import {registeredTemp} from '../../scripts/registered-temp.mjs';
import {registeredBrowser} from '../../scripts/registered-browser.mjs';
let browserOwner;
/** Supplier library: real Nest/Prisma/PostgreSQL/Chrome, controlled HTTP notification gateway. */
import assert from 'node:assert/strict';
import {browserWorkGrouping} from './supplier-work-grouping.mjs';
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
const prisma=new PrismaClient({datasources:{db:{url:raw}},log:[]}),tmp=ownedTemp.path,sent=[],logs=[],errors=[],checks=[];let api,worker,browser,base,proxy,portalPage;
const evidence=process.env.ONCE_ACCEPTANCE_EVIDENCE_DIR||'artifacts/once-upgrade/p02/browser';mkdirSync(evidence,{recursive:true});
const put=(name,value)=>{const p=join(tmp,name);writeFileSync(p,value,{mode:0o600});return p;};
const gateway=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const data=JSON.parse(raw);sent.push(data);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({requestKey:data.requestKey,state:'ACCEPTED'}));});
await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
const env={...process.env,DATABASE_URL:raw,APP_ENV:'test',APP_ORIGIN:'http://127.0.0.1:4318',ACCESS_MODE:'INTERNAL',COOKIE_SECURE:'false',HOST:'127.0.0.1',CONTACT_KEY_FILE:put('contact',randomBytes(32).toString('hex')),CSRF_KEY_FILE:put('csrf',randomBytes(32).toString('hex')),RECOVERY_EPOCH_FILE:put('epoch',randomBytes(24).toString('hex')),BOOTSTRAP_LOGIN:'owner',BOOTSTRAP_NAME:'合成管理员',BOOTSTRAP_PASSWORD_FILE:put('password','Synthetic-'+randomBytes(20).toString('base64url')+'!'),TALENT_PORTAL_ENABLED:'true',TALENT_AUTH_PROVIDER:'test',TALENT_AUTH_ENDPOINT:'http://127.0.0.1:'+gateway.address().port,TALENT_AUTH_CREDENTIAL_FILE:put('credential',randomBytes(32).toString('hex')),TALENT_AUTH_SENDER:'synthetic',TALENT_AUTH_TEMPLATE:'login',SAFETY_JOURNAL_FILE:join(tmp,'journal')};
env.MEDIA_PROVIDER='local';env.MEDIA_ROOT=join(tmp,'private-media');
for(const name of ['IDENTITY','CODE','SESSION','MESSAGE','CSRF'])env['TALENT_'+name+'_KEY_FILE']=put('talent-'+name,randomBytes(32).toString('hex'));
function run(cmd,args){const r=spawnSync(cmd,args,{env,encoding:'utf8',timeout:120000});assert.equal(r.status,0,(r.stderr??'').slice(-1200));}
async function stop(child){if(!child||child.exitCode!==null||child.signalCode!==null)return;await new Promise(r=>{const timer=setTimeout(()=>{child.kill('SIGKILL');r();},5000);child.once('exit',()=>{clearTimeout(timer);r();});child.kill('SIGINT');});}
try{
 assert.equal((await prisma.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).length,0,'empty disposable database required');run('pnpm',['db:deploy']);run('node',['dist/apps/api/src/bootstrap.js']);const port=createServer();await new Promise(r=>port.listen(0,'127.0.0.1',r));env.PORT=String(port.address().port);await new Promise(r=>port.close(r));const cert=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(tmp,'tls.key'),'-out',join(tmp,'tls.crt'),'-days','1','-subj','/CN=localhost'],{encoding:'utf8'});assert.equal(cert.status,0);proxy=createHttpsServer({key:readFileSync(join(tmp,'tls.key')),cert:readFileSync(join(tmp,'tls.crt'))},(req,res)=>{const upstream=httpRequest({hostname:'127.0.0.1',port:Number(env.PORT),method:req.method,path:req.url,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);});await new Promise(r=>proxy.listen(0,'127.0.0.1',r));base='https://127.0.0.1:'+proxy.address().port;env.APP_ORIGIN=base;env.COOKIE_SECURE='true';
 api=spawn('node',['dist/apps/api/src/main.js'],{env,stdio:['ignore','pipe','pipe']});for(const stream of [api.stdout,api.stderr])stream.on('data',d=>logs.push(d.toString()));const deadline=Date.now()+20000;for(;;){try{if((await fetch('http://127.0.0.1:'+env.PORT+'/health/ready')).status===200)break;}catch{}assert.ok(Date.now()<deadline,'API readiness');await new Promise(r=>setTimeout(r,100));}
 worker=spawn('node',['dist/apps/api/src/worker-main.js'],{env,stdio:['ignore','pipe','pipe']});for(const stream of [worker.stdout,worker.stderr])stream.on('data',d=>logs.push(d.toString()));

 run('python3',['tests/documents/fixtures.py',tmp]);
 browserOwner=await registeredBrowser(chromium,{headless:true,env:{...process.env,TMPDIR:tmp},...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});browser=browserOwner.browser;
 const internal=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}}),admin=await internal.newPage();admin.on('pageerror',e=>errors.push(e.message));await admin.goto(base);await admin.getByLabel('登录名',{exact:true}).fill('owner');await admin.getByLabel('密码',{exact:true}).fill(readFileSync(env.BOOTSTRAP_PASSWORD_FILE,'utf8'));await admin.getByRole('button',{name:'登录',exact:true}).click();await admin.getByRole('button',{name:'人才库',exact:true}).waitFor();
 portalPage=admin;admin.setDefaultTimeout(25000);
 const me=await (await internal.request.get(base+'/api/v1/me')).json();
 async function cmd(path,body){const response=await internal.request.post(base+'/api/v1'+path,{headers:{Origin:base,'X-CSRF-Token':me.csrfToken,'Idempotency-Key':crypto.randomUUID()},data:body});const value=await response.json();assert.ok(response.ok(),JSON.stringify(value));return value;}
 await admin.getByRole('button',{name:'材料收件箱',exact:true}).click();
 await admin.getByRole('button',{name:'＋ 新建收件批次',exact:true}).click();
 await admin.getByLabel('批次名称',{exact:true}).fill('匿名材料浏览器收件');await admin.getByLabel('从谁处收到',{exact:true}).fill('匿名同行，经许可提供');await admin.getByLabel('材料使用依据',{exact:true}).fill('仅用于匿名隔离验收，不代表真实材料授权');
 await admin.getByRole('button',{name:'建立收件批次',exact:true}).click();await admin.getByRole('heading',{name:'匿名材料浏览器收件',exact:true}).waitFor();const batchId=new URL(admin.url()).pathname.split('/')[3];assert.ok(batchId);
 await admin.locator('input[type=file]').setInputFiles([join(tmp,'long-portfolio.pdf'),join(tmp,'photo.png')]);await admin.getByLabel('确认本批文件确实来自上述资料来源',{exact:true}).check();await admin.getByRole('button',{name:'开始上传 2 份文件',exact:true}).click();
 const material=admin.locator('.inbox-material').filter({has:admin.getByRole('heading',{name:'long-portfolio.pdf',exact:true})});await material.getByRole('button',{name:'提取原生文字与图片',exact:true}).waitFor();await admin.locator('.inbox-material').filter({has:admin.getByRole('heading',{name:'photo.png',exact:true})}).waitFor();const parsedCommand=admin.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/'+batchId+'/parse'));await material.getByRole('button',{name:'提取原生文字与图片',exact:true}).click();assert.equal((await parsedCommand).status(),200);await admin.reload({waitUntil:'networkidle'});await material.getByText('已处理 10 / 10 页 · 3 批',{exact:true}).waitFor({timeout:45000});
 checks.push('employee-inline-source-multiple-file-upload-durable-ten-page-PDF-reload');
 await material.getByText('查看原文、字段和作品建议',{exact:true}).click();await material.getByText('第 1 页原文',{exact:true}).click();assert.match(await material.textContent(),/Lin He/);
 await material.getByLabel('材料类型',{exact:true}).selectOption('MULTI_PERSON');
 for(const [name,page] of [['匿名人物甲','第 1 页'],['匿名人物乙','第 5 页']]){
  await material.getByRole('button',{name:'＋ 添加主体候选',exact:true}).click();await material.getByLabel('归属处理',{exact:true}).selectOption('CREATE');await material.getByLabel('候选姓名 / 展示名',{exact:true}).fill(name);await material.getByRole('checkbox',{name:'摄影师',exact:true}).check();await material.getByRole('checkbox',{name:page,exact:true}).check();
 }
 await material.getByRole('button',{name:'保存核对草稿',exact:true}).click();await admin.waitForFunction(()=>document.querySelector('.inbox-review button[type=submit]')?.disabled===true);
 await admin.reload({waitUntil:'networkidle'});assert.equal(await prisma.person.count(),0);
 for(const name of ['匿名人物甲','匿名人物乙']){
  await material.getByRole('button',{name,exact:true}).click();await material.getByLabel('我已核对当前候选的姓名、职业、署名与原文归属',{exact:true}).check();await material.getByRole('button',{name:'保存当前人物与作品',exact:true}).click();await material.getByRole('link',{name,exact:true}).waitFor();
 }
 assert.equal(await prisma.person.count(),2);assert.equal(await prisma.talentAccount.count(),0);const source=await prisma.sourceRecord.findUniqueOrThrow({where:{id:batchId}});assert.equal(source.confirmedByTalentId,null);const saved=await prisma.supplierInboxMaterial.findFirstOrThrow({where:{batchId,state:'COMPLETE'}});assert.equal(saved.createdById,me.membershipId);checks.push('one-file-two-people-human-page-ownership-no-fabricated-talent-account');
 const png=admin.locator('.inbox-material').filter({has:admin.getByRole('heading',{name:'photo.png',exact:true})});await png.getByRole('button',{name:'暂存 / 暂停',exact:true}).click();await png.getByText(/^失败 \/ 暂停/).waitFor();await png.getByRole('button',{name:'核对后续做',exact:true}).click();await admin.getByLabel('我已核对原请求，确认继续处理剩余内容；重试模型可能产生费用',{exact:true}).check();await admin.getByRole('button',{name:'继续处理',exact:true}).click();await png.getByText('已处理 1 / 1 页 · 1 批',{exact:true}).waitFor({timeout:30000});checks.push('independent-file-hold-resume-without-reupload');
 for(const width of [360,390,430]){await admin.setViewportSize({width,height:844});assert.equal(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'inbox no horizontal overflow '+width);await admin.screenshot({path:join(evidence,'inbox-'+width+'.png'),fullPage:true});}
 assert.deepEqual(errors,[]);writeFileSync(join(evidence,'browser.json'),JSON.stringify({status:'PASSED',externalModel:'NOT_RUN',checks,errors},null,2)+'\n');console.log('PASS '+checks.join('; '));await internal.close();
}catch(error){if(portalPage)await portalPage.screenshot({path:join(evidence,'browser-failure.png'),fullPage:true});console.error({errors,alerts:portalPage?await portalPage.getByRole('alert').allTextContents():[],materials:(await prisma.supplierInboxMaterial.findMany()).map(m=>({state:m.state,error:m.errorCode}))});throw error;}
finally{await browserOwner?.close();await stop(worker);await stop(api);if(proxy)await new Promise(r=>proxy.close(r));await prisma.$disconnect();await new Promise(r=>gateway.close(r));ownedTemp.cleanup();}
