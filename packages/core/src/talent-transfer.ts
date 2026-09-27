import { v, uuid, revision, dateIso, code, type Schema } from './validation.ts';
import { TD2_FACTS, fieldSchema, type FactRow } from './talent-v2-schema.ts';
import { loadTalentGraph } from './talent-v2-graph.ts';
import { TALENT_SCHEMA_VERSION } from './talent-v2-model.ts';
import type { Actor, Clock } from './model.ts';
import type { Tx } from './store.ts';
import { invariant } from './errors.ts';
import { requirePermission, sourceFor } from './policy.ts';

// Deliberately explicit transfer whitelist; adding a domain field never exports it automatically.
export const TALENT_TRANSFER_FIELDS = {
    talentProfiles: ['internalSummary', 'status'],
    personRoles: ['roleCode', 'validFrom', 'validUntil', 'status'],
    personCapabilities: ['personRoleId', 'capabilityCode', 'levelCode', 'validFrom', 'validUntil', 'status'],
    personExternalRefs: ['providerCode', 'namespaceCode', 'issuerOrganizationId', 'externalKey', 'state', 'verifiedAt'],
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
export const CAPABILITY_TRANSFER_VERSION = 'once-talent-transfer-v2' as const;
export const EXTERNAL_TRANSFER_VERSION = 'once-talent-transfer-v3' as const;
export const transferCode = (table: TransferTable): TransferCode => `person.td2.${table}`;
export const isTransferCode = (code: string): code is TransferCode => (TRANSFER_CODES as readonly string[]).includes(code);
export interface TransferRow { id: string; personId: string; sourceId: string; revision: number; createdAt: string; updatedAt: string; data: Record<string, unknown> }
export interface TransferDefinition { id: string; revision: number; createdAt: string; updatedAt: string; code: string; labelZh: string; labelEn: string; aliases: string[]; applicableRoleCodes: string[]; levelSchemeCode: 'ABILITY_5' | null; semanticVersion: string; schemaVersion: typeof TALENT_SCHEMA_VERSION; status: 'ACTIVE' | 'INACTIVE' }
export interface TransferOrganization { id: string; sourceId: string; revision: number; createdAt: string; updatedAt: string; name: string; kind: 'AGENCY' | 'ISSUER' | 'OTHER'; status: 'ACTIVE' }
export interface TalentTransfer { schemaVersion: typeof TRANSFER_VERSION | typeof CAPABILITY_TRANSFER_VERSION | typeof EXTERNAL_TRANSFER_VERSION; selectedFields: TransferCode[]; tables: Record<TransferTable, TransferRow[]>; capabilityDefinitions?: TransferDefinition[]; organizations?: TransferOrganization[] }
// Old v1/v2 payloads lack later tables. Keep their bytes and digest unchanged.
export const transferRows = (bundle: TalentTransfer, table: TransferTable): TransferRow[] => bundle.tables[table] ?? [];
const definitionSchema = v.object({ id: uuid, revision, createdAt: dateIso, updatedAt: dateIso, code,
    labelZh: v.string(120,1), labelEn: v.string(120), aliases: v.array(v.string(120,1),30), applicableRoleCodes: v.array(code,20),
    levelSchemeCode: v.nullable(v.enum(['ABILITY_5'])), semanticVersion: v.string(30,5,/^\d+\.\d+\.\d+$/),
    schemaVersion: v.enum([TALENT_SCHEMA_VERSION]), status: v.enum(['ACTIVE','INACTIVE']) });
const organizationSchema = v.object({id:uuid,sourceId:uuid,revision,createdAt:dateIso,updatedAt:dateIso,name:v.string(200,1),kind:v.enum(['AGENCY','ISSUER','OTHER']),status:v.enum(['ACTIVE'])});
const tableSchemas: Record<string, Schema<unknown>> = {};
for (const table of TRANSFER_TABLES) {
    const shape: Record<string, Schema<unknown>> = {};
    for (const field of TALENT_TRANSFER_FIELDS[table]) {
        const type = (TD2_FACTS[table].fields as Record<string, string>)[field];
        shape[field] = type ? fieldSchema(type, field) : field === 'state' ? v.enum(['OBSERVED','VERIFIED','REVOKED']) : field === 'status' ? v.enum(['DRAFT','CONFIRMED','SUPERSEDED'])
            : field === 'currentMeasurementSetId' ? v.nullable(uuid) : v.nullable(dateIso);
    }
    tableSchemas[table] = v.array(v.object({ id: uuid, personId: uuid, sourceId: uuid, revision, createdAt: dateIso, updatedAt: dateIso, data: v.object(shape) }), 500);
}
const legacyTables = Object.fromEntries(Object.entries(tableSchemas).filter(([table])=>table!=='personCapabilities'&&table!=='personExternalRefs'));
const legacyCodes = TRANSFER_CODES.filter(c=>c!=='person.td2.personCapabilities'&&c!=='person.td2.personExternalRefs');
const legacySchema = v.object({ schemaVersion: v.enum([TRANSFER_VERSION]), selectedFields: v.array(v.enum(legacyCodes),legacyCodes.length,1), tables: v.object(legacyTables) });
const capabilityCodes=TRANSFER_CODES.filter(c=>c!=='person.td2.personExternalRefs');
const capabilityTables=Object.fromEntries(Object.entries(tableSchemas).filter(([table])=>table!=='personExternalRefs'));
const capabilitySchema = v.object({ schemaVersion: v.enum([CAPABILITY_TRANSFER_VERSION]), selectedFields: v.array(v.enum(capabilityCodes),capabilityCodes.length,1), tables: v.object(capabilityTables), capabilityDefinitions: v.array(definitionSchema,500) });
const externalSchema = v.object({schemaVersion:v.enum([EXTERNAL_TRANSFER_VERSION]),selectedFields:v.array(v.enum(TRANSFER_CODES),TRANSFER_CODES.length,1),tables:v.object(tableSchemas),capabilityDefinitions:v.array(definitionSchema,500),organizations:v.array(organizationSchema,500)});
export const TransferSchema: Schema<TalentTransfer> = {
    json: {oneOf:[legacySchema.json,capabilitySchema.json,externalSchema.json]},
    parse(input,path) {
        const version = input && typeof input==='object' ? (input as Record<string,unknown>).schemaVersion : undefined;
        return (version===EXTERNAL_TRANSFER_VERSION ? externalSchema : version===CAPABILITY_TRANSFER_VERSION ? capabilitySchema : legacySchema).parse(input,path) as unknown as TalentTransfer;
    }
};

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
    const withExternal = codes.includes('person.td2.personExternalRefs');
    const withCapabilities = codes.includes('person.td2.personCapabilities');
    const capabilityDefinitions: TransferDefinition[] = [];
    if (withCapabilities) {
        const referenced = new Set(tables.personCapabilities.map(r=>String(r.data.capabilityCode)));
        for (const code of referenced) {
            const rows = graph.rows('capabilityDefinitions').filter(d=>d.code===code);
            invariant(rows.length===1,'TD2_TRANSFER_DEFINITION_MISSING','能力定义缺失或重复，不能完整导出',409);
            const definition=rows[0]!;
            capabilityDefinitions.push(definitionSchema.parse(Object.fromEntries(Object.keys(definitionSchema.json.properties as object).map(k=>[k,(definition as unknown as Record<string,unknown>)[k]]))));
        }
        capabilityDefinitions.sort((a,b)=>a.id.localeCompare(b.id));
    }
    const organizations: TransferOrganization[]=[];
    if(withExternal) {
        const ids=new Set(tables.personExternalRefs.map(r=>r.data.issuerOrganizationId).filter(Boolean));
        for(const id of ids) {
            invariant(graph.organizationReadable(String(id)),'TD2_EXPORT_RESTRICTED','关联机构当前不可读，不能省略后导出',409);
            const row=graph.rows('organizations').find(o=>o.id===id)!;
            await sourceFor(tx,actor,row.sourceId,clock);
            organizations.push(organizationSchema.parse(Object.fromEntries(Object.keys(organizationSchema.json.properties as object).map(k=>[k,(row as unknown as Record<string,unknown>)[k]]))));
        }
        organizations.sort((a,b)=>a.id.localeCompare(b.id));
    } else delete (tables as Partial<typeof tables>).personExternalRefs;
    if(!withCapabilities&&!withExternal) delete (tables as Partial<typeof tables>).personCapabilities;
    const transfer = TransferSchema.parse({ schemaVersion: withExternal ? EXTERNAL_TRANSFER_VERSION : withCapabilities ? CAPABILITY_TRANSFER_VERSION : TRANSFER_VERSION, selectedFields: [...codes].sort(), tables, ...(withCapabilities||withExternal?{capabilityDefinitions}:{}), ...(withExternal?{organizations}:{}) });
    validateTransferLinks(transfer, peopleIds);
    return transfer;
}

