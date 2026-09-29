import { test, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { call, resetTransport, acknowledgeSecretInspection, unresolvedCommands, suspendTransport, pendingCommands, replayPending } from '../../apps/admin-web/src/api.ts';
const original = globalThis.fetch;
(globalThis as unknown as {
    window: EventTarget;
}).window = new EventTarget();
afterEach(() => { globalThis.fetch = original; resetTransport(); });
const actorId='12345678-1234-4234-8234-123456789abc';
async function identify(id=actorId){const saved=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({membershipId:id,csrfToken:'csrf'}));await call('identity.me',undefined);globalThis.fetch=saved;}
beforeEach(async()=>{await identify()});
const payload = { displayName: '合成前端请求', roles: ['model'], sourceId: '12345678-1234-4234-8234-123456789abc' };
const ok = () => new Response(JSON.stringify({ operationId: actorId, resourceId: actorId, revision: 1, state: 'SUCCEEDED' }), { status: 201, headers: { 'content-type': 'application/json' } });
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
test('HTTP 500 followed by 409 retains the original unresolved key', async () => {
    const keys: string[] = [];
    let status = 500;
    globalThis.fetch = (async (_u, init) => { keys.push((init!.headers as Record<string, string>)['Idempotency-Key']!); return new Response(JSON.stringify({ error: { code: 'TEST_FAILURE', message: 'synthetic' } }), { status }); }) as typeof fetch;
    await assert.rejects(() => call('person.create', payload));
    status = 409;
    await assert.rejects(() => call('person.create', payload));
    assert.equal(keys[0], keys[1]);
    assert.equal(unresolvedCommands().length, 1);
    globalThis.fetch = (async (_u, init) => { keys.push((init!.headers as Record<string, string>)['Idempotency-Key']!); return ok(); }) as typeof fetch;
    await call('person.create', payload);
    assert.equal(keys[1], keys[2]);
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
    globalThis.fetch = (async (_u, init) => { request = init; return new Response(JSON.stringify({membershipId:actorId,csrfToken:'csrf'})); }) as typeof fetch;
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

test('job.resume retains the exact job revision and key across unknown response', async () => {
    const requests: RequestInit[] = [];
    globalThis.fetch = (async (_u, init) => {
        requests.push(init!);
        if (requests.length === 1) throw new Error('resume response lost');
        return new Response(JSON.stringify({ operationId: actorId, resourceId: actorId, revision: 4, state: 'ACCEPTED' }), { status: 202 });
    }) as typeof fetch;
    const params = { id: '12345678-1234-4234-8234-123456789abc' };
    await assert.rejects(() => call('job.resume', { expectedRevision: 3 }, params));
    await assert.rejects(() => call('job.resume', { expectedRevision: 4 }, params), /上次提交结果尚不明确/);
    assert.equal(requests.length, 1);
    const receipt = await call<'job.resume', { state: string }>('job.resume', { expectedRevision: 3 }, params);
    assert.equal(receipt.state, 'ACCEPTED');
    assert.equal(requests[0]!.body, requests[1]!.body);
    assert.equal((requests[0]!.headers as Record<string, string>)['Idempotency-Key'], (requests[1]!.headers as Record<string, string>)['Idempotency-Key']);
});

for(const status of [401,403,404,409,429])test(`lost committed response then ${status} retains original key and one domain write`,async()=>{
 const {fixture,sourceInput}=await import('../support/fixtures.ts');const f=await fixture();await identify(f.membershipId);
 const body={displayName:'合成未决建档',roles:['model'],inlineSource:sourceInput()};let n=0;const keys:string[]=[];
 globalThis.fetch=(async(_u,init)=>{
  const key=(init!.headers as Record<string,string>)['Idempotency-Key']!;keys.push(key);n++;
  if(n===2)return new Response(JSON.stringify({error:{code:'ACCESS_DENIED'}}),{status});
  const r=await f.owner.cmd('POST','/people',JSON.parse(init!.body as string),key);
  if(n===1)throw new Error('committed response lost');
  return new Response(JSON.stringify(r.body),{status:r.status});
 }) as typeof fetch;
 await assert.rejects(call('person.create',body),{unknownOutcome:true});
 await assert.rejects(call('person.create',body),{unknownOutcome:true});
 suspendTransport();await identify(f.membershipId);
 const receipt=await replayPending(keys[0]!) as {replayed:boolean};
 assert.equal(receipt.replayed,true);assert.equal(new Set(keys).size,1);assert.equal(f.store.rows('people').length,1);assert.equal(unresolvedCommands().length,0);
});
for(const response of [{},null,{operationId:actorId,resourceId:actorId,revision:'1',state:'SUCCEEDED'},{operationId:actorId,resourceId:actorId,revision:1,state:'FAILED'}])test('parseable invalid command receipt remains unknown: '+JSON.stringify(response),async()=>{
 globalThis.fetch=async()=>new Response(JSON.stringify(response));
 await assert.rejects(call('person.create',payload),{code:'RECEIPT_INVALID',unknownOutcome:true});assert.equal(unresolvedCommands().length,1);
});
test('another membership cannot replay the original request; original membership can recover after logout',async()=>{
 globalThis.fetch=async()=>{throw new Error('lost')};await assert.rejects(call('person.create',payload));const key=unresolvedCommands()[0]!;
 suspendTransport();await identify('22345678-1234-4234-8234-123456789abc');assert.equal(pendingCommands().length,0);await assert.rejects(replayPending(key),{code:'PENDING_IDENTITY_REQUIRED'});
 await identify();globalThis.fetch=async()=>ok();await replayPending(key);assert.equal(unresolvedCommands().length,0);
});
test('first definitive rejection permits a corrected new command',async()=>{
 globalThis.fetch=async()=>new Response(JSON.stringify({error:{code:'REVISION_CONFLICT'}}),{status:409});
 await assert.rejects(call('person.create',payload),{unknownOutcome:false});assert.equal(unresolvedCommands().length,0);
});
test('server rejects stale membership binding after another tab switches identity',async()=>{
 const {fixture,member,sourceInput}=await import('../support/fixtures.ts');const f=await fixture(),other=await member(f,'other-editor');
 const r=await other.client.raw('POST','/people',{displayName:'不得跨账号创建',roles:['model'],inlineSource:sourceInput()},{'idempotency-key':crypto.randomUUID(),'x-once-membership':f.membershipId});
 assert.equal(r.status,409);assert.equal((r.body as any).error.code,'IDENTITY_CHANGED');assert.equal(f.store.rows('people').length,0);
});
test('reload stores only a pending marker and requires explicit inspection before new commands',async()=>{
 const saved=(globalThis as any).sessionStorage,values=new Map<string,string>();
 (globalThis as any).sessionStorage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)};
 try{
  globalThis.fetch=async()=>{throw new Error('lost')};await assert.rejects(call('person.create',payload));assert.deepEqual([...values.values()],['1']);
  const fresh=await import('../../apps/admin-web/src/api.ts?reload-test');
  globalThis.fetch=async()=>new Response(JSON.stringify({membershipId:actorId,csrfToken:'csrf'}));await fresh.call('identity.me',undefined);
  assert.equal(fresh.needsPendingInspection(),true);await assert.rejects(fresh.call('person.create',payload),{code:'PENDING_INSPECTION_REQUIRED'});
  fresh.acknowledgePendingInspection();assert.equal(fresh.needsPendingInspection(),false);
 }finally{(globalThis as any).sessionStorage=saved;}
});
