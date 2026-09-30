import type { Actor, Clock } from './model.ts';
import type { Tx } from './store.ts';
import { invariant, AppError } from './errors.ts';
import { page } from './helpers.ts';
import { requirePermission } from './policy.ts';
import { v, code } from './validation.ts';
import { loadTalentGraph, asRow } from './talent-v2-graph.ts';
import { type FactRow } from './talent-v2-schema.ts';
export const TD2_SEARCH_KEYS=['q','mode','role','capability','language','languageLevel','location','locationRelation','collectionType','collectionTag','translationSource','translationTarget','translationMode','credentialType','adultState','heightMin','heightMax','industryCode','workTypeCode','actualProject','status','gender','nationality','market','experience','style','service','ageMin','ageMax','ageUnknown'] as const;
export async function searchTalentV2(tx:Tx,actor:Actor,clock:Clock,query:Record<string,string>,options?:{graph?:Awaited<ReturnType<typeof loadTalentGraph>>;all?:boolean;facets?:boolean}):Promise<Record<string,any>>{
    requirePermission(actor,'records.read');page([],query,[...TD2_SEARCH_KEYS]);
    if(query.q!==undefined)v.string(160).parse(query.q);
    for(const key of ['role','capability','language','location','translationSource','translationTarget','industryCode','workTypeCode'])if(query[key]!==undefined)code.parse(query[key]);
    const enums:Record<string,readonly string[]>={mode:['ALL','TALENT','CONTACT'],locationRelation:['BASE','SERVICE'],languageLevel:['BASIC','WORKING','PROFESSIONAL','FLUENT','NATIVE'],adultState:['UNKNOWN','SELF_DECLARED_ADULT','VERIFIED_ADULT','RESTRICTED'],actualProject:['true','false'],gender:['FEMALE','MALE','NON_BINARY','OTHER','UNKNOWN'],market:['DOMESTIC','INTERNATIONAL','UNCLASSIFIED'],experience:['AMATEUR','PROFESSIONAL','UNSPECIFIED'],ageUnknown:['true'],status:['DRAFT','ACTIVE','ARCHIVED'],collectionType:['MODEL_CARD','POLAROIDS','PORTFOLIO','SHOWREEL','INTRO_VIDEO','OTHER'],collectionTag:['FASHION','BEAUTY','COMMERCIAL','LINGERIE','RUNWAY','LIFESTYLE','INDUSTRIAL','PRODUCT'],translationMode:['BUSINESS_MEETING','ON_SET','ESCORT','CONSECUTIVE','SIMULTANEOUS','WRITTEN'],credentialType:['DRONE_LICENSE','TRANSLATION_CERTIFICATE','DIVING_CERTIFICATE','EQUIPMENT_CERTIFICATE','OTHER']};
    for(const [key,values]of Object.entries(enums))if(query[key]!==undefined)v.enum(values).parse(query[key]);
    invariant(!query.locationRelation || !!query.location, 'LOCATION_REQUIRED', '地点关系筛选必须同时选择地点', 400);
    invariant(!query.languageLevel||!!query.language,'LANGUAGE_REQUIRED','语言等级筛选必须同时选择语言',400);
    invariant(!query.translationSource===!query.translationTarget,'TRANSLATION_PAIR_REQUIRED','翻译筛选必须同时选择源语言和目标语言',400);
    const min=query.heightMin===undefined?null:Number(query.heightMin),max=query.heightMax===undefined?null:Number(query.heightMax);
    for(const x of [min,max])if(x!==null)v.number(40,260,false).parse(x);invariant(min===null||max===null||min<=max,'HEIGHT_RANGE_INVALID','身高范围不正确',400);
    for(const key of ['style','service'])if(query[key]!==undefined)code.parse(query[key]);
    if(query.nationality!==undefined)v.string(2,2,/^[A-Z]{2}$/).parse(query.nationality);
    const ageMin=query.ageMin===undefined?null:Number(query.ageMin),ageMax=query.ageMax===undefined?null:Number(query.ageMax);for(const x of [ageMin,ageMax])if(x!==null)v.number(0,130).parse(x);invariant(ageMin==null||ageMax==null||ageMin<=ageMax,'AGE_RANGE_INVALID','年龄范围不正确',400);invariant(!query.ageUnknown||ageMin==null&&ageMax==null,'AGE_FILTER_CONFLICT','未知年龄不能同时选择年龄范围',400);
    const g=options?.graph??await loadTalentGraph(tx,actor,clock),items:Record<string,unknown>[]=[];
    const current=(facts:Record<string,Record<string,unknown>[]>,table:string)=>(facts[table]??[]).filter(r=>r.usable===true);
    const ranks=['BASIC','WORKING','PROFESSIONAL','FLUENT','NATIVE'];
    for(const person of g.rows('people')){
        if(!g.identityReadable(person)||person.status==='ARCHIVED'&&!query.status)continue;
        let view:ReturnType<typeof g.get>;try{view=g.get(person.id);}catch(e){if(e instanceof AppError&&e.status===404)continue;throw e;}
        const facts=view.facts as Record<string,Record<string,unknown>[]>,roles=current(facts,'personRoles'),languages=current(facts,'personLanguages'),locations=current(facts,'talentLocations');
        const demographics=current(facts,'talentProfiles')[0],modelRoles=roles.filter(r=>r.roleCode==='model'&&(!query.role||r.roleCode===query.role));
        const available=(r:Record<string,unknown>|undefined,key:string)=>!!r&&!(r.unavailableFields as string[]??[]).includes(key);
        if(query.gender&&(!available(demographics,'genderCode')||(demographics?.genderCode??'UNKNOWN')!==query.gender))continue;
        if(query.nationality&&(!available(demographics,'nationalityCodes')||!(demographics?.nationalityCodes as string[]??[]).includes(query.nationality)))continue;
        if(query.ageUnknown&&(!available(demographics,'birthPrecision')||demographics?.birthPrecision!=='UNKNOWN'))continue;
        if((ageMin!=null||ageMax!=null)&&(!view.ageRange||ageMin!=null&&view.ageRange.min<ageMin||ageMax!=null&&view.ageRange.max>ageMax))continue;
        if((query.market||query.experience)&&!modelRoles.some(r=>(!query.market||available(r,'castingMarketCode')&&(r.castingMarketCode??'UNCLASSIFIED')===query.market)&&(!query.experience||available(r,'experienceCode')&&(r.experienceCode??'UNSPECIFIED')===query.experience)))continue;
        if((query.style||query.service)&&!roles.some(r=>(!query.role||r.roleCode===query.role)&&(!query.style||(r.styleCodes as string[]??[]).includes(query.style))&&(!query.service||(r.serviceCodes as string[]??[]).includes(query.service))))continue;
        const selectedRoles=roles.filter(r=>!query.role||r.roleCode===query.role);
        if(query.role&&!selectedRoles.length)continue;
        if(query.mode==='TALENT'&&!view.isTalent||query.mode==='CONTACT'&&view.isTalent)continue;
        if(query.q&&!String(view.displayName+' '+view.intro+' '+view.aliases.join(' ')).toLocaleLowerCase().includes(query.q.toLocaleLowerCase()))continue;
        if(query.status&&person.status!==query.status)continue;
        const roleMatches=(r:Record<string,unknown>)=>!query.role||!r.personRoleId||selectedRoles.some(role=>role.id===r.personRoleId);
        if(query.capability&&!current(facts,'personCapabilities').some(r=>r.capabilityCode===query.capability&&roleMatches(r)))continue;
        if(query.language&&!languages.some(r=>r.languageCode===query.language&&(!query.languageLevel||r.speakingLevelCode!==null&&ranks.indexOf(String(r.speakingLevelCode))>=ranks.indexOf(query.languageLevel))))continue;
        if(query.location&&!locations.some(r=>r.locationCode===query.location&&(!query.locationRelation||r.relationCode===query.locationRelation)))continue;
        if(query.adultState&&view.adultState!==query.adultState)continue;
        const casting=current(facts,'castingProfiles')[0],measurement=casting?current(facts,'measurementSets').find(r=>r.id===casting.currentMeasurementSetId):undefined;
        const height=measurement?.heightCm;
        if((min!==null||max!==null)&&(typeof height!=='number'||min!==null&&height<min||max!==null&&height>max))continue;
        const collections=current(facts,'mediaCollections').filter(roleMatches);
        if(query.collectionType&&!collections.some(r=>r.collectionTypeCode===query.collectionType))continue;
        if(query.collectionTag&&!current(facts,'mediaCollectionTags').some(r=>r.tagCode===query.collectionTag&&collections.some(c=>c.id===r.collectionId&&(!query.collectionType||c.collectionTypeCode===query.collectionType))))continue;
        const pairs=current(facts,'translatorLanguagePairs').filter(roleMatches),modes=current(facts,'translatorServiceModes').filter(roleMatches);
        if(query.translationSource&&!pairs.some(r=>r.sourceLanguageCode===query.translationSource&&r.targetLanguageCode===query.translationTarget&&(!query.translationMode||modes.some(m=>m.personRoleId===r.personRoleId&&m.modeCode===query.translationMode))))continue;
        if(query.translationMode&&!modes.some(r=>r.modeCode===query.translationMode))continue;
        if(query.credentialType&&!current(facts,'personCredentials').some(r=>r.credentialTypeCode===query.credentialType&&roleMatches(r)))continue;
        const visibleWorks=g.personRows('workCredits',person.id).filter(c=>!query.role||c.roleCode===query.role).map(c=>g.record('works',c.workId)).filter(w=>!!w&&g.visibility.scopeVisible(w.scopeId)&&g.sourceUsable(w.sourceId)&&!g.visibility.blocked('WORK',w.id)&&w.status!=='ERASED');
        // Combined filters describe ONE credited work in the selected occupation, not unrelated works.
        if((query.industryCode||query.workTypeCode)&&!visibleWorks.some(w=>(!query.industryCode||w?.industryCode===query.industryCode)
            &&(!query.workTypeCode||w?.workTypeCodes.includes(query.workTypeCode))))continue;
        const projects=g.personRows('projectParticipants',person.id).filter(r=>r.state==='ACTUAL'&&(!query.role||r.roleCode===query.role)).map(r=>g.record('projects',r.projectId)).filter(p=>!!p&&g.visibility.scopeVisible(p.scopeId)&&g.sourceUsable(p.sourceId)&&!g.visibility.blocked('PROJECT',p.id)&&p.status!=='ERASED');
        if(query.actualProject&&!!projects.length!==(query.actualProject==='true'))continue;
        items.push({...g.personHeader(person),isTalent:view.isTalent,genderCode:demographics?.genderCode??null,nationalityCodes:demographics?.nationalityCodes??[],ageRange:view.ageRange,coverAssetId:demographics?.coverAssetId??null,roles:roles.map(r=>({id:r.id,roleCode:r.roleCode,revision:r.revision,castingMarketCode:r.castingMarketCode??'UNCLASSIFIED',experienceCode:r.experienceCode??'UNSPECIFIED',styleCodes:r.styleCodes??[],serviceCodes:r.serviceCodes??[]})),languages:languages.map(r=>({languageCode:r.languageCode,speakingLevelCode:r.speakingLevelCode})),locations:locations.map(r=>({locationCode:r.locationCode,relationCode:r.relationCode})),heightCm:typeof height==='number'?height:null,adultState:view.adultState,collectionCount:collections.length,matchedBy:Object.entries(query).filter(([key])=>!(key==='page'||key==='pageSize')).map(([field,value])=>({field,value}))});
    }
    items.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))||String(a.id).localeCompare(String(b.id)));
    const counts=(field:string,key:string)=>{const result:Record<string,number>=Object.create(null);for(const item of items){const codes=new Set((item[field] as Record<string,unknown>[]).filter(r=>!['castingMarketCode','experienceCode'].includes(key)||r.roleCode==='model').map(x=>String(x[key])));for(const c of codes)result[c]=(result[c]??0)+1;}return result;};
    const scalarCounts=(field:string)=>{const result:Record<string,number>={};for(const item of items){const code=String(item[field]??'UNKNOWN');result[code]=(result[code]??0)+1;}return result;};
    const facets={genders:scalarCounts('genderCode'),markets:counts('roles','castingMarketCode'),experiences:counts('roles','experienceCode'),roles:counts('roles','roleCode'),languages:counts('languages','languageCode'),locations:counts('locations','locationCode')};
    if(options?.facets)for(const [dimension,keys] of [['genders',['gender']],['markets',['market']],['experiences',['experience']],['roles',['role']],['languages',['language','languageLevel']],['locations',['location','locationRelation']]] as const){const rest={...query};for(const key of keys)delete rest[key];const reference=await searchTalentV2(tx,actor,clock,rest,{graph:g,all:true});facets[dimension]=reference.facets[dimension];}
    return {...(options?.all?{items,total:items.length}:page(items,query,[...TD2_SEARCH_KEYS])),schemaVersion:'once-talent-v2.1.0',facets,selectionRule:'VISIBLE_FACTS_ONLY'};
}
