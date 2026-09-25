import type { Actor, Clock, Config, Contact, Person, Source } from './model.ts';
import type { Tx } from './store.ts';
import type { PersonMergeCollisionChoice, PersonMergeDecision, PersonMergeField, PersonMergeFieldChoice } from './merge-model.ts';
import { MERGE_LIMITS as L, PERSON_MERGE_FIELDS as F } from './merge-model.ts';
import { MergeSchemas as S } from './merge-validation.ts';
import { AppError, invariant, missing } from './errors.ts';
import { base, cas, page, touch, unique, workspaceRow } from './helpers.ts';
import { digest } from './json.ts';
import { decryptContact, encryptContact } from './crypto.ts';
import { deletionBlocked, personAliasFor, personFor, requirePermission, requireScope, sourceFor } from './policy.ts';
import { workFor, projectFor } from './production-policy.ts';
import { shortlistFor } from './shortlists.ts';

type Blocker = { code: string; count: number };
type FieldConflict = { field: PersonMergeField; canonicalValue: unknown; duplicateValue: unknown; choices: PersonMergeFieldChoice[] };
type Collision = {
    id: string;
    kind: 'WORK_CREDIT' | 'PROJECT_PARTICIPANT' | 'SHORTLIST_ITEM';
    rootId: string;
    rootLabel: string;
    canonicalEntryId: string;
    duplicateEntryId: string;
    canonicalValue: unknown;
    duplicateValue: unknown;
};
type ScanPlan = {
    canonical: Person;
    duplicate: Person;
    canonicalSource: Source;
    duplicateSource: Source;
    fieldConflicts: FieldConflict[];
    collisions: Collision[];
    blockers: Blocker[];
    activeHandoffIds: string[];
    activePermissionIds: string[];
    contactIds: string[];
    evidenceIds: string[];
    uploadIds: string[];
    assetReassignIds: string[];
    assetDetachIds: string[];
    workCreditMoveIds: string[];
    projectParticipantMoveIds: string[];
    shortlistItemMoveIds: string[];
    affectedWorkIds: string[];
    affectedProjectIds: string[];
    affectedShortlistIds: string[];
    previewDigest: string;
};
const ARRAY_FIELDS = new Set<PersonMergeField>(['aliases','roles','languageCodes','skillCodes']);
function same(a: unknown, b: unknown) { return digest(a) === digest(b); }
function blocker(map: Map<string,number>, code: string, count = 1) { map.set(code, (map.get(code) ?? 0) + count); }
function sortedBlockers(map: Map<string,number>): Blocker[] { return [...map].sort().map(([code,count])=>({code,count})); }
function readField(person: Person, field: PersonMergeField): unknown { return person[field]; }

export class PersonMerges {
    clock: Clock;
    config: Config;
    constructor(clock: Clock, config: Config) { this.clock = clock; this.config = config; }

    private permissions(actor: Actor) {
        requirePermission(actor, 'data.merge');
        requirePermission(actor, 'records.write');
    }
    private executionGate() {
        invariant(this.config.dataMergeMode === 'INTERNAL_APPROVED', 'MERGE_DISABLED', '当前环境未批准执行人才合并', 503);
    }
    private async visibleWork(tx: Tx, actor: Actor, id: string) {
        try { return await workFor(tx, actor, id, this.clock); }
        catch (error) { if (error instanceof AppError && error.status === 404) return null; throw error; }
    }
    private async visibleProject(tx: Tx, actor: Actor, id: string) {
        try { return await projectFor(tx, actor, id, this.clock); }
        catch (error) { if (error instanceof AppError && error.status === 404) return null; throw error; }
    }
    private async visibleShortlist(tx: Tx, actor: Actor, id: string) {
        try { return await shortlistFor(tx, actor, id); }
        catch (error) { if (error instanceof AppError && error.status === 404) return null; throw error; }
    }

