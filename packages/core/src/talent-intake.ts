import type { Actor, Clock, Config } from './model.ts';
import type { Tx } from './store.ts';
import { v, uuid, revision, code } from './validation.ts';
import { invariant } from './errors.ts';
import { requirePermission, sourceFor } from './policy.ts';
import { Talent } from './talent.ts';
import { TalentV2 } from './talent-v2.ts';
import { TALENT_SCHEMA_VERSION } from './talent-v2-model.ts';

export const TALENT_EXPERIENCE_VERSION = 'once-talent-experience-v1';
export const TalentIntakeSchema = v.object({
    schemaVersion: v.enum([TALENT_EXPERIENCE_VERSION]),
    displayName: v.string(120, 1),
    kind: v.enum(['TALENT', 'CONTACT']),
    roleCodes: v.optional(v.array(code, 20)),
    sourceId: v.optional(uuid),
    sourceRevision: v.optional(revision),
});

/** An internal command composing existing typed records in the caller's single transaction. */
export async function createTalentIntake(tx: Tx, actor: Actor, input: unknown, clock: Clock, config: Config) {
    invariant(actor.actorKind !== 'MACHINE', 'MACHINE_OPERATION_FORBIDDEN', '快速建档仅对内部成员开放', 403);
    requirePermission(actor, 'records.write');
    const data = TalentIntakeSchema.parse(input);
    invariant(data.displayName.trim().length > 0, 'NAME_REQUIRED', '请填写姓名或艺名', 400);
    invariant(!!data.sourceId === !!data.sourceRevision, 'SOURCE_REVISION_REQUIRED', '已有来源必须同时提供当前版本', 400);
    const roles = data.roleCodes ?? (data.kind === 'TALENT' ? ['model'] : []);
    invariant(data.kind === 'TALENT' ? roles.length > 0 : roles.length === 0, 'INTAKE_ROLE_INVALID', '人才须选择职业；普通联系人不建立职业档案', 400);
    invariant(new Set(roles).size === roles.length, 'DUPLICATE_CODE', '同一职业不能重复', 400);
    const td2 = new TalentV2(clock, config);
    for (const role of roles) await td2.dictionary(tx, actor, 'role', role);
    // Source responsibility is genuinely the current member. No assertion about talent consent.
    const source = data.sourceId
        ? await td2.source(tx, actor, data.sourceId, data.sourceRevision!)
        : await new Talent(clock, config).createSource(tx, actor, {
            title: '手工临时整理', type: 'MANUAL', providerClaim: '当前内部成员手工录入',
            basisMode: 'TEMP_ORGANIZE', basisDescription: '当前成员手工整理的未核验草稿，仅用于限定范围内临时整理；不代表本人授权。',
        });
    const person = await td2.createPerson(tx, actor, {
        schemaVersion: TALENT_SCHEMA_VERSION, originSourceId: source.id, sourceRevision: source.revision,
        displayName: data.displayName.trim(), createTalent: data.kind === 'TALENT',
    });
    let current = person;
    for (const roleCode of roles) {
        await td2.createFact(tx, actor, 'personRoles', person.id, {
            schemaVersion: TALENT_SCHEMA_VERSION, expectedPersonRevision: current.revision,
            sourceId: source.id, sourceRevision: source.revision, values: { roleCode },
        });
        current = (await tx.get('people', person.id))!;
    }
    // Recheck the source in the same transaction before recording success.
    await sourceFor(tx, actor, source.id, clock);
    return current;
}