export function validateTransferLinks(bundle: TalentTransfer, personIds: string[]) {
    const people = new Set(personIds), selected = new Set(bundle.selectedFields);
    invariant(selected.size === bundle.selectedFields.length, 'TD2_TRANSFER_DUPLICATE', '专业资料字段不能重复', 422);
    const maps = Object.fromEntries(TRANSFER_TABLES.map(t => [t, new Map(transferRows(bundle,t).map(r => [r.id, r]))])) as Record<TransferTable, Map<string, TransferRow>>;
    let count = 0;
    for (const table of TRANSFER_TABLES) {
        const rows = transferRows(bundle,table); count += rows.length;
        invariant(rows.length === maps[table].size && (!rows.length || selected.has(transferCode(table))), 'TD2_TRANSFER_DUPLICATE', '专业记录重复或不在所选字段中', 422);
        for (const row of rows) {
            invariant(people.has(row.personId), 'TD2_TRANSFER_PERSON_MISSING', '专业记录引用了未导出的人物', 422);
            const reference = (field: string, parent: TransferTable) => {
                if (!row.data[field]) return;
                const target = maps[parent].get(String(row.data[field]));
                invariant(target && target.personId === row.personId && target.id !== row.id, 'TD2_TRANSFER_REFERENCE_MISSING', '专业关联必须一起选择，且属于同一个人物', 422);
            };
            reference('personRoleId', 'personRoles'); reference('currentMeasurementSetId', 'measurementSets'); reference('supersedesId', 'measurementSets');
            if ((table==='translatorLanguagePairs'||table==='translatorServiceModes') && row.data.personRoleId) invariant(maps.personRoles.get(String(row.data.personRoleId))?.data.roleCode === 'translator', 'TD2_TRANSFER_ROLE_INVALID', '翻译资料必须关联翻译职业', 422);
            if (table !== 'talentProfiles' && table !== 'personLanguages') invariant(bundle.tables.talentProfiles.some(p => p.personId === row.personId), 'TD2_TRANSFER_PROFILE_MISSING', '专业资料需要同时选择人才主档案', 422);
            if (table === 'castingProfiles' || table === 'measurementSets') invariant(bundle.tables.personRoles.some(p => p.personId === row.personId && ['model','actor','kol'].includes(String(p.data.roleCode))), 'TD2_TRANSFER_ROLE_INVALID', '选角资料需要同时选择对应职业', 422);
            if (table === 'talentProfiles' || table === 'castingProfiles') invariant(rows.filter(p => p.personId === row.personId).length === 1, 'TD2_TRANSFER_SINGLETON', '同一人物不能有多份当前主档案', 422);
        }
    }
    const definitions=bundle.capabilityDefinitions??[], capabilities=transferRows(bundle,'personCapabilities');
    invariant(bundle.schemaVersion!==TRANSFER_VERSION || (!definitions.length&&!capabilities.length), 'TD2_TRANSFER_VERSION_INVALID','旧格式不支持能力字典',422);
    invariant(definitions.length===new Set(definitions.map(d=>d.id)).size && definitions.length===new Set(definitions.map(d=>d.code)).size,'TD2_TRANSFER_DEFINITION_DUPLICATE','能力定义编号或代码重复',422);
    const referencedCodes=new Set(capabilities.map(r=>String(r.data.capabilityCode)));
    invariant(definitions.length===referencedCodes.size && definitions.every(d=>referencedCodes.has(d.code)), 'TD2_TRANSFER_DEFINITION_MISSING','能力字典必须恰好覆盖所选记录，不得遗漏或夹带无关定义',422);
    for(const definition of definitions) {
        invariant(new Set(definition.aliases).size===definition.aliases.length && new Set(definition.applicableRoleCodes).size===definition.applicableRoleCodes.length,'TD2_TRANSFER_DEFINITION_DUPLICATE','能力定义的别名或适用职业重复',422);
    }
    for(const row of capabilities) {
        const definition=definitions.find(d=>d.code===row.data.capabilityCode);
        invariant(definition,'TD2_TRANSFER_DEFINITION_MISSING','能力引用的定义缺失',422);
        invariant(!row.data.levelCode||definition.levelSchemeCode==='ABILITY_5','CAPABILITY_LEVEL_UNREGISTERED','能力定义没有对应等级体系',422);
        if(row.data.personRoleId && definition.applicableRoleCodes.length) invariant(definition.applicableRoleCodes.includes(String(maps.personRoles.get(String(row.data.personRoleId))?.data.roleCode)),'CAPABILITY_ROLE_MISMATCH','能力与适用职业不匹配',422);
    }
    const organizations=bundle.organizations??[], external=transferRows(bundle,'personExternalRefs');
    const organizationIds=new Set(external.map(r=>r.data.issuerOrganizationId).filter(Boolean));
    invariant(organizations.length===new Set(organizations.map(o=>o.id)).size,'TD2_TRANSFER_ORGANIZATION_DUPLICATE','关联机构编号重复',422);
    invariant(organizations.length===organizationIds.size && organizations.every(o=>organizationIds.has(o.id)),'TD2_TRANSFER_ORGANIZATION_MISSING','机构清单必须恰好包含标识引用的机构',422);
    const activeKeys=new Set<string>();
    for(const row of external) {
        const d=row.data;
        invariant(d.state!=='VERIFIED'||!!d.verifiedAt,'EXTERNAL_REF_VERIFICATION_MISSING','已核验标识缺少核验时间',422);
        invariant(d.state!=='OBSERVED'||d.verifiedAt===null,'EXTERNAL_REF_VERIFICATION_INVALID','未核验标识不能附带核验时间',422);
        if(d.state==='REVOKED')continue;
        const key=JSON.stringify([d.providerCode,d.namespaceCode,d.issuerOrganizationId,d.externalKey]);
        invariant(!activeKeys.has(key),'EXTERNAL_REF_CONFLICT','同一外部标识不能重复归属人物',422);activeKeys.add(key);
    }
    invariant(count + definitions.length + organizations.length <= 500, 'TD2_EXPORT_LIMIT', '单次专业资料最多 500 条', 422);
    for (const row of bundle.tables.measurementSets) {
        const seen = new Set([row.id]); let previous = row.data.supersedesId;
        while (previous) { invariant(!seen.has(String(previous)), 'TD2_TRANSFER_CYCLE', '量尺历史不能形成循环', 422); seen.add(String(previous)); previous = maps.measurementSets.get(String(previous))?.data.supersedesId; }
    }
}
