import {navigateUI} from './product-navigation.mjs';
import { verifyTalentWorkbench } from './talent-workbench.mjs';
/** WP1 real Works/Projects/Chromium acceptance. Only an empty disposable loopback test DB.
 * Never reads a .env target, resets a DB, or sends requests to a production host. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { realpathSync, mkdirSync, existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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
const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'once-ui-')));
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
    await page.getByRole('button', { name: '工作台', exact:true }).waitFor();
}
async function cmd(page, method, path, data, expected = 200) {
    const me = await page.context().request.get(base + '/api/v1/me'); assert.equal(me.status(), 200);
    const response = await page.context().request.fetch(base + '/api/v1' + path, { method, data,
        headers: { Origin: base, 'X-CSRF-Token': (await me.json()).csrfToken, 'Idempotency-Key': randomUUID() } });
    assert.equal(response.status(), expected, method + ' ' + path); return response.json();
}
const getStatus = async (page, path) => (await page.context().request.get(base + '/api/v1' + path)).status();
const errors=[],csp=[];const evidence=process.env.UI_EVIDENCE_DIR; if(evidence)mkdirSync(evidence,{recursive:true});
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
 assert.equal(tables.length,0,'Use a NEW empty isolated database');run('pnpm',['db:deploy']);
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));env.PORT=String(server.address().port);await new Promise(r=>server.close(r));
 base='http://127.0.0.1:'+env.PORT;env.APP_ORIGIN=base;run('node',['dist/apps/api/src/bootstrap.js']);
 api=spawn('node',['dist/apps/api/src/main.js'],{env,stdio:['ignore','pipe','pipe']});api.stdout.resume();api.stderr.on('data',b=>process.stderr.write(b));await until(async()=>(await fetch(base+'/health/ready')).status===200);
 browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security|violates|Refused/.test(m.text()))csp.push(m.text());});
 await login(page,'owner');
 if(evidence)await page.screenshot({path:join(evidence,'workspace-empty.png'),fullPage:true});
 await page.getByRole('button',{name:'新增人才',exact:true}).click();
 await page.getByLabel('姓名或艺名 *',{exact:true}).fill('测试模特甲');
 await page.getByLabel('来源标题 *',{exact:true}).fill('测试资料来源甲');
 await page.getByLabel('谁提供、怎样收到 *',{exact:true}).fill('隔离验收合成记录');
 await page.getByLabel('使用依据 *',{exact:true}).fill('仅用于隔离数据库中的产品化验收');
 // Browser navigation must preserve the draft when leaving is cancelled.
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'作品库',exact:true}).click();
 assert.equal(await page.getByLabel('姓名或艺名 *',{exact:true}).inputValue(),'测试模特甲');
 if(evidence)await page.screenshot({path:join(evidence,'create.png'),fullPage:true});
 let lost=false;const createPath='**/api/v1/td2/people';
 const lose=async route=>{if(route.request().method()==='POST'&&!lost){lost=true;const r=await route.fetch();assert.equal(r.status(),201);await route.abort('failed');}else await route.continue();};
 await page.route(createPath,lose);
 await page.getByRole('button',{name:'保存并继续',exact:true}).click();
 await page.getByRole('button',{name:'核对原提交',exact:true}).waitFor();
 assert.equal(await prisma.person.count(),1);assert.equal(await prisma.sourceRecord.count(),1);
 await page.unroute(createPath,lose);await page.getByRole('button',{name:'核对原提交',exact:true}).click();
 await page.getByRole('button',{name:'新增职业',exact:true}).waitFor();
 const pid=(await prisma.person.findFirstOrThrow({where:{displayName:'测试模特甲'}})).id;
 assert.match(page.url(),new RegExp('/talents/'+pid));assert.equal(await prisma.person.count(),1);assert.equal(await prisma.sourceRecord.count(),1);
 await page.getByRole('button',{name:'新增职业',exact:true}).click();
 await page.getByLabel('职业 *',{exact:true}).selectOption('model');
 const source=await prisma.sourceRecord.findFirstOrThrow();
 await page.getByLabel('资料来源',{exact:true}).selectOption(source.id);
 await page.getByRole('button',{name:'保存职业',exact:true}).click();
 await page.getByRole('button',{name:'新增职业',exact:true}).waitFor();
 assert.equal(await prisma.personRole.count(),1);
 assert.equal(await prisma.commandReceipt.count({where:{operation:'td2.person.create'}}),1);
 // Real uploaded image and authorized collection summary; no front-end fixture records.
 worker=spawn('node',['dist/apps/api/src/worker-main.js'],{env,stdio:['ignore','pipe','pipe']});worker.stdout.resume();worker.stderr.resume();
 const bytes=await sharp({create:{width:240,height:320,channels:3,background:'#487a63'}}).png().toBuffer(),person=await prisma.person.findUniqueOrThrow({where:{id:pid}});
 const upload=await prepare(page,person,bytes,'测试展示图片.png');assert.equal((await binary(page,upload.resourceId,bytes)).status(),200);await queue(page,upload.resourceId);
 await until(async()=>await prisma.mediaAsset.count({where:{id:upload.resourceId,state:'READY'}})===1);
 let current=await json(page,'/td2/people/'+pid);
 const collection=(await cmd(page,'POST','/td2/people/'+pid+'/collections',{schemaVersion:'once-talent-v2.0.0',expectedPersonRevision:current.revision,sourceId:source.id,sourceRevision:source.revision,values:{collectionTypeCode:'MODEL_CARD',title:'测试模卡'}},201)).resourceId;
 current=await json(page,'/td2/people/'+pid);
 await cmd(page,'POST','/td2/collections/'+collection+'/items',{schemaVersion:'once-talent-v2.0.0',expectedRevision:1,expectedPersonRevision:current.revision,assetId:upload.resourceId,featured:true});
 const list=await json(page,'/td2/people');assert.equal(list.items.find(p=>p.id===pid).coverAssetId,upload.resourceId);
 for(let i=2;i<=12;i++){
  const person=(await cmd(page,'POST','/td2/people',{schemaVersion:'once-talent-v2.0.0',originSourceId:source.id,sourceRevision:source.revision,displayName:'测试合作人才'+String(i).padStart(2,'0'),createTalent:true},201)).resourceId;
  const roles=i<=4?['model']:i<=7?['translator']:i<=9?['photographer']:i<=11?['editor']:['model','translator'];
  for(const roleCode of roles){const current=await json(page,'/td2/people/'+person);await cmd(page,'POST','/td2/people/'+person+'/roles',{schemaVersion:'once-talent-v2.0.0',expectedPersonRevision:current.revision,sourceId:source.id,sourceRevision:source.revision,values:{roleCode}},201);}
 }


 if(evidence)await page.screenshot({path:join(evidence,'detail.png'),fullPage:true});
 await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'新增职业',exact:true}).waitFor();
 await page.getByRole('button',{name:'人才库',exact:true}).click();await page.getByRole('button',{name:'测试模特甲',exact:true}).waitFor();
 await page.getByText('卡片',{exact:true}).click();await page.getByRole('heading',{name:'测试模特甲',exact:true}).waitFor();
 const preview=page.getByRole('img',{name:'测试模特甲的推荐照片',exact:true});await preview.scrollIntoViewIfNeeded();await preview.evaluate(img=>img.decode());assert.ok(await preview.evaluate(img=>img.naturalWidth)>0);await page.evaluate(()=>window.scrollTo(0,0));
 if(evidence)await page.screenshot({path:join(evidence,'list.png'),fullPage:true});
 assert.equal((await page.context().request.get(base+'/api/does-not-exist')).headers()['content-type']?.includes('text/html'),false);
 for(const path of ['/talents/'+pid,'/works','/projects','/shortlists','/assets','/tools/imports']){const r=await page.context().request.get(base+path);assert.equal(r.status(),200,path);assert.match(r.headers()['content-type'],/text\/html/);}
 await page.getByRole('button',{name:/测试模特甲/}).click();await page.getByRole('heading',{name:'测试模特甲',exact:true}).waitFor();
 await page.goBack();await page.getByRole('heading',{name:'人才库',exact:true}).waitFor();
 await page.goForward();await page.getByRole('heading',{name:'测试模特甲',exact:true}).waitFor();
 for(const width of [1366,1920,390]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'horizontal overflow at '+width);if(evidence)await page.screenshot({path:join(evidence,'detail-'+width+'.png'),fullPage:true});}

 // More than one hundred real source records: a record beyond the first one hundred is selectable on page eleven.
 for(let i=0;i<100;i++)await cmd(page,'POST','/sources',{title:'测试分页来源'+i,type:'MANUAL',providerClaim:'合成分页资料',basisMode:'TEMP_ORGANIZE',basisDescription:'仅用于隔离测试的分页与选择'},201);
 await page.setViewportSize({width:1440,height:900});await page.getByRole('button',{name:'人才库',exact:true}).click();await page.getByRole('button',{name:'新增人才',exact:true}).click();await page.getByRole('button',{name:'选择已有来源',exact:true}).click();
 const sourceSelect=page.getByLabel('资料来源',{exact:true});
 for(let i=0;i<10;i++){await sourceSelect.waitFor();await page.getByRole('button',{name:'下一页',exact:true}).click();await page.getByText('第 '+(i+2)+' 页',{exact:false}).waitFor();}
 const beyond=(await json(page,'/sources?page=11&pageSize=10')).items[0];assert.ok(beyond);await sourceSelect.selectOption(beyond.id);assert.equal(await sourceSelect.inputValue(),beyond.id);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'人才库',exact:true}).click();
 await navigateUI(page,'导出记录');
 const nextSources=page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname==='/api/v1/sources'&&new URL(r.url()).searchParams.get('page')==='2');
 await page.getByRole('button',{name:'加载更多来源（已显示 100 / 101）',exact:true}).click();assert.equal((await nextSources).status(),200);
 await page.getByRole('button',{name:'加载更多来源（已显示 100 / 101）',exact:true}).waitFor({state:'detached'});
 // Reopening retained history must perform a new authorized read, even for the same selected person.
 await navigateUI(page,'合并记录');
 const canonical=page.locator('.merge-picker').first();await canonical.getByLabel('主档案（保留）',{exact:true}).fill('测试模特甲');await canonical.getByRole('button',{name:/测试模特甲/}).click();
 for(let i=0;i<2;i++){
  const history=page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname==='/api/v1/people/'+pid+'/merge-history');
  await page.getByRole('button',{name:'查看合并保留资料',exact:true}).click();assert.equal((await history).status(),200);
  await page.getByText('没有当前可读的保留资料。',{exact:true}).waitFor();
 }
 const member=await cmd(page,'POST','/memberships',{loginName:'ui_viewer',displayName:'测试只读成员',role:'VIEWER',extraPermissions:[]},201);
 const viewer=await browser.newPage();await viewer.goto(base+'/activate',{waitUntil:'networkidle'});await viewer.getByLabel('激活凭证').fill(member.activationToken);await viewer.getByLabel('设置密码（至少 12 个字符）').fill(password);await viewer.getByRole('button',{name:'激活账号',exact:true}).click();await viewer.getByText('账号已激活',{exact:false}).waitFor();await login(viewer,'ui_viewer');
 await viewer.getByRole('button',{name:'人才库',exact:true}).click();assert.equal(await viewer.getByRole('button',{name:'新增人才',exact:true}).count(),0);assert.equal((await json(viewer,'/td2/people')).total,0);assert.equal(await getStatus(viewer,'/people/'+pid),404);
 await viewer.goto(base+'/talents/'+pid,{waitUntil:'networkidle'});assert.equal(await viewer.getByText('测试模特甲',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(csp,[]);
 console.log(JSON.stringify({passed:true,browser:await browser.version(),backend:'PrismaStore/PostgreSQL16',checks:['empty create','dirty navigation cancelled','lost person response preserves original key and one receipt','professional role persisted','reload','back forward','SPA fallback excludes API','table/cards','1366/1440/1920/390 widths','CSP','real private upload and authorized cover','12 synthetic people via real API','101 source pagination and legacy export selector expansion','retained history rechecks on reopen','read-only member/direct HTTP scope rejection'],people:await prisma.person.count(),sources:await prisma.sourceRecord.count()}));
} finally {if(evidence&&browser){const page=browser.contexts()[0]?.pages()[0];if(page){await page.screenshot({path:join(evidence,'last.png'),fullPage:true});writeFileSync(join(evidence,'last-text.txt'),await page.locator('body').innerText());}}await browser?.close();await stop(worker);await stop(api);await prisma.$disconnect();rmSync(tmp,{recursive:true,force:true});}
