/** WP1 real Works/Projects/Chromium acceptance. Only an empty disposable loopback test DB.
 * Never reads a .env target, resets a DB, or sends requests to a production host. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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
const env = { ...process.env, DATABASE_URL: raw, APP_ENV: 'test', ACCESS_MODE: 'INTERNAL', DATA_EGRESS_MODE: 'INTERNAL_APPROVED', DATA_CLEANUP_MODE: 'INTERNAL_APPROVED', DATA_MERGE_MODE: 'INTERNAL_APPROVED', COOKIE_SECURE: 'false', HOST: '127.0.0.1',
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

 // DEV-07A: explicit purpose approval -> frozen JSON export -> browser download.
 await owner.getByRole('button',{name:/内部导出/}).click();
 await owner.getByRole('button',{name:'＋ 批准导出用途',exact:true}).click();
 f=await dialogReady(owner,'批准内部导出用途');
 await f.getByLabel('对象类型',{exact:true}).selectOption('PERSON');
 await f.getByLabel('批准对象',{exact:true}).selectOption(pid);
 await f.getByLabel('姓名 / 展示名',{exact:true}).check();
 await f.getByLabel('角色',{exact:true}).check();
 const expiry=new Date(Date.now()+86400000),pad=n=>String(n).padStart(2,'0');
 await f.getByLabel('许可截止时间',{exact:true}).fill(expiry.getFullYear()+'-'+pad(expiry.getMonth()+1)+'-'+pad(expiry.getDate())+'T'+pad(expiry.getHours())+':'+pad(expiry.getMinutes()));
 await f.getByLabel('审批依据',{exact:true}).fill('合成测试：仅批准姓名和角色用于内部JSON迁移');
 const permissionCreate=await writeUI(owner,'POST','/use-permissions',()=>f.getByRole('button',{name:'批准用途',exact:true}).click(),201),exportPermissionId=permissionCreate.resourceId;
 await owner.getByText('人才 · WP1摄影剪辑人员',{exact:true}).waitFor();
 const permissionRow=owner.locator('tr').filter({has:owner.getByText('人才 · WP1摄影剪辑人员',{exact:true})});
 await permissionRow.getByRole('checkbox').check();
 const exportCreate=await writeUI(owner,'POST','/exports',()=>owner.getByRole('button',{name:'生成内部 JSON',exact:true}).click(),202),exportId=exportCreate.resourceId;
 await until(async()=>await prisma.exportJob.count({where:{id:exportId,state:'READY'}})===1);
 await owner.getByRole('button',{name:'下载 JSON',exact:true}).waitFor();
 const downloadPromise=owner.waitForEvent('download');
 await owner.getByRole('button',{name:'下载 JSON',exact:true}).click();
 const downloaded=await downloadPromise;
 assert.equal(downloaded.suggestedFilename(),'once-export-'+exportId+'.json');
 const exported=await prisma.exportJob.findUniqueOrThrow({where:{id:exportId}});
 assert.equal(exported.payloadDigest?.length,64);
 assert.equal(await prisma.exportDependency.count({where:{exportId,usePermissionId:exportPermissionId,personId:pid}}),1);
 console.log('PASS DEV-07A browser: explicit export permission -> worker JSON -> controlled browser download');

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

 // DEV-07B: preview real dependencies and freeze DRAFT only; no destructive execution exists.
 await owner.getByRole('button',{name:/删除影响评估/}).click();
 await owner.getByLabel('删除目标类型',{exact:true}).selectOption('PERSON');
 await owner.getByLabel('删除目标',{exact:true}).selectOption(pid);
 await writeUI(owner,'POST','/deletion-requests/preview',()=>owner.getByRole('button',{name:'预览影响',exact:true}).click());
 await owner.getByText('PERSON_EXPORT_DEPENDENCY',{exact:true}).first().waitFor();
 await owner.getByText('PERSON_SHORTLIST_ITEM',{exact:true}).first().waitFor();
 await owner.getByLabel('申请原因',{exact:true}).fill('合成测试：只冻结删除影响草稿，不执行任何清理');
 const deletionCreate=await writeUI(owner,'POST','/deletion-requests',()=>owner.getByRole('button',{name:'创建 DRAFT 申请',exact:true}).click(),201),deletionRequestId=deletionCreate.resourceId;
 const deletionDetail=owner.locator('.deletion-request-detail');
 await deletionDetail.getByRole('heading',{name:'删除申请',exact:true}).waitFor();
 await deletionDetail.getByText('尚未阻断正常使用',{exact:true}).waitFor();
 assert.equal(await prisma.deletionRequest.count({where:{id:deletionRequestId,state:'DRAFT'}}),1);
 assert.equal(await getStatus(owner,'/people/'+pid),200);
 assert.equal(await owner.getByRole('button',{name:/执行删除|立即删除|开始清理/}).count(),0);
 console.log('PASS DEV-07B browser: impact preview -> DRAFT request; target remains readable and no delete execution exists');

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
 console.log('PASS WP1 privacy: suspended dependencies redact identities/previews; private roots and audits stay hidden; wrong-parent command writes nothing');
 await d.getByRole('button',{name:'关闭',exact:true}).last().click();

 const exportPerson=await prisma.person.findUniqueOrThrow({where:{id:pid}}),exportSource=await prisma.sourceRecord.findUniqueOrThrow({where:{id:exportPerson.sourceId}});
 await cmd(owner,'POST','/sources/'+exportSource.id+'/suspend',{expectedRevision:exportSource.revision,reason:'合成测试：使旧导出依赖失效'});
 await owner.getByRole('button',{name:/内部导出/}).click();
 const exportTasks=owner.locator('section.panel').filter({has:owner.getByRole('heading',{name:'我的导出任务',exact:true})});
 await exportTasks.getByRole('button',{name:'查看',exact:true}).first().click();
 await owner.getByText('依赖已失效',{exact:true}).waitFor();
 assert.equal(await owner.getByRole('button',{name:'下载 JSON',exact:true}).count(),0);
 assert.equal((await json(owner,'/exports/'+exportId)).downloadable,false);
 console.log('PASS DEV-07A privacy: source suspension makes the whole old export non-downloadable');

 // DEV-07C: real browser DRAFT -> explicit BLOCKED_FOR_USE; no physical cleanup exists.
 await owner.getByRole('button',{name:/删除影响评估/}).click();
 await owner.getByLabel('删除目标类型',{exact:true}).selectOption('PROJECT');
 await owner.getByLabel('删除目标',{exact:true}).selectOption(projectId);
 await writeUI(owner,'POST','/deletion-requests/preview',()=>owner.getByRole('button',{name:'预览影响',exact:true}).click());
 await owner.getByLabel('申请原因',{exact:true}).fill('合成测试：阻断项目正常使用，但当前不执行物理删除');
 const blockDraft=await writeUI(owner,'POST','/deletion-requests',()=>owner.getByRole('button',{name:'创建 DRAFT 申请',exact:true}).click(),201),blockRequestId=blockDraft.resourceId;
 const blockDetail=owner.locator('.deletion-request-detail');
 await blockDetail.getByRole('heading',{name:'删除申请',exact:true}).waitFor();
 assert.equal(await getStatus(owner,'/projects/'+projectId),200);
 owner.once('dialog',dialog=>void dialog.accept());
 await writeUI(owner,'POST','/deletion-requests/'+blockRequestId+'/block',()=>blockDetail.getByRole('button',{name:'阻断正常使用',exact:true}).click());
 await blockDetail.getByText('已阻断正常使用；正在做保留决定',{exact:true}).waitFor();
 assert.equal(await prisma.deletionRequest.count({where:{id:blockRequestId,state:'BLOCKED_FOR_USE'}}),1);
 assert.equal(await getStatus(owner,'/projects/'+projectId),404);
 assert.ok(!(await json(owner,'/projects')).items.some(x=>x.id===projectId));
 assert.equal(await prisma.project.count({where:{id:projectId}}),1);
 assert.equal(await owner.getByRole('button',{name:/开始清理|立即删除|执行删除/}).count(),0);
 console.log('PASS DEV-07C browser: DRAFT -> BLOCKED_FOR_USE hides project while preserving underlying row and no cleanup action exists');

 // DEV-07D: resolve REVIEW_REQUIRED slots and freeze a cleanup plan without executing it.
 await blockDetail.getByRole('button',{name:'做决定',exact:true}).first().click();
 f=await dialogReady(owner,'记录保留决定');
 await f.getByLabel('本项决定',{exact:true}).selectOption('APPLY_PROPOSED');
 await f.getByLabel('决定说明',{exact:true}).fill('合成测试：已核对项目参与备注，按系统建议处理，不保留该关系');
 await writeUI(owner,'POST','/deletion-requests/'+blockRequestId+'/decisions',()=>f.getByRole('button',{name:'保存决定',exact:true}).click());
 await blockDetail.getByText('按建议处置',{exact:true}).first().waitFor();
 assert.equal((await json(owner,'/deletion-requests/'+blockRequestId)).pendingDecisionCount,0);
 owner.once('dialog',dialog=>void dialog.accept());
 await writeUI(owner,'POST','/deletion-requests/'+blockRequestId+'/plan/freeze',()=>blockDetail.getByRole('button',{name:'冻结清理计划',exact:true}).click());
 await blockDetail.getByText('计划已冻结',{exact:true}).waitFor();
 const frozenPlan=await prisma.deletionRequest.findUniqueOrThrow({where:{id:blockRequestId}});
 assert.equal(frozenPlan.state,'BLOCKED_FOR_USE');
 assert.equal(frozenPlan.planDigest?.length,64);
 assert.ok(frozenPlan.planFrozenAt);
 assert.equal(await prisma.project.count({where:{id:projectId}}),1);
 assert.equal(await prisma.projectParticipant.count({where:{projectId}}),1);
 assert.equal(await prisma.projectWork.count({where:{projectId}}),1);
 await blockDetail.getByRole('button',{name:'开始不可逆依赖清理',exact:true}).waitFor();
 console.log('PASS DEV-07D browser: REVIEW_REQUIRED decision -> frozen plan; underlying project relations remain before cleanup');
 owner.once('dialog',dialog=>void dialog.accept());
 await writeUI(owner,'POST','/deletion-requests/'+blockRequestId+'/cleaning/start',()=>blockDetail.getByRole('button',{name:'开始不可逆依赖清理',exact:true}).click());
 await until(async()=>['COMPLETED','RETAINED_WITH_BASIS','FAILED'].includes((await prisma.deletionRequest.findUniqueOrThrow({where:{id:blockRequestId}})).state));
 const finalizedProjectRequest=await prisma.deletionRequest.findUniqueOrThrow({where:{id:blockRequestId}});
 assert.equal(finalizedProjectRequest.state,'COMPLETED');
 assert.equal(finalizedProjectRequest.executionPlanDigest?.length,64);
 assert.equal(finalizedProjectRequest.finalizationDigest?.length,64);
 assert.ok(finalizedProjectRequest.finalizedAt);
 assert.equal(finalizedProjectRequest.cleanupErrorCode,null);
 assert.equal(await prisma.projectParticipant.count({where:{projectId}}),0);
 assert.equal(await prisma.projectWork.count({where:{projectId}}),0);
 const cleaningItems=await prisma.deletionItem.findMany({where:{requestId:blockRequestId}});
 assert.ok(cleaningItems.length>0);
 assert.ok(cleaningItems.every(x=>x.cleanupState==='DONE'&&x.cleanupEvidenceDigest?.length===64));
 const erasedProject=await prisma.project.findUniqueOrThrow({where:{id:projectId}});
 assert.equal(erasedProject.status,'ERASED');assert.equal(erasedProject.title,'[ERASED]');assert.equal(erasedProject.brief,'');
 assert.equal(await getStatus(owner,'/projects/'+projectId),404);
 await blockDetail.getByText('删除流程已完成',{exact:true}).waitFor();
 console.log('PASS DEV-07E browser: frozen plan -> CLEANING -> dependency cleanup evidence');
 console.log('PASS DEV-07F browser: project root finalized to ERASED minimal header and request COMPLETED');

 // DEV-07F real filesystem proof: disposable private image is physically purged before Asset/Upload tombstones finalize.
 const purgePersonId=(await cmd(owner,'POST','/people',{displayName:'DEV07F物理清理图片人物',roles:['model'],inlineSource:source('DEV07F物理清理图片来源')},201)).resourceId;
 const purgePerson=await prisma.person.findUniqueOrThrow({where:{id:purgePersonId}});
 const purgeBytes=await sharp({create:{width:72,height:54,channels:3,background:'#2468ac'}}).png().toBuffer();
 const purgeUpload=await prepare(owner,purgePerson,purgeBytes,'DEV07F-purge.png');
 assert.equal((await binary(owner,purgeUpload.resourceId,purgeBytes)).status(),200);await queue(owner,purgeUpload.resourceId);
 await until(async()=>await prisma.mediaAsset.count({where:{id:purgeUpload.resourceId,state:'READY'}})===1);
 const purgeDir=join(env.MEDIA_ROOT,'uploads',purgeUpload.resourceId);assert.equal(existsSync(purgeDir),true);

 await owner.getByRole('button',{name:/删除影响评估/}).click();
 await owner.getByRole('button',{name:'刷新',exact:true}).click();
 await owner.getByLabel('删除目标类型',{exact:true}).selectOption('ASSET');
 await owner.getByLabel('删除目标',{exact:true}).selectOption(purgeUpload.resourceId);
 await writeUI(owner,'POST','/deletion-requests/preview',()=>owner.getByRole('button',{name:'预览影响',exact:true}).click());
 await owner.getByLabel('申请原因',{exact:true}).fill('合成测试：验证图片原件和预览被真实物理清理');
 const purgeDraft=await writeUI(owner,'POST','/deletion-requests',()=>owner.getByRole('button',{name:'创建 DRAFT 申请',exact:true}).click(),201),purgeRequestId=purgeDraft.resourceId;
 const purgeDetail=owner.locator('.deletion-request-detail');
 await purgeDetail.getByRole('heading',{name:'删除申请',exact:true}).waitFor();
 owner.once('dialog',dialog=>void dialog.accept());
 await writeUI(owner,'POST','/deletion-requests/'+purgeRequestId+'/block',()=>purgeDetail.getByRole('button',{name:'阻断正常使用',exact:true}).click());
 owner.once('dialog',dialog=>void dialog.accept());
 await writeUI(owner,'POST','/deletion-requests/'+purgeRequestId+'/plan/freeze',()=>purgeDetail.getByRole('button',{name:'冻结清理计划',exact:true}).click());
 owner.once('dialog',dialog=>void dialog.accept());
 await writeUI(owner,'POST','/deletion-requests/'+purgeRequestId+'/cleaning/start',()=>purgeDetail.getByRole('button',{name:'开始不可逆依赖清理',exact:true}).click());
 await until(async()=>['COMPLETED','RETAINED_WITH_BASIS','FAILED'].includes((await prisma.deletionRequest.findUniqueOrThrow({where:{id:purgeRequestId}})).state));
 const purgeRequest=await prisma.deletionRequest.findUniqueOrThrow({where:{id:purgeRequestId}});
 assert.equal(purgeRequest.state,'COMPLETED');assert.equal(purgeRequest.finalizationDigest?.length,64);assert.equal(existsSync(purgeDir),false);
 const erasedAsset=await prisma.mediaAsset.findUniqueOrThrow({where:{id:purgeUpload.resourceId}});
 const erasedUpload=await prisma.mediaUpload.findUniqueOrThrow({where:{id:purgeUpload.resourceId}});
 assert.equal(erasedAsset.state,'ERASED');assert.equal(erasedAsset.fileName,'[ERASED]');assert.equal(erasedAsset.bytes,0);assert.equal(erasedAsset.previewBytes,0);
 assert.equal(erasedUpload.state,'ERASED');assert.equal(erasedUpload.fileName,'[ERASED]');assert.equal(erasedUpload.expectedBytes,0);assert.ok(erasedUpload.purgedAt);
 assert.equal(await getStatus(owner,'/assets/'+purgeUpload.resourceId),404);
 await purgeDetail.getByText('删除流程已完成',{exact:true}).waitFor();
 console.log('PASS DEV-07F media: local original/preview directory physically purged before ERASED media headers and COMPLETED request');

 // DEV-07G: controlled Person merge is an explicit browser workflow; same-name/similar people are never auto-merged.
 const mergeCanonicalId=(await cmd(owner,'POST','/people',{displayName:'DEV07G主档案',roles:['model'],inlineSource:source('DEV07G主档案来源')},201)).resourceId;
 const mergeDuplicateId=(await cmd(owner,'POST','/people',{displayName:'DEV07G重复档案',roles:['model'],inlineSource:source('DEV07G重复档案来源')},201)).resourceId;
 assert.equal(await prisma.person.count({where:{id:{in:[mergeCanonicalId,mergeDuplicateId]}}}),2);
 await owner.getByRole('button',{name:/人才合并/}).click();
 const mergeHeading=owner.getByRole('heading',{name:'人才合并',exact:true});await mergeHeading.waitFor();
 const mergePickers=owner.locator('.merge-picker');
 const canonicalPicker=mergePickers.nth(0),duplicatePicker=mergePickers.nth(1);
 const canonicalSearch=owner.waitForResponse(r=>r.request().method()==='GET'&&r.url().includes('/api/v1/people?')&&r.url().includes('q=DEV07G'));
 await canonicalPicker.getByLabel('主档案（保留）',{exact:true}).fill('DEV07G主档案');
 const canonicalSearchResponse=await canonicalSearch;assert.equal(canonicalSearchResponse.status(),200);
 assert.ok((await canonicalSearchResponse.json()).items.some(x=>x.id===mergeCanonicalId));
 await canonicalPicker.getByRole('button',{name:/DEV07G主档案/}).click();
 const duplicateSearch=owner.waitForResponse(r=>r.request().method()==='GET'&&r.url().includes('/api/v1/people?')&&r.url().includes('q=DEV07G'));
 await duplicatePicker.getByLabel('重复档案（归档并建立旧 ID 映射）',{exact:true}).fill('DEV07G重复档案');
 const duplicateSearchResponse=await duplicateSearch;assert.equal(duplicateSearchResponse.status(),200);
 assert.ok((await duplicateSearchResponse.json()).items.some(x=>x.id===mergeDuplicateId));
 await duplicatePicker.getByRole('button',{name:/DEV07G重复档案/}).click();
 await writeUI(owner,'POST','/people/merge-preview',()=>owner.getByRole('button',{name:'预览合并影响',exact:true}).click());
 await owner.getByText('影响扫描完整，可以继续人工决策',{exact:true}).waitFor();
 await owner.getByText('两条档案的主来源不同',{exact:true}).waitFor();
 await owner.getByRole('heading',{name:'字段冲突',exact:true}).waitFor();
 await owner.getByLabel('字段决定 displayName',{exact:true}).selectOption('CANONICAL');
 await owner.getByLabel('合并依据 *',{exact:true}).fill('合成测试：人工核对两条档案属于同一人才，只保留主档案身份');
 owner.once('dialog',dialog=>void dialog.accept());
 const mergeReceipt=await writeUI(owner,'POST','/people/merge',()=>owner.getByRole('button',{name:'执行受控合并',exact:true}).click());
 await owner.getByText('合并已完成',{exact:true}).waitFor();
 assert.equal(await prisma.personMergeDecision.count({where:{id:mergeReceipt.resourceId,canonicalPersonId:mergeCanonicalId,duplicatePersonId:mergeDuplicateId}}),1);
 assert.equal(await prisma.personAlias.count({where:{oldPersonId:mergeDuplicateId,canonicalPersonId:mergeCanonicalId}}),1);
 assert.equal((await prisma.person.findUniqueOrThrow({where:{id:mergeDuplicateId}})).status,'ARCHIVED');
 const oldResolved=await json(owner,'/people/'+mergeDuplicateId);
 assert.equal(oldResolved.id,mergeCanonicalId);assert.equal(oldResolved.resolvedFromId,mergeDuplicateId);
 const oldWrite=await cmd(owner,'PATCH','/people/'+mergeDuplicateId,{expectedRevision:(await prisma.person.findUniqueOrThrow({where:{id:mergeDuplicateId}})).revision,intro:'must not write through merged id'},409);
 assert.equal(oldWrite.error.code,'MERGED_ID_READ_ONLY');
 assert.ok(!(await json(owner,'/people')).items.some(x=>x.id===mergeDuplicateId));
 assert.equal((await json(owner,'/people?q='+encodeURIComponent('DEV07G重复档案'))).items.some(x=>x.id===mergeCanonicalId),false);
 console.log('PASS DEV-07G browser: explicit preview/decision/merge -> one alias; old Person id resolves read-only and disappears from normal lists');

 // TD2: the actual merge form requires each professional move to be acknowledged.
 const tdSchema='once-talent-v2.0.0';
 const tdSource=(await cmd(owner,'POST','/sources',source('TD2专业合并来源'),201)).resourceId;
 const tdCanonical=(await cmd(owner,'POST','/td2/people',{schemaVersion:tdSchema,originSourceId:tdSource,sourceRevision:1,displayName:'TD2保留身份',createTalent:true},201)).resourceId;
 const tdDuplicate=(await cmd(owner,'POST','/td2/people',{schemaVersion:tdSchema,originSourceId:tdSource,sourceRevision:1,displayName:'TD2专业重复',createTalent:true},201)).resourceId;
 const tdAdd=async(slug,values)=>cmd(owner,'POST',`/td2/people/${tdDuplicate}/${slug}`,{schemaVersion:tdSchema,expectedPersonRevision:(await prisma.person.findUniqueOrThrow({where:{id:tdDuplicate}})).revision,sourceId:tdSource,sourceRevision:1,values},201);
 await cmd(owner,'POST',`/td2/people/${tdCanonical}/roles`,{schemaVersion:tdSchema,expectedPersonRevision:1,sourceId:tdSource,sourceRevision:1,values:{roleCode:'model'}},201);
 const tdRole=(await tdAdd('roles',{roleCode:'model'})).resourceId;
 const tdLanguage=(await tdAdd('languages',{languageCode:'en',speakingLevelCode:'WORKING'})).resourceId;
 const tdCollection=(await tdAdd('collections',{personRoleId:tdRole,collectionTypeCode:'PORTFOLIO',title:'TD2合成集合'})).resourceId;
 const tdBytes=await sharp({create:{width:40,height:40,channels:3,background:'#345678'}}).png().toBuffer();
 const tdUpload=await prepare(owner,await prisma.person.findUniqueOrThrow({where:{id:tdDuplicate}}),tdBytes,'TD2-merge.png');
 assert.equal((await binary(owner,tdUpload.resourceId,tdBytes)).status(),200);await queue(owner,tdUpload.resourceId);
 await until(async()=>await prisma.mediaAsset.count({where:{id:tdUpload.resourceId,state:'READY'}})===1);
 await cmd(owner,'POST',`/td2/collections/${tdCollection}/items`,{schemaVersion:tdSchema,expectedRevision:1,expectedPersonRevision:(await prisma.person.findUniqueOrThrow({where:{id:tdDuplicate}})).revision,assetId:tdUpload.resourceId});
 const tdCanonicalRole=(await prisma.personRole.findFirstOrThrow({where:{personId:tdCanonical,roleCode:'model'}})).id;
 const tdCandidateWork=(await cmd(owner,'POST','/works',{title:'TD2候选同一作品',sourceId:tdSource},201)).resourceId;
 await cmd(owner,'POST',`/works/${tdCandidateWork}/assets`,{expectedRevision:1,assetId:tdUpload.resourceId},200);
 const tdCandidateWorkAsset=(await prisma.workAsset.findFirstOrThrow({where:{workId:tdCandidateWork}})).id;
 for(const personId of [tdCanonical,tdDuplicate]) await cmd(owner,'POST',`/works/${tdCandidateWork}/credits`,{expectedRevision:(await prisma.work.findUniqueOrThrow({where:{id:tdCandidateWork}})).revision,personId,roleCode:'model',note:'合成署名'},200);
 const tdCandidateList=(await cmd(owner,'POST','/shortlists',{title:'TD2保留职业候选',scopeId:(await prisma.person.findUniqueOrThrow({where:{id:tdCanonical}})).scopeId},201)).resourceId;
 for(const [personId,personRoleId,note] of [[tdCanonical,tdCanonicalRole,'保留主档案候选备注'],[tdDuplicate,tdRole,'保留重复档案候选备注']]) await cmd(owner,'POST',`/shortlists/${tdCandidateList}/items`,{expectedRevision:(await prisma.shortlist.findUniqueOrThrow({where:{id:tdCandidateList}})).revision,personId,personRoleId,personRoleRevision:1,workId:tdCandidateWork,workAssetIds:[tdCandidateWorkAsset],note},200);
 const tdCandidateBefore=await prisma.shortlistItem.findMany({where:{shortlistId:tdCandidateList},orderBy:{position:'asc'}});
 const tdCandidateLinksBefore=await prisma.shortlistItemAsset.findMany({where:{itemId:{in:tdCandidateBefore.map(r=>r.id)}},orderBy:{id:'asc'}});
 await owner.getByRole('button',{name:/概览/}).click();
 await owner.getByRole('button',{name:/人才合并/}).click();
 for(const [index,label,name] of [[0,'主档案（保留）','TD2保留身份'],[1,'重复档案（归档并建立旧 ID 映射）','TD2专业重复']]){
  const picker=owner.locator('.merge-picker').nth(index);
  const response=owner.waitForResponse(r=>r.request().method()==='GET'&&r.url().includes('/api/v1/people?')&&decodeURIComponent(r.url()).includes('q='+name));
  await picker.getByLabel(label,{exact:true}).fill(name);assert.equal((await response).status(),200);
  await picker.getByRole('button',{name:new RegExp(name)}).click();
 }
 const tdPreview=await writeUI(owner,'POST','/people/merge-preview',()=>owner.getByRole('button',{name:'预览合并影响',exact:true}).click());
 assert.equal(tdPreview.complete,true);
 assert.equal(tdPreview.collisions.filter(c=>c.kind==='SHORTLIST_ITEM').length,0);
 assert.ok(tdPreview.professional.items.some(r=>r.table==='shortlistItems'&&r.id===tdCandidateBefore[1].id));
 for(const collision of tdPreview.collisions) await owner.getByLabel('关系决定 '+collision.id,{exact:true}).selectOption('KEEP_CANONICAL');
 for(const field of tdPreview.fieldConflicts)await owner.getByLabel('字段决定 '+field.field,{exact:true}).selectOption('CANONICAL');
 await owner.getByLabel('合并依据 *',{exact:true}).fill('合成验收：保留专业资料原来源和稳定编号');
 assert.equal(await owner.getByRole('button',{name:'执行受控合并',exact:true}).isEnabled(),false);
 const tdPanel=owner.locator('section').filter({has:owner.getByRole('heading',{name:'专业资料迁移',exact:true})});
 assert.equal(await tdPanel.getByRole('checkbox').count(),tdPreview.professional.items.length);
 if(tdPreview.media.uploadsToDetach+tdPreview.media.assetsToDetach>0)await owner.getByLabel(/我确认解除/).check();
 for(const box of await tdPanel.getByRole('checkbox').all())await box.check();
 assert.equal(await owner.getByRole('button',{name:'执行受控合并',exact:true}).isEnabled(),false);
 assert.equal(tdPreview.professional.conflicts.length,2);
 for(const c of tdPreview.professional.conflicts) await owner.getByLabel('专业冲突决定 '+c.table+':'+c.canonicalId+':'+c.duplicateId,{exact:true}).selectOption(c.table==='talentProfiles'?'RETAIN_DUPLICATE_HISTORY':'KEEP_DUPLICATE_ACTIVE');
 assert.equal(await owner.getByRole('button',{name:'执行受控合并',exact:true}).isEnabled(),true);
 owner.once('dialog',dialog=>void dialog.accept());
 await writeUI(owner,'POST','/people/merge',()=>owner.getByRole('button',{name:'执行受控合并',exact:true}).click());
 await owner.getByText('合并已完成',{exact:true}).waitFor();
 const tdCandidateAfter=await prisma.shortlistItem.findMany({where:{shortlistId:tdCandidateList},orderBy:{position:'asc'}});
 assert.equal(tdCandidateAfter.length,2);
 for(let i=0;i<2;i++){assert.equal(tdCandidateAfter[i].id,tdCandidateBefore[i].id);assert.equal(tdCandidateAfter[i].personId,tdCanonical);assert.equal(tdCandidateAfter[i].personRoleId,tdCandidateBefore[i].personRoleId);assert.equal(tdCandidateAfter[i].note,tdCandidateBefore[i].note);}
 assert.deepEqual(await prisma.shortlistItemAsset.findMany({where:{itemId:{in:tdCandidateBefore.map(r=>r.id)}},orderBy:{id:'asc'}}),tdCandidateLinksBefore);
 const tdCandidateDetail=await json(owner,'/shortlists/'+tdCandidateList);assert.equal(tdCandidateDetail.items.filter(r=>r.unavailable).length,1);
 const tdDetail=await json(owner,'/td2/people/'+tdCanonical);
 assert.equal(tdDetail.facts.personLanguages[0].id,tdLanguage);
 assert.equal(tdDetail.facts.personRoles.find(r=>r.status==='ACTIVE').id,tdRole);
 assert.equal(tdDetail.facts.mediaCollections[0].id,tdCollection);
 assert.equal(tdDetail.facts.mediaCollections[0].items[0].assetId,tdUpload.resourceId);
 assert.equal(await prisma.personAlias.count({where:{oldPersonId:tdDuplicate,canonicalPersonId:tdCanonical}}),1);
 await owner.getByRole('button',{name:'查看合并保留资料',exact:true}).click();
 await owner.getByRole('heading',{name:'合并保留资料',exact:true}).waitFor();
 const historySection=owner.locator('section').filter({has:owner.getByRole('heading',{name:'合并保留资料',exact:true})});
 assert.equal(await historySection.getByRole('heading',{name:'人才主档案',exact:true}).count(),1);
 assert.ok((await historySection.innerText()).includes(tdDuplicate));
 assert.equal(await prisma.talentProfile.count({where:{personId:tdDuplicate,supersededById:{not:null}}}),1);
 console.log('PASS TD2 browser: explicit conflict selection and retained history; per-record confirmation gates professional merge; stable role/language/collection/item IDs and original media survive');


 const transferredTag=(await cmd(owner,'POST',`/td2/people/${tdCanonical}/collection-tags`,{schemaVersion:tdSchema,expectedPersonRevision:(await prisma.person.findUniqueOrThrow({where:{id:tdCanonical}})).revision,sourceId:tdSource,sourceRevision:1,values:{collectionId:tdCollection,tagCode:'FASHION'}},201)).resourceId;
 // TD2 transfer: approve person fields and each fact source using the real forms.
 const transferSource=(await cmd(owner,'POST','/sources',source('TD2第二语言来源'),201)).resourceId;
 const transferLanguage=(await cmd(owner,'POST',`/td2/people/${tdCanonical}/languages`,{schemaVersion:tdSchema,expectedPersonRevision:(await prisma.person.findUniqueOrThrow({where:{id:tdCanonical}})).revision,sourceId:transferSource,sourceRevision:1,values:{languageCode:'zh',speakingLevelCode:'NATIVE'}},201)).resourceId;
 const transferDefinition=(await cmd(owner,'POST','/td2/capability-definitions',{schemaVersion:tdSchema,code:'transfer-camera',labelZh:'镜头表现',labelEn:'Camera performance',aliases:['镜头感'],applicableRoleCodes:['model'],levelSchemeCode:'ABILITY_5',semanticVersion:'1.0.0'},201)).resourceId;
 const transferCapability=(await cmd(owner,'POST',`/td2/people/${tdCanonical}/capabilities`,{schemaVersion:tdSchema,expectedPersonRevision:(await prisma.person.findUniqueOrThrow({where:{id:tdCanonical}})).revision,sourceId:tdSource,sourceRevision:1,values:{capabilityCode:'transfer-camera',personRoleId:tdRole,levelCode:'PROFESSIONAL'}},201)).resourceId;
 const transferOrganization=(await cmd(owner,'POST','/td2/organizations',{schemaVersion:tdSchema,sourceId:transferSource,sourceRevision:1,name:'合成外部编号签发机构',kind:'ISSUER'},201)).resourceId;
 const transferExternal=(await cmd(owner,'POST',`/td2/people/${tdCanonical}/external-refs`,{schemaVersion:tdSchema,expectedPersonRevision:(await prisma.person.findUniqueOrThrow({where:{id:tdCanonical}})).revision,sourceId:tdSource,sourceRevision:1,values:{providerCode:'AGENCY_INTERNAL',namespaceCode:'browser-transfer',issuerOrganizationId:transferOrganization,externalKey:'synthetic-account'}},201)).resourceId;
 await cmd(owner,'POST',`/td2/external-refs/${transferExternal}/verify`,{schemaVersion:tdSchema,expectedRevision:1,expectedPersonRevision:(await prisma.person.findUniqueOrThrow({where:{id:tdCanonical}})).revision,sourceRevision:1},200);
 const transferAgent=(await cmd(owner,'POST','/td2/people',{schemaVersion:tdSchema,originSourceId:transferSource,sourceRevision:1,displayName:'合成代表联系人'},201)).resourceId;
 const transferredRepresentations=[];
 for(const subject of [{agentPersonId:transferAgent,relationCode:'AGENT'},{agencyOrganizationId:transferOrganization,relationCode:'AGENCY'}]) transferredRepresentations.push((await cmd(owner,'POST',`/td2/people/${tdCanonical}/representations`,{schemaVersion:tdSchema,expectedPersonRevision:(await prisma.person.findUniqueOrThrow({where:{id:tdCanonical}})).revision,sourceId:tdSource,sourceRevision:1,values:{...subject,personRoleId:tdRole}},201)).resourceId);
 const transferCredential=(await cmd(owner,'POST',`/td2/people/${tdCanonical}/credentials`,{schemaVersion:tdSchema,expectedPersonRevision:(await prisma.person.findUniqueOrThrow({where:{id:tdCanonical}})).revision,sourceId:tdSource,sourceRevision:1,values:{credentialTypeCode:'TRANSLATION_CERTIFICATE',evidenceAssetId:tdUpload.resourceId,issuerOrganizationId:transferOrganization,issuedOn:'2020-01-01',expiresOn:'2030-01-01'}},201)).resourceId;
 await cmd(owner,'POST',`/td2/credentials/${transferCredential}/identifier`,{schemaVersion:tdSchema,expectedRevision:1,expectedPersonRevision:(await prisma.person.findUniqueOrThrow({where:{id:tdCanonical}})).revision,identifier:'SYNTHETIC-BROWSER-1234'},200);
 await cmd(owner,'POST',`/td2/credentials/${transferCredential}/verify`,{schemaVersion:tdSchema,expectedRevision:2,expectedPersonRevision:(await prisma.person.findUniqueOrThrow({where:{id:tdCanonical}})).revision,sourceRevision:1},200);
 const transferAdult=(await cmd(owner,'POST',`/td2/people/${tdCanonical}/adult-eligibility`,{schemaVersion:tdSchema,expectedPersonRevision:(await prisma.person.findUniqueOrThrow({where:{id:tdCanonical}})).revision,sourceId:tdSource,sourceRevision:1,values:{state:'SELF_DECLARED_ADULT'}},201)).resourceId;
 const adultUntil=new Date(Date.now()+86400000).toISOString();
 await cmd(owner,'POST',`/td2/adult-eligibility/${transferAdult}/verify`,{schemaVersion:tdSchema,expectedRevision:1,expectedPersonRevision:(await prisma.person.findUniqueOrThrow({where:{id:tdCanonical}})).revision,sourceRevision:1,evidenceAssetId:tdUpload.resourceId,validUntil:adultUntil},200);
 const adultBefore=await prisma.adultEligibility.findUniqueOrThrow({where:{id:transferAdult}});
 const transferCredentialBefore=await prisma.personCredential.findUniqueOrThrow({where:{id:transferCredential}});
 const transferEvidenceSource=(await cmd(owner,'POST','/sources',source('TD2字段证据独立来源'),201)).resourceId;
 await cmd(owner,'POST','/td2/evidence',{schemaVersion:tdSchema,ownerKind:'personLanguages',ownerId:transferLanguage,fieldPath:'speakingLevelCode',expectedRevision:1,sourceId:transferEvidenceSource,sourceRevision:1},200);
 for(const personId of [tdCanonical,transferAgent]) await cmd(owner,'POST','/td2/evidence',{schemaVersion:tdSchema,ownerKind:'person',ownerId:personId,fieldPath:'displayName',expectedRevision:(await prisma.person.findUniqueOrThrow({where:{id:personId}})).revision,sourceId:transferEvidenceSource,sourceRevision:1},200);
 const identityEvidenceBefore=await prisma.fieldEvidence.findMany({where:{personId:{in:[tdCanonical,transferAgent]},fieldPath:'displayName',sourceId:transferEvidenceSource}});
 assert.equal(await prisma.talentProfile.count({where:{personId:transferAgent}}),0);
 const transferEvidenceBefore=await prisma.fieldEvidence.findFirstOrThrow({where:{personLanguageId:transferLanguage,sourceId:transferEvidenceSource}});
 await owner.getByRole('button',{name:/内部导出/}).click();
 const transferLabels=['2.0 人才主档案（内部简介与状态）','2.0 职业及有效期','2.0 语言、熟练度及有效期','2.0 能力、等级及所用字典','2.0 外部标识、核验状态及关联机构','2.0 代表关系、有效期及关联机构','2.0 所选专业字段的来源证据与原核验记录','2.0 资质记录与核验状态','2.0 资质加密编号（单独批准）','2.0 媒体集合、图片顺序与说明','2.0 集合内容标签','2.0 成年资格与原核验归属（单独批准）','身份字段的来源证据与原核验记录','合并保留资料（旧身份、主档案和决定）'];
 const sourceLabels=['来源标题','来源类型','提供方说明','内部依据类型','依据说明','有效起点','有效截止','来源状态'];
 const transferPermits=[];
 for(const [kind,id,labels] of [['PERSON',tdCanonical,['姓名 / 展示名','档案状态',...transferLabels]],['SOURCE',tdSource,[...sourceLabels,...transferLabels,'姓名 / 展示名','图片原件及预览（单独批准）']],['SOURCE',transferSource,[...sourceLabels,transferLabels[2],transferLabels[4],transferLabels[5],transferLabels[6],transferLabels[7]]],['PERSON',transferAgent,['姓名 / 展示名','档案状态',...transferLabels]],['SOURCE',transferEvidenceSource,[...sourceLabels,transferLabels[2],transferLabels[6],transferLabels[12],'姓名 / 展示名']],['ASSET',tdUpload.resourceId,['图片原件及预览（单独批准）']]]){
  await owner.getByRole('button',{name:'＋ 批准导出用途',exact:true}).click();
  f=await dialogReady(owner,'批准内部导出用途');
  await f.getByLabel('对象类型',{exact:true}).selectOption(kind);await f.getByLabel('批准对象',{exact:true}).selectOption(id);
  for(const label of labels) await f.getByLabel(label,{exact:true}).check();
  await f.getByLabel('许可截止时间',{exact:true}).fill(expiry.getFullYear()+'-'+pad(expiry.getMonth()+1)+'-'+pad(expiry.getDate())+'T'+pad(expiry.getHours())+':'+pad(expiry.getMinutes()));
  await f.getByLabel('审批依据',{exact:true}).fill('合成验收：所选人物和实际来源的专业资料用于内部重建');
  transferPermits.push((await writeUI(owner,'POST','/use-permissions',()=>f.getByRole('button',{name:'批准用途',exact:true}).click(),201)).resourceId);
 }
 for(const permit of transferPermits) await owner.getByLabel('选择导出许可 '+permit,{exact:true}).check();
 const typedExport=(await writeUI(owner,'POST','/exports',()=>owner.getByRole('button',{name:'生成内部 JSON',exact:true}).click(),202)).resourceId;
 await until(async()=>await prisma.exportJob.count({where:{id:typedExport,state:'READY'}})===1);
 await owner.getByRole('button',{name:'下载 JSON',exact:true}).waitFor();
 const typedDownload=owner.waitForEvent('download');await owner.getByRole('button',{name:'下载 JSON',exact:true}).click();
 const typedFile=await typedDownload,typedPayload=JSON.parse(readFileSync(await typedFile.path(),'utf8'));
 assert.equal(typedPayload.schemaVersion,'once-export-v2-talent');
 assert.equal(typedPayload.manifest.talent.schemaVersion,'once-talent-transfer-v11');
 const exportedHistory=typedPayload.manifest.talent.mergeHistory;assert.equal(exportedHistory.people.length,1);assert.equal(exportedHistory.people[0].id,tdDuplicate);assert.equal(exportedHistory.people[0].status,'ARCHIVED');assert.equal(exportedHistory.aliases[0].oldPersonId,tdDuplicate);assert.equal(exportedHistory.aliases[0].canonicalPersonId,tdCanonical);
 const mergeOriginal=await prisma.personMergeDecision.findUniqueOrThrow({where:{id:exportedHistory.decisions[0].id}});assert.equal(exportedHistory.decisions[0].origin.membershipId,mergeOriginal.actorId);assert.equal(exportedHistory.decisions[0].origin.workspaceId,mergeOriginal.workspaceId);assert.deepEqual(exportedHistory.decisions[0].decisionManifest,mergeOriginal.decisionManifest);assert.equal(exportedHistory.talentProfiles[0].personId,tdDuplicate);assert.ok(typedPayload.manifest.talent.tables.talentProfiles.some(p=>p.id===exportedHistory.talentProfiles[0].supersededById));
 for(const original of identityEvidenceBefore){const e=typedPayload.manifest.talent.identityEvidence.find(e=>e.id===original.id);assert.ok(e);assert.equal(e.personId,original.personId);assert.equal(e.valueDigest,original.valueDigest);assert.equal(e.originalReview.membershipId,original.reviewerId);assert.equal(e.originalReview.reviewedAt,original.reviewedAt.toISOString());}
 const exportedCredential=typedPayload.manifest.talent.tables.personCredentials.find(r=>r.id===transferCredential);
 assert.ok(exportedCredential);assert.equal(exportedCredential.data.identifierCiphertext,transferCredentialBefore.identifierCiphertext);assert.equal(exportedCredential.data.maskedIdentifier,'***1234');assert.equal(exportedCredential.data.status,'VERIFIED');
 assert.equal(typedPayload.manifest.talent.identifierContextWorkspaceId,transferCredentialBefore.workspaceId);
 assert.ok(!JSON.stringify(typedPayload).includes('SYNTHETIC-BROWSER-1234'));
 const originalEvidence=typedPayload.manifest.talent.evidence.find(e=>e.id===transferEvidenceBefore.id);
 assert.ok(originalEvidence);assert.equal(originalEvidence.ownerId,transferLanguage);assert.equal(originalEvidence.sourceId,transferEvidenceSource);assert.equal(originalEvidence.valueDigest,transferEvidenceBefore.valueDigest);
 assert.equal(originalEvidence.originalReview.membershipId,transferEvidenceBefore.reviewerId);assert.equal(originalEvidence.originalReview.reviewedAt,transferEvidenceBefore.reviewedAt.toISOString());
 assert.equal(typedPayload.manifest.talent.tables.personCapabilities.find(r=>r.id===transferCapability).data.personRoleId,tdRole);
 assert.ok(typedPayload.manifest.people.some(p=>p.id===transferAgent));
 assert.equal(typedPayload.manifest.talent.tables.representations.length,2);
 assert.equal(typedPayload.manifest.talent.tables.representations.find(r=>r.id===transferredRepresentations[0]).data.agentPersonId,transferAgent);
 assert.equal(typedPayload.manifest.talent.tables.representations.find(r=>r.id===transferredRepresentations[1]).data.agencyOrganizationId,transferOrganization);
 assert.equal(typedPayload.manifest.talent.organizations.length,1);
 assert.equal(typedPayload.manifest.talent.organizations[0].id,transferOrganization);
 assert.equal(typedPayload.manifest.talent.organizations[0].sourceId,transferSource);
 const downloadedExternal=typedPayload.manifest.talent.tables.personExternalRefs.find(r=>r.id===transferExternal);
 assert.equal(downloadedExternal.data.issuerOrganizationId,transferOrganization);assert.equal(downloadedExternal.data.state,'VERIFIED');assert.ok(downloadedExternal.data.verifiedAt);
 assert.equal(typedPayload.manifest.talent.capabilityDefinitions.length,1);
 assert.equal(typedPayload.manifest.talent.capabilityDefinitions[0].id,transferDefinition);
 assert.deepEqual(typedPayload.manifest.talent.capabilityDefinitions[0].aliases,['镜头感']);
 assert.equal(typedPayload.manifest.talent.tables.personLanguages.find(r=>r.id===transferLanguage).sourceId,transferSource);
 assert.ok(typedPayload.manifest.talent.tables.personRoles.some(r=>r.id===tdRole));
 assert.equal(typedPayload.manifest.talent.tables.personCredentials.length,1);
 assert.equal(exportedCredential.data.status,'VERIFIED');assert.equal(exportedCredential.data.evidenceAssetId,tdUpload.resourceId);
 const exportedAdult=typedPayload.manifest.talent.tables.adultEligibilities.find(a=>a.id===transferAdult);assert.equal(exportedAdult.data.state,'VERIFIED_ADULT');assert.equal(exportedAdult.data.verification.membershipId,adultBefore.verifiedByMembershipId);assert.equal(exportedAdult.data.verification.workspaceId,adultBefore.workspaceId);assert.equal(exportedAdult.data.verifiedAt,adultBefore.verifiedAt.toISOString());assert.equal(exportedAdult.data.validUntil,adultUntil);
 assert.equal(typedPayload.manifest.talent.assets.length,1);assert.equal(typedPayload.manifest.talent.collectionItems.find(i=>i.collectionId===tdCollection).assetId,tdUpload.resourceId);assert.equal(typedPayload.manifest.talent.tables.mediaCollections.find(c=>c.id===tdCollection).data.personRoleId,tdRole);assert.equal(typedPayload.manifest.talent.tables.mediaCollectionTags.find(t=>t.id===transferredTag).data.tagCode,'FASHION');
 for(const [part,label] of [['original','下载图片原件'],['preview','下载图片预览']]) {
  const downloadedProof=owner.waitForEvent('download');await owner.getByRole('button',{name:label,exact:true}).click();const file=await downloadedProof;
  assert.equal(file.suggestedFilename(),tdUpload.resourceId+(part==='original'?'.original.bin':'.preview.jpg'));
  const bytes=readFileSync(await file.path()),asset=typedPayload.manifest.talent.assets[0];assert.equal(hash(bytes),part==='original'?asset.sha256:asset.previewHash);
  if(part==='original')assert.deepEqual(bytes,tdBytes);
 }

 await cmd(owner,'POST',`/use-permissions/${transferPermits[4]}/revoke`,{expectedRevision:1});
 const blockedTransfer=await writeUI(owner,'POST','/exports/'+typedExport+'/download',()=>owner.getByRole('button',{name:'下载 JSON',exact:true}).click(),409);
 assert.equal(blockedTransfer.error.code,'EXPORT_STALE');
 assert.equal(await getStatus(owner,`/exports/${typedExport}/media/${tdUpload.resourceId}/original`),409);
 console.log('PASS TD2 transfer browser: original and preview downloads match exact hashes, verified credential retains attachment; explicit person, fact and evidence source grants -> v11 JSON preserves archived identities, retained profiles, immutable original merge decision and actor plus ordinary contact identity evidence and original adult verification plus collection/type/tag/item identity plus credential ciphertext without plaintext plus original field evidence and reviewer attribution -> evidence-only grant revocation blocks download');

 assert.deepEqual(errors,[]);
} catch(error) {
 console.error('Browser page errors:',JSON.stringify(errors));
 if(browser)for(const context of browser.contexts())for(const page of context.pages())console.error('Page route:',new URL(page.url()).pathname);
 throw error;
} finally {if(browser)await browser.close();await stop(worker);await stop(api);await prisma.$disconnect();rmSync(tmp,{recursive:true,force:true});}
