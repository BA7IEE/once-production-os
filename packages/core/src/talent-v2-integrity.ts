import { validateDemographics } from './talent-demographics.ts';
import type { Actor, Clock, Table, TableMap } from './model.ts';
import type { Tx } from './store.ts';
import { TALENT_V2_TABLES, TALENT_OWNER_TABLES } from './talent-v2-model.ts';
import { TD2_FACTS, type FactTable } from './talent-v2-schema.ts';
import { decryptContact } from './crypto.ts';
import { digest } from './json.ts';
import { invariant } from './errors.ts';
import { touch } from './helpers.ts';

/** All TD2 rows and their security-relevant endpoints participate in one recovery digest.
 * Do not return raw rows, encrypted identifiers or machine credential hashes in a report. */
export const TD2_INTEGRITY_TABLES = [...TALENT_V2_TABLES, 'people', 'sources', 'scopes',
    'memberships', 'works','workCredits','workAssets','talentSubmissionItems', 'personMedia','uploads','talentSubmissions','talentAccounts','assets', 'evidence', 'shortlistItems', 'personAliases', 'personMerges', 'mergeHistoryErasures'] as const;
export type IntegrityTable = typeof TD2_INTEGRITY_TABLES[number];
type Row = { id: string; workspaceId: string; [key: string]: unknown };
export interface TalentIntegrityReport {
    schemaVersion: 'once-talent-integrity-v1';
    graphDigest: string;
    tableCounts: Record<string, number>;
    relationFailures: number;
    credentialCount: number;
    credentialDecryptFailures: number;
    activeMachineCount: number;
    remainingMachineSecretCount: number;
    pendingProposalCount: number;
    blockers: string[];
}
export async function talentSnapshot(tx: Tx, workspaceId: string) {
    const data = {} as Record<IntegrityTable, Row[]>;
    for (const table of TD2_INTEGRITY_TABLES) {
        const rows = await tx.find(table, { workspaceId });
        invariant(rows.length <= 50000, 'TD2_INTEGRITY_LIMIT', '人才关系检查超出当前安全上限', 503);
        data[table] = rows.map(row => row as unknown as Row).sort((a, b) => a.id.localeCompare(b.id));
    }
    return data;
}
export async function inspectTalentIntegrity(tx: Tx, workspaceId: string, contactKey: Buffer): Promise<TalentIntegrityReport> {
    const data = await talentSnapshot(tx, workspaceId);
    const maps = Object.fromEntries(TD2_INTEGRITY_TABLES.map(t => [t, new Map(data[t].map(r => [r.id, r]))])) as Record<IntegrityTable, Map<string, Row>>;
    let relationFailures = 0;
    const check = (condition: boolean) => { if (!condition) relationFailures++; };
    const ref = (row: Row, field: string, table: IntegrityTable, samePerson = false, required = false) => {
        const id = row[field];
        if (id === null || id === undefined) { check(!required); return; }
        const target = maps[table].get(String(id));
        check(!!target && target.workspaceId === workspaceId && (!samePerson || target.personId === row.personId));
    };
    for(const w of data.works){ref(w,'sourceId','sources',false,true);ref(w,'scopeId','scopes',false,true);if(w.coverEntryId){const e=maps.workAssets.get(String(w.coverEntryId)),a=e?maps.assets.get(String(e.assetId)):null;check(!!e&&e.workId===w.id&&!!a&&String(a.mime).startsWith('image/'));}}
    const creditKeys=new Set<string>(),placementKeys=new Set<string>();
    for(const c of data.workCredits){ref(c,'workId','works',false,true);ref(c,'personId','people',false,true);check(!!c.personRoleId===!!c.sourceId);if(c.personRoleId){ref(c,'personRoleId','personRoles',true,true);ref(c,'sourceId','sources',false,true);check(maps.personRoles.get(String(c.personRoleId))?.roleCode===c.roleCode);}const key=c.workId+':'+c.personId+':'+c.roleCode;check(!creditKeys.has(key));creditKeys.add(key);}
    for(const e of data.workAssets){ref(e,'workId','works',false,true);ref(e,'assetId','assets',false,true);const key=e.workId+':'+e.assetId;check(!placementKeys.has(key));placementKeys.add(key);}
    for(const item of data.talentSubmissionItems)ref(item,'submissionId','talentSubmissions',false,true);
    const owner = (row: Row) => {
        const keys = Object.keys(TALENT_OWNER_TABLES).filter(k => row[k] !== null && row[k] !== undefined);
        check(keys.length === 1);
        if (keys.length !== 1) return;
        const field = keys[0] as keyof typeof TALENT_OWNER_TABLES;
        const table = TALENT_OWNER_TABLES[field];
        ref(row, field, table, false, true);
        const target = maps[table].get(String(row[field]));
        if (target && table !== 'people') {
            const def = TD2_FACTS[table as FactTable];
            check(!!def && Object.hasOwn(def.fields, String(row.fieldPath)));
        }
    };
    for(const r of data.personMedia){ref(r,'personId','people');ref(r,'personRoleId','personRoles',true);ref(r,'assetId','assets',false,true);ref(r,'sourceId','sources');ref(r,'submissionId','talentSubmissions');const a=maps.assets.get(String(r.assetId));check(a?.usageState===r.usageState);if(r.usageState==='ADOPTED')check(!!r.sourceId&&!!r.personId&&r.retainUntil===null);}
    for(const a of data.assets)if(a.sourceId===null)check(data.personMedia.some(r=>r.assetId===a.id&&r.usageState===a.usageState));
    for(const u of data.uploads)if(u.principalKind==='TALENT'){ref(u,'talentAccountId','talentAccounts',false,true);ref(u,'submissionId','talentSubmissions',false,true);check(u.actorId===null&&u.sourceId===null&&maps.talentSubmissions.get(String(u.submissionId))?.talentAccountId===u.talentAccountId);}
    for(const e of data.mergeHistoryErasures){
        ref(e,'mergeDecisionId','personMerges',false,true);ref(e,'personId','people',false,true);ref(e,'sourceId','sources',false,true);ref(e,'actorId','memberships');
        const merge=maps.personMerges.get(String(e.mergeDecisionId));check(merge?.duplicatePersonId===e.personId);
        const local=e.requestId!=null&&e.actorId!=null,origin=[e.originalWorkspaceId,e.originalRequestId,e.originalActorId].filter(v=>v!=null);check(local?origin.length===0:e.requestId==null&&e.actorId==null&&origin.length===3);
        check(e.revision===1&&e.createdAt===e.updatedAt&&e.createdAt===e.erasedAt&&Number(e.recordRevision)>0&&Date.parse(String(e.recordCreatedAt))<=Date.parse(String(e.recordUpdatedAt))&&Date.parse(String(e.recordUpdatedAt))<=Date.parse(String(e.erasedAt)));
        if(local){const request=await tx.get('deletionRequests',String(e.requestId));check(!!request&&request.workspaceId===workspaceId&&request.targetKind==='PERSON'&&[merge?.canonicalPersonId,merge?.duplicatePersonId].includes(request.targetId)&&!!request.planDigest&&!!request.executionPlanDigest&&request.cleanupStartedById===e.actorId);}
        if(e.recordKind==='PERSON')check(maps.people.get(String(e.personId))?.status==='ERASED'&&maps.people.get(String(e.personId))?.sourceId===e.sourceId&&e.recordId===e.personId&&['ARCHIVED','ERASED'].includes(String(e.recordStatusBefore))&&e.supersededById==null&&e.retiredMeasurementSetId==null);
        else {
            const table=e.recordKind==='TALENT_PROFILE'?'talentProfiles':e.recordKind==='CASTING_PROFILE'?'castingProfiles':null;check(!!table);
            if(table){check(!maps[table].has(String(e.recordId))&&e.recordStatusBefore==null&&typeof e.supersededById==='string'&&e.supersededById!==e.recordId&&(table==='castingProfiles'||e.retiredMeasurementSetId==null));
                const choices=(merge?.decisionManifest as {professionalConflicts?:Array<Record<string,unknown>>}|undefined)?.professionalConflicts;check(Array.isArray(choices)&&choices.some(c=>c.table===table&&c.duplicateId===e.recordId&&c.canonicalId===e.supersededById&&c.choice==='RETAIN_DUPLICATE_HISTORY'));
            }
        }
    }
    for(const row of data.personMerges){
        if(row.reasonErasedAt)check((row.decisionManifest as {reason?:unknown}).reason==='[ERASED]'&&Date.parse(String(row.completedAt))<=Date.parse(String(row.reasonErasedAt))&&Date.parse(String(row.reasonErasedAt))<=Date.parse(String(row.updatedAt))&&data.mergeHistoryErasures.some(e=>e.mergeDecisionId===row.id&&e.erasedAt===row.reasonErasedAt));
        ref(row,'actorId','memberships');ref(row,'canonicalPersonId','people',false,true);ref(row,'duplicatePersonId','people',false,true);ref(row,'canonicalSourceId','sources',false,true);ref(row,'duplicateSourceId','sources',false,true);
        const originals=[row.originalActorWorkspaceId,row.originalActorMembershipId].filter(v=>v!=null);check(row.actorId!=null?originals.length===0:originals.length===2);
        check(maps.people.get(String(row.canonicalPersonId))?.sourceId===row.canonicalSourceId&&maps.people.get(String(row.duplicatePersonId))?.sourceId===row.duplicateSourceId);
    }
    for(const row of data.personAliases){const merge=maps.personMerges.get(String(row.mergeDecisionId));check(!!merge&&merge.duplicatePersonId===row.oldPersonId&&merge.canonicalPersonId===row.canonicalPersonId);}
    for (const table of TALENT_V2_TABLES) for (const row of data[table]) {
        if (table !== 'fieldProposals' && Object.hasOwn(row, 'personId')) {
            ref(row, 'personId', 'people', false, true);
            check(maps.people.get(String(row.personId))?.status !== 'ERASED');
        }
        if (Object.hasOwn(row, 'sourceId')) ref(row, 'sourceId', 'sources', false, true);
        if (Object.hasOwn(row, 'scopeId')) ref(row, 'scopeId', 'scopes', false, true);
        if (table !== 'fieldProposals') {
            ref(row, 'personRoleId', 'personRoles', true);
            ref(row, 'collectionId', 'mediaCollections', true);
        }
        ref(row, 'agentPersonId', 'people');
        ref(row, 'agencyOrganizationId', 'organizations');
        ref(row, 'issuerOrganizationId', 'organizations');
        ref(row, 'evidenceAssetId', 'assets');
        ref(row, 'coverAssetId', 'assets');
        if(table==='talentProfiles'){try{validateDemographics(row,{now:()=>new Date()});}catch{check(false);}if(row.coverAssetId)check(maps.assets.get(String(row.coverAssetId))?.personId===row.personId||data.personMedia.some(r=>r.assetId===row.coverAssetId&&r.personId===row.personId&&r.usageState==='ADOPTED')||!!row.supersededById);}
        if(table==='measurementSets')check(row.reportedAt==null||Date.parse(String(row.reportedAt))>=Date.parse(String(row.createdAt))&&Date.parse(String(row.reportedAt))<=Date.parse(String(row.updatedAt)));
        if(table==='measurementSets')check(row.datePrecision==='UNKNOWN'?row.measuredOn===null:typeof row.measuredOn==='string');
        if (table === 'castingProfiles') ref(row, 'currentMeasurementSetId', 'measurementSets', true);
        if ((table === 'talentProfiles' || table === 'castingProfiles') && row.supersededById) {
            ref(row, 'supersededById', table, false, true);
            const current = maps[table].get(String(row.supersededById));
            check(!!current && !current.supersededById && current.personId !== row.personId
                && data.personAliases.some(a => a.oldPersonId === row.personId && a.canonicalPersonId === current.personId));
            if (table === 'castingProfiles') {
                check(row.currentMeasurementSetId == null);
                ref(row, 'retiredCurrentMeasurementSetId', 'measurementSets');
                if (row.retiredCurrentMeasurementSetId) check(maps.measurementSets.get(String(row.retiredCurrentMeasurementSetId))?.personId === current?.personId);
            }
        }
        if (table === 'castingProfiles' && !row.supersededById) check(row.retiredCurrentMeasurementSetId == null);
        if (table === 'measurementSets') ref(row, 'supersedesId', 'measurementSets', true);
        if(table==='mediaCollections'){if(row.coverAssetId)check(data.mediaCollectionItems.some(i=>i.collectionId===row.id&&i.assetId===row.coverAssetId)&&String(maps.assets.get(String(row.coverAssetId))?.mime).startsWith('image/'));if(row.isCurrent)check(row.status==='ACTIVE'&&data.mediaCollections.filter(c=>c.personId===row.personId&&c.personRoleId===row.personRoleId&&c.collectionTypeCode===row.collectionTypeCode&&c.isCurrent).length===1);const items=data.mediaCollectionItems.filter(i=>i.collectionId===row.id).sort((a,b)=>Number(a.orderIndex)-Number(b.orderIndex));check(items.every((i,n)=>i.orderIndex===n)&&new Set(items.map(i=>i.assetId)).size===items.length);}
        if (table === 'mediaCollectionItems') {
            ref(row, 'assetId', 'assets', false, true);
            ref(row, 'collectionId', 'mediaCollections', true, true);
            const relation=data.personMedia.find(r=>r.assetId===row.assetId),collection=maps.mediaCollections.get(String(row.collectionId));if(relation)check(relation.personId===row.personId&&relation.usageState==='ADOPTED'&&(!relation.personRoleId||relation.personRoleId===collection?.personRoleId));
        }
        if (table === 'servicePrincipals') ref(row, 'defaultMaintainerMembershipId', 'memberships', false, true);
        if (table === 'adultEligibilities') {
            ref(row, 'verifiedByMembershipId', 'memberships');
            const originals=[row.originalVerificationWorkspaceId,row.originalVerificationMembershipId].filter(v=>v!=null);
            check(originals.length===0||(originals.length===2&&row.verifiedByMembershipId==null&&row.verifiedAt!=null&&Date.parse(String(row.verifiedAt))>=Date.parse(String(row.createdAt))&&Date.parse(String(row.verifiedAt))<=Date.parse(String(row.updatedAt))));
            if(originals.length===2)check(data.evidence.some(e=>e.adultEligibilityId===row.id&&e.fieldPath==='state'&&e.valueDigest===digest('VERIFIED_ADULT')&&e.originalReviewWorkspaceId===row.originalVerificationWorkspaceId&&e.originalReviewMembershipId===row.originalVerificationMembershipId&&e.originalReviewedAt===row.verifiedAt));
            if(row.state==='VERIFIED_ADULT')check(row.verifiedAt!=null&&(row.verifiedByMembershipId!=null||originals.length===2));
        }
        if (table === 'talentMigrationReviews') {
            const previous = row.previousShortlistItemIds ?? [];
            check(Array.isArray(previous) && previous.length <= 100 && new Set(previous).size === previous.length && previous.every(id => typeof id === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id) && id !== row.shortlistItemId));
            ref(row, 'shortlistItemId', 'shortlistItems', true);
            ref(row, 'resolvedById', 'memberships');
        }
        if (['personRoles', 'personCapabilities', 'talentLocations'].includes(table))
            check(data.talentProfiles.some(p => p.personId === row.personId));
        if (table === 'personCapabilities') check(data.capabilityDefinitions.some(d => d.code === row.capabilityCode));
        if (table === 'fieldProposals') {
            owner(row);
            check(!!row.actorId !== !!row.servicePrincipalId);
            ref(row, 'actorId', 'memberships');
            ref(row, 'servicePrincipalId', 'servicePrincipals');
            ref(row, 'decidedById', 'memberships');
        }
    }
    for (const row of data.evidence) {
        owner(row); ref(row, 'sourceId', 'sources', false, true);
        const original=[row.originalReviewWorkspaceId,row.originalReviewMembershipId,row.originalReviewedAt].filter(v=>v!=null);
        check(original.length===0 || (original.length===3 && row.reviewerId===null && row.reviewedAt===null && Date.parse(String(row.originalReviewedAt))>=Date.parse(String(row.createdAt)) && Date.parse(String(row.originalReviewedAt))<=Date.parse(String(row.updatedAt))));
    }
    for (const row of data.shortlistItems) {
        ref(row, 'personId', 'people', false, true);
        ref(row, 'personRoleId', 'personRoles', true, row.roleContextState === 'BOUND');
    }
    let credentialCount = 0, credentialDecryptFailures = 0;
    for (const row of data.personCredentials) if (row.identifierCiphertext !== null && row.identifierCiphertext !== undefined) {
        credentialCount++;
        try { decryptContact(String(row.identifierCiphertext), contactKey, `credential:${workspaceId}:${row.id}`); }
        catch { credentialDecryptFailures++; }
    }
    const activeMachineCount = data.servicePrincipals.filter(r => r.status === 'ACTIVE').length;
    const remainingMachineSecretCount = data.servicePrincipals.filter(r => r.credentialHash !== null).length;
    const pendingProposalCount = data.fieldProposals.filter(r => r.state === 'PENDING').length;
    const blockers = [
        ...(relationFailures ? ['TD2_RELATION_INVALID'] : []),
        ...(credentialDecryptFailures ? ['TD2_CREDENTIAL_KEY_MISMATCH'] : []),
        ...(activeMachineCount || remainingMachineSecretCount ? ['TD2_MACHINE_NOT_REVOKED'] : []),
        ...(pendingProposalCount ? ['TD2_PROPOSAL_NOT_INVALIDATED'] : [])
    ];
    return { schemaVersion: 'once-talent-integrity-v1', graphDigest: digest(data),
        tableCounts: Object.fromEntries([...TALENT_V2_TABLES,'mergeHistoryErasures' as const].map(t => [t, data[t].length])), relationFailures,
        credentialCount, credentialDecryptFailures, activeMachineCount, remainingMachineSecretCount,
        pendingProposalCount, blockers };
}

