import type { Actor, Clock } from './model.ts';
import type { Tx } from './store.ts';
import { invariant, AppError } from './errors.ts';
import { page } from './helpers.ts';
import { requirePermission } from './policy.ts';
import { v, code } from './validation.ts';
import { loadTalentGraph, asRow } from './talent-v2-graph.ts';
import { type FactRow } from './talent-v2-schema.ts';
export const TD2_SEARCH_KEYS=['q','mode','role','capability','language','languageLevel','location','locationRelation','collectionType','collectionTag','translationSource','translationTarget','translationMode','credentialType','adultState','heightMin','heightMax','industryCode','workTypeCode','actualProject','status'] as const;
export async function searchTalentV2(tx:Tx,actor:Actor,clock:Clock,query:Record<string,string>){
    requirePermission(actor,'records.read');page([],query,[...TD2_SEARCH_KEYS]);
    if(query.q!==undefined)v.string(160).parse(query.q);
    for(const key of ['role','capability','language','location','translationSource','translationTarget','industryCode','workTypeCode'])if(query[key]!==undefined)code.parse(query[key]);
    const enums:Record<string,readonly string[]>={mode:['ALL','TALENT','CONTACT'],locationRelation:['BASE','SERVICE'],languageLevel:['BASIC','WORKING','PROFESSIONAL','FLUENT','NATIVE'],adultState:['UNKNOWN','SELF_DECLARED_ADULT','VERIFIED_ADULT','RESTRICTED'],actualProject:['true','false'],status:['DRAFT','ACTIVE','ARCHIVED'],collectionType:['MODEL_CARD','POLAROIDS','PORTFOLIO','SHOWREEL','INTRO_VIDEO','OTHER'],collectionTag:['FASHION','BEAUTY','COMMERCIAL','LINGERIE','RUNWAY','LIFESTYLE','INDUSTRIAL','PRODUCT'],translationMode:['BUSINESS_MEETING','ON_SET','ESCORT','CONSECUTIVE','SIMULTANEOUS','WRITTEN'],credentialType:['DRONE_LICENSE','TRANSLATION_CERTIFICATE','DIVING_CERTIFICATE','EQUIPMENT_CERTIFICATE','OTHER']};
    for(const [key,values]of Object.entries(enums))if(query[key]!==undefined)v.enum(values).parse(query[key]);
    invariant(!query.locationRelation || !!query.location, 'LOCATION_REQUIRED', '地点关系筛选必须同时选择地点', 400);
    invariant(!query.languageLevel||!!query.language,'LANGUAGE_REQUIRED','语言等级筛选必须同时选择语言',400);
    invariant(!query.translationSource===!query.translationTarget,'TRANSLATION_PAIR_REQUIRED','翻译筛选必须同时选择源语言和目标语言',400);
    const min=query.heightMin===undefined?null:Number(query.heightMin),max=query.heightMax===undefined?null:Number(query.heightMax);
    for(const x of [min,max])if(x!==null)v.number(40,260,false).parse(x);invariant(min===null||max===null||min<=max,'HEIGHT_RANGE_INVALID','身高范围不正确',400);
    const g=await loadTalentGraph(tx,actor,clock),items:Record<string,unknown>[]=[];
    const current=(facts:Record<string,Record<string,unknown>[]>,table:string)=>(facts[table]??[]).filter(r=>r.usable===true);
    const ranks=['BASIC','WORKING','PROFESSIONAL','FLUENT','NATIVE'];
    for(const person of g.rows('people')){
        if(!g.identityReadable(person)||person.status==='ARCHIVED'&&!query.status)continue;
        let view:ReturnType<typeof g.get>;try{view=g.get(person.id);}catch(e){if(e instanceof AppError&&e.status===404)continue;throw e;}
        const facts=view.facts as Record<string,Record<string,unknown>[]>,roles=current(facts,'personRoles'),languages=current(facts,'personLanguages'),locations=current(facts,'talentLocations');
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
        const visibleWorks=g.rows('workCredits').filter(c=>c.personId===person.id&&(!query.role||c.roleCode===query.role)).map(c=>g.rows('works').find(w=>w.id===c.workId)).filter(w=>!!w&&g.visibility.scopeVisible(w.scopeId)&&g.sourceUsable(w.sourceId)&&!g.visibility.blocked('WORK',w.id)&&w.status!=='ERASED');
        // Combined filters describe ONE credited work in the selected occupation, not unrelated works.
        if((query.industryCode||query.workTypeCode)&&!visibleWorks.some(w=>(!query.industryCode||w?.industryCode===query.industryCode)
            &&(!query.workTypeCode||w?.workTypeCodes.includes(query.workTypeCode))))continue;
        const projects=g.rows('projectParticipants').filter(r=>r.personId===person.id&&r.state==='ACTUAL'&&(!query.role||r.roleCode===query.role)).map(r=>g.rows('projects').find(p=>p.id===r.projectId)).filter(p=>!!p&&g.visibility.scopeVisible(p.scopeId)&&g.sourceUsable(p.sourceId)&&!g.visibility.blocked('PROJECT',p.id)&&p.status!=='ERASED');
        if(query.actualProject&&!!projects.length!==(query.actualProject==='true'))continue;
        items.push({...g.personHeader(person),isTalent:view.isTalent,roles:roles.map(r=>({id:r.id,roleCode:r.roleCode,revision:r.revision})),languages:languages.map(r=>({languageCode:r.languageCode,speakingLevelCode:r.speakingLevelCode})),locations:locations.map(r=>({locationCode:r.locationCode,relationCode:r.relationCode})),heightCm:typeof height==='number'?height:null,adultState:view.adultState,collectionCount:collections.length,matchedBy:Object.entries(query).filter(([key])=>!(key==='page'||key==='pageSize')).map(([field,value])=>({field,value}))});
    }
    items.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))||String(a.id).localeCompare(String(b.id)));
    const counts=(field:string,key:string)=>{const result:Record<string,number>=Object.create(null);for(const item of items){const codes=new Set((item[field] as Record<string,unknown>[]).map(x=>String(x[key])));for(const c of codes)result[c]=(result[c]??0)+1;}return result;};
    return {...page(items,query,[...TD2_SEARCH_KEYS]),schemaVersion:'once-talent-v2.0.0',facets:{roles:counts('roles','roleCode'),languages:counts('languages','languageCode'),locations:counts('locations','locationCode')},selectionRule:'VISIBLE_FACTS_ONLY'};
}
