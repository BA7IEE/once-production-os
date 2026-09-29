/** Real browser + API + Worker + PostgreSQL acceptance on a fresh, disposable loopback DB.
 * The SQL trigger is installed only in this empty test database and is removed after each fault.
 * No production entrypoint or business table is reset or deleted.
 */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';
import { captureImportCheckpoint, assertImportCheckpointUnchanged } from './support/import-checkpoint.mjs';

const raw = process.env.DATABASE_URL_TEST;
assert.equal(process.env.ALLOW_BROWSER_TESTS, 'yes', 'Set ALLOW_BROWSER_TESTS=yes only for a fresh, disposable browser test database.');
assert.ok(raw, 'DATABASE_URL_TEST is required; .env is never a test target.');
const url = new URL(raw);
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
assert.match(url.pathname, /^\/once_test_[a-z0-9_]+$/);
assert.ok(url.username && url.password && !url.search && !url.hash);

const tmp = mkdtempSync(join(tmpdir(), 'once-browser-resume-'));
const password = 'Synthetic-' + randomBytes(20).toString('base64url') + '!';
const put = (name, value) => { const p = join(tmp, name); writeFileSync(p, value, { mode: 0o600 }); return p; };
const contact = put('contact.hex', randomBytes(32).toString('hex'));
const csrf = put('csrf.hex', randomBytes(32).toString('hex'));
const epoch = put('recovery.epoch', randomBytes(24).toString('hex'));
const bootstrapPassword = put('bootstrap.password', password);
const suffix = randomBytes(4).toString('hex');
const prisma = new PrismaClient({ datasources: { db: { url: raw } }, log: [] });
let apiProcess, workerProcess, browser, triggerInstalled = false;
let base;
const appEnv = { ...process.env, DATABASE_URL: raw, APP_ENV: 'test', ACCESS_MODE: 'INTERNAL', COOKIE_SECURE: 'false',
    CONTACT_KEY_FILE: contact, CSRF_KEY_FILE: csrf, RECOVERY_EPOCH_FILE: epoch,
    BOOTSTRAP_LOGIN: 'owner', BOOTSTRAP_NAME: '浏览器合成管理员', BOOTSTRAP_PASSWORD_FILE: bootstrapPassword,
    HOST: '127.0.0.1' };

