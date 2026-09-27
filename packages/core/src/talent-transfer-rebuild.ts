import {rekeyCredential,type CredentialRebuildKeys} from './credential-transfer-crypto.ts';
import { TALENT_OWNER_EMPTY } from './talent-v2-model.ts';
import { TD2_FACTS } from './talent-v2-schema.ts';
import type { Actor, Clock, TableMap } from './model.ts';
import type { Tx } from './store.ts';
import { invariant } from './errors.ts';
import { transferRows, TRANSFER_TABLES, validateTransferLinks, type TalentTransfer } from './talent-transfer.ts';

export async function validateTalentRebuild(tx: Tx, actor: Actor, clock: Clock, bundle: TalentTransfer, people: string[], sources: string[]) {
    validateTransferLinks(bundle, people);
    const dictionary = await tx.find('dictionary', {workspaceId: actor.workspaceId, status: 'ACTIVE'});
    const catalog = (namespace: string, value: unknown) => invariant(dictionary.some(d => d.namespace === namespace && d.code === value), 'REBUILD_CATALOG_MISSING', '目标缺少专业资料使用的启用字典代码', 409);
    const overlap = (a: Record<string,unknown>, b: Record<string,unknown>) => (!a.validFrom || !b.validUntil || String(a.validFrom)<String(b.validUntil)) && (!b.validFrom || !a.validUntil || String(b.validFrom)<String(a.validUntil));
    for(const i of bundle.collectionItems??[]) invariant(Date.parse(i.createdAt)<=Date.parse(i.updatedAt)&&Date.parse(i.updatedAt)<=clock.now().getTime(),'TD2_TRANSFER_TIME_INVALID','集合项目时间不合法',422);
    for(const a of bundle.assets??[]) {
        invariant(sources.includes(a.sourceId),'REBUILD_SOURCE_MISSING','证明原件来源必须包含在清单',422);
        invariant(Date.parse(a.createdAt)<=Date.parse(a.updatedAt)&&Date.parse(a.updatedAt)<=clock.now().getTime(),'TD2_TRANSFER_TIME_INVALID','证明原件时间不合法',422);
    }
    for(const e of bundle.evidence??[]) {
        invariant(sources.includes(e.sourceId),'REBUILD_SOURCE_MISSING','字段证据来源必须包含在重建清单',422);
        invariant(Date.parse(e.createdAt)<=Date.parse(e.updatedAt)&&Date.parse(e.updatedAt)<=clock.now().getTime(),'TD2_TRANSFER_TIME_INVALID','字段证据时间不合法',422);
        invariant(!e.originalReview || (Date.parse(e.originalReview.reviewedAt)>=Date.parse(e.createdAt)&&Date.parse(e.originalReview.reviewedAt)<=Date.parse(e.updatedAt)), 'TD2_TRANSFER_TIME_INVALID','原核验时间不合法',422);
    }
    for (const organization of bundle.organizations??[]) {
        invariant(sources.includes(organization.sourceId),'REBUILD_SOURCE_MISSING','关联机构来源必须包含在重建清单',422);
        invariant(Date.parse(organization.createdAt)<=Date.parse(organization.updatedAt)&&Date.parse(organization.updatedAt)<=clock.now().getTime(),'TD2_TRANSFER_TIME_INVALID','关联机构时间不合法',422);
    }
    for (const definition of bundle.capabilityDefinitions??[]) {
        invariant(Date.parse(definition.createdAt)<=Date.parse(definition.updatedAt)&&Date.parse(definition.updatedAt)<=clock.now().getTime(),'TD2_TRANSFER_TIME_INVALID','能力定义时间不合法',422);
        for(const role of definition.applicableRoleCodes) catalog('role',role);
    }
    for (const table of TRANSFER_TABLES) for (const row of transferRows(bundle,table)) {
        const d = row.data, same = transferRows(bundle,table).filter(r => r.personId === row.personId && r.id !== row.id);
        invariant(sources.includes(row.sourceId), 'REBUILD_SOURCE_MISSING', '专业资料来源必须包含在重建清单', 422);
        invariant(Date.parse(row.createdAt) <= Date.parse(row.updatedAt) && Date.parse(row.updatedAt) <= clock.now().getTime(), 'TD2_TRANSFER_TIME_INVALID', '专业记录时间不合法', 422);
        invariant(!d.validFrom || !d.validUntil || String(d.validFrom)<String(d.validUntil), 'PERIOD_INVALID', '专业资料有效期不合法', 422);
        invariant(!d.verifiedAt || Date.parse(String(d.verifiedAt)) <= clock.now().getTime(), 'TD2_TRANSFER_TIME_INVALID', '核验时间不能晚于当前时间', 422);
        if (table === 'personRoles' || table === 'personLanguages' || table === 'talentLocations') {
            const field = table === 'personRoles' ? 'roleCode' : table === 'personLanguages' ? 'languageCode' : 'locationCode';
            catalog(table === 'personRoles' ? 'role' : table === 'personLanguages' ? 'language' : 'city', d[field]);
            if (d.status === 'ACTIVE') invariant(!same.some(r => r.data.status === 'ACTIVE' && overlap(d,r.data) && (table === 'talentLocations' ? d.relationCode === 'BASE' && r.data.relationCode === 'BASE' : d[field] === r.data[field])), 'TD2_TRANSFER_PERIOD_OVERLAP', '生效专业记录有效期重叠', 422);
        }
        if (table === 'measurementSets') {
            invariant(String(d.measuredOn) <= clock.now().toISOString().slice(0,10), 'MEASUREMENT_FUTURE', '量尺日期不能在未来', 422);
            for (const key of ['shoe','clothing']) invariant((d[key+'SizeValue']===null)===(d[key+'SizeSystem']===null), 'SIZE_SYSTEM_REQUIRED', '尺码和体系必须同时存在', 422);
            invariant(['heightCm','bustCm','waistCm','hipsCm','shoeSizeValue','clothingSizeValue'].some(k=>d[k]!==null&&d[k]!==''), 'MEASUREMENT_EMPTY', '量尺记录不能为空', 422);
            if (d.supersedesId) {
                const previous = bundle.tables.measurementSets.find(r=>r.id===d.supersedesId)!;
                invariant(['CONFIRMED','SUPERSEDED'].includes(String(previous.data.status)) && String(previous.data.measuredOn)<=String(d.measuredOn), 'MEASUREMENT_PREDECESSOR_INVALID', '量尺历史状态或日期不合法', 422);
            }
        }
        if (table === 'castingProfiles' && d.currentMeasurementSetId) invariant(bundle.tables.measurementSets.some(r=>r.id===d.currentMeasurementSetId&&r.data.status==='CONFIRMED'), 'CURRENT_MEASUREMENT_INVALID', '当前量尺必须是同人物已确认的记录', 422);
        if (table === 'translatorLanguagePairs') {
            catalog('language', d.sourceLanguageCode); catalog('language', d.targetLanguageCode);
            invariant(d.sourceLanguageCode !== d.targetLanguageCode, 'TRANSLATION_DIRECTION_INVALID', '翻译方向不能相同', 422);
            invariant(!same.some(r=>r.data.personRoleId===d.personRoleId&&r.data.sourceLanguageCode===d.sourceLanguageCode&&r.data.targetLanguageCode===d.targetLanguageCode), 'TRANSLATION_PAIR_EXISTS', '翻译方向重复', 422);
        }
        if (table === 'translatorServiceModes') invariant(!same.some(r=>r.data.personRoleId===d.personRoleId&&r.data.modeCode===d.modeCode), 'TRANSLATION_MODE_EXISTS', '翻译服务方式重复', 422);
    }
}

