import { MEDIA_TRANSFER_VERSION, TransferAssetSchema, transferAsset, type TransferAsset } from './media-transfer.ts';
import { readyAsset } from './production-policy.ts';
import { digest } from './json.ts';
import { v, uuid, revision, dateIso, code, type Schema } from './validation.ts';
import { TD2_FACTS, fieldSchema, type FactRow } from './talent-v2-schema.ts';
import { loadTalentGraph } from './talent-v2-graph.ts';
import { TALENT_SCHEMA_VERSION, TALENT_OWNER_EMPTY } from './talent-v2-model.ts';
import type { Actor, Clock } from './model.ts';
import type { Tx } from './store.ts';
import { invariant } from './errors.ts';
import { requirePermission, sourceFor } from './policy.ts';

// Deliberately explicit transfer whitelist; adding a domain field never exports it automatically.
export const TALENT_TRANSFER_FIELDS = {
    talentProfiles: ['internalSummary', 'status'],
    personRoles: ['roleCode', 'validFrom', 'validUntil', 'status'],
    personCapabilities: ['personRoleId', 'capabilityCode', 'levelCode', 'validFrom', 'validUntil', 'status'],
    representations: ['personRoleId','agencyOrganizationId','agentPersonId','relationCode','territoryCode','validFrom','validUntil','status'],
    personCredentials: ['personRoleId','credentialTypeCode','issuerOrganizationId','issuerName','issuedOn','expiresOn','evidenceAssetId','status','identifierCiphertext','maskedIdentifier'],
    personExternalRefs: ['providerCode', 'namespaceCode', 'issuerOrganizationId', 'externalKey', 'state', 'verifiedAt'],
    personLanguages: ['languageCode', 'speakingLevelCode', 'listeningLevelCode', 'readingLevelCode', 'writingLevelCode', 'validFrom', 'validUntil', 'status', 'verifiedAt'],
    talentLocations: ['locationCode', 'relationCode', 'validFrom', 'validUntil', 'status', 'verifiedAt'],
    measurementSets: ['measuredOn', 'datePrecision', 'heightCm', 'bustCm', 'waistCm', 'hipsCm', 'shoeSizeValue', 'shoeSizeSystem', 'clothingSizeValue', 'clothingSizeSystem', 'supersedesId', 'status'],
    castingProfiles: ['hairColorCode', 'eyeColorCode', 'appearanceObservedOn', 'currentMeasurementSetId'],
    translatorLanguagePairs: ['personRoleId', 'sourceLanguageCode', 'targetLanguageCode', 'status'],
    translatorServiceModes: ['personRoleId', 'modeCode', 'status'],
    mediaCollections: ['personRoleId','collectionTypeCode','title','status'],
    mediaCollectionTags: ['collectionId','tagCode'],
    adultEligibilities: ['state','validUntil','evidenceAssetId','status','verifiedAt','verification']
} as const;
export type TransferTable = keyof typeof TALENT_TRANSFER_FIELDS;
export const TRANSFER_TABLES = Object.keys(TALENT_TRANSFER_FIELDS) as TransferTable[];
export const TRANSFER_CODES = TRANSFER_TABLES.map(t => `person.td2.${t}` as const);
export type TransferCode = typeof TRANSFER_CODES[number];
export const TALENT_EXPORT_VERSION = 'once-export-v2-talent' as const;
export const TRANSFER_VERSION = 'once-talent-transfer-v1' as const;
export const CAPABILITY_TRANSFER_VERSION = 'once-talent-transfer-v2' as const;
export const EXTERNAL_TRANSFER_VERSION = 'once-talent-transfer-v3' as const;
export const ADULT_TRANSFER_VERSION = 'once-talent-transfer-v9' as const;
export const COLLECTION_TRANSFER_VERSION = 'once-talent-transfer-v8' as const;
export const CREDENTIAL_TRANSFER_VERSION = 'once-talent-transfer-v6' as const;
export const CREDENTIAL_IDENTIFIER_CODE = 'person.td2.credentialIdentifiers' as const;
export const EVIDENCE_TRANSFER_CODE = 'person.td2.fieldEvidence' as const;
export const EVIDENCE_TRANSFER_VERSION = 'once-talent-transfer-v5' as const;
export const REPRESENTATION_TRANSFER_VERSION = 'once-talent-transfer-v4' as const;
export const transferCode = (table: TransferTable): TransferCode => `person.td2.${table}`;
export const isTransferCode = (code: string): code is TransferCode => (TRANSFER_CODES as readonly string[]).includes(code);
export interface TransferRow { id: string; personId: string; sourceId: string; revision: number; createdAt: string; updatedAt: string; data: Record<string, unknown> }
export interface TransferDefinition { id: string; revision: number; createdAt: string; updatedAt: string; code: string; labelZh: string; labelEn: string; aliases: string[]; applicableRoleCodes: string[]; levelSchemeCode: 'ABILITY_5' | null; semanticVersion: string; schemaVersion: typeof TALENT_SCHEMA_VERSION; status: 'ACTIVE' | 'INACTIVE' }
export interface TransferOrganization { id: string; sourceId: string; revision: number; createdAt: string; updatedAt: string; name: string; kind: 'AGENCY' | 'ISSUER' | 'OTHER'; status: 'ACTIVE' }
export interface TransferEvidence { id: string; revision: number; createdAt: string; updatedAt: string; ownerKind: TransferTable; ownerId: string; fieldPath: string; valueDigest: string; sourceId: string; sourceRevision: number; originalReview: {workspaceId:string; membershipId:string; reviewedAt:string} | null }
export interface TransferCollectionItem {id:string;personId:string;collectionId:string;assetId:string;revision:number;createdAt:string;updatedAt:string;orderIndex:number;caption:string;featured:boolean}
export interface TalentTransfer { schemaVersion: typeof TRANSFER_VERSION | typeof CAPABILITY_TRANSFER_VERSION | typeof EXTERNAL_TRANSFER_VERSION | typeof REPRESENTATION_TRANSFER_VERSION | typeof EVIDENCE_TRANSFER_VERSION | typeof CREDENTIAL_TRANSFER_VERSION | typeof MEDIA_TRANSFER_VERSION | typeof COLLECTION_TRANSFER_VERSION | typeof ADULT_TRANSFER_VERSION; collectionItems?:TransferCollectionItem[]; assets?: TransferAsset[]; identifierContextWorkspaceId?: string; credentialIdentifiersIncluded?: boolean; evidence?: TransferEvidence[]; selectedFields: TransferCode[]; tables: Record<TransferTable, TransferRow[]>; capabilityDefinitions?: TransferDefinition[]; organizations?: TransferOrganization[] }
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
        shape[field] = table==='adultEligibilities'&&field==='verification' ? v.nullable(v.object({workspaceId:uuid,membershipId:uuid})) : table==='adultEligibilities'&&field==='state' ? v.enum(['UNKNOWN','SELF_DECLARED_ADULT','VERIFIED_ADULT','RESTRICTED']) : table==='personCredentials'&&field==='status' ? v.enum(['UNVERIFIED','VERIFIED','REVOKED']) : field==='identifierCiphertext' ? v.nullable(v.string(2048,1,/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)) : field==='maskedIdentifier' ? v.nullable(v.string(7,4)) : type ? fieldSchema(type, field) : field === 'state' ? v.enum(['OBSERVED','VERIFIED','REVOKED']) : field === 'status' ? v.enum(['DRAFT','CONFIRMED','SUPERSEDED'])
            : field === 'currentMeasurementSetId' ? v.nullable(uuid) : v.nullable(dateIso);
    }
    tableSchemas[table] = v.array(v.object({ id: uuid, personId: uuid, sourceId: uuid, revision, createdAt: dateIso, updatedAt: dateIso, data: v.object(shape) }), 500);
}
const preAdultCodes=TRANSFER_CODES.filter(c=>c!=='person.td2.adultEligibilities');
const preAdultTables=Object.fromEntries(Object.entries(tableSchemas).filter(([t])=>t!=='adultEligibilities'));
const credentialCodes=preAdultCodes.filter(c=>!['person.td2.mediaCollections','person.td2.mediaCollectionTags'].includes(c));
const credentialTables=Object.fromEntries(Object.entries(preAdultTables).filter(([t])=>t!=='mediaCollections'&&t!=='mediaCollectionTags'));
const priorCodes=credentialCodes.filter(c=>c!=='person.td2.personCredentials');
const priorTables=Object.fromEntries(Object.entries(credentialTables).filter(([t])=>t!=='personCredentials'));
const legacyTables = Object.fromEntries(Object.entries(priorTables).filter(([table])=>table!=='personCapabilities'&&table!=='personExternalRefs'&&table!=='representations'));
const legacyCodes = priorCodes.filter(c=>c!=='person.td2.personCapabilities'&&c!=='person.td2.personExternalRefs'&&c!=='person.td2.representations');
const legacySchema = v.object({ schemaVersion: v.enum([TRANSFER_VERSION]), selectedFields: v.array(v.enum(legacyCodes),legacyCodes.length,1), tables: v.object(legacyTables) });
const capabilityCodes=priorCodes.filter(c=>c!=='person.td2.personExternalRefs'&&c!=='person.td2.representations');
const capabilityTables=Object.fromEntries(Object.entries(priorTables).filter(([table])=>table!=='personExternalRefs'&&table!=='representations'));
const capabilitySchema = v.object({ schemaVersion: v.enum([CAPABILITY_TRANSFER_VERSION]), selectedFields: v.array(v.enum(capabilityCodes),capabilityCodes.length,1), tables: v.object(capabilityTables), capabilityDefinitions: v.array(definitionSchema,500) });
const externalCodes=priorCodes.filter(c=>c!=='person.td2.representations');
const externalTables=Object.fromEntries(Object.entries(priorTables).filter(([table])=>table!=='representations'));
const externalSchema = v.object({schemaVersion:v.enum([EXTERNAL_TRANSFER_VERSION]),selectedFields:v.array(v.enum(externalCodes),externalCodes.length,1),tables:v.object(externalTables),capabilityDefinitions:v.array(definitionSchema,500),organizations:v.array(organizationSchema,500)});
const representationSchema=v.object({schemaVersion:v.enum([REPRESENTATION_TRANSFER_VERSION]),selectedFields:v.array(v.enum(priorCodes),priorCodes.length,1),tables:v.object(priorTables),capabilityDefinitions:v.array(definitionSchema,500),organizations:v.array(organizationSchema,500)});
const evidenceShape={id:uuid,revision,createdAt:dateIso,updatedAt:dateIso,ownerKind:v.enum(TRANSFER_TABLES.filter(t=>t!=='adultEligibilities')),ownerId:uuid,fieldPath:v.string(160,1),valueDigest:v.string(64,64,/^[a-f0-9]{64}$/),sourceId:uuid,sourceRevision:revision,originalReview:v.nullable(v.object({workspaceId:uuid,membershipId:uuid,reviewedAt:dateIso}))};
const adultEvidenceSchema=v.object({...evidenceShape,ownerKind:v.enum(TRANSFER_TABLES)});
const collectionEvidenceSchema=v.object(evidenceShape);
const evidenceSchema=v.object({...evidenceShape,ownerKind:v.enum(TRANSFER_TABLES.filter(t=>t!=='adultEligibilities'&&t!=='mediaCollections'&&t!=='mediaCollectionTags'))});
const priorEvidenceSchema=v.object({...evidenceShape,ownerKind:v.enum(TRANSFER_TABLES.filter(t=>t!=='adultEligibilities'&&t!=='personCredentials'&&t!=='mediaCollections'&&t!=='mediaCollectionTags'))});
const evidenceTransferSchema=v.object({schemaVersion:v.enum([EVIDENCE_TRANSFER_VERSION]),selectedFields:v.array(v.enum(priorCodes),priorCodes.length,1),tables:v.object(priorTables),capabilityDefinitions:v.array(definitionSchema,500),organizations:v.array(organizationSchema,500),evidence:v.array(priorEvidenceSchema,500)});
const credentialSchema=v.object({schemaVersion:v.enum([CREDENTIAL_TRANSFER_VERSION]),identifierContextWorkspaceId:uuid,credentialIdentifiersIncluded:v.boolean(),selectedFields:v.array(v.enum(credentialCodes),credentialCodes.length,1),tables:v.object(credentialTables),capabilityDefinitions:v.array(definitionSchema,500),organizations:v.array(organizationSchema,500),evidence:v.array(evidenceSchema,500)});
const mediaSchema=v.object({schemaVersion:v.enum([MEDIA_TRANSFER_VERSION]),assets:v.array(TransferAssetSchema,500),identifierContextWorkspaceId:uuid,credentialIdentifiersIncluded:v.boolean(),selectedFields:v.array(v.enum(credentialCodes),credentialCodes.length,1),tables:v.object(credentialTables),capabilityDefinitions:v.array(definitionSchema,500),organizations:v.array(organizationSchema,500),evidence:v.array(evidenceSchema,500)});
const collectionItemSchema=v.object({id:uuid,personId:uuid,collectionId:uuid,assetId:uuid,revision,createdAt:dateIso,updatedAt:dateIso,orderIndex:v.number(0,199),caption:v.string(1000),featured:v.boolean()});
const collectionSchema=v.object({schemaVersion:v.enum([COLLECTION_TRANSFER_VERSION]),assets:v.array(TransferAssetSchema,500),collectionItems:v.array(collectionItemSchema,500),identifierContextWorkspaceId:uuid,credentialIdentifiersIncluded:v.boolean(),selectedFields:v.array(v.enum(preAdultCodes),preAdultCodes.length,1),tables:v.object(preAdultTables),capabilityDefinitions:v.array(definitionSchema,500),organizations:v.array(organizationSchema,500),evidence:v.array(collectionEvidenceSchema,500)});
const adultSchema=v.object({schemaVersion:v.enum([ADULT_TRANSFER_VERSION]),assets:v.array(TransferAssetSchema,500),collectionItems:v.array(collectionItemSchema,500),identifierContextWorkspaceId:uuid,credentialIdentifiersIncluded:v.boolean(),selectedFields:v.array(v.enum(TRANSFER_CODES),TRANSFER_CODES.length,1),tables:v.object(tableSchemas),capabilityDefinitions:v.array(definitionSchema,500),organizations:v.array(organizationSchema,500),evidence:v.array(adultEvidenceSchema,500)});
export const TransferSchema: Schema<TalentTransfer> = {
    json: {oneOf:[legacySchema.json,capabilitySchema.json,externalSchema.json,representationSchema.json,evidenceTransferSchema.json,credentialSchema.json,mediaSchema.json,collectionSchema.json,adultSchema.json]},
    parse(input,path) {
        const version = input && typeof input==='object' ? (input as Record<string,unknown>).schemaVersion : undefined;
        return (version===ADULT_TRANSFER_VERSION ? adultSchema : version===COLLECTION_TRANSFER_VERSION ? collectionSchema : version===MEDIA_TRANSFER_VERSION ? mediaSchema : version===CREDENTIAL_TRANSFER_VERSION ? credentialSchema : version===EVIDENCE_TRANSFER_VERSION ? evidenceTransferSchema : version===REPRESENTATION_TRANSFER_VERSION ? representationSchema : version===EXTERNAL_TRANSFER_VERSION ? externalSchema : version===CAPABILITY_TRANSFER_VERSION ? capabilitySchema : legacySchema).parse(input,path) as unknown as TalentTransfer;
    }
};

