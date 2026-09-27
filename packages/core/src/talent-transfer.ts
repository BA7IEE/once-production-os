import { v, uuid, revision, dateIso, type Schema } from './validation.ts';
import { TD2_FACTS, fieldSchema, type FactRow } from './talent-v2-schema.ts';
import { loadTalentGraph } from './talent-v2-graph.ts';
import type { Actor, Clock } from './model.ts';
import type { Tx } from './store.ts';
import { invariant } from './errors.ts';
import { requirePermission, sourceFor } from './policy.ts';

// Deliberately explicit transfer whitelist; adding a domain field never exports it automatically.
export const TALENT_TRANSFER_FIELDS = {
    talentProfiles: ['internalSummary', 'status'],
    personRoles: ['roleCode', 'validFrom', 'validUntil', 'status'],
    personLanguages: ['languageCode', 'speakingLevelCode', 'listeningLevelCode', 'readingLevelCode', 'writingLevelCode', 'validFrom', 'validUntil', 'status', 'verifiedAt'],
    talentLocations: ['locationCode', 'relationCode', 'validFrom', 'validUntil', 'status', 'verifiedAt'],
    measurementSets: ['measuredOn', 'datePrecision', 'heightCm', 'bustCm', 'waistCm', 'hipsCm', 'shoeSizeValue', 'shoeSizeSystem', 'clothingSizeValue', 'clothingSizeSystem', 'supersedesId', 'status'],
    castingProfiles: ['hairColorCode', 'eyeColorCode', 'appearanceObservedOn', 'currentMeasurementSetId'],
    translatorLanguagePairs: ['personRoleId', 'sourceLanguageCode', 'targetLanguageCode', 'status'],
    translatorServiceModes: ['personRoleId', 'modeCode', 'status']
} as const;
export type TransferTable = keyof typeof TALENT_TRANSFER_FIELDS;
export const TRANSFER_TABLES = Object.keys(TALENT_TRANSFER_FIELDS) as TransferTable[];
export const TRANSFER_CODES = TRANSFER_TABLES.map(t => `person.td2.${t}` as const);
export type TransferCode = typeof TRANSFER_CODES[number];
export const TALENT_EXPORT_VERSION = 'once-export-v2-talent' as const;
export const TRANSFER_VERSION = 'once-talent-transfer-v1' as const;
export const transferCode = (table: TransferTable): TransferCode => `person.td2.${table}`;
export const isTransferCode = (code: string): code is TransferCode => (TRANSFER_CODES as readonly string[]).includes(code);
export interface TransferRow { id: string; personId: string; sourceId: string; revision: number; createdAt: string; updatedAt: string; data: Record<string, unknown> }
export interface TalentTransfer { schemaVersion: typeof TRANSFER_VERSION; selectedFields: TransferCode[]; tables: Record<TransferTable, TransferRow[]> }
const tableSchemas: Record<string, Schema<unknown>> = {};
for (const table of TRANSFER_TABLES) {
    const shape: Record<string, Schema<unknown>> = {};
    for (const field of TALENT_TRANSFER_FIELDS[table]) {
        const type = (TD2_FACTS[table].fields as Record<string, string>)[field];
        shape[field] = type ? fieldSchema(type, field) : field === 'status' ? v.enum(['DRAFT','CONFIRMED','SUPERSEDED'])
            : field === 'currentMeasurementSetId' ? v.nullable(uuid) : v.nullable(dateIso);
    }
    tableSchemas[table] = v.array(v.object({ id: uuid, personId: uuid, sourceId: uuid, revision, createdAt: dateIso, updatedAt: dateIso, data: v.object(shape) }), 500);
}
export const TransferSchema = v.object({ schemaVersion: v.enum([TRANSFER_VERSION]), selectedFields: v.array(v.enum(TRANSFER_CODES), TRANSFER_CODES.length, 1), tables: v.object(tableSchemas) }) as Schema<TalentTransfer>;