async function eventually(check, label, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    let last;
    while (Date.now() < deadline) {
        try { if (await check()) return; } catch (error) { last = error; }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${label}${last ? ': ' + last.message : ''}`);
}
function run(command, args) {
    const result = spawnSync(command, args, { env: appEnv, encoding: 'utf8', timeout: 120000 });
    if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${(result.stderr ?? '').slice(-1000)}`);
}
function launch(command, args) {
    const child = spawn(command, args, { env: appEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.resume(); child.stderr.resume();
    return child;
}
async function stop(child) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGINT');
    let timer;
    await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        new Promise(resolve => { timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000); })
    ]);
    clearTimeout(timer);
}
async function freePort() {
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    return port;
}
async function installSecondRowFault() {
    assert.equal(triggerInstalled, false);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION once_acceptance_fail_second() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW."displayName" LIKE 'acceptance-%-second' THEN
                RAISE EXCEPTION 'synthetic second-row failure' USING ERRCODE = 'P0001';
            END IF;
            RETURN NEW;
        END; $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER once_acceptance_fail_second BEFORE INSERT ON "people" FOR EACH ROW EXECUTE FUNCTION once_acceptance_fail_second()');
    triggerInstalled = true;
}
async function removeSecondRowFault() {
    if (!triggerInstalled) return;
    await prisma.$executeRawUnsafe('DROP TRIGGER once_acceptance_fail_second ON "people"');
    await prisma.$executeRawUnsafe('DROP FUNCTION once_acceptance_fail_second()');
    triggerInstalled = false;
}
async function login(page, loginName, secret) {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('input[autocomplete=username]').fill(loginName);
    await page.locator('input[autocomplete=current-password]').fill(secret);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByRole('button', { name: /概览/ }).waitFor();
}
async function token(page) {
    const response = await page.context().request.get(base + '/api/v1/me');
    assert.equal(response.status(), 200);
    return (await response.json()).csrfToken;
}
async function requestCommand(page, method, path, data, expected = 200, csrfToken = null) {
    const response = await page.context().request.fetch(base + '/api/v1' + path, {
        method, data, headers: { Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken ?? await token(page),
            'Idempotency-Key': randomUUID() } });
    const body = await response.json();
    assert.equal(response.status(), expected, `${method} ${path}: ${body.error?.code ?? response.status()}`);
    return body;
}
async function source(page, label) {
    const body = await requestCommand(page, 'POST', '/sources', {
        title: label, type: 'MANUAL', providerClaim: '合成测试', basisMode: 'INTERNAL_USE',
        basisDescription: '仅用于隔离浏览器验收的合成资料', validUntil: new Date(Date.now() + 86400000).toISOString()
    }, 201);
    return body.resourceId;
}
async function queueByApi(page, sourceId, label) {
    const preview = await requestCommand(page, 'POST', '/imports/preview', { sourceId, rows: [
        { displayName: label + '-first', roles: ['model'] }, { displayName: label + '-second', roles: ['editor'] }
    ] }, 201);
    const committed = await requestCommand(page, 'POST', '/imports/' + preview.resourceId + '/commit',
        { expectedRevision: 1, selectedRows: [0, 1] }, 202);
    return { jobId: committed.resourceId, batchId: preview.resourceId };
}
async function queueInBrowser(page, sourceTitle, label) {
    await page.getByRole('button', { name: /批量导入/ }).click();
    await page.getByLabel('本批资料来源').selectOption({ label: sourceTitle });
    await page.getByLabel('JSON 数据').fill(JSON.stringify([
        { displayName: label + '-first', roles: ['model'] }, { displayName: label + '-second', roles: ['editor'] }
    ]));
    await page.getByRole('button', { name: '生成预览，不写入人才' }).click();
    await page.getByText('预览与逐行结果').waitFor();
    const committed = page.waitForResponse(response => response.url().includes('/commit') && response.request().method() === 'POST');
    await page.getByRole('button', { name: /提交 2 行到后台任务/ }).click();
    const response = await committed;
    assert.equal(response.status(), 202);
    return (await response.json()).resourceId;
}
function row(page, jobId) { return page.locator(`tr[data-job-id="${jobId}"]`); }
async function partial(page, jobId, label) {
    await page.getByRole('button', { name: '刷新任务' }).click();
    await row(page, jobId).getByText('部分完成').waitFor();
    await row(page, jobId).getByRole('button', { name: '继续处理未完成行' }).waitFor();
    const job = await prisma.durableJob.findUniqueOrThrow({ where: { id: jobId } });
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: job.aggregateId } });
    assert.equal(job.state, 'FAILED');
    assert.deepEqual(batch.rows.map(value => value.state), ['IMPORTED', 'VALID']);
    assert.equal(await prisma.person.count({ where: { displayName: label + '-first' } }), 1);
    assert.equal(await prisma.person.count({ where: { displayName: label + '-second' } }), 0);
    return job;
}
async function failSecond(jobId) {
    await installSecondRowFault();
    workerProcess = launch('node', ['dist/apps/api/src/worker-main.js']);
    await eventually(async () => (await prisma.durableJob.findUnique({ where: { id: jobId } }))?.state === 'FAILED', 'partial job failure');
    await stop(workerProcess); workerProcess = null;
    await removeSecondRowFault();
}

