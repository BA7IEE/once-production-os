import {normalizePrincipalRow} from '../../packages/core/src/principal.ts';
import { AppError } from '../../packages/core/src/errors.ts';
import type { Store, Tx } from '../../packages/core/src/store.ts';
import type { Table, TableMap } from '../../packages/core/src/model.ts';
const tables: Table[] = ['mediaPurgeIntents','personMedia','talentInvitations','talentInvitationContexts','talentClaims','talentAccessGrants','talentConsents','talentSubmissions','talentSubmissionItems','sourceAttributions','sourceUseBases','talentAccounts','talentIdentities','talentSessions','talentAuthContexts','talentAuthChallenges','talentAuthDeliveries',"brands","projectParties",'aiResponseMetadata','aiConnections','aiReconciliations','aiBudgetReleases','aiApprovals','aiGrants','aiTasks','aiDependencies','aiBudgets','aiRuns','aiAttempts','localeTexts','localeDependencies','mergeHistoryErasures','talentProfiles', 'personRoles', 'capabilityDefinitions', 'personCapabilities', 'personLanguages', 'talentLocations', 'castingProfiles', 'measurementSets', 'adultEligibilities', 'organizations', 'representations', 'personExternalRefs', 'personCredentials', 'translatorLanguagePairs', 'translatorServiceModes', 'mediaCollections', 'mediaCollectionTags', 'mediaCollectionItems', 'servicePrincipals', 'fieldProposals', 'talentMigrationReviews', 'recoveryRuns', 'personMerges', 'personAliases', 'deletionRequests', 'deletionItems', 'usePermissions', 'exports', 'exportDependencies', 'shortlists', 'shortlistItems', 'shortlistItemAssets', 'works', 'workAssets', 'workCredits', 'projects', 'projectParticipants', 'projectWorks', 'workspaces', 'users', 'memberships', 'sessions', 'activations', 'scopes', 'scopeMembers', 'sources', 'sourceHistory', 'people', 'contacts', 'evidence', 'dictionary', 'receipts', 'audits', 'rateBuckets', 'imports', 'jobs', 'handoffs', 'uploads', 'assets'];
type Data = {
    [K in Table]: Map<string, TableMap[K]>;
};
/** Test double only. It is never imported by apps/api and does not emulate PostgreSQL FKs,
 * isolation levels, advisory locks or crashes. These need the separate PostgreSQL test suite. */
