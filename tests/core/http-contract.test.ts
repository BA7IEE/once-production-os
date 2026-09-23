import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { newSystem, SYNTHETIC_PASSWORD, sourceInput } from '../support/fixtures.ts';
import { randomUUID } from 'node:crypto';
/** This adapter is a test-only HTTP harness. It does not validate Nest/Express wiring or PostgreSQL. */
test('loopback HTTP journey: csrf, login, typed create, detail, replay, Origin rejection, logout', async () => {
    const f = newSystem();
    f.app.config.secureCookies = false;
    let origin = '';
    const server = createServer(async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req)
            chunks.push(Buffer.from(chunk));
        const headers: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(req.headers))
            headers[k] = Array.isArray(v) ? v.join(',') : v;
        const r = await f.app.handle({ method: req.method!, url: req.url!, headers, body: Buffer.concat(chunks).toString('utf8'), ip: req.socket.remoteAddress ?? 'loopback' });
        res.writeHead(r.status, { ...r.headers, 'Content-Type': 'application/json', ...(r.cookies.length ? { 'Set-Cookie': r.cookies } : {}) });
        res.end(JSON.stringify(r.body));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
    f.app.config.origin = origin;
    await f.app.identity.bootstrap('owner', 'HTTP 合成测试', SYNTHETIC_PASSWORD);
    const cookies = new Map<string, string>();
    let csrf = '';
    async function http(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
        const r = await fetch(origin + '/api/v1' + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: [...cookies].map(([k, v]) => k + '=' + v).join('; '), 'X-CSRF-Token': csrf, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
        for (const c of r.headers.getSetCookie()) {
            const [pair] = c.split(';');
            const at = pair!.indexOf('=');
            cookies.set(pair!.slice(0, at), pair!.slice(at + 1));
        }
        const data = await r.json() as Record<string, any>;
        return { r, data };
    }
    try {
        const pre = await http('GET', '/auth/csrf');
        csrf = pre.data.csrfToken;
        const login = await http('POST', '/auth/login', { loginName: 'owner', password: SYNTHETIC_PASSWORD });
        assert.equal(login.r.status, 200);
        csrf = login.data.csrfToken;
        const input = { displayName: 'HTTP 合成摄影师', roles: ['photographer'], inlineSource: sourceInput() };
        const key = randomUUID();
        const made = await http('POST', '/people', input, { 'Idempotency-Key': key });
        assert.equal(made.r.status, 201);
        const id = made.data.resourceId;
        const detail = await http('GET', '/people/' + id);
        assert.equal(detail.data.displayName, input.displayName);
        assert.equal(detail.r.headers.get('Cache-Control'), 'private, no-store');
        const replay = await http('POST', '/people', input, { 'Idempotency-Key': key });
        assert.equal(replay.data.replayed, true);
        assert.equal(replay.data.resourceId, id);
        assert.equal((await http('PATCH', '/people/' + id, { expectedRevision: 1, intro: 'bad origin' }, { Origin: 'https://wrong.invalid', 'Idempotency-Key': randomUUID() })).r.status, 403);
        assert.equal((await http('POST', '/auth/logout', {})).r.status, 200);
        assert.equal((await http('GET', '/people')).r.status, 401);
    }
    finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
        await f.store.close();
    }
});
