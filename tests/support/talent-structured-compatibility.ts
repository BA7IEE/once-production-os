import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Client,sourceInput} from './fixtures.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
import {TALENT_SCHEMA_VERSION as schemaVersion} from '../../packages/core/src/talent-v2-model.ts';
export async function verifyStructuredCompatibility(owner:Client){
 const suffix=randomUUID().slice(0,8),name='合成结构检索'+suffix,sourceId=ok(await owner.cmd('POST','/sources',sourceInput())).resourceId as string;
 const personId=ok(await owner.cmd('POST','/people',{sourceId,displayName:name,roles:['model','translator']})).resourceId as string;
 // A pre-upgrade flat role verification must not become current professional verification.
 ok(await owner.cmd('POST','/field-evidence',{personId,expectedRevision:1,fieldPath:'roles',sourceId,sourceRevision:1}),200);
 ok(await owner.cmd('POST',`/td2/people/${personId}/enroll`,{schemaVersion,expectedRevision:2,sourceRevision:1}),200);
 const query=async(extra='')=>ok(await owner.raw('GET','/talent-search?q='+encodeURIComponent(name)+(extra?'&'+extra:'')),200);
 assert.equal((await query('verifiedWithinDays=30')).total,0);
 const rev=async()=>ok(await owner.raw('GET',`/td2/people/${personId}`),200).revision;
 const lang=ok(await owner.cmd('POST',`/td2/people/${personId}/languages`,{schemaVersion,expectedPersonRevision:await rev(),sourceId,sourceRevision:1,values:{languageCode:'en',speakingLevelCode:'WORKING'}})).resourceId as string;
 assert.equal((await query('verifiedWithinDays=30')).total,0);ok(await owner.cmd('POST','/td2/evidence',{schemaVersion,ownerKind:'personLanguages',ownerId:lang,fieldPath:'speakingLevelCode',expectedRevision:1,sourceId,sourceRevision:1}),200);assert.equal((await query('verifiedWithinDays=30')).total,1);
 const a='a_'+suffix,b='b_'+suffix,photo='photo_'+suffix,video='video_'+suffix;for(const [namespace,code]of [['industry',a],['industry',b],['workType',photo],['workType',video]])ok(await owner.cmd('POST','/catalog/items',{namespace,code,labelZh:'合成 '+code,labelEn:code}));
 const work=async(industryCode:string,workTypeCode:string,roleCode:string)=>{const id=ok(await owner.cmd('POST','/works',{sourceId,title:name+'作品',industryCode,workTypeCodes:[workTypeCode]})).resourceId as string;ok(await owner.cmd('POST',`/works/${id}/credits`,{expectedRevision:1,personId,roleCode,note:'合成职业署名'}),200);};
 await work(a,photo,'model');await work(b,video,'model');await work(a,video,'translator');assert.equal((await query(`role=model&industryCode=${a}&workTypeCode=${video}`)).total,0);
 await work(a,video,'model');assert.equal((await query(`role=model&industryCode=${a}&workTypeCode=${video}`)).total,1);
 const project=ok(await owner.cmd('POST','/projects',{sourceId,title:name+'项目'})).resourceId as string;
 ok(await owner.cmd('POST',`/projects/${project}/participants`,{expectedRevision:1,personId,roleCode:'translator',state:'ACTUAL',note:'合成翻译实际参与'}),200);assert.equal((await query('role=model&actualProject=true')).total,0);
 ok(await owner.cmd('POST',`/projects/${project}/participants`,{expectedRevision:2,personId,roleCode:'model',state:'ACTUAL',note:'合成模特实际参与'}),200);assert.equal((await query('role=model&actualProject=true')).items[0].actualProjectCount,1);
 const second=ok(await owner.cmd('POST','/td2/people',{schemaVersion,originSourceId:sourceId,sourceRevision:1,displayName:name+'二',createTalent:true})).resourceId as string;
 ok(await owner.cmd('POST',`/td2/people/${second}/roles`,{schemaVersion,expectedPersonRevision:1,sourceId,sourceRevision:1,values:{roleCode:'model'}}));const page=await query('role=model&pageSize=1&page=2');assert.equal(page.total,2);assert.equal(page.items.length,1);assert.equal(page.facets.roles.find((r:any)=>r.code==='model').count,2);assert.equal(page.facets.roles.find((r:any)=>r.code==='translator').count,1);
 const independent=ok(await owner.cmd('POST','/sources',sourceInput())).resourceId as string;
 // Changing the previously reviewed value without a new review invalidates the old digest.
 ok(await owner.cmd('PATCH',`/td2/languages/${lang}`,{schemaVersion,expectedRevision:1,expectedPersonRevision:await rev(),sourceId,sourceRevision:1,values:{speakingLevelCode:'PROFESSIONAL'}}),200);assert.equal((await query('verifiedWithinDays=30')).total,0);
 ok(await owner.cmd('POST','/td2/evidence',{schemaVersion,ownerKind:'personLanguages',ownerId:lang,fieldPath:'speakingLevelCode',expectedRevision:2,sourceId:independent,sourceRevision:1}),200);assert.equal((await query('verifiedWithinDays=30')).total,1);
 ok(await owner.cmd('POST',`/sources/${independent}/suspend`,{expectedRevision:1,reason:'合成当前核验依据停止使用'}),200);assert.equal((await query('verifiedWithinDays=30')).total,0);
 return {personId,sourceId};
}
