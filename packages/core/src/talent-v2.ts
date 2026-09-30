import { validateDemographics, PROFILE_DEFAULTS, ROLE_DEFAULTS, MODEL_ROLE_FIELDS } from './talent-demographics.ts';
import { shortlistFor } from './shortlists.ts';
import type { Actor, Clock, Config, Person, RequestMeta, TableMap, FieldEvidence } from './model.ts';
import type { Tx } from './store.ts';
import { AppError, invariant, missing } from './errors.ts';
import { base, cas, page, touch, workspaceRow } from './helpers.ts';
import { digest } from './json.ts';
import { uuid } from './validation.ts';
import { sourceFor, sourceCurrent, requirePermission, requireScope } from './policy.ts';
import { encryptContact } from './crypto.ts';
import { TD2Schemas as S, TD2_FACTS, TD2_TABLES, FACT_SCHEMAS, OWNER_KEYS, VERSION, rowDefaults, valuesSchema, fieldSchema, type FactRow, type FactTable } from './talent-v2-schema.ts';
import { loadTalentGraph, td2PersonFor, rawFact, insertFact, replaceFact, asRow, periodCurrent } from './talent-v2-graph.ts';
import { TALENT_SCHEMA_VERSION, type FieldProposal } from './talent-v2-model.ts';

function legacyFields(version:string,table:string,fields:string[]){if(version!=='once-talent-v2.0.0')return;const added=table==='talentProfiles'?Object.keys(PROFILE_DEFAULTS):table==='personRoles'?[...MODEL_ROLE_FIELDS]:[];invariant(!fields.some(f=>added.includes(f)),'TD2_SCHEMA_UPGRADE_REQUIRED','新增业务字段须使用2.1合同',422);}

export function talentWrite(actor:Actor):void{
    requirePermission(actor,actor.actorKind==='MACHINE'?'talent.fact.write':'records.write');
}
export function humanReview(actor:Actor):void{
    invariant(actor.actorKind!=='MACHINE','HUMAN_REVIEW_REQUIRED','此操作需要内部成员核验',403);
    requirePermission(actor,'sources.review');
}
const overlap=(a:Record<string,unknown>,b:Record<string,unknown>)=>
    (a.validFrom?Date.parse(String(a.validFrom)):-Infinity)<(b.validUntil?Date.parse(String(b.validUntil)):Infinity)
    && (b.validFrom?Date.parse(String(b.validFrom)):-Infinity)<(a.validUntil?Date.parse(String(a.validUntil)):Infinity);
