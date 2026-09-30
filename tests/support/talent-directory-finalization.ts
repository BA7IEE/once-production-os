import assert from 'node:assert/strict';
import type {Store} from '../../packages/core/src/store.ts';
import type {Application} from '../../packages/core/src/api.ts';
import {DIRECTORY_AGE_PRESETS} from '../../packages/core/src/talent-directory-contract.ts';
import {searchTalentV2} from '../../packages/core/src/talent-v2-search.ts';
import {sourceInput,type Client,type FakeClock} from './fixtures.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
/** Identical business commands and assertions in memory and PostgreSQL. */
export async function verifyDirectoryFinalization(f:{owner:Client;store:Store;app:Application;clock:FakeClock}){
 const sourceId=ok(await f.owner.cmd('POST','/sources',sourceInput())).resourceId;
 const catalog=ok(await f.owner.raw('GET','/catalog'),200).items;
 for(const [namespace,code]of [['city','guangzhou'],['industry','final-fashion'],['industry','final-furniture'],['workType','final-photo'],['workType','final-video']])if(!catalog.some((c:any)=>c.namespace===namespace&&c.code===code))ok(await f.owner.cmd('POST','/catalog/items',{namespace,code,labelZh:'合成 '+code,labelEn:code}));
 const people=[];for(const [name,city,experience,gender,birth]of [['深圳素人','shenzhen','AMATEUR','FEMALE',2000],['广州专业','guangzhou','PROFESSIONAL','FEMALE',2000],['未知男性','shenzhen','PROFESSIONAL','MALE',null]] as const){
 const id=ok(await f.owner.cmd('POST','/directory/talents',{schemaVersion:'once-talent-experience-v1',displayName:'Finalization '+name,kind:'TALENT',roleCodes:['model','actor'],sourceId,sourceRevision:1})).resourceId;
 const current=async()=>(await f.store.transaction(tx=>tx.get('people',id)))!;
 ok(await f.owner.cmd('PATCH','/directory/talents/'+id,{schemaVersion:'once-talent-experience-v1',expectedRevision:(await current()).revision,sourceId,sourceRevision:1,profile:{genderCode:gender,birthPrecision:birth?'YEAR_ONLY':'UNKNOWN',birthYear:birth,nationalityCodes:['CN','US']},model:{castingMarketCode:'INTERNATIONAL',experienceCode:experience,styleCodes:['natural','fashion'],serviceCodes:['print','runway']},locationCode:city}),200);
 const roles=await f.store.transaction(tx=>tx.find('personRoles',{personId:id}));people.push({id,roles,current});
 for(const languageCode of ['en','zh'])ok(await f.owner.cmd('POST',`/td2/people/${id}/languages`,{schemaVersion:'once-talent-v2.1.0',expectedPersonRevision:(await current()).revision,sourceId,sourceRevision:1,values:{languageCode,speakingLevelCode:'WORKING'}}));
 }
 const query={q:'Finalization ',role:['model','actor'],location:['shenzhen','guangzhou'],gender:['FEMALE'],market:['INTERNATIONAL'],experience:['AMATEUR','PROFESSIONAL']};
 const search=async(q:Record<string,unknown>)=>ok(await f.owner.raw('POST','/directory/talents/search',{q:'Finalization ',...q}),200);
 const a=await search(query);assert.equal(a.total,2);assert.deepEqual(new Set(a.items.map((p:any)=>p.id)),new Set(people.slice(0,2).map(p=>p.id)));assert.equal((await search({...query,gender:['MALE']})).total,1);assert.equal((await search({...query,location:['guangzhou'],experience:['AMATEUR']})).total,0);
 for(const invalid of [{role:['model','model']},{location:[]},{style:Array(21).fill('natural')},{nationality:['ZZ']},{role:['unknown-role']},{surprise:true}])assert.equal((await f.owner.raw('POST','/directory/talents/search',invalid)).status,400);
 assert.equal((await search({role:'model',location:'shenzhen',gender:'FEMALE'})).total,(await search({role:['model'],location:['shenzhen'],gender:['FEMALE']})).total);
 const facets=await search({...query,location:['shenzhen'],experience:['AMATEUR'],style:['natural','fashion'],service:['print','runway'],language:['en','zh'],nationality:['CN','US']});assert.equal(facets.total,1);for(const [dimension,values]of Object.entries({styles:['natural','fashion'],services:['print','runway'],languages:['en','zh'],nationalities:['CN','US']}))for(const value of values)assert.equal(facets.facets[dimension][value],1,'unique person '+dimension);
 const cityFacet=await search({...query,location:['shenzhen']});assert.equal(cityFacet.total,1);assert.equal(cityFacet.facets.locations.shenzhen,1);assert.equal(cityFacet.facets.locations.guangzhou,1,'self dimension removed');
 const person=people[0]!,model=person.roles.find(r=>r.roleCode==='model')!,actor=person.roles.find(r=>r.roleCode==='actor')!;
 const work=async(industryCode:string,workTypeCode:string,roleCode:string)=>{const id=ok(await f.owner.cmd('POST','/works',{sourceId,title:'合成 Finalization 作品',industryCode,workTypeCodes:[workTypeCode]})).resourceId;ok(await f.owner.cmd('POST',`/works/${id}/credits`,{expectedRevision:1,personId:person.id,roleCode,note:''}),200);return id;};
 await work('final-furniture','final-photo','model');await work('final-fashion','final-video','model');const actorWork=await work('final-furniture','final-video','actor');
 const workQuery={role:['model'],industryCode:['final-furniture'],workTypeCode:['final-video']};assert.equal((await search(workQuery)).total,0,'no cross-work or cross-role borrowing');assert.equal((await search({...workQuery,role:['model','actor']})).total,1);assert.equal((await search({...workQuery,role:['model','actor'],market:['INTERNATIONAL']})).total,0,'model classification cannot lend to actor work');
 await work('final-furniture','final-video','model');await work('final-furniture','final-video','model');const works=await search(workQuery);assert.equal(works.total,1);assert.equal(works.facets.industries['final-furniture'],1);assert.equal(works.facets.workTypes['final-video'],1);assert.deepEqual(works.items[0].matchingRoleIds,[model.id]);
 for(const preset of DIRECTORY_AGE_PRESETS.items){const fast=await search({ageMin:preset.min,ageMax:preset.max});const manual=await search({ageMin:Number(preset.min),ageMax:Number(preset.max)});assert.deepEqual(fast.items,manual.items);assert.ok(!fast.items.some((p:any)=>p.id===people[2]!.id));}
 assert.equal((await search({ageMin:25,ageMax:25})).total,0);assert.equal((await search({ageMin:25,ageMax:26})).total,2);
 const me=ok(await f.owner.raw('GET','/me'),200),binding=me.directoryStateScope;assert.match(binding,/^[a-f0-9]{64}$/);
 const session=(await f.store.transaction(tx=>tx.find('sessions',{membershipId:me.membershipId})))[0]!;const user=(await f.store.transaction(tx=>tx.find('users',{loginName:'owner'})))[0]!,membership=(await f.store.transaction(tx=>tx.get('memberships',me.membershipId)))!;
 const queryActor={workspaceId:user.workspaceId,membershipId:membership.id,userId:user.id,role:membership.role,permissions:me.permissions,displayName:me.displayName,userEpoch:user.sessionEpoch,sessionId:session.id};
 for(const q of [query,workQuery,{role:['actor'],industryCode:['final-furniture'],workTypeCode:['final-video']},{location:['guangzhou'],nationality:['US']},{ageMin:25,ageMax:26}]){const real=await search(q);const reference=await f.store.transaction(tx=>searchTalentV2(tx,queryActor as any,f.clock,Object.fromEntries(Object.entries({q:'Finalization ',...q}).map(([k,v])=>[k,Array.isArray(v)?v:String(v)])),{all:true,facets:true}));const stable=(items:any[])=>items.map(p=>({...p,matchedBy:[...p.matchedBy].sort((a,b)=>a.field.localeCompare(b.field))}));assert.deepEqual(stable(real.items),stable(reference.items));assert.deepEqual(real.facets,reference.facets);}
 const list=ok(await f.owner.cmd('POST','/shortlists',{title:'合成 Finalization 双职业',scopeId:(await person.current()).scopeId})).resourceId;
 assert.equal((await f.owner.cmd('POST',`/shortlists/${list}/items`,{expectedRevision:1,personId:person.id,personRoleId:model.id,personRoleRevision:model.revision,workId:actorWork,workAssetIds:[],note:''})).status,422);
 ok(await f.owner.cmd('POST',`/shortlists/${list}/items`,{expectedRevision:1,personId:person.id,personRoleId:actor.id,personRoleRevision:actor.revision,workId:actorWork,workAssetIds:[],note:''}),200);
 const items=await f.store.transaction(tx=>tx.find('shortlistItems',{shortlistId:list}));assert.equal(items[0]!.personRoleId,actor.id);
 return {people:people.map(p=>p.id),checks:['multi-value OR / cross-dimension AND','strict bounded arrays and unknown codes','eleven self-excluded unique-person facets','same-work same-role matching','versioned conservative age presets','memory and SQL parity','explicit shortlist role and wrong-role work rejection']};
}