/** Performed inside recovery.prepare's transaction and audit rollback boundary.
 * Re-issuing a machine account after recovery is an explicit new human operation. */
export async function quarantineTalentActors(tx: Tx, actor: Actor, clock: Clock) {
    for (const row of await tx.find('servicePrincipals', { workspaceId: actor.workspaceId })) {
        if (row.status === 'REVOKED' && row.credentialHash === null) continue;
        await tx.replace('servicePrincipals', { ...touch(row, clock), status: 'REVOKED',
            credentialHash: null, keyVersion: row.keyVersion + 1 });
    }
    for (const row of await tx.find('fieldProposals', { workspaceId: actor.workspaceId })) {
        if (row.state !== 'PENDING') continue;
        await tx.replace('fieldProposals', { ...touch(row, clock), state: 'STALE',
            decidedAt: clock.now().toISOString(), decidedById: actor.membershipId });
    }
}

/** Reusable source/person dependency census for maintenance operations.
 * No labels or secret values cross this boundary. */
export async function talentDependencyCounts(tx: Tx, workspaceId: string, kind: 'PERSON' | 'SOURCE' | 'ASSET', id: string) {
    const data = await talentSnapshot(tx, workspaceId);
    const found = new Set<string>();
    const counts: Record<string, number> = {};
    const add = (table: IntegrityTable, row: Row) => {
        const key = `${table}:${row.id}`;
        if (found.has(key)) return;
        found.add(key); counts[table] = (counts[table] ?? 0) + 1;
    };
    for (const table of TALENT_V2_TABLES) for (const row of data[table]) {
        if ((kind === 'PERSON' && (row.personId === id || row.agentPersonId === id))
            || (kind === 'SOURCE' && row.sourceId === id)
            || (kind === 'ASSET' && (row.assetId === id || row.evidenceAssetId === id || row.coverAssetId === id))) add(table, row);
    }
    if (kind === 'PERSON') for (const table of ['talentProfiles', 'castingProfiles'] as const)
        for (const row of data[table]) if (row.supersededById && data[table].some(r => r.id === row.supersededById && r.personId === id)) add(table, row);
    if (kind === 'SOURCE') {
        const people = data.people.filter(r => r.sourceId === id);
        for (const table of TALENT_V2_TABLES) for (const row of data[table])
            if (people.some(p => row.personId === p.id || row.agentPersonId === p.id)) add(table, row);
    }
    // Typed FieldEvidence/Proposal owners are not necessarily Person IDs.
    for (const table of ['evidence', 'fieldProposals'] as const) for (const row of data[table]) {
        const matched = Object.entries(TALENT_OWNER_TABLES).some(([field, ownerTable]) =>
            found.has(`${ownerTable}:${row[field]}`));
        if (matched || (kind === 'SOURCE' && row.sourceId === id && row.personId == null)) add(table, row);
    }
    return { count: found.size, counts, digest: digest([...found].sort()) };
}
