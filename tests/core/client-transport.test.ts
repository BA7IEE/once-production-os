import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { call, resetTransport, acknowledgeSecretInspection, unresolvedCommands } from '../../apps/admin-web/src/api.ts';
const original = globalThis.fetch;
(globalThis as unknown as {
    window: EventTarget;
}).window = new EventTarget();
afterEach(() => { globalThis.fetch = original; resetTransport(); });
const payload = { displayName: '合成前端请求', roles: ['model'], sourceId: '12345678-1234-4234-8234-123456789abc' };
const ok = () => new Response(JSON.stringify({ operationId: 'op', resourceId: 'id', revision: 1, state: 'SUCCEEDED' }), { status: 201, headers: { 'content-type': 'application/json' } });
test('client preserves exact key after network uncertainty and replays only original payload', async () => {
    const requests: RequestInit[] = [];
    globalThis.fetch = (async (_url, init) => {
        requests.push(init!);
        if (requests.length === 1)
            throw new Error('network cut');
        return ok();
    }) as typeof fetch;
    await assert.rejects(() => call('person.create', payload));
    assert.equal(unresolvedCommands().length, 1);
    await assert.rejects(() => call('person.create', { ...payload, displayName: '另一份' }));
    assert.equal(requests.length, 1);
    await call('person.create', payload);
    assert.equal((requests[0]!.headers as Record<string, string>)['Idempotency-Key'], (requests[1]!.headers as Record<string, string>)['Idempotency-Key']);
    assert.equal(unresolvedCommands().length, 0);
});
test('HTTP 500 retains key, authoritative 409 releases it', async () => {
    const keys: string[] = [];
    let status = 500;
    globalThis.fetch = (async (_u, init) => { keys.push((init!.headers as Record<string, string>)['Idempotency-Key']!); return new Response(JSON.stringify({ error: { code: 'TEST_FAILURE', message: 'synthetic' } }), { status }); }) as typeof fetch;
    await assert.rejects(() => call('person.create', payload));
    status = 409;
    await assert.rejects(() => call('person.create', payload));
    assert.equal(keys[0], keys[1]);
    assert.equal(unresolvedCommands().length, 0);
    globalThis.fetch = (async (_u, init) => { keys.push((init!.headers as Record<string, string>)['Idempotency-Key']!); return ok(); }) as typeof fetch;
    await call('person.create', payload);
    assert.notEqual(keys[1], keys[2]);
});
test('unknown activation issuance is not silently repeated', async () => {
    let calls = 0;
    globalThis.fetch = (async () => { calls++; throw new Error('cut'); }) as typeof fetch;
    const member = { loginName: 'new-member', displayName: '合成成员', role: 'VIEWER' as const, extraPermissions: [] };
    await assert.rejects(() => call('member.create', member));
    await assert.rejects(() => call('member.create', member));
    assert.equal(calls, 1);
    acknowledgeSecretInspection();
    globalThis.fetch = (async () => { calls++; return new Response(JSON.stringify({ error: { code: 'LOGIN_ALREADY_EXISTS', message: '已存在' } }), { status: 409 }); }) as typeof fetch;
    await assert.rejects(() => call('member.create', member));
    assert.equal(calls, 2);
});
test('transport uses same-origin cookies, no cache and rejects redirects', async () => {
    let request: RequestInit | undefined;
    globalThis.fetch = (async (_u, init) => { request = init; return new Response('{}'); }) as typeof fetch;
    await call('identity.me', undefined);
    assert.equal(request!.credentials, 'same-origin');
    assert.equal(request!.cache, 'no-store');
    assert.equal(request!.redirect, 'error');
});
test('malformed success response keeps command unresolved', async () => {
    globalThis.fetch = (async () => new Response('<html>proxy error</html>', { status: 200 })) as typeof fetch;
    await assert.rejects(() => call('person.create', payload));
    assert.equal(unresolvedCommands().length, 1);
});
test('server session failure notifies UI and never exposes server secrets', async () => {
    let expired = 0;
    const fn = () => expired++;
    window.addEventListener('once-session-expired', fn);
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { code: 'SESSION_INVALID', message: '请重新登录' } }), { status: 401 })) as typeof fetch;
    await assert.rejects(() => call('identity.me', undefined));
    assert.equal(expired, 1);
    window.removeEventListener('once-session-expired', fn);
});
