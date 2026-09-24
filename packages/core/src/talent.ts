import type { Actor, Clock, Config, Person, RequestMeta, Source } from './model.ts';
import { LIMITS } from './model.ts';
import type { Tx } from './store.ts';
import { audit, base, cas, page, touch, unique, workspaceRow, patchDefined } from './helpers.ts';
import { invariant, missing } from './errors.ts';
import { digest } from './json.ts';
import { encryptContact, decryptContact } from './crypto.ts';
import { requirePermission, personFor, scopeVisible, requireScope, sourceFor, sourceCurrent, sourceVisible, validateScopeMembers } from './policy.ts';
import { appendSourceHistory } from './source-history.ts';
import { loadVisibility } from './visibility.ts';
import { profileAccess, delegatedPeople, handoffForAction } from './handoff-policy.ts';
import { PersonInput, PersonPatch, Schemas, SourceInput, type Parsed } from './validation.ts';
export class Talent {
    clock: Clock;
    config: Config;
    constructor(clock: Clock, config: Config) { this.clock = clock; this.config = config; }
    async createScope(tx: Tx, actor: Actor, input: unknown): Promise<{
        id: string;
        revision: number;
    }> {
        requirePermission(actor, 'members.manage');
        const data = Schemas.scopeCreate.parse(input);
        await validateScopeMembers(tx, actor, data.membershipIds);
        // Creating an inaccessible administrative scope is deliberately not supported by this slice.
        invariant(data.membershipIds.includes(actor.membershipId), 'SCOPE_SELF_REQUIRED', '范围必须包含当前维护人', 400);
        const scope = { ...base(actor.workspaceId, this.clock), name: data.name, mode: 'RESTRICTED' as const };
        await tx.insert('scopes', scope);
        for (const id of data.membershipIds)
            await tx.insert('scopeMembers', { ...base(actor.workspaceId, this.clock), scopeId: scope.id, membershipId: id });
        return scope;
    }
    async listScopes(tx: Tx, actor: Actor): Promise<unknown> {
        const result = [];
        for (const scope of await tx.find('scopes', { workspaceId: actor.workspaceId }))
            if (await scopeVisible(tx, actor, scope.id))
                result.push({ id: scope.id, name: scope.name, mode: scope.mode, revision: scope.revision });
        return { items: result };
    }
    async createSource(tx: Tx, actor: Actor, input: unknown): Promise<Source> {
        requirePermission(actor, 'sources.write');
        const data = SourceInput.parse(input);
        if (data.textPayload)
            requirePermission(actor, 'sensitive.write');
        const now = this.clock.now().getTime();
        const temporary = data.basisMode === 'TEMP_ORGANIZE';
        if (!temporary)
            requirePermission(actor, 'sources.review');
        const validUntil = data.validUntil ?? (temporary ? new Date(now + LIMITS.temporaryMs).toISOString() : '');
        invariant(validUntil && Date.parse(validUntil) > now, 'BASIS_EXPIRY_REQUIRED', '请填写有依据的未来截止时间');
        invariant(!temporary || Date.parse(validUntil) <= now + LIMITS.temporaryMs, 'TEMPORARY_TOO_LONG', '临时整理依据最长为 7 天，长期使用需核验');
        let scopeId = data.scopeId;
        if (scopeId) {
            await requireScope(tx, actor, scopeId);
            const scope = (await tx.get('scopes', scopeId))!;
            invariant(!temporary || scope.mode === 'RESTRICTED', 'TEMPORARY_SCOPE_REQUIRED', '临时资料只能进入限定成员范围');
        }
        else if (temporary) {
            const scope = { ...base(actor.workspaceId, this.clock), name: '本人临时整理资料', mode: 'RESTRICTED' as const };
            await tx.insert('scopes', scope);
            await tx.insert('scopeMembers', { ...base(actor.workspaceId, this.clock), scopeId: scope.id, membershipId: actor.membershipId });
            scopeId = scope.id;
        }
        else {
            scopeId = (await tx.find('scopes', { workspaceId: actor.workspaceId, mode: 'WORKSPACE' }))[0]?.id;
            invariant(scopeId, 'SCOPE_NOT_CONFIGURED', '工作空间范围尚未配置', 503);
        }
        const source: Source = { ...base(actor.workspaceId, this.clock), scopeId, maintainerId: actor.membershipId,
            title: data.title, type: data.type, providerClaim: data.providerClaim, textPayload: data.textPayload ?? '',
            basisMode: data.basisMode, basisDescription: data.basisDescription, validFrom: this.clock.now().toISOString(), validUntil,
            status: temporary ? 'RECEIVED' : 'CONFIRMED', protectionEpoch: 1, reviewedBy: temporary ? null : actor.membershipId,
            reviewedAt: temporary ? null : this.clock.now().toISOString() };
        await tx.insert('sources', source);
        await appendSourceHistory(tx, actor, source, 'CREATED', this.clock);
        return source;
    }
    sourceDto(source: Source, actor: Actor, includeContent = false): Record<string, unknown> {
        const current = sourceCurrent(source, this.clock);
        return { id: source.id, title: source.title, type: source.type, scopeId: source.scopeId, maintainerId: source.maintainerId,
            status: source.status, basisMode: source.basisMode, basisDescription: current ? source.basisDescription : '',
            providerClaim: current ? source.providerClaim : '', validUntil: source.validUntil, revision: source.revision,
            current, reviewedAt: source.reviewedAt, protectionEpoch: source.protectionEpoch,
            ...(includeContent && current && actor.permissions.includes('sensitive.read') ? { textPayload: source.textPayload } : {}),
            textRestricted: !actor.permissions.includes('sensitive.read') || !current };
    }
    async listSources(tx: Tx, actor: Actor, query: Record<string, string>): Promise<unknown> {
        requirePermission(actor, 'sources.read');
        const visibility = await loadVisibility(tx, actor, this.clock);
        const result = [];
        for (const source of await tx.find('sources', { workspaceId: actor.workspaceId })) {
            if (visibility.blocked('SOURCE', source.id) || !(await scopeVisible(tx, actor, source.scopeId)))
                continue;
            if (!sourceCurrent(source, this.clock) && !actor.permissions.includes('sources.review'))
                continue;
            result.push(this.sourceDto(source, actor));
        }
        result.sort((a, b) => String(a.id).localeCompare(String(b.id)));
        return page(result, query);
    }
    async getSource(tx: Tx, actor: Actor, id: string, meta: RequestMeta): Promise<unknown> {
        requirePermission(actor, 'sources.read');
        const source = await sourceFor(tx, actor, id, this.clock, !actor.permissions.includes('sources.review'));
        if (sourceCurrent(source, this.clock) && actor.permissions.includes('sensitive.read'))
            await audit(tx, actor, actor.workspaceId, 'source.content-read', 'source', source.id, [], meta, this.clock);
        return this.sourceDto(source, actor, true);
    }
    async updateSource(tx: Tx, actor: Actor, id: string, input: unknown): Promise<Source> {
        requirePermission(actor, 'sources.write');
        const data = Schemas.sourcePatch.parse(input);
        const source = await sourceFor(tx, actor, id, this.clock);
        cas(source, data.expectedRevision);
        invariant(Object.keys(data).length > 1, 'EMPTY_UPDATE', '没有需要保存的修改', 400);
        // Raw source content is treated like restricted source material, not as a contacts bypass.
        if (data.textPayload !== undefined)
            requirePermission(actor, 'sensitive.write');
        const { expectedRevision: _, ...patch } = data;
        const next = patchDefined(touch(source, this.clock), patch);
        await tx.replace('sources', next);
        await appendSourceHistory(tx, actor, next, 'EDITED', this.clock);
        return next;
    }
    async reviewSource(tx: Tx, actor: Actor, id: string, input: unknown): Promise<Source> {
        requirePermission(actor, 'sources.review');
        const data = Schemas.sourceReview.parse(input);
        const source = await sourceFor(tx, actor, id, this.clock, false);
        cas(source, data.expectedRevision);
        invariant(Date.parse(data.validUntil) > this.clock.now().getTime(), 'BASIS_EXPIRY_REQUIRED', '依据截止时间必须在未来');
        const next: Source = { ...touch(source, this.clock), basisDescription: data.basisDescription, validUntil: data.validUntil,
            validFrom: this.clock.now().toISOString(), basisMode: 'INTERNAL_USE', status: 'CONFIRMED', protectionEpoch: source.protectionEpoch + 1,
            reviewedBy: actor.membershipId, reviewedAt: this.clock.now().toISOString() };
        await tx.replace('sources', next);
        await appendSourceHistory(tx, actor, next, 'REVIEWED', this.clock);
        return next;
    }
    async suspendSource(tx: Tx, actor: Actor, id: string, input: unknown): Promise<Source> {
        requirePermission(actor, 'sources.review');
        const data = Schemas.suspend.parse(input);
        const source = await sourceFor(tx, actor, id, this.clock, false);
        cas(source, data.expectedRevision);
        const next: Source = { ...touch(source, this.clock), status: 'SUSPENDED', protectionEpoch: source.protectionEpoch + 1 };
        // The basis remains unchanged. The pause decision has its own protected history field.
        await tx.replace('sources', next);
        await appendSourceHistory(tx, actor, next, 'SUSPENDED', this.clock, data.reason);
        return next;
    }
    async validateCatalog(tx: Tx, workspaceId: string, namespace: 'role' | 'city' | 'language' | 'skill' | 'industry' | 'workType', codes: string[], previous: string[] = []): Promise<void> {
        invariant(unique(codes).length === codes.length, 'DUPLICATE_CODE', '同一分类不能重复', 400);
        for (const code of codes) {
            const item = (await tx.find('dictionary', { workspaceId, namespace, code }))[0];
            invariant(item && (item.status === 'ACTIVE' || previous.includes(code)), 'CATALOG_INVALID', '所选分类不存在或已停用，请刷新分类选项', 422);
        }
    }
    private async validateProfile(tx: Tx, workspaceId: string, data: {
        roles?: string[];
        cityCode?: string | null;
        languageCodes?: string[];
        skillCodes?: string[];
    }, previous?: Person): Promise<void> {
        if (data.roles)
            await this.validateCatalog(tx, workspaceId, 'role', data.roles, previous?.roles);
        if (data.cityCode)
            await this.validateCatalog(tx, workspaceId, 'city', [data.cityCode], previous?.cityCode ? [previous.cityCode] : []);
        if (data.languageCodes)
            await this.validateCatalog(tx, workspaceId, 'language', data.languageCodes, previous?.languageCodes);
        if (data.skillCodes)
            await this.validateCatalog(tx, workspaceId, 'skill', data.skillCodes, previous?.skillCodes);
    }
    async createPerson(tx: Tx, actor: Actor, input: unknown): Promise<Person> {
        requirePermission(actor, 'records.write');
        const data = PersonInput.parse(input);
        invariant((!!data.sourceId) !== (!!data.inlineSource), 'SOURCE_REQUIRED', '请选择现有来源，或填写一份新来源；不能同时提供', 400);
        const source = data.sourceId ? await sourceFor(tx, actor, data.sourceId, this.clock) : await this.createSource(tx, actor, data.inlineSource);
        await this.validateProfile(tx, actor.workspaceId, data);
        const person: Person = { ...base(actor.workspaceId, this.clock), displayName: data.displayName, roles: data.roles, sourceId: source.id,
            scopeId: source.scopeId, maintainerId: actor.membershipId, aliases: unique(data.aliases ?? []), cityCode: data.cityCode ?? null,
            languageCodes: data.languageCodes ?? [], skillCodes: data.skillCodes ?? [], heightCm: data.heightCm ?? null,
            intro: data.intro ?? '', status: 'DRAFT', protectionEpoch: 1 };
        await tx.insert('people', person);
        return person;
    }
    async updatePerson(tx: Tx, actor: Actor, id: string, input: unknown): Promise<Person> {
        requirePermission(actor, 'records.write');
        const data = PersonPatch.parse(input);
        const access = await profileAccess(tx, actor, id, this.clock, 'edit');
        const person = access.person;
        invariant(access.native || data.status === undefined, 'HANDOFF_FIELD_FORBIDDEN', '交接不能归档或改变档案生命周期', 403);
        cas(person, data.expectedRevision);
        invariant(Object.keys(data).length > 1, 'EMPTY_UPDATE', '没有需要保存的修改', 400);
        await this.validateProfile(tx, actor.workspaceId, data, person);
        const { expectedRevision: _, ...patch } = data;
        const next = patchDefined(touch(person, this.clock), patch);
        if (data.status !== undefined && data.status !== person.status) next.protectionEpoch++;
        await tx.replace('people', next);
        return next;
    }
    private personDto(person: Person): Record<string, unknown> {
        return { id: person.id, displayName: person.displayName, aliases: person.aliases, roles: person.roles, cityCode: person.cityCode,
            languageCodes: person.languageCodes, skillCodes: person.skillCodes, heightCm: person.heightCm, intro: person.intro,
            status: person.status, sourceId: person.sourceId, scopeId: person.scopeId, maintainerId: person.maintainerId,
            revision: person.revision, createdAt: person.createdAt, updatedAt: person.updatedAt };
    }
    async visiblePeople(tx: Tx, actor: Actor): Promise<Person[]> {
        requirePermission(actor, 'records.read');
        const visibility = await loadVisibility(tx, actor, this.clock);
        const rows = (await tx.find('people', { workspaceId: actor.workspaceId })).filter(p => visibility.personVisible(p));
        const combined = new Map(rows.map(p => [p.id, p]));
        for (const p of await delegatedPeople(tx, actor, this.clock)) combined.set(p.id, p);
        return [...combined.values()];
    }
    async listPeople(tx: Tx, actor: Actor, query: Record<string, string>): Promise<unknown> {
        requirePermission(actor, 'records.read');
        invariant((query.q?.length ?? 0) <= 120, 'QUERY_INVALID', '关键词过长', 400);
        const result: Record<string, unknown>[] = [];
        const q = query.q?.toLocaleLowerCase() ?? '';
        for (const person of await this.visiblePeople(tx, actor)) {
            if (q && ![person.displayName, ...person.aliases].some(s => s.toLocaleLowerCase().includes(q)))
                continue;
            if (query.role && !person.roles.includes(query.role))
                continue;
            if (query.cityCode && person.cityCode !== query.cityCode)
                continue;
            if (query.languageCode && !person.languageCodes.includes(query.languageCode))
                continue;
            if (query.status && person.status !== query.status)
                continue;
            result.push(this.personDto(person));
        }
        result.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || String(a.id).localeCompare(String(b.id)));
        return page(result, query, ['q', 'role', 'cityCode', 'languageCode', 'status']);
    }
    async getPerson(tx: Tx, actor: Actor, id: string): Promise<unknown> {
        requirePermission(actor, 'records.read');
        const access = await profileAccess(tx, actor, id, this.clock);
        const person = access.person;
        // The profile contains only a safe source summary; it does not grant the source endpoint.
        const source = (await workspaceRow(tx, 'sources', person.sourceId, actor.workspaceId))!;
        const evidence = [];
        for (const row of await tx.find('evidence', { workspaceId: actor.workspaceId, personId: id })) {
            const evidenceSource = await workspaceRow(tx, 'sources', row.sourceId, actor.workspaceId);
            if (!evidenceSource || !(await sourceVisible(tx, actor, evidenceSource, this.clock)))
                continue;
            const current = row.sourceRevision === evidenceSource.revision && row.valueDigest === digest(person[row.fieldPath as keyof Person]);
            evidence.push({ id: row.id, fieldPath: row.fieldPath, reviewedAt: row.reviewedAt, sourceId: row.sourceId, state: current ? 'VERIFIED' : 'STALE' });
        }
        const canEdit = actor.permissions.includes('records.write') && (access.native || !!await handoffForAction(tx, actor, id, this.clock, 'edit'));
        const canReview = actor.permissions.includes('sources.review') && (access.native || !!await handoffForAction(tx, actor, id, this.clock, 'review'));
        return { ...this.personDto(person), access: { mode: access.native ? 'NATIVE' : 'HANDOFF', canEdit, canReview,
            canReadSource: access.native && actor.permissions.includes('sources.read'),
            canReadContacts: access.native && actor.permissions.includes('sensitive.read'),
            canManageScope: access.native && actor.permissions.includes('members.manage'),
            canOffer: access.native && person.status !== 'ARCHIVED' && person.maintainerId === actor.membershipId
                && source.maintainerId === actor.membershipId && actor.permissions.includes('records.write') && actor.permissions.includes('sources.write') }, source: { id: source.id, revision: source.revision, title: source.title, basisMode: source.basisMode, validUntil: source.validUntil, status: source.status }, evidence };
    }
    async contacts(tx: Tx, actor: Actor, personId: string, meta: RequestMeta): Promise<unknown> {
        requirePermission(actor, 'sensitive.read');
        await personFor(tx, actor, personId, this.clock);
        const result = [];
        for (const row of await tx.find('contacts', { workspaceId: actor.workspaceId, personId })) {
            const source = await workspaceRow(tx, 'sources', row.sourceId, actor.workspaceId);
            if (source && await sourceVisible(tx, actor, source, this.clock))
                result.push({ id: row.id, sourceId: row.sourceId, kind: row.kind, value: decryptContact(row.ciphertext, this.config.contactKey, row.workspaceId + ':' + row.personId + ':' + row.id), maskedValue: row.maskedValue });
        }
        await audit(tx, actor, actor.workspaceId, 'contact.read', 'person', personId, [], meta, this.clock);
        return { items: result };
    }
    async replaceContacts(tx: Tx, actor: Actor, id: string, input: unknown): Promise<Person> {
        requirePermission(actor, 'sensitive.write');
        const data = Schemas.contacts.parse(input);
        const person = await personFor(tx, actor, id, this.clock);
        cas(person, data.expectedRevision);
        for (const row of data.contacts)
            await sourceFor(tx, actor, row.sourceId, this.clock);
        const previous = await tx.find('contacts', { workspaceId: actor.workspaceId, personId: id });
        // Replacing an unseen contact set could erase another operator's restricted material.
        for (const row of previous)
            await sourceFor(tx, actor, row.sourceId, this.clock);
        for (const row of previous)
            await tx.remove('contacts', row.id);
        for (const row of data.contacts) {
            const identity = base(actor.workspaceId, this.clock);
            await tx.insert('contacts', { ...identity, personId: id, sourceId: row.sourceId, kind: row.kind,
                ciphertext: encryptContact(row.value, this.config.contactKey, actor.workspaceId + ':' + id + ':' + identity.id),
                maskedValue: '••••' + (row.value.length > 4 ? row.value.slice(-4) : '') });
        }
        const next = touch(person, this.clock);
        await tx.replace('people', next);
        return next;
    }
    async confirmEvidence(tx: Tx, actor: Actor, input: unknown): Promise<Person> {
        requirePermission(actor, 'sources.review');
        const data = Schemas.evidence.parse(input);
        const { person } = await profileAccess(tx, actor, data.personId, this.clock, 'review');
        // A REVIEW handoff grants the basic profile, not raw evidence. The chosen source must
        // still be independently readable under its original scope. Never bypass sourceFor here.
        cas(person, data.expectedRevision);
        const source = await sourceFor(tx, actor, data.sourceId, this.clock);
        cas(source, data.sourceRevision);
        // Confirmations are append-only. A later confirmation never erases earlier provenance.
        const row = { ...base(actor.workspaceId, this.clock), personId: person.id,
            fieldPath: data.fieldPath, valueDigest: digest(person[data.fieldPath]), sourceId: source.id, sourceRevision: source.revision,
            reviewerId: actor.membershipId, reviewedAt: this.clock.now().toISOString() };
        await tx.insert('evidence', row);
        const next = touch(person, this.clock);
        await tx.replace('people', next);
        return next;
    }
    async changeScope(tx: Tx, actor: Actor, kind: 'person' | 'source', id: string, input: unknown): Promise<Person | Source> {
        requirePermission(actor, 'members.manage');
        const data = Schemas.recordScope.parse(input);
        await requireScope(tx, actor, data.scopeId);
        const row = kind === 'person' ? await personFor(tx, actor, id, this.clock, false) : await sourceFor(tx, actor, id, this.clock, false);
        cas(row, data.expectedRevision);
        const scope = (await tx.get('scopes', data.scopeId))!;
        if (kind === 'source')
            invariant((row as Source).basisMode !== 'TEMP_ORGANIZE' || scope.mode === 'RESTRICTED', 'TEMPORARY_SCOPE_REQUIRED', '临时接收资料不能扩大为整个空间可见');
        const next = { ...touch(row, this.clock), scopeId: data.scopeId, protectionEpoch: row.protectionEpoch + 1 };
        if (kind === 'person')
            await tx.replace('people', next as Person);
        else {
            await tx.replace('sources', next as Source);
            await appendSourceHistory(tx, actor, next as Source, 'SCOPE_CHANGED', this.clock);
        }
        return next;
    }
    async catalog(tx: Tx, actor: Actor): Promise<unknown> {
        requirePermission(actor, 'records.read');
        return { items: (await tx.find('dictionary', { workspaceId: actor.workspaceId })).map(row => ({ id: row.id, namespace: row.namespace, code: row.code, labelZh: row.labelZh, labelEn: row.labelEn, status: row.status, revision: row.revision })) };
    }
    async createCatalog(tx: Tx, actor: Actor, input: unknown): Promise<{
        id: string;
        revision: number;
    }> {
        requirePermission(actor, 'catalog.manage');
        const data = Schemas.dictionaryCreate.parse(input);
        invariant((await tx.find('dictionary', { workspaceId: actor.workspaceId, namespace: data.namespace, code: data.code })).length === 0, 'CODE_EXISTS', '分类代码已经存在', 409);
        const row = { ...base(actor.workspaceId, this.clock), ...data, status: 'ACTIVE' as const };
        await tx.insert('dictionary', row);
        return row;
    }
    async updateCatalog(tx: Tx, actor: Actor, id: string, input: unknown): Promise<{
        id: string;
        revision: number;
    }> {
        requirePermission(actor, 'catalog.manage');
        const data = Schemas.dictionaryPatch.parse(input);
        const row = await workspaceRow(tx, 'dictionary', id, actor.workspaceId);
        if (!row)
            missing();
        cas(row, data.expectedRevision);
        invariant(Object.keys(data).length > 1, 'EMPTY_UPDATE', '没有需要保存的修改', 400);
        const { expectedRevision: _, ...patch } = data;
        const next = patchDefined(touch(row, this.clock), patch);
        await tx.replace('dictionary', next);
        return next;
    }
}
