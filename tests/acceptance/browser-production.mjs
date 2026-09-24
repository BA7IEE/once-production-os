/** WP1 real Works/Projects/Chromium acceptance. Only an empty disposable loopback test DB.
 * Never reads a .env target, resets a DB, or sends requests to a production host. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';
import sharp from 'sharp';
const raw = process.env.DATABASE_URL_TEST;
assert.equal(process.env.ALLOW_BROWSER_TESTS, 'yes'); assert.ok(raw);
const url = new URL(raw);
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
assert.match(url.pathname, /^\/once_test_[a-z0-9_]+$/);
assert.ok(url.username && url.password && !url.search && !url.hash);
const prisma = new PrismaClient({ datasources: { db: { url: raw } }, log: [] });
const tmp = mkdtempSync(join(tmpdir(), 'once-works-projects-'));
const password = 'Synthetic-' + randomBytes(20).toString('base64url') + '!';
const put = (name, text) => { const path = join(tmp, name); writeFileSync(path, text, { mode: 0o600 }); return path; };
const env = { ...process.env, DATABASE_URL: raw, APP_ENV: 'test', ACCESS_MODE: 'INTERNAL', COOKIE_SECURE: 'false', HOST: '127.0.0.1',
    CONTACT_KEY_FILE: put('contact.hex', randomBytes(32).toString('hex')), CSRF_KEY_FILE: put('csrf.hex', randomBytes(32).toString('hex')),
    RECOVERY_EPOCH_FILE: put('recovery.epoch', randomBytes(24).toString('hex')), BOOTSTRAP_LOGIN: 'owner', BOOTSTRAP_NAME: 'WP1合成管理员',
    BOOTSTRAP_PASSWORD_FILE: put('bootstrap.password', password) };
env.MEDIA_PROVIDER='local';env.MEDIA_ROOT=join(tmp,'private-images');
let api, worker, browser, base;
function run(command, args) { const r = spawnSync(command, args, { env, encoding: 'utf8', timeout: 120000 }); assert.equal(r.status, 0, command + ' failed: ' + (r.stderr ?? '').slice(-800)); }
async function stop(child) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise(resolve => {
        const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000);
        child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill('SIGINT');
    });
}
async function until(check) { const end = Date.now() + 30000; while (Date.now() < end) { try { if (await check()) return; } catch {} await new Promise(r => setTimeout(r, 100)); } throw new Error('M1 service readiness timeout'); }
async function login(page, loginName) {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('input[autocomplete=username]').fill(loginName);
    await page.locator('input[autocomplete=current-password]').fill(password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByRole('button', { name: /概览/ }).waitFor();
}
async function cmd(page, method, path, data, expected = 200) {
    const me = await page.context().request.get(base + '/api/v1/me'); assert.equal(me.status(), 200);
    const response = await page.context().request.fetch(base + '/api/v1' + path, { method, data,
        headers: { Origin: base, 'X-CSRF-Token': (await me.json()).csrfToken, 'Idempotency-Key': randomUUID() } });
    assert.equal(response.status(), expected, method + ' ' + path); return response.json();
}
const getStatus = async (page, path) => (await page.context().request.get(base + '/api/v1' + path)).status();
const errors=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
async function json(page,path){const r=await page.context().request.get(base+'/api/v1'+path);assert.equal(r.status(),200,path);return r.json();}
async function binary(page,id,bytes){const me=await json(page,'/me');return page.context().request.put(base+'/api/v1/uploads/'+id+'/content',{data:bytes,headers:{Origin:base,'X-CSRF-Token':me.csrfToken,'Content-Type':'application/octet-stream','Content-Length':String(bytes.length)}});}
async function prepare(page,person,bytes,name='synthetic.png'){
 const source=await prisma.sourceRecord.findUniqueOrThrow({where:{id:person.sourceId}});
 return cmd(page,'POST','/uploads',{sourceId:source.id,personId:person.id,expectedSourceRevision:source.revision,fileName:name,mime:'image/png',expectedBytes:bytes.length,sha256:hash(bytes)},201);
}
async function queue(page,id){const u=await json(page,'/uploads/'+id);return cmd(page,'POST','/uploads/'+id+'/complete',{expectedRevision:u.revision},202);}

async function writeUI(page, method, path, action, status=200) {
 const waited=page.waitForResponse(r=>r.url().endsWith('/api/v1'+path)&&r.request().method()===method);
 await action();const response=await waited;assert.equal(response.status(),status,method+' '+path+': '+await response.text());return response.json();
}
async function dialogReady(page,title){const d=page.getByRole('dialog',{name:title,exact:true});await d.waitFor();return d;}
async function reloadDetail(page,title){const d=await dialogReady(page,title);const r=page.waitForResponse(r=>r.request().method()==='GET'&&/\/api\/v1\/(works|projects)\/[^/]+$/.test(r.url()));await d.getByRole('button',{name:'刷新详情',exact:true}).click();assert.equal((await r).status(),200);await d.getByRole('heading',{name:title,exact:true}).waitFor();return d;}
try {
 const tables=await prisma.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
 assert.equal(tables.length,0,'WP1 requires a new empty database. Never clear existing user data.');run('pnpm',['db:deploy']);
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));env.PORT=String(server.address().port);await new Promise(r=>server.close(r));
 base='http://127.0.0.1:'+env.PORT;env.APP_ORIGIN=base;run('node',['dist/apps/api/src/bootstrap.js']);
 api=spawn('node',['dist/apps/api/src/main.js'],{env,stdio:['ignore','pipe','pipe']});api.stdout.resume();api.stderr.resume();await until(async()=>(await fetch(base+'/health/ready')).status===200);
 browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
 const owner=await browser.newPage(),editor=await browser.newPage();for(const p of[owner,editor])p.on('pageerror',e=>errors.push(e.message));await login(owner,'owner');
 await cmd(owner,'POST','/catalog/items',{namespace:'industry',code:'furniture',labelZh:'家具',labelEn:'Furniture'},201);
 await cmd(owner,'POST','/catalog/items',{namespace:'workType',code:'product_photo',labelZh:'产品摄影',labelEn:'Product photography'},201);
 await owner.reload({waitUntil:'networkidle'});await owner.getByRole('button',{name:/概览/}).waitFor();
 const added=await cmd(owner,'POST','/memberships',{loginName:'wp_editor',displayName:'WP1合成编辑',role:'EDITOR',extraPermissions:[]},201);
 await editor.goto(base+'/activate',{waitUntil:'networkidle'});await editor.getByLabel('激活凭证').fill(added.activationToken);await editor.getByLabel('设置密码（至少 12 个字符）').fill(password);await editor.getByRole('button',{name:'激活账号',exact:true}).click();await editor.getByText('账号已激活').waitFor();await login(editor,'wp_editor');
 const source=title=>({title,type:'MANUAL',providerClaim:'WP1合成记录',basisMode:'INTERNAL_USE',basisDescription:'隔离自动化测试资料，不代表真实授权',validUntil:new Date(Date.now()+86400000*7).toISOString()});
 const ws=(await cmd(owner,'POST','/sources',source('WP1作品来源'),201)).resourceId;
 const ps=(await cmd(owner,'POST','/sources',source('WP1项目来源'),201)).resourceId;
 const personReceipt=await cmd(owner,'POST','/people',{displayName:'WP1摄影剪辑人员',roles:['photographer','editor'],inlineSource:source('WP1人员来源')},201),pid=personReceipt.resourceId;
 const imagePersonId=(await cmd(owner,'POST','/people',{displayName:'WP1图片来源人物',roles:['model'],inlineSource:source('WP1独立图片来源')},201)).resourceId;
 const imagePerson=await prisma.person.findUniqueOrThrow({where:{id:imagePersonId}});
 worker=spawn('node',['dist/apps/api/src/worker-main.js'],{env,stdio:['ignore','pipe','pipe']});worker.stdout.resume();worker.stderr.resume();
 const assetIds=[];
 for(let i=0;i<2;i++){
  const bytes=await sharp({create:{width:64+i*16,height:48,channels:3,background:i===0?'#345678':'#987654'}}).png().toBuffer();
  const upload=await prepare(owner,imagePerson,bytes,'WP1-image-'+i+'.png');assert.equal((await binary(owner,upload.resourceId,bytes)).status(),200);await queue(owner,upload.resourceId);
  await until(async()=>await prisma.mediaAsset.count({where:{id:upload.resourceId,state:'READY'}})===1);assetIds.push(upload.resourceId);
 }
 await owner.getByRole('button',{name:/作品库/}).click();await owner.getByRole('button',{name:'新增作品',exact:true}).click();let d=await dialogReady(owner,'新增作品');
 await d.getByLabel('作品标题',{exact:true}).fill('WP1外部家具作品');await d.getByLabel('作品说明',{exact:true}).fill('合成家具商业摄影作品，非ONCE制作');await d.getByLabel('行业',{exact:true}).selectOption('furniture');await d.getByLabel('产品摄影',{exact:true}).check();await d.getByLabel('制作归属',{exact:true}).selectOption('EXTERNAL');
 await d.getByRole('button',{name:'WP1作品来源',exact:true}).click();
 const wr=await writeUI(owner,'POST','/works',()=>d.getByRole('button',{name:'保存作品',exact:true}).click(),201),wid=wr.resourceId,wpath='/works/'+wid;
 const workFacts=await prisma.work.findUniqueOrThrow({where:{id:wid}});assert.equal(workFacts.industryCode,'furniture');assert.deepEqual(workFacts.workTypeCodes,['product_photo']);
 await owner.getByRole('heading',{name:'作品图片',exact:true}).waitFor();
 for(let i=0;i<2;i++){
  d=await dialogReady(owner,'WP1外部家具作品');await d.getByRole('button',{name:'添加已有图片',exact:true}).click();const f=await dialogReady(owner,'添加作品图片');
  await f.getByRole('button',{name:'WP1-image-'+i+'.png',exact:true}).click();await writeUI(owner,'POST',wpath+'/assets',()=>f.getByRole('button',{name:'保存关系',exact:true}).click());await owner.getByRole('heading',{name:'作品图片',exact:true}).waitFor();
 }
 d=await dialogReady(owner,'WP1外部家具作品');let dbItems=await prisma.workAsset.findMany({where:{workId:wid},orderBy:{position:'asc'}});
 let card=d.locator('[data-work-entry="'+dbItems[1].id+'"]');await writeUI(owner,'POST',wpath+'/assets/reorder',()=>card.getByRole('button',{name:'上移',exact:true}).click());
 await until(async()=>await d.locator('[data-work-entry]').first().getAttribute('data-work-entry')===dbItems[1].id);
 card=d.locator('[data-work-entry="'+dbItems[1].id+'"]');await writeUI(owner,'POST',wpath+'/assets/reorder',()=>card.getByRole('button',{name:'设为封面',exact:true}).click());
 await until(async()=>await d.locator('[data-work-entry="'+dbItems[1].id+'"] small').innerText()==='封面');
 assert.equal((await prisma.work.findUniqueOrThrow({where:{id:wid}})).coverEntryId,dbItems[1].id);
 assert.equal((await prisma.workAsset.findMany({where:{workId:wid},orderBy:{position:'asc'}}))[0].assetId,assetIds[1]);
 const firstImage=d.locator('img').first();await until(()=>firstImage.evaluate(el=>el.complete&&el.naturalWidth>0));
 // The initial credit commits but its HTTP response is intentionally lost. The retry must be identical.
 await d.getByRole('button',{name:'添加署名',exact:true}).click();let f=await dialogReady(owner,'添加作品署名');await f.getByRole('button',{name:'WP1摄影剪辑人员',exact:true}).click();await f.getByLabel('贡献角色',{exact:true}).selectOption('photographer');await f.getByLabel('贡献说明').fill('合成摄影执行贡献');
 const requests=[],pattern='**/api/v1/works/'+wid+'/credits';const observe=r=>{if(r.url().endsWith(wpath+'/credits'))requests.push({key:r.headers()['idempotency-key'],body:r.postData()});};owner.on('request',observe);
 await owner.route(pattern,async route=>{const response=await route.fetch();assert.equal(response.status(),200);await route.abort('failed');});
 await f.getByRole('button',{name:'保存关系',exact:true}).click();await f.getByRole('alert').waitFor();assert.equal(await f.getByLabel('贡献角色',{exact:true}).isDisabled(),true);
 assert.equal(await prisma.workCredit.count({where:{workId:wid}}),1);await owner.unroute(pattern);
 const reconciled=await writeUI(owner,'POST',wpath+'/credits',()=>f.getByRole('button',{name:'核对上次提交',exact:true}).click());assert.equal(reconciled.replayed,true);assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);assert.equal(await prisma.commandReceipt.count({where:{commandKey:requests[0].key,operation:'work.creditAdd'}}),1);
 await owner.getByRole('heading',{name:'作品图片',exact:true}).waitFor();d=await dialogReady(owner,'WP1外部家具作品');
 await d.getByRole('button',{name:'添加署名',exact:true}).click();f=await dialogReady(owner,'添加作品署名');await f.getByRole('button',{name:'WP1摄影剪辑人员',exact:true}).click();await f.getByLabel('贡献角色',{exact:true}).selectOption('editor');await f.getByLabel('贡献说明').fill('合成后期剪辑贡献');await writeUI(owner,'POST',wpath+'/credits',()=>f.getByRole('button',{name:'保存关系',exact:true}).click());await owner.getByRole('heading',{name:'作品图片',exact:true}).waitFor();
 assert.equal(await prisma.workCredit.count({where:{workId:wid,personId:pid}}),2);assert.equal((await json(owner,'/people/'+pid+'/production')).actualProjectCount,0);
 d=await dialogReady(owner,'WP1外部家具作品');await writeUI(owner,'PATCH',wpath,()=>d.getByRole('button',{name:'标记使用中',exact:true}).click());await until(async()=>(await prisma.work.findUniqueOrThrow({where:{id:wid}})).status==='ACTIVE');
 await d.getByRole('button',{name:'关闭',exact:true}).last().click();
 console.log('PASS WP1 browser: real images grouped and reordered with same-work cover; multi-role credit response-loss retry writes once');
 await owner.getByRole('button',{name:/项目库/}).click();await owner.getByRole('button',{name:'新增项目',exact:true}).click();f=await dialogReady(owner,'新增项目');await f.getByLabel('项目标题',{exact:true}).fill('WP1家具拍摄项目');await f.getByLabel('项目需求',{exact:true}).fill('合成历史项目，不依赖报价合同');await f.getByLabel('地点说明',{exact:true}).fill('深圳合成摄影棚');await f.getByLabel('日期说明').fill('2026年9月合成拍摄记录');await f.getByRole('button',{name:'WP1项目来源',exact:true}).click();
 const pr=await writeUI(owner,'POST','/projects',()=>f.getByRole('button',{name:'保存项目',exact:true}).click(),201),projectId=pr.resourceId,ppath='/projects/'+projectId;
 await owner.getByRole('heading',{name:'项目人员',exact:true}).waitFor();d=await dialogReady(owner,'WP1家具拍摄项目');await d.getByRole('button',{name:'添加项目人员',exact:true}).click();f=await dialogReady(owner,'添加项目人员');await f.getByRole('button',{name:'WP1摄影剪辑人员',exact:true}).click();await f.getByLabel('贡献角色',{exact:true}).selectOption('photographer');await writeUI(owner,'POST',ppath+'/participants',()=>f.getByRole('button',{name:'保存关系',exact:true}).click());await owner.getByRole('heading',{name:'项目人员',exact:true}).waitFor();
 assert.equal((await json(owner,'/people/'+pid+'/production')).actualProjectCount,0);
 for(const state of ['CONFIRMED','ACTUAL']){d=await dialogReady(owner,'WP1家具拍摄项目');await d.getByRole('button',{name:'更新参与记录',exact:true}).click();f=await dialogReady(owner,'更新参与记录');await f.getByLabel('参与状态',{exact:true}).selectOption(state);await f.getByLabel('参与事实与依据').fill('合成实际拍摄工作已经完成');await writeUI(owner,'POST',ppath+'/participants/update',()=>f.getByRole('button',{name:'保存关系',exact:true}).click());await owner.getByRole('heading',{name:'项目人员',exact:true}).waitFor();assert.equal((await json(owner,'/people/'+pid+'/production')).actualProjectCount,state==='ACTUAL'?1:0);}
 d=await dialogReady(owner,'WP1家具拍摄项目');await d.getByRole('button',{name:'关联已有作品',exact:true}).click();f=await dialogReady(owner,'添加项目作品');await f.getByRole('button',{name:'WP1外部家具作品',exact:true}).click();await writeUI(owner,'POST',ppath+'/works',()=>f.getByRole('button',{name:'保存关系',exact:true}).click());await owner.getByRole('heading',{name:'项目人员',exact:true}).waitFor();
 d=await dialogReady(owner,'WP1家具拍摄项目');await writeUI(owner,'POST',ppath+'/works',()=>d.getByRole('button',{name:'改为交付',exact:true}).click());await until(async()=>(await json(owner,ppath)).works[0].relation==='DELIVERABLE');assert.equal((await prisma.work.findUniqueOrThrow({where:{id:wid}})).origin,'EXTERNAL');assert.equal(await prisma.projectParticipant.count({where:{projectId}}),1);
 await d.getByRole('button',{name:'编辑项目',exact:true}).click();f=await dialogReady(owner,'编辑项目');await f.getByLabel('内部复盘',{exact:true}).fill('合成复盘：第一次合作注意素材统一命名');await writeUI(owner,'PATCH',ppath,()=>f.getByRole('button',{name:'保存项目',exact:true}).click());await owner.getByRole('heading',{name:'项目人员',exact:true}).waitFor();d=await dialogReady(owner,'WP1家具拍摄项目');await writeUI(owner,'PATCH',ppath,()=>d.getByRole('button',{name:'标记项目完成',exact:true}).click());await until(async()=>(await prisma.project.findUniqueOrThrow({where:{id:projectId}})).status==='COMPLETED');
 await d.getByRole('button',{name:'关闭',exact:true}).last().click();

 // DEV-06: real browser internal shortlist flow. No share link/client state is created.
 await owner.getByRole('button',{name:/候选工作台/}).click();
 await owner.getByRole('button',{name:'＋ 新建清单',exact:true}).click();
 f=await dialogReady(owner,'新建内部候选清单');
 await f.getByLabel('清单标题',{exact:true}).fill('WP1内部候选清单');
 await f.getByLabel('需求简述',{exact:true}).fill('合成内部选人需求，不是客户确认或预订');
 const shortlistCreate=await writeUI(owner,'POST','/shortlists',()=>f.getByRole('button',{name:'建立清单',exact:true}).click(),201),shortlistId=shortlistCreate.resourceId,slpath='/shortlists/'+shortlistId;
 await owner.getByRole('heading',{name:'WP1内部候选清单',exact:true}).waitFor();
 await owner.getByLabel('档案状态',{exact:true}).selectOption('DRAFT');
 await owner.getByLabel('行业',{exact:true}).selectOption('furniture');
 await owner.getByLabel('作品类型',{exact:true}).selectOption('product_photo');
 await owner.getByLabel('搜索人才姓名或别名',{exact:true}).fill('WP1摄影剪辑人员');
 await owner.getByRole('button',{name:'搜索姓名',exact:true}).click();
 const candidateCard=owner.locator('article.person-card').filter({has:owner.getByRole('heading',{name:'WP1摄影剪辑人员',exact:true})});
 await candidateCard.getByRole('button',{name:'加入当前清单',exact:true}).click();
 f=await dialogReady(owner,'加入候选 · WP1摄影剪辑人员');
 await f.getByLabel('关联署名作品（可选）',{exact:true}).selectOption(wid);
 await f.getByAltText(/WP1-image-/).first().waitFor();
 await f.getByAltText(/WP1-image-/).first().locator('..').click();
 await f.getByLabel('内部协作备注',{exact:true}).fill('PRIVATE_BROWSER_SHORTLIST_NOTE');
 await writeUI(owner,'POST',slpath+'/items',()=>f.getByRole('button',{name:'加入当前清单',exact:true}).click());
 await owner.getByRole('heading',{name:'WP1内部候选清单',exact:true}).waitFor();
 await owner.getByText('WP1摄影剪辑人员',{exact:true}).last().waitFor();
 await owner.getByText('PRIVATE_BROWSER_SHORTLIST_NOTE',{exact:true}).waitFor();
 assert.equal(await prisma.shortlistItem.count({where:{shortlistId}}),1);
 assert.equal(await prisma.shortlistItemAsset.count({where:{itemId:(await prisma.shortlistItem.findFirstOrThrow({where:{shortlistId}})).id}}),1);
 assert.equal(await owner.getByRole('button',{name:/分享|预订|客户确认/}).count(),0);
 console.log('PASS DEV-06 browser: industry/work-type search -> internal shortlist -> credited work -> selected image -> collaboration note');

 await owner.getByRole('button',{name:/人才档案/}).click();await owner.getByRole('button').filter({has:owner.getByRole('heading',{name:'WP1摄影剪辑人员',exact:true})}).click();await owner.getByRole('heading',{name:'作品与项目经历',exact:true}).waitFor();await owner.getByText('当前可见的实际参与项目：1 个。',{exact:false}).waitFor();await owner.getByRole('button',{name:/WP1外部家具作品 ·/}).click();await owner.getByRole('heading',{name:'作品图片',exact:true}).waitFor();
 console.log('PASS WP1 browser/API/PG: nominated and confirmed are not actual; reference/delivery preserves EXTERNAL attribution; internal review and reverse talent links persist');
 // A source may be suspended independently of the Work. Its assets must not leak in a reused collection.
 const s=await prisma.sourceRecord.findUniqueOrThrow({where:{id:imagePerson.sourceId}});await cmd(owner,'POST','/sources/'+s.id+'/suspend',{expectedRevision:s.revision,reason:'合成停止图片使用'});
 const w=await json(owner,wpath);assert.equal(w.items.length,2);assert.ok(w.items.every(x=>x.asset===null));for(const aid of assetIds){assert.ok(!JSON.stringify(w).includes(aid));assert.equal(await getStatus(owner,'/assets/'+aid+'/preview'),404);}
 d=await reloadDetail(owner,'WP1外部家具作品');await until(async()=>await d.locator('img').count()===0);assert.equal(await d.getByText('该图片当前不可用',{exact:true}).count(),2);
 await d.getByRole('button',{name:'关闭',exact:true}).last().click();
 const personDialog=await dialogReady(owner,'WP1摄影剪辑人员');
 await personDialog.getByRole('button',{name:'关闭',exact:true}).last().click();
 await owner.getByRole('button',{name:/候选工作台/}).click();
 await owner.getByRole('heading',{name:'WP1内部候选清单',exact:true}).waitFor();
 const shortlistPanel=owner.locator('.sl-detail');
 await shortlistPanel.getByText('该条目当前不可用',{exact:true}).waitFor();
 assert.equal(await shortlistPanel.getByText('PRIVATE_BROWSER_SHORTLIST_NOTE',{exact:true}).count(),0);
 assert.equal(await shortlistPanel.getByText('WP1摄影剪辑人员',{exact:true}).count(),0);
 console.log('PASS DEV-06 privacy: selected image source loss redacts the entire shortlist item in the browser');
 await owner.getByRole('button',{name:/作品库/}).click();
 await owner.getByRole('button').filter({has:owner.getByRole('heading',{name:'WP1外部家具作品',exact:true})}).click();
 d=await dialogReady(owner,'WP1外部家具作品');
 const current=await json(owner,wpath);await cmd(owner,'POST',wpath+'/assets/remove',{expectedRevision:current.revision,entryId:current.items[0].id});assert.equal(await prisma.mediaAsset.count({where:{id:{in:assetIds}}}),2);
 const privateWork=await cmd(editor,'POST','/works',{title:'WP1私有作品不可枚举',inlineSource:{title:'WP1私人记录',type:'MANUAL',providerClaim:'合成编辑',basisMode:'TEMP_ORGANIZE',basisDescription:'仅供本人内部整理的合成记录'}},201);
 assert.equal(await getStatus(owner,'/works/'+privateWork.resourceId),404);assert.ok(!(await json(owner,'/works')).items.some(x=>x.id===privateWork.resourceId));assert.ok(!(await json(owner,'/audit-events')).items.some(x=>x.resourceId===privateWork.resourceId));
 const before=await prisma.project.findUniqueOrThrow({where:{id:projectId}}),foreignEntry=(await prisma.workCredit.findFirstOrThrow({where:{workId:wid}})).id;
 await cmd(owner,'POST',ppath+'/participants/remove',{expectedRevision:before.revision,entryId:foreignEntry},404);assert.deepEqual(await prisma.project.findUniqueOrThrow({where:{id:projectId}}),before);
 assert.deepEqual(errors,[]);
 console.log('PASS WP1 privacy: suspended dependencies redact identities/previews; private roots and audits stay hidden; wrong-parent command writes nothing');
} finally {if(browser)await browser.close();await stop(worker);await stop(api);await prisma.$disconnect();rmSync(tmp,{recursive:true,force:true});}