export async function applyTalentRebuild(tx: Tx, actor: Actor, bundle: TalentTransfer, scopeId: string, keys?:CredentialRebuildKeys) {
    for (const organization of bundle.organizations??[]) await tx.insert('organizations',{...organization,workspaceId:actor.workspaceId,scopeId});
    for (const definition of bundle.capabilityDefinitions??[]) await tx.insert('capabilityDefinitions',{...definition,workspaceId:actor.workspaceId});
    // Foreign keys are deferred; insertion order still puts owners before their dependents.
    for (const table of TRANSFER_TABLES) for (const row of transferRows(bundle,table)) {
        const { data, ...identity } = row;
        await tx.insert(table, { ...identity, workspaceId: actor.workspaceId, ...(table==='personCredentials'?rekeyCredential(bundle,row,actor.workspaceId,keys):data),
            ...(table === 'talentProfiles' ? {supersededById:null} : {}),
            ...(table === 'castingProfiles' ? {supersededById:null,retiredCurrentMeasurementSetId:null} : {})
        } as unknown as TableMap[typeof table]);
    }
    for(const item of bundle.collectionItems??[]) await tx.insert('mediaCollectionItems',{...item,workspaceId:actor.workspaceId});
}

export async function applyTransferEvidence(tx:Tx,actor:Actor,bundle:TalentTransfer) {
    for(const e of bundle.evidence??[]) {
        const {ownerKind,ownerId,originalReview,...row}=e;
        await tx.insert('evidence',{...row,workspaceId:actor.workspaceId,...TALENT_OWNER_EMPTY,[TD2_FACTS[ownerKind].ownerKey]:ownerId,reviewerId:null,reviewedAt:null,
            originalReviewWorkspaceId:originalReview?.workspaceId??null,originalReviewMembershipId:originalReview?.membershipId??null,originalReviewedAt:originalReview?.reviewedAt??null});
    }
}