    private async scan(tx: Tx, actor: Actor, canonicalId: string, duplicateId: string,
        expectedCanonicalRevision: number, expectedDuplicateRevision: number): Promise<ScanPlan> {
        this.permissions(actor);
        invariant(canonicalId !== duplicateId, 'MERGE_SELF', '主档案与重复档案不能是同一条记录', 400);
        const canonical = await personFor(tx, actor, canonicalId, this.clock);
        const duplicate = await personFor(tx, actor, duplicateId, this.clock);
        cas(canonical, expectedCanonicalRevision); cas(duplicate, expectedDuplicateRevision);
        const canonicalSource = await sourceFor(tx, actor, canonical.sourceId, this.clock);
        const duplicateSource = await sourceFor(tx, actor, duplicate.sourceId, this.clock);
        const blockers = new Map<string,number>();

        if (canonical.scopeId !== duplicate.scopeId) blocker(blockers, 'SCOPE_MISMATCH');
        if (canonical.status === 'ERASED' || duplicate.status === 'ERASED') blocker(blockers, 'ERASED_PERSON');
        if (await personAliasFor(tx, actor.workspaceId, canonical.id)) blocker(blockers, 'CANONICAL_ALREADY_ALIAS');
        if (await personAliasFor(tx, actor.workspaceId, duplicate.id)) blocker(blockers, 'DUPLICATE_ALREADY_ALIAS');
        const inboundDuplicateAliases = await tx.find('personAliases', { workspaceId: actor.workspaceId, canonicalPersonId: duplicate.id });
        if (inboundDuplicateAliases.length) blocker(blockers, 'DUPLICATE_HAS_ALIASES', inboundDuplicateAliases.length);

        const deletionRequests = await tx.find('deletionRequests', { workspaceId: actor.workspaceId });
        for (const row of deletionRequests)
            if (row.targetKind === 'PERSON' && (row.targetId === canonical.id || row.targetId === duplicate.id))
                blocker(blockers, 'PERSON_DELETION_REQUEST');
        const activeDeletionIds = new Set(deletionRequests.filter(r => ['DRAFT','BLOCKED_FOR_USE','CLEANING'].includes(r.state)).map(r=>r.id));
        for (const item of await tx.find('deletionItems', { workspaceId: actor.workspaceId }))
            if (item.resourceKind === 'person' && (item.resourceId === canonical.id || item.resourceId === duplicate.id) && activeDeletionIds.has(item.requestId))
                blocker(blockers, 'ACTIVE_DELETION_DEPENDENCY');

        const fieldConflicts: FieldConflict[] = [];
        for (const field of F) {
            const a = readField(canonical, field), d = readField(duplicate, field);
            if (!same(a,d))
                fieldConflicts.push({ field, canonicalValue: a, duplicateValue: d,
                    choices: ARRAY_FIELDS.has(field) ? ['CANONICAL','DUPLICATE','UNION'] : ['CANONICAL','DUPLICATE'] });
        }
        invariant(fieldConflicts.length <= L.conflicts, 'MERGE_FIELD_LIMIT', '字段冲突超过当前安全处理上限', 409);

        const contactRows = await tx.find('contacts', { workspaceId: actor.workspaceId, personId: duplicate.id });
        if (contactRows.length && !actor.permissions.includes('sensitive.write')) blocker(blockers, 'SENSITIVE_WRITE_REQUIRED');
        for (const row of contactRows)
            try { await sourceFor(tx, actor, row.sourceId, this.clock); } catch(e) { if(e instanceof AppError && e.status===404) blocker(blockers,'HIDDEN_CONTACT_SOURCE'); else throw e; }

        const evidenceRows = await tx.find('evidence', { workspaceId: actor.workspaceId, personId: duplicate.id });
        for (const row of evidenceRows)
            try { await sourceFor(tx, actor, row.sourceId, this.clock); } catch(e) { if(e instanceof AppError && e.status===404) blocker(blockers,'HIDDEN_EVIDENCE_SOURCE'); else throw e; }

        const activeHandoffs = (await tx.find('handoffs', { workspaceId: actor.workspaceId }))
            .filter(h => (h.personId === canonical.id || h.personId === duplicate.id) && ['PENDING','ACCEPTED'].includes(h.state));
        const activePermissions = (await tx.find('usePermissions', { workspaceId: actor.workspaceId }))
            .filter(p => p.subjectKind === 'PERSON' && (p.subjectPersonId === canonical.id || p.subjectPersonId === duplicate.id) && p.status === 'ACTIVE');
        if (activePermissions.length && !actor.permissions.includes('sources.review')) blocker(blockers, 'SOURCES_REVIEW_REQUIRED');

        const uploadRows = await tx.find('uploads', { workspaceId: actor.workspaceId, personId: duplicate.id });
        for (const row of uploadRows) {
            try { await requireScope(tx, actor, row.scopeId); await sourceFor(tx, actor, row.sourceId, this.clock, false); }
            catch(e) { if(e instanceof AppError && e.status===404) blocker(blockers,'HIDDEN_MEDIA_DEPENDENCY'); else throw e; }
        }
        const assetRows = await tx.find('assets', { workspaceId: actor.workspaceId, personId: duplicate.id });
        for (const row of assetRows) {
            try { await requireScope(tx, actor, row.scopeId); await sourceFor(tx, actor, row.sourceId, this.clock, false); }
            catch(e) { if(e instanceof AppError && e.status===404) blocker(blockers,'HIDDEN_MEDIA_DEPENDENCY'); else throw e; }
        }
        const assetReassignIds = assetRows.filter(a => a.sourceId === canonical.sourceId && a.state !== 'ERASED').map(a=>a.id).sort();
        const assetDetachIds = assetRows.filter(a => a.sourceId !== canonical.sourceId && a.state !== 'ERASED').map(a=>a.id).sort();
        const uploadIds = uploadRows.filter(u => u.state !== 'ERASED').map(u=>u.id).sort();

        const collisions: Collision[] = [];
        const workCreditMoveIds: string[] = [], projectParticipantMoveIds: string[] = [], shortlistItemMoveIds: string[] = [];
        const affectedWorkIds = new Set<string>(), affectedProjectIds = new Set<string>(), affectedShortlistIds = new Set<string>();

        const duplicateCredits = await tx.find('workCredits', { workspaceId: actor.workspaceId, personId: duplicate.id });
        const canonicalCredits = await tx.find('workCredits', { workspaceId: actor.workspaceId, personId: canonical.id });
        for (const row of duplicateCredits) {
            const root = await this.visibleWork(tx, actor, row.workId);
            if (!root) { blocker(blockers, 'HIDDEN_WORK_REFERENCE'); continue; }
            affectedWorkIds.add(row.workId);
            const existing = canonicalCredits.find(x => x.workId === row.workId && x.roleCode === row.roleCode);
            if (existing) collisions.push({ id: row.id, kind: 'WORK_CREDIT', rootId: row.workId, rootLabel: root.title,
                canonicalEntryId: existing.id, duplicateEntryId: row.id, canonicalValue: { roleCode: existing.roleCode, note: existing.note },
                duplicateValue: { roleCode: row.roleCode, note: row.note } });
            else workCreditMoveIds.push(row.id);
        }

        const duplicateParts = await tx.find('projectParticipants', { workspaceId: actor.workspaceId, personId: duplicate.id });
        const canonicalParts = await tx.find('projectParticipants', { workspaceId: actor.workspaceId, personId: canonical.id });
        for (const row of duplicateParts) {
            const root = await this.visibleProject(tx, actor, row.projectId);
            if (!root) { blocker(blockers, 'HIDDEN_PROJECT_REFERENCE'); continue; }
            affectedProjectIds.add(row.projectId);
            const existing = canonicalParts.find(x => x.projectId === row.projectId && x.roleCode === row.roleCode);
            if (existing) collisions.push({ id: row.id, kind: 'PROJECT_PARTICIPANT', rootId: row.projectId, rootLabel: root.title,
                canonicalEntryId: existing.id, duplicateEntryId: row.id, canonicalValue: { roleCode: existing.roleCode, state: existing.state, note: existing.note },
                duplicateValue: { roleCode: row.roleCode, state: row.state, note: row.note } });
            else projectParticipantMoveIds.push(row.id);
        }

        const duplicateShort = await tx.find('shortlistItems', { workspaceId: actor.workspaceId, personId: duplicate.id });
        const canonicalShort = await tx.find('shortlistItems', { workspaceId: actor.workspaceId, personId: canonical.id });
        for (const row of duplicateShort) {
            const root = await this.visibleShortlist(tx, actor, row.shortlistId);
            if (!root) { blocker(blockers, 'HIDDEN_SHORTLIST_REFERENCE'); continue; }
            affectedShortlistIds.add(row.shortlistId);
            const existing = canonicalShort.find(x => x.shortlistId === row.shortlistId && (x.workId ?? null) === (row.workId ?? null));
            if (existing) collisions.push({ id: row.id, kind: 'SHORTLIST_ITEM', rootId: row.shortlistId, rootLabel: root.title,
                canonicalEntryId: existing.id, duplicateEntryId: row.id, canonicalValue: { note: existing.note, workId: existing.workId },
                duplicateValue: { note: row.note, workId: row.workId } });
            else shortlistItemMoveIds.push(row.id);
        }
        if (collisions.length > L.collisions) blocker(blockers, 'MERGE_COLLISION_LIMIT', collisions.length);

        const responseCore = {
            canonical: { id: canonical.id, displayName: canonical.displayName, sourceId: canonical.sourceId, scopeId: canonical.scopeId, revision: canonical.revision },
            duplicate: { id: duplicate.id, displayName: duplicate.displayName, sourceId: duplicate.sourceId, scopeId: duplicate.scopeId, revision: duplicate.revision },
            sourceSnapshot: {
                canonical: { id: canonicalSource.id, revision: canonicalSource.revision, protectionEpoch: canonicalSource.protectionEpoch },
                duplicate: { id: duplicateSource.id, revision: duplicateSource.revision, protectionEpoch: duplicateSource.protectionEpoch }
            },
            fieldConflicts,
            collisions: [...collisions].sort((a,b)=>a.kind.localeCompare(b.kind)||a.rootLabel.localeCompare(b.rootLabel)||a.id.localeCompare(b.id)),
            blockers: sortedBlockers(blockers),
            revocations: { handoffs: activeHandoffs.length, usePermissions: activePermissions.length },
            contactsToReencrypt: contactRows.length,
            media: { uploadsToDetach: uploadIds.length, assetsToReassign: assetReassignIds.length, assetsToDetach: assetDetachIds.length },
            moves: { workCredits: workCreditMoveIds.length, projectParticipants: projectParticipantMoveIds.length, shortlistItems: shortlistItemMoveIds.length }
        };
        const internal = { ...responseCore,
            activeHandoffIds: activeHandoffs.map(x=>x.id).sort(), activePermissionIds: activePermissions.map(x=>x.id).sort(),
            contactIds: contactRows.map(x=>x.id).sort(), evidenceIds: evidenceRows.map(x=>x.id).sort(), uploadIds,
            assetReassignIds, assetDetachIds, workCreditMoveIds: workCreditMoveIds.sort(),
            projectParticipantMoveIds: projectParticipantMoveIds.sort(), shortlistItemMoveIds: shortlistItemMoveIds.sort(),
            affectedWorkIds: [...affectedWorkIds].sort(), affectedProjectIds: [...affectedProjectIds].sort(), affectedShortlistIds: [...affectedShortlistIds].sort()
        };
        return { canonical, duplicate, canonicalSource, duplicateSource, fieldConflicts, collisions: responseCore.collisions,
            blockers: responseCore.blockers, activeHandoffIds: internal.activeHandoffIds, activePermissionIds: internal.activePermissionIds,
            contactIds: internal.contactIds, evidenceIds: internal.evidenceIds, uploadIds, assetReassignIds, assetDetachIds,
            workCreditMoveIds: internal.workCreditMoveIds, projectParticipantMoveIds: internal.projectParticipantMoveIds,
            shortlistItemMoveIds: internal.shortlistItemMoveIds, affectedWorkIds: internal.affectedWorkIds,
            affectedProjectIds: internal.affectedProjectIds, affectedShortlistIds: internal.affectedShortlistIds,
            previewDigest: digest(internal) };
    }