try {
    const tables = await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    assert.equal(tables.length, 0, 'Browser acceptance requires a new, empty once_test_* database; no reset is performed.');
    run('pnpm', ['db:deploy']);
    assert.equal(await prisma.workspace.count(), 0);
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    appEnv.PORT = String(port); appEnv.APP_ORIGIN = base;
    run('node', ['dist/apps/api/src/bootstrap.js']);
    apiProcess = launch('node', ['dist/apps/api/src/main.js']);
    await eventually(async () => (await fetch(base + '/health/ready')).status === 200, 'API readiness');
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
    const owner = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const pageErrors = [];
    owner.on('pageerror', error => pageErrors.push(error.message));
    await login(owner, 'owner', password);

    const positiveTitle = '验收来源-' + suffix;
    const positiveSource = await source(owner, positiveTitle);
    const positiveName = 'acceptance-' + suffix + '-positive';
    const positiveJob = await queueInBrowser(owner, positiveTitle, positiveName);
    await failSecond(positiveJob);
    await partial(owner, positiveJob, positiveName);
    console.log('PASS browser: two-row import shows partial completion after only row 1 commits');

    const path = `**/api/v1/jobs/${positiveJob}/resume`;
    const requests = [];
    owner.on('request', request => {
        if (request.url().endsWith(`/jobs/${positiveJob}/resume`)) requests.push({ key: request.headers()['idempotency-key'], body: request.postData() });
    });
    let dropped = false;
    const abortAfterCommit = async route => {
        const upstream = await route.fetch();
        assert.equal(upstream.status(), 202);
        dropped = true;
        await route.abort('failed');
    };
    await owner.route(path, abortAfterCommit);
    await row(owner, positiveJob).getByRole('button', { name: '继续处理未完成行' }).click();
    await row(owner, positiveJob).getByRole('button', { name: '原样核对上次继续请求' }).waitFor();
    assert.ok(dropped);
    assert.equal((await prisma.durableJob.findUniqueOrThrow({ where: { id: positiveJob } })).state, 'QUEUED');
    await owner.unroute(path, abortAfterCommit);
    const replayedResponse = owner.waitForResponse(response => response.url().endsWith(`/jobs/${positiveJob}/resume`) && response.request().method() === 'POST');
    await row(owner, positiveJob).getByRole('button', { name: '原样核对上次继续请求' }).click();
    const replayed = await replayedResponse;
    assert.equal(replayed.status(), 202);
    assert.equal((await replayed.json()).replayed, true);
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0], requests[1], 'The retry must use the exact original key and body.');
    assert.equal(await prisma.commandReceipt.count({ where: { operation: 'job.resume', resourceId: positiveJob } }), 1);
    workerProcess = launch('node', ['dist/apps/api/src/worker-main.js']);
    await eventually(async () => (await prisma.durableJob.findUnique({ where: { id: positiveJob } }))?.state === 'SUCCEEDED', 'resumed job completion');
    await stop(workerProcess); workerProcess = null;
    await owner.getByRole('button', { name: '刷新任务' }).click();
    await row(owner, positiveJob).getByText('已入库 2 / 2').waitFor();
    assert.equal(await prisma.person.count({ where: { displayName: positiveName + '-first' } }), 1);
    assert.equal(await prisma.person.count({ where: { displayName: positiveName + '-second' } }), 1);
    console.log('PASS browser: lost response replays one receipt, then only row 2 is added');

    for (const changed of ['suspend', 'revision']) {
        const title = `${changed}-来源-${suffix}`;
        const sourceId = await source(owner, title);
        const label = `acceptance-${suffix}-${changed}`;
        const { jobId } = await queueByApi(owner, sourceId, label);
        await failSecond(jobId);
        await partial(owner, jobId, label);
        const before = await captureImportCheckpoint(prisma, jobId);
        if (changed === 'suspend') await requestCommand(owner, 'POST', `/sources/${sourceId}/suspend`, { expectedRevision: 1, reason: '合成暂停验收' });
        else await requestCommand(owner, 'PATCH', `/sources/${sourceId}`, { expectedRevision: 1, title: title + '-新版' });
        await owner.getByRole('button', { name: '刷新任务' }).click();
        await row(owner, jobId).getByText(changed === 'suspend' ? '来源、范围或预览已失效' : '来源已经变更').waitFor();
        assert.equal(await row(owner, jobId).getByRole('button', { name: '继续处理未完成行' }).count(), 0);
        const denied = await requestCommand(owner, 'POST', `/jobs/${jobId}/resume`, { expectedRevision: before.job.revision }, changed === 'suspend' ? 404 : 409);
        assert.equal(denied.error.code, changed === 'suspend' ? 'NOT_FOUND' : 'REVISION_CONFLICT');
        assertImportCheckpointUnchanged(before, await captureImportCheckpoint(prisma, jobId), changed);
        assert.equal(await prisma.person.count({ where: { displayName: label + '-first' } }), 1);
        assert.equal(await prisma.person.count({ where: { displayName: label + '-second' } }), 0);
        console.log(`PASS browser/API: ${changed} blocks resume; job, rows, people and receipts unchanged`);
    }

    const editorLogin = 'editor_' + suffix;
    const created = await requestCommand(owner, 'POST', '/memberships', { loginName: editorLogin, displayName: '合成编辑', role: 'EDITOR', extraPermissions: [] }, 201);
    const editor = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    editor.on('pageerror', error => pageErrors.push(error.message));
    await editor.goto(base + '/activate', { waitUntil: 'networkidle' });
    await editor.getByLabel('激活凭证').fill(created.activationToken);
    await editor.getByLabel('设置密码（至少 12 个字符）').fill(password);
    await editor.getByRole('button', { name: '激活账号' }).click();
    await editor.getByText('账号已激活').waitFor();
    await login(editor, editorLogin, password);
    const permissionSource = await source(owner, '权限验收来源-' + suffix);
    const permissionName = `acceptance-${suffix}-permission`;
    const { jobId: permissionJob } = await queueByApi(editor, permissionSource, permissionName);
    await editor.getByRole('button', { name: /批量导入/ }).click();
    await failSecond(permissionJob);
    await partial(editor, permissionJob, permissionName);
    const beforePermission = await captureImportCheckpoint(prisma, permissionJob);
    await requestCommand(owner, 'PATCH', `/memberships/${created.membershipId}/permissions`,
        { expectedRevision: 1, role: 'VIEWER', extraPermissions: [] });
    const denied = editor.waitForResponse(response => response.url().endsWith(`/jobs/${permissionJob}/resume`) && response.request().method() === 'POST');
    await row(editor, permissionJob).getByRole('button', { name: '继续处理未完成行' }).click();
    assert.equal((await denied).status(), 401);
    await editor.getByText('登录工作空间').waitFor();
    assertImportCheckpointUnchanged(beforePermission, await captureImportCheckpoint(prisma, permissionJob), 'revoked-session');

    // A revoked session (401) is not sufficient: a fresh VIEWER session must be denied (403).
    await login(editor, editorLogin, password);
    const freshMe = await editor.context().request.get(base + '/api/v1/me');
    assert.equal(freshMe.status(), 200);
    const viewer = await freshMe.json();
    assert.equal(viewer.role, 'VIEWER');
    assert.equal(viewer.permissions.includes('records.write'), false);
    assert.equal(await editor.getByRole('button', { name: /批量导入/ }).count(), 0);
    const freshDenied = await requestCommand(editor, 'POST', `/jobs/${permissionJob}/resume`,
        { expectedRevision: beforePermission.job.revision }, 403);
    assert.equal(freshDenied.error.code, 'FORBIDDEN');
    assertImportCheckpointUnchanged(beforePermission, await captureImportCheckpoint(prisma, permissionJob), 'fresh-viewer-session');
    assert.equal(await prisma.person.count({ where: { displayName: permissionName + '-second' } }), 0);
    assert.deepEqual(pageErrors, []);
    console.log('PASS browser/API: revoked session gets 401; fresh viewer gets 403; checkpoints and receipts unchanged');
} finally {
    await stop(workerProcess);
    await browser?.close();
    await stop(apiProcess);
    await removeSecondRowFault();
    await prisma.$disconnect();
    rmSync(tmp, { recursive: true, force: true });
}
