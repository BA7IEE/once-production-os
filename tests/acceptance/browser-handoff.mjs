/** H1 real Nest/Prisma/Chromium acceptance. Only an empty disposable loopback test DB.
 * Never reads a .env target, resets a DB, or sends requests to a production host. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';
const raw = process.env.DATABASE_URL_TEST;
assert.equal(process.env.ALLOW_BROWSER_TESTS, 'yes'); assert.ok(raw);
const url = new URL(raw);
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
assert.match(url.pathname, /^\/once_test_[a-z0-9_]+$/);
assert.ok(url.username && url.password && !url.search && !url.hash);
const prisma = new PrismaClient({ datasources: { db: { url: raw } }, log: [] });
const tmp = mkdtempSync(join(tmpdir(), 'once-handoff-'));
const password = 'Synthetic-' + randomBytes(20).toString('base64url') + '!';
const put = (name, text) => { const path = join(tmp, name); writeFileSync(path, text, { mode: 0o600 }); return path; };
const env = { ...process.env, DATABASE_URL: raw, APP_ENV: 'test', ACCESS_MODE: 'INTERNAL', COOKIE_SECURE: 'false', HOST: '127.0.0.1',
    CONTACT_KEY_FILE: put('contact.hex', randomBytes(32).toString('hex')), CSRF_KEY_FILE: put('csrf.hex', randomBytes(32).toString('hex')),
    RECOVERY_EPOCH_FILE: put('recovery.epoch', randomBytes(24).toString('hex')), BOOTSTRAP_LOGIN: 'owner', BOOTSTRAP_NAME: 'H1合成管理员',
    BOOTSTRAP_PASSWORD_FILE: put('bootstrap.password', password) };
let api, browser, base;
function run(command, args) { const r = spawnSync(command, args, { env, encoding: 'utf8', timeout: 120000 }); assert.equal(r.status, 0, command + ' failed: ' + (r.stderr ?? '').slice(-800)); }
async function stop(child) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise(resolve => {
        const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000);
        child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill('SIGINT');
    });
}
async function until(check) { const end = Date.now() + 20000; while (Date.now() < end) { try { if (await check()) return; } catch {} await new Promise(r => setTimeout(r, 100)); } throw new Error('H1 service readiness timeout'); }
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
function hrow(page, id) { return page.locator('[data-handoff-id="' + id + '"]'); }
const errors = [];
try {
    const tables = await prisma.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    assert.equal(tables.length, 0, 'Use a new empty once_test_* database. Existing records are never reset.');
    run('pnpm', ['db:deploy']);
    const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
    env.PORT = String(server.address().port); await new Promise(r => server.close(r));
    base = 'http://127.0.0.1:' + env.PORT; env.APP_ORIGIN = base;
    run('node', ['dist/apps/api/src/bootstrap.js']);
    api = spawn('node', ['dist/apps/api/src/main.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    api.stdout.resume(); api.stderr.resume();
    await until(async () => (await fetch(base + '/health/ready')).status === 200);
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
    const owner = await browser.newPage(), sender = await browser.newPage(), receiver = await browser.newPage();
    for (const page of [owner, sender, receiver]) page.on('pageerror', e => errors.push(e.message));
    await login(owner, 'owner');
    for (const [page, name, role, extraPermissions] of [[sender, 'h1_sender', 'EDITOR', []], [receiver, 'h1_receiver', 'ADMIN', ['sensitive.read', 'sensitive.write']]]) {
        const created = await cmd(owner, 'POST', '/memberships', { loginName: name, displayName: name, role, extraPermissions }, 201);
        await page.goto(base + '/activate', { waitUntil: 'networkidle' });
        await page.getByLabel('激活凭证').fill(created.activationToken);
        await page.getByLabel('设置密码（至少 12 个字符）').fill(password);
        await page.getByRole('button', { name: '激活账号', exact: true }).click();
        await page.getByText('账号已激活').waitFor(); await login(page, name);
    }
    const recipient = await prisma.user.findUniqueOrThrow({ where: { loginName: 'h1_receiver' } });
    const recipientMember = await prisma.membership.findFirstOrThrow({ where: { userId: recipient.id } });
    await sender.getByRole('button', { name: /人才档案/ }).click();
    await sender.getByRole('button', { name: /新增人才/ }).click();
    await sender.getByLabel('姓名 / 艺名 *').fill('H1浏览器私有人才');
    await sender.locator('label.check-chip').filter({ hasText: '模特' }).getByRole('checkbox').check();
    await sender.getByLabel('来源标题 *').fill('H1私有来源');
    await sender.getByLabel('提供者 / 提供方式 *').fill('合成角色主动提供');
    await sender.getByLabel('依据说明 *').fill('仅用于隔离验收，不代表任何真实授权');
    const createdResponse = sender.waitForResponse(r => r.url().endsWith('/people') && r.request().method() === 'POST');
    await sender.getByRole('button', { name: '建立档案', exact: true }).click();
    const created = await createdResponse; assert.equal(created.status(), 201);
    const personId = (await created.json()).resourceId;
    const person = await prisma.person.findUniqueOrThrow({ where: { id: personId } });
    const sourceBefore = await prisma.sourceRecord.findUniqueOrThrow({ where: { id: person.sourceId } });
    const scopesBefore = await prisma.scopeMember.findMany({ orderBy: { id: 'asc' } });
    const sibling = await cmd(sender, 'POST', '/people', { displayName: 'H1同来源但未交接的人才', roles: ['model'], sourceId: person.sourceId }, 201);
    await sender.getByRole('button', { name: '交给指定同事', exact: true }).click();
    await sender.getByLabel('接收同事').selectOption(recipientMember.id);
    await sender.getByRole('checkbox', { name: /我已检查基本字段/ }).check();
    const invitedResponse = sender.waitForResponse(r => r.url().endsWith('/handoffs') && r.request().method() === 'POST');
    await sender.getByRole('button', { name: '发送交接邀请' }).click();
    const invited = await invitedResponse; assert.equal(invited.status(), 201); const handoffId = (await invited.json()).resourceId;
    assert.equal(await getStatus(receiver, '/people/' + personId), 404);
    await receiver.getByRole('button', { name: /资料交接/ }).click();
    await hrow(receiver, handoffId).getByText('待接收', { exact: true }).waitFor();
    assert.equal(await hrow(receiver, handoffId).getByText(person.displayName, { exact: true }).count(), 0);
    console.log('PASS H1 browser: private record offered; pending invitation exposes no profile');

    const path = '**/api/v1/handoffs/' + handoffId + '/accept';
    const requests = [];
    receiver.on('request', request => { if (request.url().endsWith('/handoffs/' + handoffId + '/accept')) requests.push({ key: request.headers()['idempotency-key'], body: request.postData() }); });
    const drop = async route => { const upstream = await route.fetch(); assert.equal(upstream.status(), 200); await route.abort('failed'); };
    await receiver.route(path, drop);
    await hrow(receiver, handoffId).getByRole('button', { name: '接收交接', exact: true }).click();
    await hrow(receiver, handoffId).getByRole('button', { name: '原样核对上次交接操作' }).waitFor();
    await receiver.unroute(path, drop);
    await hrow(receiver, handoffId).getByRole('button', { name: '原样核对上次交接操作' }).click();
    await hrow(receiver, handoffId).getByText('已接收', { exact: true }).waitFor();
    assert.equal(requests.length, 2); assert.deepEqual(requests[0], requests[1]);
    assert.equal(await prisma.commandReceipt.count({ where: { operation: 'handoff.accept', resourceId: handoffId } }), 1);
    await hrow(receiver, handoffId).getByRole('button', { name: '打开档案' }).click();
    await receiver.getByRole('button', { name: '编辑资料', exact: true }).waitFor();
    assert.equal(await receiver.getByRole('button', { name: '查看受限联系方式' }).count(), 0);
    assert.equal(await receiver.getByRole('button', { name: '查看来源', exact: true }).count(), 0);
    for (const path of ['/sources/' + person.sourceId, '/sources/' + person.sourceId + '/history', '/people/' + personId + '/contacts', '/people/' + sibling.resourceId])
        assert.equal(await getStatus(receiver, path), 404, path);
    assert.deepEqual(await prisma.sourceRecord.findUniqueOrThrow({ where: { id: person.sourceId } }), sourceBefore);
    assert.deepEqual(await prisma.scopeMember.findMany({ orderBy: { id: 'asc' } }), scopesBefore);
    console.log('PASS H1 browser/API: lost accept response replayed; source, contacts, history and sibling stay private');

    await receiver.getByRole('button', { name: '编辑资料', exact: true }).click();
    await receiver.getByLabel('简介').fill('H1接收人已整理基本简介');
    await receiver.getByRole('button', { name: '保存新版本' }).click();
    await receiver.getByText('H1接收人已整理基本简介', { exact: true }).waitFor();
    const changed = await prisma.person.findUniqueOrThrow({ where: { id: personId } });
    assert.equal(changed.intro, 'H1接收人已整理基本简介'); assert.equal(changed.maintainerId, person.maintainerId);
    assert.equal(changed.sourceId, person.sourceId); assert.equal(changed.scopeId, person.scopeId);
    await sender.getByRole('button', { name: '关闭', exact: true }).last().click();
    await sender.getByRole('button', { name: /资料交接/ }).click();
    await sender.getByRole('button', { name: '发出的交接', exact: true }).click();
    await hrow(sender, handoffId).getByRole('button', { name: '撤销交接' }).click();
    await hrow(sender, handoffId).getByText('已撤销', { exact: true }).waitFor();
    assert.equal(await getStatus(receiver, '/people/' + personId), 404);
    await cmd(receiver, 'PATCH', '/people/' + personId, { expectedRevision: changed.revision, intro: '不得保存' }, 404);
    assert.equal((await prisma.person.findUniqueOrThrow({ where: { id: personId } })).intro, changed.intro);
    await receiver.getByRole('button', { name: '关闭', exact: true }).last().click();
    await receiver.getByRole('button', { name: '刷新交接' }).click();
    await hrow(receiver, handoffId).getByText('已撤销', { exact: true }).waitFor();
    assert.equal(await hrow(receiver, handoffId).getByRole('button', { name: '打开档案' }).count(), 0);
    console.log('PASS H1 browser/API: delegated edit preserved ownership; revoke denies next read and write');
    assert.deepEqual(errors, []);
} finally {
    await browser?.close(); await stop(api); await prisma.$disconnect(); rmSync(tmp, { recursive: true, force: true });
}