    async preview(tx: Tx, actor: Actor, input: unknown) {
        const d = S.preview.parse(input);
        const plan = await this.scan(tx, actor, d.canonicalId, d.duplicateId, d.expectedCanonicalRevision, d.expectedDuplicateRevision);
        return {
            canonical: { id: plan.canonical.id, displayName: plan.canonical.displayName, sourceId: plan.canonical.sourceId, scopeId: plan.canonical.scopeId, revision: plan.canonical.revision },
            duplicate: { id: plan.duplicate.id, displayName: plan.duplicate.displayName, sourceId: plan.duplicate.sourceId, scopeId: plan.duplicate.scopeId, revision: plan.duplicate.revision },
            fieldConflicts: plan.fieldConflicts, collisions: plan.collisions, blockers: plan.blockers, complete: plan.blockers.length === 0,
            revocations: { handoffs: plan.activeHandoffIds.length, usePermissions: plan.activePermissionIds.length },
            contactsToReencrypt: plan.contactIds.length,
            media: { uploadsToDetach: plan.uploadIds.length, assetsToReassign: plan.assetReassignIds.length, assetsToDetach: plan.assetDetachIds.length },
            moves: { workCredits: plan.workCreditMoveIds.length, projectParticipants: plan.projectParticipantMoveIds.length, shortlistItems: plan.shortlistItemMoveIds.length },
            previewDigest: plan.previewDigest
        };
    }

