/** Test-only approved adapter, real PostgreSQL + application + built UI. No paid HTTP. */
import assert from 'node:assert/strict';
import express from 'express';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Application} from '../../dist/packages/core/src/api.js';
import {PrismaStore} from '../../dist/apps/api/src/prisma-store.js';
import {Client} from '../support/fixtures.ts';
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
  assert.deepEqual(errors,[]);console.log('PASS AI browser ('+(storeOverride?'test MemoryStore':'real PostgreSQL')+'): confirmed input, restricted search, selected proposal fields and unknown response replay; synthetic adapter only');
 }finally{await context.close();await new Promise(resolve=>listener.close(resolve));}
}
