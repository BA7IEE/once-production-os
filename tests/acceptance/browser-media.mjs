import {registeredTemp} from '../../scripts/registered-temp.mjs';
import {registeredBrowser} from '../../scripts/registered-browser.mjs';
let browserOwner;
/** M1 real Nest/Prisma/Chromium acceptance. Only an empty disposable loopback test DB.
 * Never reads a .env target, resets a DB, or sends requests to a production host. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
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
const ownedTemp=registeredTemp();
const tmp = ownedTemp.path;
const password = 'Synthetic-' + randomBytes(20).toString('base64url') + '!';
const put = (name, text) => { const path = join(tmp, name); writeFileSync(path, text, { mode: 0o600 }); return path; };
const env = { ...process.env, DATABASE_URL: raw, APP_ENV: 'test', ACCESS_MODE: 'INTERNAL', COOKIE_SECURE: 'false', HOST: '127.0.0.1',
    CONTACT_KEY_FILE: put('contact.hex', randomBytes(32).toString('hex')), CSRF_KEY_FILE: put('csrf.hex', randomBytes(32).toString('hex')),
    RECOVERY_EPOCH_FILE: put('recovery.epoch', randomBytes(24).toString('hex')), BOOTSTRAP_LOGIN: 'owner', BOOTSTRAP_NAME: 'M1合成管理员',
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
const errors=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
async function json(page,path){const r=await page.context().request.get(base+'/api/v1'+path);assert.equal(r.status(),200,path);return r.json();}
async function binary(page,id,bytes){const me=await json(page,'/me');return page.context().request.put(base+'/api/v1/uploads/'+id+'/content',{data:bytes,headers:{Origin:base,'X-CSRF-Token':me.csrfToken,'Content-Type':'application/octet-stream','Content-Length':String(bytes.length)}});}
async function prepare(page,person,bytes,name='synthetic.png'){
 const source=await prisma.sourceRecord.findUniqueOrThrow({where:{id:person.sourceId}});
 return cmd(page,'POST','/uploads',{sourceId:source.id,personId:person.id,expectedSourceRevision:source.revision,fileName:name,mime:'image/png',expectedBytes:bytes.length,sha256:hash(bytes)},201);
}
async function queue(page,id){const u=await json(page,'/uploads/'+id);return cmd(page,'POST','/uploads/'+id+'/complete',{expectedRevision:u.revision},202);}
try {
 const tables=await prisma.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
 assert.equal(tables.length,0,'Only a fresh empty test database is permitted; never reset an existing database.');run('pnpm',['db:deploy']);
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));env.PORT=String(server.address().port);await new Promise(r=>server.close(r));
 base='http://127.0.0.1:'+env.PORT;env.APP_ORIGIN=base;run('node',['dist/apps/api/src/bootstrap.js']);
 api=spawn('node',['dist/apps/api/src/main.js'],{env,stdio:['ignore','pipe','pipe']});api.stdout.resume();api.stderr.resume();
 await until(async()=>(await fetch(base+'/health/ready')).status===200);
 browserOwner=await registeredBrowser(chromium,{headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});browser=browserOwner.browser;
 const owner=await browser.newPage(),editor=await browser.newPage();for(const p of[owner,editor])p.on('pageerror',e=>errors.push(e.message));
 await login(owner,'owner');const added=await cmd(owner,'POST','/memberships',{loginName:'m1_editor',displayName:'合成图片维护人',role:'EDITOR',extraPermissions:[]},201);
 await editor.goto(base+'/activate',{waitUntil:'networkidle'});await editor.getByLabel('激活凭证').fill(added.activationToken);await editor.getByLabel('设置密码（至少 12 个字符）').fill(password);await editor.getByRole('button',{name:'激活账号',exact:true}).click();await editor.getByText('账号已激活').waitFor();await login(editor,'m1_editor');
 await editor.getByRole('button',{name:'人才库',exact:true}).click();await editor.getByRole('button',{name:/新增人才/}).click();
 await editor.getByLabel('姓名 / 艺名 *').fill('M1私有图片人才');await editor.getByRole('checkbox',{name:'模特',exact:true}).check();
 const sourceReadPath='**/api/v1/sources/*';let releaseSource,sourceEntered;const sourceGate=new Promise(resolve=>{releaseSource=resolve;}),sourceRequested=new Promise(resolve=>{sourceEntered=resolve;});
 const holdSource=async route=>{const response=await route.fetch();sourceEntered();await sourceGate;await route.fulfill({response});};await editor.route(sourceReadPath,holdSource);
 const createdResponse=editor.waitForResponse(r=>r.url().endsWith('/directory/talents')&&r.request().method()==='POST');await editor.getByRole('button',{name:'保存草稿',exact:true}).click();const created=await createdResponse;assert.equal(created.status(),201);
 const pid=(await created.json()).resourceId,person=await prisma.person.findUniqueOrThrow({where:{id:pid}});
 await editor.locator('summary').filter({hasText:'高级管理：来源、依据、历史与权限'}).click();await editor.getByRole('button',{name:'打开高级管理',exact:true}).click();
 await sourceRequested;await editor.getByText('正在核对素材来源…',{exact:true}).waitFor();assert.equal(await editor.getByRole('heading',{name:'关联私有素材'}).count(),0,'source-backed upload must not render an unrelated required source selector while the profile source loads');releaseSource();
 await editor.getByRole('heading',{name:'关联私有素材'}).waitFor();await editor.unroute(sourceReadPath,holdSource);
 const image=await sharp({create:{width:80,height:40,channels:3,background:'#336699'}}).png().withMetadata({orientation:6}).toBuffer();
 const sends=[];const path='**/api/v1/uploads/*/complete';
 editor.on('request',r=>{if(r.url().endsWith('/complete'))sends.push({key:r.headers()['idempotency-key'],body:r.postData()});});
 const lose=async route=>{const upstream=await route.fetch();assert.equal(upstream.status(),202);await route.abort('failed');};await editor.route(path,lose);
 await editor.locator('input[type=file]').setInputFiles({name:'M1-synthetic.png',mimeType:'image/png',buffer:image});
 await editor.getByRole('button',{name:'上传并检查',exact:true}).click();await editor.getByRole('alert').waitFor();
 // QUEUED is already true after the first committed request; it cannot prove replay finished.
 assert.equal(sends.length,1);
 assert.equal(await prisma.mediaUpload.count({where:{state:'QUEUED'}}),1);
 await editor.unroute(path,lose);
 const replayResponse=editor.waitForResponse(r=>r.url().endsWith('/complete')&&r.request().method()==='POST');
 await editor.getByRole('button',{name:'核对上传状态并继续',exact:true}).click();
 const replay=await replayResponse;assert.equal(replay.status(),202);
 assert.equal((await replay.json()).replayed,true,'must observe the actual replay receipt, not only old queue state');
 await editor.locator('[data-upload-state=QUEUED]').waitFor();
 await until(async()=>await prisma.mediaUpload.count({where:{state:'QUEUED'}})===1);
 assert.equal(sends.length,2);assert.deepEqual(sends[0],sends[1]);
 const upload=await prisma.mediaUpload.findFirstOrThrow();assert.equal(await prisma.commandReceipt.count({where:{operation:'upload.complete',resourceId:upload.id}}),1);
 assert.equal(await getStatus(editor,'/assets/'+upload.id+'/preview'),404,'no bytes before READY');
 worker=spawn('node',['dist/apps/api/src/worker-main.js'],{env,stdio:['ignore','pipe','pipe']});worker.stdout.resume();worker.stderr.resume();
 await until(async()=>(await prisma.mediaUpload.findUniqueOrThrow({where:{id:upload.id}})).state==='READY');
 await editor.locator('[data-asset-id="'+upload.id+'"] img').waitFor();
 await until(async()=>editor.locator('[data-asset-id="'+upload.id+'"] img').evaluate(img=>img.complete&&img.naturalWidth>0));
 const response=await editor.context().request.get(base+'/api/v1/assets/'+upload.id+'/preview');assert.equal(response.status(),200);assert.match(response.headers()['cache-control'],/no-store/);assert.equal(response.headers()['content-type'],'image/jpeg');
 const decoded=await sharp(await response.body()).metadata();assert.equal(decoded.format,'jpeg');assert.equal(decoded.exif,undefined);assert.equal(decoded.xmp,undefined);assert.equal(decoded.width,40);
 assert.equal(await getStatus(owner,'/assets/'+upload.id+'/preview'),404,'unscoped administrator cannot access');assert.equal((await fetch(base+'/api/v1/assets/'+upload.id+'/preview')).status,401);
 const dto=await json(editor,'/assets/'+upload.id);for(const key of['objectToken','sha256','previewHash','originalUrl','storageKey'])assert.equal(Object.hasOwn(dto,key),false);
 assert.equal(await getStatus(editor,'/assets/'+upload.id+'/original'),404);
 console.log('PASS M1 browser: upload/unknown-complete replay/worker/decoded preview; metadata stripped and private scope enforced');
 // PDF is stored without parsing; the real page must not suggest a rendered preview.
 await editor.getByRole('button',{name:'上传另一份',exact:true}).click();
 const pdf=Buffer.from('%PDF-1.7\nOpaque external Agent attachment');
 await editor.locator('input[type=file]').setInputFiles({name:'external-agent.pdf',mimeType:'application/pdf',buffer:pdf});
 await editor.getByRole('button',{name:'上传并检查',exact:true}).click();
 await editor.getByText('PDF附件 · 未解析，内容处理交给外部Agent',{exact:true}).waitFor();
 const pdfAsset=await prisma.mediaAsset.findFirstOrThrow({where:{mime:'application/pdf'}});
 assert.equal(pdfAsset.bytes,pdf.length);assert.equal(await getStatus(owner,'/assets/'+pdfAsset.id+'/preview'),404);
 assert.equal(await editor.locator('[data-asset-id="'+pdfAsset.id+'"] img').count(),0);
 console.log('PASS PDF attachment: actual upload/worker/DB and explicit unparsed page, no administrator scope bypass');

 // PR-03 startup: actual H.264/AAC file, asynchronous worker, native video element and authorized ranges.
 const videoPath=join(tmp,'playable.mp4');run('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=160x120:duration=3:rate=24','-f','lavfi','-i','sine=frequency=440:duration=3','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-threads','1','-movflags','+faststart','-shortest',videoPath]);
 const videoBytes=readFileSync(videoPath);
 await editor.getByRole('button',{name:'上传另一份',exact:true}).click();
 await editor.locator('input[type=file]').setInputFiles({name:'playable.mp4',mimeType:'video/mp4',buffer:videoBytes});
 await editor.getByRole('button',{name:'上传并检查',exact:true}).click();
 const video=editor.getByLabel('播放视频：playable.mp4');await video.waitFor();
 await video.evaluate(async element=>{element.muted=true;await element.play();});
 await editor.waitForFunction(()=>{const v=document.querySelector('video');return v && v.currentTime>0.1 && v.videoWidth===160;});
 await video.evaluate(element=>{element.pause();element.currentTime=2.7;});
 await editor.waitForFunction(()=>{const v=document.querySelector('video');return v&&!v.seeking&&v.currentTime>=2.6;});
 const videoAsset=await prisma.mediaAsset.findFirstOrThrow({where:{mime:'video/mp4'}}),playUrl=base+'/api/v1/assets/'+videoAsset.id+'/playback';
 const auditBefore=await prisma.auditEvent.count({where:{action:'asset.playback'}});
 await prisma.$executeRawUnsafe("CREATE FUNCTION once_playback_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='asset.playback' THEN RAISE EXCEPTION 'synthetic playback audit failure'; END IF; RETURN NEW; END; $$");
 await prisma.$executeRawUnsafe('CREATE TRIGGER once_playback_audit_fail BEFORE INSERT ON audits FOR EACH ROW EXECUTE FUNCTION once_playback_audit_fail()');
 try {const denied=await editor.context().request.get(playUrl);assert.equal(denied.status(),503);assert.match(denied.headers()['content-type'],/json/);assert.equal(await prisma.auditEvent.count({where:{action:'asset.playback'}}),auditBefore);}
 finally {await prisma.$executeRawUnsafe('DROP TRIGGER once_playback_audit_fail ON audits');await prisma.$executeRawUnsafe('DROP FUNCTION once_playback_audit_fail()');}

 for(const [range,start,end] of [['bytes=0-63',0,63],['bytes=-64',videoBytes.length-64,videoBytes.length-1],['bytes=64-',64,videoBytes.length-1]]){
  const r=await editor.context().request.get(playUrl,{headers:{Range:range}});assert.equal(r.status(),206);assert.equal(r.headers()['content-range'],`bytes ${start}-${end}/${videoBytes.length}`);assert.deepEqual(await r.body(),videoBytes.subarray(start,end+1));
 }
 assert.equal((await editor.context().request.get(playUrl,{headers:{Range:'bytes=999999999-'}})).status(),416);
 const multi=await editor.context().request.get(playUrl,{headers:{Range:'bytes=0-1,5-6'}});assert.equal(multi.status(),200);assert.deepEqual(await multi.body(),videoBytes);
 assert.equal((await owner.context().request.get(playUrl)).status(),404);assert.equal((await fetch(playUrl)).status,401);
 assert.equal((await editor.context().request.get(playUrl,{headers:{Authorization:'Bearer once_machine.synthetic'}})).status(),403);
 mkdirSync('artifacts/talent-experience-pr03',{recursive:true});await editor.screenshot({path:'artifacts/talent-experience-pr03/video-playback.png',fullPage:true});
 assert.equal((await cmd(editor,'POST','/assets/'+videoAsset.id+'/quarantine',{expectedRevision:videoAsset.revision},403)).error.code,'FORBIDDEN');
 const memberId=(await json(editor,'/me')).membershipId,member=await prisma.membership.findUniqueOrThrow({where:{id:memberId}});
 await cmd(owner,'PATCH','/memberships/'+memberId+'/permissions',{expectedRevision:member.revision,role:'REVIEWER',extraPermissions:[]});await login(editor,'m1_editor');
 await cmd(editor,'POST','/assets/'+videoAsset.id+'/quarantine',{expectedRevision:videoAsset.revision});
 await cmd(owner,'PATCH','/memberships/'+memberId+'/permissions',{expectedRevision:member.revision+1,role:'EDITOR',extraPermissions:[]});await login(editor,'m1_editor');
 assert.equal((await editor.context().request.get(playUrl,{headers:{Range:'bytes=0-15'}})).status(),404);
 console.log('PASS PR03 playback: real H264/AAC + worker + PostgreSQL + native play/seek + exact Range + private scope + next-request quarantine');

 // Queue malformed and cancelled files using real bounded binary API, not response mocks.
 const bad=Buffer.from('<html>not a png</html>'),b=await prepare(editor,person,bad,'invalid.png');assert.equal((await binary(editor,b.resourceId,bad)).status(),200);await queue(editor,b.resourceId);
 await until(async()=>(await prisma.mediaUpload.findUniqueOrThrow({where:{id:b.resourceId}})).state==='FAILED');assert.equal(await prisma.mediaAsset.count({where:{id:b.resourceId}}),0);assert.equal(await getStatus(editor,'/assets/'+b.resourceId+'/preview'),404);
 const cancelled=await prepare(editor,person,image,'cancelled.png');await cmd(editor,'POST','/uploads/'+cancelled.resourceId+'/cancel',{expectedRevision:1});assert.equal((await binary(editor,cancelled.resourceId,image)).status(),409);assert.equal(await prisma.mediaAsset.count({where:{id:cancelled.resourceId}}),0);
 console.log('PASS M1 API/worker: disguised HTML and cancelled upload produce no accessible asset');
 // Owner has native scope for this second image, hence may explicitly suspend its source.
 const rp=await cmd(owner,'POST','/people',{displayName:'M1暂停检查',roles:['model'],inlineSource:{title:'合成暂停来源',type:'MANUAL',providerClaim:'合成',basisMode:'TEMP_ORGANIZE',basisDescription:'合成数据，隔离使用'}},201);
 const pp=await prisma.person.findUniqueOrThrow({where:{id:rp.resourceId}}),q=await prepare(owner,pp,image,'owner.png');assert.equal((await binary(owner,q.resourceId,image)).status(),200);await queue(owner,q.resourceId);
 await until(async()=>(await prisma.mediaUpload.findUniqueOrThrow({where:{id:q.resourceId}})).state==='READY');assert.equal(await getStatus(owner,'/assets/'+q.resourceId+'/preview'),200);
 await cmd(owner,'POST','/assets/'+q.resourceId+'/quarantine',{expectedRevision:1});assert.equal(await getStatus(owner,'/assets/'+q.resourceId+'/preview'),404);
 // Separate still-READY asset verifies that source revocation, not only asset quarantine, is effective.
 const q2=await prepare(owner,pp,image,'source-suspend.png');assert.equal((await binary(owner,q2.resourceId,image)).status(),200);await queue(owner,q2.resourceId);await until(async()=>(await prisma.mediaUpload.findUniqueOrThrow({where:{id:q2.resourceId}})).state==='READY');
 const ss=await prisma.sourceRecord.findUniqueOrThrow({where:{id:pp.sourceId}});await cmd(owner,'POST','/sources/'+ss.id+'/suspend',{expectedRevision:ss.revision,reason:'合成暂停'});
 assert.equal(await getStatus(owner,'/assets/'+q2.resourceId+'/preview'),404);assert.equal((await json(owner,'/assets?personId='+pp.id)).total,0);
 console.log('PASS M1 API: quarantine and current source suspension deny subsequent preview requests');
 assert.deepEqual(errors,[]);
}finally{await browserOwner?.close();await stop(worker);await stop(api);await prisma.$disconnect();ownedTemp.cleanup();}