export async function collectTalentTransfer(tx: Tx, actor: Actor, clock: Clock, peopleIds: string[], codes: TransferCode[], withEvidence = false, withIdentifiers = false, withMedia = false): Promise<TalentTransfer> {
    requirePermission(actor, 'records.read');
    const withAdults=codes.includes('person.td2.adultEligibilities');
    if(withAdults)requirePermission(actor,'sources.review');
    const withCredentials=codes.includes('person.td2.personCredentials');
    const withCollections=codes.includes('person.td2.mediaCollections')||codes.includes('person.td2.mediaCollectionTags');
    invariant(!withMedia||withCredentials||withCollections||withAdults,'TD2_TRANSFER_MEDIA_OWNER_REQUIRED','原件须随资质或媒体集合迁移',422);
    invariant(!withIdentifiers||withCredentials,'TD2_TRANSFER_CREDENTIAL_REQUIRED','编号迁移必须同时选择资质记录',422);
    if(withIdentifiers) requirePermission(actor,'sensitive.read');
    if(withEvidence) requirePermission(actor,'sources.review');
    const graph = await loadTalentGraph(tx, actor, clock), people = new Set(peopleIds);
    const tables = Object.fromEntries(TRANSFER_TABLES.map(t => [t, []])) as unknown as TalentTransfer['tables'];
    let total = 0;
    for (const table of TRANSFER_TABLES) {
        if (!codes.includes(transferCode(table))) continue;
        for (const raw of graph.rows(table).filter(r => people.has(r.personId))) {
            const row = raw as unknown as FactRow;
            invariant(!row.supersededById, 'TD2_EXPORT_HISTORY_UNSUPPORTED', '合并历史需要专用导出格式，不能作为当前专业资料导出', 409);
            if(table==='adultEligibilities') invariant(withMedia||!row.evidenceAssetId,'TD2_TRANSFER_MEDIA_GRANT_REQUIRED','成年资格含证明材料，必须另行批准原件迁移',422);
            if(table==='personCredentials') {
                invariant(withMedia||(!row.evidenceAssetId&&row.status!=='VERIFIED'),'TD2_CREDENTIAL_MEDIA_UNSUPPORTED','带证明材料或已核验的资质必须等待原件迁移，不能丢弃证明后导出',409);
                invariant(!row.identifierCiphertext||withIdentifiers,'TD2_CREDENTIAL_IDENTIFIER_GRANT_REQUIRED','此资质含敏感编号，必须单独批准加密编号迁移',422);
            }
            await sourceFor(tx, actor, row.sourceId, clock);
            const projected = graph.project(table, row);
            invariant(projected && (projected.unavailableFields as string[]).length === 0, 'TD2_EXPORT_RESTRICTED', '所选专业资料存在当前不可读字段，不能静默遗漏', 409);
            // Per-field multi-source evidence needs its own transfer contract. Do not drop provenance.
            const owner = TD2_FACTS[table].ownerKey;
            invariant(withEvidence || !graph.rows('evidence').some(e => (e as unknown as Record<string, unknown>)[owner] === row.id && e.sourceId !== row.sourceId),
                'TD2_EXPORT_EVIDENCE_UNSUPPORTED', '同一条专业事实包含其他来源证据，当前格式不能完整保存其来源关系', 409);
            tables[table].push({ id: row.id, personId: row.personId, sourceId: row.sourceId, revision: row.revision,
                createdAt: row.createdAt, updatedAt: row.updatedAt,
                data: Object.fromEntries(TALENT_TRANSFER_FIELDS[table].map(field => [field, table==='adultEligibilities'&&field==='verification' ? row.verifiedByMembershipId ? {workspaceId:actor.workspaceId,membershipId:row.verifiedByMembershipId} : row.originalVerificationWorkspaceId ? {workspaceId:row.originalVerificationWorkspaceId,membershipId:row.originalVerificationMembershipId} : null : row[field]])) });
            invariant(++total <= 500, 'TD2_EXPORT_LIMIT', '单次专业资料导出最多 500 条', 422);
        }
        tables[table].sort((a,b) => a.id.localeCompare(b.id));
    }
    const withRepresentations=codes.includes('person.td2.representations');
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
    if(withCredentials||withExternal||withRepresentations) {
        const ids=new Set([...tables.personCredentials.map(r=>r.data.issuerOrganizationId),...tables.personExternalRefs.map(r=>r.data.issuerOrganizationId),...tables.representations.map(r=>r.data.agencyOrganizationId)].filter(Boolean));
        for(const id of ids) {
            invariant(graph.organizationReadable(String(id)),'TD2_EXPORT_RESTRICTED','关联机构当前不可读，不能省略后导出',409);
            const row=graph.rows('organizations').find(o=>o.id===id)!;
            await sourceFor(tx,actor,row.sourceId,clock);
            organizations.push(organizationSchema.parse(Object.fromEntries(Object.keys(organizationSchema.json.properties as object).map(k=>[k,(row as unknown as Record<string,unknown>)[k]]))));
        }
        organizations.sort((a,b)=>a.id.localeCompare(b.id));
    }
    const evidence: TransferEvidence[]=[];
    if(withEvidence) for(const table of TRANSFER_TABLES) for(const row of tables[table]) {
        const owner=TD2_FACTS[table].ownerKey;
        for(const e of graph.rows('evidence').filter(e=>(e as unknown as Record<string,unknown>)[owner]===row.id)) {
            invariant(Object.keys(TALENT_OWNER_EMPTY).filter(k=>(e as unknown as Record<string,unknown>)[k]!=null).length===1,'TD2_TRANSFER_EVIDENCE_OWNER','字段证据归属必须唯一',409);
            invariant(total+capabilityDefinitions.length+organizations.length+evidence.length<500,'TD2_EXPORT_LIMIT','单次专业资料与证据最多500条',422);
            const evidenceSource=await sourceFor(tx,actor,e.sourceId,clock);
            invariant(e.sourceRevision<=evidenceSource.revision,'TD2_TRANSFER_EVIDENCE_SOURCE_REVISION','字段证据引用了不存在的来源版本',409);
            evidence.push(adultEvidenceSchema.parse({id:e.id,revision:e.revision,createdAt:e.createdAt,updatedAt:e.updatedAt,ownerKind:table,ownerId:row.id,fieldPath:e.fieldPath,valueDigest:e.valueDigest,sourceId:e.sourceId,sourceRevision:e.sourceRevision,
                originalReview:e.reviewerId?{workspaceId:actor.workspaceId,membershipId:e.reviewerId,reviewedAt:e.reviewedAt}:e.originalReviewWorkspaceId?{workspaceId:e.originalReviewWorkspaceId,membershipId:e.originalReviewMembershipId,reviewedAt:e.originalReviewedAt}:null}) as TransferEvidence);
        }
    }
    evidence.sort((a,b)=>a.id.localeCompare(b.id));
    const collectionItems:TransferCollectionItem[]=[];
    if(withCollections) {
        const selected=new Set(tables.mediaCollections.map(c=>c.id));
        for(const item of graph.rows('mediaCollectionItems').filter(i=>selected.has(i.collectionId))) {
            invariant(withMedia,'TD2_TRANSFER_MEDIA_GRANT_REQUIRED','媒体集合含图片，必须另行批准原件迁移，不能只保留空集合',422);
            collectionItems.push(collectionItemSchema.parse(Object.fromEntries(Object.keys(collectionItemSchema.json.properties as object).map(k=>[k,(item as unknown as Record<string,unknown>)[k]]))));
        }
        collectionItems.sort((a,b)=>a.collectionId.localeCompare(b.collectionId)||a.orderIndex-b.orderIndex);
    }
    const assets: TransferAsset[]=[];
    if(withMedia) {
        requirePermission(actor,'assets.read');
        const ids=new Set([...tables.personCredentials.map(r=>r.data.evidenceAssetId),...tables.adultEligibilities.map(r=>r.data.evidenceAssetId),...collectionItems.map(i=>i.assetId)].filter(Boolean));
        for(const id of ids) {
            const asset=await readyAsset(tx,actor,String(id),clock);
            invariant(!asset.personId||people.has(asset.personId),'TD2_TRANSFER_MEDIA_PERSON','证明图片所属人物必须一同选择并批准',422);
            assets.push(transferAsset(asset));
        }
        assets.sort((a,b)=>a.id.localeCompare(b.id));
    }
    if(!withAdults) delete (tables as Partial<typeof tables>).adultEligibilities;
    if(!withAdults&&!withCollections) {delete (tables as Partial<typeof tables>).mediaCollections;delete (tables as Partial<typeof tables>).mediaCollectionTags;}
    if(!withAdults&&!withCollections&&!withCredentials&&!withMedia) delete (tables as Partial<typeof tables>).personCredentials;
    if(!withAdults&&!withCollections&&!withCredentials&&!withEvidence&&!withRepresentations) delete (tables as Partial<typeof tables>).representations;
    if(!withAdults&&!withCollections&&!withCredentials&&!withEvidence&&!withExternal&&!withRepresentations) delete (tables as Partial<typeof tables>).personExternalRefs;
    if(!withAdults&&!withCollections&&!withCredentials&&!withEvidence&&!withCapabilities&&!withExternal&&!withRepresentations) delete (tables as Partial<typeof tables>).personCapabilities;
    const transfer = TransferSchema.parse({ schemaVersion: withAdults ? ADULT_TRANSFER_VERSION : withCollections ? COLLECTION_TRANSFER_VERSION : withMedia ? MEDIA_TRANSFER_VERSION : withCredentials ? CREDENTIAL_TRANSFER_VERSION : withEvidence ? EVIDENCE_TRANSFER_VERSION : withRepresentations ? REPRESENTATION_TRANSFER_VERSION : withExternal ? EXTERNAL_TRANSFER_VERSION : withCapabilities ? CAPABILITY_TRANSFER_VERSION : TRANSFER_VERSION, selectedFields: [...codes].sort(), tables, ...(withAdults||withCollections||withCredentials||withEvidence||withCapabilities||withExternal||withRepresentations?{capabilityDefinitions}:{}), ...(withAdults||withCollections||withCredentials||withEvidence||withExternal||withRepresentations?{organizations}:{}), ...(withAdults||withCollections||withEvidence||withCredentials?{evidence}:{}), ...(withAdults||withCollections||withCredentials?{identifierContextWorkspaceId:actor.workspaceId,credentialIdentifiersIncluded:withIdentifiers}:{}), ...(withAdults||withMedia||withCollections?{assets}:{}),...(withAdults||withCollections?{collectionItems}:{}) });
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
            reference('collectionId','mediaCollections'); reference('personRoleId', 'personRoles'); reference('currentMeasurementSetId', 'measurementSets'); reference('supersedesId', 'measurementSets');
            if ((table==='translatorLanguagePairs'||table==='translatorServiceModes') && row.data.personRoleId) invariant(maps.personRoles.get(String(row.data.personRoleId))?.data.roleCode === 'translator', 'TD2_TRANSFER_ROLE_INVALID', '翻译资料必须关联翻译职业', 422);
            if (table !== 'talentProfiles' && table !== 'personLanguages') invariant(bundle.tables.talentProfiles.some(p => p.personId === row.personId), 'TD2_TRANSFER_PROFILE_MISSING', '专业资料需要同时选择人才主档案', 422);
            if (table === 'castingProfiles' || table === 'measurementSets' || table === 'adultEligibilities') invariant(bundle.tables.personRoles.some(p => p.personId === row.personId && ['model','actor','kol'].includes(String(p.data.roleCode))), 'TD2_TRANSFER_ROLE_INVALID', '选角资料需要同时选择对应职业', 422);
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
    const representations=transferRows(bundle,'representations');
    for(const row of representations) {
        const d=row.data;
        invariant(Number(!!d.agencyOrganizationId)+Number(!!d.agentPersonId)===1,'REPRESENTATION_SUBJECT_REQUIRED','代表机构与代表人必须且只能选择一个',422);
        if(d.agentPersonId) invariant(d.agentPersonId!==row.personId&&people.has(String(d.agentPersonId)),'TD2_TRANSFER_AGENT_MISSING','代表人必须另行选择并批准导出，且不能是本人',422);
    }
    const credentials=transferRows(bundle,'personCredentials');
    for(const row of credentials) {
        const d=row.data;
        invariant((bundle.schemaVersion===MEDIA_TRANSFER_VERSION||bundle.schemaVersion===COLLECTION_TRANSFER_VERSION||bundle.schemaVersion===ADULT_TRANSFER_VERSION)||(!d.evidenceAssetId&&d.status!=='VERIFIED'),'TD2_CREDENTIAL_MEDIA_UNSUPPORTED','带证明材料或已核验的资质需要原件迁移',422);
        invariant(d.status!=='VERIFIED'||!!d.evidenceAssetId,'CREDENTIAL_PROOF_REQUIRED','已核验资质必须保存证明原件',422);
        invariant(!!d.issuerOrganizationId||!!d.issuerName,'CREDENTIAL_ISSUER_REQUIRED','资质必须注明颁发方',422);
        invariant(!d.issuedOn||!d.expiresOn||String(d.issuedOn)<=String(d.expiresOn),'CREDENTIAL_DATE_INVALID','资质起止日期不正确',422);
        invariant((d.identifierCiphertext===null)===(d.maskedIdentifier===null),'TD2_CREDENTIAL_IDENTIFIER_PAIR','资质编号密文和遮罩必须同时存在',422);
        invariant(!d.identifierCiphertext||bundle.credentialIdentifiersIncluded,'TD2_CREDENTIAL_IDENTIFIER_GRANT_REQUIRED','加密编号未声明单独迁移',422);
    }
    const adults=transferRows(bundle,'adultEligibilities');
    for(const row of adults) {
        const d=row.data;
        const origin=d.verification as {workspaceId:string;membershipId:string}|null;
        invariant(!origin||(bundle.evidence??[]).some(e=>e.ownerKind==='adultEligibilities'&&e.ownerId===row.id&&e.fieldPath==='state'&&e.valueDigest===digest('VERIFIED_ADULT')&&e.originalReview?.workspaceId===origin.workspaceId&&e.originalReview.membershipId===origin.membershipId&&e.originalReview.reviewedAt===d.verifiedAt),'TD2_ADULT_REVIEW_EVIDENCE_REQUIRED','成年核验必须同时批准并保留原字段核验证据',422);
        invariant((d.verifiedAt===null)===(d.verification===null),'TD2_ADULT_VERIFICATION_PAIR','成年核验归属与时间必须同时存在',422);
        invariant(d.state!=='VERIFIED_ADULT'||!!d.verification&&!!d.evidenceAssetId&&!!d.validUntil,'TD2_ADULT_PROOF_REQUIRED','已核验成年资格必须保留原核验归属、证明和有效期',422);
        invariant(d.status!=='ACTIVE'||adults.filter(r=>r.personId===row.personId&&r.data.status==='ACTIVE').length===1,'TD2_ADULT_ACTIVE_DUPLICATE','同一人物只能有一份活动成年资格',422);
    }
    const items=bundle.collectionItems??[];
    invariant(items.length===new Set(items.map(i=>i.id)).size,'TD2_TRANSFER_COLLECTION_DUPLICATE','集合项目编号重复',422);
    for(const i of items) invariant(maps.mediaCollections.get(i.collectionId)?.personId===i.personId,'TD2_TRANSFER_COLLECTION_OWNER','集合项目必须属于已选人物和集合',422);
    for(const c of transferRows(bundle,'mediaCollections')) {
        const children=items.filter(i=>i.collectionId===c.id).sort((a,b)=>a.orderIndex-b.orderIndex);
        invariant(children.length<=200&&children.every((i,n)=>i.orderIndex===n)&&new Set(children.map(i=>i.assetId)).size===children.length,'TD2_TRANSFER_COLLECTION_ORDER','集合图片必须唯一且顺序连续',422);
    }
    const tags=transferRows(bundle,'mediaCollectionTags');
    invariant(new Set(tags.map(t=>String(t.data.collectionId)+':'+String(t.data.tagCode))).size===tags.length,'TD2_TRANSFER_COLLECTION_TAG_DUPLICATE','集合内容标签重复',422);
    const assets=bundle.assets??[], assetIds=new Set([...credentials.map(r=>r.data.evidenceAssetId),...adults.map(r=>r.data.evidenceAssetId),...items.map(i=>i.assetId)].filter(Boolean));
    invariant(assets.length===new Set(assets.map(a=>a.id)).size && assets.length===assetIds.size && assets.every(a=>assetIds.has(a.id)), 'TD2_TRANSFER_MEDIA_MISSING','证明原件清单必须完整且不得夹带无关文件',422);
    for(const asset of assets) {
        invariant(!asset.personId||people.has(asset.personId),'TD2_TRANSFER_MEDIA_PERSON','证明图片所属人物缺失',422);
        invariant(asset.width*asset.height<=60000000,'TD2_TRANSFER_MEDIA_SIZE','图片像素超过上限',422);
        invariant(!asset.personId||credentials.filter(r=>r.data.evidenceAssetId===asset.id).every(r=>r.personId===asset.personId),'TD2_TRANSFER_MEDIA_PERSON','证明图片必须属于相应人物',422);
    }
    invariant(assets.reduce((sum,a)=>sum+a.bytes+a.previewBytes,0)<=2000000000,'TD2_TRANSFER_MEDIA_SIZE','证明文件超过隔离存储容量',422);
    const organizationIds=new Set([...credentials.map(r=>r.data.issuerOrganizationId),...external.map(r=>r.data.issuerOrganizationId),...representations.map(r=>r.data.agencyOrganizationId)].filter(Boolean));
    invariant(organizations.length===new Set(organizations.map(o=>o.id)).size,'TD2_TRANSFER_ORGANIZATION_DUPLICATE','关联机构编号重复',422);
    invariant(organizations.length===organizationIds.size && organizations.every(o=>organizationIds.has(o.id)),'TD2_TRANSFER_ORGANIZATION_MISSING','机构清单必须恰好包含所选资料引用的机构',422);
    const activeKeys=new Set<string>();
    for(const row of external) {
        const d=row.data;
        invariant(d.state!=='VERIFIED'||!!d.verifiedAt,'EXTERNAL_REF_VERIFICATION_MISSING','已核验标识缺少核验时间',422);
        invariant(d.state!=='OBSERVED'||d.verifiedAt===null,'EXTERNAL_REF_VERIFICATION_INVALID','未核验标识不能附带核验时间',422);
        if(d.state==='REVOKED')continue;
        const key=JSON.stringify([d.providerCode,d.namespaceCode,d.issuerOrganizationId,d.externalKey]);
        invariant(!activeKeys.has(key),'EXTERNAL_REF_CONFLICT','同一外部标识不能重复归属人物',422);activeKeys.add(key);
    }
    const evidence=bundle.evidence??[];
    invariant(evidence.length===new Set(evidence.map(e=>e.id)).size,'TD2_TRANSFER_EVIDENCE_DUPLICATE','字段证据编号重复',422);
    for(const e of evidence) {
        invariant(maps[e.ownerKind]?.has(e.ownerId),'TD2_TRANSFER_EVIDENCE_OWNER','字段证据必须引用已选择的专业记录',422);
        invariant(!['identifierCiphertext','maskedIdentifier','verification'].includes(e.fieldPath)&&(TALENT_TRANSFER_FIELDS[e.ownerKind] as readonly string[]).includes(e.fieldPath),'TD2_TRANSFER_EVIDENCE_FIELD','字段证据不能引用未导出的字段',422);
    }
    invariant(count + definitions.length + organizations.length + evidence.length + items.length <= 500, 'TD2_EXPORT_LIMIT', '单次专业资料最多 500 条', 422);
    for (const row of bundle.tables.measurementSets) {
        const seen = new Set([row.id]); let previous = row.data.supersedesId;
        while (previous) { invariant(!seen.has(String(previous)), 'TD2_TRANSFER_CYCLE', '量尺历史不能形成循环', 422); seen.add(String(previous)); previous = maps.measurementSets.get(String(previous))?.data.supersedesId; }
    }
}
