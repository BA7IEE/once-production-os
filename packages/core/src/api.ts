import { Deletions } from './deletions.ts';
import { Exports } from './exports.ts';
import { TalentSearch } from './talent-search.ts';
import { Shortlists, shortlistFor } from './shortlists.ts';
import { Portfolio } from './portfolio.ts';
import { Projects } from './projects.ts';
import { workFor, projectFor } from './production-policy.ts';
import { Media, assetFor, uploadFor } from './media.ts';
import { randomUUID } from 'node:crypto';
import type { Actor, Clock, CommandReceipt, Config, RequestMeta, Permission } from './model.ts';
import type { Store, Tx } from './store.ts';
import { AppError, fail, invariant, missing } from './errors.ts';
import { Identity } from './identity.ts';
import { Talent } from './talent.ts';
import { Commands } from './commands.ts';
import { authorizeReceipt } from './replay-policy.ts';
import { readSourceHistory } from './source-history.ts';
import { Handoffs, handoffParticipant } from './handoffs.ts';
import { Imports } from './imports.ts';
import { csrfFor, equalSecret, randomSecret } from './crypto.ts';
import { parseStrictJson } from './json.ts';
import { page } from './helpers.ts';
import { requirePermission, scopeVisible, personFor, sourceFor } from './policy.ts';
import { ROUTES, type RouteDefinition } from './routes.ts';
import { uuid } from './validation.ts';
export interface ApiRequest {
    method: string;
    url: string;
    headers: Record<string, string | undefined>;
    body?: string;
    ip: string;
}
export interface ApiResponse {
    status: number;
    body: unknown;
    headers: Record<string, string>;
    cookies: string[];
}
const sessionName = 'once_session';
const preName = 'once_pre_auth';
function cookies(header: string): Record<string, string> {
    const out: Record<string, string> = Object.create(null);
    for (const pair of header.split(';')) {
        const at = pair.indexOf('=');
        if (at < 0)
            continue;
        const key = pair.slice(0, at).trim();
        if (Object.hasOwn(out, key))
            fail(400, 'COOKIE_INVALID', 'Cookie 格式不正确');
        out[key] = pair.slice(at + 1).trim();
    }
    return out;
}
export class Application {
    store: Store;
    clock: Clock;
    config: Config;
    identity: Identity;
    talent: Talent;
    commands: Commands;
    imports: Imports;
    handoffs: Handoffs;
    media: Media;
    portfolio: Portfolio;
    projects: Projects;
    shortlists: Shortlists;
    search: TalentSearch;
    exports: Exports;
    deletions: Deletions;
    constructor(store: Store, config: Config, clock: Clock = { now: () => new Date() }) {
        invariant(config.contactKey.length === 32 && config.csrfKey.length === 32, 'CONFIG_INVALID', '密钥必须为 32 字节', 503);
        const origin = new URL(config.origin);
        invariant(origin.origin === config.origin && !origin.username && !origin.password && ['http:', 'https:'].includes(origin.protocol), 'CONFIG_INVALID', '必须配置精确 Origin', 503);
        invariant(config.environment !== 'production' || (origin.protocol === 'https:' && config.secureCookies), 'CONFIG_INVALID', '生产环境要求 HTTPS 与安全 Cookie', 503);
        invariant(/^[a-zA-Z0-9_-]{16,128}$/.test(config.recoveryEpoch), 'CONFIG_INVALID', '恢复批次编号未配置', 503);
        this.store = store;
        this.clock = clock;
        this.config = config;
        this.identity = new Identity(store, clock, config);
        this.talent = new Talent(clock, config);
        this.portfolio = new Portfolio(clock, this.talent);
        this.projects = new Projects(clock, this.talent);
        this.shortlists = new Shortlists(clock);
        this.search = new TalentSearch(clock);
        this.exports = new Exports(store, clock, config);
        this.deletions = new Deletions(clock);
        this.handoffs = new Handoffs(clock);
        this.media = new Media(store, clock, config);
        this.commands = new Commands(clock);
        this.imports = new Imports(store, clock, config, this.talent);
    }
    private cookie(name: string, value: string, seconds: number): string { return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${this.config.secureCookies ? '; Secure' : ''}`; }
    private preAuthValue(): string { const body = `${randomSecret()}.${this.clock.now().getTime() + 15 * 60000}`; return `${body}.${csrfFor(body, this.config.csrfKey)}`; }
    private checkPreAuth(request: ApiRequest, jar: Record<string, string>): void {
        const value = jar[preName] ?? '';
        const parts = value.split('.');
        const body = parts.slice(0, 2).join('.');
        invariant(parts.length === 3 && (parts[0]?.length ?? 0) >= 32 && Number(parts[1]) > this.clock.now().getTime()
            && equalSecret(parts[2] ?? '', csrfFor(body, this.config.csrfKey))
            && equalSecret(request.headers['x-csrf-token'] ?? '', value), 'CSRF_INVALID', '请刷新登录页面后重试', 403);
    }
    private match(method: string, pathname: string): {
        route: RouteDefinition;
        params: Record<string, string>;
    } {
        for (const route of ROUTES) {
            if (route.method !== method)
                continue;
            const names: string[] = [];
            const pattern = route.path.replace(/\{([a-z]+)\}/g, (_, name: string) => { names.push(name); return '([^/]+)'; });
            const hit = new RegExp('^' + pattern + '$').exec(pathname);
            if (!hit)
                continue;
            const params: Record<string, string> = {};
            names.forEach((name, i) => {
                let part: string;
                try {
                    part = decodeURIComponent(hit[i + 1]!);
                }
                catch {
                    return fail(400, 'PATH_INVALID', '路径编码不正确');
                }
                params[name] = name === 'id' ? uuid.parse(part, 'id') : part;
            });
            return { route, params };
        }
        return missing();
    }
    /** Same session/CSRF/recovery boundary for bounded binary transport; file I/O runs outside this transaction. */
    async authenticated<T>(request: ApiRequest, permission: Permission, work: (tx: Tx, actor: Actor) => Promise<T>): Promise<T> {
        const token = cookies(request.headers.cookie ?? '')[sessionName] ?? '';
        if (request.method !== 'GET') {
            invariant(request.headers.origin === this.config.origin, 'ORIGIN_DENIED', '请求来源不被允许', 403);
            invariant(!!token && equalSecret(request.headers['x-csrf-token'] ?? '', csrfFor(token, this.config.csrfKey)), 'CSRF_INVALID', '会话校验失败', 403);
        }
        return this.store.transaction(async (tx) => { const actor = await this.identity.authenticate(tx, token); requirePermission(actor, permission); return work(tx, actor); });
    }
    async handle(request: ApiRequest): Promise<ApiResponse> {
        const meta: RequestMeta = { requestId: randomUUID(), ip: request.ip };
        const response: ApiResponse = { status: 200, body: null, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Request-Id': meta.requestId }, cookies: [] };
        try {
            const url = new URL(request.url, this.config.origin);
            invariant(url.pathname.startsWith('/api/v1/'), 'NOT_FOUND', '接口不存在', 404);
            const { route, params } = this.match(request.method, url.pathname.slice('/api/v1'.length));
            if (request.method !== 'GET')
                invariant(request.headers.origin === this.config.origin, 'ORIGIN_DENIED', '请求来源不被允许', 403);
            const jar = cookies(request.headers.cookie ?? '');
            const token = jar[sessionName] ?? '';
            const query: Record<string, string> = {};
            for (const [key, value] of url.searchParams) {
                invariant(!Object.hasOwn(query, key), 'QUERY_INVALID', '筛选字段不能重复', 400);
                query[key] = value;
            }
            let data: unknown = {};
            if (route.schema) {
                invariant(request.headers['content-type']?.split(';')[0]?.trim() === 'application/json', 'JSON_REQUIRED', '请求必须使用 application/json', 415);
                data = route.schema.parse(parseStrictJson(request.body || '{}'));
            }
            if (route.operation === 'auth.csrf') {
                const value = this.preAuthValue();
                response.cookies.push(this.cookie(preName, value, 900));
                response.body = { csrfToken: value };
                return response;
            }
            if (route.operation === 'auth.login' || route.operation === 'auth.activate') {
                this.checkPreAuth(request, jar);
                if (route.operation === 'auth.login') {
                    const result = await this.identity.login(data, meta);
                    response.cookies.push(this.cookie(sessionName, result.token, 12 * 60 * 60));
                    response.body = { csrfToken: result.csrfToken };
                }
                else {
                    await this.identity.activate(data, meta);
                    response.body = { state: 'ACTIVATED' };
                }
                response.cookies.push(this.cookie(preName, '', 0));
                return response;
            }
            if (request.method !== 'GET')
                invariant(!!token && equalSecret(request.headers['x-csrf-token'] ?? '', csrfFor(token, this.config.csrfKey)), 'CSRF_INVALID', '会话校验失败，请刷新后重试', 403);
            if (route.operation === 'auth.logout') {
                await this.identity.logout(token, meta);
                response.cookies.push(this.cookie(sessionName, '', 0));
                response.body = { state: 'SIGNED_OUT' };
                return response;
            }
            if (route.operation === 'auth.changePassword') {
                await this.identity.changePassword(token, data, meta);
                response.cookies.push(this.cookie(sessionName, '', 0));
                response.body = { state: 'PASSWORD_CHANGED' };
                return response;
            }
            response.body = await this.store.transaction(async (tx) => {
                const actor = await this.identity.authenticate(tx, token);
                if (route.permission)
                    requirePermission(actor, route.permission);
                const id = params.id ?? '';
                const command = (kind: CommandReceipt['resourceKind'], execute: () => Promise<{
                    id: string;
                    revision: number;
                }>, target = id || null) => this.commands.execute(tx, actor, route.operation, request.headers['idempotency-key'] ?? '', target, data, kind, meta, execute, receipt => authorizeReceipt(tx, actor, receipt, this.clock, this.config), ['import.commit', 'job.resume', 'upload.complete', 'export.create'].includes(route.operation) ? 'ACCEPTED' : 'SUCCEEDED');
                switch (route.operation) {
                    case 'deletion.preview': return this.deletions.preview(tx, actor, data);
                    case 'deletion.list': return this.deletions.list(tx, actor, query);
                    case 'deletion.create': return command('deletion', () => this.deletions.create(tx, actor, data));
                    case 'deletion.get': return this.deletions.get(tx, actor, id);
                    case 'usePermission.list': return this.exports.listPermissions(tx, actor, query);
                    case 'usePermission.create': return command('usePermission', () => this.exports.createPermission(tx, actor, data));
                    case 'usePermission.revoke': return command('usePermission', () => this.exports.revokePermission(tx, actor, id, data));
                    case 'export.list': return this.exports.list(tx, actor, query);
                    case 'export.create': return command('export', () => this.exports.create(tx, actor, data));
                    case 'export.get': return this.exports.get(tx, actor, id);
                    case 'export.download': return this.exports.download(tx, actor, id, meta);
                    case 'talent.search': return this.search.search(tx, actor, query);
                    case 'shortlist.list': return this.shortlists.list(tx, actor, query);
                    case 'shortlist.create': return command('shortlist', () => this.shortlists.create(tx, actor, data));
                    case 'shortlist.get': return this.shortlists.get(tx, actor, id);
                    case 'shortlist.update': return command('shortlist', () => this.shortlists.update(tx, actor, id, data));
                    case 'shortlist.itemAdd': return command('shortlist', () => this.shortlists.addItem(tx, actor, id, data));
                    case 'shortlist.itemUpdate': return command('shortlist', () => this.shortlists.updateItem(tx, actor, id, data));
                    case 'shortlist.itemRemove': return command('shortlist', () => this.shortlists.removeItem(tx, actor, id, data));
                    case 'shortlist.reorder': return command('shortlist', () => this.shortlists.reorder(tx, actor, id, data));
                    case 'work.list': return this.portfolio.list(tx, actor, query);
                    case 'work.create': return command('work', () => this.portfolio.create(tx, actor, data));
                    case 'work.get': return this.portfolio.get(tx, actor, id);
                    case 'work.update': return command('work', () => this.portfolio.update(tx, actor, id, data));
                    case 'work.assetAdd': return command('work', () => this.portfolio.addAsset(tx, actor, id, data));
                    case 'work.assetRemove': return command('work', () => this.portfolio.removeAsset(tx, actor, id, data));
                    case 'work.reorder': return command('work', () => this.portfolio.reorder(tx, actor, id, data));
                    case 'work.creditAdd': return command('work', () => this.portfolio.addCredit(tx, actor, id, data));
                    case 'work.creditRemove': return command('work', () => this.portfolio.removeCredit(tx, actor, id, data));
                    case 'project.list': return this.projects.list(tx, actor, query);
                    case 'project.create': return command('project', () => this.projects.create(tx, actor, data));
                    case 'project.get': return this.projects.get(tx, actor, id);
                    case 'project.update': return command('project', () => this.projects.update(tx, actor, id, data));
                    case 'project.participantAdd': return command('project', () => this.projects.addParticipant(tx, actor, id, data));
                    case 'project.participantUpdate': return command('project', () => this.projects.updateParticipant(tx, actor, id, data));
                    case 'project.participantRemove': return command('project', () => this.projects.removeParticipant(tx, actor, id, data));
                    case 'project.workLink': return command('project', () => this.projects.linkWork(tx, actor, id, data));
                    case 'project.workRemove': return command('project', () => this.projects.removeWork(tx, actor, id, data));
                    case 'person.production': return this.projects.personProduction(tx, actor, id, query);
                    case 'upload.create': return command('upload', () => this.media.create(tx, actor, data));
                    case 'upload.list': return this.media.listUploads(tx, actor, query);
                    case 'upload.get': return this.media.get(tx, actor, id);
                    case 'upload.renew': return command('upload', () => this.media.renew(tx, actor, id, data));
                    case 'upload.complete': return command('upload', () => this.media.complete(tx, actor, id, data));
                    case 'upload.cancel': return command('upload', () => this.media.cancel(tx, actor, id, data));
                    case 'asset.list': return this.media.listAssets(tx, actor, query);
                    case 'asset.get': return this.media.getAsset(tx, actor, id);
                    case 'asset.quarantine': return command('asset', () => this.media.quarantine(tx, actor, id, data));
                    case 'identity.me': return { membershipId: actor.membershipId, displayName: actor.displayName, role: actor.role, permissions: actor.permissions, mediaEnabled: this.config.mediaEnabled === true, workspaceName: (await tx.get('workspaces', actor.workspaceId))?.name ?? 'ONCE', csrfToken: csrfFor(token, this.config.csrfKey), version: '0.1.0-dev.1' };
                    case 'dashboard.get': return this.dashboard(tx, actor);
                    case 'member.list': return this.identity.listMembers(tx, actor, query);
                    case 'member.create': return this.identity.createMember(tx, actor, data, meta);
                    case 'member.resetAccess': return this.identity.resetMember(tx, actor, id, data, meta);
                    case 'member.disable': return command('membership', () => this.identity.changeMember(tx, actor, id, data, true));
                    case 'member.permissions': return command('membership', () => this.identity.changeMember(tx, actor, id, data, false));
                    case 'scope.list': return this.talent.listScopes(tx, actor);
                    case 'scope.create': return command('scope', () => this.talent.createScope(tx, actor, data));
                    case 'record.scope': {
                        invariant(params.kind === 'person' || params.kind === 'source', 'NOT_FOUND', '不支持的对象类型', 404);
                        const kind = params.kind;
                        return command(kind, () => this.talent.changeScope(tx, actor, kind, id, data), kind + ':' + id);
                    }
                    case 'catalog.list': return this.talent.catalog(tx, actor);
                    case 'catalog.create': return command('catalog', () => this.talent.createCatalog(tx, actor, data));
                    case 'catalog.update': return command('catalog', () => this.talent.updateCatalog(tx, actor, id, data));
                    case 'source.list': return this.talent.listSources(tx, actor, query);
                    case 'source.history': return readSourceHistory(tx, actor, id, query, this.clock, meta);
                    case 'source.get': return this.talent.getSource(tx, actor, id, meta);
                    case 'source.create': return command('source', () => this.talent.createSource(tx, actor, data));
                    case 'source.update': return command('source', () => this.talent.updateSource(tx, actor, id, data));
                    case 'source.review': return command('source', () => this.talent.reviewSource(tx, actor, id, data));
                    case 'source.suspend': return command('source', () => this.talent.suspendSource(tx, actor, id, data));
                    case 'handoff.recipients': return this.handoffs.recipients(tx, actor, id, query);
                    case 'handoff.list': return this.handoffs.list(tx, actor, query);
                    case 'handoff.get': return this.handoffs.get(tx, actor, id);
                    case 'handoff.create': return command('handoff', () => this.handoffs.create(tx, actor, id, data));
                    case 'handoff.accept': return command('handoff', () => this.handoffs.act(tx, actor, id, data, 'accept'));
                    case 'handoff.decline': return command('handoff', () => this.handoffs.act(tx, actor, id, data, 'decline'));
                    case 'handoff.revoke': return command('handoff', () => this.handoffs.act(tx, actor, id, data, 'revoke'));
                    case 'person.list': return this.talent.listPeople(tx, actor, query);
                    case 'person.get': return this.talent.getPerson(tx, actor, id);
                    case 'person.create': return command('person', () => this.talent.createPerson(tx, actor, data));
                    case 'person.update': return command('person', () => this.talent.updatePerson(tx, actor, id, data));
                    case 'contact.get': return this.talent.contacts(tx, actor, id, meta);
                    case 'contact.replace': return command('person', () => this.talent.replaceContacts(tx, actor, id, data));
                    case 'evidence.confirm': return command('person', () => this.talent.confirmEvidence(tx, actor, data));
                    case 'import.preview': return command('import', () => this.imports.preview(tx, actor, data));
                    case 'import.get': return this.imports.get(tx, actor, id);
                    case 'import.commit': return command('job', () => this.imports.commit(tx, actor, id, data));
                    case 'job.list': return this.imports.listJobs(tx, actor, query);
                    case 'job.resume': return command('job', () => this.imports.resume(tx, actor, id, data));
                    case 'job.get': return this.imports.getJob(tx, actor, id);
                    case 'audit.list': return this.auditList(tx, actor, query);
                    default: return missing();
                }
            });
            if (['import.commit', 'job.resume', 'upload.complete', 'export.create'].includes(route.operation))
                response.status = 202;
            else if (route.operation === 'member.create' || (route.mode === 'COMMAND' && ['deletion.create', 'usePermission.create', 'shortlist.create', 'work.create', 'project.create', 'person.create', 'source.create', 'scope.create', 'catalog.create', 'import.preview', 'handoff.create', 'upload.create'].includes(route.operation)))
                response.status = 201;
            return response;
        }
        catch (error) {
            const known = error instanceof AppError ? error : new AppError(500, 'INTERNAL_ERROR', '操作未完成，请凭请求编号联系维护人员');
            response.status = known.status;
            response.body = { error: { code: known.code, message: known.message, requestId: meta.requestId } };
            return response;
        }
    }
    private async dashboard(tx: Tx, actor: Actor): Promise<unknown> {
        const people = await this.talent.listPeople(tx, actor, { pageSize: '5' }) as {
            items: unknown[];
            total: number;
        };
        const sources = actor.permissions.includes('sources.read') ? await this.talent.listSources(tx, actor, { pageSize: '100' }) as {
            items: {
                current: boolean;
                validUntil: string;
            }[];
            total: number;
        } : null;
        const jobs = await tx.find('jobs', { workspaceId: actor.workspaceId, actorId: actor.membershipId });
        return { visiblePeople: people.total, visibleSources: sources?.total ?? null, recentPeople: people.items,
            pendingJobs: jobs.filter(j => ['QUEUED', 'RUNNING'].includes(j.state)).length, failedJobs: jobs.filter(j => j.state === 'FAILED').length };
    }
    private async auditList(tx: Tx, actor: Actor, query: Record<string, string>): Promise<unknown> {
        requirePermission(actor, 'audit.read');
        const result = [];
        for (const row of await tx.find('audits', { workspaceId: actor.workspaceId })) {
            try {
                if (row.resourceKind === 'upload')
                    await uploadFor(tx, actor, row.resourceId);
                if (row.resourceKind === 'asset')
                    await assetFor(tx, actor, row.resourceId, this.clock);
                if (row.resourceKind === 'handoff')
                    await handoffParticipant(tx, actor, row.resourceId);
                if (row.resourceKind === 'deletion')
                    await this.deletions.get(tx, actor, row.resourceId);
                if (row.resourceKind === 'shortlist')
                    await shortlistFor(tx, actor, row.resourceId);
                if (row.resourceKind === 'work')
                    await workFor(tx, actor, row.resourceId, this.clock);
                if (row.resourceKind === 'project')
                    await projectFor(tx, actor, row.resourceId, this.clock);
                if (row.resourceKind === 'person')
                    await personFor(tx, actor, row.resourceId, this.clock, false);
                if (row.resourceKind === 'source')
                    await sourceFor(tx, actor, row.resourceId, this.clock, false);
                if (row.resourceKind === 'scope' && !(await scopeVisible(tx, actor, row.resourceId)))
                    continue;
                if (row.resourceKind === 'import') {
                    const batch = await tx.get('imports', row.resourceId);
                    if (!batch || batch.actorId !== actor.membershipId)
                        continue;
                }
                if (row.resourceKind === 'job') {
                    const job = await tx.get('jobs', row.resourceId);
                    if (!job || job.actorId !== actor.membershipId)
                        continue;
                }
                result.push({ id: row.id, actorId: row.actorId, action: row.action, resourceKind: row.resourceKind, resourceId: row.resourceId, changedFields: row.changedFields, at: row.createdAt, requestId: row.requestId });
            }
            catch (e) {
                if (!(e instanceof AppError && e.status === 404))
                    throw e;
            }
        }
        result.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
        return page(result, query);
    }
}
