import {TalentMaintenance} from './talent-maintenance.ts';
import {TalentPortal} from './talent-portal.ts';
import {TalentAuth,isolateTalentAuth} from './talent-auth.ts';
import type {AuthProvider,CommandPrincipal} from './talent-auth-model.ts';
import {cas} from './helpers.ts';
import {queryTalentDirectory} from './talent-directory-query.ts';
import { updateTalentDirectory } from './talent-directory.ts';
import { createTalentIntake } from './talent-intake.ts';
import {ProjectParties,brandFor} from './project-parties.ts';
import {readConnection,saveConnection,testConnection} from './ai-connection.ts';
import {AiOperations,aiOperator} from './ai-operations.ts';
import {AiBusiness} from './ai-business.ts';
import {LocaleTexts} from './locale.ts';
import { readTalentMergeHistory } from './talent-merge-history.ts';
import { TalentV2 } from './talent-v2.ts';
import { MachineIdentity } from './talent-v2-machine.ts';
import { authorizeTd2Operation, authorizeTd2Resource, TD2_RESOURCE_KINDS } from './talent-v2-access.ts';
import { searchTalentV2 } from './talent-v2-search.ts';
import { TD2_TABLES, type FactTable } from './talent-v2-schema.ts';
import { PersonMerges } from './person-merges.ts';
import { resolvePersonReadId } from './merge-policy.ts';
import { DeletionFinalization } from './deletion-finalization.ts';
import { DeletionCleanup } from './deletion-cleanup.ts';
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
import { digest, parseStrictJson } from './json.ts';
import { page, workspaceRow } from './helpers.ts';
import { requirePermission, scopeVisible, personFor, sourceFor } from './policy.ts';
import { ROUTES, type RouteDefinition } from './routes.ts';
import { uuid } from './validation.ts';
import { requiresSafetyIntent, type SafetyIntent, type SafetyIntentSink } from './safety-intent.ts';
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
    portal: TalentPortal;
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
    ai: AiBusiness;
    localeTexts: LocaleTexts;
    projects: Projects;
    shortlists: Shortlists;
    search: TalentSearch;
    exports: Exports;
    deletions: Deletions;
    deletionCleanup: DeletionCleanup;
    deletionFinalization: DeletionFinalization;
    personMerges: PersonMerges;
    talentV2: TalentV2;
    machine: MachineIdentity;
    safetyIntent: SafetyIntentSink | null;
    constructor(store: Store, config: Config, clock: Clock = { now: () => new Date() }, safetyIntent: SafetyIntentSink | null = null, authProvider?:AuthProvider) {
        invariant(config.contactKey.length === 32 && config.csrfKey.length === 32, 'CONFIG_INVALID', '密钥必须为 32 字节', 503);
        const origin = new URL(config.origin);
        invariant(origin.origin === config.origin && !origin.username && !origin.password && ['http:', 'https:'].includes(origin.protocol), 'CONFIG_INVALID', '必须配置精确 Origin', 503);
        invariant(!['production','staging'].includes(config.environment) || (origin.protocol === 'https:' && config.secureCookies), 'CONFIG_INVALID', '测试和生产环境要求 HTTPS 与安全 Cookie', 503);
        invariant(/^[a-zA-Z0-9_-]{16,128}$/.test(config.recoveryEpoch), 'CONFIG_INVALID', '恢复批次编号未配置', 503);
        this.store = store;
        this.clock = clock;
        this.safetyIntent = safetyIntent;
        this.config = config;
        this.identity = new Identity(store, clock, config);
        this.portal=new TalentPortal(new TalentAuth(store,config,clock,authProvider),(a,o,r,id,k)=>this.writeAhead(a,o,r,id,k),safetyIntent);
        this.talent = new Talent(clock, config);
        this.talentV2 = new TalentV2(clock, config);
        this.machine = new MachineIdentity(clock, config);
        this.portfolio = new Portfolio(clock, this.talent);
        this.ai = new AiBusiness(clock,config);
        this.localeTexts = new LocaleTexts(clock);
        this.projects = new Projects(clock, this.talent);
        this.shortlists = new Shortlists(clock);
        this.search = new TalentSearch(clock);
        this.exports = new Exports(store, clock, config);
        this.deletions = new Deletions(clock);
        this.deletionCleanup = new DeletionCleanup(store, clock, config);
        this.deletionFinalization = new DeletionFinalization(store, clock, config);
        this.personMerges = new PersonMerges(clock, config);
        this.handoffs = new Handoffs(clock);
        this.media = new Media(store, clock, config);
        this.commands = new Commands(clock);
        this.imports = new Imports(store, clock, config, this.talent);
    }
    private async writeAhead(actor: CommandPrincipal, operation: string, requestId: string, resourceId: string, commandKey = ''): Promise<SafetyIntent | null> {
        if (!this.safetyIntent) return null;
        if (commandKey)
            invariant(/^[A-Za-z0-9_-]{8,128}$/.test(commandKey), 'IDEMPOTENCY_REQUIRED',
                '写入需要 8–128 位 Idempotency-Key', 400);
        const stable = commandKey
            ? digest({ workspaceId: actor.workspaceId, ...(actor.actorKind === 'TALENT' ? {principalKind:'TALENT',talentAccountId:actor.talentAccountId} : actor.actorKind === 'MACHINE' ? {servicePrincipalId: actor.servicePrincipalId} : {actorId: actor.membershipId}), operation, commandKey })
            : requestId;
        const intent: SafetyIntent = {
            intentId: 'intent:' + stable,
            workspaceId: actor.workspaceId,
            operation,
            requestId,
            resourceId: resourceId || requestId
        };
        await this.safetyIntent.writeAhead(intent);
        return intent;
    }
    private resultResourceId(body: unknown, fallback: string): string {
        if (!body || typeof body !== 'object') return fallback;
        for (const key of ['resourceId', 'membershipId', 'userId', 'id']) {
            const value = (body as Record<string, unknown>)[key];
            if (typeof value === 'string' && value.length > 0 && value.length <= 180) return value;
        }
        return fallback;
    }
    private async markCommitted(intent: SafetyIntent | null, resourceId: string): Promise<void> {
        if (!intent || !this.safetyIntent) return;
        try { await this.safetyIntent.committed(intent, resourceId); }
        catch { /* DB already committed; missing completion evidence must block later recovery, not rewrite the response. */ }
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
            if(url.pathname==='/api/v1/portal'||url.pathname.startsWith('/api/v1/portal/'))return await this.portal.handle(request,response,meta);
            const { route, params } = this.match(request.method, url.pathname.slice('/api/v1'.length));
            const bearerHeader=request.headers.authorization;
            const machineRequest=bearerHeader!==undefined;
            if(machineRequest){
                invariant(!!bearerHeader && /^Bearer once_machine\./.test(bearerHeader),'MACHINE_UNAUTHENTICATED','机器认证头无效',401);
                invariant(route.operation.startsWith('td2.'),'MACHINE_OPERATION_FORBIDDEN','机器账号只能调用人才2.0的受限接口',403);
                invariant(!request.headers.cookie,'MIXED_AUTH_FORBIDDEN','不能混用会话与机器凭证',400);
                invariant(!request.headers.origin||request.headers.origin===this.config.origin,'ORIGIN_DENIED','请求来源不被允许',403);
            }
            if (request.method !== 'GET' && !machineRequest)
                invariant(request.headers.origin === this.config.origin, 'ORIGIN_DENIED', '请求来源不被允许', 403);
            const jar = cookies(request.headers.cookie ?? '');
            const token = jar[sessionName] ?? '';
            const authenticate = async (tx:Tx) => {
                const actor=await (machineRequest ? this.machine.authenticate(tx,bearerHeader!.slice(7)) : this.identity.authenticate(tx,token));
                const expected=request.headers['x-once-membership'];
                invariant(!expected || (!machineRequest && expected===actor.membershipId), 'IDENTITY_CHANGED', '当前账号已变化，请使用原账号核对提交', 409);
                return actor;
            };
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
            if (request.method !== 'GET' && !machineRequest)
                invariant(!!token && equalSecret(request.headers['x-csrf-token'] ?? '', csrfFor(token, this.config.csrfKey)), 'CSRF_INVALID', '会话校验失败，请刷新后重试', 403);
            if (route.operation === 'auth.logout') {
                await this.identity.logout(token, meta);
                response.cookies.push(this.cookie(sessionName, '', 0));
                response.body = { state: 'SIGNED_OUT' };
                return response;
            }
            if (route.operation === 'auth.changePassword') {
                const preActor = await this.store.transaction(tx => this.identity.authenticate(tx, token));
                const intent = await this.writeAhead(preActor, route.operation, meta.requestId, preActor.membershipId);
                try {
                    await this.identity.changePassword(token, data, meta);
                    await this.markCommitted(intent, preActor.membershipId);
                }
                catch (error) {
                    // An acknowledgement failure can occur after commit. Keep the intent unresolved.
                    throw error;
                }
                response.cookies.push(this.cookie(sessionName, '', 0));
                response.body = { state: 'PASSWORD_CHANGED' };
                return response;
            }
            let safetyIntent: SafetyIntent | null = null;
            if (requiresSafetyIntent(route.mode)) {
                const preActor = await this.store.transaction(async tx => {
                    const actor = await authenticate(tx);
                    authorizeTd2Operation(actor,route.operation,route.mode);
                    if (route.permission) requirePermission(actor, route.permission);
                    return actor;
                });
                safetyIntent = await this.writeAhead(preActor, route.operation, meta.requestId, params.id ?? meta.requestId,
                    route.mode === 'COMMAND' ? (request.headers['idempotency-key'] ?? '') : '');
            }
            try {
                response.body = await this.store.transaction(async (tx) => {
                const actor = await authenticate(tx);
                authorizeTd2Operation(actor,route.operation,route.mode);
                if (route.permission)
                    requirePermission(actor, route.permission);
                const id = params.id ?? '';
                const command = (kind: CommandReceipt['resourceKind'], execute: () => Promise<{
                    id: string;
                    revision: number;
                }>, target = id || null) => this.commands.execute(tx, actor, route.operation, request.headers['idempotency-key'] ?? '', target, data, kind, meta, execute, receipt => authorizeReceipt(tx, actor, receipt, this.clock, this.config), ['ai.create', 'import.commit', 'job.resume', 'upload.complete', 'export.create'].includes(route.operation) ? 'ACCEPTED' : 'SUCCEEDED');
                if(route.operation.startsWith('td2.fact.')){
                    const [, ,table,action]=route.operation.split('.');
                    invariant(TD2_TABLES.includes(table as FactTable),'NOT_FOUND','资料类型不存在',404);
                    return command('talentFact',()=>action==='create'?this.talentV2.createFact(tx,actor,table as FactTable,id,data):this.talentV2.patchFact(tx,actor,table as FactTable,id,data));
                }
                const maintenance=new TalentMaintenance(this.clock,this.config);
                switch (route.operation) {
                    case 'talent.invitation.create':return command('talentInvitation',()=>maintenance.createInvitation(tx,actor,data));
                    case 'talent.invitation.list':return maintenance.internalList(tx,actor,'invitation');
                    case 'talent.invitation.issue':return maintenance.issue(tx,actor,id,data,meta);
                    case 'talent.invitation.revoke':return command('talentInvitation',()=>maintenance.revokeInvitation(tx,actor,id,data));
                    case 'talent.claim.list':return maintenance.internalList(tx,actor,'claim');
                    case 'talent.claim.decide':return command('talentClaim',()=>maintenance.decideClaim(tx,actor,id,data));
                    case 'talent.grant.revoke':return command('talentGrant',()=>maintenance.revokeGrant(tx,actor,id,data));
                    case 'talent.submission.list':return maintenance.internalList(tx,actor,'submission');
                    case 'talent.submission.get':return maintenance.submissionDto(tx,await maintenance.internalSubmission(tx,actor,id),actor);
                    case 'talent.submission.decide':return command('talentSubmission',()=>maintenance.review(tx,actor,id,data));
                    case 'talent.account.disable': case 'talent.account.erase':return command('talentAccount',async()=>{const a=await workspaceRow(tx,'talentAccounts',id,actor.workspaceId);invariant(a,'NOT_FOUND','账号不存在',404);cas(a,(data as {expectedRevision:number}).expectedRevision);await isolateTalentAuth(tx,actor.workspaceId,this.clock,id,route.operation==='talent.account.erase');const updated=(await tx.get('talentAccounts',id))!;return {id,revision:updated.revision};});
                    case 'ai.settings': return this.ai.settings(tx,actor.workspaceId);
                    case 'ai.connection.test': return command('aiConnectionTest',()=>testConnection(tx,actor,data,this.clock,this.config,request.headers['idempotency-key']??'',meta));
                    case 'ai.connection': return readConnection(tx,actor);
                    case 'ai.connection.save': return command('aiConnection',()=>saveConnection(tx,actor,data,this.clock,this.config));
                    case 'ai.operations': return new AiOperations(this.clock,this.config).status(tx,actor);
                    case 'ai.approval': return command('aiApproval',()=>new AiOperations(this.clock,this.config).approval(tx,actor,data));
                    case 'ai.reconcile': return command('aiAttempt',()=>new AiOperations(this.clock,this.config).reconcile(tx,actor,id,data,meta));
                    case 'ai.unfreeze': return command('aiBudget',()=>new AiOperations(this.clock,this.config).unfreeze(tx,actor,id,data));
                    case 'ai.grants': return this.ai.grants(tx,actor,query);
                    case 'ai.grant': return command('aiGrant',()=>this.ai.grant(tx,actor,data));
                    case 'ai.grant.revoke': return command('aiGrant',()=>this.ai.revoke(tx,actor,id,data));
                    case 'ai.preview': return this.ai.preview(tx,actor,data);
                    case 'ai.list': return this.ai.list(tx,actor,query);
                    case 'ai.create': return command('aiTask',()=>this.ai.create(tx,actor,data,request.headers['idempotency-key']??'',meta));
                    case 'brand.create': return command('brand',()=>new ProjectParties(this.clock).create(tx,actor,data));
                    case 'brand.list': return new ProjectParties(this.clock).list(tx,actor,query);
                    case 'brand.patch': return command('brand',()=>new ProjectParties(this.clock).patch(tx,actor,id,data));
                    case 'project.parties': return command('project',()=>new ProjectParties(this.clock).bind(tx,actor,id,data));
                    case 'ai.proposal':
                    case 'ai.get': return this.ai.get(tx,actor,id);
                    case 'ai.cancel': return command('aiTask',()=>this.ai.cancel(tx,actor,id,data,meta));
                    case 'ai.apply': return command('aiTask',()=>this.ai.apply(tx,actor,id,data));
                    case 'ai.reject': return command('aiTask',()=>this.ai.reject(tx,actor,id,data));
                    case 'ai.results': return this.ai.results(tx,actor,id);

                    case 'td2.shortlist.role': return command('shortlist',()=>this.shortlists.bindRole(tx,actor,id,data));
                    case 'td2.heightReview.list': return this.talentV2.heightReviews(tx,actor,id,query);
                    case 'td2.heightReview.dismiss': return command('talentMigrationReview',()=>this.talentV2.dismissHeightReview(tx,actor,id,data));
                    case 'td2.credential.secret.clear': return command('talentFact',()=>this.talentV2.clearCredentialSecret(tx,actor,id,data));
                    case 'td2.schema': return this.talentV2.schema(tx,actor);
                    case 'td2.person.list': return searchTalentV2(tx,actor,this.clock,query);
                    case 'td2.person.get': return this.talentV2.get(tx,actor,id);
                    case 'directory.talent.update': return command('person',()=>updateTalentDirectory(tx,actor,id,data,this.clock,this.config));
                    case 'directory.talent.get': return this.talentV2.get(tx,actor,id);
                    case 'directory.talent.search': return queryTalentDirectory(tx,actor,this.clock,data);
                    case 'directory.talent.create': return command('person',()=>createTalentIntake(tx,actor,data,this.clock,this.config));
                    case 'td2.person.create': return command('person',()=>this.talentV2.createPerson(tx,actor,data));
                    case 'td2.person.patch': return command('person',()=>this.talentV2.patchPerson(tx,actor,id,data));
                    case 'td2.person.enroll': return command('person',()=>this.talentV2.enroll(tx,actor,id,data));
                    case 'td2.evidence.list': return this.talentV2.evidenceHistory(tx,actor,query);
                    case 'td2.evidence': return command('person',()=>this.talentV2.addEvidence(tx,actor,data));
                    case 'td2.proposal.create': return command('fieldProposal',()=>this.talentV2.proposal(tx,actor,data));
                    case 'td2.proposal.list': return this.talentV2.proposals(tx,actor,query);
                    case 'td2.proposal.decide': return command('fieldProposal',()=>this.talentV2.decide(tx,actor,id,data));
                    case 'td2.organization.create': return command('organization',()=>this.talentV2.organization(tx,actor,data));
                    case 'td2.organization.list': return this.talentV2.organizations(tx,actor,query);
                    case 'td2.registry.create': return command('capabilityDefinition',()=>this.talentV2.registryCreate(tx,actor,data));
                    case 'td2.registry.patch': return command('capabilityDefinition',()=>this.talentV2.registryPatch(tx,actor,id,data));
                    case 'td2.measurement.confirm': return command('talentFact',()=>this.talentV2.confirm(tx,actor,'measurementSets',id,data));
                    case 'td2.external.verify': return command('talentFact',()=>this.talentV2.confirm(tx,actor,'personExternalRefs',id,data));
                    case 'td2.external.revoke': return command('talentFact',()=>this.talentV2.revokeFact(tx,actor,'personExternalRefs',id,data));
                    case 'td2.credential.verify': return command('talentFact',()=>this.talentV2.confirm(tx,actor,'personCredentials',id,data));
                    case 'td2.credential.revoke': return command('talentFact',()=>this.talentV2.revokeFact(tx,actor,'personCredentials',id,data));
                    case 'td2.credential.secret': return command('talentFact',()=>this.talentV2.credentialSecret(tx,actor,id,data));
                    case 'td2.adult.verify': return command('talentFact',()=>this.talentV2.adultVerify(tx,actor,id,data));
                    case 'td2.resolve': return this.talentV2.resolve(tx,actor,query);
                    case 'td2.collection.add': return command('talentFact',()=>this.talentV2.collectionMutation(tx,actor,id,data,'ADD'));
                    case 'td2.collection.remove': return command('talentFact',()=>this.talentV2.collectionMutation(tx,actor,id,data,'REMOVE'));
                    case 'td2.collection.order': return command('talentFact',()=>this.talentV2.collectionMutation(tx,actor,id,data,'ORDER'));
                    case 'td2.principal.list': return this.machine.list(tx,actor,query);
                    case 'td2.principal.create': return this.machine.create(tx,actor,data,meta);
                    case 'td2.principal.rotate': return this.machine.rotate(tx,actor,id,data,meta);
                    case 'td2.principal.revoke': return command('servicePrincipal',()=>this.machine.revoke(tx,actor,id,data));

                    case 'deletion.preview': return this.deletions.preview(tx, actor, data);
                    case 'deletion.list': return this.deletions.list(tx, actor, query);
                    case 'deletion.create': return command('deletion', () => this.deletions.create(tx, actor, data));
                    case 'deletion.get': return this.deletions.get(tx, actor, id);
                    case 'deletion.block': return command('deletion', () => this.deletions.block(tx, actor, id, data));
                    case 'deletion.items': return this.deletions.reviewItems(tx, actor, id, query);
                    case 'deletion.decision': return command('deletion', () => this.deletions.decide(tx, actor, id, data));
                    case 'deletion.planFreeze': return command('deletion', () => this.deletions.freezePlan(tx, actor, id, data));
                    case 'deletion.cleanupStart': return command('deletion', () => this.deletionCleanup.start(tx, actor, id, data));
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
                    case 'locale.list': return this.localeTexts.list(tx,actor,query);
                    case 'locale.get': return this.localeTexts.get(tx,actor,id);
                    case 'locale.create': return command('localeText',()=>this.localeTexts.create(tx,actor,data));
                    case 'locale.update': return command('localeText',()=>this.localeTexts.update(tx,actor,id,data));
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
                    case 'identity.me': return { directoryStateScope: digest({purpose:'directory-state-v1',sessionId:actor.sessionId}), membershipId: actor.membershipId, displayName: actor.displayName, role: actor.role, permissions: actor.permissions, mediaEnabled: this.config.mediaEnabled === true, workspaceName: (await tx.get('workspaces', actor.workspaceId))?.name ?? 'ONCE', csrfToken: csrfFor(token, this.config.csrfKey), version: '0.1.0-dev.1' };
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
                    case 'person.mergeHistory': return readTalentMergeHistory(tx, actor, id, query, this.clock, meta);
                    case 'person.mergePreview': return this.personMerges.preview(tx, actor, data);
                    case 'person.merge': return command('merge', () => this.personMerges.execute(tx, actor, data));
                    case 'person.list': return this.talent.listPeople(tx, actor, query);
                    case 'person.get': {
                        const resolved = await resolvePersonReadId(tx, actor, id, this.clock);
                        const profile = await this.talent.getPerson(tx, actor, resolved.id) as Record<string, unknown>;
                        return resolved.resolvedFromId ? { ...profile, resolvedFromId: resolved.resolvedFromId } : profile;
                    }
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
            }
            catch (error) {
                // An exception does not prove rollback; only a successful receipt may fill completion.
                throw error;
            }
            await this.markCommitted(safetyIntent,
                this.resultResourceId(response.body, params.id ?? safetyIntent?.resourceId ?? meta.requestId));
            if (['ai.create', 'import.commit', 'job.resume', 'upload.complete', 'export.create'].includes(route.operation))
                response.status = 202;
            else if (route.operation==='directory.talent.create' || route.operation.startsWith('td2.') && route.operation.endsWith('.create')) response.status = 201;
            else if (route.operation === 'member.create' || (route.mode === 'COMMAND' && ['brand.create', 'ai.grant', 'locale.create', 'deletion.create', 'usePermission.create', 'shortlist.create', 'work.create', 'project.create', 'person.create', 'source.create', 'scope.create', 'catalog.create', 'import.preview', 'handoff.create', 'upload.create'].includes(route.operation)))
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
                if(['aiConnectionTest','aiConnection','aiApproval','aiAttempt','aiBudget'].includes(row.resourceKind))aiOperator(actor);
                if(row.resourceKind==='aiTask')await this.ai.access(tx,actor,row.resourceId);
                if(row.resourceKind==='aiGrant')await this.ai.grantAccess(tx,actor,row.resourceId);
                if(row.resourceKind==='aiRun'){const task=(await tx.find('aiTasks',{workspaceId:actor.workspaceId,runId:row.resourceId}))[0];if(!task)continue;await this.ai.access(tx,actor,task.id);}
                if(row.resourceKind==='brand')await brandFor(tx,actor,row.resourceId,this.clock);
                if(row.resourceKind==='localeText')await this.localeTexts.access(tx,actor,row.resourceId);
                if((TD2_RESOURCE_KINDS as readonly string[]).includes(row.resourceKind)) await authorizeTd2Resource(tx,actor,row.resourceKind,row.resourceId,this.clock);
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
                if (row.resourceKind === 'person') {
                    const resolved = await resolvePersonReadId(tx, actor, row.resourceId, this.clock);
                    await personFor(tx, actor, resolved.id, this.clock, false);
                }
                if (row.resourceKind === 'merge') {
                    requirePermission(actor, 'data.merge');
                    const merge = await workspaceRow(tx, 'personMerges', row.resourceId, actor.workspaceId);
                    if (!merge)
                        continue;
                    await personFor(tx, actor, merge.canonicalPersonId, this.clock, false);
                }
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
                if(row.resourceKind==='talentAccount'&&!actor.permissions.includes('members.manage'))continue;
                result.push({ id: row.id, principalKind:row.principalKind, talentAccountId:row.talentAccountId??null, actorId: row.actorId, actorKind: row.talentAccountId ? 'TALENT' : row.servicePrincipalId ? 'MACHINE' : row.actorId ? 'HUMAN' : 'SYSTEM', servicePrincipalId: row.servicePrincipalId ?? null, action: row.action, resourceKind: row.resourceKind, resourceId: row.resourceId, changedFields: row.changedFields, at: row.createdAt, requestId: row.requestId });
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