export async function collectTalentTransfer(tx: Tx, actor: Actor, clock: Clock, peopleIds: string[], codes: TransferCode[]): Promise<TalentTransfer> {
    requirePermission(actor, 'records.read');
    const graph = await loadTalentGraph(tx, actor, clock), people = new Set(peopleIds);
    const tables = Object.fromEntries(TRANSFER_TABLES.map(t => [t, []])) as unknown as TalentTransfer['tables'];
    let total = 0;
    for (const table of TRANSFER_TABLES) {
        if (!codes.includes(transferCode(table))) continue;
        for (const raw of graph.rows(table).filter(r => people.has(r.personId))) {
            const row = raw as unknown as FactRow;
            invariant(!row.supersededById, 'TD2_EXPORT_HISTORY_UNSUPPORTED', '合并历史需要专用导出格式，不能作为当前专业资料导出', 409);
            await sourceFor(tx, actor, row.sourceId, clock);
            const projected = graph.project(table, row);
            invariant(projected && (projected.unavailableFields as string[]).length === 0, 'TD2_EXPORT_RESTRICTED', '所选专业资料存在当前不可读字段，不能静默遗漏', 409);
            // Per-field multi-source evidence needs its own transfer contract. Do not drop provenance.
            const owner = TD2_FACTS[table].ownerKey;
            invariant(!graph.rows('evidence').some(e => (e as unknown as Record<string, unknown>)[owner] === row.id && e.sourceId !== row.sourceId),
                'TD2_EXPORT_EVIDENCE_UNSUPPORTED', '同一条专业事实包含其他来源证据，当前格式不能完整保存其来源关系', 409);
            tables[table].push({ id: row.id, personId: row.personId, sourceId: row.sourceId, revision: row.revision,
                createdAt: row.createdAt, updatedAt: row.updatedAt,
                data: Object.fromEntries(TALENT_TRANSFER_FIELDS[table].map(field => [field, row[field]])) });
            invariant(++total <= 500, 'TD2_EXPORT_LIMIT', '单次专业资料导出最多 500 条', 422);
        }
        tables[table].sort((a,b) => a.id.localeCompare(b.id));
    }
    const transfer = TransferSchema.parse({ schemaVersion: TRANSFER_VERSION, selectedFields: [...codes].sort(), tables });
    validateTransferLinks(transfer, peopleIds);
    return transfer;
}

export function validateTransferLinks(bundle: TalentTransfer, personIds: string[]) {
    const people = new Set(personIds), selected = new Set(bundle.selectedFields);
    invariant(selected.size === bundle.selectedFields.length, 'TD2_TRANSFER_DUPLICATE', '专业资料字段不能重复', 422);
    const maps = Object.fromEntries(TRANSFER_TABLES.map(t => [t, new Map(bundle.tables[t].map(r => [r.id, r]))])) as Record<TransferTable, Map<string, TransferRow>>;
    let count = 0;
    for (const table of TRANSFER_TABLES) {
        const rows = bundle.tables[table]; count += rows.length;
        invariant(rows.length === maps[table].size && (!rows.length || selected.has(transferCode(table))), 'TD2_TRANSFER_DUPLICATE', '专业记录重复或不在所选字段中', 422);
        for (const row of rows) {
            invariant(people.has(row.personId), 'TD2_TRANSFER_PERSON_MISSING', '专业记录引用了未导出的人物', 422);
            const reference = (field: string, parent: TransferTable) => {
                if (!row.data[field]) return;
                const target = maps[parent].get(String(row.data[field]));
                invariant(target && target.personId === row.personId && target.id !== row.id, 'TD2_TRANSFER_REFERENCE_MISSING', '专业关联必须一起选择，且属于同一个人物', 422);
            };
            reference('personRoleId', 'personRoles'); reference('currentMeasurementSetId', 'measurementSets'); reference('supersedesId', 'measurementSets');
            if (row.data.personRoleId) invariant(maps.personRoles.get(String(row.data.personRoleId))?.data.roleCode === 'translator', 'TD2_TRANSFER_ROLE_INVALID', '翻译资料必须关联翻译职业', 422);
            if (table !== 'talentProfiles' && table !== 'personLanguages') invariant(bundle.tables.talentProfiles.some(p => p.personId === row.personId), 'TD2_TRANSFER_PROFILE_MISSING', '专业资料需要同时选择人才主档案', 422);
            if (table === 'castingProfiles' || table === 'measurementSets') invariant(bundle.tables.personRoles.some(p => p.personId === row.personId && ['model','actor','kol'].includes(String(p.data.roleCode))), 'TD2_TRANSFER_ROLE_INVALID', '选角资料需要同时选择对应职业', 422);
            if (table === 'talentProfiles' || table === 'castingProfiles') invariant(rows.filter(p => p.personId === row.personId).length === 1, 'TD2_TRANSFER_SINGLETON', '同一人物不能有多份当前主档案', 422);
        }
    }
    invariant(count <= 500, 'TD2_EXPORT_LIMIT', '单次专业资料最多 500 条', 422);
    for (const row of bundle.tables.measurementSets) {
        const seen = new Set([row.id]); let previous = row.data.supersedesId;
        while (previous) { invariant(!seen.has(String(previous)), 'TD2_TRANSFER_CYCLE', '量尺历史不能形成循环', 422); seen.add(String(previous)); previous = maps.measurementSets.get(String(previous))?.data.supersedesId; }
    }
}