export class MemoryStore implements Store {
    data: Data;
    private tail: Promise<void> = Promise.resolve();
    failNextAudit = false;
    constructor() { this.data = Object.fromEntries(tables.map(t => [t, new Map()])) as Data; }
    async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
        const previous = this.tail;
        let release!: () => void;
        this.tail = new Promise<void>(r => { release = r; });
        await previous;
        const draft = structuredClone(this.data);
        const tx: Tx = {
            mediaPurgeOverview:async(workspaceId,now)=>{const ps=[...draft.mediaPurgeIntents.values()].filter(p=>p.workspaceId===workspaceId),rs=[...draft.personMedia.values()].filter(r=>r.workspaceId===workspaceId&&!r.purgedAt&&r.retainUntil&&r.retainUntil<=now&&r.usageState!=='ADOPTED'),ids=[...new Set(rs.map(r=>r.assetId))];return {pending:ids.length,cleaning:ps.filter(p=>p.leaseUntil&&p.leaseUntil>now).length,unknown:ps.filter(p=>p.state==='DELETE_UNKNOWN').length,recentFailures:ps.filter(p=>['DELETE_UNKNOWN','PURGE_RECONCILIATION_REQUIRED'].includes(p.lastCode??'')&&Date.parse(p.updatedAt)>Date.parse(now)-86400000).length,oldestDue:rs.map(r=>r.retainUntil!).sort()[0]??null,pendingBytes:ids.reduce((n,id)=>n+(draft.assets.get(id)?.bytes??0),0),reconcileIds:ps.filter(p=>['DELETE_PENDING','DELETE_UNKNOWN','DELETE_CONFIRMED'].includes(p.state)&&(!p.leaseUntil||p.leaseUntil<=now)).slice(0,4).map(p=>p.id)};},
            mediaPurgeCandidates:async(now,limit)=>{const intents=[...draft.mediaPurgeIntents.values()];return [...new Set([...intents.filter(i=>!['ERASED','SKIPPED'].includes(i.state)&&i.nextAttemptAt<=now&&(!i.leaseUntil||i.leaseUntil<=now)).map(i=>i.assetId),...[...draft.personMedia.values()].filter(r=>draft.assets.get(r.assetId)?.state==='READY'&&['STAGED','RETIRED'].includes(r.usageState)&&!r.purgedAt&&r.retainUntil&&r.retainUntil<=now&&!intents.some(i=>i.assetId===r.assetId)&&![...draft.deletionRequests.values()].some(d=>d.workspaceId===r.workspaceId&&d.state!=='DRAFT'&&(d.targetKind==='ASSET'&&d.targetId===r.assetId||[...draft.deletionItems.values()].some(i=>i.requestId===d.id&&i.resourceId===r.assetId)))).map(r=>r.assetId).sort()])].slice(0,Math.min(32,limit));},
            findIn:async(table,workspaceId,field,ids)=>structuredClone([...draft[table].values()].filter(r=>(r as unknown as Record<string,unknown>).workspaceId===workspaceId&&ids.includes(String((r as unknown as Record<string,unknown>)[String(field)])))) as never,
            talentDirectoryQuery:async input=>{const rows=[...draft.people.values()].filter(p=>p.workspaceId===input.workspaceId&&input.visibleScopeIds.includes(p.scopeId)&&p.status!=='ERASED'&&(input.phase==='CANDIDATES'||input.verifiedIds?.includes(p.id))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));return {total:rows.length,ids:(input.phase==='PAGE'?rows.slice(((input.page??1)-1)*(input.pageSize??20),(input.page??1)*(input.pageSize??20)):rows).map(p=>p.id)};},
            get: async <K extends Table>(table: K, id: string): Promise<TableMap[K] | null> => structuredClone(draft[table].get(id) ?? null) as TableMap[K] | null,
            find: async <K extends Table>(table: K, where: Partial<TableMap[K]> = {}): Promise<TableMap[K][]> => {
                const rows = [...draft[table].values()] as TableMap[K][];
                return structuredClone(rows.filter(row => Object.entries(where).every(([key, value]) => JSON.stringify((row as unknown as Record<string, unknown>)[key]) === JSON.stringify(value))));
            },
            insert: async <K extends Table>(table: K, row: TableMap[K]): Promise<void> => {
                if(table==='receipts'||table==='audits')row=normalizePrincipalRow(row,table==='audits');
                if (table === 'audits' && this.failNextAudit) {
                    this.failNextAudit = false;
                    throw new Error('injected audit failure');
                }
                if (draft[table].has(row.id))
                    throw new Error('duplicate id');
                (draft[table] as Map<string, TableMap[K]>).set(row.id, structuredClone(row));
            },
            replace: async <K extends Table>(table: K, row: TableMap[K]): Promise<void> => {
                if (['aiResponseMetadata','aiReconciliations','aiBudgetReleases','mergeHistoryErasures'].includes(table)) throw new AppError(409,'HISTORY_IMMUTABLE','历史清理证据只允许追加');
                if (table === 'sourceHistory')
                    throw new AppError(409, 'HISTORY_IMMUTABLE', '来源历史只允许追加');
                if ((table === 'talentProfiles' || table === 'castingProfiles') && draft[table].get(row.id)?.supersededById)
                    throw new AppError(409, 'MERGE_HISTORY_IMMUTABLE', '合并保留的专业档案只读');
                if (!draft[table].has(row.id))
                    throw new Error('missing row');
                (draft[table] as Map<string, TableMap[K]>).set(row.id, structuredClone(row));
            },
            remove: async (table, id) => {
                if (['aiResponseMetadata','aiReconciliations','aiBudgetReleases','mergeHistoryErasures'].includes(table)) throw new AppError(409,'HISTORY_IMMUTABLE','历史清理证据只允许追加');
                if (table === 'sourceHistory')
                    throw new AppError(409, 'HISTORY_IMMUTABLE', '来源历史只允许追加');
                if ((table === 'talentProfiles' || table === 'castingProfiles') && draft[table].get(id)?.supersededById)
                    throw new AppError(409, 'MERGE_HISTORY_IMMUTABLE', '合并历史删除需要专用保留策略');
                draft[table].delete(id);
            },
            redactSourceHistory: async (id, at) => {
                const row = draft.sourceHistory.get(id);
                if (!row) return;
                if ((row.snapshot as any)?.erased === true) return;
                draft.sourceHistory.set(id, { ...row, updatedAt: at,
                    decisionReason: row.decisionReason === null ? null : '[ERASED]',
                    snapshot: { id: row.sourceId, workspaceId: row.workspaceId, revision: row.sourceRevision, scopeId: row.scopeId, erased: true } });
            },
            eraseRetiredProfile: async (table,id,erasureId) => {
                const e=draft.mergeHistoryErasures.get(erasureId),r=e?.requestId?draft.deletionRequests.get(e.requestId):null,old=draft[table].get(id);
                if(!e||!r||r.state!=='CLEANING'||!r.planDigest||!r.executionPlanDigest||e.recordId!==id||e.recordRevision!==old?.revision||!old.supersededById||e.recordKind!==(table==='talentProfiles'?'TALENT_PROFILE':'CASTING_PROFILE'))
                    throw new AppError(409,'HISTORY_ERASURE_REQUIRED','缺少匹配的冻结历史清理记录');
                draft[table].delete(id);
            },
            redactMergeReason: async (id,erasureId,at) => {
                const e=draft.mergeHistoryErasures.get(erasureId),r=e?.requestId?draft.deletionRequests.get(e.requestId):null,old=draft.personMerges.get(id);
                if(!e||!r||r.state!=='CLEANING'||!r.planDigest||!r.executionPlanDigest||!old||e.mergeDecisionId!==id||e.erasedAt!==at)
                    throw new AppError(409,'HISTORY_ERASURE_REQUIRED','缺少匹配的历史说明清理记录');
                if(!old.reasonErasedAt)draft.personMerges.set(id,{...old,revision:old.revision+1,updatedAt:at,reasonErasedAt:at,decisionManifest:{...(old.decisionManifest as Record<string,unknown>),reason:'[ERASED]'}});
            },
            talentQuery: async input => {
                const scopeIds = new Set(input.visibleScopeIds), sourceIds = new Set(input.visibleSourceIds);
                const blocks = [...draft.deletionRequests.values()].filter(d => d.workspaceId === input.workspaceId && d.state !== 'DRAFT');
                const mergedPeople = new Set([...draft.personAliases.values()].filter(a => a.workspaceId === input.workspaceId).map(a => a.oldPersonId));
                const blocked = (kind: string) => new Set(blocks.filter(d => d.targetKind === kind).map(d => d.targetId));
                const blockedPeople = blocked('PERSON'), blockedWorks = blocked('WORK'), blockedProjects = blocked('PROJECT');
                const works = [...draft.works.values()].filter(w => w.workspaceId === input.workspaceId && !blockedWorks.has(w.id) && scopeIds.has(w.scopeId) && sourceIds.has(w.sourceId));
                const workById = new Map(works.map(w => [w.id, w]));
                const credits = [...draft.workCredits.values()].filter(c => c.workspaceId === input.workspaceId && workById.has(c.workId));
                const projects = new Map([...draft.projects.values()].filter(p => p.workspaceId === input.workspaceId && !blockedProjects.has(p.id) && scopeIds.has(p.scopeId) && sourceIds.has(p.sourceId)).map(p => [p.id, p]));
                const actual = [...draft.projectParticipants.values()].filter(p => p.workspaceId === input.workspaceId && p.state === 'ACTUAL' && projects.has(p.projectId));
                const facts = (personId: string) => {
                    const linked = credits.filter(c => c.personId === personId).map(c => workById.get(c.workId)!).filter(Boolean);
                    return { industryCodes: [...new Set(linked.flatMap(w => w.industryCode ? [w.industryCode] : []))].sort(),
                        workTypeCodes: [...new Set(linked.flatMap(w => w.workTypeCodes))].sort() };
                };
                const projectCount = (personId: string) => new Set(actual.filter(p => p.personId === personId).map(p => p.projectId)).size;
                const all = [...draft.people.values()].filter(p => p.workspaceId === input.workspaceId && !mergedPeople.has(p.id) && !blockedPeople.has(p.id) && p.status!=='ERASED' && scopeIds.has(p.scopeId) && (sourceIds.has(p.sourceId)||(input.retainedPersonIds??[]).includes(p.id))).map(person => {
                    const f = facts(person.id); return { person, actualProjectCount: projectCount(person.id), ...f };
                }).filter(row => {
                    const p = row.person;
                    return (!input.q || [p.displayName, ...p.aliases].some(x => x.toLocaleLowerCase().includes(input.q)))
                        && (!input.role || p.roles.includes(input.role)) && (!input.cityCode || p.cityCode === input.cityCode)
                        && (!input.languageCode || p.languageCodes.includes(input.languageCode)) && (!input.skillCode || p.skillCodes.includes(input.skillCode))
                        && (!input.status || p.status === input.status) && (!input.actualProject || row.actualProjectCount > 0)
                        && (!input.industryCode || row.industryCodes.includes(input.industryCode)) && (!input.workTypeCode || row.workTypeCodes.includes(input.workTypeCode));
                }).sort((a, b) => b.person.updatedAt.localeCompare(a.person.updatedAt) || a.person.id.localeCompare(b.person.id));
                const chosen = input.scanForVerification ? all : all.slice((input.page - 1) * input.pageSize, input.page * input.pageSize);
                const ids = new Set(chosen.map(r => r.person.id));
                const count = (codes: string[], matches: (row: typeof all[number], code: string) => boolean) =>
                    [...new Set(codes)].sort().map(code => ({ code, count: all.filter(row => matches(row, code)).length }));
                const facetCounts = {
                    roles: count(all.flatMap(r => r.person.roles), (r, code) => r.person.roles.includes(code)),
                    cities: count(all.flatMap(r => r.person.cityCode ? [r.person.cityCode] : []), (r, code) => r.person.cityCode === code),
                    languages: count(all.flatMap(r => r.person.languageCodes), (r, code) => r.person.languageCodes.includes(code)),
                    skills: count(all.flatMap(r => r.person.skillCodes), (r, code) => r.person.skillCodes.includes(code)),
                    industries: count(all.flatMap(r => r.industryCodes), (r, code) => r.industryCodes.includes(code)),
                    workTypes: count(all.flatMap(r => r.workTypeCodes), (r, code) => r.workTypeCodes.includes(code))
                };
                return { rows: structuredClone(chosen), baseTotal: all.length, alreadyPaged: !input.scanForVerification,
                    facets: structuredClone(facetCounts),
                    evidence: structuredClone([...draft.evidence.values()].filter(e => e.workspaceId === input.workspaceId && ids.has(e.personId) && sourceIds.has(e.sourceId))) };
            }
        };
        try {
            const result = await fn(tx);
            this.data = draft;
            return result;
        }
        finally {
            release();
        }
    }
    async close(): Promise<void> { }
    rows<K extends Table>(name: K): TableMap[K][] { return structuredClone([...this.data[name].values()]) as TableMap[K][]; }
}
