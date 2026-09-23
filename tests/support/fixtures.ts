import { randomBytes, randomUUID } from 'node:crypto';
import { Application } from '../../packages/core/src/api.ts';
import type { ApiResponse } from '../../packages/core/src/api.ts';
import type { Clock, Role } from '../../packages/core/src/model.ts';
import { MemoryStore } from './memory-store.ts';
export class FakeClock implements Clock {
    value = Date.parse('2026-09-23T08:00:00.000Z');
    now(): Date { return new Date(this.value); }
    advance(ms: number): void { this.value += ms; }
}
export const SYNTHETIC_PASSWORD = 'Only-for-synthetic-tests!23';
export class Client {
    app: Application;
    jar: Record<string, string> = {};
    csrf = '';
    ip: string;
    constructor(app: Application, ip = '127.0.0.1') { this.app = app; this.ip = ip; }
    async raw(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, rawBody?: string): Promise<ApiResponse> {
        const response = await this.app.handle({ method, url: '/api/v1' + path, ip: this.ip,
            body: rawBody ?? JSON.stringify(body ?? {}), headers: { origin: this.app.config.origin, cookie: Object.entries(this.jar).map(([k, v]) => k + '=' + v).join('; '),
                'content-type': 'application/json', 'x-csrf-token': this.csrf, ...headers } });
        for (const cookie of response.cookies) {
            const [pair] = cookie.split(';');
            const at = pair!.indexOf('=');
            this.jar[pair!.slice(0, at)] = pair!.slice(at + 1);
        }
        return response;
    }
    async login(loginName = 'owner', password = SYNTHETIC_PASSWORD): Promise<ApiResponse> {
        const first = await this.raw('GET', '/auth/csrf');
        this.csrf = (first.body as {
            csrfToken: string;
        }).csrfToken;
        const response = await this.raw('POST', '/auth/login', { loginName, password });
        if (response.status === 200)
            this.csrf = (response.body as {
                csrfToken: string;
            }).csrfToken;
        return response;
    }
    async activate(token: string): Promise<ApiResponse> {
        const first = await this.raw('GET', '/auth/csrf');
        this.csrf = (first.body as {
            csrfToken: string;
        }).csrfToken;
        return this.raw('POST', '/auth/activate', { token, password: SYNTHETIC_PASSWORD });
    }
    async cmd(method: string, path: string, body: unknown, key = randomUUID()): Promise<ApiResponse> { return this.raw(method, path, body, { 'idempotency-key': key }); }
}
export const result = (r: ApiResponse): Record<string, any> => r.body as Record<string, any>;
export function newSystem() {
    const store = new MemoryStore();
    const clock = new FakeClock();
    const app = new Application(store, { origin: 'https://os.test.invalid', secureCookies: true,
        contactKey: randomBytes(32), csrfKey: randomBytes(32), recoveryEpoch: randomBytes(24).toString('hex'), accessMode: 'INTERNAL', environment: 'test' }, clock);
    return { store, clock, app, owner: new Client(app) };
}
export async function fixture() { const f = newSystem(); const ids = await f.app.identity.bootstrap('owner', '测试管理员', SYNTHETIC_PASSWORD); await f.owner.login(); return { ...f, ...ids }; }
export async function member(f: Awaited<ReturnType<typeof fixture>>, name: string, role: Role = 'EDITOR', extras: string[] = []) {
    const created = await f.owner.raw('POST', '/memberships', { loginName: name, displayName: '测试 ' + name, role, extraPermissions: extras });
    if (created.status !== 201)
        throw new Error(JSON.stringify(created.body));
    const client = new Client(f.app, '192.0.2.' + (10 + f.store.rows('memberships').length));
    await client.activate(result(created).activationToken);
    await client.login(name);
    return { client, id: result(created).membershipId as string, created };
}
export function sourceInput(temporary = false) {
    return { title: '本人主动提供的测试资料', type: 'MANUAL', providerClaim: '合成人物本人', basisMode: temporary ? 'TEMP_ORGANIZE' : 'INTERNAL_USE',
        basisDescription: '合成资料，只用于自动化测试，不代表真实授权', ...(temporary ? {} : { validUntil: '2026-12-31T00:00:00.000Z' }) };
}
export async function createPerson(client: Client, name = '合成摄影师', temporary = false) {
    const r = await client.cmd('POST', '/people', { displayName: name, roles: ['photographer', 'editor'], inlineSource: sourceInput(temporary) });
    if (r.status !== 201)
        throw new Error(JSON.stringify(r.body));
    return result(r).resourceId as string;
}