const updateResult=<T extends {id:string;revision:number}>(row:T)=>row;
export class TalentV2 {
    clock:Clock; config:Config;
    constructor(clock:Clock,config:Config){this.clock=clock;this.config=config;}
    async source(tx:Tx,actor:Actor,id:string,expected:number){const source=await sourceFor(tx,actor,id,this.clock);cas(source,expected);return source;}
    async parent(tx:Tx,actor:Actor,id:string,expected:number){const person=await td2PersonFor(tx,actor,id);cas(person,expected);invariant(person.status!=='ARCHIVED','PERSON_ARCHIVED','已归档人物不能修改专业资料',409);return person;}
    async bump(tx:Tx,p:Person){const next=touch(p,this.clock);await tx.replace('people',next);return next;}
    async createPerson(tx:Tx,actor:Actor,input:unknown){
        talentWrite(actor);const d=S.personCreate.parse(input),source=await this.source(tx,actor,d.originSourceId,d.sourceRevision);
        const person:Person={...base(actor.workspaceId,this.clock),sourceId:source.id,scopeId:source.scopeId,maintainerId:actor.membershipId,displayName:d.displayName,aliases:d.aliases??[],intro:d.intro??'',roles:[],languageCodes:[],skillCodes:[],cityCode:null,heightCm:null,status:'DRAFT',protectionEpoch:1};
        await tx.insert('people',person);
        if(d.createTalent)await tx.insert('talentProfiles',{...base(actor.workspaceId,this.clock),personId:person.id,sourceId:source.id,...PROFILE_DEFAULTS,internalSummary:'',status:'ACTIVE'});
        return person;
    }
    async patchPerson(tx:Tx,actor:Actor,id:string,input:unknown){
        talentWrite(actor);const d=S.personPatch.parse(input),p=await this.parent(tx,actor,id,d.expectedRevision);
        await sourceFor(tx,actor,p.sourceId,this.clock);
        const next=touch(p,this.clock);
        for(const key of ['displayName','intro','aliases','status'] as const)if(d[key]!==undefined)Object.assign(next,{[key]:d[key]});
        invariant(Object.keys(d).length>2,'EMPTY_UPDATE','没有需要保存的修改',400);
        if(next.status!==p.status)next.protectionEpoch++;
        await tx.replace('people',next);return next;
    }
    async enroll(tx:Tx,actor:Actor,id:string,input:unknown){
        talentWrite(actor);const d=S.enroll.parse(input),p=await this.parent(tx,actor,id,d.expectedRevision);
        await this.source(tx,actor,p.sourceId,d.sourceRevision);
        invariant(!(await tx.find('talentProfiles',{workspaceId:actor.workspaceId,personId:id})).length,'TALENT_PROFILE_EXISTS','人物已有专业档案',409);
        const legacyCandidates=(await tx.find('shortlistItems',{workspaceId:actor.workspaceId,personId:id})).filter(item=>!item.personRoleId);
        invariant(legacyCandidates.length<=500,'TALENT_ENROLL_DEPENDENCY_LIMIT','现有候选关系超过单次升级上限，需要先核对',409);
        const candidateLists=new Map<string,TableMap['shortlists']>();
        for(const item of legacyCandidates)if(!candidateLists.has(item.shortlistId))candidateLists.set(item.shortlistId,await shortlistFor(tx,actor,item.shortlistId));
        await tx.insert('talentProfiles',{...base(actor.workspaceId,this.clock),personId:id,sourceId:p.sourceId,...PROFILE_DEFAULTS,internalSummary:'',status:'ACTIVE'});
        for(const roleCode of p.roles)await tx.insert('personRoles',{...base(actor.workspaceId,this.clock),personId:id,sourceId:p.sourceId,...ROLE_DEFAULTS,roleCode,validFrom:null,validUntil:null,status:'ACTIVE'});
        for(const languageCode of p.languageCodes)await tx.insert('personLanguages',{...base(actor.workspaceId,this.clock),personId:id,sourceId:p.sourceId,languageCode,speakingLevelCode:null,listeningLevelCode:null,readingLevelCode:null,writingLevelCode:null,verifiedAt:null,validFrom:null,validUntil:null,status:'ACTIVE'});
        if(p.cityCode)await tx.insert('talentLocations',{...base(actor.workspaceId,this.clock),personId:id,sourceId:p.sourceId,locationCode:p.cityCode,relationCode:'BASE',verifiedAt:null,validFrom:null,validUntil:null,status:'ACTIVE'});
        for(const capabilityCode of p.skillCodes){
            let definition=(await tx.find('capabilityDefinitions',{workspaceId:actor.workspaceId,code:capabilityCode}))[0];
            if(!definition){const entry=(await tx.find('dictionary',{workspaceId:actor.workspaceId,namespace:'skill',code:capabilityCode}))[0];invariant(!!entry,'CAPABILITY_MIGRATION_REVIEW','旧能力字典缺失，需要先核对',409);definition={...base(actor.workspaceId,this.clock),code:capabilityCode,labelZh:entry.labelZh,labelEn:entry.labelEn,aliases:[],applicableRoleCodes:[],levelSchemeCode:null,semanticVersion:'1.0.0',schemaVersion:TALENT_SCHEMA_VERSION,status:entry.status};await tx.insert('capabilityDefinitions',definition);}
            await tx.insert('personCapabilities',{...base(actor.workspaceId,this.clock),personId:id,sourceId:p.sourceId,personRoleId:null,capabilityCode,levelCode:null,validFrom:null,validUntil:null,status:'ACTIVE'});
        }
        for(const item of legacyCandidates){
            await tx.replace('shortlistItems',{...touch(item,this.clock),roleContextState:'LEGACY_REVIEW'});
            if(!(await tx.find('talentMigrationReviews',{workspaceId:actor.workspaceId,shortlistItemId:item.id,reason:'SHORTLIST_ROLE_REQUIRED',state:'PENDING'})).length)
                await tx.insert('talentMigrationReviews',{...base(actor.workspaceId,this.clock),personId:id,shortlistItemId:item.id,previousShortlistItemIds:[],reason:'SHORTLIST_ROLE_REQUIRED',state:'PENDING',resolvedAt:null,resolvedById:null});
        }
        for(const root of candidateLists.values())await tx.replace('shortlists',touch(root,this.clock));
        if(p.heightCm!==null)await tx.insert('talentMigrationReviews',{...base(actor.workspaceId,this.clock),personId:id,shortlistItemId:null,reason:'HEIGHT_SEMANTICS_REQUIRED',state:'PENDING',resolvedAt:null,resolvedById:null});
        return this.bump(tx,p);
    }
    async dictionary(tx:Tx,actor:Actor,namespace:TableMap['dictionary']['namespace'],code:string){
        invariant((await tx.find('dictionary',{workspaceId:actor.workspaceId,namespace,code,status:'ACTIVE'})).length===1,'UNKNOWN_DICTIONARY_CODE','字典选项不存在或已停用',422);
    }
    async validate(tx:Tx,actor:Actor,table:FactTable,row:FactRow){
        const graph=await loadTalentGraph(tx,actor,this.clock), p=await td2PersonFor(tx,actor,row.personId);
        if(table!=='talentProfiles'&&table!=='personLanguages')invariant(graph.rows('talentProfiles').some(x=>x.personId===p.id&&x.status==='ACTIVE'),'TALENT_PROFILE_REQUIRED','请先为这个人物建立专业档案',409);
        const same=graph.rows(table).filter(x=>x.personId===p.id&&x.id!==row.id).map(x=>x as unknown as FactRow);
        invariant(same.length<1000,'FACT_LIMIT','单人物同类资料超过上限',422);
        if(TD2_FACTS[table].period)invariant(!row.validFrom||!row.validUntil||Date.parse(String(row.validFrom))<Date.parse(String(row.validUntil)),'PERIOD_INVALID','有效期起点必须早于终点',422);
        for(const [key,target] of [['personRoleId','personRoles'],['collectionId','mediaCollections']] as const){
            if(row[key]){const related=graph.fact(target,String(row[key]));invariant(!!related&&related.personId===p.id&&graph.usable(target,related),'RELATION_UNAVAILABLE','关联资料不可用或不属于当前人物',422);}
        }
        for(const key of ['agencyOrganizationId','issuerOrganizationId'])if(row[key])invariant(graph.organizationReadable(String(row[key])),'ORGANIZATION_UNAVAILABLE','关联机构不可用',422);
        if(row.agentPersonId){await td2PersonFor(tx,actor,String(row.agentPersonId));invariant(row.agentPersonId!==p.id,'REPRESENTATION_INVALID','代表人不能是本人',422);}
        if(row.evidenceAssetId)invariant(graph.assetReadable(String(row.evidenceAssetId)),'EVIDENCE_ASSET_UNAVAILABLE','证明材料不可用',422);
        if(table==='talentProfiles'||table==='castingProfiles')invariant(same.length===0,'FACT_SINGLETON_EXISTS','该人物已有此类唯一档案',409);
        if(table==='talentProfiles'){
            validateDemographics(row,this.clock);
            for(const code of (row.nationalityCodes??[]) as string[])await this.dictionary(tx,actor,'nationality',code);
            if(row.coverAssetId){const asset=graph.record('assets',String(row.coverAssetId));invariant(actor.permissions.includes('assets.read')&&graph.assetReadable(String(row.coverAssetId))&&asset?.personId===p.id&&asset.mime.startsWith('image/'),'COVER_UNAVAILABLE','封面须是本人当前可见且处理完成的照片',422);}
        }
        if(table==='personRoles'){
            for(const [field,namespace]of [['styleCodes','roleStyle'],['serviceCodes','roleService']] as const){const codes=(row[field]??[]) as string[];invariant(new Set(codes).size===codes.length,'DUPLICATE_CODE','标签不能重复',422);for(const code of codes)await this.dictionary(tx,actor,namespace,code);}
            invariant(row.roleCode==='model'||(row.castingMarketCode??'UNCLASSIFIED')==='UNCLASSIFIED'&&(row.experienceCode??'UNSPECIFIED')==='UNSPECIFIED','MODEL_ROLE_REQUIRED','国模/外模与素人/专业分类只属于模特职业',422);
            await this.dictionary(tx,actor,'role',String(row.roleCode));
            if(row.status==='ACTIVE')invariant(!same.some(x=>x.status==='ACTIVE'&&x.roleCode===row.roleCode&&overlap(x,row)),'ROLE_PERIOD_OVERLAP','同一职业的有效期不能重叠',409);
        }
        if(table==='personCapabilities'){
            const definition=graph.rows('capabilityDefinitions').find(x=>x.code===row.capabilityCode&&x.status==='ACTIVE');
            invariant(!!definition,'CAPABILITY_UNREGISTERED','能力代码尚未登记或已停用',422);
            invariant(!row.levelCode||definition.levelSchemeCode==='ABILITY_5','CAPABILITY_LEVEL_UNREGISTERED','该能力未启用等级体系',422);
            if(row.personRoleId&&definition.applicableRoleCodes.length){const role=graph.fact('personRoles',String(row.personRoleId));invariant(!!role&&definition.applicableRoleCodes.includes(String(role.roleCode)),'CAPABILITY_ROLE_MISMATCH','该能力不适用于所选职业',422);}
        }
        if(table==='personLanguages'){
            await this.dictionary(tx,actor,'language',String(row.languageCode));
            if(row.status==='ACTIVE')invariant(!same.some(x=>x.status==='ACTIVE'&&x.languageCode===row.languageCode&&overlap(x,row)),'LANGUAGE_PERIOD_OVERLAP','同一语言的有效期不能重叠',409);
        }
        if(table==='talentLocations'){
            await this.dictionary(tx,actor,'city',String(row.locationCode));
            if(row.status==='ACTIVE'&&row.relationCode==='BASE')invariant(!same.some(x=>x.status==='ACTIVE'&&x.relationCode==='BASE'&&overlap(x,row)),'BASE_LOCATION_OVERLAP','同时只能有一个常驻地',409);
        }
        if(table==='castingProfiles'||table==='measurementSets'||table==='adultEligibilities')invariant(graph.rows('personRoles').some(x=>x.personId===p.id&&['model','actor','kol'].includes(x.roleCode)&&graph.usable('personRoles',x as unknown as FactRow)),'CASTING_ROLE_REQUIRED','选角资料需要模特、演员或达人职业',422);
        if(table==='measurementSets'){
            invariant(row.datePrecision==='UNKNOWN'?row.measuredOn===null:typeof row.measuredOn==='string','MEASUREMENT_DATE_PRECISION','未知量尺日期必须留空，已知日期必须注明精度',422);
            invariant(row.measuredOn===null||String(row.measuredOn)<=this.clock.now().toISOString().slice(0,10),'MEASUREMENT_FUTURE','量尺日期不能在未来',422);
            for(const prefix of ['shoe','clothing'])invariant((row[prefix+'SizeValue']===null)===(row[prefix+'SizeSystem']===null),'SIZE_SYSTEM_REQUIRED','鞋码和服装尺码必须同时注明尺码体系',422);
            invariant(['heightCm','bustCm','waistCm','hipsCm','shoeSizeValue','clothingSizeValue'].some(k=>row[k]!==null&&row[k]!==''),'MEASUREMENT_EMPTY','至少记录一项真实量尺结果',422);
            if(row.supersedesId){const old=graph.fact('measurementSets',String(row.supersedesId));invariant(!!old&&old.personId===p.id&&['CONFIRMED','SUPERSEDED'].includes(String(old.status))&&graph.readable('measurementSets',old),'MEASUREMENT_PREDECESSOR_INVALID','历史量尺记录不匹配',422);invariant(row.measuredOn==null||old.measuredOn==null||String(row.measuredOn)>=String(old.measuredOn),'MEASUREMENT_DATE_ORDER','新量尺日期不能早于关联的历史记录',422);}
        }
        if(table==='adultEligibilities')invariant(!same.some(x=>x.status==='ACTIVE')||row.status!=='ACTIVE','ADULT_ELIGIBILITY_EXISTS','请更新现有成年适格记录',409);
        if(table==='representations')invariant(Number(!!row.agencyOrganizationId)+Number(!!row.agentPersonId)===1,'REPRESENTATION_SUBJECT_REQUIRED','经纪机构与代表人必须且只能选择一个',422);
        if(table==='personExternalRefs'){
            const duplicates=graph.rows('personExternalRefs').filter(x=>x.state!=='REVOKED'&&x.id!==row.id&&x.providerCode===row.providerCode&&x.namespaceCode===row.namespaceCode&&x.issuerOrganizationId===row.issuerOrganizationId&&x.externalKey===row.externalKey);
            invariant(duplicates.length===0,'EXTERNAL_REF_CONFLICT','该外部标识已登记，需要人工核对；不会自动合并人物',409);
        }
        if(table==='personCredentials'){
            invariant(!!row.issuerOrganizationId||!!row.issuerName,'CREDENTIAL_ISSUER_REQUIRED','资质必须注明颁发方',422);
            invariant(!row.issuedOn||!row.expiresOn||String(row.issuedOn)<=String(row.expiresOn),'CREDENTIAL_DATE_INVALID','资质起止日期不正确',422);
        }
        if(table==='translatorLanguagePairs'||table==='translatorServiceModes'){
            const role=graph.fact('personRoles',String(row.personRoleId));invariant(role?.roleCode==='translator','TRANSLATOR_ROLE_REQUIRED','语言对与翻译服务方式必须关联翻译职业',422);
            if(table==='translatorLanguagePairs'){
                await this.dictionary(tx,actor,'language',String(row.sourceLanguageCode));await this.dictionary(tx,actor,'language',String(row.targetLanguageCode));
                invariant(row.sourceLanguageCode!==row.targetLanguageCode,'TRANSLATION_DIRECTION_INVALID','翻译源语言与目标语言不能相同',422);
                invariant(!same.some(x=>x.personRoleId===row.personRoleId&&x.sourceLanguageCode===row.sourceLanguageCode&&x.targetLanguageCode===row.targetLanguageCode),'TRANSLATION_PAIR_EXISTS','该方向的语言对已存在',409);
            }else invariant(!same.some(x=>x.personRoleId===row.personRoleId&&x.modeCode===row.modeCode),'TRANSLATION_MODE_EXISTS','该翻译服务方式已存在',409);
        }
        if(table==='mediaCollectionTags')invariant(!same.some(x=>x.collectionId===row.collectionId&&x.tagCode===row.tagCode),'COLLECTION_TAG_EXISTS','此集合已使用该内容标签',409);
    }
    async evidenceFor(tx:Tx,actor:Actor,table:string,row:Record<string,unknown>,fields:string[],sourceId:string,sourceRevision:number,reviewed=false,eventClock:Clock=this.clock){
        const recordedAt=eventClock.now();const evidenceClock:Clock={now:()=>recordedAt};
        for(const field of fields){
            if(field.includes('Ciphertext')||field==='maskedIdentifier')continue;
            const owner=OWNER_KEYS[table];invariant(!!owner,'EVIDENCE_OWNER_INVALID','证据归属类型不正确',422);
            const evidence={...base(actor.workspaceId,evidenceClock),personId:null,[owner]:row.id,fieldPath:field,valueDigest:digest(row[field]??null),sourceId,sourceRevision,
                reviewerId:reviewed?actor.membershipId:null,reviewedAt:reviewed?recordedAt.toISOString():null};
            await tx.insert('evidence',evidence as FieldEvidence);
        }
    }
    async createFact(tx:Tx,actor:Actor,table:FactTable,personId:string,input:unknown){
        talentWrite(actor);const d=FACT_SCHEMAS[table].create.parse(input);legacyFields(d.schemaVersion,table,Object.keys(d.values));if(table==='measurementSets'&&d.schemaVersion==='once-talent-v2.0.0')invariant(d.values.datePrecision!=='UNKNOWN'&&d.values.measuredOn!==null,'TD2_SCHEMA_UPGRADE_REQUIRED','未知量尺日期须使用2.1合同',422);if(table==='talentProfiles'&&d.values.birthDate!=null)requirePermission(actor,'sensitive.write');const p=await this.parent(tx,actor,personId,d.expectedPersonRevision);
        await this.source(tx,actor,d.sourceId,d.sourceRevision);
        const row:FactRow={...base(actor.workspaceId,this.clock),personId,sourceId:d.sourceId,...rowDefaults(table),...d.values};
        if(table==='measurementSets')row.reportedAt=row.createdAt;
        await this.validate(tx,actor,table,row);await insertFact(tx,table,row);
        await this.evidenceFor(tx,actor,table,row,Object.keys(d.values),d.sourceId,d.sourceRevision);
        await this.bump(tx,p);return row;
    }
    async patchFact(tx:Tx,actor:Actor,table:FactTable,id:string,input:unknown){
        talentWrite(actor);const d=FACT_SCHEMAS[table].patch.parse(input);legacyFields(d.schemaVersion,table,Object.keys(d.values));if(table==='measurementSets'&&d.schemaVersion==='once-talent-v2.0.0')invariant(d.values.datePrecision!=='UNKNOWN'&&d.values.measuredOn!==null,'TD2_SCHEMA_UPGRADE_REQUIRED','未知量尺日期须使用2.1合同',422);if(table==='talentProfiles'&&Object.hasOwn(d.values,'birthDate'))requirePermission(actor,'sensitive.write');const row=await rawFact(tx,actor,table,id),p=await this.parent(tx,actor,row.personId,d.expectedPersonRevision);
        cas(row,d.expectedRevision!);await this.source(tx,actor,d.sourceId,d.sourceRevision);
        invariant(Object.keys(d.values).length>0,'EMPTY_UPDATE','没有需要保存的修改',400);
        const graph=await loadTalentGraph(tx,actor,this.clock);invariant(graph.readable(table,row),'FACT_UNAVAILABLE','目标资料不可用',404);
        if(table==='measurementSets')invariant(row.status==='DRAFT','MEASUREMENT_IMMUTABLE','已确认量尺只能新增版本，不能覆盖历史',409);
        invariant(row.sourceId===d.sourceId,'FACT_SOURCE_CONFLICT','不同来源的修改必须先提交字段建议',409);
        const next={...touch(row,this.clock),...d.values};await this.validate(tx,actor,table,next);await replaceFact(tx,table,next);
        await this.evidenceFor(tx,actor,table,next,Object.keys(d.values),d.sourceId,d.sourceRevision);await this.bump(tx,p);return next;
    }
    async get(tx:Tx,actor:Actor,id:string){requirePermission(actor,'records.read');return (await loadTalentGraph(tx,actor,this.clock)).get(id);}
    async schema(tx:Tx,actor:Actor){
        requirePermission(actor,'records.read');
        return {schemaVersion:TALENT_SCHEMA_VERSION,identity:S.personCreate.json,serverFields:{measurementSets:{reportedAt:{type:'string',format:'date-time',nullable:true,readOnly:true}}},legacyVersion:'once-talent-v2.0.0',legacyNewFields:'REJECT',facts:Object.fromEntries(TD2_TABLES.map(t=>[t,{slug:TD2_FACTS[t].slug,ownerKey:TD2_FACTS[t].ownerKey,create:FACT_SCHEMAS[t].create.json,patch:FACT_SCHEMAS[t].patch.json}])),capabilities:await tx.find('capabilityDefinitions',{workspaceId:actor.workspaceId,status:'ACTIVE'}),unknownFields:'REJECT',unknownCodes:'REJECT',conflictAction:'FIELD_PROPOSAL'};
    }
    async organization(tx:Tx,actor:Actor,input:unknown){
        talentWrite(actor);invariant(actor.actorKind!=='MACHINE','HUMAN_OPERATION_REQUIRED','机构建档需要内部成员',403);const d=S.organization.parse(input),source=await this.source(tx,actor,d.sourceId,d.sourceRevision);
        const row={...base(actor.workspaceId,this.clock),sourceId:source.id,scopeId:source.scopeId,name:d.name,kind:d.kind,status:'ACTIVE' as const};await tx.insert('organizations',row);return row;
    }
    async organizations(tx:Tx,actor:Actor,query:Record<string,string>){requirePermission(actor,'records.read');const g=await loadTalentGraph(tx,actor,this.clock);return page(g.rows('organizations').filter(o=>g.organizationReadable(o.id)),query);}
    async registryCreate(tx:Tx,actor:Actor,input:unknown){
        requirePermission(actor,'catalog.manage');invariant(actor.actorKind!=='MACHINE','HUMAN_OPERATION_REQUIRED','字典维护需要内部成员',403);const d=S.registryCreate.parse(input);
        invariant(!(await tx.find('capabilityDefinitions',{workspaceId:actor.workspaceId,code:d.code})).length,'CAPABILITY_CODE_EXISTS','能力代码已存在，不得复用为另一种含义',409);
        for(const roleCode of d.applicableRoleCodes)await this.dictionary(tx,actor,'role',roleCode);
        const row={...base(actor.workspaceId,this.clock),...d,status:'ACTIVE' as const};await tx.insert('capabilityDefinitions',row);return row;
    }
    async registryPatch(tx:Tx,actor:Actor,id:string,input:unknown){
        requirePermission(actor,'catalog.manage');const d=S.registryPatch.parse(input),row=await workspaceRow(tx,'capabilityDefinitions',id,actor.workspaceId);if(!row)missing();cas(row,d.expectedRevision);
        const next=touch(row,this.clock);for(const key of ['labelZh','labelEn','status'] as const)if(d[key]!==undefined)Object.assign(next,{[key]:d[key]});await tx.replace('capabilityDefinitions',next);return next;
    }
    async owner(tx:Tx,actor:Actor,kind:string,id:string){
        if(kind==='person'){const p=await td2PersonFor(tx,actor,id);await sourceFor(tx,actor,p.sourceId,this.clock);return {row:asRow(p),person:p,table:'people' as const};}
        invariant(TD2_TABLES.includes(kind as FactTable),'FACT_KIND_INVALID','资料类型未注册',400);
        const table=kind as FactTable,row=await rawFact(tx,actor,table,id),g=await loadTalentGraph(tx,actor,this.clock);if(!g.readable(table,row))missing();return {row,person:await td2PersonFor(tx,actor,row.personId),table};
    }
    field(kind:string,key:string,patch=false){
        if(kind==='person'){
            const allowed:Record<string,import('./validation.ts').Schema<unknown>>={displayName:importString(120,1),intro:importString(5000),aliases:importStrings()};
            invariant(!!allowed[key],'FIELD_UNREGISTERED','人物字段未注册',422);return allowed[key]!;
        }
        const def=TD2_FACTS[kind as FactTable];invariant(!!def && Object.hasOwn(def.fields,key),'FIELD_UNREGISTERED','字段未在当前资料类型登记',422);
        invariant(!patch||!(def.immutable as readonly string[]).includes(key),'FIELD_IMMUTABLE','该关联或代码不能通过字段建议改写',422);
        return fieldSchema((def.fields as Record<string,string>)[key]!,key);
    }
    async evidenceHistory(tx: Tx, actor: Actor, query: Record<string,string>) {
        humanReview(actor); requirePermission(actor,'records.read'); requirePermission(actor,'sources.read');
        page([],query,['ownerKind','ownerId','fieldPath']);
        const kind=query.ownerKind??'', id=uuid.parse(query.ownerId), field=query.fieldPath??'';if(kind==='talentProfiles'&&field==='birthDate')requirePermission(actor,'sensitive.read');
        invariant(Object.hasOwn(OWNER_KEYS,kind),'FACT_KIND_INVALID','资料类型未注册',400); this.field(kind,field);
        let row: Record<string,unknown>;
        if(kind==='person') { const graph=await loadTalentGraph(tx,actor,this.clock); graph.get(id); row=asRow(await td2PersonFor(tx,actor,id)); }
        else row=(await this.owner(tx,actor,kind,id)).row;
        const entries=await tx.find('evidence',{workspaceId:actor.workspaceId,[OWNER_KEYS[kind]!]:id,fieldPath:field} as never);
        const items=[];
        for(const entry of entries) {
            let source;
            try { source=await sourceFor(tx,actor,entry.sourceId,this.clock,false); }
            catch(error) { if(error instanceof AppError&&error.status===404)continue; throw error; }
            if(source.status==='ERASED')continue;
            const valueMatchesCurrent=entry.valueDigest===digest(row[field]??null), current=sourceCurrent(source,this.clock), revisionMatches=source.revision===entry.sourceRevision;
            items.push({id:entry.id,createdAt:entry.createdAt,fieldPath:entry.fieldPath,valueMatchesCurrent,
                supportsCurrentValue:valueMatchesCurrent&&current&&revisionMatches,
                source:{id:source.id,title:source.title,recordedRevision:entry.sourceRevision,currentRevision:source.revision,current,revisionMatches},
                review:entry.originalReviewWorkspaceId?{origin:'ORIGINAL' as const,workspaceId:entry.originalReviewWorkspaceId,membershipId:entry.originalReviewMembershipId,reviewedAt:entry.originalReviewedAt}
                    :entry.reviewedAt?{origin:'CURRENT' as const,workspaceId:actor.workspaceId,membershipId:entry.reviewerId,reviewedAt:entry.reviewedAt}:null});
        }
        items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
        return page(items,query,['ownerKind','ownerId','fieldPath']);
    }
    async addEvidence(tx:Tx,actor:Actor,input:unknown){
        humanReview(actor);const d=S.evidence.parse(input);if(d.ownerKind==='talentProfiles'&&d.fieldPath==='birthDate')requirePermission(actor,'sensitive.read');const o=await this.owner(tx,actor,d.ownerKind,d.ownerId);cas(o.row as {revision:number},d.expectedRevision);this.field(d.ownerKind,d.fieldPath);
        await this.source(tx,actor,d.sourceId,d.sourceRevision);await this.evidenceFor(tx,actor,d.ownerKind,o.row,[d.fieldPath],d.sourceId,d.sourceRevision,true);return this.bump(tx,o.person);
    }
    async proposal(tx:Tx,actor:Actor,input:unknown){
        if(actor.actorKind==='MACHINE')requirePermission(actor,'talent.propose');else invariant(actor.permissions.includes('records.write')||actor.permissions.includes('sources.review'),'FORBIDDEN','当前账号不能提交字段建议',403);
        const d=S.proposal.parse(input);legacyFields(d.schemaVersion,d.ownerKind,[d.fieldPath]);const o=await this.owner(tx,actor,d.ownerKind,d.ownerId);cas(o.row as {revision:number},d.expectedRevision);
        if(d.ownerKind==='talentProfiles'&&d.fieldPath==='birthDate')requirePermission(actor,'sensitive.write');
        const value=this.field(d.ownerKind,d.fieldPath,true).parse(d.proposedValue);await this.source(tx,actor,d.sourceId,d.sourceRevision);
        const ownerFields=Object.fromEntries(Object.values(OWNER_KEYS).map(k=>[k,null]));
        const row={...base(actor.workspaceId,this.clock),...ownerFields,[OWNER_KEYS[d.ownerKind]!]:d.ownerId,fieldPath:d.fieldPath,proposedValue:value,valueDigest:digest(value),sourceId:d.sourceId,sourceRevision:d.sourceRevision,originType:actor.actorKind==='MACHINE'?'AGENT':'IMPORT',actorId:actor.actorKind==='MACHINE'?null:actor.membershipId,servicePrincipalId:actor.actorKind==='MACHINE'?actor.servicePrincipalId:null,baseRevision:d.expectedRevision,schemaVersion:TALENT_SCHEMA_VERSION,state:'PENDING',decidedAt:null,decidedById:null} as FieldProposal;
        await tx.insert('fieldProposals',row);return row;
    }
    async decide(tx:Tx,actor:Actor,id:string,input:unknown){
        humanReview(actor);requirePermission(actor,'records.write');const d=S.decide.parse(input),row=await workspaceRow(tx,'fieldProposals',id,actor.workspaceId);if(!row)missing();cas(row,d.expectedRevision);
        invariant(row.state==='PENDING','PROPOSAL_CLOSED','建议已经处理',409);
        const pair=Object.entries(OWNER_KEYS).find(([,key])=>asRow(row)[key]);invariant(!!pair,'PROPOSAL_OWNER_INVALID','建议归属关系损坏',503);
        const source=await sourceFor(tx,actor,row.sourceId,this.clock,false);let owner:Awaited<ReturnType<TalentV2['owner']>>|null=null;
        try{owner=await this.owner(tx,actor,pair[0],String(asRow(row)[pair[1]]));}catch(e){if(!(e instanceof AppError && [404,409].includes(e.status)))throw e;}
        // Scope is rechecked before revealing either a stale or a valid proposal.
        if(!owner){const kind=pair[0], raw=kind==='person'?await workspaceRow(tx,'people',String(asRow(row)[pair[1]]),actor.workspaceId):await workspaceRow(tx,kind as FactTable,String(asRow(row)[pair[1]]),actor.workspaceId);if(raw){const p=kind==='person'?raw as Person:await workspaceRow(tx,'people',String(asRow(raw).personId),actor.workspaceId);if(p)await requireScope(tx,actor,p.scopeId);}}
        const graph=await loadTalentGraph(tx,actor,this.clock),stale=!owner||owner.row.revision!==row.baseRevision||source.revision!==row.sourceRevision||!graph.sourceUsable(source.id)||!['once-talent-v2.0.0',TALENT_SCHEMA_VERSION].includes(row.schemaVersion)||digest(row.proposedValue)!==row.valueDigest;
        let state:FieldProposal['state']=stale?'STALE':d.decision==='REJECT'?'REJECTED':'APPLIED';
        if(state==='APPLIED'&&owner){
            if(pair[0]==='talentProfiles'&&row.fieldPath==='birthDate')requirePermission(actor,'sensitive.write');
            const value=this.field(pair[0],row.fieldPath,true).parse(row.proposedValue);
            if(owner.table==='people'){
                const p=touch(owner.person,this.clock);Object.assign(p,{[row.fieldPath]:value});await tx.replace('people',p);await this.evidenceFor(tx,actor,'person',asRow(p),[row.fieldPath],source.id,source.revision,true);
            }else{
                if(owner.table==='measurementSets')invariant(owner.row.status==='DRAFT','MEASUREMENT_IMMUTABLE','已确认量尺不能由建议改写',409);
                const next={...touch(owner.row as FactRow,this.clock),[row.fieldPath]:value};await this.validate(tx,actor,owner.table,next);await replaceFact(tx,owner.table,next);await this.evidenceFor(tx,actor,pair[0],next,[row.fieldPath],source.id,source.revision,true);await this.bump(tx,owner.person);
            }
        }
        const next={...touch(row,this.clock),state,decidedAt:this.clock.now().toISOString(),decidedById:actor.membershipId};await tx.replace('fieldProposals',next);return next;
    }
    async proposals(tx:Tx,actor:Actor,query:Record<string,string>){
        humanReview(actor);page([],query,['personId']);const result:FieldProposal[]=[];
        for(const row of await tx.find('fieldProposals',{workspaceId:actor.workspaceId})){
            try{const pair=Object.entries(OWNER_KEYS).find(([,key])=>asRow(row)[key]);if(!pair)continue;if(pair[0]==='talentProfiles'&&row.fieldPath==='birthDate'&&!actor.permissions.includes('sensitive.read'))continue;const o=await this.owner(tx,actor,pair[0],String(asRow(row)[pair[1]]));await sourceFor(tx,actor,row.sourceId,this.clock,false);if(query.personId&&o.person.id!==query.personId)continue;result.push(row);}catch(e){if(!(e instanceof AppError&&[404,409].includes(e.status)))throw e;}
        }
        return page(result,query,['personId']);
    }
    async heightReviews(tx:Tx,actor:Actor,id:string,query:Record<string,string>){
        humanReview(actor);requirePermission(actor,'records.read');const person=await td2PersonFor(tx,actor,id),source=await sourceFor(tx,actor,person.sourceId,this.clock);
        const rows=(await tx.find('talentMigrationReviews',{workspaceId:actor.workspaceId,personId:id,reason:'HEIGHT_SEMANTICS_REQUIRED'})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
        return {...page(rows.map(row=>({id:row.id,revision:row.revision,state:row.state,resolvedAt:row.resolvedAt})),query),personId:id,personRevision:person.revision,sourceRevision:source.revision,legacyHeightCm:person.heightCm,canDismiss:actor.permissions.includes('records.write')&&person.status!=='ARCHIVED'};
    }
    async dismissHeightReview(tx:Tx,actor:Actor,id:string,input:unknown){
        humanReview(actor);requirePermission(actor,'records.write');const d=S.heightReviewDismiss.parse(input);invariant(d.acknowledge,'EXPLICIT_CONFIRMATION_REQUIRED','请明确确认不采用旧身高记录',422);
        const row=await workspaceRow(tx,'talentMigrationReviews',id,actor.workspaceId);if(!row||row.reason!=='HEIGHT_SEMANTICS_REQUIRED')missing();
        const person=await this.parent(tx,actor,row.personId,d.expectedPersonRevision);await this.source(tx,actor,person.sourceId,d.sourceRevision);cas(row,d.expectedRevision);invariant(row.state==='PENDING','MIGRATION_REVIEW_DECIDED','这项复核已经处理',409);
        const next={...touch(row,this.clock),state:'RESOLVED' as const,resolvedAt:this.clock.now().toISOString(),resolvedById:actor.membershipId};await tx.replace('talentMigrationReviews',next);await this.bump(tx,person);return next;
    }
    async confirm(tx:Tx,actor:Actor,table:'measurementSets'|'personExternalRefs'|'personCredentials',id:string,input:unknown){
        humanReview(actor);requirePermission(actor,'records.write');const d=S.factConfirm.parse(input),row=await rawFact(tx,actor,table,id),p=await this.parent(tx,actor,row.personId,d.expectedPersonRevision);cas(row,d.expectedRevision);
        const source=await this.source(tx,actor,row.sourceId,d.sourceRevision);invariant(source.status==='CONFIRMED','CONFIRMED_SOURCE_REQUIRED','核验操作需要已确认的依据来源',409);
        const next=touch(row,this.clock);
        if(table==='measurementSets'){
            invariant(row.status==='DRAFT','MEASUREMENT_IMMUTABLE','量尺已经确认或被历史版本替代',409);next.status='CONFIRMED';
            if(row.supersedesId){const old=await rawFact(tx,actor,table,String(row.supersedesId));await replaceFact(tx,table,{...touch(old,this.clock),status:'SUPERSEDED'});}
            const casting=(await tx.find('castingProfiles',{workspaceId:actor.workspaceId,personId:p.id}))[0];
            invariant(!!casting,'CASTING_PROFILE_REQUIRED','请先建立选角档案',409);
            await tx.replace('castingProfiles',{...touch(casting,this.clock),currentMeasurementSetId:id});
            // Shoe/clothing-only confirmation does not establish the semantics of an old height.
            if(typeof row.heightCm==='number') for(const review of await tx.find('talentMigrationReviews',{workspaceId:actor.workspaceId,personId:p.id,reason:'HEIGHT_SEMANTICS_REQUIRED',state:'PENDING'}))await tx.replace('talentMigrationReviews',{...touch(review,this.clock),state:'RESOLVED',resolvedAt:this.clock.now().toISOString(),resolvedById:actor.membershipId});
        }else if(table==='personExternalRefs'){invariant(row.state==='OBSERVED','EXTERNAL_REF_STATE','此标识不能重复核验',409);next.state='VERIFIED';next.verifiedAt=this.clock.now().toISOString();}
        else{invariant(row.status==='UNVERIFIED','CREDENTIAL_STATE','资质已经核验或已撤销',409);invariant(!!row.evidenceAssetId&&(await loadTalentGraph(tx,actor,this.clock)).assetReadable(String(row.evidenceAssetId)),'CREDENTIAL_EVIDENCE_REQUIRED','资质核验需要可用的证明材料',422);next.status='VERIFIED';}
        await replaceFact(tx,table,next);await this.bump(tx,p);return next;
    }
    async adultVerify(tx:Tx,actor:Actor,id:string,input:unknown){
        humanReview(actor);requirePermission(actor,'records.write');const d=S.adultVerify.parse(input),row=await rawFact(tx,actor,'adultEligibilities',id),p=await this.parent(tx,actor,row.personId,d.expectedPersonRevision);cas(row,d.expectedRevision);
        const source=await this.source(tx,actor,row.sourceId,d.sourceRevision);invariant(source.status==='CONFIRMED','CONFIRMED_SOURCE_REQUIRED','成年核验需要已确认的来源',409);
        invariant((await loadTalentGraph(tx,actor,this.clock)).assetReadable(d.evidenceAssetId),'AGE_EVIDENCE_REQUIRED','成年核验需要可访问的明确证明材料，不能根据头像推断',422);
        invariant(Date.parse(d.validUntil)>this.clock.now().getTime()&&Date.parse(d.validUntil)<=Date.parse(source.validUntil),'ELIGIBILITY_VALIDITY_INVALID','核验有效期必须在依据来源的有效期以内',422);
        const verifiedAt=this.clock.now();const eventClock:Clock={now:()=>verifiedAt};
        const next={...touch(row,eventClock),state:'VERIFIED_ADULT',originalVerificationWorkspaceId:null,originalVerificationMembershipId:null,verifiedAt:verifiedAt.toISOString(),verifiedByMembershipId:actor.membershipId,evidenceAssetId:d.evidenceAssetId,validUntil:d.validUntil};
        await replaceFact(tx,'adultEligibilities',next);await this.evidenceFor(tx,actor,'adultEligibilities',next,['state','validUntil','evidenceAssetId'],source.id,source.revision,true,eventClock);await this.bump(tx,p);return next;
    }
    async collectionMutation(tx:Tx,actor:Actor,id:string,input:unknown,action:'ADD'|'REMOVE'|'ORDER'){
        talentWrite(actor);requirePermission(actor,'assets.read');const d=(action==='ADD'?S.collectionAdd:action==='REMOVE'?S.collectionRemove:S.collectionOrder).parse(input);
        const row=await rawFact(tx,actor,'mediaCollections',id),p=await this.parent(tx,actor,row.personId,d.expectedPersonRevision);cas(row,d.expectedRevision);const g=await loadTalentGraph(tx,actor,this.clock);invariant(g.usable('mediaCollections',row),'COLLECTION_UNAVAILABLE','媒体集合不可用',409);
        const items=(await tx.find('mediaCollectionItems',{workspaceId:actor.workspaceId,collectionId:id})).sort((a,b)=>a.orderIndex-b.orderIndex);
        if(action==='ADD'&&'assetId' in d){
            invariant(g.assetReadable(d.assetId),'ASSET_UNAVAILABLE','媒体不可用',422);invariant(!items.some(i=>i.assetId===d.assetId),'COLLECTION_ASSET_EXISTS','此媒体已在集合内',409);invariant(items.length<200,'COLLECTION_LIMIT','单集合最多收纳200个媒体',422);
            await tx.insert('mediaCollectionItems',{...base(actor.workspaceId,this.clock),personId:p.id,collectionId:id,assetId:d.assetId,orderIndex:items.length,caption:d.caption??'',featured:d.featured??false});
        }else if(action==='REMOVE'&&'itemId' in d){invariant(items.some(i=>i.id===d.itemId),'COLLECTION_ITEM_MISSING','此集合中没有该媒体条目',404);await tx.remove('mediaCollectionItems',d.itemId);let n=0;for(const item of items.filter(i=>i.id!==d.itemId))await tx.replace('mediaCollectionItems',{...touch(item,this.clock),orderIndex:n++});}
        else if('itemIds' in d){invariant(d.itemIds.length===items.length&&new Set(d.itemIds).size===items.length&&items.every(i=>d.itemIds.includes(i.id)),'COLLECTION_ORDER_INVALID','排序必须完整包含本集合的全部媒体条目',422);for(const item of items)await tx.replace('mediaCollectionItems',{...touch(item,this.clock),orderIndex:d.itemIds.indexOf(item.id)});}
        const next=touch(row,this.clock);await replaceFact(tx,'mediaCollections',next);await this.bump(tx,p);return next;
    }
    async clearCredentialSecret(tx:Tx,actor:Actor,id:string,input:unknown){
        invariant(actor.actorKind!=='MACHINE','HUMAN_REVIEW_REQUIRED','受限编号清除需要内部成员确认',403);talentWrite(actor);requirePermission(actor,'sensitive.write');const d=S.credentialSecretClear.parse(input);invariant(d.acknowledge,'EXPLICIT_CONFIRMATION_REQUIRED','请明确确认清除受限编号',422);
        const row=await rawFact(tx,actor,'personCredentials',id),person=await this.parent(tx,actor,row.personId,d.expectedPersonRevision);cas(row,d.expectedRevision);await this.source(tx,actor,row.sourceId,d.sourceRevision);
        const next={...touch(row,this.clock),identifierCiphertext:null,maskedIdentifier:null};await replaceFact(tx,'personCredentials',next);await this.bump(tx,person);return next;
    }
    async credentialSecret(tx:Tx,actor:Actor,id:string,input:unknown){
        talentWrite(actor);requirePermission(actor,'sensitive.write');const d=S.credentialSecret.parse(input),row=await rawFact(tx,actor,'personCredentials',id),p=await this.parent(tx,actor,row.personId,d.expectedPersonRevision);cas(row,d.expectedRevision);await sourceFor(tx,actor,row.sourceId,this.clock);
        const next={...touch(row,this.clock),identifierCiphertext:encryptContact(d.identifier,this.config.contactKey,`credential:${actor.workspaceId}:${id}`),maskedIdentifier:'***'+d.identifier.slice(-4)};await replaceFact(tx,'personCredentials',next);await this.bump(tx,p);return next;
    }
    async revokeFact(tx:Tx,actor:Actor,table:'personExternalRefs'|'personCredentials',id:string,input:unknown){
        humanReview(actor);requirePermission(actor,'records.write');const d=S.factConfirm.parse(input),row=await rawFact(tx,actor,table,id),p=await this.parent(tx,actor,row.personId,d.expectedPersonRevision);cas(row,d.expectedRevision);await this.source(tx,actor,row.sourceId,d.sourceRevision);const next={...touch(row,this.clock),[table==='personExternalRefs'?'state':'status']:'REVOKED'};await replaceFact(tx,table,next);await this.bump(tx,p);return next;
    }
    async resolve(tx:Tx,actor:Actor,query:Record<string,string>){
        requirePermission(actor,'records.read');page([],query,['providerCode','namespaceCode','issuerOrganizationId','externalKey']);
        const def=valuesSchema('personExternalRefs').parse({providerCode:query.providerCode,namespaceCode:query.namespaceCode??'',externalKey:query.externalKey,...(query.issuerOrganizationId?{issuerOrganizationId:query.issuerOrganizationId}:{})});
        const g=await loadTalentGraph(tx,actor,this.clock),row=g.rows('personExternalRefs').find(x=>x.providerCode===def.providerCode&&x.namespaceCode===def.namespaceCode&&x.externalKey===def.externalKey&&x.issuerOrganizationId===(def.issuerOrganizationId??null)&&x.state==='VERIFIED'&&g.usable('personExternalRefs',x as unknown as FactRow));
        if(!row)missing();return {personId:row.personId,externalRefId:row.id,schemaVersion:TALENT_SCHEMA_VERSION};
    }
}
import { v } from './validation.ts';
const importString=(max:number,min=0)=>v.string(max,min);
const importStrings=()=>v.array(v.string(120,1),20);