    private mergedValue(field: PersonMergeField, choice: PersonMergeFieldChoice, canonical: Person, duplicate: Person) {
        const a = readField(canonical, field), b = readField(duplicate, field);
        if (choice === 'CANONICAL') return a;
        if (choice === 'DUPLICATE') return b;
        invariant(ARRAY_FIELDS.has(field), 'MERGE_FIELD_CHOICE_INVALID', '只有数组字段可以选择合并并集', 422);
        return unique([...(a as string[]), ...(b as string[])]);
    }

    private async deleteShortlistItem(tx: Tx, workspaceId: string, id: string) {
        for (const child of await tx.find('shortlistItemAssets', { workspaceId, itemId: id })) await tx.remove('shortlistItemAssets', child.id);
        await tx.remove('shortlistItems', id);
    }

    private async bumpRoots(tx: Tx, actor: Actor, plan: ScanPlan) {
        for (const id of plan.affectedWorkIds) {
            const row = await workspaceRow(tx, 'works', id, actor.workspaceId); if (row) await tx.replace('works', touch(row, this.clock));
        }
        for (const id of plan.affectedProjectIds) {
            const row = await workspaceRow(tx, 'projects', id, actor.workspaceId); if (row) await tx.replace('projects', touch(row, this.clock));
        }
        for (const id of plan.affectedShortlistIds) {
            const root = await workspaceRow(tx, 'shortlists', id, actor.workspaceId); if (!root) continue;
            const items = (await tx.find('shortlistItems', { workspaceId: actor.workspaceId, shortlistId: id }))
                .sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));
            for (let i=0;i<items.length;i++) if (items[i]!.position !== i) await tx.replace('shortlistItems', { ...touch(items[i]!, this.clock), position: i });
            await tx.replace('shortlists', touch(root, this.clock));
        }
    }

    async execute(tx: Tx, actor: Actor, input: unknown): Promise<PersonMergeDecision> {
        this.permissions(actor); this.executionGate();
        const d = S.execute.parse(input);
        const plan = await this.scan(tx, actor, d.canonicalId, d.duplicateId, d.expectedCanonicalRevision, d.expectedDuplicateRevision);
        invariant(plan.previewDigest === d.previewDigest, 'MERGE_PREVIEW_STALE', '合并影响已经变化，请重新预览', 409);
        invariant(plan.blockers.length === 0, 'MERGE_BLOCKED', '仍有无法安全处理的依赖，不能执行合并', 409);
        invariant(plan.activeHandoffIds.length === 0 || d.acknowledgeRevocations, 'MERGE_REVOCATION_ACK_REQUIRED', '请确认旧交接将被撤销', 400);
        invariant(plan.activePermissionIds.length === 0 || d.acknowledgeRevocations, 'MERGE_REVOCATION_ACK_REQUIRED', '请确认人物用途许可将被撤销', 400);
        invariant((plan.uploadIds.length + plan.assetDetachIds.length) === 0 || d.acknowledgeMediaDetach,
            'MERGE_MEDIA_DETACH_ACK_REQUIRED', '请确认无法保持来源一致的个人媒体关联将被解除', 400);

        const fieldMap = new Map<PersonMergeField,PersonMergeFieldChoice>();
        for (const row of d.fieldDecisions) {
            invariant(!fieldMap.has(row.field), 'DUPLICATE_FIELD', '同一字段只能做一次合并决定', 400);
            fieldMap.set(row.field,row.choice);
        }
        invariant(fieldMap.size === plan.fieldConflicts.length && plan.fieldConflicts.every(c=>fieldMap.has(c.field)),
            'MERGE_FIELD_DECISIONS_INCOMPLETE', '必须逐项处理全部字段冲突', 422);
        for (const [field,choice] of fieldMap)
            if (choice === 'UNION') invariant(ARRAY_FIELDS.has(field), 'MERGE_FIELD_CHOICE_INVALID', '该字段不能使用并集', 422);

        const collisionMap = new Map<string,PersonMergeCollisionChoice>();
        for (const row of d.collisionDecisions) {
            invariant(!collisionMap.has(row.collisionId), 'DUPLICATE_LINK', '同一关系冲突只能做一次决定', 400);
            collisionMap.set(row.collisionId,row.choice);
        }
        invariant(collisionMap.size === plan.collisions.length && plan.collisions.every(c=>collisionMap.has(c.id)),
            'MERGE_COLLISION_DECISIONS_INCOMPLETE', '必须逐项处理全部关系冲突', 422);

        const now = this.clock.now().toISOString();
        // Revoke purpose grants and handoffs rather than moving them to a different identity.
        for (const id of plan.activePermissionIds) {
            const row = await workspaceRow(tx, 'usePermissions', id, actor.workspaceId);
            if (row?.status === 'ACTIVE') await tx.replace('usePermissions', { ...touch(row, this.clock), status: 'REVOKED' });
        }
        for (const id of plan.activeHandoffIds) {
            const row = await workspaceRow(tx, 'handoffs', id, actor.workspaceId);
            if (row && ['PENDING','ACCEPTED'].includes(row.state))
                await tx.replace('handoffs', { ...touch(row, this.clock), state: 'REVOKED', closedAt: now, closedById: actor.membershipId });
        }

        // Contacts must be re-encrypted because personId is part of the AES-GCM AAD.
        for (const id of plan.contactIds) {
            const row = await workspaceRow(tx, 'contacts', id, actor.workspaceId);
            if (!row || row.personId !== plan.duplicate.id) continue;
            requirePermission(actor, 'sensitive.write');
            const value = decryptContact(row.ciphertext, this.config.contactKey, row.workspaceId + ':' + row.personId + ':' + row.id);
            const next: Contact = { ...touch(row, this.clock), personId: plan.canonical.id,
                ciphertext: encryptContact(value, this.config.contactKey, row.workspaceId + ':' + plan.canonical.id + ':' + row.id) };
            await tx.replace('contacts', next);
        }
        for (const id of plan.evidenceIds) {
            const row = await workspaceRow(tx, 'evidence', id, actor.workspaceId);
            if (row?.personId === plan.duplicate.id) await tx.replace('evidence', { ...touch(row, this.clock), personId: plan.canonical.id });
        }
        for (const id of plan.uploadIds) {
            const row = await workspaceRow(tx, 'uploads', id, actor.workspaceId);
            if (row?.personId === plan.duplicate.id) await tx.replace('uploads', { ...touch(row, this.clock),
                personId: null, personEpoch: null, personScopeId: null, personScopeRevision: null });
        }
        for (const id of plan.assetReassignIds) {
            const row = await workspaceRow(tx, 'assets', id, actor.workspaceId);
            if (row?.personId === plan.duplicate.id) await tx.replace('assets', { ...touch(row, this.clock), personId: plan.canonical.id });
        }
        for (const id of plan.assetDetachIds) {
            const row = await workspaceRow(tx, 'assets', id, actor.workspaceId);
            if (row?.personId === plan.duplicate.id) await tx.replace('assets', { ...touch(row, this.clock), personId: null });
        }

        for (const id of plan.workCreditMoveIds) {
            const row = await workspaceRow(tx, 'workCredits', id, actor.workspaceId);
            if (row?.personId === plan.duplicate.id) await tx.replace('workCredits', { ...touch(row, this.clock), personId: plan.canonical.id });
        }
        for (const id of plan.projectParticipantMoveIds) {
            const row = await workspaceRow(tx, 'projectParticipants', id, actor.workspaceId);
            if (row?.personId === plan.duplicate.id) await tx.replace('projectParticipants', { ...touch(row, this.clock), personId: plan.canonical.id });
        }
        for (const id of plan.shortlistItemMoveIds) {
            const row = await workspaceRow(tx, 'shortlistItems', id, actor.workspaceId);
            if (row?.personId === plan.duplicate.id) await tx.replace('shortlistItems', { ...touch(row, this.clock),
                personId: plan.canonical.id, addedPersonRevision: plan.canonical.revision,
                addedPersonSourceRevision: plan.canonicalSource.revision });
        }

        for (const collision of plan.collisions) {
            const choice = collisionMap.get(collision.id)!;
            if (collision.kind === 'WORK_CREDIT') {
                const old = await workspaceRow(tx, 'workCredits', collision.duplicateEntryId, actor.workspaceId);
                const keep = await workspaceRow(tx, 'workCredits', collision.canonicalEntryId, actor.workspaceId);
                if (!old || !keep) throw new AppError(409,'MERGE_PREVIEW_STALE','关系已经变化，请重新预览');
                if (choice === 'KEEP_DUPLICATE') await tx.replace('workCredits', { ...touch(keep, this.clock), note: old.note });
                await tx.remove('workCredits', old.id);
            }
            else if (collision.kind === 'PROJECT_PARTICIPANT') {
                const old = await workspaceRow(tx, 'projectParticipants', collision.duplicateEntryId, actor.workspaceId);
                const keep = await workspaceRow(tx, 'projectParticipants', collision.canonicalEntryId, actor.workspaceId);
                if (!old || !keep) throw new AppError(409,'MERGE_PREVIEW_STALE','关系已经变化，请重新预览');
                if (choice === 'KEEP_DUPLICATE') await tx.replace('projectParticipants', { ...touch(keep, this.clock), state: old.state, note: old.note });
                await tx.remove('projectParticipants', old.id);
            }
            else {
                const old = await workspaceRow(tx, 'shortlistItems', collision.duplicateEntryId, actor.workspaceId);
                const keep = await workspaceRow(tx, 'shortlistItems', collision.canonicalEntryId, actor.workspaceId);
                if (!old || !keep) throw new AppError(409,'MERGE_PREVIEW_STALE','关系已经变化，请重新预览');
                if (choice === 'KEEP_CANONICAL') await this.deleteShortlistItem(tx, actor.workspaceId, old.id);
                else {
                    await this.deleteShortlistItem(tx, actor.workspaceId, keep.id);
                    const stillOld = await workspaceRow(tx, 'shortlistItems', old.id, actor.workspaceId);
                    if (stillOld) await tx.replace('shortlistItems', { ...touch(stillOld, this.clock),
                        personId: plan.canonical.id, addedPersonRevision: plan.canonical.revision,
                        addedPersonSourceRevision: plan.canonicalSource.revision });
                }
            }
        }

        const patch: Partial<Person> = {};
        for (const conflict of plan.fieldConflicts) patch[conflict.field] = this.mergedValue(conflict.field, fieldMap.get(conflict.field)!, plan.canonical, plan.duplicate) as never;
        let nextCanonical: Person = { ...touch(plan.canonical, this.clock), ...patch, protectionEpoch: plan.canonical.protectionEpoch + 1 };
        const nameAliases = unique([...(nextCanonical.aliases ?? []),
            ...(plan.canonical.displayName !== nextCanonical.displayName ? [plan.canonical.displayName] : []),
            ...(plan.duplicate.displayName !== nextCanonical.displayName ? [plan.duplicate.displayName] : [])]).filter(x=>x && x !== nextCanonical.displayName);
        nextCanonical = { ...nextCanonical, aliases: nameAliases };
        const nextDuplicate: Person = { ...touch(plan.duplicate, this.clock), status: 'ARCHIVED', protectionEpoch: plan.duplicate.protectionEpoch + 1 };
        await tx.replace('people', nextCanonical);
        await tx.replace('people', nextDuplicate);
        await this.bumpRoots(tx, actor, plan);

        const manifest = {
            reason: d.reason, fieldDecisions: [...fieldMap].sort(), collisionDecisions: [...collisionMap].sort(),
            revokedHandoffs: plan.activeHandoffIds.length, revokedUsePermissions: plan.activePermissionIds.length,
            contactsReencrypted: plan.contactIds.length, evidenceMoved: plan.evidenceIds.length,
            uploadsDetached: plan.uploadIds.length, assetsReassigned: plan.assetReassignIds.length, assetsDetached: plan.assetDetachIds.length,
            moved: { workCredits: plan.workCreditMoveIds.length, projectParticipants: plan.projectParticipantMoveIds.length, shortlistItems: plan.shortlistItemMoveIds.length }
        };
        const decision: PersonMergeDecision = { ...base(actor.workspaceId, this.clock), actorId: actor.membershipId,
            canonicalPersonId: plan.canonical.id, duplicatePersonId: plan.duplicate.id,
            canonicalRevisionBefore: plan.canonical.revision, duplicateRevisionBefore: plan.duplicate.revision,
            canonicalRevisionAfter: nextCanonical.revision, canonicalSourceId: plan.canonicalSource.id, duplicateSourceId: plan.duplicateSource.id,
            canonicalSourceRevision: plan.canonicalSource.revision, duplicateSourceRevision: plan.duplicateSource.revision,
            canonicalSourceEpoch: plan.canonicalSource.protectionEpoch, duplicateSourceEpoch: plan.duplicateSource.protectionEpoch,
            previewDigest: plan.previewDigest, decisionManifest: manifest, revokedHandoffCount: plan.activeHandoffIds.length,
            revokedUsePermissionCount: plan.activePermissionIds.length, detachedMediaCount: plan.uploadIds.length + plan.assetDetachIds.length,
            resultDigest: digest({ canonical: nextCanonical, duplicateId: plan.duplicate.id, manifest }), completedAt: now };
        await tx.insert('personMerges', decision);
        await tx.insert('personAliases', { ...base(actor.workspaceId, this.clock), oldPersonId: plan.duplicate.id,
            canonicalPersonId: plan.canonical.id, mergeDecisionId: decision.id });
        return decision;
    }

    async list(tx: Tx, actor: Actor, query: Record<string,string>) {
        requirePermission(actor,'data.merge');
        const rows = (await tx.find('personMerges',{workspaceId:actor.workspaceId})).sort((a,b)=>b.completedAt.localeCompare(a.completedAt)||a.id.localeCompare(b.id));
        return page(rows.map(r=>({id:r.id,canonicalPersonId:r.canonicalPersonId,duplicatePersonId:r.duplicatePersonId,
            completedAt:r.completedAt,revision:r.revision,revokedHandoffCount:r.revokedHandoffCount,
            revokedUsePermissionCount:r.revokedUsePermissionCount,detachedMediaCount:r.detachedMediaCount,resultDigest:r.resultDigest})),query);
    }
    async get(tx: Tx, actor: Actor, id: string) {
        requirePermission(actor,'data.merge');
        const row = await workspaceRow(tx,'personMerges',id,actor.workspaceId); if(!row) missing();
        await personFor(tx,actor,row.canonicalPersonId,this.clock,false);
        return {id:row.id,canonicalPersonId:row.canonicalPersonId,duplicatePersonId:row.duplicatePersonId,
            canonicalRevisionBefore:row.canonicalRevisionBefore,duplicateRevisionBefore:row.duplicateRevisionBefore,
            canonicalRevisionAfter:row.canonicalRevisionAfter,completedAt:row.completedAt,revision:row.revision,
            revokedHandoffCount:row.revokedHandoffCount,revokedUsePermissionCount:row.revokedUsePermissionCount,
            detachedMediaCount:row.detachedMediaCount,resultDigest:row.resultDigest};
    }
}
