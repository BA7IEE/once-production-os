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
export async function loadTalentGraph(tx:Tx,actor:Actor,clock:Clock){
    const visibility=await loadVisibility(tx,actor,clock);
    const tables=[...TD2_TABLES,'people','organizations','capabilityDefinitions','mediaCollectionItems','assets','evidence','personAliases','deletionRequests','workCredits','works','projectParticipants','projects','dictionary'] as const;
    const data:Partial<Record<Table,unknown[]>>={};
    for(const table of tables){
        const rows=await tx.find(table,{workspaceId:actor.workspaceId});
        invariant(rows.length<=50000,'TD2_DATASET_LIMIT','当前资料规模超出单次查询范围，需要缩小工作空间',503);
        data[table]=rows;
    }
    const rows=<K extends Table>(t:K)=> (data[t]??[]) as TableMap[K][];
    const personMap=new Map(rows('people').map(p=>[p.id,p]));
    const source=(id:string):Source|null=>visibility.source(id)??null;
    const sourceUsable=(id:string)=>visibility.sourceVisible(id) && (!actor.machineScopeId || source(id)?.scopeId===actor.machineScopeId);
    const identityReadable=(p:Person)=>p.workspaceId===actor.workspaceId && p.status!=='ERASED' && visibility.scopeVisible(p.scopeId)
        && (!actor.machineScopeId || p.scopeId===actor.machineScopeId)
        && !rows('personAliases').some(a=>a.oldPersonId===p.id)
        && !rows('deletionRequests').some(d=>d.targetKind==='PERSON'&&d.targetId===p.id&&d.state!=='DRAFT');
    const ownerEvidence=(kind:string,id:string)=>rows('evidence').filter(e=>asRow(e)[OWNER_KEYS[kind]! ]===id);
    const supported=(e:TableMap['evidence'],value:unknown)=>sourceUsable(e.sourceId)&&source(e.sourceId)?.revision===e.sourceRevision&&digest(value)===e.valueDigest;
    const fieldReadable=(kind:string,row:Record<string,unknown>,key:string)=>{
        const evidence=ownerEvidence(kind,String(row.id)).filter(e=>e.fieldPath===key);
        return evidence.length? evidence.some(e=>supported(e,row[key]??null)):sourceUsable(String(row.sourceId));
    };
    const assetReadable=(id:string)=>{
        const a=rows('assets').find(x=>x.id===id);
        return !!a && a.state==='READY' && visibility.scopeVisible(a.scopeId) && sourceUsable(a.sourceId)
            && (!a.personId || (!!personMap.get(a.personId) && identityReadable(personMap.get(a.personId)!)))
            && !rows('deletionRequests').some(d=>d.targetKind==='ASSET'&&d.targetId===id&&d.state!=='DRAFT');
    };
    const organizationReadable=(id:string)=>{
        const o=rows('organizations').find(o=>o.id===id);
        return !!o && o.status==='ACTIVE' && visibility.scopeVisible(o.scopeId)&&sourceUsable(o.sourceId);
    };
    const fact=(table:FactTable,id:string)=>rows(table).find(r=>r.id===id) as unknown as FactRow|undefined;
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
            if(fieldReadable(table,row,key))out[key]=row[key]; else{out[key]=null;unavailableFields.push(key);}
        }
        for(const key of ['status','state','verifiedAt','verifiedByMembershipId','currentMeasurementSetId'])if(Object.hasOwn(row,key)&&!Object.hasOwn(out,key))out[key]=row[key];
        if(table==='adultEligibilities'&&actor.permissions.includes('sources.review'))out.originalVerification=row.originalVerificationWorkspaceId?{workspaceId:row.originalVerificationWorkspaceId,membershipId:row.originalVerificationMembershipId,verifiedAt:row.verifiedAt}:null;
        if(table==='personCredentials' && actor.permissions.includes('sensitive.read'))out.maskedIdentifier=row.maskedIdentifier;
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
            const profile=rows('talentProfiles').find(p=>p.personId===row.personId);
            if(!profile||profile.status!=='ACTIVE')return false;
        }
        if(row.personRoleId){const role=fact('personRoles',String(row.personRoleId));if(!role||!usable('personRoles',role))return false;}
        if(row.collectionId){const collection=fact('mediaCollections',String(row.collectionId));if(!collection||!usable('mediaCollections',collection))return false;}
        if(table==='personRoles' && !rows('dictionary').some(d=>d.namespace==='role'&&d.code===row.roleCode&&d.status==='ACTIVE'))return false;
        if(table==='personLanguages' && !rows('dictionary').some(d=>d.namespace==='language'&&d.code===row.languageCode&&d.status==='ACTIVE'))return false;
        if(table==='talentLocations' && !rows('dictionary').some(d=>d.namespace==='city'&&d.code===row.locationCode&&d.status==='ACTIVE'))return false;
        if(table==='personCapabilities' && !rows('capabilityDefinitions').some(d=>d.code===row.capabilityCode&&d.status==='ACTIVE'))return false;
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
    const get=(id:string)=>{
        const p=personMap.get(id);if(!p||!identityReadable(p))missing();
        const facts:Record<string,Record<string,unknown>[]>= {};
        for(const t of TD2_TABLES)facts[t]=rows(t).filter(r=>r.personId===id).map(r=>project(t,r as unknown as FactRow)).filter((r):r is Record<string,unknown>=>!!r);
        if(!sourceUsable(p.sourceId)&&!Object.values(facts).some(r=>r.length)&&!['displayName','aliases','intro'].every(field=>fieldReadable('person',asRow(p),field)))missing();
        const profile=facts.talentProfiles!.find(r=>r.usable)??null;
        const collections=(facts.mediaCollections??[]).map(c=>({...c,items:actor.permissions.includes('assets.read')?rows('mediaCollectionItems').filter(i=>i.collectionId===c.id&&assetReadable(i.assetId)).sort((a,b)=>a.orderIndex-b.orderIndex).map(i=>({id:i.id,assetId:i.assetId,caption:i.caption,featured:i.featured,orderIndex:i.orderIndex,asset:rows('assets').filter(a=>a.id===i.assetId).map(a=>({id:a.id,mime:a.mime,fileName:a.fileName,width:a.width,height:a.height}))[0]})):[]}));
        const age=facts.adultEligibilities!.find(r=>r.usable);
        return {...personHeader(p),schemaVersion:'once-talent-v2.0.0',isTalent:rows('talentProfiles').some(p=>p.personId===id&&p.status==='ACTIVE'),facts:{...facts,mediaCollections:collections},adultState:age?.state??'UNKNOWN',canEdit:actor.permissions.includes('records.write')||actor.permissions.includes('talent.fact.write')};
    };
    return {rows,source,sourceUsable,identityReadable,fieldReadable,assetReadable,organizationReadable,fact,readable,usable,project,personHeader,get,visibility};
}
