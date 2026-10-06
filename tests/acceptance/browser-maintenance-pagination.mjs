/** Synthetic records on owned PostgreSQL; real Nest, Worker and Chromium pages. */
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {PrismaClient} from '@prisma/client';
import {chromium} from 'playwright';
import {run} from '../../scripts/resource-lifecycle.mjs';
import {registeredTemp} from '../../scripts/registered-temp.mjs';
import {registeredBrowser} from '../../scripts/registered-browser.mjs';
assert.equal(process.env.ALLOW_BROWSER_TESTS,'yes');assert.ok(process.env.ONCE_RESOURCE_RUN_DIR);
const raw=process.env.DATABASE_URL_TEST;assert.ok(raw);assert.match(new URL(raw).pathname,/^\/once_test_[a-z0-9_]+$/);
const db=new PrismaClient({datasources:{db:{url:raw}},log:[]}),temp=registeredTemp(),password='Synthetic-'+randomBytes(20).toString('base64url')+'!';
const file=(name,text)=>{const p=join(temp.path,name);writeFileSync(p,text,{mode:0o600});return p;};
const env={...process.env,DATABASE_URL:raw,APP_ENV:'test',ACCESS_MODE:'INTERNAL',DATA_EGRESS_MODE:'INTERNAL_APPROVED',COOKIE_SECURE:'false',HOST:'127.0.0.1',CONTACT_KEY_FILE:file('contact',randomBytes(32).toString('hex')),CSRF_KEY_FILE:file('csrf',randomBytes(32).toString('hex')),RECOVERY_EPOCH_FILE:file('epoch',randomBytes(24).toString('hex')),BOOTSTRAP_LOGIN:'owner',BOOTSTRAP_NAME:'合成发布管理员',BOOTSTRAP_PASSWORD_FILE:file('password',password)};
env.MEDIA_PROVIDER='local';env.MEDIA_ROOT=join(temp.path,'private-media');
const evidence='artifacts/flow-review';mkdirSync(evidence,{recursive:true});
let api,worker,browserOwner,browser,base,stage='setup';const checks=[],errors=[];
async function poll(predicate,label){const end=Date.now()+25000;while(!(await predicate())){assert.ok(Date.now()<end,label);await new Promise(r=>setTimeout(r,100));}}
async function stop(child){if(!child||child.exitCode!==null||child.signalCode!==null)return;await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},5000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill('SIGINT');});}
async function login(page,name){await page.goto(base,{waitUntil:'networkidle'});await page.getByLabel('登录名',{exact:true}).fill(name);await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('menuitem',{name:'工作台',exact:true}).waitFor();}
async function cmd(page,path,data,method='POST'){
 const me=await(await page.context().request.get(base+'/api/v1/me')).json();
 const response=await page.context().request.fetch(base+'/api/v1'+path,{method,data,headers:{Origin:base,'X-CSRF-Token':me.csrfToken,'X-ONCE-Membership':me.membershipId,'Idempotency-Key':randomUUID()}});
 assert.ok(response.ok(),'seed command '+path+' status '+response.status());return response.json();
}
async function writeUI(page,path,click,method='POST',query=null){
 const result=page.waitForResponse(r=>r.url().endsWith('/api/v1'+path)&&r.request().method()===method&&(!query||query(r.request().postDataJSON())));await click();const response=await result;assert.ok(response.ok(),path+' status '+response.status());return response.json();
}
async function member(admin,name,role,label){
 const result=await cmd(admin,'/memberships',{loginName:name,displayName:label,role,extraPermissions:[]}),context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/activate',{waitUntil:'networkidle'});await page.getByLabel('激活凭证').fill(result.activationToken);await page.getByLabel('设置密码（至少 12 个字符）').fill(password);await page.getByRole('button',{name:'激活账号',exact:true}).click();await page.getByText('账号已激活').waitFor();await login(page,name);return {page,id:result.membershipId};
}
async function search(page,name,role,city){
 await page.goto(base+'/workspace/people',{waitUntil:'networkidle'});await page.getByLabel('搜索姓名或别名',{exact:true}).fill(name);if(role){await page.getByLabel('选择职业',{exact:true}).click();await page.getByRole('checkbox',{name:{model:'模特',actor:'演员'}[role],exact:true}).check();await page.getByLabel('选择职业',{exact:true}).click();}if(city){await page.getByLabel('选择城市',{exact:true}).click();await page.getByRole('checkbox',{name:{shenzhen:'深圳'}[city],exact:true}).check();await page.getByLabel('选择城市',{exact:true}).click();}
 return writeUI(page,'/directory/talents/search',()=>page.getByRole('button',{name:'搜索',exact:true}).click());
}
const record=name=>{checks.push(name);console.log('PASS '+name);};
try {
 assert.equal((await db.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public'")).length,0);
 await run('pnpm',['db:deploy'],{env,capture:true});
 const port=createServer();await new Promise(r=>port.listen(0,'127.0.0.1',r));env.PORT=String(port.address().port);await new Promise(r=>port.close(r));base='http://127.0.0.1:'+env.PORT;env.APP_ORIGIN=base;
 await run(process.execPath,['dist/apps/api/src/bootstrap.js'],{env,capture:true});
 const membership=await db.membership.findFirstOrThrow();await db.membership.update({where:{id:membership.id},data:{extraPermissions:[...membership.extraPermissions,'data.export','data.delete']}});
 api=spawn(process.execPath,['dist/apps/api/src/main.js'],{env,stdio:'ignore'});
 await poll(async()=>{try{return(await fetch(base+'/health/ready')).status===200;}catch{return false;}},'API readiness');
 browserOwner=await registeredBrowser(chromium,{headless:true,env:{...process.env,TMPDIR:temp.path}});browser=browserOwner.browser;
 const page=await browser.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));await login(page,'owner');
 stage='seed 105 people and export grants';
 const source=await cmd(page,'/sources',{title:'合成分页资料',type:'MANUAL',providerClaim:'合成资料',basisMode:'INTERNAL_USE',basisDescription:'仅用于分页自动化回归',validUntil:'2026-12-31T00:00:00.000Z'});
 const people=[];for(let i=0;i<105;i++){
  const p=await cmd(page,'/directory/talents',{schemaVersion:'once-talent-experience-v1',displayName:'分页人物 '+String(i).padStart(3,'0'),kind:'TALENT',roleCodes:['model'],sourceId:source.resourceId,sourceRevision:1});people.push(p.resourceId);
  await cmd(page,'/use-permissions',{sourceId:source.resourceId,subjectKind:'PERSON',subjectId:p.resourceId,fields:['person.displayName'],validUntil:'2026-11-30T00:00:00.000Z',evidenceNote:'Synthetic bounded export permission'});
 }
 async function navigate(name){const nav=page.locator('aside[aria-label="工作空间导航"]');if(!await nav.getByRole('menuitem',{name,exact:true}).isVisible())await nav.getByRole('menuitem',{name:'管理与设置',exact:true}).click();await nav.getByRole('menuitem',{name,exact:true}).click();}
 stage='export object final page and search';await navigate('内部导出');await page.getByRole('button',{name:'＋ 批准导出用途',exact:true}).click();
 const form=page.getByRole('dialog',{name:'批准内部导出用途',exact:true}),picker=form.getByRole('group',{name:'批准对象选择器',exact:true});
 for(let n=2;n<=6;n++){await picker.getByRole('button',{name:'下一页',exact:true}).click();await picker.getByText('第 '+n+' 页',{exact:false}).waitFor();}
 await form.getByLabel('批准对象',{exact:true}).selectOption(people[0]);await picker.getByRole('button',{name:'上一页',exact:true}).click();await picker.getByText('第 5 页',{exact:false}).waitFor();assert.equal(await form.getByLabel('批准对象',{exact:true}).inputValue(),people[0]);
 await picker.getByLabel('搜索批准对象',{exact:true}).fill('分页人物 104');await picker.getByRole('button',{name:'搜索',exact:true}).click();await picker.getByText('共 1 条',{exact:false}).waitFor();assert.equal(await form.getByLabel('批准对象',{exact:true}).inputValue(),people[0]);await form.getByLabel('批准对象',{exact:true}).selectOption(people[104]);
 await form.getByRole('button',{name:'取消',exact:true}).click();record('export-object-final-page-search-and-selection');
 stage='cross-page permissions produce complete export';
 const grants=page.locator('section').filter({has:page.getByRole('heading',{name:'可用导出许可',exact:true})});
 const first=(await(await page.context().request.get(base+'/api/v1/use-permissions?page=1&pageSize=20')).json()).items[0];
 await grants.getByLabel('选择导出许可 '+first.id,{exact:true}).check();
 for(let n=2;n<=6;n++){await grants.getByRole('button',{name:'下一页',exact:true}).click();await grants.getByText('第 '+n+' 页',{exact:false}).waitFor();}
 const last=(await(await page.context().request.get(base+'/api/v1/use-permissions?page=6&pageSize=20')).json()).items.at(-1);await grants.getByLabel('选择导出许可 '+last.id,{exact:true}).check();await grants.getByText('已选 2 个许可',{exact:true}).waitFor();
 const response=page.waitForResponse(r=>r.url().endsWith('/api/v1/exports')&&r.request().method()==='POST');await page.getByRole('button',{name:'生成内部 JSON',exact:true}).click();const exported=await response;assert.equal(exported.status(),202);const input=exported.request().postDataJSON();assert.deepEqual(new Set(input.usePermissionRefs),new Set([first.id,last.id]));assert.deepEqual(new Set(input.selectedIds.people),new Set([first.subjectId,last.subjectId]));
 const job=await db.exportJob.findUniqueOrThrow({where:{id:(await exported.json()).resourceId}});assert.deepEqual(new Set(job.usePermissionRefs),new Set([first.id,last.id]));record('cross-page-permissions-all-submitted-and-validated');
 stage='deletion last page remains selected for preview';await navigate('删除任务');const deletion=page.getByRole('group',{name:'删除目标选择器',exact:true});
 for(let n=2;n<=6;n++){await deletion.getByRole('button',{name:'下一页',exact:true}).click();await deletion.getByText('第 '+n+' 页',{exact:false}).waitFor();}
 await page.getByLabel('删除目标',{exact:true}).selectOption(people[0]);await deletion.getByRole('button',{name:'上一页',exact:true}).click();await deletion.getByText('第 5 页',{exact:false}).waitFor();assert.equal(await page.getByLabel('删除目标',{exact:true}).inputValue(),people[0]);
 const preview=await writeUI(page,'/deletion-requests/preview',()=>page.getByRole('button',{name:'预览影响',exact:true}).click());assert.equal(preview.target.id,people[0]);record('deletion-final-page-current-preview');
 assert.deepEqual(errors,[]);await page.screenshot({path:join(evidence,'maintenance-pagination.png'),fullPage:true});writeFileSync(join(evidence,'maintenance-browser.json'),JSON.stringify({head:process.env.ONCE_ACCEPTANCE_SHA,status:'BROWSER_TESTED',checks,records:105,providerVerified:'NOT_RUN'},null,2)+'\n');
} catch(error) {console.error('Maintenance pagination stage:',stage);throw error;}
finally {try{await browserOwner?.close();}finally{try{await stop(api);}finally{try{await db.$disconnect();}finally{temp.cleanup();}}}}
