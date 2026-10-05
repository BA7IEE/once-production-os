import {navigateWorkspace} from './support/workspace-navigation.mjs';
import {registeredTemp} from '../../scripts/registered-temp.mjs';
import {registeredBrowser} from '../../scripts/registered-browser.mjs';
let browserOwner;
/** Internal intake slice only: real Nest, Prisma, disposable PostgreSQL and Chromium.
 * No portal, SMS/email, COS or production acceptance is implied. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync,writeFileSync,mkdirSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn,spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';
const raw=process.env.DATABASE_URL_TEST;
assert.equal(process.env.ALLOW_BROWSER_TESTS,'yes');assert.ok(raw);
const url=new URL(raw);assert.ok(['postgres:','postgresql:'].includes(url.protocol));assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));assert.match(url.pathname,/^\/once_test_[a-z0-9_]+$/);assert.ok(url.username&&url.password&&!url.search&&!url.hash);
const prisma=new PrismaClient({datasources:{db:{url:raw}},log:[]});
const ownedTemp=registeredTemp();
const tmp=ownedTemp.path,password='Synthetic-'+randomBytes(20).toString('base64url')+'!';
const put=(name,text)=>{const path=join(tmp,name);writeFileSync(path,text,{mode:0o600});return path;};
const env={...process.env,DATABASE_URL:raw,APP_ENV:'test',ACCESS_MODE:'INTERNAL',COOKIE_SECURE:'false',HOST:'127.0.0.1',CONTACT_KEY_FILE:put('contact.hex',randomBytes(32).toString('hex')),CSRF_KEY_FILE:put('csrf.hex',randomBytes(32).toString('hex')),RECOVERY_EPOCH_FILE:put('recovery.epoch',randomBytes(24).toString('hex')),BOOTSTRAP_LOGIN:'owner',BOOTSTRAP_NAME:'合成快速建档管理员',BOOTSTRAP_PASSWORD_FILE:put('bootstrap.password',password)};
const evidence='artifacts/talent-experience';mkdirSync(evidence,{recursive:true});
let api,browser,base,fault=false;const errors=[],checks=[];
const record=name=>{checks.push(name);console.log('PASS '+name);};
function run(command,args){const r=spawnSync(command,args,{env,encoding:'utf8',timeout:120000});assert.equal(r.status,0,(r.stderr??'').slice(-1200));}
async function stop(child){if(!child||child.exitCode!==null||child.signalCode!==null)return;await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},5000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill('SIGINT');});}
async function login(page,name='owner'){await page.goto(base,{waitUntil:'networkidle'});await page.locator('input[autocomplete=username]').fill(name);await page.locator('input[autocomplete=current-password]').fill(password);await page.getByRole('button',{name:'登录',exact:true}).click();await page.locator('.topbar').getByText('工作空间 / 工作台',{exact:true}).waitFor();}
async function command(page,path,input,key=randomUUID()){
 const me=await page.context().request.get(base+'/api/v1/me');assert.equal(me.status(),200);const who=await me.json();
 const response=await page.context().request.post(base+'/api/v1'+path,{data:input,headers:{Origin:base,'X-CSRF-Token':who.csrfToken,'X-ONCE-Membership':who.membershipId,'Idempotency-Key':key}});
 return {status:response.status(),body:await response.json()};
}
async function openForm(page){await navigateWorkspace(page,'人才库');assert.equal(await page.getByRole('button',{name:'新建人物',exact:true}).count(),0);await page.getByRole('button',{name:/新增人才/}).click();return page.getByRole('dialog',{name:'新增人才',exact:true});}
const input={schemaVersion:'once-talent-experience-v1',displayName:'PG并发合成模特',kind:'TALENT'};
try{
 assert.equal((await prisma.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).length,0,'Require empty DB; no reset.');
 run('pnpm',['db:deploy']);const net=createServer();await new Promise(r=>net.listen(0,'127.0.0.1',r));env.PORT=String(net.address().port);await new Promise(r=>net.close(r));base='http://127.0.0.1:'+env.PORT;env.APP_ORIGIN=base;run('node',['dist/apps/api/src/bootstrap.js']);
 api=spawn('node',['dist/apps/api/src/main.js'],{env,stdio:['ignore','pipe','pipe']});api.stdout.resume();api.stderr.resume();
 const end=Date.now()+20000;for(;;){try{if((await fetch(base+'/health/ready')).status===200)break;}catch{}assert.ok(Date.now()<end,'Service readiness');await new Promise(r=>setTimeout(r,100));}
 browserOwner=await registeredBrowser(chromium,{headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});browser=browserOwner.browser;const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await login(page);
 const key=randomUUID(),pair=await Promise.all([command(page,'/directory/talents',input,key),command(page,'/directory/talents',input,key)]);
 assert.ok(pair.every(r=>r.status===201),JSON.stringify(pair));assert.equal(pair[0].body.resourceId,pair[1].body.resourceId);assert.equal(await prisma.person.count(),1);assert.equal(await prisma.personRole.count(),1);assert.equal(await prisma.talentProfile.count(),1);assert.equal(await prisma.commandReceipt.count({where:{operation:'directory.talent.create'}}),1);record('PostgreSQL same-key concurrency creates exactly one typed person and receipt');
 const before=await Promise.all([prisma.person.count(),prisma.sourceRecord.count(),prisma.accessScope.count(),prisma.talentProfile.count(),prisma.personRole.count(),prisma.commandReceipt.count()]);
 await prisma.$executeRawUnsafe(`CREATE FUNCTION once_te_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action"='directory.talent.create' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END; $$`);
 await prisma.$executeRawUnsafe('CREATE TRIGGER once_te_fail_audit BEFORE INSERT ON "audits" FOR EACH ROW EXECUTE FUNCTION once_te_fail_audit()');fault=true;
 const faultKey=randomUUID();assert.equal((await command(page,'/directory/talents',{...input,displayName:'PG回滚合成模特'},faultKey)).status,503);
 assert.deepEqual(await Promise.all([prisma.person.count(),prisma.sourceRecord.count(),prisma.accessScope.count(),prisma.talentProfile.count(),prisma.personRole.count(),prisma.commandReceipt.count()]),before);
 await prisma.$executeRawUnsafe('DROP TRIGGER once_te_fail_audit ON "audits"');await prisma.$executeRawUnsafe('DROP FUNCTION once_te_fail_audit()');fault=false;
 assert.equal((await command(page,'/directory/talents',{...input,displayName:'PG回滚合成模特'},faultKey)).status,201);record('PostgreSQL audit fault rolls back all composed writes; original key retries');
 let form=await openForm(page);await form.getByLabel('姓名 / 艺名 *').fill('浏览器合成同档多职业');await form.getByRole('checkbox',{name:'演员',exact:true}).check();
 const sends=[];page.on('request',r=>{if(r.url().endsWith('/directory/talents')&&r.method()==='POST')sends.push({key:r.headers()['idempotency-key'],body:r.postData()});});
 const pattern='**/api/v1/directory/talents';const lose=async route=>{const upstream=await route.fetch();assert.equal(upstream.status(),201);await route.abort('failed');};await page.route(pattern,lose);
 await form.getByRole('button',{name:'保存草稿',exact:true}).click();await form.getByRole('button',{name:'原样重试建档',exact:true}).waitFor();assert.equal(await form.getByLabel('姓名 / 艺名 *').isDisabled(),true);assert.equal(await form.getByRole('button',{name:'取消',exact:true}).isDisabled(),true);await page.keyboard.press('Escape');assert.equal(await form.isVisible(),true);
 await page.unroute(pattern,lose);const replay=page.waitForResponse(r=>r.url().endsWith('/directory/talents')&&r.request().method()==='POST');await form.getByRole('button',{name:'原样重试建档',exact:true}).click();const res=await replay;assert.equal(res.status(),201);const receipt=await res.json();assert.equal(receipt.replayed,true);await form.waitFor({state:'detached'});assert.deepEqual(sends[0],sends[1]);
 const person=await prisma.person.findUniqueOrThrow({where:{id:receipt.resourceId}}),source=await prisma.sourceRecord.findUniqueOrThrow({where:{id:person.sourceId}});assert.equal(source.basisMode,'TEMP_ORGANIZE');assert.equal(source.status,'RECEIVED');assert.equal(source.reviewedBy,null);assert.equal(await prisma.personRole.count({where:{personId:person.id}}),2);assert.equal(await prisma.talentProfile.count({where:{personId:person.id}}),1);record('Browser name-only intake, multi-role and lost response replay keep one person');
 await page.getByRole('button',{name:'← 返回目录',exact:true}).click();form=await openForm(page);await form.getByLabel('姓名 / 艺名 *').fill('浏览器合成普通联系人');await form.getByLabel('建档类型').selectOption('CONTACT');
 for(const width of [360,390,430,1280]){await page.setViewportSize({width,height:850});assert.ok(await form.evaluate(el=>el.scrollWidth<=el.clientWidth),`form overflow at ${width}`);await page.screenshot({path:join(evidence,`intake-${width}.png`),fullPage:true});}
 const contactRes=page.waitForResponse(r=>r.url().endsWith('/directory/talents')&&r.request().method()==='POST');await form.getByRole('button',{name:'保存草稿',exact:true}).click();const contactId=(await (await contactRes).json()).resourceId;await form.waitFor({state:'detached'});assert.equal(await prisma.talentProfile.count({where:{personId:contactId}}),0);assert.equal(await prisma.personRole.count({where:{personId:contactId}}),0);record('Browser contact branch creates no professional record; form fits 360/390/430/1280');
 const viewer=await command(page,'/memberships',{loginName:'te_viewer',displayName:'合成只读成员',role:'VIEWER',extraPermissions:[]});assert.equal(viewer.status,201);
 const viewerPage=await browser.newPage();await viewerPage.goto(base+'/activate',{waitUntil:'networkidle'});await viewerPage.getByLabel('激活凭证').fill(viewer.body.activationToken);await viewerPage.getByLabel('设置密码（至少 12 个字符）').fill(password);await viewerPage.getByRole('button',{name:'激活账号',exact:true}).click();await viewerPage.getByText('账号已激活').waitFor();await login(viewerPage,'te_viewer');await navigateWorkspace(viewerPage,'人才库');assert.equal(await viewerPage.getByRole('button',{name:/新增人才/}).count(),0);assert.equal((await command(viewerPage,'/directory/talents',input)).status,403);assert.equal((await viewerPage.context().request.get(base+'/api/v1/people/'+person.id)).status(),404);record('Real viewer UI/API refuse creation and restricted person access');
 assert.deepEqual(errors,[]);
 const version=await prisma.$queryRawUnsafe('SELECT version()');writeFileSync(join(evidence,'browser-verification.json'),JSON.stringify({status:'BROWSER_TESTED',database:version[0].version,checks,scope:'PR-01a internal intake only',providers:'NOT_RUN',errors},null,2)+'\n');
}finally{
 if(fault){await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS once_te_fail_audit ON "audits"');await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS once_te_fail_audit()');}
 await browserOwner?.close();await stop(api);await prisma.$disconnect();ownedTemp.cleanup();
}
