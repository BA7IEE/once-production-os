import { randomUUID } from 'node:crypto';
import type { Actor, Clock, Config, Membership, RequestMeta, Role, Session, User } from './model.ts';
import { LIMITS } from './model.ts';
import type { Store, Tx } from './store.ts';
import { audit, base, cas, page, touch, unique, workspaceRow } from './helpers.ts';
import { AppError, fail, invariant, missing } from './errors.ts';
import { hashSecret, passwordHash, randomSecret, verifyPassword, csrfFor } from './crypto.ts';
import { permissionsFor, requirePermission } from './policy.ts';
import { Schemas } from './validation.ts';
export class Identity {
    store: Store;
    clock: Clock;
    config: Config;
    constructor(store: Store, clock: Clock, config: Config) { this.store = store; this.clock = clock; this.config = config; }
    async bootstrap(loginName: string, displayName: string, password: string): Promise<{
        workspaceId: string;
        membershipId: string;
    }> {
        Schemas.memberCreate.parse({ loginName, displayName, role: 'ADMIN', extraPermissions: ['sensitive.read', 'sensitive.write'] });
        const hash = await passwordHash(password);
        return this.store.transaction(async (tx) => {
            invariant((await tx.find('workspaces')).length === 0 && (await tx.find('users')).length === 0, 'BOOTSTRAP_CLOSED', '已有安装，禁止再次 bootstrap', 409);
            const workspaceId = randomUUID();
            const now = this.clock.now().toISOString();
            await tx.insert('workspaces', { id: workspaceId, name: 'ONCE', createdAt: now, recoveryEpoch: this.config.recoveryEpoch });
            const user: User = { ...base(workspaceId, this.clock), loginName, displayName, passwordHash: hash, status: 'ACTIVE', sessionEpoch: 1 };
            const membership: Membership = { ...base(workspaceId, this.clock), userId: user.id, role: 'ADMIN', extraPermissions: ['sensitive.read', 'sensitive.write'], status: 'ACTIVE' };
            await tx.insert('users', user);
            await tx.insert('memberships', membership);
            await tx.insert('scopes', { ...base(workspaceId, this.clock), name: '内部成员', mode: 'WORKSPACE' });
            const seeds: [
                string,
                string,
                string,
                string
            ][] = [
                ['role', 'model', '模特', 'Model'], ['role', 'photographer', '摄影师', 'Photographer'], ['role', 'editor', '剪辑师', 'Editor'],
                ['role', 'makeup', '化妆师', 'Makeup artist'], ['role', 'director', '导演', 'Director'], ['role', 'stylist', '造型师', 'Stylist'],
                ['role', 'producer', '制片', 'Producer'], ['role', 'cinematographer', '摄影指导', 'Cinematographer'],
                ['city', 'shenzhen', '深圳', 'Shenzhen'], ['city', 'guangzhou', '广州', 'Guangzhou'], ['city', 'dongguan', '东莞', 'Dongguan'],
                ['language', 'zh', '中文', 'Chinese'], ['language', 'en', '英语', 'English'], ['language', 'fr', '法语', 'French'],
                ['skill', 'commercial', '商业拍摄', 'Commercial'], ['skill', 'lifestyle', '生活方式', 'Lifestyle'], ['skill', 'fashion', '时尚', 'Fashion']
            ];
            for (const [namespace, code, labelZh, labelEn] of seeds)
                await tx.insert('dictionary', { ...base(workspaceId, this.clock), namespace: namespace as 'role' | 'city' | 'language' | 'skill', code, labelZh, labelEn, status: 'ACTIVE' });
            await audit(tx, null, workspaceId, 'identity.bootstrap', 'membership', membership.id, ['created'], { requestId: randomUUID(), ip: 'CLI' }, this.clock);
            return { workspaceId, membershipId: membership.id };
        });
    }
    private async rate(tx: Tx, workspaceId: string, key: string, max: number, ms: number): Promise<void> {
        const id = hashSecret('once:rate:' + key);
        const now = this.clock.now().getTime();
        const row = await tx.get('rateBuckets', id);
        if (!row) {
            await tx.insert('rateBuckets', { id, workspaceId, count: 1, until: new Date(now + ms).toISOString() });
            return;
        }
        if (Date.parse(row.until) <= now) {
            await tx.replace('rateBuckets', { ...row, count: 1, until: new Date(now + ms).toISOString() });
            return;
        }
        invariant(row.count < max, 'RATE_LIMITED', '操作过于频繁，请稍后再试', 429);
        await tx.replace('rateBuckets', { ...row, count: row.count + 1 });
    }
    async login(input: unknown, meta: RequestMeta): Promise<{
        token: string;
        csrfToken: string;
    }> {
        const data = Schemas.login.parse(input);
        const loginName = data.loginName.toLowerCase();
        const inspected = await this.store.transaction(async (tx) => {
            const workspaces = await tx.find('workspaces');
            const workspace = workspaces[0];
            invariant(workspaces.length === 1 && workspace, 'INSTALLATION_REQUIRED', '请先由维护人员初始化系统', 503);
            invariant(this.config.accessMode === 'INTERNAL' && workspace.recoveryEpoch === this.config.recoveryEpoch, 'MAINTENANCE', '系统处于维护或恢复隔离状态', 503);
            await this.rate(tx, workspace.id, 'login:ip:' + meta.ip, 30, 60000);
            await this.rate(tx, workspace.id, 'login:user:' + loginName, 8, 15 * 60000);
            const user = (await tx.find('users', { loginName, workspaceId: workspace.id }))[0] ?? null;
            return { user, workspace };
        });
        const verified = await verifyPassword(data.password, inspected.user?.passwordHash ?? null);
        const token = randomSecret();
        const outcome = await this.store.transaction(async (tx) => {
            const user = inspected.user ? await tx.get('users', inspected.user.id) : null;
            const membership = user ? (await tx.find('memberships', { workspaceId: user.workspaceId, userId: user.id }))[0] : null;
            if (!verified || !user || user.status !== 'ACTIVE' || user.passwordHash !== inspected.user?.passwordHash || !membership || membership.status !== 'ACTIVE') {
                await audit(tx, null, inspected.workspace.id, 'auth.login-denied', 'workspace', inspected.workspace.id, [], meta, this.clock);
                return false;
            }
            const currentWorkspace = await tx.get('workspaces', inspected.workspace.id);
            invariant(this.config.accessMode === 'INTERNAL' && currentWorkspace?.recoveryEpoch === this.config.recoveryEpoch, 'MAINTENANCE', '系统处于维护或恢复隔离状态', 503);
            const now = this.clock.now().getTime();
            const session: Session = { ...base(user.workspaceId, this.clock), membershipId: membership.id, tokenHash: hashSecret(token), userEpoch: user.sessionEpoch,
                recoveryEpoch: this.config.recoveryEpoch, idleUntil: new Date(now + LIMITS.idleMs).toISOString(), absoluteUntil: new Date(now + LIMITS.absoluteMs).toISOString(), revokedAt: null };
            await tx.insert('sessions', session);
            await audit(tx, this.actor(user, membership, session.id), user.workspaceId, 'auth.login', 'membership', membership.id, [], meta, this.clock);
            return true;
        });
        if (!outcome)
            fail(401, 'LOGIN_FAILED', '账号或密码无效');
        return { token, csrfToken: csrfFor(token, this.config.csrfKey) };
    }
    private actor(user: User, membership: Membership, sessionId: string): Actor {
        return { userId: user.id, membershipId: membership.id, workspaceId: membership.workspaceId, role: membership.role,
            permissions: permissionsFor(membership), displayName: user.displayName, userEpoch: user.sessionEpoch, sessionId };
    }
    async authenticate(tx: Tx, token: string): Promise<Actor> {
        invariant(token.length >= 32 && token.length <= 100, 'SESSION_INVALID', '请重新登录', 401);
        const session = (await tx.find('sessions', { tokenHash: hashSecret(token) }))[0];
        const now = this.clock.now().getTime();
        if (!session || session.revokedAt || Date.parse(session.idleUntil) <= now || Date.parse(session.absoluteUntil) <= now)
            fail(401, 'SESSION_INVALID', '会话已失效，请重新登录');
        const membership = await workspaceRow(tx, 'memberships', session.membershipId, session.workspaceId);
        const user = membership ? await workspaceRow(tx, 'users', membership.userId, session.workspaceId) : null;
        const workspace = await tx.get('workspaces', session.workspaceId);
        if (!membership || !user || membership.status !== 'ACTIVE' || user.status !== 'ACTIVE' || user.sessionEpoch !== session.userEpoch)
            fail(401, 'SESSION_INVALID', '会话已失效，请重新登录');
        invariant(this.config.accessMode === 'INTERNAL' && !!workspace && workspace.recoveryEpoch === this.config.recoveryEpoch && session.recoveryEpoch === this.config.recoveryEpoch, 'MAINTENANCE', '系统处于维护或恢复隔离状态', 503);
        await tx.replace('sessions', { ...session, idleUntil: new Date(Math.min(now + LIMITS.idleMs, Date.parse(session.absoluteUntil))).toISOString() });
        return this.actor(user, membership, session.id);
    }
    async logout(token: string, meta: RequestMeta): Promise<void> {
        await this.store.transaction(async (tx) => {
            const session = (await tx.find('sessions', { tokenHash: hashSecret(token) }))[0];
            if (session && !session.revokedAt) {
                await tx.replace('sessions', { ...session, revokedAt: this.clock.now().toISOString() });
                await audit(tx, null, session.workspaceId, 'auth.logout', 'session', session.id, [], meta, this.clock);
            }
        });
    }
    async activate(input: unknown, meta: RequestMeta): Promise<void> {
        const data = Schemas.activate.parse(input);
        await this.store.transaction(async (tx) => { const workspace = (await tx.find('workspaces'))[0]; invariant(workspace, 'INSTALLATION_REQUIRED', '系统尚未初始化', 503); invariant(this.config.accessMode === 'INTERNAL' && workspace.recoveryEpoch === this.config.recoveryEpoch, 'MAINTENANCE', '系统处于维护或恢复隔离状态', 503); await this.rate(tx, workspace.id, 'activate:' + meta.ip, 20, 60000); });
        const hash = await passwordHash(data.password);
        await this.store.transaction(async (tx) => {
            const workspace = (await tx.find('workspaces'))[0];
            invariant(this.config.accessMode === 'INTERNAL' && workspace?.recoveryEpoch === this.config.recoveryEpoch, 'MAINTENANCE', '系统处于维护或恢复隔离状态', 503);
            const token = (await tx.find('activations', { tokenHash: hashSecret(data.token) }))[0];
            if (!token || token.consumedAt || Date.parse(token.expiresAt) <= this.clock.now().getTime())
                fail(401, 'ACTIVATION_INVALID', '激活凭证已失效，请联系管理员重新签发');
            const user = await workspaceRow(tx, 'users', token.userId, token.workspaceId);
            const member = user ? (await tx.find('memberships', { userId: user.id, workspaceId: user.workspaceId }))[0] : null;
            if (!user || user.status === 'DISABLED' || !member || member.status !== 'ACTIVE')
                fail(401, 'ACTIVATION_INVALID', '激活凭证已失效');
            await tx.replace('activations', { ...token, consumedAt: this.clock.now().toISOString() });
            await tx.replace('users', { ...touch(user, this.clock), passwordHash: hash, status: 'ACTIVE', sessionEpoch: user.sessionEpoch + 1 });
            await audit(tx, null, user.workspaceId, 'auth.activate', 'membership', member.id, ['status', 'sessionEpoch'], meta, this.clock);
        });
    }
    async changePassword(token: string, input: unknown, meta: RequestMeta): Promise<void> {
        const data = Schemas.password.parse(input);
        const previous = await this.store.transaction(async (tx) => { const actor = await this.authenticate(tx, token); await this.rate(tx, actor.workspaceId, 'password:' + actor.userId, 8, 15 * 60000); return (await tx.get('users', actor.userId))!; });
        invariant(await verifyPassword(data.oldPassword, previous.passwordHash), 'PASSWORD_INVALID', '原密码不正确', 403);
        const hash = await passwordHash(data.newPassword);
        await this.store.transaction(async (tx) => {
            const actor = await this.authenticate(tx, token);
            const user = (await tx.get('users', actor.userId))!;
            invariant(user.passwordHash === previous.passwordHash, 'REVISION_CONFLICT', '密码已变更，请重新登录', 409);
            await tx.replace('users', { ...touch(user, this.clock), passwordHash: hash, sessionEpoch: user.sessionEpoch + 1 });
            await audit(tx, actor, actor.workspaceId, 'auth.password-change', 'membership', actor.membershipId, ['sessionEpoch'], meta, this.clock);
        });
    }
    async createMember(tx: Tx, actor: Actor, input: unknown, meta: RequestMeta): Promise<{
        membershipId: string;
        revision: number;
        activationToken: string;
        expiresAt: string;
    }> {
        requirePermission(actor, 'members.manage');
        const data = Schemas.memberCreate.parse(input);
        invariant((await tx.find('users', { loginName: data.loginName })).length === 0, 'LOGIN_ALREADY_EXISTS', '该登录名已经使用；凭证丢失请执行重置，不要重复创建', 409);
        await this.rate(tx, actor.workspaceId, 'member-create:' + actor.membershipId, 30, 60000);
        const user: User = { ...base(actor.workspaceId, this.clock), loginName: data.loginName, displayName: data.displayName, passwordHash: null, status: 'PENDING', sessionEpoch: 1 };
        const membership: Membership = { ...base(actor.workspaceId, this.clock), userId: user.id, role: data.role, extraPermissions: unique(data.extraPermissions), status: 'ACTIVE' };
        await tx.insert('users', user);
        await tx.insert('memberships', membership);
        const secret = await this.issueActivation(tx, user);
        await audit(tx, actor, actor.workspaceId, 'member.create', 'membership', membership.id, ['created'], meta, this.clock);
        return { membershipId: membership.id, revision: membership.revision, ...secret };
    }
    private async issueActivation(tx: Tx, user: User): Promise<{
        activationToken: string;
        expiresAt: string;
    }> {
        for (const token of await tx.find('activations', { workspaceId: user.workspaceId, userId: user.id }))
            if (!token.consumedAt)
                await tx.replace('activations', { ...token, consumedAt: this.clock.now().toISOString() });
        const activationToken = randomSecret();
        const expiresAt = new Date(this.clock.now().getTime() + LIMITS.activationMs).toISOString();
        await tx.insert('activations', { ...base(user.workspaceId, this.clock), userId: user.id, tokenHash: hashSecret(activationToken), expiresAt, consumedAt: null });
        return { activationToken, expiresAt };
    }
    async resetMember(tx: Tx, actor: Actor, id: string, input: unknown, meta: RequestMeta): Promise<{
        membershipId: string;
        revision: number;
        activationToken: string;
        expiresAt: string;
    }> {
        requirePermission(actor, 'members.manage');
        const data = Schemas.revision.parse(input);
        const member = await workspaceRow(tx, 'memberships', id, actor.workspaceId);
        if (!member)
            missing();
        invariant(member.id !== actor.membershipId, 'USE_CHANGE_PASSWORD', '本人请使用修改密码；不能重置自己的激活凭证', 409);
        cas(member, data.expectedRevision);
        const user = (await workspaceRow(tx, 'users', member.userId, actor.workspaceId))!;
        invariant(member.status === 'ACTIVE' && user.status !== 'DISABLED', 'MEMBER_DISABLED', '已停用账号不能重新签发凭证', 409);
        await this.rate(tx, actor.workspaceId, 'member-reset:' + id, 5, 15 * 60000);
        await tx.replace('users', { ...touch(user, this.clock), passwordHash: null, status: 'PENDING', sessionEpoch: user.sessionEpoch + 1 });
        const next = touch(member, this.clock);
        await tx.replace('memberships', next);
        const secret = await this.issueActivation(tx, user);
        await audit(tx, actor, actor.workspaceId, 'member.reset-access', 'membership', id, ['sessionEpoch', 'status'], meta, this.clock);
        return { membershipId: id, revision: next.revision, ...secret };
    }
    async changeMember(tx: Tx, actor: Actor, id: string, input: unknown, disable: boolean): Promise<Membership> {
        requirePermission(actor, 'members.manage');
        const data = disable ? Schemas.revision.parse(input) : Schemas.memberPermissions.parse(input);
        const member = await workspaceRow(tx, 'memberships', id, actor.workspaceId);
        if (!member)
            missing();
        cas(member, data.expectedRevision);
        const user = (await workspaceRow(tx, 'users', member.userId, actor.workspaceId))!;
        if (member.role === 'ADMIN' && member.status === 'ACTIVE' && user.status === 'ACTIVE' && (disable || ('role' in data && data.role !== 'ADMIN'))) {
            const admins = await tx.find('memberships', { workspaceId: actor.workspaceId, role: 'ADMIN', status: 'ACTIVE' });
            let active = 0;
            for (const admin of admins)
                if ((await tx.get('users', admin.userId))?.status === 'ACTIVE')
                    active++;
            invariant(active > 1, 'LAST_ADMIN', '不能移除最后一名已激活管理员', 409);
        }
        let next: Membership;
        if (disable)
            next = { ...touch(member, this.clock), status: 'DISABLED' };
        else {
            const change = Schemas.memberPermissions.parse(input);
            next = { ...touch(member, this.clock), role: change.role, extraPermissions: unique(change.extraPermissions) };
        }
        await tx.replace('memberships', next);
        await tx.replace('users', { ...touch(user, this.clock), ...(disable ? { status: 'DISABLED' as const } : {}), sessionEpoch: user.sessionEpoch + 1 });
        return next;
    }
    async listMembers(tx: Tx, actor: Actor, query: Record<string, string>): Promise<unknown> {
        requirePermission(actor, 'members.manage');
        const rows = await tx.find('memberships', { workspaceId: actor.workspaceId });
        const result = [];
        for (const member of rows) {
            const user = (await workspaceRow(tx, 'users', member.userId, actor.workspaceId))!;
            result.push({ id: member.id, displayName: user.displayName, loginName: user.loginName, role: member.role, extraPermissions: member.extraPermissions, status: member.status === 'DISABLED' ? 'DISABLED' : user.status, revision: member.revision });
        }
        return page(result.sort((a, b) => a.id.localeCompare(b.id)), query);
    }
}
