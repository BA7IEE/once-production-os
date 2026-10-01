import {formalRelationReadable} from './formal-media-policy.ts';
import {mediaUsage} from './media-model.ts';
import { ageRange, PROFILE_DEFAULTS, ROLE_DEFAULTS } from './talent-demographics.ts';
import type { Actor, Clock, Person, Source, Table, TableMap } from './model.ts';
import type { Tx } from './store.ts';
import { invariant, missing } from './errors.ts';
import { digest } from './json.ts';
import { requireScope, deletionBlocked, personAliasFor } from './policy.ts';
import { workspaceRow } from './helpers.ts';
import { loadVisibility } from './visibility.ts';
import { TD2_FACTS, TD2_TABLES, OWNER_KEYS, type FactRow, type FactTable } from './talent-v2-schema.ts';

/** Identity access is separate from the availability of any one source of professional facts. */
export async function td2PersonFor(tx:Tx, actor:Actor, id:string):Promise<Person>{
    const row=await workspaceRow(tx,'people',id,actor.workspaceId);
    if(!row || row.status==='ERASED') missing();
    await requireScope(tx,actor,row.scopeId);
    if(await deletionBlocked(tx,actor.workspaceId,'PERSON',id)) missing();
    invariant(!(await personAliasFor(tx,actor.workspaceId,id)), 'MERGED_ID_READ_ONLY','该人物已合并，请使用主档案',409);
    return row;
}
export function periodCurrent(row:Record<string,unknown>,clock:Clock):boolean{
    const now=clock.now().getTime();
    return (!row.validFrom || Date.parse(String(row.validFrom))<=now) && (!row.validUntil || Date.parse(String(row.validUntil))>now);
}
export async function rawFact(tx:Tx,actor:Actor,table:FactTable,id:string):Promise<FactRow>{
    const row=await workspaceRow(tx,table,id,actor.workspaceId);
    if(!row) missing();
    await td2PersonFor(tx,actor,row.personId);
    return row as unknown as FactRow;
}
export const asRow = (row:unknown):Record<string,unknown>=>row as Record<string,unknown>;
export async function insertFact(tx:Tx,table:FactTable,row:FactRow){await tx.insert(table,row as unknown as TableMap[FactTable]);}
export async function replaceFact(tx:Tx,table:FactTable,row:FactRow){await tx.replace(table,row as unknown as TableMap[FactTable]);}

