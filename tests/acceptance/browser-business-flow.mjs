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
const evidence='artifacts/business-flow';mkdirSync(evidence,{recursive:true});
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
try{
 assert.equal((await db.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public'")).length,0,'Require owned empty database, no reset');
 stage='migration';await run('pnpm',['db:deploy'],{env,capture:true});
 const port=createServer();await new Promise(r=>port.listen(0,'127.0.0.1',r));env.PORT=String(port.address().port);await new Promise(r=>port.close(r));base='http://127.0.0.1:'+env.PORT;env.APP_ORIGIN=base;
 stage='bootstrap';await run(process.execPath,['dist/apps/api/src/bootstrap.js'],{env,capture:true});
 api=spawn(process.execPath,['dist/apps/api/src/main.js'],{env,stdio:'ignore'});worker=spawn(process.execPath,['dist/apps/api/src/worker-main.js'],{env,stdio:'ignore'});
 await poll(async()=>{try{return (await fetch(base+'/health/ready')).status===200;}catch{return false;}},'API readiness');
 browserOwner=await registeredBrowser(chromium,{headless:true,env:{...process.env,TMPDIR:temp.path}});browser=browserOwner.browser;
 const admin=await browser.newPage();admin.setDefaultTimeout(12000);admin.on('pageerror',e=>errors.push(e.message));await login(admin,'owner');
 const editor=await member(admin,'flow_editor','EDITOR','合成编辑员'),reviewer=await member(admin,'flow_reviewer','REVIEWER','合成核验人');
 stage='private intake and bounded review';
 await editor.page.goto(base+'/workspace/people',{waitUntil:'networkidle'});await editor.page.getByRole('button',{name:/新增人才/}).click();let form=editor.page.getByRole('dialog',{name:'新增人才',exact:true});await form.getByLabel('姓名 / 艺名 *').fill('合成团队流转人才');
 const intake=await writeUI(editor.page,'/directory/talents',()=>form.getByRole('button',{name:'保存草稿',exact:true}).click());await form.waitFor({state:'detached'});const personId=intake.resourceId;
 assert.equal((await admin.context().request.get(base+'/api/v1/directory/talents/'+personId)).status(),404);
 await editor.page.getByRole('button',{name:'审核',exact:true}).click();await editor.page.getByRole('button',{name:'发起团队核验',exact:true}).click();form=editor.page.getByRole('dialog',{name:'送交核验',exact:true});
 await form.getByLabel('本人维护的人才或过期草稿').selectOption(personId);await form.getByLabel('核验人',{exact:true}).selectOption(reviewer.id);
 const workspaceScope=await db.accessScope.findFirstOrThrow({where:{mode:'WORKSPACE'}});await form.getByLabel('核验通过后的目标范围').selectOption(workspaceScope.id);
 const owner=await(await admin.context().request.get(base+'/api/v1/me')).json();await form.getByLabel('确认共享的管理员').selectOption(owner.membershipId);await form.getByLabel('本次核验截止时点（最长七天）').fill(new Date(Date.now()+2*86400000).toISOString().slice(0,16));await form.getByRole('checkbox').check();
 const task=await writeUI(editor.page,`/people/${personId}/source-reviews`,()=>form.getByRole('button',{name:'发起核验',exact:true}).click());
 await reviewer.page.goto(base+'/workspace/source-reviews',{waitUntil:'networkidle'});await reviewer.page.locator('[data-task-id="'+task.resourceId+'"]').click();let detail=reviewer.page.getByRole('region',{name:'核验处理',exact:true});assert.equal(await detail.getByRole('heading',{name:'合成团队流转人才',exact:true}).count(),0);
 await writeUI(reviewer.page,`/source-reviews/${task.resourceId}/accept`,()=>detail.getByRole('button',{name:'接受并查看本次核验材料',exact:true}).click());await detail.getByRole('heading',{name:'合成团队流转人才',exact:true}).waitFor();
 await detail.getByLabel('核验依据与允许的内部用途').fill('合成材料经过独立核对，允许团队内部人才检索');await detail.getByLabel('确认后的依据截止时点').fill(new Date(Date.now()+30*86400000).toISOString().slice(0,16));await writeUI(reviewer.page,`/source-reviews/${task.resourceId}/review`,()=>detail.getByRole('button',{name:'确认内部使用依据',exact:true}).click());
 await admin.goto(base+'/workspace/source-reviews',{waitUntil:'networkidle'});await admin.locator('[data-task-id="'+task.resourceId+'"]').click();detail=admin.getByRole('region',{name:'核验处理',exact:true});await detail.getByRole('checkbox').check();await writeUI(admin,`/source-reviews/${task.resourceId}/publish`,()=>detail.getByRole('button',{name:'确认共享到上述范围',exact:true}).click());
 const found=await search(admin,'合成团队流转人才');assert.equal(found.total,1);assert.equal(found.items[0].id,personId);await admin.locator('article.directory-card').first().waitFor();await admin.screenshot({path:join(evidence,'review-shared.png'),fullPage:true});record('default EDITOR private intake -> accepted limited review -> explicit administrator publication -> team directory');
 stage='raw source creation and editing';
 await admin.goto(base+'/workspace/sources',{waitUntil:'networkidle'});await admin.getByRole('button',{name:'新增文字来源',exact:true}).click();form=admin.getByRole('dialog',{name:'新增文字来源',exact:true});await form.getByLabel('来源标题').fill('合成原文与导入来源');await form.getByLabel('材料提供者说明').fill('合成材料提供者');await form.getByLabel('受限原始文字').fill('合成人才原文：明确职业为模特，常驻深圳。');await form.getByLabel('使用依据').selectOption('INTERNAL_USE');await form.getByLabel('依据说明').fill('合成材料已核对，允许内部检索与整理');await form.getByLabel('依据截止时点').fill(new Date(Date.now()+30*86400000).toISOString().slice(0,16));
 const source=await writeUI(admin,'/sources',()=>form.getByRole('button',{name:'保存来源',exact:true}).click());await form.waitFor({state:'detached'});const sourceId=source.resourceId;
 const row=admin.getByRole('row').filter({hasText:'合成原文与导入来源'});await row.getByRole('button',{name:'查看',exact:true}).click();await admin.getByRole('button',{name:'编辑原文',exact:true}).click();form=admin.getByRole('dialog',{name:'编辑来源原文',exact:true});await form.getByLabel('受限原始文字').fill('合成人才原文：模特，常驻深圳。补充明确收到的材料。');await writeUI(admin,`/sources/${sourceId}`,()=>form.getByRole('button',{name:'保存来源',exact:true}).click(),'PATCH');
 assert.match((await db.sourceRecord.findUniqueOrThrow({where:{id:sourceId}})).textPayload,/补充明确收到/);record('restricted raw text created and edited through the real source page; no AI call implied');
 stage='new import and searchable typed facts';
 await admin.goto(base+'/workspace/imports',{waitUntil:'networkidle'});await admin.getByText('历史任务、旧档案补齐与高级 JSON 导入',{exact:true}).click();await admin.getByLabel('本批资料来源').selectOption(sourceId);await admin.getByLabel('JSON 数据').fill(JSON.stringify([{displayName:'合成新版可检索',roles:['model'],cityCode:'shenzhen'},{displayName:'合成导入普通联系人',kind:'CONTACT',roles:[]}]));
 const batch=await writeUI(admin,'/imports/preview',()=>admin.getByRole('button',{name:'生成预览，不写入人才',exact:true}).click());await writeUI(admin,`/imports/${batch.resourceId}/commit`,()=>admin.getByRole('button',{name:'提交 2 行到后台任务',exact:true}).click());
 await poll(async()=>{const b=await db.importBatch.findUniqueOrThrow({where:{id:batch.resourceId}});return b.rows.every(r=>r.state==='IMPORTED');},'actual Worker import checkpoint');
 const imported=await search(admin,'合成新版可检索','model','shenzhen');assert.equal(imported.total,1);await admin.getByRole('button',{name:'清除条件',exact:true}).click();await admin.getByRole('button',{name:'普通联系人',exact:true}).click();await admin.getByLabel('搜索姓名或别名',{exact:true}).fill('合成导入普通联系人');const contact=await writeUI(admin,'/directory/talents/search',()=>admin.getByRole('button',{name:'搜索',exact:true}).click(),'POST',d=>d.mode==='CONTACT'&&d.q==='合成导入普通联系人');assert.equal(contact.total,1);assert.equal(contact.items[0].roles.length,0);record('V2 import real Worker checkpoint -> model/Shenzhen filters and ordinary contact without professional roles');
 stage='AI input selection and preview without execution';
 const operator=await db.membership.findUniqueOrThrow({where:{id:owner.membershipId}});
 await cmd(admin,'/memberships/'+operator.id+'/permissions',{expectedRevision:operator.revision,role:operator.role,extraPermissions:[...operator.extraPermissions,'ai.use']},'PATCH');
 // Permission changes retire the old session; exercise normal login before continuing.
 await login(admin,'owner');
 // A synthetic configuration enables the input form only. No task or connection test is sent.
 await cmd(admin,'/ai-connection',{expectedRevision:0,connection:{name:'合成配置，只测输入预览',baseURL:'https://127.0.0.1:9',protocol:'openai-chat',model:'synthetic-input-only',timeoutMs:1000,maxOutputTokens:128},apiKey:randomBytes(24).toString('hex'),currency:'USD',perTaskLimitUnits:100,dailyLimitUnits:1000});
 const operations=await(await admin.context().request.get(base+'/api/v1/ai-operations')).json();await cmd(admin,'/ai-operations/approval',{expectedRevision:0,configDigest:operations.candidate.digest,enabled:true,confirmConfiguration:true});
 const grant=await cmd(admin,'/ai-grants',{sourceId,expectedRevision:2,validUntil:new Date(Date.now()+10*86400000).toISOString(),evidenceNote:'合成输入预览测试许可，未执行任何模型调用',confirmTextOnly:true});
 await admin.goto(base+'/workspace/ai',{waitUntil:'networkidle'});await admin.getByRole('button',{name:'新建 AI 任务',exact:true}).click();form=admin.getByRole('dialog',{name:'确认本次 AI 输入',exact:true});await form.getByLabel('目标资料',{exact:true}).selectOption(imported.items[0].id);await form.getByLabel('已批准的文字来源',{exact:true}).selectOption(grant.resourceId);await form.getByLabel('本次使用的原文').fill('合成人才原文：模特，常驻深圳。');await form.getByRole('checkbox').check();
 await writeUI(admin,'/ai-jobs/preview',()=>form.getByRole('button',{name:'预览实际输入',exact:true}).click());await form.getByRole('heading',{name:'实际发送内容',exact:true}).waitFor();assert.equal(await db.aiTask.count(),0);assert.equal(await db.aiRun.count(),0);record('page-authored raw source -> separately approved grant -> real minimized AI input preview; zero AI task/run');
 stage='legacy import explicit repair';
 const legacy=await cmd(admin,'/imports/preview',{sourceId,rows:[{displayName:'合成旧导入补齐',roles:['model'],cityCode:'shenzhen'}]});await cmd(admin,`/imports/${legacy.resourceId}/commit`,{expectedRevision:1,selectedRows:[0]});await poll(async()=>{const b=await db.importBatch.findUniqueOrThrow({where:{id:legacy.resourceId}});return b.rows[0].state==='IMPORTED';},'legacy Worker');
 await admin.goto(base+'/workspace/imports',{waitUntil:'networkidle'});await admin.getByText('历史任务、旧档案补齐与高级 JSON 导入',{exact:true}).click();const job=await db.durableJob.findFirstOrThrow({where:{aggregateId:legacy.resourceId}});await admin.locator(`[data-job-id="${job.id}"]`).getByRole('button',{name:'核对专业档案补齐',exact:true}).click();form=admin.getByRole('dialog',{name:'旧导入专业档案补齐',exact:true});await form.getByRole('checkbox',{name:'选择旧导入第 1 行',exact:true}).check();await form.getByRole('checkbox',{name:/已核对所选记录/}).check();await writeUI(admin,`/imports/${legacy.resourceId}/upgrade`,()=>form.getByRole('button',{name:'补齐所选 1 行',exact:true}).click());assert.equal(await db.talentProfile.count({where:{personId:(await db.importBatch.findUniqueOrThrow({where:{id:legacy.resourceId}})).rows[0].personId}}),1);record('legacy checkpoint retained; real upgrade preview and explicit typed repair');
 stage='multiple-source atomic core form';
 const s2=(await cmd(admin,'/sources',{title:'合成职业独立来源',type:'MANUAL',providerClaim:'合成第二来源',basisMode:'INTERNAL_USE',basisDescription:'合成独立内部使用依据',validUntil:new Date(Date.now()+30*86400000).toISOString()})).resourceId;
 const p=(await cmd(admin,'/directory/talents',{schemaVersion:'once-talent-experience-v1',displayName:'合成跨来源修正',kind:'TALENT',roleCodes:['actor'],sourceId,sourceRevision:2})).resourceId;
 await cmd(admin,`/td2/people/${p}/roles`,{schemaVersion:'once-talent-v2.1.0',expectedPersonRevision:(await db.person.findUniqueOrThrow({where:{id:p}})).revision,sourceId:s2,sourceRevision:1,values:{roleCode:'model'}});
 await admin.goto(base+'/talents/'+p,{waitUntil:'networkidle'});await admin.getByRole('button',{name:'基本资料',exact:true}).click();await admin.getByRole('button',{name:'编辑个人资料',exact:true}).click();form=admin.getByRole('region',{name:'编辑个人资料',exact:true});await form.getByLabel('性别',{exact:true}).selectOption('FEMALE');await writeUI(admin,`/directory/talents/${p}`,()=>form.getByRole('button',{name:'保存本区资料',exact:true}).click(),'PATCH');await form.waitFor({state:'detached'});await admin.getByRole('button',{name:'编辑模特分类与意愿',exact:true}).click();form=admin.getByRole('region',{name:'编辑模特分类与意愿',exact:true});await form.getByLabel('从业类型',{exact:true}).selectOption('PROFESSIONAL');await writeUI(admin,`/directory/talents/${p}`,()=>form.getByRole('button',{name:'保存本区资料',exact:true}).click(),'PATCH');await form.waitFor({state:'detached'});
 assert.equal((await db.talentProfile.findFirstOrThrow({where:{personId:p}})).genderCode,'FEMALE');const role=await db.personRole.findFirstOrThrow({where:{personId:p,roleCode:'model'}});assert.equal(role.experienceCode,'PROFESSIONAL');assert.equal(role.sourceId,s2);record('section saves carry each fact source; both fields persist with original provenance');
 assert.deepEqual(errors,[]);writeFileSync(join(evidence,'browser.json'),JSON.stringify({head:process.env.ONCE_ACCEPTANCE_SHA,status:'BROWSER_TESTED',checks,providerVerified:'NOT_RUN',aiInputSelection:'BROWSER_TESTED_PREVIEW_ONLY_NO_PROVIDER_CALL',errors},null,2)+'\n');
}catch(error){writeFileSync(join(evidence,'browser-failure.json'),JSON.stringify({status:'FAIL',stage,checks,errorType:error.name},null,2)+'\n');throw error;}
finally{try{await browserOwner?.close();}finally{await stop(worker);await stop(api);await db.$disconnect();temp.cleanup();}}
