/** Test-only approved adapter, real PostgreSQL + application + built UI. No paid HTTP. */
import assert from 'node:assert/strict';
import express from 'express';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Application} from '../../dist/packages/core/src/api.js';
import {PrismaStore} from '../../dist/apps/api/src/prisma-store.js';
import {Client} from '../support/fixtures.ts';
import {installedModelClient} from '../../dist/apps/api/src/ai/installed-client.js';
import {AiWorker} from '../../dist/apps/api/src/ai/worker.js';
import {aiBusinessFixture} from '../support/ai-business.ts';
export async function verifyAiBrowser({prisma,browser,env,password,storeOverride}){
 const store=storeOverride??new PrismaStore(prisma),config={origin:'http://127.0.0.1',secureCookies:false,contactKey:Buffer.from(readFileSync(env.CONTACT_KEY_FILE,'utf8').trim(),'hex'),csrfKey:Buffer.from(readFileSync(env.CSRF_KEY_FILE,'utf8').trim(),'hex'),recoveryEpoch:readFileSync(env.RECOVERY_EPOCH_FILE,'utf8').trim(),accessMode:'INTERNAL',environment:'test',dataEgressMode:'INTERNAL_APPROVED',dataCleanupMode:'INTERNAL_APPROVED',dataMergeMode:'INTERNAL_APPROVED'};
 const core=new Application(store,config),server=express();server.use('/api/v1',express.raw({type:()=>true,limit:'1mb'}),async(req,res)=>{const response=await core.handle({method:req.method,url:req.originalUrl,headers:req.headers,body:Buffer.isBuffer(req.body)?req.body.toString('utf8'):'',ip:'127.0.0.1'});res.status(response.status).set(response.headers);if(response.cookies.length)res.setHeader('Set-Cookie',response.cookies);res.json(response.body);});server.use(express.static(resolve('dist/web')));
 const listener=await new Promise(resolve=>{const s=server.listen(0,'127.0.0.1',()=>resolve(s));});config.origin='http://127.0.0.1:'+listener.address().port;
 const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  const owner=new Client(core);assert.equal((await owner.login('owner',password)).status,200);const t=await aiBusinessFixture({app:core,store,owner});
  await page.goto(config.origin);await page.getByLabel('登录名').fill('owner');await page.locator('input[autocomplete=current-password]').fill(password);await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('button',{name:/AI 辅助整理/}).click();
  async function create(type){await page.getByRole('button',{name:'新建 AI 任务',exact:true}).click();const form=page.getByRole('dialog',{name:'确认本次 AI 输入',exact:true});await form.getByLabel('任务类型',{exact:true}).selectOption(type);return form;}
  async function submit(form){await form.getByLabel('我已检查，仅包含本次任务必要、允许外送的文字',{exact:true}).check();await form.getByRole('button',{name:'预览实际输入',exact:true}).click();await form.getByRole('heading',{name:'实际发送内容',exact:true}).waitFor();const response=page.waitForResponse(r=>r.url().endsWith('/api/v1/ai-jobs')&&r.request().method()==='POST');await form.getByRole('button',{name:'确认并创建任务',exact:true}).click();const r=await response;assert.equal(r.status(),202);return(await r.json()).resourceId;}
  let form=await create('parse_search');await form.getByLabel('检索句',{exact:true}).fill('Find the synthetic artist');let id=await submit(form);
  await t.dispatch(id,[{field:'filters',value:{q:'Original artist'},evidence:[]}]);let detail=page.getByRole('dialog',{name:'审阅 AI 建议',exact:true});await detail.getByRole('button',{name:'刷新任务结果',exact:true}).click();await detail.getByLabel('检索条件',{exact:true}).check();await detail.getByRole('button',{name:'确认采纳所选字段',exact:true}).click();await detail.getByRole('button',{name:'查看符合条件的人才',exact:true}).click();await detail.getByText('Original artist',{exact:true}).waitFor();await detail.getByRole('button',{name:'返回任务列表',exact:true}).click();
  form=await create('extract_profile');await form.getByLabel('目标资料',{exact:true}).selectOption(t.person);await form.getByLabel('已批准的文字来源',{exact:true}).selectOption(t.grant);await form.getByRole('heading',{name:'本人主动提供的测试资料',exact:true}).waitFor();await form.getByLabel('本次使用的原文',{exact:true}).fill(t.text);id=await submit(form);
  await t.dispatch(id,[{field:'displayName',value:'Unselected name',evidence:t.evidence},{field:'intro',value:'Reviewed AI introduction',evidence:t.evidence}]);detail=page.getByRole('dialog',{name:'审阅 AI 建议',exact:true});await detail.getByRole('button',{name:'刷新任务结果',exact:true}).click();await detail.getByLabel('简介',{exact:true}).check();
  const path='**/api/v1/proposals/'+id+'/apply';await page.route(path,async route=>{await route.fetch();await route.abort('failed');});await detail.getByRole('button',{name:'确认采纳所选字段',exact:true}).click();await detail.getByText('操作结果未知，请原样重试同一操作。',{exact:true}).waitFor();await page.unroute(path);await detail.getByRole('button',{name:'原样重试采纳',exact:true}).click();await detail.getByText('提取人物资料 · 已采纳',{exact:true}).waitFor();
  const person=await prisma.person.findUniqueOrThrow({where:{id:t.person}});assert.equal(person.displayName,'Original artist');assert.equal(person.intro,'Reviewed AI introduction');assert.equal(person.revision,2);const evidence=await prisma.fieldEvidence.findMany({where:{personId:t.person,fieldPath:'intro'}});assert.ok(evidence.length>0);assert.ok(evidence.every(e=>!e.reviewedAt&&!e.reviewerId));
  await detail.getByRole('button',{name:'返回任务列表',exact:true}).click();
  await page.getByRole('button',{name:'配置与费用核对',exact:true}).click();
  let ops=page.getByRole('dialog',{name:'AI 配置与费用核对',exact:true});await ops.getByLabel('我已核对模型连接及调用限额',{exact:true}).check();await ops.getByRole('button',{name:'停用当前配置',exact:true}).click();await ops.getByText('配置版本 1 · 未启用',{exact:true}).waitFor();await ops.getByLabel('我已核对模型连接及调用限额',{exact:true}).check();await ops.getByRole('button',{name:'批准当前配置',exact:true}).click();await ops.getByText('配置版本 1 · 已批准启用',{exact:true}).waitFor();await ops.getByRole('button',{name:'返回',exact:true}).click();
  id=await t.create({taskType:'parse_search',subjectKind:'NONE',subjectId:null,expectedRevision:null,locale:null,sources:[],queryText:'Find artist',confirmMinimizedInput:true});await new AiWorker(core,{providerIdentityHash:config.ai.providerIdentityHash,send:async()=>{throw new Error('Synthetic unknown response');}}).cycle(new AbortController().signal);
  const attempt=await store.transaction(async tx=>{const task=await tx.get('aiTasks',id);return(await tx.find('aiAttempts',{runId:task.runId}))[0];});
  await page.getByRole('button',{name:'配置与费用核对',exact:true}).click();ops=page.getByRole('dialog',{name:'AI 配置与费用核对',exact:true});await ops.getByLabel('待核对请求',{exact:true}).selectOption(attempt.id);let evidencePage=1;for(;;){const listing=(await owner.raw('GET','/sources?page='+evidencePage+'&pageSize=20')).body;if(listing.items.some(s=>s.id===t.source))break;assert.ok(evidencePage*20<listing.total);const loaded=page.waitForResponse(r=>r.url().includes('/api/v1/sources?')&&r.url().includes('page='+String(evidencePage+1)+'&'));await ops.getByRole('button',{name:'下一页',exact:true}).click();await loaded;evidencePage++;await ops.locator('.pager small').getByText('第 '+evidencePage+' 页',{exact:false}).waitFor();}await ops.getByLabel('供应商核对证据',{exact:true}).selectOption(t.source);await ops.getByLabel('核对结果',{exact:true}).selectOption('SUCCEEDED');await ops.getByLabel('已确认费用（配置最小单位）',{exact:true}).fill('70');await ops.getByLabel('证据对应所选供应商和原请求编号，金额已经人工核对',{exact:true}).check();
  const reconciliation='**/api/v1/ai-attempts/'+attempt.id+'/reconcile';await page.route(reconciliation,async route=>{await route.fetch();await route.abort('failed');});await ops.getByRole('button',{name:'确认核对并关闭旧任务',exact:true}).click();await ops.getByText('结果未知，请保持本次内容并原样重试。',{exact:true}).waitFor();await page.unroute(reconciliation);await ops.getByRole('button',{name:'原样重试核对操作',exact:true}).click();await ops.getByRole('button',{name:'确认费用后解除冻结',exact:true}).waitFor();page.once('dialog',dialog=>dialog.accept());await ops.getByRole('button',{name:'确认费用后解除冻结',exact:true}).click();await ops.getByRole('button',{name:'确认费用后解除冻结',exact:true}).waitFor({state:'detached'});
  const run=await store.transaction(async tx=>tx.get('aiRuns',attempt.runId));assert.equal(run.state,'CANCELLED');assert.equal(run.settledUnits,70);assert.equal((await store.transaction(tx=>tx.find('aiBudgetReleases'))).length,1);
  await ops.getByLabel('连接名称',{exact:true}).fill('Browser synthetic model');
  await ops.getByLabel('API 地址',{exact:true}).fill('https://models.example.test/v1');
  await ops.getByLabel('模型名称',{exact:true}).fill('synthetic-model');
  await ops.getByLabel('密钥',{exact:true}).fill('synthetic-browser-key');
  await page.route('**/api/v1/ai-connection',async route=>{if(route.request().method()==='POST'){await route.fetch();await route.abort('failed');}else await route.continue();});
  await ops.getByRole('button',{name:'保存模型连接',exact:true}).click();
  await ops.getByRole('button',{name:'原样重试本次操作',exact:true}).waitFor();
  assert.equal(await ops.getByRole('button',{name:'返回',exact:true}).isDisabled(),true);
  await page.unroute('**/api/v1/ai-connection');
  await ops.getByRole('button',{name:'原样重试本次操作',exact:true}).click();
  await ops.getByText('配置版本 2 · 未启用',{exact:true}).waitFor();
  assert.equal(await ops.getByLabel('密钥（留空保留现有密钥）',{exact:true}).inputValue(),'');
  const connection=(await owner.raw('GET','/ai-connection')).body;assert.ok(!JSON.stringify(connection).includes('synthetic-browser-key'));
  await ops.getByRole('button',{name:'测试已保存的连接',exact:true}).click();
  await ops.getByText('最近测试（配置版本 2）：等待后台执行。',{exact:true}).waitFor();
  let requests=0;const mockFetch=async()=>{requests++;return Response.json({id:'synthetic-browser-response',choices:[{index:0,message:{role:'assistant',content:'{"changes":[],"unknowns":[]}'},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}});};
  await new AiWorker(core,workspaceId=>installedModelClient(core,workspaceId,mockFetch)).cycle(new AbortController().signal);
  assert.equal(requests,1);
  await ops.getByRole('button',{name:'刷新测试结果',exact:true}).click();
  await ops.getByText('最近测试（配置版本 2）：接口已返回有效测试结果。',{exact:true}).waitFor();
  await ops.getByLabel('我已核对模型连接及调用限额',{exact:true}).check();await ops.getByRole('button',{name:'批准当前配置',exact:true}).click();await ops.getByText('配置版本 2 · 已批准启用',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);console.log('PASS AI browser ('+(storeOverride?'test MemoryStore':'real PostgreSQL')+'): confirmed input, restricted search, selected proposal fields and unknown response replay; configuration approval, human reconciliation and unfreeze; encrypted connection save/replay, fixed-input SDK test and enable; simulated provider only');
 }finally{await context.close();await new Promise(resolve=>listener.close(resolve));}
}