/** A single bounded snapshot feeds detail, search, facets, shortlists and export projections. */
export async function loadTalentGraph(tx:Tx,actor:Actor,clock:Clock,personIds?:string[]){
    const visibility=await loadVisibility(tx,actor,clock);
    const tables=[...TD2_TABLES,'people','organizations','capabilityDefinitions','mediaCollectionItems','personMedia','assets','evidence','personAliases','deletionRequests','workCredits','works','projectParticipants','projects','dictionary'] as const;
    const data:Partial<Record<Table,unknown[]>>={};
    for(const table of tables){
        let rows:TableMap[typeof table][];
        if(!personIds)rows=await tx.find(table,{workspaceId:actor.workspaceId});
        else if(table==='people')rows=await tx.findIn('people',actor.workspaceId,'id',personIds);
        else if((TD2_TABLES as readonly string[]).includes(table)||['mediaCollectionItems','workCredits','projectParticipants'].includes(table))rows=await tx.findIn(table,actor.workspaceId,'personId' as never,personIds);
        else if(table==='assets'){const refs=new Set<string>();for(const t of TD2_TABLES)for(const r of data[t]??[])for(const key of ['coverAssetId','evidenceAssetId'])if(asRow(r)[key])refs.add(String(asRow(r)[key]));for(const r of data.mediaCollectionItems??[])refs.add(String(asRow(r).assetId));rows=await tx.findIn('assets',actor.workspaceId,'id',[...refs]);}
        else if(table==='evidence'){const entries=await tx.findIn('evidence',actor.workspaceId,'personId',personIds);for(const t of TD2_TABLES)entries.push(...await tx.findIn('evidence',actor.workspaceId,TD2_FACTS[t].ownerKey as never,(data[t]??[]).map(r=>String(asRow(r).id))));rows=entries;}
        else if(table==='works')rows=await tx.findIn('works',actor.workspaceId,'id',(data.workCredits??[]).map(r=>String(asRow(r).workId)));
        else if(table==='projects')rows=await tx.findIn('projects',actor.workspaceId,'id',(data.projectParticipants??[]).map(r=>String(asRow(r).projectId)));
        else rows=await tx.find(table,{workspaceId:actor.workspaceId});
        invariant(rows.length<=50000,'TD2_DATASET_LIMIT','当前资料规模超出单次查询范围，需要缩小工作空间',503);
        data[table]=rows;
    }
    if(personIds){const refs=new Set<string>();for(const r of data.representations??[])if(asRow(r).agentPersonId)refs.add(String(asRow(r).agentPersonId));for(const r of [...data.assets??[],...(data.personMedia??[]).filter(r=>(data.assets??[]).some(a=>asRow(a).id===asRow(r).assetId))])if(asRow(r).personId)refs.add(String(asRow(r).personId));data.people=[...(data.people??[]),...await tx.findIn('people',actor.workspaceId,'id',[...refs].filter(id=>!personIds.includes(id)))];}
    const rows=<K extends Table>(t:K)=> (data[t]??[]) as TableMap[K][];
    // Transaction-local indexes keep the existing snapshot and authorization rules;
    // they do not cache a result across requests or bypass source/evidence checks.
    const byId=new Map<Table,Map<string,unknown>>(),byPerson=new Map<Table,Map<string,unknown[]>>();
    for(const table of tables){
        byId.set(table,new Map(rows(table).map(row=>[row.id,row])));
        const owners=new Map<string,unknown[]>();for(const row of rows(table)){const id=asRow(row).personId;if(typeof id==='string'){const group=owners.get(id)??[];group.push(row);owners.set(id,group);}}byPerson.set(table,owners);
    }
    const record=<K extends Table>(table:K,id:string)=>byId.get(table)?.get(id) as TableMap[K]|undefined;
    const personRows=<K extends Table>(table:K,id:string)=>(byPerson.get(table)?.get(id)??[]) as TableMap[K][];
    const evidenceOwners=new Map<string,TableMap['evidence'][]>(),evidenceFields=new Map<string,TableMap['evidence'][]>();
    for(const evidence of rows('evidence'))for(const [kind,field] of Object.entries(OWNER_KEYS)){
        const id=asRow(evidence)[field];if(typeof id!=='string')continue;const ownerKey=kind+':'+id,fieldKey=ownerKey+':'+evidence.fieldPath;
        const owners=evidenceOwners.get(ownerKey)??[];owners.push(evidence);evidenceOwners.set(ownerKey,owners);
        const fields=evidenceFields.get(fieldKey)??[];fields.push(evidence);evidenceFields.set(fieldKey,fields);
    }
    const aliases=new Set(rows('personAliases').map(a=>a.oldPersonId)),blockedPeople=new Set(rows('deletionRequests').filter(d=>d.targetKind==='PERSON'&&d.state!=='DRAFT').map(d=>d.targetId)),blockedAssets=new Set(rows('deletionRequests').filter(d=>d.targetKind==='ASSET'&&d.state!=='DRAFT').map(d=>d.targetId));
    const activeDictionary=new Set(rows('dictionary').filter(d=>d.status==='ACTIVE').map(d=>d.namespace+':'+d.code)),activeCapabilities=new Set(rows('capabilityDefinitions').filter(d=>d.status==='ACTIVE').map(d=>d.code));
    const collectionItems=new Map<string,TableMap['mediaCollectionItems'][]>();for(const item of rows('mediaCollectionItems')){const group=collectionItems.get(item.collectionId)??[];group.push(item);collectionItems.set(item.collectionId,group);}
    const personMap=new Map(rows('people').map(p=>[p.id,p]));
    const source=(id:string):Source|null=>visibility.source(id)??null;
    const sourceUsable=(id:string)=>visibility.sourceVisible(id) && (!actor.machineScopeId || source(id)?.scopeId===actor.machineScopeId);
    const identityReadable=(p:Person)=>p.workspaceId===actor.workspaceId && p.status!=='ERASED' && visibility.scopeVisible(p.scopeId)
        && (!actor.machineScopeId || p.scopeId===actor.machineScopeId)
        && !aliases.has(p.id)
        && !blockedPeople.has(p.id);
    const ownerEvidence=(kind:string,id:string)=>evidenceOwners.get(kind+':'+id)??[];
    const supported=(e:TableMap['evidence'],value:unknown)=>sourceUsable(e.sourceId)&&source(e.sourceId)?.revision===e.sourceRevision&&digest(value)===e.valueDigest;
    const fieldReadable=(kind:string,row:Record<string,unknown>,key:string)=>{
        const evidence=evidenceFields.get(kind+':'+String(row.id)+':'+key)??[];
        return evidence.length? evidence.some(e=>supported(e,row[key]??null)):sourceUsable(String(row.sourceId));
    };
    const assetReadable=(id:string)=>{
        const a=record('assets',id),r=rows('personMedia').find(r=>r.assetId===id&&r.usageState==='ADOPTED');
        if(!a||a.state!=='READY')return false;
        if(r)return formalRelationReadable(a,r,{workspaceId:actor.workspaceId,clock,person:r.personId?personMap.get(r.personId):null,
            role:r.personRoleId?record('personRoles',r.personRoleId):null,personAliased:!!r.personId&&aliases.has(r.personId),...visibility});
        return mediaUsage(a)==='ADOPTED' && !!a.sourceId && visibility.scopeVisible(a.scopeId) && sourceUsable(a.sourceId)
            && (!a.personId || (!!personMap.get(a.personId) && identityReadable(personMap.get(a.personId)!))) && !blockedAssets.has(id);
    };
    const organizationReadable=(id:string)=>{
        const o=record('organizations',id);
        return !!o && o.status==='ACTIVE' && visibility.scopeVisible(o.scopeId)&&sourceUsable(o.sourceId);
    };
    const fact=(table:FactTable,id:string)=>record(table,id) as unknown as FactRow|undefined;
    const readable=(table:FactTable,row:FactRow,seen=new Set<string>()):boolean=>{
        const key=table+':'+row.id; if(seen.has(key)) return false;
        const next=new Set(seen);next.add(key);
        const p=personMap.get(row.personId);if(!p||!identityReadable(p)) return false;
        if(!sourceUsable(row.sourceId)&&!ownerEvidence(table,row.id).some(e=>supported(e,row[e.fieldPath]??null)))return false;
        for(const [field,parent] of [['personRoleId','personRoles'],['collectionId','mediaCollections']] as const){
            if(row[field]){const r=fact(parent,String(row[field]));if(!r||r.personId!==row.personId||!readable(parent,r,next))return false;}
        }
        for(const key of ['agencyOrganizationId','issuerOrganizationId']) if(row[key]&&!organizationReadable(String(row[key])))return false;
        if(row.agentPersonId){const agent=personMap.get(String(row.agentPersonId));if(!agent||!identityReadable(agent)||(!sourceUsable(agent.sourceId)&&!['displayName','aliases','intro'].every(field=>fieldReadable('person',asRow(agent),field))))return false;}
        return true;
    };
    const project=(table:FactTable,row:FactRow):Record<string,unknown>|null=>{
        if(!readable(table,row))return null;
        const out:Record<string,unknown>={id:row.id,personId:row.personId,sourceId:row.sourceId,revision:row.revision,createdAt:row.createdAt,updatedAt:row.updatedAt};
        const unavailableFields:string[]=[];
        for(const key of Object.keys(TD2_FACTS[table].fields)){
            if(fieldReadable(table,row,key))out[key]=row[key]??(table==='talentProfiles'?PROFILE_DEFAULTS:table==='personRoles'?ROLE_DEFAULTS:{} as Record<string,unknown>)[key as never]??null; else{out[key]=null;unavailableFields.push(key);}
        }
        if(table==='measurementSets')out.reportedAt=row.reportedAt??null;
        for(const key of ['status','state','verifiedAt','verifiedByMembershipId','currentMeasurementSetId'])if(Object.hasOwn(row,key)&&!Object.hasOwn(out,key))out[key]=row[key];
        if(table==='adultEligibilities'&&actor.permissions.includes('sources.review'))out.originalVerification=row.originalVerificationWorkspaceId?{workspaceId:row.originalVerificationWorkspaceId,membershipId:row.originalVerificationMembershipId,verifiedAt:row.verifiedAt}:null;
        if(table==='personCredentials' && actor.permissions.includes('sensitive.read'))out.maskedIdentifier=row.maskedIdentifier;
        if(table==='talentProfiles'&&out.birthDate!=null&&!actor.permissions.includes('sensitive.read')){out.birthDate=null;unavailableFields.push('birthDate');}
        if(table==='talentProfiles'&&out.coverAssetId&&(!actor.permissions.includes('assets.read')||!assetReadable(String(out.coverAssetId))))out.coverAssetId=null;
        out.unavailableFields=unavailableFields;
        out.usable=usable(table,row,out);
        return out;
    };
    const usable=(table:FactTable,row:FactRow,projection?:Record<string,unknown>):boolean=>{
        if(!readable(table,row))return false;
        if(['INACTIVE','ARCHIVED','SUPERSEDED','DRAFT','REVOKED'].includes(String(row.status??row.state??'')))return false;
        if(!periodCurrent(row,clock))return false;
        for(const required of TD2_FACTS[table].required)if(!fieldReadable(table,row,required))return false;
        if(table!=='talentProfiles'&&table!=='personLanguages'){
            const profile=personRows('talentProfiles',row.personId)[0];
            if(!profile||profile.status!=='ACTIVE')return false;
        }
        if(row.personRoleId){const role=fact('personRoles',String(row.personRoleId));if(!role||!usable('personRoles',role))return false;}
        if(row.collectionId){const collection=fact('mediaCollections',String(row.collectionId));if(!collection||!usable('mediaCollections',collection))return false;}
        if(table==='personRoles' && !activeDictionary.has('role:'+String(row.roleCode)))return false;
        if(table==='personLanguages' && !activeDictionary.has('language:'+String(row.languageCode)))return false;
        if(table==='talentLocations' && !activeDictionary.has('city:'+String(row.locationCode)))return false;
        if(table==='personCapabilities' && !activeCapabilities.has(String(row.capabilityCode)))return false;
        if(table==='personCredentials' && (row.status!=='VERIFIED'||(row.expiresOn&&String(row.expiresOn)<clock.now().toISOString().slice(0,10))))return false;
        if((table==='adultEligibilities' && row.state==='VERIFIED_ADULT')||table==='personCredentials'){
            if(!sourceUsable(row.sourceId)||!row.evidenceAssetId||!assetReadable(String(row.evidenceAssetId)))return false;
        }
        if(table==='adultEligibilities'&&projection && projection.unavailableFields instanceof Array && projection.unavailableFields.includes('state'))return false;
        return true;
    };
    const personHeader=(p:Person)=>{
        const originVisible=sourceUsable(p.sourceId);
        return {id:p.id,displayName:fieldReadable('person',asRow(p),'displayName')?p.displayName:'身份资料来源不可用',aliases:fieldReadable('person',asRow(p),'aliases')?p.aliases:[],intro:fieldReadable('person',asRow(p),'intro')?p.intro:'',originSourceId:p.sourceId,originAvailable:originVisible,
            scopeId:p.scopeId,status:p.status,revision:p.revision,createdAt:p.createdAt,updatedAt:p.updatedAt};
    };
    const assetSummary=(id:string)=>{const a=record('assets',id);return a?{id:a.id,mime:a.mime,fileName:a.fileName,width:a.width,height:a.height}:undefined;};
    const get=(id:string)=>{
        const p=personMap.get(id);if(!p||!identityReadable(p))missing();
        const facts:Record<string,Record<string,unknown>[]>= {};
        for(const t of TD2_TABLES)facts[t]=personRows(t,id).map(r=>project(t,r as unknown as FactRow)).filter((r):r is Record<string,unknown>=>!!r);
        if(!sourceUsable(p.sourceId)&&!Object.values(facts).some(r=>r.length)&&!['displayName','aliases','intro'].every(field=>fieldReadable('person',asRow(p),field)))missing();
        const profile=facts.talentProfiles!.find(r=>r.usable)??null;
        const collections=(facts.mediaCollections??[]).map(c=>({...c,items:actor.permissions.includes('assets.read')?(collectionItems.get(String(c.id))??[]).filter(i=>assetReadable(i.assetId)).sort((a,b)=>a.orderIndex-b.orderIndex).map(i=>({id:i.id,assetId:i.assetId,caption:i.caption,featured:i.featured,orderIndex:i.orderIndex,asset:assetSummary(i.assetId)})):[]}));
        const age=facts.adultEligibilities!.find(r=>r.usable);
        const rawProfile=personRows('talentProfiles',id).find(r=>!r.supersededById&&r.status==='ACTIVE');
        const ageInfo=rawProfile&&['birthPrecision','birthDate','birthYear','minAgeYears','maxAgeYears','ageAsOfDate'].every(k=>fieldReadable('talentProfiles',asRow(rawProfile),k))?ageRange(asRow(rawProfile),clock.now().toISOString().slice(0,10)):null;
        return {...personHeader(p),ageRange:ageInfo,schemaVersion:'once-talent-v2.1.0',isTalent:personRows('talentProfiles',id).some(p=>p.status==='ACTIVE'),facts:{...facts,mediaCollections:collections},adultState:age?.state??'UNKNOWN',canEdit:actor.permissions.includes('records.write')||actor.permissions.includes('talent.fact.write')};
    };
    return {rows,record,personRows,source,sourceUsable,identityReadable,fieldReadable,assetReadable,organizationReadable,fact,readable,usable,project,personHeader,get,visibility};
}
